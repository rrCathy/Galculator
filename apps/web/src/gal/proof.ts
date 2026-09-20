import {
  binomialMod,
  closeUnderMultiply,
  computeCosetActionPerms,
  computeOrbits,
  computeStabilizers,
  createGroupFromSymbol,
  factorizeOrder,
  parseGroupNotation,
  resolveElement,
  type GroupElement,
} from '@groupviz/core'
import { prettySymbol, superscript } from './pretty'

/**
 * Proof Spec 的**执行侧**（M1）。规范见 docs/PROOF_SPEC.md。
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
 * ## 粒度 C：只算计数，不枚举
 *
 * Sylow I 的模板只算 `C(n, pᵏ) mod p`，**不枚举**那个 4.95 亿…… 不，495 个 4 元子集。
 * 这本身是教学点：**证明靠计数，不靠枚举**。第 6 步给出的 P 是把"存在"具象化的**实例**，
 * 不是前提——存在性由第 5 步的反证独立成立（PROOF_SPEC §5 的注释）。
 *
 * ## 数字从哪来
 *
 * 模板文本里的每个数字都由 build() **真算**（同一批 core 函数、同一份输入），
 * 不手写、不凭记忆——于是面板上的数字与画布上的对象**不可能不一致**（`verify/suites/proof.ts` 盯这条）。
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

export interface ProofTemplate {
  id: string
  title: string
  /** TeX 定理陈述 */
  theorem: string
  /** 一句话说明这条证明的"魂" */
  blurb: string
  /** 模板绑定的实例参数（演示性证明是"模板 × 具体群"） */
  params: { group: string; p: number }
  build(): ProofStep[]
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

/* ── Sylow I（Wielandt）在 A₄ 上，p = 2 ─────────────────── */

function choose(n: number, k: number): number {
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return Math.round(r)
}

/** A₄ 里 V₄ 的一对生成元（模板内置的实例数据）。 */
const A4_V4_GENS = ['(12)(34)', '(13)(24)']

