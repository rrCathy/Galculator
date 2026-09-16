import type { LineState } from '../gal/build'
import { DockPanel } from './DockPanel'
import { ObjectRow } from './ObjectRow'

/**
 * 操作区面板（UI v3）：**运算产生的对象**。
 *
 * 与「对象区」对称——那边是你手输声明的，这边是算出来的。
 * 以前那个"可用操作清单"面板取消了：它已经被节点旁的悬浮球和顶部的多对象球取代。
 */
export function OpDock({
  open,
  onToggle,
  lineStates,
  onRemove,
  onSelect,
}: {
  open: boolean
  onToggle: () => void
  lineStates: LineState[]
  onRemove: (index: number) => void
  /** 点行 = 选中对象，信息在「信息」面板看 */
  onSelect: (id: string) => void
}) {
  const rows = lineStates.filter(
    (s) => s.ok && s.object && s.object.value.type !== 'number' && s.object.origin === 'derived',
  )

  return (
    <DockPanel title="操作" count={rows.length} open={open} onToggle={onToggle}>
      {rows.length === 0 && <div className="empty">运算产生的对象会落在这里</div>}
      {rows.map((s) => (
        <ObjectRow key={s.index} state={s} onRemove={onRemove} onSelect={onSelect} />
      ))}
    </DockPanel>
  )
}
