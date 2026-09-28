import {
  binomialMod,
  closeUnderMultiply,
  computeConjugationPerms,
  computeCosetActionPerms,
  computeImageFromMapping,
  computeKernelFromMapping,
  computeOrbits,
  computeStabilizers,
  conjugateSubgroup,
  createGroupFromSymbol,
  extendFromGenerators,
  factorizeOrder,
  findSylowSubgroups,
  getCentralizer,
  getGeneratorElements,
  getHomomorphismProperties,
  indexById,
  parseGroupNotation,
  subgroupSetKey,
  verifyHomomorphism,
  type Group,
  type GroupElement,
  type HomomorphismMap,
} from '@groupviz/core'
import { elementNotation, resolveElementLoose } from './ops'
import { prettySymbol, subscript, superscript } from './pretty'

/**
 * Proof Spec 的**执行侧**（M1 / U15）。规范见 docs/PROOF_SPEC.md。
 *
 * ## 设计取舍：step-through 就是"替用户一行行写定义"
 *
 * 每一步 `compute` 携带**一整行定义**（`P = 闭包(G, (12)(34), (13)(24))`）。
 * 「下一步」= 把那一行追加进定义表 —— 于是：
 *
 *   - 走完一遍，画布上就长出了完整的证明图（用户**看见**证明在画布上展开）；
 *   - 走的是**同一个求值器**（与手打、与点出来的操作完全等价）；
 *   - 不需要为证明另造一套求值/渲染机制，也就不会有"两套机制算出两个答案"。
 *
 * 这条与「点出来的操作编回一行文本」（U2）是同一条哲学：**机器写的东西永远可见、可改**。
 *
 * ## 模板 × 实例：群与 p 都是入参（U15）
 *
 * 从前三条模板把 `A_4` 与 p 写死在 `build()` 里。现在 `build(group, p)` 吃参数，
 * 于是**同一份证明骨架**可以演示在任意群、任意素数上；面板上自己挑（`ui/ProofDock`）。
 *
 * 随之而来的两处"必须真算"：
 *   - **具体生成元**：从前 P 的生成元是手写的 `['(12)(34)', '(13)(24)']`（只在 A₄ 上对）。
 *     现在从 `findSylowSubgroups` 的结果里**贪心求**一个生成组（`gensOfSubgroup`），
 *     并且逐字验过"这串记号能敲回求值器"（`genText` 走 `resolveElementLoose`，
 *     回不来就退回元素 id —— id 是 core 保证认得的写法）。
 *   - **文本里的每个数字**（n_p、m、C(n, pᵏ)、不动点个数）都由 `build()` 当场算，
 *     不手写、不凭记忆 —— 面板上的数字与画布上的对象**不可能不一致**
 *     （`verify/suites/proof.ts` 盯这条）。
 *
 * ## 粒度 C：只算计数，不枚举
 *
 * Sylow I 的模板只算 `C(n, pᵏ) mod p`，**不枚举**那些 pᵏ 元子集（A₄ 上是 495 个，
 * 大群上直接爆掉）。这本身是教学点：**证明靠计数，不靠枚举**。第 6 步给出的 P
 * 是把"存在"具象化的**实例**，不是前提——存在性由第 5 步的反证独立成立。
 *
 * ## 参数槽：模板自己声明要什么参数（M3）
 *
 * U15 把"群与 p"变成入参时，所有模板恰好都是同一个元组，于是面板可以把
 * "群输入框 + p 按钮组"写死。M3 的两条新定理参数不一样——**轨道–稳定子**要多一个
 * **点 x**，**第一同构**要多一个**靶群**和一组**生成元的像**——写死就不成立了。
 *
 * `ParamSlot` 把"这个模板要什么参数"变成模板自己的声明；`build` 的第三个参数
 * （`extra`）装那些槽的值（**都是文本**——与定义行同一种"文本"哲学，能看见、能改）。
 * 群仍是所有卡共用的那一个（比较几条定理本来就该在同一个群上做），所以槽里不放群。
 */

export type ProofStepKind = 'claim' | 'compute' | 'conclude'

export interface ProofStep {
  kind: ProofStepKind
  /** 这一步的数学陈述（面板主行） */
  text: string
  /** 同一句的 TeX（有就渲染） */
  tex?: string
  /** `compute` 步：要写进定义表的那一整行（含 `名字 = 表达式`） */
  line?: string
  /** 这一步该在画布上高亮哪些对象 id */
  highlight?: string[]
}

/**
 * 模板绑定的**默认实例**（面板预填；用户可改）。
 *
 * `p` 可选：Sylow 系列才要素数，轨道–稳定子 / 第一同构都没有 p 可言。
 */
export interface ProofParams {
  group: string
  p?: number
}

/**
 * 参数槽（M3）——面板据此在卡片上渲染控件。
 *
 * 为什么要有这一层：M2 之前所有模板的参数都是同一个元组 `(群, p)`，
 * 面板于是把"群输入框 + p 按钮组"写死。M3 的两条新定理参数不一样，
 * 写死就不成立了。槽把"模板要什么参数"交还给模板自己声明。
 *
 * 群仍然**三张卡共用**（比较几条定理本来就该在同一个群上做），
 * 所以槽里不放群——放的是各卡自己的东西。
 */
export type ParamSlot =
  /** |G| 的素因子按钮组（按钮上带 n_p）—— Sylow 系列 */
  | { kind: 'prime'; key: 'p' }
  /** Ω 上的一个点（元素记号，如 `(123)`）—— 轨道–稳定子 */
  | { kind: 'element'; key: string; label: string; hint?: string }
  /** 另一个群（靶群）—— 第一同构 */
  | { kind: 'group'; key: string; label: string }
  /** 生成元的像（`a→2`，多对就用逗号隔开）—— 第一同构 */
  | { kind: 'gens'; key: string; label: string }

export interface ProofTemplate {
  id: string
  title: string
  /** TeX 定理陈述 */
  theorem: string
  /** 一句话说明这条证明的"魂" */
  blurb: string
  /** 默认实例（演示性证明是"模板 × 具体群"） */
  defaults: ProofParams
  /** 面板下拉里给的建议群（都实测过模板跑得通） */
  groupChoices: string[]
  /** 这张卡要多哪些控件（p 按钮组 / 点 / 靶群 / 像） */
  slots: ParamSlot[]
  /**
   * 参数槽的**建议值**（面板预填；用户可改）。
   *
   * 面板在**换群**与**换靶群**两个时刻调它——`current` 是当时手上已有的槽值，
   * 于是"源群变了 → 重挑点 / 重算靶群与像"这种连带更新写在模板自己家里
   * （而不是面板里堆一串 if）。
   */
  suggest?(group: string, p: number, current: Record<string, string>): Record<string, string>
  /**
   * 把"模板 × 具体群（× p × 额外参数）"实例化成步骤序列。
   *
   * 不传参数就用 `defaults`（于是 `SYLOW_I.build()` 仍是 A₄ / p = 2）。
   * `extra` 是**参数槽**的值（文本），键见 `slots`。
   */
  build(group?: string, p?: number, extra?: Record<string, string>): ProofStep[]
}

/* ── 执行器（纯函数） ───────────────────────────────────── */

/** 走到第 `cursor` 步为止，证明该写下的定义行。 */
export function proofLines(steps: ProofStep[], cursor: number): string[] {
  return steps
    .slice(0, cursor + 1)
    .map((s) => s.line)
    .filter((l): l is string => !!l)
}

/**
 * 第 `cursor` 步该高亮的对象。
 *
 * 没有显式 `highlight` 时退回"这一步写出来的那个对象"——
 * 定义行等号左边的名字就是对象 id（本语法的约定）。
 */
export function proofHighlight(steps: ProofStep[], cursor: number): string[] {
  const s = steps[cursor]
  if (!s) return []
  if (s.highlight) return s.highlight
  const name = s.line?.split('=')[0]?.trim()
  return name ? [name] : []
}

/* ── 参数体检（面板与模板共用同一份判据） ───────────────── */

/**
 * 枚举 Sylow 子群的规模上限。与 core `guards.ts` 的 `SYLOW_MAX_ORDER` 同值——
 * 超过它就不是"慢"，而是 `findSylowSubgroups` 会拒绝算。
 */
export const STAGE_MAX_ORDER = 144

export interface StageFactor {
  prime: number
  exponent: number
}

