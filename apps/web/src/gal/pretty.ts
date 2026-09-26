const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  n: 'ₙ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', p: 'ₚ', m: 'ₘ', r: 'ᵣ', s: 'ₛ',
}

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ',
}

function mapChars(s: string, table: Record<string, string>): string {
  return [...s].map((c) => table[c] ?? c).join('')
}

/**
 * 引擎 TeX 里的希腊字母 → Unicode。
 *
 * **不能漏**：core 给自同构群的元素起的名字就是 `\alpha_{2}`——不认希腊字母的话
 * 会掉进末尾的"去反斜杠"兜底，展示成 `alpha₂` 这种半截货
 * （实测：`Aut(S₄)` 的生成元在信息面板里显示成 `alpha₂, alpha₅`）。
 *
 * 变体（`\varepsilon` / `\varphi` 这类）与 tex.ts 的 `toTex` 方向保持一致，
 * 否则"展示 → 反推 TeX → 渲染"会来回变形。
 */
export const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ',
  epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'θ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
  pi: 'π', varpi: 'π', rho: 'ρ', varrho: 'ρ',
  sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
  phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
}

/**
 * 希腊字母的**符号变体**（数学排版用的那些码位）→ 上表用的标准字符。
 *
 * 为什么要它：LaTeX 的 `\phi` 排出来是 **ϕ（U+03D5）**，而 `\varphi` 排出来才是
 * φ（U+03C6）—— 本表统一用后者（与 `tex.ts` 的 `toTex` 方向一致）。于是用户
 * 从别处（论文 PDF / 网页 / 别的编辑器）**复制**来的往往是 U+03D5 ——
 * 肉眼一模一样，代码点却不同，不归一就是"看着对、实则两个字符"。
 *
 * 这五个是三对希腊字母的"排版变体"码位，与 `varsigma`（ς 自成一体）不同。
 */
const GREEK_VARIANTS: Record<string, string> = {
  '\u03d1': 'θ', // ϑ theta symbol
  '\u03d5': 'φ', // ϕ phi symbol
  '\u03d6': 'π', // ϖ pi symbol
  '\u03f1': 'ρ', // ϱ rho symbol
  '\u03f5': 'ε', // ϵ epsilon symbol
}

/**
 * 把一段文本里的希腊字母**统一成一种写法**。输入与匹配的闭环靠它合上。
 *
 * 两个方向缺一不可：
 *   · **LaTeX 别名** `\phi` / `\varphi` → φ（普通键盘敲不出 φ，但敲得出 `\phi`）
 *   · **符号变体** ϕ → φ（从别处复制来的是变体码位）
 *
 * **只认上表里的名字**，别的一律不动 —— 于是集合差 `A \ B` 里的那个反斜杠
 * 不会被误伤（`B` 不在表里）。`\cdot` 也安全（`cdot` 不在表里，且它在
 * `UNICODE_ALIASES` 里已经被更早地换成 `·`）。
 */
export function normalizeGreek(s: string): string {
  return s
    .replace(/\\([A-Za-z]+)/g, (m, name: string) => GREEK[name] ?? m)
    .replace(/[\u03d1\u03d5\u03d6\u03f1\u03f5]/g, (c) => GREEK_VARIANTS[c] ?? c)
}

/** 整数 → 上标形态（`2` → `²`，`12` → `¹²`）。用于阶分解这类展示。 */
export function superscript(n: number): string {
  return mapChars(String(n), SUP)
}

/** 字符串 → 下标形态（`p` → `ₚ`，`12` → `₁₂`）。用于 n_p 这类记号。 */
export function subscript(s: string): string {
  return mapChars(s, SUB)
}

/**
 * 引擎的 TeX 形态群符号 → 近 Unicode 展示形态。
 * 例：`S_{4}` → `S₄`、`C_{2}\times C_{2}` → `C₂×C₂`、`\mathbb{Z}_{6}` → `ℤ₆`。
 * 只做展示，解析仍走引擎原始符号。
 */
export function prettySymbol(raw: string): string {
  let s = raw.replace(/\s+/g, '').replace(/\\left|\\right/g, '')

  /**
   * 包裹类宏先展开成裸记号。
   *
   * `\mathrm` / `\mathbf` 这条**不能漏**：core 给**自同构群**的元素起的名字就是
   * `\mathrm{id}` / `\alpha_{2}`（`createAutomorphismGroup`），漏了 `\mathrm`
   * 会掉进末尾的"去反斜杠"兜底，变成 `mathrmid` 这种谁都认不出的东西。
   */
  s = s.replace(/\\mathbb\{([^{}]*)\}/g, '$1')
  s = s.replace(/\\(?:mathrm|mathbf|mathit|mathsf|mathtt|operatorname|text)\{([^{}]*)\}/g, '$1')

  // 多字符上下标 → Unicode
  s = s.replace(/_\{([^{}]*)\}/g, (_, x: string) => mapChars(x, SUB))
  s = s.replace(/\^\{([^{}]*)\}/g, (_, x: string) => mapChars(x, SUP))

  // 单字符上下标
  s = s.replace(/_([0-9a-zA-Z])/g, (_, c: string) => SUB[c] ?? `_${c}`)
  s = s.replace(/\^([0-9a-zA-Z+-])/g, (_, c: string) => SUP[c] ?? `^${c}`)

  // 运算符
  s = s.replace(/\\rtimes/g, '⋊').replace(/\\times/g, '×').replace(/\\cdot/g, '·')
  s = s.replace(/\\oplus/g, '⊕').replace(/\\cong/g, '≅').replace(/\\le/g, '≤')

  // 希腊字母（必须排在运算符之后：`\rtimes` 这类先被吃掉了，才不会误认成希腊字母）
  s = s.replace(/\\([A-Za-z]+)/g, (m, name: string) => GREEK[name] ?? m)

  // 兜底：去掉残余花括号与反斜杠
  s = s.replace(/\{([^{}]*)\}/g, '$1').replace(/\\/g, '')
  return s
}
