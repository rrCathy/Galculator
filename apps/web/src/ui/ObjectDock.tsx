import type { LineState } from '../gal/build'
import { DockPanel } from './DockPanel'
import { BadRow, ObjectRow } from './ObjectRow'

/**
 * 对象区面板：**手输声明的对象**。
 *
 * 输入框不在面板里（UI v3.1 起搬到画面正下方的输入悬浮球）——
 * 面板只做"对象清单"这一件事，收窄之后画布也更干净。
 */
export function ObjectDock({
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
  const okRows = lineStates.filter((s) => s.ok && s.object)
  const inputs = okRows.filter(
    (s) => s.object!.value.type !== 'number' && s.object!.origin === 'input',
  )
  const bad = lineStates.filter((s) => !s.ok)

  return (
    <DockPanel title="对象" count={inputs.length} open={open} onToggle={onToggle}>
      {inputs.length === 0 && <div className="empty">点下方 ✎ 声明一个群，如 G = D_4</div>}
      {inputs.map((s) => (
        <ObjectRow key={s.index} state={s} onRemove={onRemove} onSelect={onSelect} />
      ))}

      {bad.length > 0 && (
        <>
          <div className="dock-subtitle">问题 {bad.length}</div>
          {bad.map((s) => (
            <BadRow key={s.index} state={s} onRemove={onRemove} />
          ))}
        </>
      )}
    </DockPanel>
  )
}
