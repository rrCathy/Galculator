import {
  computeOrbits,
  computeQuotientGroup,
  computeStabilizers,
  detectIsomorphicGroup,
  factorizeOrder,
  getAllSmallGroups,
  getSmallGroupBySymbol,
  type Group,
  type GroupElement,
  type Subgroup,
} from '@groupviz/core'
import { asciiSymbol, prettySymbol, superscript } from './pretty'
import { groupFingerprint } from './identity'
// 小群表（U55）：识别结果给的 `SmallGroup(阶, 编号)` 坐标必须与 op `smallGroup(n, i)`
// **同一个口径**（GAP 的 1 起编号），否则印出来的坐标抄进去会拿到另一个群。
import { gapNumberOf } from './smallGroups'
// 作用的核（U52）：判据只有一份 —— 与「自定义作用」的披露共用同一个函数
import { actionKernel } from './customAction'
import { isKnownGroup, knownGroupInfo } from './known'
import type { GalAction, GalMap } from './value'
import type { GalObject } from './types'

/**
 * 结论层（U4）—— **"计算器"该说的话**。
 *
 * 这一层回答的不是"这个对象长什么样"（那是信息面板的分区干的），而是
 * **"所以呢？"**：
 *
 *   - 这个群**同构于**什么？（`S₄/V₄ ≅ S₃`——用户自己看不出来，工具能看出来）
 *   - 第一同构定理在这里**具体是什么**？（`S₄/ker f ≅ S₃`，两边阶都算出来对上）
 *
 * 用户的原话："我在信息面板翻来覆去没看到什么『同构于……』字样，
 * 那用户看什么呢，看记号吗"——这条就是为那句话做的。
 */

/* ── 同构识别 ─────────────────────────────────────────── */

/** 识别是枚举类的重活；同一个群（同符号同阶）只算一次 */
const isoCache = new Map<string, string | null>()

/**
 * 同构类的**别名**：core 用 `D_{3}` 表示三阶对称群，而教学语境里 `S_{3}` 更常见。
 * 两者是同一个群（D₃ ≅ S₃），识别结果按这个表归一。
 */
const ISO_ALIAS: Record<string, string> = {
  'D_{3}': 'S_{3}',
}

function normalizeSymbol(s: string): string {
  return s.replace(/\s+/g, '')
}

/**
 * **记号归一**：把同一个群的两种写法认成一个。
 *
 * 实测：`createGroupFromSymbol('C_2 x C_2')` 的符号是 `C_{2}^{2}`（幂写法），
 * 而 `detectIsomorphicGroup` 回的是 `C_{2}\times C_{2}`（乘法写法）——
 * 不归一的话会对一个群说"它同构于自己"。
 */
function canonSymbol(s: string): string {
  const t = normalizeSymbol(s)
  const m = /^(.+?)\^\{?(\d+)\}?$/.exec(t)
  if (m) return Array.from({ length: Number(m[2]) }, () => m[1]).join('\\times')
  return t
}

/**
 * 结构记号的**惯用名**——用户嘴里说的是这个。
 *
 * `K = ker(f)` 的符号本来就是 `C_{2}\times C_{2}`，但人想问的是"这是不是 V₄"。
 *
 * 2026-10-01（U44）：用户说信息面板里第一想看的就是「**这个群和哪个常见群同构？**」，
 * 于是把常用的几个补齐 —— 这一条现在会给「识别」当答案的第二行。
 */
const ISO_COMMON_NAME: Record<string, string> = {
  'C_{2}\\times C_{2}': '也写作 V_4（Klein 四元群）',
  'C_{2}\\times C_{2}\\times C_{2}': '初等交换 2-群（每个元素的阶都不超过 2）',
  'S_{3}': '最小的非交换群（也是 D_3）',
  'S_{4}': '4 元对称群',
  'A_{4}': '4 元交错群（最小的非交换可解群）',
  'A_{5}': '最小的非交换单群（60 阶）',
  'D_{4}': '正方形的对称群（8 阶二面体群）',
  'Q_{8}': '四元数群（8 阶；每个子群都正规）',
}

