import type { LineState } from '../gal/build'
import { mathLabel } from '../gal/mathLabel'
import { canvasShape, sortOf } from '../gal/value'
import { TexOrText } from './Tex'

/**
 * 草稿区（三区 P2，2026-10-22）。
 *
 * 形态（`PROPOSAL-zones.md` §4 / §8 第 3 条）：**从右侧滑出**，收起时贴右侧中部一条
 * 竖胶囊。它与工作台是同一族浮层（`position: absolute`，画布不重排），
 * 但同时开会让台挤到 400–500 宽（两列布局会崩）⇒ **草稿一滑出，工作台自动收**
 * （拍板第 7 条，联动在 `App`）。
 *
 * 它装的不是"另一堆对象"，而是**对象表上打了 `isDraft` 的那些**：
 *   · 每行是一张**迷你节点卡**（2026-10-22 用户：「草稿区的对象也应该是图形化的」）——
 *     形状 / 颜色 / 符号全部走画布那一套判据（`canvasShape` + `--node-*` 变量），
 *     所以"草稿里的 S₄"和"画布上的 S₄"长得是同一个东西，只是小一号；
 *   · 对象仍能用：点行 = 选中，它照样能当参数（对象/操作抽屉里也还列着，带琥珀圆点）；
 *   · 出口两条（拍板第 6、10 条）：**拖进画布**（落点 = 松手那一格）与行上的「扶正」。
 *
 * ⚠️ 只有**能当画布顶点**的对象才给暂存入口（数值 / `list` 档 / 映射与作用都不行：
 * 它们本来就不占节点，收起来看不见任何变化）—— 判据直接用 `isCanvasValue` 那一份。
 */

/** 能不能暂存：得是"画布上会有一个节点"的那种对象（与画布同一份判据）。 */
export function canDraft(o: LineState['object']): boolean {
  if (!o) return false
  const s = canvasShape(o.value)
  return s === 'group' || s === 'set' || s === 'structure'
}

export function DraftDock({
  open,
  onToggle,
  lineStates,
  draftedIds,
  hot = false,
  onSelect,
  onUndraft,
  onDragStartDraft,
}: {
  open: boolean
  onToggle: () => void
  lineStates: LineState[]
  draftedIds: ReadonlySet<string>
  /** 画布那边正把节点拖到右缘热区（拖拽反馈：整块面板亮起来 + 提示松手） */
  hot?: boolean
  /** 点行 = 选中该对象（与画布 / 抽屉同一条路） */
  onSelect: (id: string) => void
  /** 「扶正」：解除草稿，位置交回自动布局 */
  onUndraft: (id: string) => void
  /** 拖拽开始时把 id 交给画布（松手落在哪一格 = 钉在哪一格） */
  onDragStartDraft?: (id: string) => void
}) {
  const rows = lineStates.filter((s) => s.ok && s.object && draftedIds.has(s.object.id))

  return (
    <section
      className={`draft-dock${open ? ' open' : ''}${hot ? ' hot' : ''}`}
      data-count={rows.length}
    >
      <button
        className="draft-toggle"
        onClick={onToggle}
        title={open ? '收起草稿区' : '草稿区：暂存起来的对象（不占画布，仍可当参数）'}
        data-testid="draft-toggle"
      >
        <span className="draft-caret">{open ? '>' : '<'}</span>
        <span className="draft-label">草稿</span>
        {rows.length > 0 && <span className="count">{rows.length}</span>}
      </button>
      {open && (
        <div className="draft-body">
          {hot && <div className="draft-hot-hint">松手就收起草稿区</div>}
          {rows.length === 0 && (
            <div className="empty">
              把画布上的对象拖到这儿、或在左栏行上点「存」，它就从画布上收起来
            </div>
          )}
          {rows.map((s) => {
            const o = s.object!
            const shape = canvasShape(o.value)
            const label = mathLabel(o)
            return (
              <div
                key={s.index}
                className="draft-row"
                data-id={o.id}
                data-shape={shape}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', o.id)
                  e.dataTransfer.effectAllowed = 'move'
                  onDragStartDraft?.(o.id)
                }}
                onClick={() => onSelect(o.id)}
                title="拖到画布上扶正（落点就是松手那一格），或点「扶正」交回自动布局"
              >
                <span className="draft-grip" aria-hidden="true">
                  ::
                </span>
                {/* 迷你节点：形状 / 颜色 / 符号与画布同一个对象同一个样子，只是小一号 */}
                <span
                  className={`draft-node draft-node-${shape} draft-origin-${o.origin}`}
                  aria-hidden="true"
                >
                  <span className="draft-node-sym">
                    <TexOrText text={label.main} />
                  </span>
                </span>
                <span className="draft-meta">
                  <span className="draft-name">{o.id}</span>
                  <span className="draft-def">
                    <TexOrText text={o.def} />
                  </span>
                </span>
                <button
                  type="button"
                  className="draft-promote"
                  data-id={o.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    onUndraft(o.id)
                  }}
                  title="扶正：放回画布（位置交给自动布局）"
                >
                  扶正
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
