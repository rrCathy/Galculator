/**
 * **Unicode 数学字符 → LaTeX**（`φ` → `\varphi `、`∩` → `\cap `、`₄` 见下面的上下标表）。
 *
 * 这张表的用途在这轮（2026-09-27）变了：
 *
 *   · **从前**它是渲染层的"反推器"——展示串是 Unicode，喂 KaTeX 前要翻译回 TeX；
 *   · **现在**它只服务**两个**地方：渲染**老数据**（万一某个 label 还是 Unicode），
 *     以及 `foldToAscii()` —— 用户敲了打不出来的字符时，用它折出"该敲什么"的建议。
 *
 * ⚠️ 长串在前（`⊆` 要先于 `⊂` 匹配）。带尾随空格是给**中缀**留的分隔符
 *（LaTeX 里命令与后面的字母必须隔开，否则 `\pi x` 会粘成 `\pix`）。
 */
export const UNICODE_TO_TEX: [string, string][] = [
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
  ['ς', '\\varsigma '],
  ['σ', '\\sigma '],
  ['τ', '\\tau '],
  ['υ', '\\upsilon '],
  ['φ', '\\varphi '],
  // ── 排版变体：LaTeX 的 `\phi` 排出来是 ϕ、`\varphi` 排出来才是 φ ——
  //    肉眼一样、码位不同。从论文 PDF / 期刊网页里复制来的通常是**变体**那一支，
  //    所以必须一并折（从前只为渲染用，现在它还负责给出"该敲什么"）。
  ['ϕ', '\\varphi '],
  ['ϑ', '\\theta '],
  ['ϖ', '\\varpi '],
  ['ϱ', '\\rho '],
  ['ϵ', '\\varepsilon '],
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
  ['Υ', '\\Upsilon '],
  ['Φ', '\\Phi '],
  ['Ψ', '\\Psi '],
  ['Ω', '\\Omega '],
]

/**
 * 上下标的**反向**表（`₄` → `4`）。
 *
 * 为什么放在这里：它与上面的 `SUB` / `SUP` 是**同一件事的两半**
 * （正向：`4` → `₄`，展示用；反向：`₄` → `4`，回认用）。写两份表就意味着
 * "能显示成什么样"与"能敲回去什么"会慢慢对不上 —— 而本项目恰好有一条铁律
 * 叫「**展示成什么样，就得照着敲回去**」。`tex.ts` 渲染回 TeX 也消费这张表。
 *
 * 比正向表多几个字母（`a`/`e`/`h`/`l`/`o`/`t`/`u`/`v`/`x`）——正向表只做
 * 它实际会用到的，反向表要尽量宽（用户可能从任何地方复制来一个 `Aᵤ`）。
 */
export const SUB_FROM: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')',
  'ₐ': 'a', 'ₑ': 'e', 'ₕ': 'h', 'ᵢ': 'i', 'ⱼ': 'j', 'ₖ': 'k', 'ₗ': 'l',
  'ₘ': 'm', 'ₙ': 'n', 'ₒ': 'o', 'ₚ': 'p', 'ᵣ': 'r', 'ₛ': 's', 'ₜ': 't',
  'ᵤ': 'u', 'ᵥ': 'v', 'ₓ': 'x',
}

/** 上标的反向表（`²` → `2`）。与 `SUB_FROM` 同理。 */
export const SUP_FROM: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ⁱ': 'i',
}

/**
 * 上下标字符 → ASCII 记号（`S₄` → `S_4`、`C₂×C₂` → `C_2×C_2`）。
 *
 * ⚠️ **折叠必须保语义**。这一条是从 GroupViz 的 `notation/canonical.ts`
 * 借来的（它的 `foldUnicodeScript` 与这个函数逐字同构），那边的注释写得很准：
 *
 * > 必须保留上下标语义：`C_2²` 要折成 `C_2^2`（而不是 `C_22`），否则提示会
 * > 建议用户改写成 `C_{22}` —— 那正是原来静默给错群的根源。
 *
 * 所以"连续的同类合并"（`C₁₂` → `C_12`）与"下标转上标不合并"（`C_2²` → `C_2^2`）
 * 两件事都要做对：前者是分组，后者是**换了运算符**。
 */
