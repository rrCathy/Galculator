import {
  isSubgroupElementSet,
  subgroupStructureSymbol,
  type Group,
  type GroupElement,
} from '@groupviz/core'

/**
 * **一批元素本身是不是一个子群** —— 面板披露与「升格为群」按钮的唯一判据。
 *
 * ## 为什么要这个文件（而不是各处自己判）
 *
 * 用户 2026-10-23 看图质问：
 *
 * > 「只是一个元素集吗，实际上它明显可以升格为一个群（新对象）」
 *
 * 他看的是 `J = {x in A_4 : x^2 = e}` 筛出来的 4 个元素 —— 那确实是 `V_4`。
 * 但界面上它只是个圆节点加「基数 4」，**没有任何地方说"这已经是子群"**。
 * 能力（`closure`）早就有，缺的是**说出来**。
 *
 * 判据必须只有一份：面板一句"是子群"与按钮点下去真的能成，得是同一个函数
 * （`CRITERIA` 那条「形状 / 菜单 / 判据同源」的老账）。所以放这儿，别在 UI 里写第二份。
 *
 * ## 两个 core 函数的脾气（都别自己重写）
 *
 * - `isSubgroupElementSet(group, ids)` —— **收 id 不收元素**（与 `subgroupSetKey` 同坑）；
 *   `group` 为 `null`（抽象点集）时回 `false`，`unit` 那档也不用特判；
 * - `subgroupStructureSymbol(group, ids)` —— 回 **TeX**（`C_{2}\times C_{2}`），
 *   **O(|H|²)**，注释明说"仅供悬停/选中时惰性调用，不进主渲染循环"
 *   ⇒ 调用方**必须 memo**（面板里按焦点对象记忆，见 `InfoDock#ElementsOther`）。
 *
 * ## 不判的那几种
 *
 * - **空集**：数学上不是子群（子群必含单位元；空集的闭包才是 `{e}`）⇒ 一律 `false`；
 * - **抽象点集**（`group === null`）：没有乘法可判 ⇒ `false`。别退化成"取 `C_1` 当母群"。
 */

export interface SubgroupVerdict {
  /** 这批判元素在母群乘法下封闭（且非空）⇒ 它本身就是一个子群 */
  isSubgroup: boolean
  /** 子群的结构记号（**TeX**，如 `C_{2}\times C_{2}`）；core 认不出时 `null` */
  symbol: string | null
}

/** 判定一批元素是否自成一个子群。**调用方负责 memo**（O(n²)，见文件头）。 */
export function subgroupVerdict(
  group: Group | null,
  elements: readonly GroupElement[],
): SubgroupVerdict {
  if (!group || elements.length === 0) return { isSubgroup: false, symbol: null }
  const ids = elements.map((e) => e.id)
  if (!isSubgroupElementSet(group, ids)) return { isSubgroup: false, symbol: null }
  return { isSubgroup: true, symbol: subgroupStructureSymbol(group, ids) }
}
