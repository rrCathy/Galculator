import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { evalExpr, type EvalResult } from '../gal/evalDef'
import { checkName, isNameLike, nextAutoName, normalizeName, RESERVED_CALL_NAMES } from '../gal/naming'
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
  editing = null,
  onAdd,
    minLeft = 0,
    dockRight = false,
    dockLeft = false,
  }: {
  open: boolean
  onToggle: () => void
  objects: GalObject[]
  /**
   * 正在**改的旧行**（缺口 ⑱）：非空时输入球预填它，提交走 `onAdd`
   * （App 那边据 `editing` 决定"替换"而不是"追加"）。
   */
  editing?: { index: number; name: string; expr: string } | null
  onAdd: (line: string) => void
  /** 左下数值面板的右边界；球不能被它压住 */
  minLeft?: number
  /**
   * **贴到右侧**（P0-1）：对象编辑器常驻时用 —— 那个卡片也在底部居中，
   * 两者都在 `bottom: 12px` 会重叠，于是输入球让到右边。
   *
   * ⚠️ 这一条**必须走 prop 而不能走 CSS**：`.composer-orb` 的 `left` 是**内联 style**
   * （`max(50%, …)`，用来避开左下数值面板，见 `minLeft`），内联样式压过任何样式表规则 ——
   * 我第一版写了 `.app.editor-open .composer-orb { left: auto }`，浏览器里量出来仍是 `720px`
   * （= 居中），白查一轮。**与内联样式共处只有一条路：改它自己。**
   */
  dockRight?: boolean
  /**
   * **工作台升起时靠左停**（2026-10-06，用户实测第 3 条）。
   *
   * 用户原话：工作台展开后那个悬在上方的输入口「太神秘了，不会挪个位置？比如放左边？」
   *
   * 病根是我上一版只治了**遮挡**（把球整体上移），没治**语义** ——
   * 一个孤零零的球浮在台面上方，看不出它是谁。靠左停就不一样：
   * 它贴着屏幕左边、在左栏那一列的下方，读起来是"输入在这儿"。
   *
   * ⚠️ 与 `dockRight` 同一个理由，**必须走 prop**（`left` 是内联 style）。
   * 两者同时为真时以 `dockLeft` 为准（工作台是更大的面，编辑器会收进它里面）。
   */
  dockLeft?: boolean
}) {
  const [nameDraft, setNameDraft] = useState('')
  const [exprDraft, setExprDraft] = useState('')
  const exprRef = useRef<HTMLInputElement>(null)

  const usedNames = useMemo(() => objects.map((o) => o.id), [objects])
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects])
  const autoName = useMemo(() => nextAutoName(usedNames), [usedNames])
  /**
   * 体检用的名字表要**排掉正在改的这一个**——否则改名表单会对着自己报
   * 「名字已被占用」，`canSubmit` 永远为假（用户在改动不了自己的行）。
   */
  const nameCheck = useMemo(
    () =>
      checkName(
        nameDraft,
        editing ? usedNames.filter((n) => n !== editing.name) : usedNames,
      ),
    [nameDraft, usedNames, editing],
  )

  /** 进编辑态：把旧行填回来，焦点落在表达式框 */
  useEffect(() => {
    if (!editing) return
    setNameDraft(editing.name)
    setExprDraft(editing.expr)
    exprRef.current?.focus()
  }, [editing])

  const expr = exprDraft.trim()
  const inline = useMemo(() => splitInline(expr), [expr])
  const preview = useMemo<EvalResult | null>(
    () => (inline.rhs ? evalExpr(inline.rhs, byId) : null),
    [inline.rhs, byId],
  )

  const canSubmit = !!inline.rhs && !!preview?.ok && !nameCheck.error
  const submit = () => {
    if (!canSubmit) return
    // 名字形态全 ASCII（2026-09-27 定案）：`\varphi` 存进去就是 `\varphi`，没有第二套写法
    const typed = nameDraft.trim() || inline.name
    onAdd(`${typed ? normalizeName(typed) : autoName} = ${inline.rhs}`)
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
    <div
      className="composer-orb"
      /* ⚠️ `left` 走内联 style 是历史包袱（`max(50%, minLeft)` 要避开左下数值抽屉）——
         所以"靠哪边停"只能在这里改，样式表碰不动（P0-1 栽过）。
         ⚠️ 靠边时**必须同时把 `transform: translateX(-50%)` 抹掉**：那是"以 left 为轴居中"
         用的，靠边时它会再把球往左拽半个身位（真机量出来 `left: -4`，半个球在屏幕外）。 */
      style={
        dockLeft
          ? { left: 12, right: 'auto', transform: 'none' }
          : dockRight
            ? { right: 12, left: 'auto', transform: 'none' }
            : { left: `max(50%, ${minLeft + 70}px)` }
      }
    >
      <button
        className={`orb orb-center${open ? ' on' : ''}`}
        onClick={onToggle}
        title={open ? '收起输入' : '输入定义（名字 = 表达式）'}
      >
        *
      </button>
      {open && (
        <div className="composer-card">
          {editing && (
            <div className="composer-editing">
              正在改这一行，左边那半改了就是改名，别处的引用会自动跟着改
            </div>
          )}
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
              placeholder="表达式，如 Z(G) -G / N -\<G, (123)\>"
              spellCheck={false}
              autoComplete="off"
            />
            <button onClick={submit} disabled={!canSubmit}>
              {editing ? '替换' : '添加'}
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
  nameCheck: { ok: boolean; error?: string; warn?: string; hint?: string }
  autoName: string
  expr: string
  preview: EvalResult | null
}) {
  if (nameCheck.error) {
    return (
      <div className="composer-status bad">
        {nameCheck.error}
        {nameCheck.hint ? <span className="status-meta">，{nameCheck.hint}</span> : null}
      </div>
    )
  }

  const warn = nameCheck.warn ? <div className="composer-status warn">{nameCheck.warn}</div> : null

  if (expr && preview && !preview.ok) {
    return (
      <>
        {warn}
        <div className="composer-status bad">
          {preview.error}
          {preview.hint ? `，${preview.hint}` : ''}
        </div>
      </>
    )
  }

  if (expr && preview?.ok) {
    return (
      <>
        {warn}
        <div className="composer-status good">
          <span className="ok-mark">v</span>
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
      名字留空 到自动命名「{autoName}」（已避开注册表的 {RESERVED_CALL_NAMES.length} 个调用名）
    </div>
  )
}