/** 小群库里的条目（`SmallGroup(阶, 编号)`）——识别结果的"坐标"。 */
const smallCache = new Map<string, { order: number; index: number } | null>()

/**
 * 识别结果 → 小群表的**坐标**（`SmallGroup(阶, 编号)`）。
 *
 * ⚠️ 编号必须过 `gapNumberOf`（U55）：引擎注册表的下标只在 16 阶以上等于 GAP 编号，
 * 1–15 阶是它自己的手写顺序（8 阶的 `index 2` 是 `C_2³`，而 GAP 的 `(8,3)` 是 `D_8`）。
 * 从前这里直接用 `entry.index`，于是对一个 `C_2³` 会印出 `SmallGroup(8, 2)` —— 用户
 * 拿这个坐标去查文献、或者（U55 之后）敲进输入球，**拿到的是另一个群**。
 *
 * 现在印出来的坐标就是 `smallGroup(n, i)` 收的坐标，两边同一个口径。
 */
function smallGroupEntry(order: number, iso: string): { order: number; index: number } | null {
  const key = `${order}#${iso}`
  const hit = smallCache.get(key)
  if (hit !== undefined) return hit
  let found: { order: number; index: number } | null = null
  const direct = getSmallGroupBySymbol(iso)
  if (direct) found = { order: direct.order, index: direct.index }
  else {
    // 库里未必用同一个记号（实测 `C_{2}\times C_{2}` 直接查是 null）→ 按阶 + 归一符号找
    const want = canonSymbol(iso)
    for (const e of getAllSmallGroups()) {
      if (e.order !== order) continue
      if (canonSymbol(e.group.symbol) === want) {
        found = { order: e.order, index: e.index }
        break
      }
    }
  }
  // 注册表下标 → GAP 编号（认不出就整个不出坐标，**不猜**）
  let result: { order: number; index: number } | null = null
  if (found) {
    const gap = gapNumberOf(found.order, found.index)
    if (gap !== null) result = { order: found.order, index: gap }
  }
  smallCache.set(key, result)
  return result
}

/**
 * 群的同构类标准符号（识别不出来返回 `null`）。
 *
 * 走 core 的 `detectIsomorphicGroup`：它按不变量匹配小群库，
 * 认出 `S_4/V_4 → D_{3}`（即 S₃）、`Q_8/Z → C_{2}^{2}` 这类，
 * 但对**超出识别范围**的群（阶太大 / 库外结构）会返回 null——不猜。
 */
export function identifyGroup(group: Group): string | null {
  // 「已知群」没有元素表（U48）：识别要按不变量匹配小群库，空元素表上没意义 —— 直接说不认识
  if (isKnownGroup(group)) return null
  // 缓存 key 用**群身份指纹**（含元素 id），不是 `symbol#order`——后者会串
  // （同符号同阶的两个群可能是不同结构，见 `identity.groupFingerprint` 的说明）
  const key = groupFingerprint(group)
  const hit = isoCache.get(key)
  if (hit !== undefined) return hit
  let out: string | null = null
  try {
    const r = detectIsomorphicGroup(group) as unknown
    out = typeof r === 'string' && r.length > 0 ? (ISO_ALIAS[r] ?? r) : null
  } catch {
    out = null
  }
  isoCache.set(key, out)
  return out
}

/** 识别符号的纯文本形态（Unicode 近似，用于混排文本）。 */
export function isoText(iso: string): string {
  return prettySymbol(iso)
}

/**
 * 两个群**是否同构** —— 三态，判据与信息面板那句「同构于 …」**同源**。
 *
 * 为什么是三态而不是布尔：本地同构识别按不变量匹配小群库（`identifyGroup`），
 * 超出识别范围（阶太大 / 库外结构）时它返回 `null`。那时**不猜**——
 * `'unknown'` 交给调用方（`同构` 操作会照实说"未判定"，`pairOps` 才敢把它列进候选）。
 *
 * 快速否定那一关不用识别：**阶不同必不同构**（Lagrange 的直接推论）。
 */
