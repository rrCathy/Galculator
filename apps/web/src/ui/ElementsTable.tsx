import { useMemo, type DragEvent } from 'react'
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
 * 元素表格（UI v3.3）：**行 = 元素、列 = 属性**。
 *
 * ── v3.2 的错，与为什么退回来 ──────────────────────────────
 * v3.2 把行折成了**共轭类**（`S_4` 24 行 → 5 行），理由是"同类元素属性天生全同、
 * 铺开是纯冗余"。数学上没错，但**用户要的就是逐元素看**：
 * 2026-10-01 用户原话 ——「元素列表你按共轭类收起来是什么意思？我什么时候说过这么做了？
 * 现在只能看共轭类了，连单个元素信息都看不了了。」
 *
 * 判据错在哪：把"面板窄、装不下 6 列"（真正的病根，v3.1 时右两列被裁）当成了
 * "行太多"。裁列是**宽度**问题，折叠治的是**行数**——治错了地方，还顺手把
 * 用户要看的东西（单个元素）藏进了展开态。现在：行 = 元素照旧，
 * 宽度靠**列头收短 + 横向可滚**兜住（`.etable-wrap` 本来就是 `overflow: auto`）。
 *
 * 数字格照旧**可以直接拖进左下角的数值区**（阶 / 类大小 / 中心化子）。
 */
export function ElementsTable({ group }: { group: Group }) {
  const table = useMemo(() => buildElementTable(group), [group])

  const cell = (v: number | null, label: string, elId: string, el: string) => {
    const canDrag = v !== null
    return (
      <td
        className={`etable-cell${canDrag ? ' can-drag' : ''}`}
        draggable={canDrag}
        onDragStart={
          canDrag ? (e) => writeNumberPayload(e, `${label}(${prettySymbol(el)})`, v) : undefined
        }
        title={canDrag ? '拖到左下角数值区' : undefined}
        data-el={elId}
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
              <th className="etable-corner">元素</th>
              <th>阶</th>
              <th>
                {/*
                  只有 `\in Z?` 是 LaTeX（`summary.ts` 的表头）—— 直接写文本会把它原样显示。
                  中文标签**不过 KaTeX**（math mode 会把字体换成衬线体，与表格其余中文不一致）。
                */}
                <Tex tex={'\\in Z?'} />
              </th>
              <th>共轭类</th>
              <th>类大小</th>
              <th>中心化子</th>
            </tr>
          </thead>
          <tbody>
            {table.facts.map((f) => {
              const el = elementNotation(group, f.element)
              return (
                <tr key={f.element.id} data-el={f.element.id}>
                  <th className="etable-rowhead">
                    <TexOrText text={el} />
                  </th>
                  <td className="etable-cell">{f.order}</td>
                  <td className="etable-cell">{f.inCenter ? 'v' : 'x'}</td>
                  <td className="etable-cell">{f.classIndex === null ? '--' : circled(f.classIndex)}</td>
                  {cell(f.classSize, '类大小', f.element.id, el)}
                  {cell(f.centralizerOrder, '中心化子', f.element.id, el)}
                </tr>
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
