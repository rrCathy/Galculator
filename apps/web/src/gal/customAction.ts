/**
 * 自定义作用（U52）—— 用户**手给**一个同态 `G -> S_Ω`。
 *
 * ── 为什么它是一等需求（2026-10-02，用户原话「自定义群作用呢？」）────
 * 四个内置作用（共轭 / 左正则 / 陪集 / 共轭在子群集）早就接线了，而
 * `ActionKind` 里的 **`custom` 一直是个空槽**：`value.ts` 里有标签、有分支，
 * 全项目**零个生产者**（`grep` 得到 0）。
 *
 * 代数上，一个作用**就是**一个同态 `φ : G -> S_Ω`，而 `S_Ω` 的元素本身就是
 * Ω 上的置换。所以"定义作用"= "给每个生成元挑一个置换" —— 与「映射」是同一件事，
 * 只是靶群不必真建出来（`n` 一点，`S_n` 就在那儿）。
 *
 * ## core 的零件（`.tmp-u52/` 探针真跑，2026-10-02）
 *
 * | 零件 | 实测结论 |
 * |---|---|
 * | `extendAndVerifyPerms(G, map, n)` | 生成元像 → 全元素像（BFS 传播，**传播时的一致性检查就是同态判据**）|
 * | Map 的 key | **`generator.symbol`**（`S_4` 是 `\sigma_{12}`、`C_4` 是 `1`、`D_4` 是 `r`）；传元素 id 或 `gen.name` **一律 THROW** |
 * | 置换的下标 | Map 里的置换是 **0 起**；`parseCycleNotation` 给的是 **1 起**（换手要 `-1`）|
 * | 少给一个生成元的像 | **直接 THROW TypeError**（不是 `ok:false`）⇒ 应用层必须自己守门 |
 * | 传越界下标 | 老实回 `ok:false` + `violation{g,a,x}`（不静默算错）|
 * | 非忠实作用 | 照算 —— 核非平凡是合法的作用，忠实与否是**要披露的事实**，不是错误 |
 *
 * ## Ω 从哪来（U53 补齐）
 *
 * U52 时 Ω 只能是内核硬造的 `{1..n}`（第二个参数是个数字），于是
 * 「让 G 作用在**你自己的**集合上」表达不出来。U53 起第二参收 **`int | 集合`**：
 *
 * | 写法 | Ω |
 * |---|---|
 * | `customAction(C_4, 4, a -> (1 2 3 4))` | 4 个抽象点，点号 `1..4`（`group: null`）|
 * | `customAction(S_4, pointSet(5), s12 -> (1 2))` | 同上，点数由点集给 |
 * | `customAction(S_4, labeledSet(a, b, c), s12 -> (a b))` | 标号由点集给，**记号里就用标号写** |
 * | `customAction(S_4, asSet(Syl(S_4, 3)), s12 -> (1 2 3 4))` | 现成的集合：标号是子群记号（写不进循环记号）⇒ 数字按**位置**读 |
 *
 * 点记号 → 位置号的解析在 `pointSet.ts#labelCycleToNumeric`（**标签优先、位置兜底**），
 * 语法仍然由 core 的 `parseCycleNotation` 负责 —— 不另写一份循环记号解析器。
 *
 * ## 三条纪律
 *
 * ① **不许静默补**。core 的 `buildActionComputation(G, {kind:'custom', setSize:n})`
 *    在**不给 arrows** 时静默返回**平凡作用**（`isHomomorphism:true` + n 个单点轨道），
 *    这正是"用户到底填了没有"必须自己数的原因。这里每个生成元都必须有像，
 *    缺一个就报「还有 k 个生成元没填」。
 * ② **忠实性必须披露**。`C_4 -> S_4` 把 `a` 映成 `(12)(34)` 是合法作用，
 *    但核是 `⟨a²⟩` —— 用户不该自己去猜这件事。`faithful` / `kernelIds` 一并交出来，
 *    由信息面板与结论层说给用户听。
 * ③ **预算在调用前守**。`extendAndVerifyPerms` 的成本是 `|G| x 生成元数 x n`，
 *    实测 `S_7`（5040）97ms、`C_5000`（n=2）2ms、`S_6`（720）5.5ms。
 *    超线一律 `blocked`，说清卡在哪一段。
 */
