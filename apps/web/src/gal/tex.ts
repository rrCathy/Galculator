/**
 * Unicode 展示串 → LaTeX（U4）。
 *
 * 为什么需要它：**core 给的群符号本来就是 TeX**（`S_{4}` / `C_{2}^{2}`），
 * 直接喂 KaTeX 就行；但画布/面板上大量标签是**拼装出来的展示串**——
 * `Z ∩ C`、`Sub(D₄)`、`ker(S₄ → S₃)`、`映射(G, A, r→0, s→0)`。
 * 它们不是从 TeX 源生成的，要把它们也渲染成数学排版，只能**反推**。
 *
 * 转换是保守的：认得出就转，认不出就原样留着（KaTeX 的 `throwOnError: false`
 * 会把认不出的部分画成红字，比整行退化成纯文本更容易发现）。
 */

/* ── 上下标 ────────────────────────────────────────────── */

const SUB_CHARS: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')',
  'ₐ': 'a', 'ₑ': 'e', 'ₕ': 'h', 'ᵢ': 'i', 'ⱼ': 'j', 'ₖ': 'k', 'ₗ': 'l',
  'ₘ': 'm', 'ₙ': 'n', 'ₒ': 'o', 'ₚ': 'p', 'ᵣ': 'r', 'ₛ': 's', 'ₜ': 't',
  'ᵤ': 'u', 'ᵥ': 'v', 'ₓ': 'x',
}

const SUP_CHARS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ⁱ': 'i',
}

const SUB_RE = new RegExp(`[${Object.keys(SUB_CHARS).join('')}]+`, 'g')
const SUP_RE = new RegExp(`[${Object.keys(SUP_CHARS).join('')}]+`, 'g')

/* ── 运算符与希腊字母 ──────────────────────────────────── */

/** 长串在前，避免 `⊂` 抢先匹配掉 `⊆`（这里都单字符，顺序只为可读） */
const SYMBOLS: [string, string][] = [
  ['∩', '\\cap '],
  ['∪', '\\cup '],
  ['×', '\\times '],
  ['·', '\\cdot '],
  ['∘', '\\circ '],
  ['∖', '\\setminus '],
  ['−', '-'],
  ['→', '\\to '],
  ['←', '\\leftarrow '],
  ['↦', '\\mapsto '],
  ['↪', '\\hookrightarrow '],
  ['↷', '\\curvearrowright '],
  ['≅', '\\cong '],
  ['≃', '\\simeq '],
  ['≠', '\\ne '],
  ['≤', '\\le '],
  ['≥', '\\ge '],
  ['⊆', '\\subseteq '],
  ['⊂', '\\subset '],
  ['⊇', '\\supseteq '],
  ['⊃', '\\supset '],
  ['∈', '\\in '],
  ['∉', '\\notin '],
  ['⊴', '\\trianglelefteq '],
  ['⊵', '\\trianglerighteq '],
  ['∅', '\\varnothing '],
  ['∞', '\\infty '],
  ['√', '\\surd '],
  ['⊗', '\\otimes '],
  ['⊕', '\\oplus '],
  ['⟨', '\\langle '],
  ['⟩', '\\rangle '],
  ['⟶', '\\longrightarrow '],
  ['⟹', '\\implies '],
  ['∀', '\\forall '],
  ['∃', '\\exists '],
  ['α', '\\alpha '],
  ['β', '\\beta '],
  ['γ', '\\gamma '],
  ['δ', '\\delta '],
  ['ε', '\\varepsilon '],
  ['ζ', '\\zeta '],
  ['η', '\\eta '],
  ['θ', '\\theta '],
  ['ι', '\\iota '],
  ['κ', '\\kappa '],
  ['λ', '\\lambda '],
  ['μ', '\\mu '],
  ['ν', '\\nu '],
  ['ξ', '\\xi '],
  ['π', '\\pi '],
  ['ρ', '\\rho '],
  ['σ', '\\sigma '],
  ['τ', '\\tau '],
  ['υ', '\\upsilon '],
  ['φ', '\\varphi '],
  ['χ', '\\chi '],
  ['ψ', '\\psi '],
  ['ω', '\\omega '],
  ['Γ', '\\Gamma '],
  ['Δ', '\\Delta '],
  ['Θ', '\\Theta '],
  ['Λ', '\\Lambda '],
  ['Ξ', '\\Xi '],
  ['Π', '\\Pi '],
  ['Σ', '\\Sigma '],
  ['Φ', '\\Phi '],
  ['Ψ', '\\Psi '],
  ['Ω', '\\Omega '],
]

/**
 * 多字母的**函数名**要包成 `\operatorname{}`，否则 KaTeX 会把 `Sub` 当成
 * `S·u·b` 三个变量的连写（数学排版里那确实是乘积的意思，但这里不是）。
 * 单字母的 `Z` / `C` / `N` 不在此列——它们是群名。
 */
const FUNC_NAMES = ['pSub', 'Sub', 'Syl', 'Aut', 'Orb', 'Stab', 'Fix', 'ord', 'ker', 'im', 'det']

/** 中文串要包进 `\text{}`——math mode 下的 CJK 会渲染失败 */
const CJK_RE = /[\u4e00-\u9fff\u3000-\u303f，。：；、（）]+/g

const cache = new Map<string, string>()

/**
 * 把展示串转成 LaTeX。**幂等性不保证**（对已经是 TeX 的串会再转一次，
 * 但因为符号表不认 `\`，结果基本等价），所以调用方应只喂"展示串"。
 */
export function toTex(label: string): string {
  const hit = cache.get(label)
  if (hit !== undefined) return hit

  let s = label

  // ① Unicode 上下标 → _{...} / ^{...}
  s = s.replace(SUB_RE, (m) => `_{${[...m].map((c) => SUB_CHARS[c] ?? c).join('')}}`)
  s = s.replace(SUP_RE, (m) => `^{${[...m].map((c) => SUP_CHARS[c] ?? c).join('')}}`)

  // ② 运算符 / 希腊字母
  for (const [from, to] of SYMBOLS) {
    if (s.includes(from)) s = s.split(from).join(to)
  }

  // ③ 函数名 → \operatorname{}
  for (const name of FUNC_NAMES) {
    const re = new RegExp(`\\b${name}\\b`, 'g')
    s = s.replace(re, `\\operatorname{${name}}`)
  }

  // ④ 中文 → \text{}
  s = s.replace(CJK_RE, (m) => `\\text{${m}}`)

  const out = s.replace(/\s+/g, ' ').trim()
  cache.set(label, out)
  return out
}

/**
 * 标签能不能安全走 KaTeX。
 *
 * 判据不是"像不像 TeX"，而是**转出来以后还认不认得**：
 * 纯 ASCII 名字（用户起的 `A`、`G`）转不转都一样，走纯文本更省事、也更清晰。
 */
export function shouldTex(label: string): boolean {
  return /[₀-₉⁰-⁹∩∪×→↦↪≅⊆⊂∈⊴⟨⟩∘∖α-ωΑ-Ω\\^_{}\u4e00-\u9fff]/.test(label)
}
