import { type ReactNode } from 'react'

/**
 * **对象编辑器的公共外壳**（P0-2，2026-10-05）。
 *
 * ## 为什么有这一个组件
 *
 * `MapBuilder` / `ActionBuilder` / `StructureBuilder` 三个编辑器**从 U3/U52/S2 起
 * 就共用同一套类名**（`.map-builder` / `.mb-head` / `.mb-hint` / `.mb-rows` /
 * `.mb-check` / `.mb-foot` / `.mb-name` / `.mb-btn` / `.mb-x`）—— 它们从来不是三套东西，
 * 是**同一个骨架的三种配置**。
 *
 * 而 P0-1 把三个编辑器从"居中弹层"改成"底部常驻卡片"之后，那份重复就该收掉了：
 * 同一个 `.mb-foot` 写了**三遍**（逐字相同）、同一个 `.mb-x` 写了三遍、
 * `onClick={stopPropagation}` 写了三遍。三份拷贝 = 三处要同步改。
 *
 * ## 它包什么 / 不包什么
 *
 * **包**（三家完全一致）：外壳 `div.map-builder` · `mb-head` · `mb-foot`。
 * **不包**（各家自成一派）：`mb-hint` 的措辞 · 中间那大块（`mb-rows` / `sb-scroll` / `ab-n`）·
 * `mb-check` 的内容（这一段本来就是"各编辑器自己的读数"）。
 *
 * ⚠️ **`mb-check` 刻意留在外面**：它的 `className` 来自各自的状态机
 * （`MapBuilder` 是 `empty|bad|ok` 三态、`StructureBuilder` 只有 `empty|ok`），
 * 硬塞进本组件就要造一个"状态 → 文案"的映射表 —— 那是把**各家的判据**挪到一个地方，
 * 正是"判据散多份"的反面。留着的代价是三个组件各有三行 JSX，收益是**判据仍然各归各家**。
 *
 * ⚠️ **DOM 结构与类名逐字保持**（P0-1 已经证明这套类名被 50 条走查守着）：
 * 本组件不改任何类名、不改任何层级顺序 —— 三个编辑器换用它之后，
 * `e2e/map-builder.mjs` / `custom-action.mjs` / `structure*.mjs` **一条都不用改**。
 */

/** `mb-head` 里 chip 之后到 `mb-x` 之前那段（`f : G 到 H` / `G 作用在 N 个点` / `运算表 : C`）。 */
export interface CardHead {
  /** 主色标签：`映射` / `作用` / `代数结构`（决定左边那道竖线的颜色）*/
  chip: 'map' | 'action' | 'structure'
  /** chip 上的文字（与 `chip` 分开是为了让「类型」与「文案」各自可查）*/
  chipLabel: string
  /** chip 之后的内容 —— 各家不同（`<strong>f :</strong> G 到 H` / `G 作用在 N 个点` / …）*/
  children: ReactNode
}

export interface CardEditorProps {
  /**
   * 修饰类。⚠️ **键是"怎么拼"、值是"拼出什么"** —— 因为真实类名**不是** `${variant}-builder`：
   * `action` → `action-builder`（对），但 `structure` → **`struct-builder`**（少一个 `t`，
   * `App.css:1910` 与 `e2e/structure.mjs:188` 都按 `struct-builder` 写）。
   * 第一版直接 `${variant}-builder` ⇒ 编辑器打开时走查报 `编辑器 DOM 真的出现 = null`。
   * ⇒ 这里钉死映射表，别再拼。
   */
  variant?: 'action' | 'structure'
  head: CardHead
  /** `mb-hint`：一行说清"这张表要干什么"（**纯文本面**，不许键盘打不出的字符）*/
  hint: ReactNode
  /** 中间那一大块：各编辑器自己的表单（`mb-rows` / `sb-scroll` / `ab-n` …）*/
  children: ReactNode
  /**
   * 状态行（`mb-check`）—— **整块由调用方给**，本组件不碰它的 className 与内容。
   * 理由见文件头那条 ⚠️。
   */
  check?: ReactNode
  /** 状态行之后、表单读数之前那块（`StructureBuilder` 的 `AxiomReadout` 走这里）*/
  afterCheck?: ReactNode
  /** 名字输入框的值（留空则走 `namePlaceholder`）*/
  name: string
  onNameChange: (v: string) => void
  /** 名字框的 placeholder —— 留空时会用它（`\phi` / `psi` / 自动编号）*/
  namePlaceholder: string
  /** 提交（Enter 与「确认」两条路）*/
  onSubmit: () => void
  /** 能不能提交 —— 由各家的校验状态给出 */
  canSubmit: boolean
  /** 取消（× 与「取消」两条路）*/
  onCancel: () => void
}

/** `variant` → 真实修饰类。**别用模板串拼**（`structure` 的真实类名是 `struct-builder`）。 */
const VARIANT_CLASS: Record<'action' | 'structure', string> = {
  action: 'action-builder',
  structure: 'struct-builder',
}

export function CardEditor({
  variant,
  head,
  hint,
  children,
  check,
  afterCheck,
  name,
  onNameChange,
  namePlaceholder,
  onSubmit,
  canSubmit,
  onCancel,
}: CardEditorProps) {
  return (
    <div
      className={variant ? `map-builder ${VARIANT_CLASS[variant]}` : 'map-builder'}
      /*
       * 弹层时代留下的 `stopPropagation`：卡片内部点击别冒泡到画布。
       * ⚠️ P0-1 之后它其实已无实际作用（`CanvasView` 判的是 `e.target === e.currentTarget`
       * ⇒ 卡片上的点击根本到不了画布根），但**留着无害**且比"删了再说"稳 ——
       * 下一次有人给编辑器加可点区域时，这行是他不用再想一遍的保护。
       */
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-head">
        <span className={`chip chip-${head.chip}`}>{head.chipLabel}</span>
        {head.children}
        <button className="mb-x" onClick={onCancel} title="取消（Esc）">
          x
        </button>
      </div>

      <div className="mb-hint">{hint}</div>

      {children}

      {check}
      {afterCheck}

      <div className="mb-foot">
        <input
          className="mb-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={namePlaceholder}
          title={`留空则命名为「${namePlaceholder}」`}
          spellCheck={false}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit()
          }}
        />
        <button className="mb-btn" onClick={onCancel}>
          取消
        </button>
        <button className="mb-btn primary" onClick={onSubmit} disabled={!canSubmit}>
          确认
        </button>
      </div>
    </div>
  )
}
