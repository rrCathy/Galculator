import {
  elementOrder,
  getCentralizer,
  getConjugacyClasses,
  getGroupCenter,
  type Group,
  type GroupElement,
} from '@groupviz/core'

/**
 * 元素属性汇总（元素表格的数据层）。
 *
 * 表格的**行 = 元素、列 = 属性**：每行一个元素，往右看它的一串属性。
 * 属性清单照 ARCHITECTURE §4 的"元素"一行：阶 · 是否∈中心 · 共轭类 · 中心化子。
 * 枚举类调用（共轭类 / 中心化子）走 `ENUM_CAP` 守卫，超限就留空而不是硬算。
 *
 * ⚠️ 2026-10-01 撤销 v3.2 的"按共轭类折叠"：折叠把**元素**这一层藏进了展开态，
 * 用户要看单个元素时反而看不见了。逐元素就是用户要的行粒度。
 */

const ENUM_CAP = 144

export interface ElementFact {
  element: GroupElement
  order: number
  inCenter: boolean
  /** 共轭类序号（从 1 起）；超限未枚举时为 null */
  classIndex: number | null
  classSize: number | null
  centralizerOrder: number | null
}

export interface ElementTable {
  facts: ElementFact[]
  /** 群太大，共轭类 / 中心化子未枚举（不静默失败） */
  capped: boolean
}

export function buildElementTable(group: Group): ElementTable {
  const capped = group.order > ENUM_CAP

  const center = capped ? new Set<string>() : new Set(getGroupCenter(group).map((e) => e.id))
  const rawClasses = capped ? [] : getConjugacyClasses(group)
  const classOf = new Map<string, { index: number; size: number }>()
  rawClasses.forEach((cls, i) => {
    for (const e of cls) classOf.set(e.id, { index: i + 1, size: cls.length })
  })

  const facts: ElementFact[] = group.elements.map((e) => {
    const cls = classOf.get(e.id)
    return {
      element: e,
      order: elementOrder(group, e),
      inCenter: center.has(e.id),
      classIndex: cls?.index ?? null,
      classSize: cls?.size ?? null,
      centralizerOrder: capped ? null : getCentralizer(group, [e]).length,
    }
  })

  return { facts, capped }
}
