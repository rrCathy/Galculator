import { Fragment, useMemo, useState } from 'react'
import { verifyAxioms, type AxiomProfile } from '../gal/algebra'
import { checkName, nextAutoName, normalizeName } from '../gal/naming'
import { prettySymbol } from '../gal/pretty'
import type { OpDef } from '../gal/ops'
import type { CanvasNode, GalObject } from '../gal/types'
import type { GalValue } from '../gal/value'
import { axiomRows, verdictText } from './axiomReadout'
import { TexOrText } from './Tex'

/**
 * 表格编辑器支持的载体上限 —— 超过就说清"改走文本形态"，**不静默截断**。
 *
 * 与 `algebra.ts#STRUCTURE_MAX`（64）是两回事：那个是**算力**的界（结合律 O(n³)），
 * 这个是**表格**的界。12×12 = 144 格已经要滚屏了；真要 20 阶的表，
 * `structure(P, 1,2,3, ...)` 一行贴进去比 400 个下拉框快得多。
 */
export const STRUCTURE_BUILDER_MAX = 12

/** 载体能给出的标号（非集合 / 元素集 ⇒ null）。 */
function labelsOf(v: GalValue): string[] | null {
  if (v.type === 'set') return v.set.members.map((m) => m.label)
  if (v.type === 'elements') return v.elements.map((e) => e.label)
  return null
}

/**
 * 结构构建器（S2a）—— **给一个集合配一个二元运算，看它到哪一级**。
 *
 * ## 它替代了什么
 *
 * `structure(P, table)` 的文本形态要用户一行敲 n² 个整数（三阶 9 个、四阶 16 个），
 * 敲错了只会得到"表项要 1..n 的整数"——而**用户真正想知道的**（结合吗、有单位元吗、
 * 到哪一级）他一个字都没看见。这个编辑器把那张表**摊开成格子**，边填边算：
 *
 *   · 行列头 = 载荷体的标号（`pointSet(3)` ⇒ `1 2 3`；`labeledSet(a,b,c)` ⇒ `a b c`）
 *   · 每格一个下拉（值 = 结果的标号）—— **非法值从源头上填不进去**
 *   · 底部**实时**公理档案：逐条打勾打叉，并且**给反例**（不结合给三元组、
 *     无逆给元素、非拉丁方给坏行）—— 这是 `verifyAxioms` 的读数，不是另写一份
 *
 * ## 与映射编辑器（`MapBuilder`）的关系
 *
 * 同一个壳、同一个纪律：**产出的是定义行的表达式**（`M = structure(P, 1, 2, ...)`），
 * 交给 `App#submitEditorLine` 走与"打出来的"完全相同的那条求值路径。
 * 所以编辑器里能建的，手打也一定能建；反之亦然。
 *
 * ## 不猜、不默认
 *
 * 表格**初始全空**。预填一张"看起来像群"的表就是把用户的结论替他写了
 * （项目纪律："默认值也是一种断言"，见 MEMORY 的 U25 那条）。
 */
export function StructureBuilder(props: {
  op: OpDef
  carrier: CanvasNode
  objects: GalObject[]
  onSubmit: (line: string) => void
  onCancel: () => void
}) {
  const labels = labelsOf(props.carrier.value)
  /*
   * 挡在**包装层**（不是把守卫塞进编辑器里）：编辑器那一堆 hooks 的顺序
   * 不能被条件提前 return 打乱（rules-of-hooks）—— 与 `MapBuilder` 同一处纪律。
   */
  if (!labels) {
    return (
      <div className="insp-line dim">
        「{props.carrier.id}」不能当载体：运算要一张有限的元素表，
        载体得是集合（`pointSet` / `labeledSet` / `asSet` 的产物）或元素集。
      </div>
    )
  }
  if (labels.length > STRUCTURE_BUILDER_MAX) {
    return (
      <div className="insp-line dim">
        「{props.carrier.id}」有 {labels.length} 个点，超过表格编辑器的上限 {STRUCTURE_BUILDER_MAX}。
        这么大的表请用文本形态：<code>structure({props.carrier.id}, ...)</code>
        （{labels.length} x {labels.length} = {labels.length * labels.length} 个表项，按行优先给 1..{labels.length}）。
      </div>
    )
  }
  return <StructureEditor {...props} labels={labels} />
}

