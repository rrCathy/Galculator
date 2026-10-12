/**
 * 主题（W1，2026-10-12 用户拍板：**默认浅色，手动切换**）。
 *
 * - 载体：`document.documentElement` 的 `data-theme` 属性（缺省 / `light` = 浅色，`dark` = 深色）。
 * - 默认浅色；深色仅在用户手动切换后启用（口味见 PROPOSAL-ui-refresh：深色 = 仪器台，
 *   浅色 = 演算纸（W2 落地））。
 * - 持久化用**独立 key**（不动 `galculator.settings:v1` —— 那里是 `autoFirstIso`，
 *   两边共用一个 key 会互相覆盖）。
 * - 走查参数 `?theme=dark` **强制**深色且**不写** localStorage（深色截图 / 对比度巡检用，
 *   与 `?empty=1` 同族纪律）。
 * - `main.tsx` 在 React 挂载**之前**同步调用 `applyTheme(loadTheme())`，防首帧闪烁。
 */

export type Theme = 'light' | 'dark'

const THEME_KEY = 'galculator.theme:v1'

/** 初始主题：`?theme=` 强制 > localStorage > 默认浅色。 */
export function loadTheme(): Theme {
  try {
    if (typeof location !== 'undefined') {
      if (location.search.includes('theme=dark')) return 'dark'
      if (location.search.includes('theme=light')) return 'light'
    }
    if (typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEY) === 'dark') {
      return 'dark'
    }
  } catch {
    /* 隐私模式读不了——不影响本次会话 */
  }
  return 'light'
}

/** 把主题写到 `<html data-theme>`（CSS 变量按它切换）。 */
export function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = t
}

/** 手动切换时持久化（URL 强制模式下由用户点击触发，照存）。 */
export function saveTheme(t: Theme) {
  try {
    localStorage.setItem(THEME_KEY, t)
  } catch {
    /* 隐私模式写不了——不影响本次会话 */
  }
}