export interface StageInfo {
  raw: string
  ok: boolean
  /** 不 ok 时的定向理由（面板直接显示） */
  error?: string
  /** 归一后的 TeX 群记号（`S_{4}`） */
  symbol: string
  /** 展示形态（`S₄`） */
  sym: string
  order: number
  factors: StageFactor[]
  /** `12 = 2²·3`（面板用；纯文本，无反斜杠） */
  orderUni: string
  /** `2^{2} \cdot 3`（TeX 用） */
  orderTex: string
  /** |G| 的素因子（面板的 p 按钮组就是它） */
  primes: number[]
  /** p → n_p。**真算**（`findSylowSubgroups`），与 `Syl_p(G, p)` 同一条路径 */
  counts: Record<number, number>
}

const BAD_STAGE: Omit<StageInfo, 'raw' | 'error'> = {
  ok: false,
  symbol: '',
  sym: '',
  order: 0,
  factors: [],
  orderUni: '',
  orderTex: '',
  primes: [],
  counts: {},
}

/**
 * 一个群记号能不能当证明模板的实例——面板与 `build()` 用**同一份**判据，
 * 于是"面板说能用"与"点了真能跑"不会分家。
 *
 * 三关：认得记号 → 建得出群 → 阶 ≤ `STAGE_MAX_ORDER`。
 */
export function stageInfo(raw: string): StageInfo {
  const text = raw.trim()
  if (!text) return { ...BAD_STAGE, raw: text, error: '还没填群记号' }

  const notation = parseGroupNotation(text)
  if (!notation.ok) {
    return { ...BAD_STAGE, raw: text, error: notation.hint ?? `认不出群记号「${text}」` }
  }
  if (!notation.symbol) {
    return {
      ...BAD_STAGE,
      raw: text,
      error:
        notation.source === 'backend'
          ? `「${text}」本地建不出来（core 要后端 GAP），证明模板跑不了`
          : `认不出群记号「${text}」`,
    }
  }

  // 建群本身也可能抛（core 对某些记号会直接 throw）——面板不能因为一个错字白屏
  let g: Group | null = null
  try {
    g = createGroupFromSymbol(notation.symbol)
  } catch {
    g = null
  }
  if (!g) return { ...BAD_STAGE, raw: text, error: `「${text}」建不出群对象` }

  const order = g.order
  if (order > STAGE_MAX_ORDER) {
    return {
      ...BAD_STAGE,
      raw: text,
      symbol: g.symbol,
      sym: prettySymbol(g.symbol),
      order,
      error: `|G| = ${order} 超过模板上限 ${STAGE_MAX_ORDER}（枚举 Sylow 子群的代价随阶爆炸）`,
    }
  }

  const factors = factorizeOrder(order)
  const counts: Record<number, number> = {}
  for (const f of factors) counts[f.prime] = findSylowSubgroups(g, f.prime).length

  return {
    raw: text,
    ok: true,
    symbol: g.symbol,
    sym: prettySymbol(g.symbol),
    order,
    factors,
    orderUni: factors
      .map((f) => (f.exponent === 1 ? `${f.prime}` : `${f.prime}${superscript(f.exponent)}`))
      .join('\\cdot '),
    orderTex: factors
      .map((f) => (f.exponent === 1 ? `${f.prime}` : `${f.prime}^{${f.exponent}}`))
      .join(' \\cdot '),
    primes: factors.map((f) => f.prime),
    counts,
  }
}

/** 参数不合法时，模板给出的**唯一一步**（面板照常渲染，用户看得见为什么跑不了）。 */
const bail = (text: string): ProofStep[] => [{ kind: 'claim', text }]

/* ── 记号的两种形态（TeX / 展示） ───────────────────────── */

/** `pᵏ`（纯文本）。core 只给数字上下标，字母 k 直接用 Unicode 修饰符。 */
const PK = 'p^k'
/** `n_p`（TeX） */
const nTex = (p: number) => `n_{${p}}`
/** `nₚ`（纯文本） */
const nUni = (p: number) => `n${subscript(String(p))}`

/** 校验 (群, p)：返回 null 表示通过，否则返回该显示的理由。 */
function checkParams(info: StageInfo, p: number): string | null {
  if (!info.ok) return info.error ?? '参数不合法'
  if (!Number.isInteger(p) || p < 2) return `p = ${p} 不是素数`
  const f = info.factors.find((x) => x.prime === p)
  if (!f) return `p = ${p} 不整除 |G| = ${info.order}（${info.sym} 里没有 p 子群可言）`
  return null
}

/** 由体检过的记号建出群（只在 `stageInfo(...).ok` 之后用）。 */
function groupOf(info: StageInfo): Group | null {
  const notation = parseGroupNotation(info.raw.trim())
  if (!notation.symbol) return null
  try {
    return createGroupFromSymbol(notation.symbol)
  } catch {
    return null
  }
}

/* ── 舞台：Sylow 子群一族（真算） ───────────────────────── */

/** 子群的**语义键**（元素 id 升序）—— Ω 上的点靠它比对。 */
function subKey(els: GroupElement[]): string {
  return subgroupSetKey(els.map((e) => e.id))
}

/**
 * 元素的**可回认记号**：优先**课本写法**（`elementNotation` 把 S₄ 的 `234`
 * 升格成 `(234)`），但只有在它真能敲回求值器时才用；否则退回 core 的 `label`，
 * 再不行退回 `id`（core 一定认）。
 *
 * 这条是整个 U15 的地基，M3 的「点 x」也吃它：模板把元素**写成文本**塞进定义行
 *（`P = 闭包(G, …)` / `O = 轨道(A, (123))`），文本一旦解不开，后面整条链就断在
 * 求值器里——而且断得很晚（tsc 与"数字都对"都拦不住）。
 */
function elemText(g: Group, e: GroupElement): string {
  const nice = elementNotation(g, e)
  const hit = resolveElementLoose(g, nice)
  if (hit && hit.id === e.id) return nice
  const raw = resolveElementLoose(g, e.label)
  return raw && raw.id === e.id ? e.label : e.id
}

/**
 * 一个子群的生成组（**贪心**，最多 `cap` 个）：顺着元素表扫，
 * 谁不在已闭包里就收它当生成元，重新闭合，直到闭合出整个子群。
 *
 * 闭合不出（需要的生成元多于 `cap`）返回 `null` —— 模板据此**明确报错**，
 * 而不是给出一个阶不对的 P（那会让后面每一条轨道 / 稳定子都跟着错）。
 */
function gensOfSubgroup(g: Group, els: GroupElement[], cap = 3): string[] | null {
  const gens: GroupElement[] = []
  let closed: GroupElement[] = [g.identity]
  for (const e of els) {
    if (closed.length >= els.length) break
    if (closed.some((x) => x.id === e.id)) continue
    if (gens.length >= cap) break
    gens.push(e)
    closed = closeUnderMultiply(g, gens)
  }
  if (gens.length === 0 || closed.length !== els.length) return null
  return gens.map((e) => elemText(g, e))
}

interface SylowStage {
  g: Group
  info: StageInfo
  k: number
  pk: number
  m: number
  /** n_p */
  n: number
  /** Ω 的成员：每个点是一个子群（元素数组） */
  points: GroupElement[][]
  /** 具体的那个 P（Ω 的第 1 号点） */
  P: GroupElement[]
  /** P 的生成元记号 */
  genTexts: string[]
  /** P 在 Ω 里的序号（1 起） */
  pIdx: number
}

/**
 * Sylow II / III 共用的舞台（**全部真算**，与求值器同一条 core 路径）。
 *
 * 关键约定：`points` 的顺序与 `Syl_p(G, p)` 这个操作**逐项一致**——两边都是
 * 直接调 `findSylowSubgroups`。模板要写 `轨道(B, k)` 这种"第 k 个点"时，
 * 靠的就是这条同序关系（断言在 `verify/suites/proof.ts` 里盯着）。
 *
 * 具体那个 P 一律取 **Ω 的第 1 号点**（`pIdx` 恒为 1）：顺序既然已经对齐，
 * 就没有"另外找一个 P"的必要；从前手写 `(123)` 再回查下标，反而多一层会错的活。
 */
