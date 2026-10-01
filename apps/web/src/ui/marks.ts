/**
 * 展示层的两个小记号（多处共用）。
 */

/**
 * 第 n 项（从 1 起）的编号，如 `(3)`。
 *
 * ⚠️ **必须是 ASCII**。曾经用圈号 `①…⑳`，被 `verify/e2e/no-unicode-leak.mjs` 抓了
 * —— 用户 2026-09-27 的原话是「把键盘上打不出来的字符都处理了，**不要显示出来**」。
 * 圈号好看但敲不出来，判据不认；`(3)` 一样读得懂，还和旁边 `|H|=…` 的括号同形。
 */
export const circled = (n: number): string => `(${n})`

const SUBS: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
}
const SUPS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
}

/**
 * `C_{2}\times C_{2}` → `C₂× C₂`（SVG 里没有 KaTeX，只能降到纯文本）。
 *
 * ⚠️ 只用在**没有 KaTeX 的地方**（SVG `<text>`、`title`）。DOM 里能渲染 LaTeX
 * 的场合一律走 `<Tex>`，别拿这个降级串顶替。
 */
export function plainSymbol(tex: string | null, fallback: string): string {
  if (!tex) return fallback
  let s = tex
    .replace(/\\times\s*/g, '×')
    .replace(/\\cdot\s*/g, '·')
    .replace(/\\rtimes\s*/g, '⋊')
  s = s.replace(/\^\{?([0-9]+)\}?/g, (_, d: string) => [...d].map((c) => SUPS[c] ?? c).join(''))
  s = s.replace(/_\{?([0-9]+)\}?/g, (_, d: string) => [...d].map((c) => SUBS[c] ?? c).join(''))
  return s.replace(/[\\{}]/g, '')
}