import {
  computeOrbits,
  extendAndVerifyPerms,
  elementOrder,
  getGeneratorElements,
  identityPermutation,
  parseCycleNotation,
  type Generator,
  type Group,
  type GroupElement,
} from '@groupviz/core'
// 记号 → 纯文本面可用的形态：报错语会进状态行与信息面板，别把 `C_{4}` 原样贴出去
import { prettySymbol } from './pretty'
import {
  POINT_SET_MAX,
  labelCycleToNumeric,
  labelsHint,
  planCountPointSet,
} from './pointSet'
import type { GalAction, GalSet, GalValue } from './value'

/** 记号 → 纯文本面形态。本模块所有给用户看的群名都走它。 */
const nm = (g: Group): string => prettySymbol(g.symbol)

// ── 预算 ───────────────────────────────────────────────────────────

/**
 * Ω 的点数上限 —— **与 `pointSet.ts` 的 `POINT_SET_MAX` 是同一个数**
 * （手写循环记号的边界，不是算力的边界）。
 *
 * U53 起这个数归 `pointSet.ts` 所有（`pointSet(n)` 与这里共用一个上限），
 * 这里只是沿用原来的名字，免得下游（`ActionBuilder` / 回归套件）改引用。
 */
export const CUSTOM_ACTION_POINT_CAP = POINT_SET_MAX

/**
 * `|G| x n` 上限（置换表的总格子数）—— 真正决定成本的那一项。
 *
 * 实测锚点：`S_7` 自然作用（5040 x 7 = 35280）**97ms**、`S_6`（720 x 6 = 4320）5.5ms。
 * 取 100000（约 300ms）留一倍余量：既放得过 `S_7` 这类真有人会算的，
 * 又挡得住 `S_8`（40320 x 8 = 322560，先别把浏览器点死）。
 */
export const CUSTOM_ACTION_CELL_CAP = 100_000

/**
 * 恒等的写法 —— **`e`，留空不算**。
 *
 * core 的 `parseCycleNotation` 没有恒等的写法：`()` / `(1)` / `1` / `e` 全回 `null`
 * （它只认"长度 ≥ 2 的循环"，纯不动点被当成空置换 → 返回 null，见实现 index.js:45005）。
 * 所以恒等由**本层**认这一个记号。
 *
 * 「留空 = 没填」而不是「留空 = 恒等」：静默补一个恒等下去，
 * 用户会得到一个"看起来成功了、其实什么都没作用"的平凡作用（核 = G），
 * 而且**看不出自己没填**。报错说清"还有 k 个生成元没给像"更好；
 * 想要平凡作用就照编辑器那个「平凡作用」按钮，它会把 `e` **写进输入框**给人看见。
 */
export const IDENTITY_TOKEN = 'e'

// ── 生成元记号 ─────────────────────────────────────────────────────

/** 一个生成元的定位（name 是给用户看的，symbol 是给 core 当 key 的）。 */
export interface ResolvedGenerator {
  gen: Generator
  el: GroupElement
  /** core 的 `gen.name`（`a` / `r` / `s12`）—— 报错语与定义行都用它 */
  name: string
}

/**
 * 生成元记号 → 生成元。三种写法都认（core 的 `gen.name`、生成元**元素**的
 * `label` 与 `id`），循环群再兜一层单字母（core 叫 `a`，课本写 `r`）。
 *
 * **判据必须只有一份**：`ops.ts` 的 `generatorOf`（`映射` 那条路）委托到这里，
 * 于是"编辑器填的"与"手打的"对同一串记号永远给同一个答案。
 */
export function resolveGenerator(group: Group, text: string): ResolvedGenerator | null {
  const t = text.trim()
  if (!t) return null
  const gens = getGeneratorElements(group)
  const hit = gens.find((g) => g.gen.name === t || g.el.label === t || g.el.id === t)
  if (hit) return { gen: hit.gen, el: hit.el, name: hit.gen.name }
  // 循环群的两种通行写法：core 叫 `a`，课本写 `r`（或反之）—— 只有一个生成元时无歧义
  if (gens.length === 1 && /^[A-Za-z]$/.test(t)) {
    return { gen: gens[0].gen, el: gens[0].el, name: gens[0].gen.name }
  }
  return null
}

