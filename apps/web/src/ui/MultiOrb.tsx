import { opTemplate, type OpDef } from '../gal/ops'
import { menuLabel } from '../gal/interaction'

/**
 * 多对象操作悬浮球（UI v3）：挂在**显示区正上方**中央。
 *
 * 它列的是**全局**的多对象操作（不依赖你选中了谁）——因为"多对象"本来就要先选了才知道。
 * 点一项 → 进入 pending（十字光标 + 提示条 + 不可点变暗），再去画布上点够参数。
 */
export function MultiOrb({
  open,
  onToggle,
  ops,
  onPick,
  minLeft = 0,
}: {
  open: boolean
  onToggle: () => void
  ops: OpDef[]
  onPick: (op: OpDef) => void
  /** 左侧面板的右边界；球不能在它下面，否则展开面板会把球盖住 */
  minLeft?: number
}) {
  return (
    <div className="multi-orb" style={{ left: `max(50%, ${minLeft + 70}px)` }}>
      <button
        className={`orb orb-center${open ? ' on' : ''}`}
        onClick={onToggle}
        title="多对象操作（还要再选对象）"
      >
        ⊕
      </button>
      {open && (
        <div className="orb-ops-panel orb-center-panel">
          <div className="orb-ops-head">
            多对象操作 <span className="count">{ops.length}</span>
            <span className="orb-ops-hint">选中后去点对象</span>
          </div>
          {ops.map((op) => (
            <button
              key={op.id}
              className="orb-op"
              title={`${op.notation} —— ${op.doc}`}
              onClick={() => onPick(op)}
            >
              <span className="orb-op-label">{menuLabel(op)}</span>
              <code>{opTemplate(op)}</code>
              <span className="orb-op-doc">{op.doc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
