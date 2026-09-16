import {
  elementOrder,
  getCentralizer,
  getConjugacyClasses,
  getGroupCenter,
  type Group,
  type GroupElement,
} from '@groupviz/core'

/**
 * 元素属性汇总（UI v3 的元素横滚表格）。
 *
 * 表格的**列 = 元素、行 = 属性**（交互模型里明确要转置过来）：
 * 交换图上的每个元素占一列，往下看它的一串属性；元素多时横向滚动，行首列粘住。
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

export interface ElementTable {
  facts: ElementFact[]
  rows: FactRow[]
  /** 群太大，共轭类 / 中心化子未枚举（不静默失败） */
  capped: boolean
}

export function buildElementTable(group: Group): ElementTable {
  const capped = group.order > ENUM_CAP

  const center = capped ? new Set<string>() : new Set(getGroupCenter(group).map((e) => e.id))
  const classOf = new Map<string, { index: number; size: number }>()
  if (!capped) {
    getConjugacyClasses(group).forEach((cls, i) => {
      for (const e of cls) classOf.set(e.id, { index: i + 1, size: cls.length })
    })
  }

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

  const rows: FactRow[] = [
    { key: 'order', label: '阶', numeric: true, values: facts.map((f) => String(f.order)) },
    { key: 'center', label: '∈Z?', numeric: false, values: facts.map((f) => (f.inCenter ? '✓' : '✗')) },
    {
      key: 'class',
      label: '共轭类',
      numeric: true,
      values: facts.map((f) => (f.classIndex === null ? '—' : String(f.classIndex))),
    },
    {
      key: 'classSize',
      label: '类大小',
      numeric: true,
      values: facts.map((f) => (f.classSize === null ? '—' : String(f.classSize))),
    },
    {
      key: 'centralizer',
      label: '中心化子',
      numeric: true,
      values: facts.map((f) => (f.centralizerOrder === null ? '—' : String(f.centralizerOrder))),
    },
  ]

  return { facts, rows, capped }
}
