import { isKnownGroup } from '../gal/known'
import { listCosetStripSubgroups, type Group } from '@groupviz/core'

/**
 * 「共轭类代表」子群数 —— **一个数，两处用**（`InfoDock` 的标题行与 `Workbench` 的那节）。
 *
 * ## 为什么抽到独立文件（P1，2026-10-05）
 *
 * 抽屉里要它、底部升起的工作台里也要它。若各留一份：
 *   · 两份 `WeakMap` 缓存 ⇒ 同一个群聚焦两次算两遍（`A_5` 61ms、`C_2^5` 472ms）；
 *   · 两份 `SUB_COUNT_CAP` ⇒ 改一处忘另一处，数字会打架。
 * ⇒ 判据与缓存都只留一份。**这与 `CardEditor` 是同一个道理**（三处共用外壳）。
 *
 * 移出来的另一个原因：**避免循环依赖** —— `Workbench` 要用它，而它住在 `InfoDock` 里，
 * 而 `InfoDock` 又要 import `Workbench` 那一层的东西。
 */

/**
 * 数字的**成本闸门**：阶超过它就不算（返回 0，标题行不给数字）。
 *
 * 实测一次 `listCosetStripSubgroups`：`S_4` 7ms · `A_5` 61ms · `C_2^5` 472ms · `S_5` 2.1s。
 * 成本跟着**子群个数**走、不跟阶走 —— 阶数当阈值分不开 `A_5`（60 阶 61ms）与 `S_5`。
 */
export const SUB_COUNT_CAP = 60

/** 按群对象记忆（同一个群反复聚焦只算一次）*/
const subCountCache = new WeakMap<Group, number>()

export function subgroupClassCount(group: Group): number {
  // 「已知群」没有元素表（U48）：枚举不了，标题行不给数字
  if (isKnownGroup(group)) return 0
  const hit = subCountCache.get(group)
  if (hit !== undefined) return hit
  // 与 `SubgroupsTab` **同一个表达式**（`structKey`），标题与正文的数字不许打架
  const subs = listCosetStripSubgroups(group)
  const n = new Set(subs.map((s) => s.structure ?? `阶 ${s.order}`)).size
  subCountCache.set(group, n)
  return n
}
