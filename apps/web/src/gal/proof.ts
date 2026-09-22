import {
  binomialMod,
  closeUnderMultiply,
  computeCosetActionPerms,
  computeOrbits,
  computeStabilizers,
  conjugateSubgroup,
  createGroupFromSymbol,
  factorizeOrder,
  findSylowSubgroups,
  parseGroupNotation,
  subgroupSetKey,
  type Group,
  type GroupElement,
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

/** 模板绑定的**默认实例**（面板预填；用户可改）。 */
export interface ProofParams {
  group: string
  p: number
}

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
  /**
   * 把"模板 × 具体群 × 素数"实例化成步骤序列。
   * 不传参数就用 `defaults`（于是 `SYLOW_I.build()` 仍是 A₄ / p = 2）。
   */
  build(group?: string, p?: number): ProofStep[]
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
      .join('·'),
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
const PK = 'pᵏ'
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
 * 这条是整个 U15 的地基：模板把生成元**写成文本**塞进定义行
 *（`P = 闭包(G, …)`），文本一旦解不开，后面整条链就断在求值器里——
 * 而且断得很晚（tsc 与"数字都对"都拦不住）。
 */
function genText(g: Group, e: GroupElement): string {
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
  return gens.map((e) => genText(g, e))
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
  const notation = parseGroupNotation(info.raw.trim())
  const g = notation.symbol ? createGroupFromSymbol(notation.symbol) : null
  if (!g) return `认不出群记号「${info.raw}」`

  const f = info.factors.find((x) => x.prime === p)
  if (!f) return `p = ${p} 不整除 |G|`
  const pk = p ** f.exponent

  const syl = findSylowSubgroups(g, p)
  if (syl.length === 0) return `Syl_${p}(${info.sym}) 是空的（不该发生）`
  const points = syl.map((s) => s.elements)

  const genTexts = gensOfSubgroup(g, points[0])
  if (!genTexts) {
    return `Syl_${p}(${info.sym}) 里的子群需要多于 3 个生成元，模板的「闭包(G, g₁, g₂, g₃)」写法接不下`
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

/* ── Sylow I（Wielandt）─────────────────────────────────── */

const SYLOW_I_DEFAULTS: ProofParams = { group: 'A_4', p: 2 }

/**
 * 证明的骨架与群无关，只有数字随 (G, p) 变——所以整条骨架只写一遍，
 * 里面每个具体数字都由 `build()` 当场算出来。
 */
export const SYLOW_I: ProofTemplate = {
  id: 'sylow-1-wielandt',
  title: 'Sylow I · 存在性（Wielandt 计数证明）',
  theorem: 'p^k \\mid |G| \\;\\Longrightarrow\\; \\exists H \\le G,\\ |H| = p^k',
  blurb: '不搜索、不枚举：只数一个模 p 不为 0 的集合',
  defaults: SYLOW_I_DEFAULTS,
  groupChoices: PROOF_GROUP_CHOICES,

  build(group?: string, p?: number): ProofStep[] {
    const info = stageInfo(group ?? SYLOW_I_DEFAULTS.group)
    const pp = p ?? SYLOW_I_DEFAULTS.p
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
        text: `设 G = ${sym}，|G| = ${PK}·m 且 p ∤ m。目标：在 G 里找出一阶为 ${PK} 的子群。`,
        tex: `|G| = p^{k} m, \\qquad p \\nmid m`,
        // claim 步也允许带 `line` —— 建群是"设 G 为……"的具象化，本来就属于这一步
        line: `G = ${info.raw.trim()}`,
        highlight: ['G'],
      },
      {
        kind: 'compute',
        text: `${sym} 的阶是 ${order} = ${info.orderUni} ⇒ p = ${pp}，k = ${k}，${PK} = ${pk}，m = ${m}`,
        tex: `|${sym}| = ${order} = ${info.orderTex}`,
        line: `n = 分解(${order})`,
      },
      {
        kind: 'claim',
        text: `构造 X = { A ⊆ G : |A| = ${PK} }（全体 ${PK} 元子集）。下面只数它的大小——不枚举。`,
        tex: `X = \\{\\, A \\subseteq G : |A| = p^k \\,\\},\\qquad |X| = \\binom{${order}}{${pk}}`,
      },
      {
        kind: 'compute',
        text:
          binomShown !== null
            ? `|X| = C(${order}, ${pk}) = ${binomShown}，而 ${binomShown} mod ${pp} = ${mod} ≠ 0 ⇒ p ∤ |X|`
            : `|X| = C(${order}, ${pk}) 是个 ${binomText.length} 位数（太大），只算余数：mod ${pp} = ${mod} ≠ 0 ⇒ p ∤ |X|`,
        tex:
          binomShown !== null
            ? `\\binom{${order}}{${pk}} = ${binomShown} \\equiv ${mod} \\pmod{${pp}}`
            : `\\binom{${order}}{${pk}} \\equiv ${mod} \\pmod{${pp}}`,
        line: `c = Cmod(${order}, ${pk}, ${pp})`,
      },
      {
        kind: 'claim',
        text: `G 左乘作用在 X 上。若每个轨道大小都被 p 整除，则 p | |X| —— 与上一步矛盾。所以存在轨道 O 使 p ∤ |O|。`,
        tex: `p \\nmid |X| \\;\\Longrightarrow\\; \\exists\\, O :\\; p \\nmid |O|`,
      },
      {
        kind: 'compute',
        text: `取一个具体的 ${PK} 元子集作实例：P = ⟨${gensLine}⟩（它就是 ${sym} 的 ${pk} 阶子群）`,
        tex: `P = \\langle ${gensTex} \\rangle,\\qquad |P| = ${pk} = p^k`,
        line: `P = 闭包(G, ${gensLine})`,
        highlight: ['P'],
      },
      {
        kind: 'compute',
        text: `G 左乘作用在 P 的左陪集上：共 [G : P] = ${coset.n} 个点`,
        tex: `G \\curvearrowright G/P,\\qquad |G/P| = [G:P] = ${coset.n}`,
        line: `A = 陪集作用(G, P)`,
        highlight: ['A'],
      },
      {
        kind: 'compute',
        text: `左乘作用在陪集上是传递的：轨道就是整个 Ω，|O| = ${orbitSize}；${pp} ∤ ${orbitSize} ✓`,
        tex: `|O(P)| = ${orbitSize},\\qquad ${pp} \\nmid ${orbitSize}`,
        line: `O = 轨道(A, 1)`,
        highlight: ['O'],
      },
      {
        kind: 'compute',
        text: `稳定子 Stab(P) = P（左乘作用下 gP = P ⟺ g ∈ P），|Stab| = ${stabSize}`,
        tex: `\\operatorname{Stab}_{G}(P) = P,\\qquad |{\\operatorname{Stab}}| = ${stabSize}`,
        line: `S = 稳定子(A, 1)`,
        highlight: ['S'],
      },
      {
        kind: 'claim',
        text: `orbit–stabilizer 核对：|G| = |O| · |Stab| = ${orbitSize} × ${stabSize} = ${orbitSize * stabSize}${orbitSize * stabSize === order ? ' ✓' : ' ✗'}`,
        tex: `|G| = |O|\\cdot|{\\operatorname{Stab}}| = ${orbitSize} \\times ${stabSize} = ${orbitSize * stabSize}`,
      },
      {
        kind: 'claim',
        text: `由 |G| = ${PK}m 与 p ∤ |O| 得 ${PK} | |Stab(A)|，即 |Stab(A)| ≥ ${pk}。`,
        tex: `p^k \\mid |{\\operatorname{Stab}}(A)| \\;\\Longrightarrow\\; |{\\operatorname{Stab}}(A)| \\ge ${pk}`,
      },
      {
        kind: 'claim',
        text: `另一边：∀a ∈ A 有 Stab(A)·a ⊆ A，于是 |Stab(A)| ≤ |A| = ${PK} = ${pk}。`,
        tex: `|{\\operatorname{Stab}}(A)| \\le |A| = p^k = ${pk}`,
      },
      {
        kind: 'conclude',
        text: `${pk} ≤ |Stab(A)| ≤ ${pk} ⇒ |Stab(A)| = ${pk} = ${PK}。Stab(A) 就是所求的 ${PK} 阶子群 ∎`,
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
  title: 'Sylow II · 共轭性（G ↷ Syl_p(G) 传递）',
  theorem:
    'P, Q \\in \\operatorname{Syl}_p(G) \\;\\Longrightarrow\\; \\exists\\, g \\in G : Q = gPg^{-1}',
  blurb: '一次作用：G 共轭作用在 Syl_p(G) 上，且只有一个轨道',
  defaults: SYLOW_II_DEFAULTS,
  groupChoices: PROOF_GROUP_CHOICES,

  build(group?: string, p?: number): ProofStep[] {
    const info = stageInfo(group ?? SYLOW_II_DEFAULTS.group)
    const pp = p ?? SYLOW_II_DEFAULTS.p
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
        text: `设 G = ${sym}，|G| = ${order} = ${info.orderUni}。取 p = ${pp} ⇒ ${PK} = ${pk}，m = ${m}。`,
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
        text: `把子群集「升格为对象」 Ω —— 它才是作用要作用的那个集合（|Ω| = ${n}）。`,
        tex: `\\Omega = \\operatorname{Syl}_${pp}(${sym}),\\qquad |\\Omega| = ${n}`,
        line: 'Ω = 底集(S)',
        highlight: ['Ω'],
      },
      {
        kind: 'compute',
        text: `让 G 通过共轭 g·H·g⁻¹ 作用在 Ω 上 —— Sylow 定理的全部动力都在这一条作用里。`,
        tex: `${sym} \\curvearrowright \\Omega,\\qquad g \\cdot H = gHg^{-1}`,
        line: 'A = 共轭作用在(G, Ω)',
        highlight: ['A'],
      },
      {
        kind: 'compute',
        text: `取 Ω 的 1 号点算它的轨道：|O| = ${n} = |Ω| —— 一个轨道就吃下整个 Ω，作用是「传递」的。`,
        tex: `|O| = ${n} = |\\Omega|`,
        line: 'O = 轨道(A, 1)',
        highlight: ['O'],
      },
      {
        kind: 'claim',
        text: `传递 ⟺ 任意两个 Sylow ${pp}-子群都在同一条共轭轨道里，即 ∃g：Q = gPg⁻¹。这就是 Sylow II。`,
        tex: `\\forall\\, P, Q \\in \\Omega\\;\\; \\exists g \\in G : Q = gPg^{-1}`,
      },
      {
        kind: 'compute',
        text: `顺带把稳定子算出来：Stab(1 号点) = N_G(P)，|N_G(P)| = ${stab}`,
        tex: `\\operatorname{Stab}_{G}(P) = N_{G}(P),\\qquad |N_{G}(P)| = ${stab}`,
        line: 'N = 稳定子(A, 1)',
        highlight: ['N'],
      },
      {
        kind: 'claim',
        text: `轨道-稳定子核对：|O| · |Stab| = ${n} × ${stab} = ${n * stab}${n * stab === order ? ' ✓' : ' ✗'} = |G|`,
        tex: `|O| \\cdot |N_{G}(P)| = ${n} \\times ${stab} = ${n * stab} = |G|`,
      },
      {
        kind: 'compute',
        text: `取一个「具体的」 Sylow ${pp}-子群 P = ⟨${gensLine}⟩（Ω 里的第 ${pIdx} 号点）`,
        tex: `P = \\langle ${gensLine} \\rangle,\\qquad |P| = ${pk}`,
        line: `P = 闭包(G, ${gensLine})`,
        highlight: ['P'],
      },
      {
        kind: 'conclude',
        text: `${nUni(pp)} = [G : N_G(P)] = ${order}/${stab} = ${n}；${n} 个 Sylow ${pp}-子群两两共轭 ∎`,
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
  title: 'Sylow III · n_p ≡ 1 (mod p) 且 n_p | m',
  theorem: 'n_p \\equiv 1 \\pmod{p},\\qquad n_p \\mid m \\quad (|G| = p^k m,\\; p \\nmid m)',
  blurb: '换主角：让 P 自己作用在 Syl_p(G) 上，轨道长全是 p 的幂',
  defaults: SYLOW_III_DEFAULTS,
  groupChoices: PROOF_GROUP_CHOICES,

  build(group?: string, p?: number): ProofStep[] {
    const info = stageInfo(group ?? SYLOW_III_DEFAULTS.group)
    const pp = p ?? SYLOW_III_DEFAULTS.p
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
        `${nUni(pp)} = 1（${sym} 只有一个 Sylow ${pp}-子群，它是正规的）。Sylow III 靠「P 作用在 Ω 上、除不动点外的轨道都被 p 整除」来论证，n_p = 1 时没有其余轨道可谈——换一个 p 或换一个群。`,
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
        text: `设 G = ${sym}，|G| = ${PK}m：${order} = ${info.orderUni}，p = ${pp} ⇒ ${PK} = ${pk}，m = ${m}（p ∤ m）。`,
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
        text: `Ω = Syl${subscript(String(pp))}(G) 升格为集合对象（${n} 个点）`,
        tex: `\\Omega = \\operatorname{Syl}_${pp}(${sym}),\\qquad |\\Omega| = ${n}`,
        line: 'Ω = 底集(S)',
        highlight: ['Ω'],
      },
      {
        kind: 'compute',
        text: `第一条路：G 通过共轭作用在 Ω 上`,
        tex: `${sym} \\curvearrowright \\Omega,\\qquad g \\cdot H = gHg^{-1}`,
        line: 'A = 共轭作用在(G, Ω)',
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
        text: `因为 P ⊆ N_G(P)，把 [G:P] = [G:N_G(P)]·[N_G(P):P] 摊开得 ${nUni(pp)} · [N_G(P):P] = m = ${m} ⇒ ${nUni(pp)} | m ✓`,
        tex: `${nTex(pp)} \\mid m = ${m}`,
      },
      {
        kind: 'claim',
        text: `第二条路（这才是 ${nUni(pp)} ≡ 1 的来源）：「换主角」——让 P 自己通过共轭作用在 Ω 上。`,
        tex: `P \\curvearrowright \\Omega \\quad(\\text{限制 } ${sym} \\text{ 的作用到 } P)`,
      },
      {
        kind: 'compute',
        text: `取一个具体的 P = ⟨${gensLine}⟩（Ω 的第 ${pIdx} 号点），让它作用`,
        tex: `P = \\langle ${gensLine} \\rangle,\\qquad |P| = ${pk}`,
        line: `P = 闭包(G, ${gensLine})`,
        highlight: ['P'],
      },
      {
        kind: 'compute',
        text: `P 作用在 Ω 上：P ↷ Ω（作用群是子群 P，Ω 的成员仍是母群 ${sym} 的子群）`,
        tex: `P \\curvearrowright \\Omega,\\qquad |\\Omega| = ${n}`,
        line: 'B = 共轭作用在(P, Ω)',
        highlight: ['B'],
      },
      {
        kind: 'compute',
        text: `P 的不动点只有一个：|Fix| = ${fixed} —— 只有 P 自己被 P 正规化`,
        tex: `|\\operatorname{Fix}_{P}(\\Omega)| = ${fixed}`,
        line: 'F = 不动点(B)',
        highlight: ['F'],
      },
      {
        kind: 'compute',
        text: `其余 ${others.length} 条轨道长 ${others.join(' + ')} —— 轨道长整除 |P| = ${pk} 且 > 1，故都被 p = ${pp} 整除`,
        tex: `\\sum |P \\cdot Q| = ${others.join(' + ')},\\qquad ${pp} \\mid ${restSum}`,
        line: `OB = 轨道(B, ${otherIdx})`,
        highlight: ['OB'],
      },
      {
        kind: 'claim',
        text: `于是 ${n} = |Ω| = ${fixed} + ${restSum} ≡ ${fixed} = 1 (mod ${pp})：${nUni(pp)} ≡ 1 (mod ${pp}) ✓`,
        tex: `${nTex(pp)} = ${n} \\equiv ${mod} \\pmod{${pp}}`,
      },
      {
        kind: 'conclude',
        text: `${nUni(pp)} = ${n}：既 ${n} ≡ ${mod} (mod ${pp}) ✓，又 ${n} | m = ${m} ✓。Sylow III 两条都成立 ∎`,
        tex: `${nTex(pp)} = ${n} \\equiv 1 \\pmod{${pp}},\\qquad ${nTex(pp)} \\mid ${m} \\;\\qed`,
        highlight: ['S'],
      },
    ]
  },
}

/** 全部模板（M1 的 Sylow I + M2 的 Sylow II / III）。 */
export const PROOF_TEMPLATES: ProofTemplate[] = [SYLOW_I, SYLOW_II, SYLOW_III]

/**
 * 某个模板在某组参数下**能不能跑**——面板的「开始」按钮与模板的 `build()`
 * 共用同一份判据，所以按钮亮着就一定能跑。
 *
 * 只拦"结构性跑不了"的情形（记号认不出 / p 不整除 |G| / n_p = 1 撑不起 Sylow III）；
 * 生成元超过 3 个这类要看具体群的，交给 `build()` 的 `bail`——面板会显示理由。
 */
export function templateReady(t: ProofTemplate, group: string, p: number): string | null {
  const info = stageInfo(group)
  const bad = checkParams(info, p)
  if (bad) return bad
  if (t.id === 'sylow-3-congruence' && info.counts[p] < 2) {
    return `${nUni(p)} = 1：只有唯一一个 Sylow ${p}-子群，Sylow III 的「其余轨道」不存在。换一个 p（或换一个群）。`
  }
  return null
}