/**
 * 这个群的生成元在 core 里**能不能被分别指认**。
 *
 * ⚠️ **直积群不能**（2026-10-02 实测，探针 `.tmp-u52/probe7.mjs`）：
 *
 * | 群 | `gen.name` | `gen.symbol` | `el.id` |
 * |---|---|---|---|
 * | `C_2^2` | `a`, `a` | `1`, `1` | `e1\|e0`, `e0\|e1` |
 * | `C_2^3` | `a`, `a`, `a` | `1`, `1`, `1` | `e1\|e0\|e0`, … |
 * | `S_3` | `s12`, `s23` | `\sigma_{12}`, `\sigma_{23}` | `2,1,3`, `1,3,2` |
 *
 * 而 core 的 `extendAndVerifyPerms` 取像是 `generators[i].symbol` 当 key ——
 * 三个生成元共用 `"1"` ⇒ **它们只能拿到同一个像**（实测：给一个像，`distinct` = 2
 * 而 `|G|` = 8）。也就是说"给每个生成元分别指定像"这件事在这些群上**根本表达不出来**。
 *
 * 于是这里不假装能做：两条路（文本 / 编辑器）都先过这个判据，
 * 判完就报"分不开"，并指向内置作用。**另注**：`ui/MapBuilder.tsx` 的
 * `images` 也是按 `gen.name` 存的，`C_2^3` 上同样撞（老账，见 ROADMAP）。
 */
export function generatorsDistinct(group: Group): boolean {
  const gens = getGeneratorElements(group)
  const names = new Set(gens.map((g) => g.gen.name))
  const syms = new Set(gens.map((g) => g.gen.symbol))
  return names.size === gens.length && syms.size === gens.length
}

/** 「生成元分不开」时的说明（内核与编辑器共用，措辞只有一份）。 */
export function generatorCollisionReason(group: Group): string {
  const gens = getGeneratorElements(group)
  const names = [...new Set(gens.map((g) => g.gen.name))].join('、')
  const syms = [...new Set(gens.map((g) => g.gen.symbol))].join('、')
  return `${prettySymbol(group.symbol)} 的 ${gens.length} 个生成元在 core 里只有 ${names} 这几个名字（记号是 ${syms}），分不开`
}

// ── 置换小工具（都作用在 0..n-1 上）────────────────────────────────

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b]
  return a
}

/** 置换的阶 = 各轮换长度的最小公倍数。 */
export function permOrder(p: readonly number[]): number {
  const seen = new Array<boolean>(p.length).fill(false)
  let order = 1
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue
    let len = 0
    let j = i
    while (!seen[j]) {
      seen[j] = true
      j = p[j]
      len++
    }
    order = (order / gcd(order, len)) * len
  }
  return order
}

function isIdentityPerm(p: readonly number[] | undefined): boolean {
  if (!p) return false
  for (let i = 0; i < p.length; i++) if (p[i] !== i) return false
  return true
}

/**
 * 作用的**核**：映成恒等置换的那些元素（元素 id）。
 *
 * 判据与作用的 `kind` **无关** —— 第一同构定理对四个内置作用一样成立：
 *   · 共轭作用 → 核就是 **Z(G)**（中心，`g` 与所有元素交换）
 *   · 左正则作用 → 核 = `{e}`（这就是 **Cayley 定理**：G 嵌入 S_G）
 *   · 陪集作用 → 核 = `H` 在 G 里的**核**（`\\bigcap gHg^-^1`）
 *   · 自定义作用 → 用户自己给的那个
 * 所以放在这里一处算、三处用（op 的披露 / 信息面板的一行 / 结论层的一条）。
 */
export function actionKernel(A: GalAction): string[] {
  return A.group.elements.filter((e) => isIdentityPerm(A.perms.get(e.id))).map((e) => e.id)
}

// ── 输入与结果 ─────────────────────────────────────────────────────

/** 编辑器 / 文本两边共用的最小输入：一个生成元 + 它的像。 */
export interface GenImageDraft {
  /** 生成元记号（`a` / `r` / `s12` / 元素 label 都行，见 `resolveGenerator`） */
  genText: string
  /** 像的循环记号原文（`(1 2 3 4)` / `(12)(34)`）；空串或 `e` = 恒等 */
  cycle: string
}