export function foldScript(s: string): string {
  let out = ''
  let mode: 'sub' | 'sup' | null = null
  for (const c of s) {
    const sub = SUB_FROM[c]
    const sup = sub === undefined ? SUP_FROM[c] : undefined
    const kind: 'sub' | 'sup' | null = sub !== undefined ? 'sub' : sup !== undefined ? 'sup' : null
    if (kind === null) {
      mode = null
      out += c
      continue
    }
    if (mode !== kind) {
      out += kind === 'sub' ? '_' : '^'
      mode = kind
    }
    out += kind === 'sub' ? sub : sup
  }
  return out
}

/** 中文与中文标点放行 —— 用户写的就是中文，那不是"键盘打不出的数学符号"。 */
const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef\u2013\u2014\u2018-\u201d\u2026]/

/**
 * 把一整行里**键盘打不出来的字符**折成 ASCII 写法（**保语义**）。
 *
 * 这是"给建议"的核心：不是甩一句"写成 _x"的模板，而是把用户**这一行**
 * 真折一遍，让他直接照着改。做法借自 GroupViz 的 `notation/canonical.ts`
 *（那边叫 `foldUnicodeScript`，在报错时用它算出建议串）。
 *
 * 顺序有讲究：**先折上下标**（它是位置的语法），再折字符（它是记号的名字）。
 */
export function foldToAscii(raw: string): string {
  let s = foldScript(raw)
  for (const [from, to] of UNICODE_TO_TEX) {
    if (s.includes(from)) s = s.split(from).join(to)
  }
  // 尾随空格只为分隔而留（`\varphi )` → `\varphi)`）；后面是字母时**必须**留着，
  // 否则 `\times C_2` 会粘成 `\timesC_2` —— 一个不存在的命令（实测 KaTeX 报错）
  return s.replace(/\\([A-Za-z]+) (?=[^A-Za-z]|$)/g, '\\$1')
}

/** 打不出来的字符分四类 —— 调用方可以据此说不同的话（也可以只说"该敲什么"）。 */
export type NotAsciiKind = 'subscript' | 'superscript' | 'greek' | 'symbol'

export interface NotAsciiIssue {
  /** 第一个撞上的字符 */
  char: string
  kind: NotAsciiKind
  /**
   * **整串折叠后的形态** —— 用户可以直接照它改。
   *
   * 从 GroupViz 借来的做法（见 `foldToAscii`）：报错要**给出可照抄的写法**，
   * 而不是"你自己体会"。这条在本项目里格外重要，因为记号本来就有两套形态
   *（Unicode 展示 ↔ ASCII 输入），用户没有理由知道该用哪套。
   */
  suggestion: string
}

/**
 * 扫一遍：有没有**键盘打不出来**的字符？有就给 `{ char, kind, suggestion }`。
 *
 * 判据是"码位 + 不是中文"：ASCII 与中文/CJK 标点放行，其余一律拦。
 * **拦住而不是替他转换** —— 静默转换会让"这个符号打不出来"一直藏着：
 * 用户以为系统支持，直到某次把结果复制进博客才发现是乱码。
 *（GroupViz 那边独立得出同一结论，理由更硬：静默折叠实测会给错群。）
 */
export function scanNotAscii(raw: string): NotAsciiIssue | null {
  for (const c of raw) {
    const o = c.charCodeAt(0)
    if (o <= 127 || CJK.test(c)) continue
    let kind: NotAsciiKind
    if ((o >= 0x2080 && o <= 0x209c) || o === 0x2093) kind = 'subscript'
    else if ((o >= 0x2070 && o <= 0x207f) || o === 0xb2 || o === 0xb3 || o === 0xb9) {
      kind = 'superscript'
    } else if (o >= 0x0370 && o <= 0x03ff) kind = 'greek'
    else kind = 'symbol'
    return { char: c, kind, suggestion: foldToAscii(raw) }
  }
  return null
}

