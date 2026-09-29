import type { Group } from '@groupviz/core'

/**
 * 「母群指针」——app 侧的账外索引（core 的 `Group` 没有这个字段）。
 *
 * 子群升格成真群对象（`buildSubgroupGroup`）之后，**它自己**就是 `group`；
 * 于是"这两样东西该在哪个群里做运算"这条信息就丢了。实测病征（2026-09-29）：
 *   - `闭包(S_4,(12)) · 闭包(S_4,(34))` 误报"两边不是同一个群里的子群"（其实都在 S₄ 里，
 *     只是拿 K₁ 当上下文群去乘 K₂ 的元素，乘不动）；
 *   - 独立构造的 `V_4` 与 `A_4` 做交 / 并 / 差 / 积集时，母群只能瞎猜一边。
 *
 * 建群的那一刻把母群记在这里 —— `WeakMap`：群对象在，记录就在；对象被回收，
 * 记录跟着走（不会拖住内存，也不需要"清理"）。
 *
 * ⚠️ 只记**应用层建出来的子群**（`subgroupGroupOf` / `build.ts` 的 `im φ` 之类）；
 * core 自己造的群（商群 / 直积 / 自同构群）语义上不是"某群里的子群"，不记。
 */
const PARENT = new WeakMap<Group, Group>()

/** 记下"这个群是从谁那里长出来的"（返回 child，方便链式写）。 */
export function rememberParent(child: Group, parent: Group): Group {
  if (child !== parent) PARENT.set(child, parent)
  return child
}

/** 直接母群（没记过 → `null`）。 */
export function parentOf(g: Group): Group | null {
  return PARENT.get(g) ?? null
}

/**
 * 一路回溯到最外层那个群（`闭包(闭包(G,…),…)` 也要能追到 G）。
 * 有环也停得住（防御性：真出现环时最多走 64 层就放弃）。
 */
export function rootOf(g: Group): Group {
  let cur = g
  for (let i = 0; i < 64; i++) {
    const p = PARENT.get(cur)
    if (!p) return cur
    cur = p
  }
  return cur
}

/** 两个群是不是"同一个群"：引用相等最快；否则要**符号 + 阶 + 元素 id** 全对得上。 */
export function sameGroup(a: Group, b: Group): boolean {
  if (a === b) return true
  if (a.symbol !== b.symbol || a.order !== b.order) return false
  // 同符号同阶还不够：**元素 id 也要对得上**。符号是会撒谎的（两个各自构造的群
  // 可以被起成同一个记号），拿"看着一样"当"就是同一个"会让上下文群选错。
  const ids = new Set(a.elements.map((e) => e.id))
  return b.elements.every((e) => ids.has(e.id))
}

/**
 * 两边是不是**同一个世界**里的元素 —— 光看 id 不算数！
 *
 * 记号建出来的抽象群元素 id 全是 `e0 e1 …`，**跨群会串号**（2026-09-29 实测）：
 * `C_3` 的元素 `e0 e1 e2` 在 `C_7` 的表里恰好**也有**（`e0…e6`），可它们不是同一个东西 ——
 * 只按 id 判会把 `C_3 ∩ C_7` 算成"3 个元素"（既不是子群、也不是真交集）。
 *
 * 判据：**根相同**（`sameGroup(rootOf(a), rootOf(b))`）。两种情形都照顾到：
 *   - 同一条母群链上的子群（`闭包(G,(12))` 与 `闭包(G,(34))`）→ 根都是 G ✓；
 *   - 内联记号与具名对象（`闭包(S_4, 34, 12)` 与 `G = S_4`）→ 根不同但 sameGroup 成立 ✓。
 */
export function sameWorld(a: Group, b: Group): boolean {
  return sameGroup(rootOf(a), rootOf(b))
}

/**
 * 元素 id 是不是**自证式**的：id 就是元素本身的编码（置换群的 `1,2,3,4`）。
 *
 * 这类 id **跨群也有意义**——各自造出来的 `A_4` 与 `S_4`，id 对得上就是同一个置换
 * （`relations.containment` 那条"独立定义之间发现包含"的路就靠它）。
 * 而 `e0 e1 …` / `r0 r1 …` / `g0 g1 …`（循环群 / 抽象群的下标）只是**群内编号**，
 * 跨群会撞号：`C_3` 的 `e0 e1 e2` 在 `C_7` 的 `e0…e6` 里"也有"，却是不同的元素。
 */
export function idsAreSelfDescribing(g: Group): boolean {
  return g.elements.length > 0 && g.elements.every((e) => e.id === e.value.join(','))
}

/**
 * 两边的元素 id 能不能**直接对着读**（做交 / 并 / 差 / 积集、判子群时要的是这个）：
 *   · 同一个世界（同一条母群链，根相同）→ 能；
 *   · 都是自证式 id（两张各自造的置换群）→ 能；
 *   · 其余（`C_3` 与 `C_7` 这种下标编号）→ **不能**，id 只是碰巧重合。
 */
export function idsComparable(a: Group, b: Group): boolean {
  return sameWorld(a, b) || (idsAreSelfDescribing(a) && idsAreSelfDescribing(b))
}
