import { useMemo, useState, type KeyboardEvent } from 'react'
import { evalExpr, type EvalResult } from '../gal/evalDef'
import { checkName, isNameLike, nextAutoName, RESERVED_CALL_NAMES } from '../gal/naming'
import { VALUE_TYPE_LABEL } from '../gal/value'
import type { GalObject } from '../gal/types'
import type { LineState } from '../gal/build'
import { DockPanel } from './DockPanel'
import { BadRow, ObjectRow } from './ObjectRow'

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

/**
 * 对象区面板（UI v3）：**两块输入框 + 声明出来的对象**。
 *
 * 输入框跟着对象区走是有道理的——它们本来就是"声明一个新对象"这件事的两个半边；
 * 面板收起时画布彻底干净，不像以前那样常驻一条底栏。
 */
export function ObjectDock({
  open,
  onToggle,
  lineStates,
  objects,
  onAdd,
  onRemove,
}: {
  open: boolean
  onToggle: () => void
  lineStates: LineState[]
  objects: GalObject[]
  onAdd: (line: string) => void
  onRemove: (index: number) => void
}) {
  const [nameDraft, setNameDraft] = useState('')
  const [exprDraft, setExprDraft] = useState('')

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

  const canSubmit = !!inline.rhs && !!preview?.ok && !nameCheck.error
  const submit = () => {
    if (!canSubmit) return
    onAdd(`${nameDraft.trim() || inline.name || autoName} = ${inline.rhs}`)
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

  const okRows = lineStates.filter((s) => s.ok && s.object)
  const inputs = okRows.filter(
    (s) => s.object!.value.type !== 'number' && s.object!.origin === 'input',
  )
  const bad = lineStates.filter((s) => !s.ok)

  return (
    <DockPanel title="对象" count={inputs.length} open={open} onToggle={onToggle}>
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

      {inputs.length === 0 && <div className="empty">声明一个群，如 G = D_4</div>}
      {inputs.map((s) => (
        <ObjectRow key={s.index} state={s} onRemove={onRemove} />
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

/**
 * 输入区状态行。名字提醒与表达式预览**并存**（各占一行）——
 * 手写 `sub` 这种命中操作名的名字时，若表达式恰好合法，提醒不该被预览挤掉。
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
