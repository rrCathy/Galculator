import { useState } from 'react'
import type { LineState } from '../gal/build'
import { menuLabel } from '../gal/interaction'
import type { OpDef } from '../gal/ops'
import { TexOrText } from './Tex'

/**
 * 一行对象（对象区 / 操作区共用）——**单行紧凑**（UI v3.1 二次收窄）：
 *
 *     A = D_4                       操作 ×
 *
 * 类型 / 标签 / 副行等信息**全部搬进「信息」面板**：点这一行 = 选中该对象
 * （画布同步高亮、信息面板打开），信息在那边看。面板因此可以窄到一行定义的宽度。
 *
 * ## 「操作」这一颗按钮（U44，2026-10-01）
 *
 * 从前不上画布的对象（`subgroups` 子群集是唯一的 `list` 档）**没有悬浮球** ——
 * 球挂在节点/箭头上，而它根本没有节点。它的操作入口被塞在**信息面板**里
 * （那一行「可做」）。用户说：「什么可做操作，说实话，我都不看」——
 * 于是那一行砍了，入口挪到**这一行旁边**：操作本来就该挨着对象，
 * 信息面板只回答"它是什么"。
 *
 * 只要传了 `ops` 就渲染这颗按钮（**不是 hover 才现身** —— 它是入口，不是从属动作，
 * 得一眼看得见）。点开在行下方展开一排小胶囊，与从前「可做」那一行同样的东西。
 */
export function ObjectRow({
  state,
  onRemove,
  onEdit,
  onSelect,
  ops = [],
  onRunOp,
  drafted = false,
  onToggleDraft,
}: {
  state: LineState
  onRemove: (index: number) => void
  /** 改这一行（缺口 ⑱）：改名 / 改定义——装进底部输入球再提交 */
  onEdit?: (index: number) => void
  /** 点行 = 选中对象（画布高亮 + 信息面板打开） */
  onSelect?: (id: string) => void
  /** 这个对象能立刻做的单对象操作（只有**不上画布**的对象才给，见文件头） */
  ops?: OpDef[]
  onRunOp?: (op: OpDef) => void
  /**
   * **草稿区**（P2，2026-10-22）。`drafted` = 这个对象此刻收在草稿区。
   *
   * 两个入口都要（拍板第 3、10 条）：行上的按钮在这里；拖拽在画布与草稿面板之间。
   * 按钮文案随状态换：不在草稿 ⇒「暂存」，在草稿 ⇒「扶正」——
   * 同一个按钮两个方向，比两颗按钮更省地方，也不会看错自己在哪边。
   */
  drafted?: boolean
  onToggleDraft?: () => void
}) {
  const o = state.object!
  const [openOps, setOpenOps] = useState(false)
  const hasOps = !!onRunOp && ops.length > 0

  return (
    <>
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
        title={onSelect ? '选中，在工作台看它' : undefined}
      >
        {/*
         * ⚠️ **名字保持"可敲形态"，不渲染**（2026-09-27 契约定案，`usability-fixes`
         * 走查在守：「对象表里没有任何非 ASCII 的名字（形态统一了）」）——
         * 这张表是"照着名字敲回去"的参考面：显示 `\phi` 而输入恰好收 `\phi`
         * （真字符 `ϕ` 会被拦"键盘打不出来"）。渲染成 `ϕ` 就等于教用户一个敲不回去的形态。
         * 2026-10-12 曾试渲染（对象槽 chip 等升渲染面时顺手带过），被走查当场拦回。
         * 展示面要"好看的名字"看对象槽 chip（`mathLabel`）与工作台显示屏。
         */}
        <span className="row-name">{o.id}</span>
        {drafted && (
          <span className="row-draft-flag" title="这个对象收在草稿区（不占画布，仍可当参数）">
            草稿
          </span>
        )}
        <span className="row-eq">=</span>
        <span className="row-def">
          <TexOrText text={o.def} />
        </span>
        {hasOps && (
          <button
            type="button"
            className={`ops${openOps ? ' on' : ''}`}
            title={`这个对象能做的操作（${ops.length} 个）---- 它不上画布，没有悬浮球`}
            onClick={(e) => {
              e.stopPropagation()
              setOpenOps((v) => !v)
            }}
          >
            操作
          </button>
        )}
        {onToggleDraft && (
          <button
            className={`draft${drafted ? ' on' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleDraft()
            }}
            title={
              drafted
                ? '扶正：放回画布（拖动这一行到画布上也能扶正，落点就是松手那一格）'
                : '暂存到右侧草稿区（不占画布，仍可当参数用）'
            }
          >
            {/* 行只有 200 宽（name + 定义 + 三颗按钮），两字「暂存」会把「改 / x」挤出去
                ⇒ 一个单字按钮切换两个方向：「存」= 暂存到右侧，「取」= 取回画布。
                完整说法在 title 里；在草稿时按钮同时着琥珀色（`.on`）并带一枚小圆点。 */}
            {drafted ? '取' : '存'}
          </button>
        )}
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
      {openOps && (
        <div className="row-ops">
          {ops.map((op) => (
            <button
              key={op.id}
              type="button"
              className="row-op"
              data-op={op.id}
              title={`${menuLabel(op)}（${op.notation}）---- ${op.doc}`}
              onClick={(e) => {
                e.stopPropagation()
                onRunOp?.(op)
              }}
            >
              {menuLabel(op)}
            </button>
          ))}
        </div>
      )}
    </>
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
