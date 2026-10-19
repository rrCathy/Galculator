import type { Group, GroupElement } from '@groupviz/core'

/**
 * 「母群指针」——app 侧的账外索引（core 的 `Group` 没有这个字段）。
 *
 * 子群升格成真群对象（`buildSubgroupGroup`）之后，**它自己**就是 `group`；
 * 于是"这两样东西该在哪个群里做运算"这条信息就丢了。实测病征（2026-09-29）：
 *   - `closure(S_4,(12)) · closure(S_4,(34))` 误报"两边不是同一个群里的子群"（其实都在 S₄ 里，
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
 * 一路回溯到最外层那个群（`closure(closure(G,…),…)` 也要能追到 G）。
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

/**
 * 两个群是不是"同一个群"：引用相等最快；否则要**符号 + 阶 + 元素 id** 全对得上，
 * 再**对拍乘法表**。
 *
 * ## 为什么要对表（2026-10-19）
 *
 * 从前这条只比 `符号 + 阶 + 元素 id`，注释里还写着"符号是会撒谎的"——可真正会撒谎的是
 * **元素 id**：core 的 `createGroupFromImport` 给任何导入群的元素一律起 `g0…g(n-1)`，
 * 符号一律 `Import(n)`。于是用户在结构面板手写两张 4 阶表（一张 C₄、一张 V₄，标号都是
 * 1…4），两边的指纹**一模一样**：`sameGroup` 判 true ⇒ `sameWorld` / `idsComparable`
 * 全放行 ⇒ 包含说"元素完全相同，就是同一个群"、识别把 V₄ 认成 C₄、同构判定说它们同构。
 *
 * 真值只有乘法表：**表不同就是两个群**，哪怕名字与编号全一样。
 *
 * ## 顺序与成本
 *
 * ① 引用 → ② 符号/阶 → ③ 元素 id 集合：都是 O(1)/O(n)，绝大多数比较死在这里。
 * ④ 只有前三关全过才可能对表 —— 先比**生成元那一行**（O(k·n)，C₄ vs V₄ 当场分开），
 *    全过再比全表（O(n²)，只在这种"疑似同一个群"的少数情形付一次）。
 * ⑤ 两边都是**自证式 id**（置换群的 `1,2,3,4` 就是那个置换）时免检：id 相同 ⟹ 元素相同、
 *    合成相同。这一条保住"两个独立构造的 S₄ / A₄ 仍能直接互比"的老行为。
 */
export function sameGroup(a: Group, b: Group): boolean {
  if (a === b) return true
  if (a.symbol !== b.symbol || a.order !== b.order) return false
  // 同符号同阶还不够：**元素 id 也要对得上**。符号是会撒谎的（两个各自构造的群
  // 可以被起成同一个记号），拿"看着一样"当"就是同一个"会让上下文群选错。
  const ids = new Set(a.elements.map((e) => e.id))
  if (!b.elements.every((e) => ids.has(e.id))) return false
  // 置换 id 自证：id 就是元素本身，表由合成唯一决定 —— 免检。
  if (idsAreSelfDescribing(a) && idsAreSelfDescribing(b)) return true
  return tableEqual(a, b)
}

/** `sameGroup` 的对表结果（WeakMap：群对象回收，记录跟着走）。 */
const TABLE_EQ = new WeakMap<Group, WeakMap<Group, boolean>>()

/** 两张表是否逐格相同（元素按 id 一一对应）。成本见 `sameGroup` 的注释。 */
function tableEqual(a: Group, b: Group): boolean {
  const hit = TABLE_EQ.get(a)?.get(b)
  if (hit !== undefined) return hit

  const eq = computeTableEqual(a, b)
  let row = TABLE_EQ.get(a)
  if (!row) {
    row = new WeakMap()
    TABLE_EQ.set(a, row)
  }
  row.set(b, eq)
  return eq
}

function computeTableEqual(a: Group, b: Group): boolean {
  const byId = new Map<string, GroupElement>()
  for (const e of b.elements) byId.set(e.id, e)
  const pairs: [GroupElement, GroupElement][] = []
  for (const e of a.elements) {
    const bx = byId.get(e.id)
    if (!bx) return false
    pairs.push([e, bx])
  }

  // ④-快筛：生成元那一行。生成元少（通常 2 个），C₄/V₄ 这类当场分开。
  for (const gen of a.generators) {
    let ga: GroupElement | null = null
    try {
      ga = gen.apply(a.identity)
    } catch {
      ga = null
    }
    if (!ga) continue
    const gb = byId.get(ga.id)
    if (!gb) return false
    for (const [x, bx] of pairs) {
      if (a.multiply(ga, x).id !== b.multiply(gb, bx).id) return false
    }
  }

  // ④-全表
  for (const [x, bx] of pairs) {
    for (const [y, by] of pairs) {
      if (a.multiply(x, y).id !== b.multiply(bx, by).id) return false
    }
  }
  return true
}

/**
 * 两边是不是**同一个世界**里的元素 —— 光看 id 不算数！
 *
 * 记号建出来的抽象群元素 id 全是 `e0 e1 …`，**跨群会串号**（2026-09-29 实测）：
 * `C_3` 的元素 `e0 e1 e2` 在 `C_7` 的表里恰好**也有**（`e0…e6`），可它们不是同一个东西 ——
 * 只按 id 判会把 `C_3 ∩ C_7` 算成"3 个元素"（既不是子群、也不是真交集）。
 *
 * 判据：**根相同**（`sameGroup(rootOf(a), rootOf(b))`）。两种情形都照顾到：
 *   - 同一条母群链上的子群（`closure(G,(12))` 与 `closure(G,(34))`）→ 根都是 G ✓；
 *   - 内联记号与具名对象（`closure(S_4, 34, 12)` 与 `G = S_4`）→ 根不同但 sameGroup 成立 ✓。
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
