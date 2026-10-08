/**
 * Unicode 展示串 → LaTeX（U4）。
 *
 * 为什么需要它：**core 给的群符号本来就是 TeX**（`S_{4}` / `C_{2}^{2}`），
 * 直接喂 KaTeX 就行；但画布/面板上大量标签是**拼装出来的展示串**——
 * `Z ∩ C`、`Sub(D₄)`、`ker(S₄ → S₃)`、`map(G, A, r→0, s→0)`。
 * 它们不是从 TeX 源生成的，要把它们也渲染成数学排版，只能**反推**。
 *
 * 转换是保守的：认得出就转，认不出就原样留着（KaTeX 的 `throwOnError: false`
 * 会把认不出的部分画成红字，比整行退化成纯文本更容易发现）。
 */
import { SUB_FROM, SUP_FROM, UNICODE_TO_TEX } from './pretty'

/* ── 上下标 ────────────────────────────────────────────── */

/**
 * 表在 `pretty.ts` —— 与**展示方向**的正向表（`4` → `₄`）搁在一处。
 *
 * 同一件事写两张表，"能显示成什么样"与"能敲回去什么"就会慢慢对不上，
 * 而本项目有条铁律叫「展示成什么样，就得照着敲回去」。这里只负责把它们
 * 渲染成 TeX 的 `_{…}` 形态（回认用的 `_x` 形态见 `normalizeScript`）。
 */
const SUB_RE = new RegExp(`[${Object.keys(SUB_FROM).join('')}]+`, 'g')
const SUP_RE = new RegExp(`[${Object.keys(SUP_FROM).join('')}]+`, 'g')

/* ── 运算符与希腊字母 ──────────────────────────────────── */


/**
 * 多字母的**函数名**要包成 `\operatorname{}`，否则 KaTeX 会把 `Sub` 当成
 * `S·u·b` 三个变量的连写（数学排版里那确实是乘积的意思，但这里不是）。
 * 单字母的 `Z` / `C` / `N` 不在此列——它们是群名。
 */
const FUNC_NAMES = [
  // 操作名（`Aut(S_4)` / `ker f` / `im f` …）
  'pSub', 'Sub', 'Syl', 'Sylow', 'Aut', 'Orb', 'Stab', 'Fix', 'ord', 'ker', 'im', 'det',
  // 群名（2026-10-08 补：群库/识别结果里 `SL(2,3)` / `SmallGroup(16,13)` / `QD_{16}`
  // 这类多字母记号的字母段要正体，否则 KaTeX 把它们排成斜体字母连乘）
  'SL', 'PSL', 'PGL', 'GL', 'QD', 'SmallGroup',
]

/**
 * 中文串要包进 `\text{}`——math mode 下的 CJK 会渲染失败。
 *
 * ⚠️ **连它两侧的空格一起包**（2026-09-27）。math mode 会**吃掉输入里的空格**，
 * 所以 `1 (mod p) 且 n_p | m` 里那些空格在渲染时全没了，出来是 `1(modp)且np|m` ——
 * 挤成一团。把空格放进 `\text{}` 里就成了真的间距（`\text{ 且 }`）。
 */
const CJK_RE = / *[\u4e00-\u9fff\u3000-\u303f，。：；、（）]+ */g

/** 已经是 `\text{...}` 的段落不动；**裸的**中文段（含两侧空格）包起来。 */
const TEX_OR_CJK_RE = /\\text\{[^}]*\}| *[\u4e00-\u9fff\u3000-\u303f，。：；、（）]+ */g

function wrapCJK(s: string): string {
  return s.replace(TEX_OR_CJK_RE, (m) => (m.startsWith('\\text{') ? m : `\\text{${m}}`))
}

const cache = new Map<string, string>()

/**
 * **生料花括号转义**（2026-10-07）：展示串里用户写的 `{a, b, c}` 要显示成**真花括号**，
 * 不能让 KaTeX 把它们当分组吃掉（否则 def 行 `X = {a, b, c}` 渲染成 `X = a,b,c`）。
 *
 * 两条豁免（用栈配对，外层保留组里的花括号跟着保留）：
 *   · 前一个字符是 `\` —— 已经转义过的（`\{a\}`）；
 *   · 前一个字符是 `_` / `^` —— 上下标的分组（`C_{2}`），那是 TeX 语法不是生料。
 *
 * ⚠️ 这一步在**所有改写之前**跑：`_{…}` / `\text{…}` / `\operatorname{…}` 都是
 * 后面几步才生成的，生成出来的花括号天然不受影响。
 */
