import { useMemo } from 'react'
import katex from 'katex'

/**
 * KaTeX 渲染（UI v3 接上）。
 *
 * 分工要说清楚：**面板里用 KaTeX，画布节点标签仍用 Unicode 近似**。
 *
 * - core 的群符号本来就是 TeX（`C_{2}\times C_{2}` / `\mathbb{Z}_{6}`），
 *   喂 KaTeX 是零成本的；而 `prettySymbol` 那套 Unicode 折叠（`C₂×C₂`）
 *   在遇到 `S_{4}^{2}` / `\mathbb{Z}_{2}^{2}` 这类会失真，只配当**纯文本**场景的兜底。
 * - 画布是 SVG，KaTeX 输出的是 HTML，要塞进去得走 `<foreignObject>`，
 *   而节点尺寸是"按标签实测宽度自适应"的——那就要渲染后回量一次、再重排一次。
 *   更要命的是节点标签是**混合语义的展示串**（`Z ∩ C`、`⟨r⟩`、`Sub(D₄)` 里的
 *   `C` 是用户起的对象名），不是从 TeX 源生成的。所以画布这一层留到以后单做。
 */
export function Tex({ tex, className }: { tex: string; className?: string }) {
  const html = useMemo(() => {
    try {
      // output: 'html' —— 默认还输出一份 MathML，复制时会重复，这里不需要
      return katex.renderToString(tex, { throwOnError: false, output: 'html' })
    } catch {
      return null
    }
  }, [tex])

  if (html === null) return <span className={className}>{tex}</span>
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

/**
 * 把展示用的 TeX 片段渲染出来；若不是 TeX（用户起的中文名、`A ∩ B` 这类拼接串）
 * 就原样当文本。判断标准很粗但够用：**看起来像反斜杠/上下标/花括号的才当 TeX**。
 */
const TEX_HINT = /[\\^_{}]/

export function TexOrText({ text, className }: { text: string; className?: string }) {
  if (!TEX_HINT.test(text)) return <span className={className}>{text}</span>
  return <Tex tex={text} className={className} />
}
