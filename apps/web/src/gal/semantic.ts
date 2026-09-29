import type { GroupElement } from '@groupviz/core'

/**
 * 元素在**语义上**的键（G4）——跨母群比较元素时用。
 *
 * ## 为什么不能用 id
 *
 * 群元素 id 只在**它自己的母群里**有意义：
 *   · core 的商群元素 id 是 `qcoset-<i>`，`i` 是它**在自己母群里的陪集序**；
 *     于是 `(A₄/V₄)` 的第 1 个陪集与 `(S₄/V₄)` 的第 1 个陪集**通常不是同一个**，
 *     id 同名纯属两边各自编号的巧合（U29 的账：直接按 id 查会"侥幸命中另一个陪集"）。
 *   · 普通元素（置换 / 抽象记号）又恰好相反：**id 就是身份**（`1,3,4,2` 是那个置换）。
 *
 * 所以：**陪集元素**按"成员集合"比（core 在商群元素上留了 `cosetMemberLabels`），
 * 其余按 id 比。
 *
 * ## 成员记号要先归一（2026-09-29，第三同构 `(G/N)/(K/N)` 实测）
 *
 * 同一批元素，core 在**不同母群**里给的 label 口径不一致：`(234)`（A₄ 的商）与
 * `234`（S₄ 的商）是同一个 3-轮换的两种写法。陪集只留了 label（没留 id）——
 * 直接按 label 比，`(A₄/V₄)` 与 `(S₄/V₄)` 的公共陪集就对不上，
 * 第三同构 `B/A` 整条链断在"对齐"这一步。`canonicalMemberLabel` 把置换记号
 * 化成**唯一写法**再比：解析成轮换 → 每个从最小元起写、轮换按首元排序。
 */

/**
 * 置换记号的规范形态：`(234)` / `234` → `(2,3,4)`；`(12)(34)` → `(1,2)(3,4)`；
 * `1324` → `(1,3,2,4)`。认不出来（`a`、`a^2 b`、`e`、含逗号的元组）**原样返回**。
 */
export function canonicalMemberLabel(label: string): string {
  const s = label.trim()
  if (!s || !/^[0-9()\s]+$/.test(s)) return s
  // 括号里带逗号（元组写法，如 `(1,0)`）不是置换记号 —— 别猜
  if (s.includes(',')) return s
  const parts = s.match(/\([^)]*\)|[0-9]+/g)
  if (!parts || parts.length === 0) return s
  const cycles: number[][] = []
  for (const p of parts) {
    const digits = p.replace(/[()\s]/g, '')
    if (!digits) return s
    cycles.push([...digits].map(Number))
  }
  const canon = cycles
    .map((c) => {
      const i = c.indexOf(Math.min(...c))
      return [...c.slice(i), ...c.slice(0, i)]
    })
    .sort((a, b) => a[0] - b[0] || a.length - b.length)
    .map((c) => (c.length === 1 ? String(c[0]) : `(${c.join(',')})`))
    .join('')
  return canon || s
}

/** 元素的语义键：陪集走成员集合（规范化后排序），普通元素走 id。 */
export function elementSemanticKey(e: GroupElement): string {
  const cl = e.cosetMemberLabels
  if (cl && cl.length > 0) {
    return `coset:${cl.map(canonicalMemberLabel).sort().join(',')}`
  }
  return `elt:${e.id}`
}