export function isomorphismOf(a: Group, b: Group): 'yes' | 'no' | 'unknown' {
  if (a === b) return 'yes'
  if (a.order !== b.order) return 'no'
  const ia = identifyGroup(a)
  const ib = identifyGroup(b)
  // 任一侧识别不出 → 不下结论（不许拿"看起来一样"当同构）
  if (!ia || !ib) return 'unknown'
  return canonSymbol(ia) === canonSymbol(ib) ? 'yes' : 'no'
}

/* ── 结论 ─────────────────────────────────────────────── */

export interface Insight {
  /** 短标签：「同构」「第一同构定理」「阶」… */
  label: string
  /** TeX 主体（面板里用 KaTeX 渲染） */
  tex: string
  /** 纯文本主体（无障碍 / 降级用） */
  text: string
  /** 补充说明（纯文本，一行） */
  detail?: string
  /** `key` = 主要结论（醒目）；`note` = 附注（弱化） */
  tone: 'key' | 'note'
}

/**
 * 群对象的结论：**识别（这是哪个常见群）** + 阶的分解。
 *
 * ## 识别这一条永远排第一，而且是 `key`（2026-10-01，U44）
 *
 * 用户点名信息面板第一想看的就是「**这个群和哪个常见群同构？**」。
 * 从前它是**摘要区的一行小字**，而且对**手写的群**（`G = S₄`）干脆被抑制掉
 * —— 正好把用户最想要的那句答案吞了。现在它常驻头条。
 *
 * ## 说不说，分三种情形（都不说废话）
 *
 *   - **构造出来的**（有 `opId`）→ 一律说。它的符号本身就是结构记号
 *     （`ker f` 的符号是 `C_{2}`、`closure(G,r)` 的是 `C_{4}`），不说不回答"K 是什么"。
 *   - **手写但库里有惯用名**（`C_2 x C_2` → V₄）→ 说，把惯用名当答案。
 *   - **手写且再没别的可说**（`G = C_6`）→ 闭嘴（`C₆ = C₆` 是废话）。
 *
 * ## 坐标 `SmallGroup(阶, 编号)` 用 GAP 编号（U55 校正）
 *
 * 2026-10-01 发现引擎注册表的下标**不是** GAP 编号（它 0 起、1–15 阶顺序自定），
 * 于是当年只能选择"不给坐标"来躲开误导。U55 把编号校正到 GAP 口径
 * （`gal/smallGroups.ts#gapNumberOf`，手算表 + 可执行核对），**并且把
 * `smallGroup(n, i)` 做成了真的能敲的 op** —— 印出来的坐标就是能抄进输入球的坐标。
 *
 * 手写的群（`G = S₄`）依旧只给**惯用名**：它自己就有记号，再补一个库内坐标是噪音。
 * 给坐标的是**没有名字的那些** —— **构造物**（`ker f`）与**真同构**（`F ≅ C₂`）。
 */
