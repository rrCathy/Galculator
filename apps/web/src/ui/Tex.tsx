import { useMemo } from 'react'
import katex from 'katex'
import { shouldTex, toTex } from '../gal/tex'

/**
 * KaTeX 渲染（面板 + 画布）。
 *
 * 分工在这轮（U4）改了：**两处都走 KaTeX**。原先"画布用 Unicode 近似"的
 * 三条理由现在都能对付过去：
 *
 *  1. SVG 里塞 HTML —— 走 `<foreignObject>`（现代浏览器都支持）；
 *  2. 尺寸要渲染后回量 —— 改用**离屏测量**（`measureTex`）：同一个标签只量一次、
 *     结果缓存，而且换 KaTeX 之后量得**比原来的字符宽度估算更准**；
 *  3. 标签是混合语义串（`Z ∩ C`、`Sub(D₄)`）—— 新增 `gal/tex.ts` 的 `toTex()`
 *     把 Unicode 展示串反推成 LaTeX（`Z \cap C`、`\operatorname{Sub}(D_{4})`）。
 */

const OPTIONS = { throwOnError: false, output: 'html' } as const

/** 渲染一段 TeX 为 HTML；失败返回 null（调用方降级成纯文本）。 */
export function renderTex(tex: string): string | null {
  try {
    return katex.renderToString(tex, OPTIONS)
  } catch {
    return null
  }
}

/**
 * 展示串 → KaTeX HTML（先反推 LaTeX）。
 *
 * **不做"像不像 TeX"的猜测**：`toTex` 对纯 ASCII 是恒等变换，
 * 于是 `A` 也进 KaTeX（渲染成数学斜体 A，在数学语境里本来就更对）。
 */
const htmlCache = new Map<string, string | null>()

export function labelTexHtml(label: string): string | null {
  const hit = htmlCache.get(label)
  if (hit !== undefined) return hit
  const out = renderTex(toTex(label))
  htmlCache.set(label, out)
  return out
}

/* ── 离屏测量：画布节点尺寸自适应的依据 ─────────────────── */

let host: HTMLDivElement | null = null
const sizeCache = new Map<string, { w: number; h: number }>()

/**
 * 量一个标签在给定字号下占多大（返回 CSS 像素 = SVG 世界单位）。
 *
 * 离屏容器一次创建、反复使用；结果按 `标签@字号` 缓存。
 * 字体异步加载会让首帧偏窄，所以 `document.fonts.ready` 之后清一次缓存。
 */
export function measureTex(label: string, fontPx: number): { w: number; h: number } | null {
  if (typeof document === 'undefined') return null
  const key = `${label}@${fontPx}`
  const hit = sizeCache.get(key)
  if (hit) return hit

  const html = labelTexHtml(label)
  if (html === null) return null

  if (!host) {
    host = document.createElement('div')
    host.style.cssText =
      'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;white-space:nowrap;'
    document.body.appendChild(host)
  }
  host.style.fontSize = `${fontPx}px`
  host.innerHTML = html
  const el = host.firstElementChild as HTMLElement | null
  const rect = el?.getBoundingClientRect()
  if (!rect) return null
  const out = { w: rect.width, h: rect.height }
  sizeCache.set(key, out)
  return out
}

if (typeof document !== 'undefined' && document.fonts?.ready) {
  void document.fonts.ready.then(() => sizeCache.clear())
}

/* ── 组件 ─────────────────────────────────────────────── */

export function Tex({ tex, className }: { tex: string; className?: string }) {
  const html = useMemo(() => renderTex(tex), [tex])
  if (html === null) return <span className={className}>{tex}</span>
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

/**
 * 把展示串渲染出来——**能转 TeX 就转**（`shouldTex` 只用来挡纯粹的 ASCII 名字，
 * 那种情况 KaTeX 与纯文本视觉差别很小，不如省一次排版）。
 */
export function TexOrText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => (shouldTex(text) ? renderTex(toTex(text)) : null), [text])
  if (html === null) return <span className={className}>{text}</span>
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
