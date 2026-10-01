import { Fragment, useMemo, useState, type DragEvent } from 'react'
import type { Group } from '@groupviz/core'
import { buildElementTable } from '../gal/summary'
import { elementNotation } from '../gal/ops'
import { prettySymbol } from '../gal/pretty'
import { Tex, TexOrText } from './Tex'
import { DND_NUMBER } from '../gal/numeric'
import { circled } from './marks'

/** 拖到数值区的载荷类型（dragstart 时写、drop 时读）。 */
export function writeNumberPayload(e: DragEvent, label: string, value: number) {
  const payload = JSON.stringify({ label, value })
  e.dataTransfer.setData(DND_NUMBER, payload)
  e.dataTransfer.setData('text/plain', String(value))
  e.dataTransfer.effectAllowed = 'copy'
}

/**
 * 元素表格（UI v3.2）：**行 = 共轭类、列 = 属性**。
 *
 * v3.1 是"行 = 元素"（24 行 × 6 列），用户 2026-09-30 反馈：「3、元素列表现在都看不了了。」
 * —— 信息面板只有 298px 宽，6 列铺开之后右边两列（类大小 / 中心化子）**直接被面板裁掉**，
 * 而 24 行又把面板塞满，得双层滚动才看得全。**这不是列多，是行冗余**：
 * 同一个共轭类里的元素，阶 / ∈Z? / 类大小 / 中心化子**天生全同**（这正是共轭类的定义），
 * 铺成 N 行是纯重复。
 *
 * 所以改成**按共轭类折叠**：`S_4` 的 24 行 → 5 行，`共轭类` 那一列也不必再单列
 * （圈号本身就写在行首）。要逐个看元素时点行首展开 —— 展开的是**那个类**，
 * 不是把 24 行又倒回来。
 *
 * 数字格照旧**可以直接拖进左下角的数值区**（阶 / 类大小 / 中心化子）。
 */
export function ElementsTable({ group }: { group: Group }) {
  const table = useMemo(() => buildElementTable(group), [group])
  const [open, setOpen] = useState<Set<number>>(new Set())

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  // 大群（|G| > 144）：共轭类没枚举，退回逐元素表 —— 至少把"阶"这一列给出来
  if (table.classes.length === 0) {
    return (
      <>
        <div className="etable-wrap">
          <table className="etable">
            <thead>
              <tr>
                <th className="etable-corner">元素</th>
                <th>阶</th>
              </tr>
            </thead>
            <tbody>
              {table.facts.map((f) => (
                <tr key={f.element.id}>
                  <th className="etable-rowhead">
                    <TexOrText text={elementNotation(group, f.element)} />
                  </th>
                  <td className="etable-cell">{f.order}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {table.capped && (
          <div className="insp-line dim">|G| 太大，共轭类 / 中心化子未枚举（守卫），留空而非硬算</div>
        )}
      </>
    )
  }

  const cell = (v: number | null, label: string, repId: string, rep: string) => {
    const canDrag = v !== null
    return (
      <td
        className={`etable-cell${canDrag ? ' can-drag' : ''}`}
        draggable={canDrag}
        onDragStart={
          canDrag ? (e) => writeNumberPayload(e, `${label}(${prettySymbol(rep)})`, v) : undefined
        }
        title={canDrag ? '拖到左下角数值区' : undefined}
        data-rep={repId}
      >
        {v ?? '--'}
      </td>
    )
  }

  return (
    <>
      <div className="etable-wrap">
        <table className="etable">
          <thead>
            <tr>
              <th className="etable-corner">共轭类</th>
              <th>阶</th>
              <th>
                {/*
                  只有 `\in Z?` 是 LaTeX（`summary.ts` 的 rows）—— 直接写文本会把它原样显示。
                  中文标签**不过 KaTeX**（math mode 会把字体换成衬线体，与表格其余中文不一致）。
                */}
                <Tex tex={'\\in Z?'} />
              </th>
              <th>类大小</th>
              <th>中心化子</th>
            </tr>
          </thead>
          <tbody>
            {table.classes.map((c) => {
              const isOpen = open.has(c.index)
              const rep = elementNotation(group, c.rep)
              return (
                <Fragment key={c.index}>
                  <tr className={isOpen ? 'on' : ''} data-class={c.index} data-size={c.size}>
                    <th className="etable-rowhead">
                      <button
                        type="button"
                        className="etable-cls"
                        onClick={() => toggle(c.index)}
                        title={
                          // ⚠️ 不能用破折号 `——`：`no-unicode-leak` 走查不认
                          //（用户 2026-09-27：「把键盘上打不出来的字符都处理了」）
                          c.size > 1
                            ? `这一类共 ${c.size} 个元素，点开看全都`
                            : '点开看这一类（只 1 个元素）'
                        }
                      >
                        <em className="etable-cno">{circled(c.index)}</em>
                        <TexOrText text={rep} />
                        {c.size > 1 && (
                          // 展开三角画成 SVG：`▸` 是键盘敲不出来的字符，
                          // `no-unicode-leak` 走查不认（用户 2026-09-27 的硬要求）
                          <svg
                            className="etable-more"
                            viewBox="0 0 6 9"
                            width="6"
                            height="9"
                            aria-hidden="true"
                          >
                            <path d="M0 0 L6 4.5 L0 9 Z" fill="currentColor" />
                          </svg>
                        )}
                      </button>
                    </th>
                    <td className="etable-cell">{c.order}</td>
                    <td className="etable-cell">{c.inCenter ? 'v' : 'x'}</td>
                    {cell(c.size, '类大小', c.rep.id, rep)}
                    {cell(c.centralizerOrder, '中心化子', c.rep.id, rep)}
                  </tr>
                  {isOpen && (
                    <tr className="etable-expand">
                      <td colSpan={5}>
                        {c.elements.map((e, i) => (
                          <span key={e.id} className="etable-el">
                            {i > 0 && <i className="etable-sep">·</i>}
                            <TexOrText text={elementNotation(group, e)} />
                          </span>
                        ))}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {table.capped && (
        <div className="insp-line dim">|G| 太大，共轭类 / 中心化子未枚举（守卫），留空而非硬算</div>
      )}
    </>
  )
}