export function groupInsights(group: Group, node?: GalObject): Insight[] {
  const out: Insight[] = []

  /**
   * ⓪ **「已知群」的结论**（U48）—— 顶到头条。
   *
   * 这类群来自结论表（`|Aut(S₆)| = 1440` 是背下来的），没有元素表 ——
   * 所以识别与阶分解都无从谈起，**能说的就是这条结论本身与它凭什么**。
   */
  const known = knownGroupInfo(group)
  if (known) {
    out.push({
      label: '已知结论',
      tone: 'key',
      tex: known.tex,
      text: known.plain,
      detail: known.build
        ? `结论指出它同构于 ${prettySymbol(known.build)}；这里给的就是那个群，可以直接接着算`
        : '本地没有这个群的元素表：知道它是什么、阶是多少，但不算出来（元素级运算用不了）',
    })
    return out
  }

  // ① 识别 / 同构 —— **头条**
  const iso = identifyGroup(group)
  if (iso) {
    const same = canonSymbol(iso) === canonSymbol(group.symbol)
    const entry = smallGroupEntry(group.order, iso)
    const common = ISO_COMMON_NAME[iso] ?? null
    if (!same || !!node?.opId || !!common) {
      const coord = entry ? `SmallGroup(${entry.order}, ${entry.index})` : null
      /*
       * 附注给什么，看"符号是谁给的"：
       *   - **手写的群**（`G = S₄`）：符号就是用户自己敲的答案，只补**惯用名**
       *     （`→ 4 元对称群`）。它已经有记号了，再补库内坐标是噪音。
       *   - **构造物**（`ker f` / `closure(…)`）：符号是**副产品**，用户本来就不知道
       *     "这是哪个群"，所以补**坐标** `SmallGroup(阶, 编号)` —— U55 之后这个坐标
       *     是**能抄进输入球**的（`smallGroup(24, 12)` 就是它）。
       *   - **真同构**（`!same`，如 `F ≅ C₂`）：同前，坐标是"它落在库里哪儿"。
       */
      const parts = same
        ? node?.opId
          ? [coord, common]
          : [common]
        : [coord, common]
      const detail =
        parts.filter((x): x is string => !!x).join('，') ||
        '结构与它完全一样，只是产生方式不同'
      out.push({
        label: same ? '识别' : '同构',
        tone: 'key',
        tex: same ? group.symbol : `${group.symbol} \\;\\cong\\; ${iso}`,
        text: same
          ? prettySymbol(group.symbol)
          : `${prettySymbol(group.symbol)} \\cong ${prettySymbol(iso)}`,
        detail,
      })
    }
  }

  // ② 阶的分解：计算器该顺手给出的数论信息
  if (group.order > 1) {
    const fs = factorizeOrder(group.order)
    /** 素数阶 —— 只有**一个**素因子且**指数为 1**（`2^4` 不是素数阶）。 */
    const isPrimeOrder = fs.length === 1 && fs[0].exponent === 1
    const tex = fs
      .map((f) => (f.exponent === 1 ? `${f.prime}` : `${f.prime}^{${f.exponent}}`))
      .join(' \\cdot ')
    const text = fs
      .map((f) => (f.exponent === 1 ? `${f.prime}` : `${f.prime}${superscript(f.exponent)}`))
      .join('\\cdot ')
    out.push({
      label: '阶',
      tone: 'note',
      tex: `\\lvert G\\rvert = ${group.order} = ${tex}`,
      text: `|G| = ${group.order} = ${text}`,
      /*
       * ⚠️ **判据不是 `fs.length`**（U55 走查抓到的真账）：
       * `factorizeOrder` 回的是**互异素因子**的表（`{prime, exponent}[]`），
       * 于是 16 = 2^4 只有一条 ⇒ 从前那句退成「素数阶 -> 循环群」——
       * 而 `(C_4 x C_2):C_2`（16 阶）**既不素也不循环**。素数阶要**真判素数**。
       */
      detail: isPrimeOrder
        ? '素数阶 -> 循环群'
        : fs.length === 1
          ? '素数幂阶 -> 幂零（Sylow 分析的入口）'
          : '素因子分解（Sylow 分析的入口）',
    })
  }

  return out
}

/** 映射对象的结论：**第一同构定理**。 */
export function mapInsights(map: GalMap): Insight[] {
  const out: Insight[] = []
  const G = map.domain
  const H = map.codomain
  const k = map.kernel?.length
  const im = map.image?.length
  if (k === undefined || im === undefined) return out

  // ① 第一同构定理本身（带数字核对）
  out.push({
    label: '第一同构定理',
    tone: 'key',
    tex: `${G.symbol}/\\ker f \\;\\cong\\; \\operatorname{im} f`,
    text: `${prettySymbol(G.symbol)}/ker f \\cong im f`,
    detail:
      `|G| / |ker| = ${G.order} / ${k} = ${G.order / k}` +
      `，|im| = ${im} ---- 两边 ${G.order / k === im ? '相等 v' : '不等 x'}`,
  })

  // ② 具体到这个映射：商群同构于什么
  //    满射时最漂亮：G/ker f ≅ H（靶群），这正是用户自己看不出、工具该说出来的那句
  const Q = quotientByKernel(G, map.kernel ?? [])
  const qIso = Q ? identifyGroup(Q) : null
  if (map.isSurjective) {
    out.push({
      label: '具体结论',
      tone: 'key',
      tex: `${G.symbol}/\\ker f \\;\\cong\\; ${H.symbol}`,
      text: `${prettySymbol(G.symbol)}/ker f \\cong ${prettySymbol(H.symbol)}`,
      detail: `满射 -> 商群与靶群同构${qIso ? `（识别为 ${asciiSymbol(qIso)}）` : ''}`,
    })
  } else if (qIso) {
    out.push({
      label: '具体结论',
      tone: 'key',
      tex: `${G.symbol}/\\ker f \\;\\cong\\; ${qIso}`,
      text: `${prettySymbol(G.symbol)}/ker f \\cong ${prettySymbol(qIso)}`,
      detail: '商群被识别出来了（非满射，靶群更大）',
    })
  } else if (im > 0 && map.image) {
    out.push({
      label: '具体结论',
      tone: 'note',
      tex: `\\operatorname{im} f \\le ${H.symbol},\\quad \\lvert \\operatorname{im} f \\rvert = ${im}`,
      text: `im f \\subseteq ${prettySymbol(H.symbol)}，|im f| = ${im}`,
      detail: '像落在靶群里；商群的同构类未识别出（超出本地识别范围）',
    })
  }

  return out
}

