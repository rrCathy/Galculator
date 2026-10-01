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
 * 表格的**行 = 元素、列 = 属性**（UI v3.1 按用户要求从"列=元素"转置过来）：
 * 每行一个元素，往右看它的一串属性。数据结构仍是 facts（每元素一条）+ rows（每属性一条），
 * 转置发生在展示层（ElementsTable）。
 *
 * 属性清单照 ARCHITECTURE §4 的"元素"一行：阶 · 是否∈中心 · 共轭类 · 中心化子。
 * 枚举类调用（共轭类 / 中心化子）走 `ENUMERATION_LIMIT` 守卫，超限就留空而不是硬算。
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

export interface FactRow {
  key: string
  label: string
  values: string[]
  /** 该行的格子是否可以作为数字拖进数值区 */
  numeric: boolean
}

/**
 * 一个**共轭类**（元素表的折叠单位）。
 *
 * 同类元素天生共享全部属性（阶 / ∈Z? / 类大小 / 中心化子），把它们铺成 N 行
 * 是纯冗余 —— `S_4` 的 24 个元素折成 5 行，横向也不用再滚。
 */
export interface ConjClass {
  /** 共轭类序号（从 1 起），与 `ElementFact.classIndex` 同源 */
  index: number
  size: number
  /** 类中元素的阶（同类同阶）*/
  order: number
  inCenter: boolean
  centralizerOrder: number | null
  /** 代表元（core 给的类内第一个）*/
  rep: GroupElement
  elements: GroupElement[]
}

export interface ElementTable {
  facts: ElementFact[]
  rows: FactRow[]
  /** 共轭类（超限未枚举时为空数组）*/
  classes: ConjClass[]
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

  const byId = new Map(facts.map((f) => [f.element.id, f]))
  const classes: ConjClass[] = rawClasses.map((elems, i) => {
    const f0 = byId.get(elems[0].id)
    return {
      index: i + 1,
      size: elems.length,
      order: f0?.order ?? 0,
      inCenter: f0?.inCenter ?? false,
      centralizerOrder: f0?.centralizerOrder ?? null,
      rep: elems[0],
      elements: elems,
    }
  })

  const rows: FactRow[] = [
    { key: 'order', label: '阶', numeric: true, values: facts.map((f) => String(f.order)) },
    { key: 'center', label: '\\in Z?', numeric: false, values: facts.map((f) => (f.inCenter ? 'v' : 'x')) },
    {
      key: 'class',
      label: '共轭类',
      numeric: true,
      values: facts.map((f) => (f.classIndex === null ? '--' : String(f.classIndex))),
    },
    {
      key: 'classSize',
      label: '类大小',
      numeric: true,
      values: facts.map((f) => (f.classSize === null ? '--' : String(f.classSize))),
    },
    {
      key: 'centralizer',
      label: '中心化子',
      numeric: true,
      values: facts.map((f) => (f.centralizerOrder === null ? '--' : String(f.centralizerOrder))),
    },
  ]

  return { facts, rows, classes, capped }
}