/**
 * **外部字符串里的非 ASCII 装饰 → 等价写法**（2026-09-27）。
 *
 * 用在**别人的文案**上 —— 主要是 `@groupviz/core` 的报错/提示。它里面写着
 * `可用写法：C_{12} · S_{3} · D_{4}`，那个 `·`（列表分隔点）键盘打不出来，
 * 而我们的约定是"界面上出现的每个字符都得是键盘敲得出的"。
 *
 * 为什么不让调用方各写各的：这类字符**成批出现**（列表分隔点 · 破折号 · 省略号），
 * 一处一处改迟早漏 —— 所以放在**边界上**统一过一道。
 *
 * 只处理**装饰性**字符（分隔、标点）。数学符号不在这里管：那种情况应该走渲染
 *（`TexOrText`），而不是把 `\alpha` 退化成 `alpha`。
 */
const FOREIGN_ASCII: Record<string, string> = {
  '·': '、', // 列表分隔点（core 的提示里最常见）
  '•': '、',
  '‧': '、',
  '—': '-', // 破折号 / 连接号
  '–': '-',
  '―': '-',
  '…': '...', // 省略号
  '⋯': '...',
  '　': ' ', // 全角空格
  '\u00a0': ' ',
}

export function asciiClean(raw: string): string {
  let s = raw
  for (const [from, to] of Object.entries(FOREIGN_ASCII)) {
    if (s.includes(from)) s = s.split(from).join(to)
  }
  return s
}

/**
 * 整数 → **TeX 上标形态**（`2` → `^2`、`12` → `^{12}`）。用于阶分解这类展示。
 *
 * 2026-09-27 之前它产出 Unicode 上标（`2` → `²`），文本形态统一到简化 LaTeX
 * 之后必须改：多字符**要带花括号**，否则 KaTeX 只吃紧邻的一个字符
 *（`^12` 渲染出来是 `¹2`，看着像 12 其实是 1 上标 + 2）。
 */
export function superscript(n: number): string {
  const t = String(n)
  return t.length === 1 ? `^${t}` : `^{${t}}`
}

/**
 * 字符串 → **TeX 下标形态**（`p` → `_p`、`1` → `_1`）。
 *
 * ⚠️ 与 `superscript` 有意不同：这里**不加花括号** —— 主要消费者是 `naming.ts`
 * 造**对象名**（`A_1`、`A_2`…），而名字里不能出现 `{}`（`NAME_RE` 只认
 * 字母 / 数字 / 下划线 / 中文）。多字符下标（`A_101`）在**展示**时由
 * `prettySymbol` 补上花括号，所以显示仍然是 `A_{101}`。
 */
export function subscript(s: string): string {
  return `_${s}`
}

/**
 * 引擎的 TeX 形态群符号 → **面向用户的文本形态**。
 *
 * ⚠️ 这条约定在 2026-09-27 变了（用户要求）：**系统里出现的每个字符都必须是
 * 键盘打得出来的**（ASCII + 中文）。从前这里做的是"TeX → 近 Unicode"
 *（`S_{4}` → `S4`、`\varphi` → 那个希腊字母、`\times` → ×），于是面板、画布、提示里
 * 到处是**复制出去就成怪字符、且打不回来**的东西 —— U23 与 U24 两轮修的
 * 正是它们打不回来的毛病，而根子在"文本形态选了 Unicode"。
 *
 * 现在的形态是**简化 LaTeX**：
 *
 * ```
 * S_{4}  → S_4        （LaTeX 里 `_4` 与 `_{4}` 等价，省花括号更好读）
 * C_{12} → C_{12}     （多字符保留）
 * A_10   → A_{10}     （补上：不补的话 KaTeX 只把 `1` 当下标，渲染成 A 1 下标 0）
 * \varphi / \times / \operatorname{Aut}  →  原样
 * ```
 *
 * 其余**一律不动** —— 它们本身就是 ASCII，而渲染层（KaTeX）正好吃这一口。
 * 于是"显示 / 复制 / 输入"三者统一到同一个形态，转换链从两跳变一跳。
 */