function StructureEditor({
  carrier,
  objects,
  onSubmit,
  onCancel,
  labels,
}: {
  op: OpDef
  carrier: CanvasNode
  objects: GalObject[]
  onSubmit: (line: string) => void
  onCancel: () => void
  labels: string[]
}) {
  const n = labels.length
  /** 行优先展平的格值：`''` = 还没填，否则是 `'1'..'n'`（结果元素的 1-based 下标）*/
  const [cells, setCells] = useState<string[]>(() => Array(n * n).fill(''))
  const usedNames = useMemo(() => objects.map((o) => o.id), [objects])
  const [nameDraft, setNameDraft] = useState('')
  const autoName = useMemo(() => nextAutoName(usedNames), [usedNames])
  const nameCheck = useMemo(() => checkName(nameDraft, usedNames), [nameDraft, usedNames])

  const filled = cells.filter((c) => c !== '').length
  const complete = filled === n * n

  /**
   * **实时**档案。表没填满就不算 —— "半张表到哪一级"是没有意义的问题，
   * 硬算只会给出一个假结论（`verifyAxioms` 会把空格当坏格 ⇒ 一律 magma）。
   */
  const profile = useMemo<AxiomProfile | null>(() => {
    if (!complete) return null
    const table = Array.from({ length: n }, (_, i) =>
      cells.slice(i * n, (i + 1) * n).map((c) => Number(c)),
    )
    const out = verifyAxioms(labels, table)
    return out.ok ? out.profile : null
  }, [cells, complete, labels, n])

  const canSubmit = complete && !nameCheck.error
  const submit = () => {
    if (!canSubmit || !profile) return
    const name = normalizeName(nameDraft.trim()) || autoName
    // 与手打**逐字同源**的一行：`M = structure(P, 1, 2, 3, 2, 3, 1, 3, 1, 2)`
    onSubmit(`${name} = structure(${carrier.id}, ${cells.join(', ')})`)
  }

  const setCell = (i: number, v: string) =>
    setCells((prev) => {
      const next = prev.slice()
      next[i] = v
      return next
    })

  return (
    <div className="map-builder struct-builder" onClick={(e) => e.stopPropagation()}>
      <div className="mb-head">
        <span className="chip chip-structure">代数结构</span>
        <strong>运算表 :</strong>
        <TexOrText text={carrier.label} />
        <span className="mb-arrow">上的二元运算</span>
        <button className="mb-x" onClick={onCancel} title="取消（Esc）">
          x
        </button>
      </div>

      <div className="mb-hint">
        每格填「第几行乘第几列得到谁」- 表项按行优先 1..{n} 编号，行列头就是这些编号。
      </div>

      {/* 可滚的网格：64 阶也能看（超上限那一支在包装层就拦了）；12 阶以内不用滚 */}
      <div className="sb-scroll">
        <div
          className="sb-grid"
          style={{ gridTemplateColumns: `auto repeat(${n}, minmax(38px, 1fr))` }}
        >
          <div className="sb-corner" />
          {labels.map((l, j) => (
            <div key={`c${j}`} className="sb-collabel">
              <TexOrText text={prettySymbol(l)} />
            </div>
          ))}
          {Array.from({ length: n }, (_, i) => (
            <Fragment key={`r${i}`}>
              <div className="sb-rowlabel">
                <TexOrText text={prettySymbol(labels[i])} />
              </div>
              {Array.from({ length: n }, (_, j) => (
                <select
                  key={`${i}-${j}`}
                  className={`sb-cell${cells[i * n + j] === '' ? ' empty' : ''}`}
                  data-cell={`${i}-${j}`}
                  value={cells[i * n + j]}
                  onChange={(e) => setCell(i * n + j, e.target.value)}
                  title={`${labels[i]} 乘 ${labels[j]} 得到谁`}
                >
                  <option value="">.</option>
                  {labels.map((l, k) => (
                    // 原生 <option> 只能放纯文本 —— 与 MapBuilder 同一条约束
                    <option key={k} value={String(k + 1)}>
                      {prettySymbol(l)}
                    </option>
                  ))}
                </select>
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      <div className={`mb-check ${profile ? 'ok' : 'empty'}`}>
        {!profile ? (
          <span>
            还有 {n * n - filled} 格没填（共 {n * n} 格）
          </span>
        ) : (
          <>
            <span className="mb-ok-mark">v</span>
            <span>表填满了 - 下面是逐条读数</span>
          </>
        )}
      </div>

      {profile && <AxiomReadout labels={labels} profile={profile} />}

      <div className="mb-foot">
        <input
          className="mb-name"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          placeholder={autoName}
          title={`留空则命名为「${autoName}」`}
          spellCheck={false}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <button className="mb-btn" onClick={onCancel}>
          取消
        </button>
        <button className="mb-btn primary" onClick={submit} disabled={!canSubmit}>
          确认
        </button>
      </div>
    </div>
  )
}

/**
 * 逐条读数（线 A/B/C 的落点，DEVPLAN §13.1）。
 *
 * 为什么**每条都上屏**而不是只给个 `level`：学生交的作业上写的正是
 * 「结合、有单位元、但 0 没有逆，所以是幺半群不是群」。只甩一个结论等于
 * 把推理过程藏起来 —— 而这一章的教学价值**全在那个过程里**。
 *
 * 行的内容来自 `axiomReadout.ts#axiomRows`（**与信息面板同一份**）。
 * 打勾用 `v` / 打叉用 `x`：`✓` `✗` 键盘打不出来（`no-unicode-leak` 守着，
 * 与 `MapBuilder` 同款）。
 */
function AxiomReadout({ labels, profile: p }: { labels: string[]; profile: AxiomProfile }) {
  const rows = axiomRows(labels, p)
  const v = verdictText(p)
  return (
    <div className="sb-axioms" data-level={p.level}>
      {rows.map((r) => (
        <div key={r.key} className={`sb-ax${r.ok === null ? ' note' : r.ok ? ' ok' : ' bad'}`}>
          {/* 列表型读数没有"对错"，用 `-` 占位 —— 空着会让人以为漏了一个判断 */}
          <span className={`sb-mark${r.ok === null ? ' note' : r.ok ? ' ok' : ' bad'}`}>
            {r.ok === null ? '-' : r.ok ? 'v' : 'x'}
          </span>
          <span className="sb-ax-k">{r.key}</span>
          <span className="sb-ax-v">{r.text}</span>
        </div>
      ))}

      <div className={`sb-verdict verdict-${p.level}`} data-verdict={p.level}>
        <span className="sb-verdict-label">结论</span>
        <strong>{v.level}</strong>
        {v.gap && <span className="sb-verdict-gap">就差一步：{v.gap}</span>}
      </div>
    </div>
  )
}
