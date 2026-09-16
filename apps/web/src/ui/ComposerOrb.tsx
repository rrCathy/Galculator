import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { evalExpr, type EvalResult } from '../gal/evalDef'
import { checkName, isNameLike, nextAutoName, RESERVED_CALL_NAMES } from '../gal/naming'
import { VALUE_TYPE_LABEL } from '../gal/value'
import type { GalObject } from '../gal/types'

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
 * 输入悬浮球（UI v3.1）：挂在**画面正下方中央**。
 *
 * 输入框从「对象」面板里提出来——它不该藏在面板里，而是随手可及的常驻入口：
 * 点球展开一张输入卡片（向上弹，避开屏幕边缘），再点球或 Esc 收起。
 * 提交后卡片保持开着（连续声明多个对象很常见），输入清空。
 */
export function ComposerOrb({
  open,
  onToggle,
  objects,
  onAdd,
  minLeft = 0,
}: {
  open: boolean
  onToggle: () => void
  objects: GalObject[]
  onAdd: (line: string) => void
  /** 左下数值面板的右边界；球不能被它压住 */
  minLeft?: number
}) {
  const [nameDraft, setNameDraft] = useState('')
  const [exprDraft, setExprDraft] = useState('')
  const exprRef = useRef<HTMLInputElement>(null)

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

  // 展开时焦点直接落表达式框——名字大多数时候留空走自动命名
  useEffect(() => {
    if (open) exprRef.current?.focus()
  }, [open])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') {
      setNameDraft('')
      setExprDraft('')
      onToggle()
    }
  }

  return (
    <div className="composer-orb" style={{ left: `max(50%, ${minLeft + 70}px)` }}>
      <button
        className={`orb orb-center${open ? ' on' : ''}`}
        onClick={onToggle}
        title={open ? '收起输入' : '输入定义（名字 = 表达式）'}
      >
        ✎
      </button>
      {open && (
        <div className="composer-card">
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
              ref={exprRef}
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
          <ComposerStatus
            nameCheck={nameCheck}
            autoName={autoName}
            expr={expr}
            preview={preview}
          />
        </div>
      )}
    </div>
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