function escapeRawBraces(s: string): string {
  let out = ''
  const stack: boolean[] = [] // true = 保留（TeX 语法），false = 转义（生料）
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    const prev = s[i - 1] ?? ''
    if (c === '{') {
      const kept = prev === '\\' || prev === '_' || prev === '^' || stack[stack.length - 1] === true
      stack.push(kept)
      out += kept ? '{' : '\\{'
      continue
    }
    if (c === '}') {
      const kept = stack.pop() ?? false
      out += kept ? '}' : '\\}'
      continue
    }
    out += c
  }
  return out
}

/**
 * **已经是 LaTeX 的串**：含 `\命令`（`\hookrightarrow` / `\operatorname{Aut}` / `\pi_1`）。
 *
 * 判据用"反斜杠 + 字母"而不是"含反斜杠"：集合差 `A \ B` 里的孤立反斜杠不算命令，
 * 它还是需要过下面那道 Unicode 转换的。
 */
const ALREADY_TEX = /\\[A-Za-z]/

/**
 * 把展示串转成 LaTeX。**幂等**（2026-09-27 起）。
 *
 * 为什么要明说幂等：这轮的文本形态约定改成"面向用户的串一律是简化 LaTeX"之后，
 * `label` 常常**本身就是 TeX**（`\hookrightarrow` · `\operatorname{Aut}(S_4)` · `\pi_1`），
 * 而不再是从前那种"Unicode 展示串"。对它们再走一遍下面的替换会出事：
 *
 *   · `FUNC_NAMES` 的 `\bker\b` 会命中 `\ker` 里的 `ker`（`\` 与 `k` 之间有词边界）
 *     → `\\operatorname{ker}`，KaTeX 直接报错；
 *   · 已经是 `\text{中文}` 的会被**再包一层** `\text{}`。
 *
 * 所以含 LaTeX 命令的一律**原样放行**——这也是"显示与渲染同源"的落地：
 * 同一个形态，不需要来回翻译。
 */
export function toTex(label: string): string {
  const hit = cache.get(label)
  if (hit !== undefined) return hit

  if (ALREADY_TEX.test(label)) {
    // 已经是 LaTeX 的串原样放行（见上面的理由），**但中文还是要包** ——
    // 否则 math mode 会把中文旁边的空格吃掉，渲染出来挤成一团。
    const out = cache.get(`cjk:${label}`) ?? wrapCJK(label)
    cache.set(`cjk:${label}`, out)
    cache.set(label, out)
    return out
  }

  let s = label

  // ⓪ 生料花括号先转义（`{a, b, c}` 要显示成真花括号，见 `escapeRawBraces`）
  s = escapeRawBraces(s)

  // ① Unicode 上下标 → _{...} / ^{...}
  s = s.replace(SUB_RE, (m) => `_{${[...m].map((c) => SUB_FROM[c] ?? c).join('')}}`)
  s = s.replace(SUP_RE, (m) => `^{${[...m].map((c) => SUP_FROM[c] ?? c).join('')}}`)

  // ② 运算符 / 希腊字母
  for (const [from, to] of UNICODE_TO_TEX) {
    if (s.includes(from)) s = s.split(from).join(to)
  }

  // ③ 函数名 → \operatorname{}
  //
  // ⚠️ 边界判据（2026-10-08 换）：从前是 `\b${name}\b`，而 `\b` 只认 ASCII 词字符 ——
  // `QD_{16}` 里的 `QD` 后跟 `_`（也是词字符）⇒ **无边界、匹配不上**，于是 `QD` 排成
  // 斜体字母连乘。换成"前后非字母"（后瞻允许 `_`），顺带把已转义形态 `\SL` 挡在外面。
  for (const name of FUNC_NAMES) {
    const re = new RegExp(`(?<![A-Za-z\\\\])${name}(?![A-Za-z])`, 'g')
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
  // 含 LaTeX 命令（`\hookrightarrow` / `\operatorname{Aut}`）· Unicode 数学字符（老数据）·
  // 上下标标记 · 中文 —— 都值得过一遍 KaTeX。纯 ASCII 名字（`A`、`G`）跳过。
  return /\\[A-Za-z]|[₀-₉⁰-⁹∩∪×→↦↪≅⊆⊂∈⊴⟨⟩∘∖α-ωΑ-Ω^_{}\u4e00-\u9fff]/.test(label)
}
