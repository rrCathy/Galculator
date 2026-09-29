import type { LineState } from '../gal/build'
import { TexOrText } from './Tex'

/**
 * 一行对象（对象区 / 操作区共用）——**单行紧凑**（UI v3.1 二次收窄）：
 *
 *     A = D_4                              ×
 *
 * 类型 / 标签 / 副行等信息**全部搬进「信息」面板**：点这一行 = 选中该对象
 * （画布同步高亮、信息面板打开），信息在那边看。面板因此可以窄到一行定义的宽度。
 */
export function ObjectRow({
  state,
  onRemove,
  onEdit,
  onSelect,
}: {
  state: LineState
  onRemove: (index: number) => void
  /** 改这一行（缺口 ⑱）：改名 / 改定义——装进底部输入球再提交 */
  onEdit?: (index: number) => void
  /** 点行 = 选中对象（画布高亮 + 信息面板打开） */
  onSelect?: (id: string) => void
}) {
  const o = state.object!
  return (
    <div
      className={`row row-${o.origin}${onSelect ? ' row-click' : ''}`}
      onClick={
        onSelect
          ? (e) => {
              e.stopPropagation()
              onSelect(o.id)
            }
          : undefined
      }
      title={onSelect ? '选中，在信息面板查看详情' : undefined}
    >
      <span className="row-name">{o.id}</span>
      <span className="row-eq">=</span>
      <span className="row-def">
        <TexOrText text={o.def} />
      </span>
      {onEdit && (
        <button
          className="edit"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(state.index)
          }}
          title="改这一行（改名 / 改定义），在底部输入球里改完回车"
        >
          改
        </button>
      )}
      <button
        className="x"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(state.index)
        }}
        title="删除"
      >
        x
      </button>
    </div>
  )
}

/** 问题行（求值失败的定义）。错误提示无处可去，就地显示。 */
export function BadRow({
  state,
  onRemove,
}: {
  state: LineState
  onRemove: (index: number) => void
}) {
  return (
    <div className="row row-bad">
      <div className="row-top">
        <code className="row-def">{state.raw}</code>
        <button className="x" onClick={() => onRemove(state.index)} title="删除">
          x
        </button>
      </div>
      <div className="row-err">
        {state.error}
        {state.hint ? ` -${state.hint}` : ''}
      </div>
    </div>
  )
}
