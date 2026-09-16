import type { GalObject } from './types'

/**
 * 数值区（UI v3，左下的上拉面板）。
 *
 * 只放两种东西——这正是用户定的口子：
 *   1. **拖动收集**：在别的面板（元素表的"阶"、子群列表的"|H|"…）看到的数字，直接拖进来；
 *   2. **用户计算**：`n = ord(G, r2)` 这类主动算出来的数值。
 *
 * 两者在数据上是同一件事（一个标签 + 一个数），只是来源标一下，键前缀不同以免撞。
 */
export interface NumericEntry {
  key: string
  label: string
  value: number
  source: 'drag' | 'computed'
}

/** 拖拽载荷的 MIME：dragstart 写它、drop 读它。 */
export const DND_NUMBER = 'application/x-gal-number'

export function parseNumberPayload(dt: DataTransfer): { label: string; value: number } | null {
  const raw = dt.getData(DND_NUMBER)
  if (raw) {
    try {
      const o = JSON.parse(raw) as { label?: unknown; value?: unknown }
      if (typeof o.value === 'number') {
        return { label: String(o.label ?? o.value), value: o.value }
      }
    } catch {
      /* 落到 text/plain 分支 */
    }
  }
  const text = dt.getData('text/plain')
  if (!text) return null
  const n = Number(text)
  return Number.isFinite(n) ? { label: text, value: n } : null
}

/** 把对象表里产数值的那些行收成数值区条目。 */
export function computedNumbers(objects: GalObject[]): NumericEntry[] {
  return objects
    .filter((o) => o.value.type === 'number')
    .map((o) => ({
      key: `c:${o.id}`,
      label: `${o.id} = ${o.def}`,
      value: o.value.type === 'number' ? o.value.value : 0,
      source: 'computed' as const,
    }))
}