export const SYLOW_I: ProofTemplate = {
  id: 'sylow-1-wielandt',
  title: 'Sylow I · 存在性（Wielandt 计数证明）',
  theorem: 'p^k \\mid |G| \\;\\Longrightarrow\\; \\exists H \\le G,\\ |H| = p^k',
  blurb: '不搜索、不枚举：只数一个模 p 不为 0 的集合',
  params: { group: 'A_4', p: 2 },

  build(): ProofStep[] {
    // ── 真算：所有数字都在这里从 core 拿到 ──
    const notation = parseGroupNotation('A_4')
    const g = notation.symbol ? createGroupFromSymbol(notation.symbol) : null
    if (!g) return [{ kind: 'claim', text: '（模板初始化失败：A₄ 建不出来）' }]
    const order = g.order
    const p = 2
    const fs = factorizeOrder(order)
    const k = fs.find((f) => f.prime === p)?.exponent ?? 0
    const pk = p ** k
    const m = order / pk
    const binom = choose(order, pk)
    const mod = binomialMod(order, pk, p)

    const gens = A4_V4_GENS.map((t) => resolveElement(g, t)).filter(
      (e): e is GroupElement => !!e,
    )
    const subEls = closeUnderMultiply(g, gens)
    const coset = computeCosetActionPerms(g, subEls)
    const { orbits, orbitOf } = computeOrbits(coset.perms, coset.n)
    const orbitSize = orbits[orbitOf[0]]?.elements.length ?? 0
    const stabSize = (computeStabilizers(g, coset.perms, coset.n).get(0) ?? []).length
    const fsTex = fs.map((f) => (f.exponent === 1 ? `${f.prime}` : `${f.prime}^{${f.exponent}}`)).join(' \\cdot ')
    // 面板的 `text` 是**纯文本**（不进 KaTeX），所以它里面必须是 Unicode 形态——
    // 塞 `2^{2} \cdot 3` 进去会原文显示（真截图抓到的）。
    const fsUni = fs.map((f) => (f.exponent === 1 ? `${f.prime}` : `${f.prime}${superscript(f.exponent)}`)).join('·')
    const sym = prettySymbol(g.symbol)
    const GENS_TEX = A4_V4_GENS.join(',\\;')
    const gensLine = A4_V4_GENS.join(', ')

    return [
      {
        kind: 'claim',
        text: `设 G = ${sym}，|G| = pᵏ·m 且 p ∤ m。目标：在 G 里找出一阶为 pᵏ 的子群。`,
        tex: `|G| = p^{k} m, \\qquad p \\nmid m`,
        // claim 步也允许带 `line` —— 建群是"设 G 为……"的具象化，本来就属于这一步
        line: `G = A_4`,
        highlight: ['G'],
      },
      {
        kind: 'compute',
        text: `${sym} 的阶是 ${order} = ${fsUni} ⇒ p = ${p}，k = ${k}，pᵏ = ${pk}，m = ${m}`,
        tex: `|A_4| = ${order} = ${fsTex}`,
        line: `n = 分解(${order})`,
      },
      {
        kind: 'claim',
        text: `构造 X = { A ⊆ G : |A| = pᵏ }（全体 pᵏ 元子集）。下面只数它的大小——不枚举。`,
        tex: `X = \\{\\, A \\subseteq G : |A| = p^k \\,\\},\\qquad |X| = \\binom{${order}}{${pk}}`,
      },
      {
        kind: 'compute',
        text: `|X| = C(${order}, ${pk}) = ${binom}，而 ${binom} mod ${p} = ${mod} ≠ 0 ⇒ p ∤ |X|`,
        tex: `\\binom{${order}}{${pk}} = ${binom} \\equiv ${mod} \\pmod{${p}}`,
        line: `c = Cmod(${order}, ${pk}, ${p})`,
      },
      {
        kind: 'claim',
        text: `G 左乘作用在 X 上。若每个轨道大小都被 p 整除，则 p | |X| —— 与上一步矛盾。所以存在轨道 O 使 p ∤ |O|。`,
        tex: `p \\nmid |X| \\;\\Longrightarrow\\; \\exists\\, O :\\; p \\nmid |O|`,
      },
      {
        kind: 'compute',
        text: `取一个具体的 pᵏ 元子集作实例：P = ⟨${gensLine}⟩（它就是 ${sym} 的 ${pk} 阶子群）`,
        tex: `P = \\langle ${GENS_TEX} \\rangle,\\qquad |P| = ${pk} = p^k`,
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
        text: `左乘作用在陪集上是传递的：轨道就是整个 Ω，|O| = ${orbitSize}；${p} ∤ ${orbitSize} ✓`,
        tex: `|O(P)| = ${orbitSize},\\qquad ${p} \\nmid ${orbitSize}`,
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
        text: `由 |G| = pᵏm 与 p ∤ |O| 得 pᵏ | |Stab(A)|，即 |Stab(A)| ≥ ${pk}。`,
        tex: `p^k \\mid |{\\operatorname{Stab}}(A)| \\;\\Longrightarrow\\; |{\\operatorname{Stab}}(A)| \\ge ${pk}`,
      },
      {
        kind: 'claim',
        text: `另一边：∀a ∈ A 有 Stab(A)·a ⊆ A，于是 |Stab(A)| ≤ |A| = pᵏ = ${pk}。`,
        tex: `|{\\operatorname{Stab}}(A)| \\le |A| = p^k = ${pk}`,
      },
      {
        kind: 'conclude',
        text: `${pk} ≤ |Stab(A)| ≤ ${pk} ⇒ |Stab(A)| = ${pk} = pᵏ。Stab(A) 就是所求的 pᵏ 阶子群 ∎`,
        tex: `|{\\operatorname{Stab}}(A)| = p^k = ${pk} \\;\\qed`,
        highlight: ['S'],
      },
    ]
  },
}

/** 全部模板（目前一条，M2 会加 Sylow II / III）。 */
export const PROOF_TEMPLATES: ProofTemplate[] = [SYLOW_I]
