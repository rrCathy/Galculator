import { useState } from 'react'
import { OPS, opsByMechanism, opTemplate } from '../gal/ops'
import { VALUE_TYPE_LABEL } from '../gal/value'
import type { LineState } from '../gal/build'

interface Props {
  lineStates: LineState[]
  onAdd: (line: string) => void
  onRemove: (index: number) => void
}

export function InputPanel({ lineStates, onAdd, onRemove }: Props) {
  const [draft, setDraft] = useState('')
  const [showOps, setShowOps] = useState(false)

  const submit = () => {
    const v = draft.trim()
    if (!v) return
    onAdd(v)
    setDraft('')
  }

  const okRows = lineStates.filter((s) => s.ok && s.object)
  const numbers = okRows.filter((s) => s.object!.value.type === 'number')
  const inputs = okRows.filter(
    (s) => s.object!.value.type !== 'number' && s.object!.origin === 'input',
  )
  const derived = okRows.filter(
    (s) => s.object!.value.type !== 'number' && s.object!.origin === 'derived',
  )
  const bad = lineStates.filter((s) => !s.ok)

  return (
    <aside className="panel">
      <header className="panel-head">
        <span className="brand">Galculator</span>
        <span className="brand-sub">群论计算器</span>
      </header>

      <Zone title="对象" rows={inputs} onRemove={onRemove} empty="声明一个群，如 G = D_4" />
      <Zone title="操作" rows={derived} onRemove={onRemove} empty="对已有对象运算，如 Z = Z(G)" />

      <div className="zone">
        <div className="zone-title">
          数值 {numbers.length > 0 && <span className="count">{numbers.length}</span>}
        </div>
        {numbers.length === 0 && <div className="empty">标量结果按计算顺序累积，如 n = ord(G, r2)</div>}
        {numbers.map((s) => {
          const o = s.object!
          const shown = o.value.type === 'number' ? o.value.label : ''
          return (
            <div key={s.index} className="row row-number">
              <div className="row-top">
                <span className="row-name">{o.id}</span>
                <span className="row-eq">=</span>
                <code className="row-def">{o.def}</code>
                <span className="row-num">{shown}</span>
                <button className="x" onClick={() => onRemove(s.index)} title="删除">
                  ×
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {bad.length > 0 && (
        <div className="zone">
          <div className="zone-title">问题 {bad.length}</div>
          {bad.map((s) => (
            <div key={s.index} className="row row-bad">
              <div className="row-top">
                <code className="row-def">{s.raw}</code>
                <button className="x" onClick={() => onRemove(s.index)} title="删除">
                  ×
                </button>
              </div>
              <div className="row-err">
                {s.error}
                {s.hint ? ` · ${s.hint}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="zone palette">
        <button className="palette-toggle" onClick={() => setShowOps((v) => !v)}>
          <span className="zone-title">可用操作</span>
          <span className="count">{OPS.length}</span>
          <span className="chev">{showOps ? '收起' : '展开'}</span>
        </button>
        {showOps && (
          <div className="palette-body">
            {opsByMechanism().map((g) => (
              <div key={g.mechanism} className="palette-group">
                <div className="palette-group-title">{g.label}</div>
                {g.ops.map((op) => (
                  <button
                    key={op.id}
                    className="palette-op"
                    title={op.doc}
                    onClick={() => {
                      setDraft(opTemplate(op))
                      setShowOps(false)
                    }}
                  >
                    <code>{opTemplate(op)}</code>
                    <span className="palette-op-doc">{op.doc}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="composer">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="名字 = 定义"
          spellCheck={false}
          autoComplete="off"
        />
        <button onClick={submit}>添加</button>
      </div>
    </aside>
  )
}

function Zone({
  title,
  rows,
  onRemove,
  empty,
}: {
  title: string
  rows: LineState[]
  onRemove: (index: number) => void
  empty: string
}) {
  return (
    <div className="zone">
      <div className="zone-title">
        {title} {rows.length > 0 && <span className="count">{rows.length}</span>}
      </div>
      {rows.length === 0 && <div className="empty">{empty}</div>}
      {rows.map((s) => {
        const o = s.object!
        return (
          <div key={s.index} className={`row row-${o.origin}`}>
            <div className="row-top">
              <span className="row-name">{o.id}</span>
              <span className="row-eq">=</span>
              <code className="row-def">{o.def}</code>
              <button className="x" onClick={() => onRemove(s.index)} title="删除">
                ×
              </button>
            </div>
            <div className="row-sub">
              <span className={`chip chip-${o.value.type}`}>{VALUE_TYPE_LABEL[o.value.type]}</span>
              <span className="row-label">{o.label}</span>
              {o.sub && <span className="row-meta">{o.sub}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