function sylowStage(info: StageInfo, p: number): SylowStage | string {
  const g = groupOf(info)
  if (!g) return `认不出群记号「${info.raw}」`

  const f = info.factors.find((x) => x.prime === p)
  if (!f) return `p = ${p} 不整除 |G|`
  const pk = p ** f.exponent

  const syl = findSylowSubgroups(g, p)
  if (syl.length === 0) return `Syl_${p}(${info.sym}) 是空的（不该发生）`
  const points = syl.map((s) => s.elements)

  const genTexts = gensOfSubgroup(g, points[0])
  if (!genTexts) {
    return `Syl_${p}(${info.sym}) 里的子群需要多于 3 个生成元，模板的「闭包(G, g_1, g_2, g_3)」写法接不下`
  }

  return {
    g,
    info,
    k: f.exponent,
    pk,
    m: info.order / pk,
    n: syl.length,
    points,
    P: points[0],
    genTexts,
    pIdx: 1,
  }
}

/**
 * P 在 Ω（点 = 子群）上的**轨道分解**。与 `共轭作用在(P, Ω)` 同算法：
 * 共轭在**母群**里做，只是拿来乘的元素限定为 P 的元素。
 *
 * 模板要在文本里写出"其余轨道长 3"这种话，就得自己算一遍；
 * 但算的是**同一批 core 函数**，不是另一套公式。
 * 返回按"首个遇到的点"排序的轨道大小表——第 0 项是 P 自己的轨道（恒为 1）。
 */
function orbitsUnder(ambient: Group, P: GroupElement[], points: GroupElement[][]): number[] {
  const index = new Map(points.map((els, i) => [subKey(els), i]))
  const seen = points.map(() => false)
  const sizes: number[] = []
  for (let s = 0; s < points.length; s++) {
    if (seen[s]) continue
    seen[s] = true
    const stack = [s]
    let size = 0
    while (stack.length > 0) {
      const i = stack.pop() as number
      size++
      for (const x of P) {
        const j = index.get(subKey(conjugateSubgroup(ambient, points[i], x)))
        if (j === undefined || seen[j]) continue
        seen[j] = true
        stack.push(j)
      }
    }
    sizes.push(size)
  }
  return sizes
}

/* ── 组合数（BigInt，避免大群上溢出成一个错数） ─────────── */

function chooseExact(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n
  let r = 1n
  for (let i = 0; i < k; i++) r = (r * BigInt(n - i)) / BigInt(i + 1)
  return r
}

/** 超过这个位数就不再往面板上铺完整数字（只留余数——证明只需要余数）。 */
const BINOM_DIGITS_SHOWN = 20

/* ── 面板下拉里给的建议群（都实测过） ───────────────────── */

export const PROOF_GROUP_CHOICES = ['A_4', 'S_4', 'S_3', 'D_6', 'D_4', 'C_6', 'C_12', 'Q_8']

/** Sylow 系列要的那个槽：|G| 的素因子按钮组（按钮上带 n_p）。 */
const PRIME_SLOT: ParamSlot = { kind: 'prime', key: 'p' }

/* ── Sylow I（Wielandt）─────────────────────────────────── */

const SYLOW_I_DEFAULTS: ProofParams = { group: 'A_4', p: 2 }

/**
 * 证明的骨架与群无关，只有数字随 (G, p) 变——所以整条骨架只写一遍，
 * 里面每个具体数字都由 `build()` 当场算出来。
 */
export const SYLOW_I: ProofTemplate = {
  id: 'sylow-1-wielandt',
  title: 'Sylow I \\cdot 存在性（Wielandt 计数证明）',
  theorem: 'p^k \\mid|G| \\;\\Longrightarrow\\; \\exists H \\le G,\ |H| = p^k',
  blurb: '不搜索、不枚举：只数一个模 p 不为 0 的集合',
  defaults: SYLOW_I_DEFAULTS,
  groupChoices: PROOF_GROUP_CHOICES,
  slots: [PRIME_SLOT],

  build(group?: string, p?: number): ProofStep[] {
    const info = stageInfo(group ?? SYLOW_I_DEFAULTS.group)
    const pp = p ?? SYLOW_I_DEFAULTS.p ?? 2
    const bad = checkParams(info, pp)
    if (bad) return bail(bad)

    const st = sylowStage(info, pp)
    if (typeof st === 'string') return bail(st)
    const { k, pk, m } = st
    const order = info.order
    const sym = info.sym

    const binom = chooseExact(order, pk)
    const binomText = binom.toString()
    const binomShown = binomText.length <= BINOM_DIGITS_SHOWN ? binomText : null
    const mod = binomialMod(order, pk, pp)

    const gensLine = st.genTexts.join(', ')
    const gensTex = st.genTexts.join(',\\;')

    // 陪集作用的舞台（G 左乘 P 的左陪集）
    const coset = computeCosetActionPerms(st.g, st.P)
    const { orbits, orbitOf } = computeOrbits(coset.perms, coset.n)
    const orbitSize = orbits[orbitOf[0]]?.elements.length ?? 0
    const stabSize = (computeStabilizers(st.g, coset.perms, coset.n).get(0) ?? []).length

    return [
      {
        kind: 'claim',
        text: `设 G = ${sym}，|G| = ${PK}\\cdot m 且 p \\nmid m。目标：在 G 里找出一阶为 ${PK} 的子群。`,
        tex: `|G| = p^{k} m, \\qquad p \\nmid m`,
        // claim 步也允许带 `line` —— 建群是"设 G 为……"的具象化，本来就属于这一步
        line: `G = ${info.raw.trim()}`,
        highlight: ['G'],
      },
      {
        kind: 'compute',
        text: `${sym} 的阶是 ${order} = ${info.orderUni} \\implies p = ${pp}，k = ${k}，${PK} = ${pk}，m = ${m}`,
        tex: `|${sym}| = ${order} = ${info.orderTex}`,
        line: `n = 分解(${order})`,
      },
      {
        kind: 'claim',
        text: `构造 X = { A \\subseteq G : |A| = ${PK} }（全体 ${PK} 元子集）。下面只数它的大小----不枚举。`,
        tex: `X = \\{\\, A \\subseteq G : |A| = p^k \\,\\},\\qquad|X| = \\binom{${order}}{${pk}}`,
      },
      {
        kind: 'compute',
        text:
          binomShown !== null
            ? `|X| = C(${order}, ${pk}) = ${binomShown}，而 ${binomShown} mod ${pp} = ${mod} \\ne 0 \\implies p \\nmid|X|`
            : `|X| = C(${order}, ${pk}) 是个 ${binomText.length} 位数（太大），只算余数：mod ${pp} = ${mod} \\ne 0 \\implies p \\nmid|X|`,
        tex:
          binomShown !== null
            ? `\\binom{${order}}{${pk}} = ${binomShown} \\equiv ${mod} \\pmod{${pp}}`
            : `\\binom{${order}}{${pk}} \\equiv ${mod} \\pmod{${pp}}`,
        line: `c = Cmod(${order}, ${pk}, ${pp})`,
      },
      {
        kind: 'claim',
        text: `G 左乘作用在 X 上。若每个轨道大小都被 p 整除，则 p | |X| ---- 与上一步矛盾。所以存在轨道 O 使 p \\nmid|O|。`,
        tex: `p \\nmid|X| \\;\\Longrightarrow\\; \\exists\\, O :\\; p \\nmid|O|`,
      },
      {
        kind: 'compute',
        text: `取一个具体的 ${PK} 元子集作实例：P = \\langle ${gensLine}\\rangle （它就是 ${sym} 的 ${pk} 阶子群）`,
        tex: `P = \\langle ${gensTex} \\rangle,\\qquad|P| = ${pk} = p^k`,
        line: `P = 闭包(G, ${gensLine})`,
        highlight: ['P'],
      },
      {
        kind: 'compute',
        text: `G 左乘作用在 P 的左陪集上：共 [G : P] = ${coset.n} 个点`,
        tex: `G \\curvearrowright G/P,\\qquad|G/P| = [G:P] = ${coset.n}`,
        line: `A = 陪集作用(G, P)`,
        highlight: ['A'],
      },
      {
        kind: 'compute',
        text: `左乘作用在陪集上是传递的：轨道就是整个 \\Omega ，|O| = ${orbitSize}；${pp} \\nmid ${orbitSize} v`,
        tex: `|O(P)| = ${orbitSize},\\qquad ${pp} \\nmid ${orbitSize}`,
        line: `O = 轨道(A, 1)`,
        highlight: ['O'],
      },
      {
        kind: 'compute',
        text: `稳定子 Stab(P) = P（左乘作用下 gP = P \\iff g \\in P），|Stab| = ${stabSize}`,
        tex: `\\operatorname{Stab}_{G}(P) = P,\\qquad|{\\operatorname{Stab}}| = ${stabSize}`,
        line: `S = 稳定子(A, 1)`,
        highlight: ['S'],
      },
      {
        kind: 'claim',
        text: `orbit-stabilizer 核对：|G| = |O| \\cdot|Stab| = ${orbitSize} \\times ${stabSize} = ${orbitSize * stabSize}${orbitSize * stabSize === order ? ' v' : ' x'}`,
        tex: `|G| = |O|\\cdot|{\\operatorname{Stab}}| = ${orbitSize} \\times ${stabSize} = ${orbitSize * stabSize}`,
      },
      {
        kind: 'claim',
        text: `由 |G| = ${PK}m 与 p \\nmid|O| 得 ${PK} | |Stab(A)|，即 |Stab(A)| \\ge ${pk}。`,
        tex: `p^k \\mid|{\\operatorname{Stab}}(A)| \\;\\Longrightarrow\\; |{\\operatorname{Stab}}(A)| \\ge ${pk}`,
      },
      {
        kind: 'claim',
        text: `另一边：\\forall a \\in A 有 Stab(A)\\cdot a \\subseteq A，于是 |Stab(A)| \\le|A| = ${PK} = ${pk}。`,
        tex: `|{\\operatorname{Stab}}(A)| \\le|A| = p^k = ${pk}`,
      },
      {
        kind: 'conclude',
        text: `${pk} \\le|Stab(A)| \\le ${pk} \\implies|Stab(A)| = ${pk} = ${PK}。Stab(A) 就是所求的 ${PK} 阶子群 \\blacksquare`,
        tex: `|{\\operatorname{Stab}}(A)| = p^k = ${pk} \\;\\qed`,
        highlight: ['S'],
      },
    ]
  },
}