/**
 * Ω 的两种给法（U53）。
 *
 * 从前只有 `count` —— 也就是"Ω 只能是内核硬造的 `{1..n}`"，于是
 * "让 G 作用在**你自己的**集合上"表达不出来（`customAction(S_4, asSet(Syl(S_4,3)), …)`
 * 报「作用点集的基数 n 必须是正整数」）。现在多一条：直接给一个集合对象。
 *
 * 纯 `number` 也被接受（= `count`）—— 那是 U52 的写法，契约不改。
 */
export type OmegaSpec =
  | { kind: 'count'; n: number }
  /** 一个现成的集合（`pointSet(5)` / `labeledSet(a,b,c)` / `asSet(Syl_p(G))` …） */
  | { kind: 'set'; set: GalSet; ref?: string }

export interface CustomActionPlanOk {
  ok: true
  action: GalAction
  /** 忠实（核只有单位元） */
  faithful: boolean
  /** 核的元素 id（按 G 的元素次序） —— 披露用 */
  kernelIds: string[]
  /** 轨道大小（降序）—— 结论层与编辑器实时反馈共用 */
  orbitSizes: number[]
  /** 逐生成元的像（编辑器回显 / 结果说明用） */
  images: { genText: string; cycle: string; order: number }[]
  /** Ω 的点标号（编辑器状态行与结论层要说清"作用在哪些点上"） */
  labels: string[]
}

export interface CustomActionPlanBlocked {
  ok: false
  error: string
  hint?: string
  /**
   * 出错的那个生成元（core 的 `gen.name`）—— 编辑器据此把**那一栏**标红。
   *
   * 结构化地给出，不让调用方去 `error.includes(名字)`：生成元名可能是 `a` 这种
   * 单字母，在中文里到处都能撞上，"字符串里出现过"根本不是判据。
   */
  genName?: string
}

export type CustomActionPlan = CustomActionPlanOk | CustomActionPlanBlocked

/**
 * 一个**值**能不能当 Ω；能就给出 `OmegaSpec`。
 *
 * **op 与作用编辑器共用这一条判据**（U53）：手打的 `customAction(G, asSet(Syl_p(G)), …)`
 * 与编辑器里填 `asSet(Syl_p(G))` 必须对同一个东西给出同一个答案。
 * 两处各写一份筛选，迟早出现"编辑器收而 op 不收"那种最难查的错。
 *
 * 收三种：
 *   · `set` —— `pointSet(5)` / `labeledSet(a,b,c)` / `asSet(Syl_p(G))` 的产物
 *   · `elements` —— 元素集（`Z(S_4)` / `orbits(A,1)`）
 *   · `group` —— 群本身（当"它的底集"读，与 `共轭作用在` 的 Ω 同理）
 */
export function omegaSpecOfValue(v: GalValue, name: string, ref?: string): OmegaSpec | null {
  if (v.type === 'set') return { kind: 'set', set: { ...v.set, from: ref }, ref }
  if (v.type === 'elements') {
    return {
      kind: 'set',
      set: {
        group: v.group,
        label: `asSet(${name})`,
        members: v.elements.map((e) => ({ label: e.label })),
        from: ref,
      },
      ref,
    }
  }
  if (v.type === 'group') {
    return {
      kind: 'set',
      set: {
        group: v.group,
        label: `asSet(${name})`,
        members: v.group.elements.map((e) => ({ label: e.label })),
        from: ref,
      },
      ref,
    }
  }
  return null
}

/**
 * Ω 定下来：点数、点标号、以及那个 `GalSet` 本体。
 *
 * `count` 那一支的 `group` 是 **`null`**（U53）：一批抽象点不属于任何群。
 * 别退化成"取 `C_1` 当母群" —— 见 `value.ts` 的 `GalSet.group` 注释。
 */
function omegaOf(
  spec: OmegaSpec,
): { n: number; labels: string[]; omega: GalSet } | { error: string; hint?: string } {
  if (spec.kind === 'set') {
    const labels = spec.set.members.map((m) => m.label)
    if (labels.length === 0) {
      return { error: `${spec.set.label} 是空集，给不出作用的点`, hint: '点集至少要有一个点' }
    }
    return { n: labels.length, labels, omega: spec.set }
  }
  const plan = planCountPointSet(spec.n)
  if (!plan.ok) return { error: plan.error, hint: plan.hint }
  return { n: spec.n, labels: plan.labels, omega: plan.set }
}

