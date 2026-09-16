import { useMemo, useState, type KeyboardEvent } from 'react'
import { OPS, opsByMechanism, opsFor, opTemplate, type OpDef } from '../gal/ops'
import { evalExpr } from '../gal/evalDef'
import type { EvalResult } from '../gal/evalDef'
import { checkName, isNameLike, nextAutoName, RESERVED_CALL_NAMES } from '../gal/naming'
import { VALUE_TYPE_LABEL, type GalValue } from '../gal/value'
import type { CanvasNode, GalObject } from '../gal/types'
import type { LineState } from '../gal/build'
import { Inspector } from './Inspector'

interface Props {
  lineStates: LineState[]
  /** 已求值的对象表——草稿实时校验与自动命名避让都要它 */
  objects: GalObject[]
  onAdd: (line: string) => void
  onRemove: (index: number) => void
  /** 画布上当前选中的对象（操作面板据此收敛；U2 起径向菜单是主入口） */
  selected: { label: string; value: GalValue } | null
  /** 竖卡要展示的对象；`null` = 输入态（交互模型 §5 的左栏两态） */
  inspect: CanvasNode | null
  onCloseInspect: () => void
}

/**
 * 兼容"整行粘贴"：`G = D_4` 拆成名字与表达式。
 * `x^2 = e` 这种左半边不是名字（含 `^`）的，整体当表达式（U5 的字谓词）。
 */
function splitInline(s: string): { name: string; rhs: string } {
  const eq = s.indexOf('=')
  if (eq > 0) {
    const head = s.slice(0, eq).trim()
    const tail = s.slice(eq + 1).trim()
    if (isNameLike(head) && tail) return { name: head, rhs: tail }
  }
  return { name: '', rhs: s }
}