/* ── Sylow II（共轭性）──────────────────────────────────── */

const SYLOW_II_DEFAULTS: ProofParams = { group: 'A_4', p: 3 }

/**
 * 为什么默认挑 **A₄ / p = 3** 而不是 p = 2：
 * A₄ 的 Sylow 2-子群只有 V₄ **一个**（n₂ = 1），"两两共轭"退化成废话。
 * p = 3 时 n₃ = 4，四个 3 阶子群两两共轭——这才是 Sylow II 的内容。
 *
 * 这条经验对别的群同样成立：面板上会把每个 p 的 n_p 标出来（`ui/ProofDock`），
 * 让用户知道哪个 p 才有戏。
 */
export const SYLOW_II: ProofTemplate = {
  id: 'sylow-2-conjugate',
  title: 'Sylow II \\cdot 共轭性（G \\curvearrowright Syl_p(G) 传递）',
  theorem:
    'P, Q \\in \\operatorname{Syl}_p(G) \\;\\Longrightarrow\\; \\exists\\, g \\in G : Q = gPg^{-1}',
  blurb: '一次作用：G 共轭作用在 Syl_p(G) 上，且只有一个轨道',
  defaults: SYLOW_II_DEFAULTS,
  groupChoices: PROOF_GROUP_CHOICES,
  slots: [PRIME_SLOT],

  build(group?: string, p?: number): ProofStep[] {
    const info = stageInfo(group ?? SYLOW_II_DEFAULTS.group)
    const pp = p ?? SYLOW_II_DEFAULTS.p ?? 3
    const bad = checkParams(info, pp)
    if (bad) return bail(bad)

    const st = sylowStage(info, pp)
    if (typeof st === 'string') return bail(st)
    const { pk, m, n, genTexts, pIdx } = st
    const order = info.order
    const sym = info.sym
    const gensLine = genTexts.join(', ')

    // 稳定子 = N_G(P)：|Stab| = |G| / n_p（轨道-稳定子）
    const stab = order / n

    return [
      {
        kind: 'claim',
        text: `设 G = ${sym}，|G| = ${order} = ${info.orderUni}。取 p = ${pp} \\implies ${PK} = ${pk}，m = ${m}。`,
        tex: `|G| = ${order} = ${info.orderTex},\\qquad p = ${pp},\\quad p^k = ${pk},\\quad m = ${m}`,
        line: `G = ${info.raw.trim()}`,
        highlight: ['G'],
      },
      {
        kind: 'compute',
        text: `Sylow I 保证 ${pk} 阶子群存在；把它们全体枚举出来：共 ${nUni(pp)} = ${n} 个`,
        tex: `|\\operatorname{Syl}_${pp}(${sym})| = ${nTex(pp)} = ${n}`,
        line: `S = Syl_p(G, ${pp})`,
        highlight: ['S'],
      },
      {
        kind: 'claim',
        text: `把子群集「升格为对象」 \\Omega ---- 它才是作用要作用的那个集合（|\\Omega| = ${n}）。`,
        tex: `\\Omega = \\operatorname{Syl}_${pp}(${sym}),\\qquad|\\Omega| = ${n}`,
        line: 'Omega = 底集(S)',
        highlight: ['Omega'],
      },
      {
        kind: 'compute',
        text: `让 G 通过共轭 g\\cdot H\\cdot g^-^1 作用在 \\Omega 上 ---- Sylow 定理的全部动力都在这一条作用里。`,
        tex: `${sym} \\curvearrowright \\Omega,\\qquad g \\cdot H = gHg^{-1}`,
        line: 'A = 共轭作用在(G, Omega)',
        highlight: ['A'],
      },
      {
        kind: 'compute',
        text: `取 \\Omega 的 1 号点算它的轨道：|O| = ${n} = |\\Omega| ---- 一个轨道就吃下整个 \\Omega ，作用是「传递」的。`,
        tex: `|O| = ${n} = |\\Omega|`,
        line: 'O = 轨道(A, 1)',
        highlight: ['O'],
      },
      {
        kind: 'claim',
        text: `传递 \\iff 任意两个 Sylow ${pp}-子群都在同一条共轭轨道里，即 \\exists g：Q = gPg^-^1。这就是 Sylow II。`,
        tex: `\\forall\\, P, Q \\in \\Omega\\;\\; \\exists g \\in G : Q = gPg^{-1}`,
      },
      {
        kind: 'compute',
        text: `顺带把稳定子算出来：Stab(1 号点) = N_G(P)，|N_G(P)| = ${stab}`,
        tex: `\\operatorname{Stab}_{G}(P) = N_{G}(P),\\qquad|N_{G}(P)| = ${stab}`,
        line: 'N = 稳定子(A, 1)',
        highlight: ['N'],
      },
      {
        kind: 'claim',
        text: `轨道-稳定子核对：|O| \\cdot|Stab| = ${n} \\times ${stab} = ${n * stab}${n * stab === order ? ' v' : ' x'} = |G|`,
        tex: `|O| \\cdot|N_{G}(P)| = ${n} \\times ${stab} = ${n * stab} = |G|`,
      },
      {
        kind: 'compute',
        text: `取一个「具体的」 Sylow ${pp}-子群 P = \\langle ${gensLine}\\rangle （\\Omega 里的第 ${pIdx} 号点）`,
        tex: `P = \\langle ${gensLine} \\rangle,\\qquad|P| = ${pk}`,
        line: `P = 闭包(G, ${gensLine})`,
        highlight: ['P'],
      },
      {
        kind: 'conclude',
        text: `${nUni(pp)} = [G : N_G(P)] = ${order}/${stab} = ${n}；${n} 个 Sylow ${pp}-子群两两共轭 \\blacksquare`,
        tex: `${nTex(pp)} = [G : N_{G}(P)] = ${n},\\qquad\\text{${n} 个 } ${pp}\\text{-子群两两共轭} \\;\\qed`,
        highlight: ['P'],
      },
    ]
  },
}

/* ── Sylow III（n_p ≡ 1 mod p）──────────────────────────── */

const SYLOW_III_DEFAULTS: ProofParams = { group: 'A_4', p: 3 }

/**
 * 与 Sylow II 的区别在「换主角」：G 的作用只给出 n_p | m，
 * `n_p ≡ 1 (mod p)` 要「让 P 自己作用在 Ω 上」——P 的轨道长是 p 的幂，
 * 非不动点轨道一律被 p 整除，于是 `n_p ≡ |不动点| (mod p)`，
 * 而不动点只有一个（P 自己）。
 *
 * 因此这份模板**要求 n_p ≥ 2**：n_p = 1 时"其余轨道"根本不存在，
 * 整个论证退化成一句废话（面板会拦下来说清楚，见 `templateReady`）。
 */