/**
 * 分诊（内核）：`G` + Ω（点数**或**一个集合对象）+ 各生成元的像 →
 * 一个 `GalAction`，或者一条说清卡在哪的报错。
 *
 * 编辑器与 op **共用这一个函数**（同一条求值路径），所以"边填边看到的"
 * 与"确认后算出来的"不可能不一致。
 */
export function planCustomAction(
  G: Group,
  omega: number | OmegaSpec,
  drafts: GenImageDraft[],
): CustomActionPlan {
  const spec: OmegaSpec = typeof omega === 'number' ? { kind: 'count', n: omega } : omega
  /*
   * 点数那一支的校验**不在这里另写一份** —— 交给 `pointSet.ts#planCountPointSet`
   * （`pointSet(n)` 与这里共用同一个上限、同一批报错语）。
   * 下面那道 `n > CUSTOM_ACTION_POINT_CAP` 是给**集合**那一支留的：
   * `asSet(C_1000)` 这种现成集合的点数由集合自己决定，不走 `pointSet(n)`。
   */
  const om = omegaOf(spec)
  if ('error' in om) return { ok: false, error: om.error, hint: om.hint }
  const { n, labels, omega: omegaSet } = om

  if (n > CUSTOM_ACTION_POINT_CAP) {
    return {
      ok: false,
      error: `点集有 ${n} 个点，超过上限 ${CUSTOM_ACTION_POINT_CAP}`,
      hint: '循环记号要一个个点敲，点多了多半是 n 打错了',
    }
  }
  const cells = G.order * n
  if (cells > CUSTOM_ACTION_CELL_CAP) {
    return {
      ok: false,
      error: `本地算不了：|G| x n = ${G.order} x ${n} = ${cells}，超过上限 ${CUSTOM_ACTION_CELL_CAP}`,
      hint: `${nm(G)} 上每个元素都要配一个置换，表太大`,
    }
  }

  const gens = getGeneratorElements(G)
  if (gens.length === 0) {
    return {
      ok: false,
      error: `${nm(G)} 没有生成元，给不出作用的像`,
      hint: '「已知群」只有符号与阶（来自结论表），本地没有生成元表',
    }
  }
  // 直积群的生成元在 core 里重名重号 ⇒ "分别指定像"这件事表达不出来（见 `generatorsDistinct`）
  if (!generatorsDistinct(G)) {
    return {
      ok: false,
      error: `${generatorCollisionReason(G)}，给不了它们不同的像`,
      hint: '想让 G 作用在自己身上用 leftAction，其余三种内置作用也各有现成的路',
    }
  }

  // ── ① 每个生成元都要有像（core 少一个就 THROW，不能靠它兜）──
  const missing: string[] = []
  const perms = new Map<string, number[]>()
  const images: { genText: string; cycle: string; order: number }[] = []

  for (const g of gens) {
    const draft = drafts.find((d) => resolveGenerator(G, d.genText)?.gen.symbol === g.gen.symbol)
    const cycle = draft?.cycle.trim() ?? ''
    // 没有这一项、或者像那一栏是空的 —— 都算"没填"（留空**不**当恒等，见 `IDENTITY_TOKEN`）
    if (!draft || cycle === '') {
      missing.push(g.gen.name)
      continue
    }

    // ── ② 像必须是 Ω 上的置换（或 `e`）──
    //
    // 记号里的"点"先按 Ω 的标号翻成位置号（U53，`labelCycleToNumeric`），
    // 语法仍然交给 core 的 `parseCycleNotation` —— 不另写一份解析器。
    let perm: number[]
    if (cycle === IDENTITY_TOKEN) {
      perm = identityPermutation(n)
    } else {
      const rewritten = labelCycleToNumeric(labels, cycle)
      if (!rewritten.ok) {
        return {
          ok: false,
          genName: g.gen.name,
          error: `生成元 ${g.gen.name} 的像「${cycle}」里的 ${rewritten.token} 不是点集里的点`,
          hint: `${labelsHint(labels)}；恒等写 ${IDENTITY_TOKEN}`,
        }
      }
      const oneBased = parseCycleNotation(rewritten.numeric, n)
      if (!oneBased) {
        return {
          ok: false,
          genName: g.gen.name,
          // 措辞「不是 N 点上的循环记号」是**契约**（`verify/suites/u52.ts` 按它断言）；
          // U53 只把点集的名字补进了 hint（点集有标号时 hint 会列出它们）。
          error: `生成元 ${g.gen.name} 的像「${cycle}」不是 ${n} 点上的循环记号`,
          hint:
            n >= 2
              ? `写法如 (1 2 3 4) 或 (12)(34)；每个点在一段里只能出现一次；恒等写 ${IDENTITY_TOKEN}`
              : `点集只有 1 个点，像只能是恒等 ${IDENTITY_TOKEN}`,
        }
      }
      perm = oneBased.map((x) => x - 1)
    }

    // ── ③ 像的阶必须整除生成元的阶（必要条件，先挡一道好说的）──
    const genOrder = elementOrder(G, g.el)
    const imgOrder = permOrder(perm)
    if (genOrder % imgOrder !== 0) {
      return {
        ok: false,
        genName: g.gen.name,
        error: `${g.gen.name} 在 ${nm(G)} 里的阶是 ${genOrder}，而它的像的阶是 ${imgOrder}`,
        hint: `${imgOrder} 不整除 ${genOrder}，像的阶必须整除生成元的阶，这组像不可能是同态`,
      }
    }

    perms.set(g.gen.symbol, perm)
    images.push({ genText: g.gen.name, cycle, order: imgOrder })
  }

  if (missing.length > 0) {
    return {
      ok: false,
      error: `还有 ${missing.length} 个生成元没给像：${missing.join('、')}`,
      hint: `每个生成元都要写一条「生成元 -> 像」，恒等写 ${IDENTITY_TOKEN}`,
    }
  }

  // ── ④ 传播 + 同态校验（core 的 BFS 一致性检查）──
  const spread = extendAndVerifyPerms(G, perms, n)
  if (!spread.ok) {
    const v = spread.violation
    const gLabel = v ? (G.elements.find((e) => e.id === v.g)?.label ?? v.g) : null
    // `v.a` 是生成元的 **symbol**（`\sigma_{12}` 这种 LaTeX 原串），
    // 报错语是纯文本面 —— 翻回 `gen.name`（ASCII）再贴出去。
    const aName = v ? (gens.find((g) => g.gen.symbol === v.a)?.gen.name ?? v.a) : null
    return {
      ok: false,
      error: '这组像不构成同态',
      hint: v
        ? `${nm(G)} 里 ${gLabel} 沿生成元 ${aName} 走一步的像，与它已经定好的像在第 ${v.x + 1} 个点上对不上`
        : undefined,
    }
  }

  // ── ⑤ 忠实性（核）—— 披露，不是错误 ──
  const action: GalAction = {
    group: G,
    kind: 'custom',
    n,
    perms: spread.perms,
    setLabels: labels,
    omega: omegaSet,
    // Ω 是**独立对象**（不是 G 自身）：作用线从 G 指向 Ω 那个节点。
    // 集合是用户给的（画布上已有）时带上 `from` ⇒ `derive` 直接连到那个节点，
    // 而不是凭空再造一个（`derive.ts#setNodeId` 也兜一层）。
    omegaBase: 'object',
  }
  if (spec.kind === 'set' && spec.ref) action.omega = { ...omegaSet, from: spec.ref }
  // 核走**共用判据**（`actionKernel` —— 信息面板与结论层用的是同一个）
  const kernelIds = actionKernel(action)
  /*
   * 忠实 ⟺ φ 单射 ⟺ **像的个数 = |G|**（且每个元素都有像）。
   *
   * 不用 `|ker| = 1` 当判据：那要额外假设"生成元确实生成整个 G"。
   * 数不同的置换值不需要任何假设 —— BFS 漏了谁，`distinct` 立刻少一个。
   * 两者在正常情况下必然一致（第一同构定理），不一致时这条更保守。
   */
  const distinct = new Set([...spread.perms.values()].map((p) => p.join(','))).size
  const faithful = spread.perms.size === G.order && distinct === G.order
  const { orbits } = computeOrbits(spread.perms, n)
  const orbitSizes = orbits.map((o) => o.elements.length).sort((a, b) => b - a)

  return {
    ok: true,
    action,
    faithful,
    kernelIds,
    orbitSizes,
    images,
    labels,
  }
}
