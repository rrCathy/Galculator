import { VALUE_TYPE_LABEL } from '../gal/value'
import { TexOrText } from './Tex'
import type { LineState } from '../gal/build'

/** 一行对象（对象区 / 操作区共用）。 */
export function ObjectRow({
  state,
  onRemove,
}: {
  state: LineState
  onRemove: (index: number) => void
}) {
  const o = state.object!
  return (
    <div className={`row row-${o.origin}`}>
      <div className="row-top">
        <span className="row-name">{o.id}</span>
        <span className="row-eq">=</span>
        <code className="row-def">{o.def}</code>
        <button className="x" onClick={() => onRemove(state.index)} title="删除">
          ×
        </button>
      </div>
      <div className="row-sub">
        <span className={`chip chip-${o.value.type}`}>{VALUE_TYPE_LABEL[o.value.type]}</span>
        <TexOrText className="row-label" text={o.label} />
        {o.sub && <span className="row-meta">{o.sub}</span>}
      </div>
    </div>
  )
}

/** 问题行（求值失败的定义）。 */
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
          ×
        </button>
      </div>
      <div className="row-err">
        {state.error}
        {state.hint ? ` · ${state.hint}` : ''}
      </div>
    </div>
  )
}