export const SYLOW_III: ProofTemplate = {
  id: 'sylow-3-congruence',
  title: 'Sylow III \\cdot n_p \\equiv 1 (mod p) 且 n_p | m',
  theorem: 'n_p \\equiv 1 \\pmod{p},\\qquad n_p \\mid m \\quad (|G| = p^k m,\\; p \\nmid m)',
  blurb: '换主角：让 P 自己作用在 Syl_p(G) 上，轨道长全是 p 的幂',
  defaults: SYLOW_III_DEFAULTS,
  groupChoices: PROOF_GROUP_CHOICES,
  slots: [PRIME_SLOT],

  build(group?: string, p?: number): ProofStep[] {
    const info = stageInfo(group ?? SYLOW_III_DEFAULTS.group)
    const pp = p ?? SYLOW_III_DEFAULTS.p ?? 3
    const bad = checkParams(info, pp)
    if (bad) return bail(bad)

    const st = sylowStage(info, pp)
    if (typeof st === 'string') return bail(st)
    const { g, pk, m, n, points, P, genTexts, pIdx } = st
    const order = info.order
    const sym = info.sym
    const gensLine = genTexts.join(', ')
    const stab = order / n
    const mod = n % pp

    if (n < 2) {
      return bail(
        `${nUni(pp)} = 1（${sym} 只有一个 Sylow ${pp}-子群，它是正规的）。Sylow III 靠「P 作用在 \\Omega 上、除不动点外的轨道都被 p 整除」来论证，n_p = 1 时没有其余轨道可谈----换一个 p 或换一个群。`,
      )
    }

    // P 自己作用在 Ω 上：不动点 1 个（P 自己），其余轨道的长度全是 p 的幂
    const sizes = orbitsUnder(g, P, points)
    const fixed = sizes[0]
    const others = sizes.slice(1)
    const otherIdx = others.length > 0 ? 2 : 1
    const restSum = others.reduce((a, b) => a + b, 0)

    return [
      {
        kind: 'claim',
        text: `设 G = ${sym}，|G| = ${PK}m：${order} = ${info.orderUni}，p = ${pp} \\implies ${PK} = ${pk}，m = ${m}（p \\nmid m）。`,
        tex: `|G| = ${order} = ${info.orderTex},\\qquad p = ${pp},\\quad p^k = ${pk},\\quad m = ${m}`,
        line: `G = ${info.raw.trim()}`,
        highlight: ['G'],
      },
      {
        kind: 'compute',
        text: `${nUni(pp)} 是 Sylow ${pp}-子群的个数：枚举出来 ${nUni(pp)} = ${n}`,
        tex: `${nTex(pp)} = |\\operatorname{Syl}_${pp}(${sym})| = ${n}`,
        line: `S = Syl_p(G, ${pp})`,
        highlight: ['S'],
      },
      {
        kind: 'compute',
        text: `\\Omega = Syl${subscript(String(pp))}(G) 升格为集合对象（${n} 个点）`,
        tex: `\\Omega = \\operatorname{Syl}_${pp}(${sym}),\\qquad|\\Omega| = ${n}`,
        line: 'Omega = 底集(S)',
        highlight: ['Omega'],
      },
      {
        kind: 'compute',
        text: `第一条路：G 通过共轭作用在 \\Omega 上`,
        tex: `${sym} \\curvearrowright \\Omega,\\qquad g \\cdot H = gHg^{-1}`,
        line: 'A = 共轭作用在(G, Omega)',
        highlight: ['A'],
      },
      {
        kind: 'compute',
        text: `G 的作用只有一个轨道（|O| = ${n}）：Sylow II 的共轭性`,
        tex: `|O| = ${n} = |\\Omega|`,
        line: 'O = 轨道(A, 1)',
        highlight: ['O'],
      },
      {
        kind: 'compute',
        text: `稳定子是正规化子：|N_G(P)| = ${stab}，于是 ${nUni(pp)} = [G : N_G(P)] = ${order}/${stab} = ${n}`,
        tex: `${nTex(pp)} = [G : N_{G}(P)] = ${n}`,
        line: 'N = 稳定子(A, 1)',
        highlight: ['N'],
      },
      {
        kind: 'claim',
        text: `因为 P \\subseteq N_G(P)，把 [G:P] = [G:N_G(P)]\\cdot [N_G(P):P] 摊开得 ${nUni(pp)} \\cdot [N_G(P):P] = m = ${m} \\implies ${nUni(pp)} | m v`,
        tex: `${nTex(pp)} \\mid m = ${m}`,
      },
      {
        kind: 'claim',
        text: `第二条路（这才是 ${nUni(pp)} \\equiv 1 的来源）：「换主角」----让 P 自己通过共轭作用在 \\Omega 上。`,
        tex: `P \\curvearrowright \\Omega \\quad(\\text{限制 } ${sym} \\text{ 的作用到 } P)`,
      },
      {
        kind: 'compute',
        text: `取一个具体的 P = \\langle ${gensLine}\\rangle （\\Omega 的第 ${pIdx} 号点），让它作用`,
        tex: `P = \\langle ${gensLine} \\rangle,\\qquad|P| = ${pk}`,
        line: `P = 闭包(G, ${gensLine})`,
        highlight: ['P'],
      },
      {
        kind: 'compute',
        text: `P 作用在 \\Omega 上：P \\curvearrowright \\Omega （作用群是子群 P，\\Omega 的成员仍是母群 ${sym} 的子群）`,
        tex: `P \\curvearrowright \\Omega,\\qquad|\\Omega| = ${n}`,
        line: 'B = 共轭作用在(P, Omega)',
        highlight: ['B'],
      },
      {
        kind: 'compute',
        text: `P 的不动点只有一个：|Fix| = ${fixed} ---- 只有 P 自己被 P 正规化`,
        tex: `|\\operatorname{Fix}_{P}(\\Omega)| = ${fixed}`,
        line: 'F = 不动点(B)',
        highlight: ['F'],
      },
      {
        kind: 'compute',
        text: `其余 ${others.length} 条轨道长 ${others.join(' + ')} ---- 轨道长整除 |P| = ${pk} 且 > 1，故都被 p = ${pp} 整除`,
        tex: `\\sum|P \\cdot Q| = ${others.join(' + ')},\\qquad ${pp} \\mid ${restSum}`,
        line: `OB = 轨道(B, ${otherIdx})`,
        highlight: ['OB'],
      },
      {
        kind: 'claim',
        text: `于是 ${n} = |\\Omega| = ${fixed} + ${restSum} \\equiv ${fixed} = 1 (mod ${pp})：${nUni(pp)} \\equiv 1 (mod ${pp}) v`,
        tex: `${nTex(pp)} = ${n} \\equiv ${mod} \\pmod{${pp}}`,
      },
      {
        kind: 'conclude',
        text: `${nUni(pp)} = ${n}：既 ${n} \\equiv ${mod} (mod ${pp}) v，又 ${n} | m = ${m} v。Sylow III 两条都成立 \\blacksquare`,
        tex: `${nTex(pp)} = ${n} \\equiv 1 \\pmod{${pp}},\\qquad ${nTex(pp)} \\mid ${m} \\;\\qed`,
        highlight: ['S'],
      },
    ]
  },
}

/* ── 轨道–稳定子（M3）──────────────────────────────────── */

const OST_DEFAULTS: ProofParams = { group: 'S_4' }

/** 「点 x」该填什么（面板的占位提示与报错共用一句话）。 */
const X_HINT = '\\Omega = G 自身，填一个元素记号，如 (123)'

interface ConjStage {
  g: Group
  /** 用户填的**原文**（写进定义行——它是求值器的输入，不是展示） */
  xLine: string
  /** 展示形态（课本括号），文本里用它 */
  xNice: string
  orbit: number
  stab: number
  /** 中心化子的阶：与稳定子**另算一遍**做交叉核对 */
  centralizer: number
  order: number
}

/**
 * 共轭作用在自身上的舞台（**真算**）。
 *
 * 走的是与 `共轭作用(G)` + `轨道(A, x)` + `稳定子(A, x)` 完全相同的 core 函数
 * （`computeConjugationPerms` / `computeOrbits` / `computeStabilizers`），
 * 所以模板文本里的数不会与画布上的对象分家。
 */