export function InputPanel({
  lineStates,
  objects,
  onAdd,
  onRemove,
  selected,
  inspect,
  onCloseInspect,
}: Props) {
  const [nameDraft, setNameDraft] = useState('')
  const [exprDraft, setExprDraft] = useState('')
  const [showOps, setShowOps] = useState(false)
  const [onlyForSelection, setOnlyForSelection] = useState(true)

  const usedNames = useMemo(() => objects.map((o) => o.id), [objects])
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects])
  const autoName = useMemo(() => nextAutoName(usedNames), [usedNames])
  const nameCheck = useMemo(() => checkName(nameDraft, usedNames), [nameDraft, usedNames])

  const expr = exprDraft.trim()
  const inline = useMemo(() => splitInline(expr), [expr])
  const preview = useMemo<EvalResult | null>(
    () => (inline.rhs ? evalExpr(inline.rhs, byId) : null),
    [inline.rhs, byId],
  )

  const finalName = nameDraft.trim() || inline.name || autoName
  const canSubmit = !!inline.rhs && !!preview?.ok && !nameCheck.error

  const submit = () => {
    if (!canSubmit) return
    onAdd(`${finalName} = ${inline.rhs}`)
    setNameDraft('')
    setExprDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') {
      setNameDraft('')
      setExprDraft('')
    }
  }

  const selOps = useMemo(() => (selected ? opsFor([selected.value]) : []), [selected])
  const filtering = !!selected && onlyForSelection

  const pick = (op: OpDef) => {
    setExprDraft(opTemplate(op))
    setShowOps(false)
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

      {inspect ? (
        <Inspector node={inspect} onClose={onCloseInspect} />
      ) : (
        <>
          <Zone title="对象" rows={inputs} onRemove={onRemove} empty="声明一个群，如 G = D_4" />
          <Zone
            title="操作"
            rows={derived}
            onRemove={onRemove}
            empty="对已有对象运算，如 Z = Z(G)"
          />

          <div className="zone">
            <div className="zone-title">
              数值 {numbers.length > 0 && <span className="count">{numbers.length}</span>}
            </div>
            {numbers.length === 0 && (
              <div className="empty">标量结果按计算顺序累积，如 n = ord(G, r2)</div>
            )}
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
                {selected && (
                  <div className="palette-scope">
                    <span className="palette-scope-text">
                      选中 <b>{selected.label}</b> · 可用 <b>{selOps.length}</b> 条
                    </span>
                    <button
                      className="palette-scope-toggle"
                      onClick={() => setOnlyForSelection((v) => !v)}
                    >
                      {onlyForSelection ? '看全部' : '只看可用的'}
                    </button>
                  </div>
                )}
                {filtering ? (
                  <OpGroup
                    title={`可用于「${selected!.label}」`}
                    ops={selOps}
                    onPick={pick}
                    empty="这个对象暂时没有可用操作"
                  />
                ) : (
                  opsByMechanism().map((g) => (
                    <OpGroup key={g.mechanism} title={g.label} ops={g.ops} onPick={pick} />
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}

      <div className="composer">
        <div className="composer-row">
          <input
            className="composer-name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={autoName}
            title={`留空则自动命名为「${autoName}」`}
            spellCheck={false}
            autoComplete="off"
          />
          <span className="composer-eq">=</span>
          <input
            className="composer-expr"
            value={exprDraft}
            onChange={(e) => setExprDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="表达式，如 Z(G) · G / N · ⟨G, (123)⟩"
            spellCheck={false}
            autoComplete="off"
          />
          <button onClick={submit} disabled={!canSubmit}>
            添加
          </button>
        </div>
        <ComposerStatus nameCheck={nameCheck} autoName={autoName} expr={expr} preview={preview} />
      </div>
    </aside>
  )
}

/**
 * 输入区下方的状态区。
 *
 * 名字提醒与表达式预览**并存**（各占一行）——手写 `sub` 这种命中操作名的名字时，
 * 若表达式恰好合法，提醒不该被预览挤掉。
 * 优先级：名字错误 > 表达式错误 > 表达式预览 > （提醒已单列）> 自动命名提示。
 */
function ComposerStatus({
  nameCheck,
  autoName,
  expr,
  preview,
}: {
  nameCheck: { ok: boolean; error?: string; warn?: string }
  autoName: string
  expr: string
  preview: EvalResult | null
}) {
  if (nameCheck.error) return <div className="composer-status bad">{nameCheck.error}</div>

  const warn = nameCheck.warn ? <div className="composer-status warn">{nameCheck.warn}</div> : null

  if (expr && preview && !preview.ok) {
    return (
      <>
        {warn}
        <div className="composer-status bad">
          {preview.error}
          {preview.hint ? ` · ${preview.hint}` : ''}
        </div>
      </>
    )
  }

  if (expr && preview?.ok) {
    return (
      <>
        {warn}
        <div className="composer-status good">
          <span className="ok-mark">✓</span>
          <span className={`chip chip-${preview.value.type}`}>
            {VALUE_TYPE_LABEL[preview.value.type]}
          </span>
          <span className="status-label">{preview.label}</span>
          {preview.sub && <span className="status-meta">{preview.sub}</span>}
          <span className="status-meta">回车提交</span>
        </div>
      </>
    )
  }

  if (warn) return warn

  return (
    <div className="composer-status hint">
      名字留空 → 自动命名「{autoName}」（已避开注册表的 {RESERVED_CALL_NAMES.length} 个调用名）
    </div>
  )
}

function OpGroup({
  title,
  ops,
  onPick,
  empty,
}: {
  title: string
  ops: OpDef[]
  onPick: (op: OpDef) => void
  empty?: string
}) {
  return (
    <div className="palette-group">
      <div className="palette-group-title">
        {title} <span className="count">{ops.length}</span>
      </div>
      {ops.length === 0 && empty && <div className="empty">{empty}</div>}
      {ops.map((op) => (
        <button key={op.id} className="palette-op" title={op.doc} onClick={() => onPick(op)}>
          <code>{opTemplate(op)}</code>
          <span className="palette-op-doc">{op.doc}</span>
        </button>
      ))}
    </div>
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
