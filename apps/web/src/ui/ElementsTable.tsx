import { useMemo, type DragEvent } from 'react'
import type { Group } from '@groupviz/core'
import { buildElementTable } from '../gal/summary'
import { TexOrText } from './Tex'
import { DND_NUMBER } from '../gal/numeric'

/** 拖到数值区的载荷类型（dragstart 时写、drop 时读）。 */
export function writeNumberPayload(e: DragEvent, label: string, value: number) {
  const payload = JSON.stringify({ label, value })
  e.dataTransfer.setData(DND_NUMBER, payload)
  e.dataTransfer.setData('text/plain', String(value))
  e.dataTransfer.effectAllowed = 'copy'
}

/**
 * 元素横滚表格（UI v3）：
 * **列 = 元素、行 = 属性**，元素多时横向滚动，行首列粘住。
 *
 * 属性行里的数字**可以直接拖进左下角的数值区**——"在其他面板发现的数字拖进来"，
 * 这是数值区两个来源之一（另一个是用户主动计算）。
 */
export function ElementsTable({ group }: { group: Group }) {
  const table = useMemo(() => buildElementTable(group), [group])

  return (
    <>
      <div className="etable-wrap">
        <table className="etable">
          <thead>
            <tr>
              <th className="etable-corner" />
              {table.facts.map((f) => (
                <th key={f.element.id} className="etable-el">
                  <TexOrText text={f.element.label} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.key}>
                <th className="etable-rowhead">{row.label}</th>
                {row.values.map((v, i) => {
                  const canDrag = row.numeric && v !== '—'
                  return (
                    <td
                      key={i}
                      className={`etable-cell${canDrag ? ' can-drag' : ''}`}
                      draggable={canDrag}
                      onDragStart={
                        canDrag
                          ? (e) =>
                              writeNumberPayload(
                                e,
                                `${row.label}(${table.facts[i].element.label})`,
                                Number(v),
                              )
                          : undefined
                      }
                      title={canDrag ? '拖到左下角数值区' : undefined}
                    >
                      {v}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.capped && (
        <div className="insp-line dim">|G| 太大，共轭类 / 中心化子未枚举（守卫），留空而非硬算</div>
      )}
    </>
  )
}