function conjStage(info: StageInfo, xRaw: string): ConjStage | string {
  const g = groupOf(info)
  if (!g) return `认不出群记号「${info.raw}」`

  const xLine = (xRaw ?? '').trim()
  if (!xLine) return `还没填点 x（${X_HINT}）`
  const x = resolveElementLoose(g, xLine)
  if (!x) return `\\Omega = G = ${info.sym} 里没有元素「${xLine}」`

  const perms = computeConjugationPerms(g)
  const { orbits, orbitOf } = computeOrbits(perms, g.order)
  const i = indexById(g).get(x.id)
  if (i === undefined) return `元素「${xLine}」不在 ${info.sym} 的元素表里`

  return {
    g,
    xLine,
    xNice: elemText(g, x),
    orbit: orbits[orbitOf[i]]?.elements.length ?? 0,
    stab: (computeStabilizers(g, perms, g.order).get(i) ?? []).length,
    centralizer: getCentralizer(g, [x]).length,
    order: g.order,
  }
}

/**
 * 面板「点 x」的建议值：**挑共轭类最大的那个元素**。
 *
 * 为什么不随便挑一个：共轭类最小的恰好是单位元（轨道 1、稳定子 = G）——
 * 那是 orbit–stabilizer 最没看头的一档（两个因数一个退化到 1、一个退化到 |G|）。
 * 挑最大的共轭类，两个因数都远离退化。并列时取元素表里靠前的那个（core 的顺序确定）。
 *
 * **单位元直接跳过**：它的共轭类恒为 `{e}`，是"最大共轭类"的最后一个候选。
 * 交换群上所有共轭类都是单点（挑谁都一样），跳过单位元至少让 x 是个非平凡元素。
 */
export function suggestPoint(group: string): string {
  const info = stageInfo(group)
  if (!info.ok) return ''
  const g = groupOf(info)
  if (!g) return ''
  const perms = computeConjugationPerms(g)
  const { orbits, orbitOf } = computeOrbits(perms, g.order)
  const idx = indexById(g)
  let bestEl: GroupElement | null = null
  let bestSize = -1
  for (const e of g.elements) {
    if (e.id === g.identity.id) continue
    const i = idx.get(e.id)
    if (i === undefined) continue
    const size = orbits[orbitOf[i]]?.elements.length ?? 0
    if (size > bestSize) {
      bestSize = size
      bestEl = e
    }
  }
  if (!bestEl) bestEl = g.identity // 平凡群只有单位元
  return elemText(g, bestEl)
}

/**
 * 轨道–稳定子定理（M3）。
 *
 * 挑**共轭作用在自身上**当舞台，因为课本里这条定理最常见的落点就是它：
 * 轨道 = 共轭类、稳定子 = 中心化子，于是 |G| = |共轭类| · |C_G(x)| ——
 * 共轭类方程的雏形。舞台还只要一个参数（群 + 点 x），不必再挑子群。
 */
export const ORBIT_STABILIZER: ProofTemplate = {
  id: 'orbit-stabilizer',
  title: '轨道-稳定子定理 \\cdot|O| \\cdot|Stab| = |G|',
  theorem:
    '|O_{x}| = [G : \\operatorname{Stab}(x)],\\qquad|G| = |O_{x}|\\cdot|\\operatorname{Stab}(x)|',
  blurb: '一条作用两个数：轨道多大、稳定子多大，乘起来就是群',
  defaults: OST_DEFAULTS,
  groupChoices: PROOF_GROUP_CHOICES,
  slots: [{ kind: 'element', key: 'x', label: '点 x', hint: X_HINT }],
  suggest: (group) => ({ x: suggestPoint(group) }),

  build(group, _p, extra): ProofStep[] {
    const info = stageInfo(group ?? OST_DEFAULTS.group)
    if (!info.ok) return bail(info.error ?? '参数不合法')

    const st = conjStage(info, extra?.x ?? '')
    if (typeof st === 'string') return bail(st)
    const { orbit, stab, centralizer, order, xNice, xLine } = st
    const sym = info.sym
    const exact = orbit * stab === order
    const cMatch = centralizer === stab

    return [
      {
        kind: 'claim',
        text: `设 G = ${sym}，|G| = ${order}。取一个具体的点 x = ${xNice} ---- 作用的对象就是 G 自身。`,
        tex: `x = ${xNice} \\in G,\\qquad|G| = ${order}`,
        line: `G = ${info.raw.trim()}`,
        highlight: ['G'],
      },
      {
        kind: 'compute',
        text: `让 G 通过共轭 g\\cdot x = gxg^-^1 作用在自身：\\Omega = G，|\\Omega| = ${order}。`,
        tex: `G \\curvearrowright G,\\qquad g\\cdot x = gxg^{-1}`,
        line: 'A = 共轭作用(G)',
        highlight: ['A'],
      },
      {
        kind: 'compute',
        // 面板把 `text` 当**纯文本**渲染（只有 `tex` 走 KaTeX）—— 一个星号都不会被吃掉
        text: `x 的轨道就是它的共轭类 x^G = {gxg^-^1 : g \\in G}：|O| = ${orbit}。${
          orbit === 1
            ? '\\leftarrow x 落在中心里（它的共轭类只有它自己），这条定理在它身上退化成 |G| = 1\\cdot|G|；想看真轨道就挑一个非中心的 x，或换一个非交换群。'
            : ''
        }`,
        tex: `O_{x} = x^{G},\\qquad|O_{x}| = ${orbit}`,
        line: `O = 轨道(A, ${xLine})`,
        highlight: ['O'],
      },
      {
        kind: 'compute',
        text: `x 的稳定子是中心化子 C_G(x)（与 x 交换的元素全体）：|Stab| = ${stab}${
          cMatch
            ? `（C_G(x) 从另一条路单独算一遍也是 ${centralizer} v）`
            : ` ---- 但中心化子单独算是 ${centralizer}，两者对不上，要查`
        }。`,
        tex: `\\operatorname{Stab}_{G}(x) = C_{G}(x),\\qquad|C_{G}(x)| = ${stab}`,
        line: `S = 稳定子(A, ${xLine})`,
        highlight: ['S'],
      },
      {
        kind: 'claim',
        text: 'g\\cdot x = h\\cdot x \\iff h^-^1g \\in Stab(x) \\iff gStab(x) = hStab(x)。于是 gStab(x) \\mapsto g\\cdot x 是 G/Stab(x) \\to O_x 的一一对应。',
        tex: 'g\\cdot x = h\\cdot x \\iff h^{-1}g \\in \\operatorname{Stab}(x) \\iff g\\operatorname{Stab}(x) = h\\operatorname{Stab}(x)',
      },
      {
        kind: 'claim',
        text: `两边取元素个数：|O| = [G : Stab(x)] = ${order}/${stab} = ${orbit} v`,
        tex: `|O_{x}| = [G : \\operatorname{Stab}(x)] = ${order}/${stab} = ${orbit}`,
      },
      {
        kind: 'claim',
        text: `换成中心化子说：共轭类大小 = [G : C_G(x)]，所以每个共轭类的大小都整除 |G|（${orbit} | ${order} v）。`,
        tex: `|x^{G}| = [G : C_{G}(x)] \\mid|G|`,
      },
      {
        kind: 'conclude',
        text: `|G| = |O| \\cdot|Stab| = ${orbit} \\times ${stab} = ${orbit * stab}${exact ? ' v' : ' x'} ---- 即 |O_x| = [G : Stab(x)] \\blacksquare`,
        tex: `|G| = |O_{x}|\\cdot|\\operatorname{Stab}(x)| = ${orbit} \\times ${stab} = ${orbit * stab} \\;\\qed`,
        highlight: ['S'],
      },
    ]
  },
}

/* ── 第一同构定理（M3）─────────────────────────────────── */

const FIRST_ISO_DEFAULTS: ProofParams = { group: 'C_6' }

/** 第一同构模板里映射对象的名字（定义行、highlight 都靠它）。 */
// 第一同构自动补出的映射用 `\varphi` 当名字（`NAME_RE` 现在收 LaTeX 命令形态，
// 而且这正是课本里那条同态的惯用记号）
const ISO_MAP_ID = '\\varphi'

interface MapStage {
  g: Group
  h: Group
  hSym: string
  /** 归一的像对文本（`a→2`） */
  images: string
  kerOrder: number
  imOrder: number
  /** |G/ker φ| */
  quotient: number
  isSurjective: boolean
}

