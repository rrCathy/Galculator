import { useState, type DragEvent } from 'react'
import { parseNumberPayload, type NumericEntry } from '../gal/numeric'
import { DockPanel } from './DockPanel'

/**
 * 数值区（UI v3）：左下的**上拉面板**。
 *
 * 只放两种东西：**从别的面板拖进来的数字**、**用户主动算出来的数值**。
 * 拖动是这里唯一的"新增"手势——所以整个面板体就是投放区，
 * 且不拒绝任何来源的数字（元素表的阶、子群列表的 |H|…）。
 */
export function NumericDock({
  open,
  onToggle,
  entries,
  onRemove,
  onDropNumber,
}: {
  open: boolean
  onToggle: () => void
  entries: NumericEntry[]
  onRemove: (key: string) => void
  onDropNumber: (label: string, value: number) => void
}) {
  const [over, setOver] = useState(false)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const payload = parseNumberPayload(e.dataTransfer)
    if (payload) onDropNumber(payload.label, payload.value)
  }

  return (
    <DockPanel title="数值" count={entries.length} open={open} onToggle={onToggle} direction="up">
      <div
        className={`numeric-drop${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {entries.length === 0 ? (
          <div className="empty">
            把面板里的数字拖进来，或算一个（<code>n = ord(G, r2)</code>）
          </div>
        ) : (
          entries.map((e) => (
            <div key={e.key} className={`num-row num-${e.source}`}>
              <span className="num-label">{e.label}</span>
              <span className="num-value">{e.value}</span>
              <button className="x" onClick={() => onRemove(e.key)} title="移除">
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </DockPanel>
  )
}
