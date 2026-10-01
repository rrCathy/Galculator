import {
  findAllSubgroups,
  getGeneratorElements,
  subgroupStructureSymbol,
  type Group,
  type GroupElement,
  type Subgroup,
} from '@groupviz/core'

/**
 * 「G 里有没有与 H 同构的子群」—— **独立构造的两个群之间唯一的桥**。
 *
 * 两个各自建出来的群（`S_4` 与 `V_4`）元素 id 空间互不相通：前者是置换本身，
 * 后者是抽象记号 `e a b c`。core 没有"跨 id 空间建映射"的原语
 * （`autoBuildMapping` 只对循环群有结果），所以可行做法只有一条：
 * **在母群里搜同构的子群，然后直接用那个子群**。
 *
 * 这个模块把这条搜索抽出来，供三处共用（**判据同源**，不许各写一份）：
 *   · `relations.ts#containment` 的**第二关**（嵌入）——本文件的主要新增消费者；
 *   · `ops.ts` 的求商 / 陪集作用自动翻译（U30）与报错时的"可照抄配方"（U29）；
 *   · `ops.ts` 集合运算的候选对齐（U32）。
 *
 * 判定用 `subgroupStructureSymbol`（阶 + 结构符号）。它不是完整的同构不变量，
 * 但 **core 自己就用它做 `detectIsomorphicGroup` 的同款判定**，且算不出符号时
 * 一律返回 `null`（宁可"不猜"，也不给可能错的结论）。
 */

/**
 * 子群枚举的规模上限（与 core 的 `ENUMERATION_LIMIT = 144` 同量级，
 * 项目内一直用 120）。超了**不枚举**：调用方据此说"未判定"，不许改口说"不是"。
 */
export const ENUM_LIMIT = 120

/** 元素表里有没有**陪集元素**（商群的元素）。跨"层级"的翻译靠它守。 */
export function hasCosetElements(g: Group): boolean {
  return g.elements.some((e) => (e.cosetMemberLabels?.length ?? 0) > 0)
}

/**
 * `findAllSubgroups` 的结果按**群对象**记忆。
 *
 * 从 2026-09-30 起这条搜索进了拖拽路径（`pairOps` → `containment`），
 * 而实测开销差得很远：`S_4`(24) 3ms、`A_5`(60) 57ms、`S_5`(120) 1.2s。
 * 同一个群问第二次不该再付一次钱 —— `WeakMap` 保证群对象回收时记录跟着走。
 */
const SUBS = new WeakMap<Group, Subgroup[]>()

function allSubgroups(G: Group): Subgroup[] {
  const hit = SUBS.get(G)
  if (hit) return hit
  const out = findAllSubgroups(G)
  SUBS.set(G, out)
  return out
}

/**
 * 在 `G` 里找与 `S` 同构（同阶 + 同结构符号）的子群。
 *
 * 三道守卫任一不满足就返回 `null`（调用方退回中性措辞，不硬编建议）：
 * 阶超枚举上限 / 结构符号算不出 / 枚举抛错。只在**报错、翻译与包含判定**路径上调用。
 *
 * 结构符号跨母群**形式一致**（实测：`V_4` 自身与 `A_4` 的那个 Klein 子群
 * 都算出 `C_{2}\times C_{2}`），所以可以直接比字符串。
 */
export function isomorphicSubgroupsIn(
  G: Group,
  S: { group: Group; elements: GroupElement[] },
): Subgroup[] | null {
  if (G.order > ENUM_LIMIT || S.elements.length === 0) return null
  let want: string | null
  try {
    want = subgroupStructureSymbol(S.group, S.elements.map((e) => e.id))
    if (!want) return null
    const out = allSubgroups(G).filter(
      (h) =>
        h.order === S.elements.length &&
        subgroupStructureSymbol(G, h.elements.map((e) => e.id)) === want,
    )
    /**
     * `findAllSubgroups` **不含 G 自身** —— 而"与 S 同构的子群"完全可能就是 G 自己：
     * `商(V_4, 独立 V_4)`（→ 平凡商）、`Klein × 独立 V_4`（↔ V₄ 整个映到它）都要它。
     * 补进候选：`G ⊴ G` 恒正规，生成元取声明的那组。
     */
    if (
      G.order === S.elements.length &&
      subgroupStructureSymbol(G, G.elements.map((e) => e.id)) === want
    ) {
      out.push({
        elements: G.elements,
        order: G.order,
        index: 1,
        generators: getGeneratorElements(G).map((x) => x.el),
        isNormal: true,
      })
    }
    return out
  } catch {
    return null
  }
}