/**
 * 由"源群 + 靶群 + 生成元的像"把同态造出来（**真算**，与 `映射(G, H, …)`
 * 走同一批 core 函数：`extendFromGenerators` → `verifyHomomorphism`）。
 *
 * 注意 `extendFromGenerators` 收的 Map 键是**生成元元素的 id**（不是名字）——
 * 传 `gen.name` 会静默得到 `null`，这条坑在 ops.ts 里已经踩过一次。
 */
function mapStage(info: StageInfo, targetRaw: string, imagesRaw: string): MapStage | string {
  const g = groupOf(info)
  if (!g) return `认不出群记号「${info.raw}」`

  const targetText = (targetRaw ?? '').trim() || info.raw.trim()
  const tInfo = stageInfo(targetText)
  if (!tInfo.ok) return `靶群：${tInfo.error ?? `认不出群记号「${targetText}」`}`
  const h = groupOf(tInfo)
  if (!h) return `靶群「${targetText}」建不出群对象`

  const gens = getGeneratorElements(g)
  if (gens.length === 0) return `${info.sym} 没有生成元，无法由生成元的像定义映射`

  const images = (imagesRaw ?? '').trim()
  if (!images) {
    return `还没给生成元的像（形如 a\\to 2）。${info.sym} 的生成元是 ${gens
      .map((x) => x.gen.name)
      .join(', ')} ---- 每一对写成「生成元\\to 靶群里的元素」`
  }

  const genMapping = new Map<string, string>()
  const pairs: { gen: string; image: string }[] = []
  for (const raw of images.split(',')) {
    const text = raw.trim()
    if (!text) continue
    const parts = text.split(/\\to\s*|->|=>/)
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
      return `像对的写法不对：${text}（应形如 a\\to 2）`
    }
    const genName = parts[0].trim()
    const hit = gens.find((x) => x.gen.name === genName)
    if (!hit) {
      return `${info.sym} 里没有生成元 ${genName}（有：${gens.map((x) => x.gen.name).join(', ')}）`
    }
    const img = resolveElementLoose(h, parts[1].trim())
    if (!img) return `靶群 ${tInfo.sym} 里没有元素 ${parts[1].trim()}`
    genMapping.set(hit.el.id, img.id)
    pairs.push({ gen: genName, image: elemText(h, img) })
  }
  if (genMapping.size === 0) return '至少要给一个生成元的像'

  const full: HomomorphismMap | null = extendFromGenerators(g, h, genMapping)
  if (!full) return '这组像无法唯一延拓成映射（生成元之间的乘法关系没被保持）'
  const res = verifyHomomorphism(g, h, full)
  if (!res.isHomomorphism) return '这组像不是同态 ---- 换一组像，或换一个靶群'

  const props = getHomomorphismProperties(g, h, res)
  const ker = computeKernelFromMapping(g, full, h.identity.id)
  const im = computeImageFromMapping(full)

  return {
    g,
    h,
    hSym: tInfo.sym,
    images: pairs.map((p) => `${p.gen}\\to ${p.image}`).join(', '),
    kerOrder: ker.length,
    imOrder: im.length,
    quotient: g.order / Math.max(1, ker.length),
    isSurjective: !!props.isSurjective,
  }
}

/**
 * 面板「生成元的像」的建议值。
 *
 * 目标不是"随便给一个同态"，而是**画得出正方形、数学上不退化**的那一个：
 *   - 源是**循环群**（恰一个生成元 a）：在靶群里挑 y，要求 ⟨y⟩ **真落在靶群内部**
 *     （满了成三角形、平凡成一个点，都不是第一同构该看的东西），
 *     在合格的 y 里取**像最大**的那个（并列取元素表里靠前的）。C₆ → C₆ 于是得到 `a→2`。
 *   - 源不是循环群：core 的 `autoBuildMapping` 实测只在循环群之间给得出，
 *     给不出就返回空串 —— 面板据此提示用户手填，而不是塞一个跑不通的默认值。
 */
export function suggestImages(source: string, target: string): string {
  const sInfo = stageInfo(source)
  const tInfo = stageInfo(target.trim() || source)
  if (!sInfo.ok || !tInfo.ok) return ''
  const g = groupOf(sInfo)
  const h = groupOf(tInfo)
  if (!g || !h) return ''

  const gens = getGeneratorElements(g)
  if (gens.length === 0) return ''

  /* ── ① 循环源（恰一个生成元 a）：在靶群里挑一个「像真落在内部」的 y ── */
  if (gens.length === 1) {
    const genName = gens[0].gen.name
    /** a 的阶：a 的像 y 必须满足 y 的阶 | a 的阶，否则延拓不出同态 */
    const genOrder = closeUnderMultiply(g, [gens[0].el]).length

    let bestImage: GroupElement | null = null
    let bestSize = 0
    /** 满射（三角形）——"像真落在内部"的找不到时才用它兜底，总比不给建议强 */
    let surjective: GroupElement | null = null
    for (const y of h.elements) {
      const size = closeUnderMultiply(h, [y]).length
      if (size <= 1) continue
      if (genOrder % size !== 0) continue
      if (size >= h.order) {
        if (!surjective) surjective = y
        continue
      }
      if (size > bestSize) {
        bestSize = size
        bestImage = y
      }
    }
    const pick = bestImage ?? surjective
    if (pick) return `${genName}\\to ${elemText(h, pick)}`
  }

  /* ── ② 源与靶群是同一个群：给**恒等映射**（生成元 ↦ 它自己）──
   *
   * 核平凡 ⇒ 商群 `G/{e} ≅ G`，这是第一同构最平凡、但完全合法的一档（图是三角形）。
   * 有它垫底，"换一个群"之后卡片不会是红的；想看真东西的用户自己把像改掉。
   */
  if (g.symbol === h.symbol && g.order === h.order) {
    const pairs = gens.map((x) => ({ gen: x.gen.name, image: elemText(g, x.el) }))
    const mapping = new Map<string, string>()
    for (let i = 0; i < gens.length; i++) {
      const img = resolveElementLoose(h, pairs[i].image)
      if (!img) return ''
      mapping.set(gens[i].el.id, img.id)
    }
    const full = extendFromGenerators(g, h, mapping)
    if (full && verifyHomomorphism(g, h, full).isHomomorphism) {
      return pairs.map((p) => `${p.gen}\\to ${p.image}`).join(', ')
    }
  }

  return ''
}

/**
 * 第一同构定理（M3）。
 *
 * 这条的**交互**与别条不一样：用户只写三行（两个群 + 一条 φ），
 * 剩下两个顶点（`G/ker φ`、`im φ`）与三条边（π / ≅ / ↪）由
 * `build.ts` 的 `firstIsoObjects` + `derive.ts` 自动补出来 ——
 * 用户的原话就是**"当我们给出 phi 这条线后，剩下两条能立马生成。"**
 *
 * 因此模板**绝不产出** `K = ker(φ)` / `I = im(φ)` 这类定义行：
 * 一旦用户手上有 ker / im 对象，`firstIsoObjects` 就把整条故事线交还给他、
 * 不再自动补点 —— 那份"自动补全"的演示恰恰被自己写没了。
 * 核与像的阶只在**文本**里说，数字由 `mapStage` 真算。
 */
