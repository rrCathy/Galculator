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
        title={onSelect ? '选中，在信息面板查看详情' : undefined}
      >
        <span className="row-name">{o.id}</span>
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
              title={`${op.notation} ---- ${op.doc}`}
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
