import { useEffect, useMemo, useState, type DragEvent } from 'react'
import type { Group } from '@groupviz/core'
import { buildElementTable } from '../gal/summary'
// 「已知群」（U48）：只有符号 + 阶、没有元素表 —— 逐元素表在那种群上不成立
import { isKnownGroup } from '../gal/known'
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
export function ElementsTable({
  group,
  groupRef,
  onAdd,
}: {
  group: Group
  /**
   * 这个群在对象表里的名字（`G`）。
   *
   * 造出来的定义行要用它：`elementSet(G, 12, 13)` / `filter(G, x, ord(x) = 2)`。
   * 不能拿 `group.symbol` 顶替 —— 那是**数学记号**（`C_2 \times C_2` 这种 TeX），
   * 不一定能原样敲回去。拿不到就不给造集合的按钮（不猜）。
   */
  groupRef?: string
  /** 落一行定义 —— 与输入球 / 目录 / 操作表**同一个** `commitExpr` */
  onAdd?: (expr: string) => void
}) {
  const known = isKnownGroup(group)
  // 「已知群」没有元素表（U48）：`buildElementTable` 要遍历元素 —— 那种群上直接不建
  const table = useMemo(() => (known ? null : buildElementTable(group)), [group, known])

  /**
   * **分面表格的选中状态**（U9-c）。
   *
   * 两件事共用一个 `picked`：手动勾选，与"点某一阶的数值"（选整阶）。
   * `cond` 只在**从阶列选出来**时非空 —— 它是"这批元素恰好等于 `ord(x) = n`"的证据；
   * 手动勾了别的之后清掉（那批就不再是某个纯条件了，别拿假条件去造 filter）。
   */
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())
  const [cond, setCond] = useState<string | null>(null)

  /* 换群 ⇒ 清空：勾选是"对这张表"的选择，换一张表不该带着旧勾 */
  useEffect(() => {
    setPicked(new Set())
    setCond(null)
  }, [group])

  if (!table) {
    return (
      <div className="insp-line dim" data-etable="known">
        这是结论表给出的已知群：本地没有元素表（只有符号与阶），逐元素表无从列起
      </div>
    )
  }

  const facts = table?.facts ?? []

  /** 勾一行。手挑出来的不是"某个纯条件"，所以顺手清掉 `cond`（别拿假条件造 filter） */
  const toggleOne = (id: string) => {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
    setCond(null)
  }

  /**
   * 点某一阶的数值 = 选中这一阶的全部元素。
   *
   * **再点一次同一阶就取消**（表格上的开关语义）—— 不然用户想看"3 阶是怎么一批"
   * 点完就没法回到没选的状态，只能去点「清除」。
   */
  const pickOrder = (order: number) => {
    const ids = facts.filter((f) => f.order === order).map((f) => f.element.id)
    const same = ids.length === picked.size && ids.every((id) => picked.has(id))
    setPicked(same ? new Set() : new Set(ids))
    setCond(same ? null : `ord(x) = ${order}`)
  }

  const clear = () => {
    setPicked(new Set())
    setCond(null)
  }

  const pickedFacts = facts.filter((f) => picked.has(f.element.id))
  /** 没有群名就没法造定义行（`elementSet(G, …)` 的 G 从哪来）—— 不猜，只禁用 */
  const canMake = !!groupRef && !!onAdd && pickedFacts.length > 0
  const makeSet = () => {
    if (!canMake) return
    onAdd!(`elementSet(${groupRef}, ${pickedFacts.map((f) => f.element.label).join(', ')})`)
  }
  const makeFilter = () => {
    if (!canMake || !cond) return
    onAdd!(`filter(${groupRef}, x, ${cond})`)
  }

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
              <th className="etable-pick-head" title="勾几个元素，下面可以造元素集" />
              <th className="etable-corner">元素</th>
              <th title="点某一阶的数值：选中这一阶的全部元素">阶</th>
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
                  <td className="etable-pick">
                    <input
                      type="checkbox"
                      checked={picked.has(f.element.id)}
                      onChange={() => toggleOne(f.element.id)}
                      title="勾上：算进要造的集合"
                    />
                  </td>
                  <th className="etable-rowhead">
                    <TexOrText text={el} />
                  </th>
                  {/*
                 * 阶这一格**可点**：点它就选中"这一阶的全部元素"（U9-c 的分面）。
                 * 只给阶开这个口子，因为它是唯一能落成谓词的条件
                 * （`ord(x) = n`）。别的列（共轭类 / 类大小）谓词层表达不了 ——
                 * 做了也只能造出 `{…}`，不如不做，免得表里出现"看起来能点却没反应"的格子。
                 */}
                <td
                  className="etable-cell etable-order"
                  onClick={() => pickOrder(f.order)}
                  title={`选中所有 ${f.order} 阶元素（可以一键造 filter(G, x, ord(x) = ${f.order})）`}
                >
                  {f.order}
                </td>
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
      {/*
       * 分面表格的出口（U9-c）：勾选 → 「造元素集」；点某阶 → 还能「按条件造」。
       *
       * 两条产出的都是**普通的定义行**（`elementSet(G, 12, 13)` / `filter(G, x, ord(x) = 2)`），
       * 与手敲的一模一样 —— 可读、可改、可被别的操作引用。这就是"固化/再编辑"。
       * 不新造一个"勾选出来的集合"这种特殊值：那会让同一个东西有两种来源。
       */}
      {pickedFacts.length > 0 && (
        <div className="etable-tools">
          <span className="etable-count">已选 {pickedFacts.length} 个</span>
          <button
            type="button"
            className="etable-make"
            onClick={makeSet}
            disabled={!canMake}
            title={
              canMake
                ? `落一行 elementSet(${groupRef}, …)`
                : '拿不到这个群在对象表里的名字，造不了定义行'
            }
          >
            造元素集
          </button>
          {cond && (
            <button
              type="button"
              className="etable-make"
              onClick={makeFilter}
              disabled={!canMake}
              title={canMake ? `落一行 filter(${groupRef}, x, ${cond})` : '拿不到群名'}
            >
              按条件造（{cond}）
            </button>
          )}
          <button type="button" className="etable-clear" onClick={clear}>
            清除
          </button>
        </div>
      )}
      {table.capped && (
        <div className="insp-line dim">|G| 太大，共轭类 / 中心化子未枚举（守卫），留空而非硬算</div>
      )}
    </>
  )
}