export const FIRST_ISO: ProofTemplate = {
  id: 'first-isomorphism',
  title: '第一同构定理 \\cdot G/ker \\varphi \\cong im \\varphi',
  theorem: 'G / \\ker \\varphi \\;\\cong\\; \\operatorname{im}\\varphi',
  blurb: '画出 \\varphi 这一条线，剩下两条由工具补出来',
  defaults: FIRST_ISO_DEFAULTS,
  groupChoices: PROOF_GROUP_CHOICES,
  slots: [
    { kind: 'group', key: 'target', label: '靶群 H' },
    { kind: 'gens', key: 'images', label: '生成元的像' },
  ],
  suggest: (group, _p, current) => {
    const target = (current.target ?? '').trim() || group
    return { target, images: suggestImages(group, target) }
  },

  build(group, _p, extra): ProofStep[] {
    const info = stageInfo(group ?? FIRST_ISO_DEFAULTS.group)
    if (!info.ok) return bail(info.error ?? '参数不合法')

    const st = mapStage(info, extra?.target ?? '', extra?.images ?? '')
    if (typeof st === 'string') return bail(st)
    const { imOrder, kerOrder, quotient, isSurjective, hSym } = st
    const sym = info.sym
    const order = info.order

    if (kerOrder >= order || imOrder <= 1) {
      return bail(
        `核 = G（像平凡）：这个映射把整个 ${sym} 都打到单位元上，商群平凡、图形退化成一条线。换一组像 ---- 让像真落在靶群里。`,
      )
    }

    const steps: ProofStep[] = [
      {
        kind: 'claim',
        text: `设 \\varphi : G \\to H 是一个群同态。取 G = ${sym}（|G| = ${order}），靶群待定。`,
        tex: `\\varphi : ${sym} \\longrightarrow H`,
        line: `G = ${info.raw.trim()}`,
        highlight: ['G'],
      },
      {
        kind: 'compute',
        text: `靶群 H = ${hSym}。`,
        tex: `H = ${hSym}`,
        line: `H = ${(extra?.target ?? '').trim() || info.raw.trim()}`,
        highlight: ['H'],
      },
      {
        kind: 'compute',
        text: `由生成元的像定出 \\varphi ：${st.images}（同态由生成元的像唯一决定）。`,
        tex: `\\varphi :\\; ${st.images.replace(/\\to /g, ' \\mapsto')}`,
        line: `${ISO_MAP_ID} = 映射(G, H, ${st.images})`,
        highlight: [ISO_MAP_ID],
      },
      {
        kind: 'claim',
        text: `核 ker \\varphi = {g \\in G : \\varphi (g) = e} 是 G 的正规子群，它的阶是 |ker \\varphi| = ${kerOrder}。`,
        tex: `\\ker\\varphi \\trianglelefteq G,\\qquad|\\ker\\varphi| = ${kerOrder}`,
      },
      {
        kind: 'claim',
        text: `像 im \\varphi = {\\varphi (g) : g \\in G} \\le H，它的阶是 |im \\varphi| = ${imOrder}${
          isSurjective ? '（\\varphi 是满射，im \\varphi = H ---- 靶群顶点已经在画布上了）' : ''
        }。`,
        tex: `\\operatorname{im}\\varphi \\le H,\\qquad|\\operatorname{im}\\varphi| = ${imOrder}`,
      },
      {
        kind: 'compute',
        text: `商群 G/ker \\varphi 有 |G|/|ker \\varphi| = ${order}/${kerOrder} = ${quotient} 个元素 ---- 工具自动补出这个顶点。`,
        tex: `|G/\\ker\\varphi| = ${quotient}`,
        highlight: [`${ISO_MAP_ID}/ker`],
      },
    ]

    if (!isSurjective) {
      steps.push({
        kind: 'compute',
        text: '\\varphi 不是满射，像真落在 H 内部，于是它也是一个独立顶点（补出来 ---- 不补的话右下角是空的）。',
        tex: `\\operatorname{im}\\varphi \\subset neq ${hSym}`,
        highlight: [`${ISO_MAP_ID}/im`],
      })
    }

    steps.push(
      {
        kind: 'claim',
        text: '定义 \\Phi : G/ker \\varphi \\to im \\varphi ，gKer \\varphi \\mapsto \\varphi (g)。良定义：gKer = hKer \\iff h^-^1g \\in ker \\varphi \\implies \\varphi (g) = \\varphi (h)。',
        tex: '\\Phi(g\\ker\\varphi) = \\varphi(g)',
      },
      {
        kind: 'claim',
        text: '\\Phi 单射：\\Phi (gKer) = e \\implies \\varphi (g) = e \\implies g \\in ker \\varphi \\implies gKer = ker \\varphi （只有一个陪集打到单位元）。',
        tex: '\\Phi(g\\ker\\varphi) = e \\;\\Longrightarrow\\; g\\ker\\varphi = \\ker\\varphi',
      },
      {
        kind: 'claim',
        text: '\\Phi 满射：任取 y \\in im \\varphi ，有 y = \\varphi (g)，于是 y = \\Phi (gKer \\varphi)。',
        tex: '\\forall y \\in \\operatorname{im}\\varphi\\;\\; \\exists g : y = \\Phi(g\\ker\\varphi)',
      },
      {
        kind: 'conclude',
        text: `\\Phi 既单又满，是同构：G/ker \\varphi \\cong im \\varphi。核对阶：|G/ker \\varphi| = ${quotient} = |im \\varphi| = ${imOrder} v \\blacksquare`,
        tex: `G/\\ker\\varphi \\;\\cong\\; \\operatorname{im}\\varphi \\qquad (${quotient} = ${imOrder}) \\;\\qed`,
        highlight: [`${ISO_MAP_ID}/im`],
      },
    )

    return steps
  },
}

/** 全部模板（M1/M2 的 Sylow 三条 + M3 的轨道–稳定子、第一同构）。 */
export const PROOF_TEMPLATES: ProofTemplate[] = [
  SYLOW_I,
  SYLOW_II,
  SYLOW_III,
  ORBIT_STABILIZER,
  FIRST_ISO,
]

/**
 * 运行头显示的「实例」串（面板与断言共用一份，免得两处各拼一遍）。
 *
 * 结构跟着 `slots` 走：Sylow 系列是 `A₄ · p = 3`，轨道–稳定子是 `S₄ · x = (123)`，
 * 第一同构是 `C₆ · H = C₆ · a→2`（像对本身已经自带 `→`，就不再套一层"生成元的像 ="）。
 */
export function instanceLabel(
  t: ProofTemplate,
  params: ProofParams,
  extra?: Record<string, string>,
): string {
  const parts: string[] = [params.group]
  if (params.p !== undefined && t.slots.some((s) => s.kind === 'prime')) {
    parts.push(`p = ${params.p}`)
  }
  for (const s of t.slots) {
    if (s.kind === 'prime') continue
    const v = (extra?.[s.key] ?? '').trim()
    if (!v) continue
    parts.push(s.kind === 'gens' ? v : `${s.kind === 'group' ? 'H' : s.key} = ${v}`)
  }
  /**
   * 分隔符用**中文逗号**。
   *
   * 这里原本是 `·`（一个列表分隔点）。2026-09-27 的批量替换把它换成了 `\cdot` ——
   * 那个记号在数学里的意思是"乘法"，当列表分隔用是**语义错位**；而且
   * `.proof-instance` 是纯文本容器，用户会直接读到一串 `\cdot` 字面量。
   * 中文逗号在中文句子里读得通，也不违反"只用键盘打得出的字符"。
   */
  return parts.join('，')
}

/**
 * 某个模板在某组参数下**能不能跑**——面板的「开始」按钮与模板的 `build()`
 * 共用同一份判据，所以按钮亮着就一定能跑。
 *
 * 判据用的材料与 `build()` 是**同一批纯函数**（`conjStage` / `mapStage`）：
 * 两处各写一遍逻辑迟早会分叉，那里再点出一个"按钮亮着却跑不动"的卡就没人信了。
 *
 * 只拦"结构性跑不了"的情形（记号认不出 / p 不整除 |G| / n_p = 1 撑不起 Sylow III /
 * 点不在 Ω 里 / 像对写不成同态）；生成元超过 3 个这类要看具体群的，交给
 * `build()` 的 `bail`——面板会显示理由。
 */
export function templateReady(
  t: ProofTemplate,
  group: string,
  p: number,
  extra?: Record<string, string>,
): string | null {
  const info = stageInfo(group)
  if (!info.ok) return info.error ?? '参数不合法'

  // 只有声明了 p 槽的模板才查 p（轨道–稳定子、第一同构都没有 p 可言）
  if (t.slots.some((s) => s.kind === 'prime')) {
    const bad = checkParams(info, p)
    if (bad) return bad
    if (t.id === 'sylow-3-congruence' && info.counts[p] < 2) {
      return `${nUni(p)} = 1：只有唯一一个 Sylow ${p}-子群，Sylow III 的「其余轨道」不存在。换一个 p（或换一个群）。`
    }
  }

  if (t.id === 'orbit-stabilizer') {
    const st = conjStage(info, extra?.x ?? '')
    return typeof st === 'string' ? st : null
  }

  if (t.id === 'first-isomorphism') {
    const st = mapStage(info, extra?.target ?? '', extra?.images ?? '')
    if (typeof st === 'string') return st
    if (st.kerOrder >= st.g.order || st.imOrder <= 1) {
      return `核 = G（像平凡）：这个映射把整个 ${info.sym} 都打到单位元上，商群平凡、图形退化。换一组像。`
    }
    return null
  }

  return null
}
