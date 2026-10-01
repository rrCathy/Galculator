import type { LineState } from '../gal/build'
import { singleOpsFor } from '../gal/interaction'
import type { OpDef } from '../gal/ops'
import { sortOf } from '../gal/value'
import { DockPanel } from './DockPanel'
import { ObjectRow } from './ObjectRow'

/**
 * 操作区面板（UI v3）：**运算产生的对象**。
 *
 * 与「对象区」对称——那边是你手输声明的，这边是算出来的。
 * 以前那个"可用操作清单"面板取消了：它已经被节点旁的悬浮球和顶部的多对象球取代。
 *
 * ## 例外：不上画布的对象（U44，2026-10-01）
 *
 * `sortOf` 把值分四档，其中 **`list`（子群集：`Syl_p(G)` / `Sub(G)`）不上画布**
 * ——它不是交换图的顶点，没有节点，于是也**没有悬浮球**。
 * 这类行的操作入口就在这里补：行上带一颗「操作」按钮（见 `ObjectRow`）。
 * 少了它，`Syl_p(G) → 底集 → 共轭作用在` 那条 Sylow 链中间就只剩打字了。
 *
 * 判据按 `sortOf` 而不是按 `type` —— 与画布上"谁是顶点"用的是同一份判据，
 * 别处再加 `subgroups` 硬编码就会两头对不上。
 */
export function OpDock({
  open,
  onToggle,
  lineStates,
  onRemove,
  onEdit,
  onSelect,
  onRunOp,
}: {
  open: boolean
  onToggle: () => void
  lineStates: LineState[]
  onRemove: (index: number) => void
  /** 改这一行（改名 / 改定义） */
  onEdit?: (index: number) => void
  /** 点行 = 选中对象，信息在「信息」面板看 */
  onSelect: (id: string) => void
  /** 跑这个对象的单对象操作（`id` 是它自己，不是当前焦点——列表里每行都能点）*/
  onRunOp?: (op: OpDef, id: string) => void
}) {
  const rows = lineStates.filter(
    (s) => s.ok && s.object && s.object.value.type !== 'number' && s.object.origin === 'derived',
  )

  return (
    <DockPanel title="操作" count={rows.length} open={open} onToggle={onToggle}>
      {rows.length === 0 && <div className="empty">运算产生的对象会落在这里</div>}
      {rows.map((s) => {
        const o = s.object!
        // 只有**不上画布**的（list 档）才在行上给操作 —— 其余的走悬浮球
        const ops = sortOf(o.value) === 'list' ? singleOpsFor(o.value) : []
        return (
          <ObjectRow
            key={s.index}
            state={s}
            onRemove={onRemove}
            onEdit={onEdit}
            onSelect={onSelect}
            ops={ops}
            onRunOp={onRunOp ? (op) => onRunOp(op, o.id) : undefined}
          />
        )
      })}
    </DockPanel>
  )
}