export function prettySymbol(raw: string): string {
  return raw
    .replace(/\\left|\\right/g, '')
    /**
     * **空格必须留**（从前这里是把所有空白删光的）。
     *
     * LaTeX 里空格是**命令的分隔符**：`\times C_2` 删成 `\timesC_2` 就成了一个
     * 不存在的命令（实测：`C_2\times C_2` → `C_2\timesC_2` → KaTeX 报错红字）。
     * 从前要删是因为目标是 Unicode（乘号不需要分隔），现在形态是 LaTeX，删了就是错的。
     */
    .replace(/[ \t]+/g, ' ')
    // 带花括号的：单字符省掉、多字符留着（顺带把 `{ 12 }` 里的空白规整掉）
    .replace(/_\{\s*([0-9A-Za-z]+)\s*\}/g, (_m, x: string) => (x.length === 1 ? `_${x}` : `_{${x}}`))
    .replace(/\^\{\s*([0-9A-Za-z]+)\s*\}/g, (_m, x: string) => (x.length === 1 ? `^${x}` : `^{${x}}`))
    // 裸的多字符下标要**补上**花括号，否则 KaTeX 只把第一个字符当下标
    .replace(/_([0-9A-Za-z]{2,})(?![0-9A-Za-z}])/g, '_{$1}')
    .replace(/\^([0-9A-Za-z]{2,})(?![0-9A-Za-z}])/g, '^{$1}')
    .trim()
}

/**
 * 群记号 → **纯文本面**的写法（`C_{2}\times C_{2}` → `C_2 x C_2`）。
 *
 * 两兄弟的分工，别串（U54 立的）：
 *
 * | 函数 | 落到哪 | 产出 |
 * |---|---|---|
 * | `prettySymbol` | KaTeX 渲染面（`<Tex>` / `TexOrText`） | 简化 LaTeX |
 * | `asciiSymbol`（本函数） | **报错语 / `sub` / `note` / `detail` / `title`** | **只有 ASCII** |
 *
 * ⚠️ 别写第三种"降级成 Unicode（`×` `⋊` `·`）"的函数顶上来 —— `no-unicode-leak`
 * 明令"键盘打不出的字符一律不许显示"，那几个字符都不在放行集里。
 * （从前 `ui/marks.ts` 有一把 `plainSymbol` 就是这条路，2026-10-07 删除——它没有
 * 消费者，留着只会让下一个"急用"的人踩进泄漏。）
 */
export function asciiSymbol(raw: string): string {
  return (
    prettySymbol(raw)
      // 尖括号（子群生成记号 `\langle 234\rangle`）：纯文本面写 `<234>` ——
      // 与循环记号 `(234)` 一眼能对上，比 `langle 234rangle` 好读得多。
      // `\s*` 是必须的：`\langle` 后面那个空格只是 LaTeX 的**命令分隔符**，
      // 不留（实测漏了它就成了 `< 234>`，中间多一个空格）。
      .replace(/\\langle\s*/g, '<')
      .replace(/\s*\\rangle/g, '>')
      // 细空格 `\,` / `\;` / `\:` / `\!`：纯文本面直接去掉，它不是字面内容
      .replace(/\\[,;:!]/g, '')
      .replace(/\\times/g, ' x ')
      .replace(/\\rtimes/g, ' : ')
      .replace(/\\cdot/g, ' * ')
      .replace(/\\varphi/g, 'phi')
      .replace(/\\operatorname\{([^{}]*)\}/g, '$1')
      // 剩下的命令一律只留名字（`\le` → `le`）：记号串里出现别的命令本来就是异常
      .replace(/\\([A-Za-z]+)/g, '$1')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
}