/* ── 作用的结论 ───────────────────────────────────────── */

/** 作用在第一个点上的稳定子（G 的元素表）。 */
function stabilizerOf(A: GalAction, point = 0): GroupElement[] {
  const stabs = computeStabilizers(A.group, A.perms, A.n)
  const ids = new Set(stabs.get(point) ?? [])
  return A.group.elements.filter((e) => ids.has(e.id))
}

/**
 * 作用对象的结论。
 *
 * 这一层对 Sylow 定理是**整条 MVP 的落点**：`G ↷ Syl_p(G)` 之后要说的三句话
 * 全在这里 —— `n_p ≡ 1 (mod p)`、`n_p | m`、`n_p = [G : N_G(H)]`，
 * 以及「唯一 ⟺ 正规」。这些都是用户看着记号看不出来、但工具一算就知道的。
 */
export function actionInsights(A: GalAction): Insight[] {
  const out: Insight[] = []
  const G = A.group

  // ── ① 轨道分解 ──
  const { orbits } = computeOrbits(A.perms, A.n)
  const sizes = orbits.map((o) => o.elements.length).sort((a, b) => b - a)
  const transitive = sizes.length === 1 && sizes[0] === A.n
  if (A.n > 0) {
    const isConj = A.kind === 'conjugation'
    out.push({
      label: isConj ? '共轭类（类方程）' : '轨道分解',
      tone: transitive ? 'key' : 'note',
      tex: `\\lvert \\Omega \\rvert = ${A.n} = ${sizes.join(' + ')}`,
      text: `|\\Omega| = ${A.n} = ${sizes.join(' + ')}`,
      detail: transitive
        ? '只有一个轨道 \\to 作用**传递**'
        : `${sizes.length} 个轨道${isConj ? '（这正是类方程）' : ''}`,
    })
  }

  // ── ② 同态的核：这个作用**忠实**吗 ──
  //
  // U52 补的一条。理由：忠实性不是"可选的花边"，它是第一同构定理的入口 ——
  // 「作用忠实 ⟺ 核平凡 ⟺ G 同构于置换群的一个子群」。四个内置作用各有姓名：
  //   · 共轭作用的核 = **Z(G)**（中心）
  //   · 左正则作用的核 = {e} —— 这就是 **Cayley 定理**（G 嵌入 S_G）
  //   · 陪集作用的核 = H 在 G 里的核（所有共轭的交）
  // 从前信息面板里看不到这件事，用户只能自己去猜"这个作用丢了多少信息"。
  {
    const kernelIds = actionKernel(A)
    const faithful = kernelIds.length === 1
    const named =
      A.kind === 'conjugation'
        ? '共轭作用的核就是中心 Z(G)'
        : A.kind === 'leftTranslation'
          ? '这就是 Cayley 定理：G 嵌入自身的置换群 S_G'
          : A.kind === 'coset'
            ? '陪集作用的核是 H 的全部共轭之交'
            : null
    out.push({
      label: '同态的核',
      tone: faithful ? 'note' : 'key',
      tex: `\\lvert \\ker \\varphi \\rvert = ${kernelIds.length}`,
      text: `|ker| = ${kernelIds.length}`,
      detail: faithful
        ? `作用忠实，核只有单位元${named ? `（${named}）` : ''}`
        : `不忠实：核有 ${kernelIds.length} 个元素，只有 G 商掉它才嵌入置换群${
            named ? `（${named}）` : ''
          }`,
    })
  }

  // ── ③ Sylow III：共轭作用在 Syl_p(G) 上 ──
  if (A.kind === 'conjugationOnSubgroups' && A.omega) {
    const pK = A.omega.members[0]?.subgroupElements?.length ?? 0
    const fs = pK > 0 ? factorizeOrder(pK) : []
    // Sylow p-子群的阶恰是 p^k（一个素因子的幂）
    if (fs.length !== 1) return out
    const p = fs[0].prime
    const k = fs[0].exponent
    const np = A.n
    const m = G.order / pK

    out.push({
      label: 'Sylow III',
      tone: 'key',
      tex: `n_{${p}} = ${np} \\equiv 1 \\pmod{${p}}, \\qquad n_{${p}} \\mid ${m}`,
      text: `n_${p} = ${np} \\equiv 1 (mod ${p})，且 n_${p} | ${m}`,
      detail:
        `核对：${np} mod ${p} = ${np % p}${np % p === 1 ? ' v' : ' x'}` +
        `，${m} / ${np} = ${m / np}${m % np === 0 ? ' v' : ' x'}`,
    })

    // 轨道-稳定子：n_p 就是唯一那个轨道的大小，Stab 即 N_G(H)
    const stab = stabilizerOf(A)
    if (stab.length > 0) {
      const ok = np * stab.length === G.order
      out.push({
        label: '轨道-稳定子',
        tone: 'key',
        tex: `n_{${p}} = [G : N_G(H)] = ${G.order} / ${stab.length} = ${G.order / stab.length}`,
        text: `n_${p} = [G : N_G(H)] = |G| / |N_G(H)| = ${G.order} / ${stab.length} = ${G.order / stab.length}`,
        detail: `|Orb| * |Stab| = ${np} * ${stab.length} = ${np * stab.length} = |G| ${ok ? 'v' : 'x'}`,
      })
    }

    out.push(
      np === 1
        ? {
            label: '正规 iff 唯一',
            tone: 'key',
            tex: `n_{${p}} = 1 \;\\Longrightarrow\; H \\trianglelefteq G`,
            text: `n_${p} = 1 \\implies 唯一的 Sylow ${p}-子群 H 是正规子群`,
            detail: '唯一的 Sylow p-子群必正规（反之，正规的 Sylow p-子群必唯一）',
          }
        : {
            label: '非正规',
            tone: 'note',
            tex: `n_{${p}} = ${np} > 1 \;\\Longrightarrow\; H \\ntrianglelefteq G`,
            text: `n_${p} = ${np} > 1 \\implies 这些 Sylow ${p}-子群都不正规`,
            detail: `Sylow ${p}-子群共 ${np} 个，彼此共轭（Sylow II）；阶 p^${k}，指数 ${m}`,
          },
    )
  }

  // ── ③ 共轭作用在 G 自身：不动点就是中心 ──
  if (A.kind === 'conjugation' && A.omegaBase === 'self') {
    const fix = stabilizerOf(A, 0).length > 0 ? sizes.filter((x) => x === 1).length : 0
    out.push({
      label: '中心',
      tone: 'note',
      tex: `Z(G) = \\operatorname{Fix}(G \\curvearrowright G)`,
      text: 'Z(G) = 共轭作用的不动点全体',
      detail: `长度 1 的轨道有 ${fix} 个 ---- 它们对应 G 的中心元`,
    })
  }

  return out
}

/** 商群 G/ker（核必正规，直接构造 `Subgroup`，不必去枚举正规子群比对）。 */
function quotientByKernel(G: Group, kernel: GroupElement[]): Group | null {
  if (kernel.length === 0) return null
  const sub: Subgroup = {
    elements: kernel,
    order: kernel.length,
    index: G.order / kernel.length,
    generators: [],
    isNormal: true,
  }
  try {
    return computeQuotientGroup(G, sub) ?? null
  } catch {
    return null
  }
}
