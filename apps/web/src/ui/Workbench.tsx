import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  INFO_SECTIONS,
  Insights,
  insightsOf,
  MapFacts,
  SectionBody,
  sectionSummary,
  STRUCT_SECTIONS,
  type InfoTab,
} from './InfoDock'
import { STRUCTURE_LEVEL_LABEL } from '../gal/algebra'
import { subgroupClassCount } from './infoHelpers'
import { Tex, TexOrText } from './Tex'
import type { GalObject } from '../gal/types'
import type { GalValue, NormalizedSubgroup } from '../gal/value'
import { homeOf } from '../gal/value'
import { OPS, takesCanvasObject, type OpDef } from '../gal/ops'
import { maxObjectArity } from '../gal/compose'
import { canPick, menuLabel, PARAM_LABEL } from '../gal/interaction'
import { BENCH_FAMILIES, benchArity, familyOps } from '../gal/workbench'
import { opKey } from '../gal/opLabels'
import { mathLabel } from '../gal/mathLabel'
import { smallGroupCatalog, type SmallGroupList } from '../gal/smallGroups'
import type { Group } from '@groupviz/core'
import { isKnownGroup } from '../gal/known'
import { NewObjectForms } from './NewObjectForms'

/**
 * **工作台**——一台**半透明玻璃计算器**（工作台 v2，2026-10-06）。
 *
 * ## 形态是用户一轮轮逼出来的，三次被否，别退回任何一版
 *
 * | 版本 | 长什么样 | 为什么被否 |
 * |---|---|---|
 * | v1（P1-1）| 选中对象的**细节查看器** | 「什么叫得选对象才能用工作台？」——把**入口**做成了**详情** |
 * | v1'（P1-2）| 左：7 族手风琴任务栏 / 右：信息面板复用 | 「不是探索精细结构的台，是**到处点点点的数控机床**」 |
 * | v2 一稿 | 左列按钮 + 右列折叠列表 | 「还是不行」（本质没变，只换了皮） |
 * | v2 二稿 | 大玻璃台 + 三带一主区 | 「还是不行」——操作面仍是**一堆功能文字** |
 * | **v2 三稿 = 本文件** | **计算器**：显示条 + **符号键盘** + 明细区 | 用户：「**对味了。这样不错。**」 |
 *
 * ## 三段，各管一件事
 *
 * | 段 | 是什么 | 判据 |
 * |---|---|---|
 * | ① **显示条** | 当前焦点对象的身份 + `＋` 导入 | 像计算器的显示屏 |
 * | ② **符号键盘** | 每条 op 一枚**符号键**（`×` `⋊` `/` `Z` `≤` …），悬停出中文全名 | **随焦点变** |
 * | ③ **明细区** | 焦点对象的精细结构，**一页铺开**（不折叠）| 内容复用 `InfoDock#SectionBody` |
 *
 * ## 两条不能丢的判据
 *
 * ① **键盘随焦点变**（P7）—— 焦点是集合就只出"加运算 / 集合运算"那几枚，
 *    是群就出群键，是映射就出 `ker`/`im`。**眼前永远只有十来个键**。
 *    判据是 `canPick(op, 0, [], 焦点值)` —— **与画布高亮同一个函数**，
 *    不新写一套"这个对象能做什么"。
 *
 * ② **符号键不是文本**——`×` `⋊` `≤` `⊴` 这些字符**键盘打不出来**，
 *    用户 2026-09-27 立过规矩「不要显示出来」。它们**只能走 KaTeX 排版**
 *    （`<Tex tex={opKey(op).tex}/>`，键面是字形不是文本流）。
 *    这正是用户当初定的分工：「**显示是排版，文本流是 ASCII**」。
 */
export interface WorkbenchProps {
  open: boolean
  onToggle: () => void
  /** 发起一条 op（与球菜单 / 拖拽 / 目录共用同一条路，见 `App.tsx#dispatchOp`）*/
  onRunOp: (op: OpDef) => void
  /** 焦点对象（与 `InfoDock` 同一个）*/
  node: GalObject | null
  /**
   * **正在等对象的那条 op**（`inter.kind === 'pending'`）。
   *
   * ⚠️ 工作台必须**自己能把对象填进槽位**，不依赖画布（T1 修的**结构性卡死**）：
   * 工作台升起时 `top≈380`、画布节点自动布局在 `y≈450` ⇒ 节点全被盖住，
   * 而 pending 条却让用户"去画布点对象" ⇒ 点不动、pending 永远挂着。
   */
  pending?: { op: OpDef; picked: string[] } | null
  /** 全部对象（槽位候选的来源）*/
  objects: GalObject[]
  /**
   * 把某个对象**填进当前槽位** —— 直接复用画布点击那条路（`App.tsx#onNodeClick`）。
   * 刻意不新写一套"填槽位"逻辑：点画布节点与点槽位候选**在语义上是同一件事**。
   */
  onPick: (id: string) => void
  /**
   * **编辑器卡片开着吗**（映射 / 作用 / 运算表那三张）。
   * 它们是贴底居中的浮层，与工作台重叠 ⇒ 开着时细节区让位，键盘留着。
   */
  editorBusy?: boolean
  onExtract?: (sub: NormalizedSubgroup) => void
  /** 视口尺寸（算升起高度用；不给就按 CSS 的 max-height 走）*/
  viewportH?: number
  /**
   * 把**当前的升起高度**报给 App（px）。
   *
   * ⚠️ 为什么需要：工作台现在占大半屏（默认 68vh、还能拖到 88vh）⇒ **会盖住
   * 底部输入球**（`.composer-orb`，`bottom: 12px`）。真机实测过一次：
   * playwright 点「添加」报 `<div class="bench-page"> … intercepts pointer events`。
   * ⇒ App 拿这个高度把输入球抬到工作台顶边之上（`.app.bench-open .composer-orb`）。
   */
  onHeight?: (h: number) => void
  /** `＋` 面板的两个落行口 —— 与「目录」面板**同一对回调**（见 `ui/NewObjectForms.tsx`）*/
  onAdd: (expr: string) => void
  onBuildStructure: (carrierExpr: string) => void
  /**
   * **台面上的对象**（对象 id，2026-10-06 用户实测第 2 条）。
   *
   * > 「工作台不能储存对象啊？我点两下画布，对象就取消选中了，谁会用丢东西的工作台？」
   *
   * 存的是 **id**，对象本身与画布**是同一份**（用户拍板：「肯定都是同一个对象啊」）。
   */
  stage: string[]
  /** 把某个对象从台面上拿掉（只是不再摆在台上，**不删对象**）*/
  onDrop: (id: string) => void
}

/** 升起的默认高度（视口百分比）· 可拖范围 */
const H_DEFAULT = 0.68
const H_MIN = 0.4
const H_MAX = 0.88

/**
 * `＋` 面板上那一排**常见群**（一键导入）。
 *
 * 用的全是**输入层本来就认的记号**（`S_4` / `A_4` / `D_4` …），不是 `smallGroup(阶,编号)`：
 * 用户认得 `A₄`，认不得 GAP 编号（用户实测原话：「为什么不能导入常见群？」）。
 * 想浏览全部 93 个群仍然走左栏「目录」。
 */
const COMMON_GROUPS = ['C_6', 'C_12', 'D_4', 'S_3', 'S_4', 'A_4', 'A_5', 'Q_8', 'C_2 x C_2']

export function Workbench({
  open,
  onToggle,
  onRunOp,
  node,
  pending,
  objects,
  onPick,
  editorBusy,
  onExtract,
  viewportH,
  onHeight,
  onAdd,
  onBuildStructure,
  stage,
  onDrop,
}: WorkbenchProps) {
  /** 明细区当前摊开的是哪一页（平铺 tab，不是手风琴 —— "摊开，不折叠"）*/
  const [tab, setTab] = useState<InfoTab>('basic')
  /** `＋` 面板开着吗 */
  const [plusOpen, setPlusOpen] = useState(false)
  /**
   * 群库（**懒加载**：首次 ~311ms 给 93 个群跑预计算，与「目录」用的是**同一个**
   * `smallGroupCatalog`）。推到下一个宏任务，让面板先画出来，人不会觉得"点不动"。
   */
  const [orders, setOrders] = useState<SmallGroupList[] | null>(null)
  useEffect(() => {
    if (!plusOpen || orders) return
    const id = setTimeout(() => setOrders(smallGroupCatalog()), 0)
    return () => clearTimeout(id)
  }, [plusOpen, orders])
  /** 拖出来的高度比例（`null` = 用默认）*/
  const [hRatio, setHRatio] = useState<number | null>(null)
  const drag = useRef<{ y: number; h0: number } | null>(null)

  const group: Group | null = node?.value.type === 'group' ? node.value.group : null
  const struct = node?.value.type === 'structure' ? node.value.structure : null
  const showGroup = group ?? struct?.group ?? null

  /** 焦点对象该有哪几页（与 `InfoDock` 同一份判定）*/
  const sections: { id: InfoTab; label: string }[] | null = showGroup
    ? [...INFO_SECTIONS, ...(struct ? STRUCT_SECTIONS : [])]
    : struct
      ? STRUCT_SECTIONS
      : null

  /** 「已知群」只有符号与阶，没有元素表（U48）—— 子群数那一格要改口径。 */
  const canCount = !!showGroup && !isKnownGroup(showGroup)
  const [subCount, setSubCount] = useState<number | null>(null)
  useEffect(() => {
    if (!canCount || !showGroup) {
      setSubCount(null)
      return
    }
    let alive = true
    const id = setTimeout(() => {
      if (alive) setSubCount(subgroupClassCount(showGroup))
    }, 0)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [canCount, showGroup])

  /** 换对象 ⇒ 回到第一页（焦点换了，上次看的那页未必存在）*/
  useEffect(() => {
    setTab('basic')
  }, [node?.id])

  /**
   * **键盘上该有哪几枚键**（P7：随焦点变）。
   *
   * 判据 `canPick(op, 0, [], 焦点值)` —— **与画布上"哪些节点能点"同一个函数**，
   * 也与工作台槽位候选同一个函数。所以键盘上出现的，点下去一定收这个对象当第一参数。
   *
   * 只数**第一参数吃画布对象**的 op：`pointSet(n)` 那种第一参数是标量的，
   * 键盘上按不出来（它们的入口是 `＋` 面板，见 `gal/workbench.ts#BENCH_PLUS`）。
   */
  const padFamilies = useMemo(() => {
    if (!node) return []
    const ok = new Set(
      OPS.filter((op) => {
        const p0 = op.params[0]
        return !!p0 && takesCanvasObject(p0.type) && canPick(op, 0, [], node.value)
      }).map((op) => op.id),
    )
    return BENCH_FAMILIES.map((f) => ({ ...f, ops: familyOps(f).filter((o) => ok.has(o.id)) })).filter(
      (f) => f.ops.length > 0,
    )
  }, [node])

  const padCount = padFamilies.reduce((s, f) => s + f.ops.length, 0)

  /*
   * ⚠️ **升起不再依赖有没有选中对象**（第一版的错就在这里）。
   * 没选对象时显示条仍在、`＋` 仍在 —— 用户能**直接造**（这是他被否的第一条）。
   */
  const showDetail = !editorBusy && !!node && homeOf(node.value) === 'bench'
  const hasContent = open && (!!node || !!pending)

  /** 槽位候选（T1）：判据同一份 `canPick` */
  const slotIdx = pending ? pending.picked.length : 0
  const pickedVals = useMemo<GalValue[]>(
    () =>
      pending
        ? pending.picked
            .map((id) => objects.find((o) => o.id === id)?.value)
            .filter((v): v is GalValue => !!v)
        : [],
    [pending, objects],
  )
  const cands = useMemo(
    () =>
      pending
        ? objects.filter(
            (o) => !pending.picked.includes(o.id) && canPick(pending.op, slotIdx, pickedVals, o.value),
          )
        : [],
    [pending, objects, slotIdx, pickedVals],
  )

  /** 每枚键的角标文案（**判据与 `objectArity` 同源**，见 `gal/workbench.ts#benchArity`）*/
  const howOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of BENCH_FAMILIES) {
      for (const op of familyOps(f)) {
        const a = benchArity(op)
        m.set(op.id, a === 0 ? '直接算' : a === 1 ? '1 个对象' : `${a} 个对象`)
      }
    }
    return m
  }, [])

  const h = viewportH ? Math.round(viewportH * (hRatio ?? H_DEFAULT)) : undefined

  /** 显示条的标题/副行（数学身份 + 定义）。判据在 `gal/mathLabel.ts`。 */
  const ml = useMemo(() => (node ? mathLabel(node) : null), [node])

  /**
   * **结论层**（映射/作用/群的"所以呢"）—— **与信息面板同一份**（`insightsOf`）。
   *
   * ⚠️ 2026-10-06 补。用户实测第 9 条：
   * 「映射的详细信息呢？把信息栏收起了不知道把信息挪过去？？？」
   * —— 收起信息面板却不在工作台里给，那是**丢东西**。
   */
  const ins = useMemo(() => insightsOf(node), [node])

  /* 把高度报给 App（它拿这个把输入球抬到工作台顶边之上，见 `onHeight` 的注释）。
     收起时报 0 —— 那时工作台只是贴底一条 30px 的胶囊，输入球不用让位。 */
  useEffect(() => {
    onHeight?.(open && h ? h : 0)
  }, [open, h, onHeight])

  /* ── 拖高（抓手在顶边）───────────────────────────────── */
  const onGripDown = (e: ReactPointerEvent) => {
    if (!viewportH) return
    drag.current = { y: e.clientY, h0: (hRatio ?? H_DEFAULT) * viewportH }
    const move = (ev: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const next = (d.h0 + (d.y - ev.clientY)) / viewportH
      setHRatio(Math.min(H_MAX, Math.max(H_MIN, next)))
    }
    const up = () => {
      drag.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // ⚠️ 挂 window，不用 setPointerCapture（本项目栽过：指针一离开元素就断）
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <section
      className={`bench${open ? ' open' : ''}${hasContent ? ' risen' : ''}`}
      /* ⚠️ 高度只在**展开时**给：收起态要缩回那条贴底胶囊（给了就一直 68vh，收不下去）。
         高度是内联 style ⇒ CSS 里不许再写 height/max-height（内联压过样式表）。 */
      style={open && h ? { height: `${h}px`, maxHeight: `${h}px` } : undefined}
      data-node={node?.id ?? ''}
    >
      {/* 顶边抓手：拖高（收起态不显示）*/}
      {open && <div className="bench-grip" onPointerDown={onGripDown} title="拖动改变工作台高度" />}

      {/* 标题条 = 收起后那条胶囊。**贴着底**，所以点它落回去时位置不变。 */}
      <header className="bench-head">
        <button className="bench-toggle" onClick={onToggle} title={open ? '收起工作台' : '展开工作台'}>
          <span className="bench-caret">{open ? 'v' : '^'}</span>
          <span className="bench-title">工作台</span>
          {/* 收起态也要说清"它能干什么"，否则一条光秃秃的胶囊没人敢点 */}
          {!open && <span className="bench-peek">点开：造对象 · 对它做事 · 翻它的结构</span>}
        </button>
        {node && <span className="bench-target">{node.id}</span>}
      </header>

      {open && (
        <div className="bench-body">
          {/* ── ① 显示条（计算器的"显示屏"）──────────────────── */}
          <div className="bench-display">
            <div className="bench-screen">
              {node ? (
                <>
                  {/*
                   * ⚠️ 标题写**数学身份**，不是 `def`（用户实测两条：
                   * 「smallgroup(12,3)？不是 A4？」「map(B,D,a→0,b→1)？为什么不用 φ:A₄→C₃？」）。
                   * `def` 是"它怎么被造出来的"，降为副行。判据在 `gal/mathLabel.ts`。
                   */}
                  <div className="bench-screen-title">
                    <TexOrText text={ml?.main ?? node.def} />
                  </div>
                  <div className="bench-screen-sub">
                    {[
                      ml?.sub,
                      showGroup ? `阶 ${showGroup.order}` : null,
                      pending
                        ? `正在选参数：${pending.picked.length} / ${maxObjectArity(pending.op)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join('  ·  ')}
                  </div>
                </>
              ) : (
                <>
                  <div className="bench-screen-title">还没有对象</div>
                  <div className="bench-screen-sub">
                    按右边 <b>＋</b> 造一个（集合 / 群），或点画布上的节点
                  </div>
                </>
              )}
            </div>
            {/*
              **＋ 导入对象**（用户点名的那个按钮）：
              「比如用『＋』按钮让用户来导入对象不就挺好的吗？」
            */}
            <button
              className={`bench-plus${plusOpen ? ' on' : ''}`}
              onClick={() => setPlusOpen((v) => !v)}
              title="造一个对象放上台面（集合 / 群 / 结构）"
            >
              <span className="bench-plus-glyph">＋</span>
              <span className="bench-plus-word">导入对象</span>
            </button>

            {/*
              ⚠️ **`＋` 面板挂在按钮上浮出来**（2026-10-06 第二次返工）。
              第一版把它**塞进 body 的排版流**里 ⇒ 一条往下压的长带，把键盘/明细区全顶下去，
              用户原话：「改了约等于没改。。。」
              ⇒ 改成**浮层（popover）**：锚在 `＋` 下面、右对齐、**不挤动任何东西**。
            */}
            {plusOpen && (
              <div className="bench-plus-panel" onClick={(e) => e.stopPropagation()}>
                <div className="plus-head">
                  <span>导入对象</span>
                  <button className="plus-close" onClick={() => setPlusOpen(false)} title="关闭">
                    x
                  </button>
                </div>
                {/* 常见群：直接走**记号**（输入层本来就认它们）*/}
                <div className="plus-quick">
                  <span className="plus-quick-label">常见群</span>
                  {COMMON_GROUPS.map((g) => (
                    <button
                      key={g}
                      className="plus-chip"
                      title={`导入 ${g}`}
                      onClick={() => {
                        onAdd(g)
                        setPlusOpen(false)
                      }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                {/*
                 * 群库：按阶分组、**显示可读的结构名**（`A4` / `C6` / `D8`…），点名字就导入。
                 * **不再让用户填「阶, 编号」** —— 用户原话：
                 * 「什么叫群库导入是输入阶和序数？**谁记得住 A4 是 12,3**？你想给谁用？」
                 */}
                <div className="plus-lib">
                  <div className="plus-lib-head">
                    群库<span className="plus-lib-hint">按阶分组，点名字导入</span>
                  </div>
                  <div className="plus-lib-body">
                    {orders === null ? (
                      <span className="plus-lib-hint">正在载入…</span>
                    ) : (
                      orders.map((g) => (
                        <div key={g.order} className="plus-lib-row">
                          <span className="plus-lib-order">阶 {g.order}</span>
                          <div className="plus-lib-items">
                            {g.entries.map((e) => (
                              <button
                                key={e.i}
                                className="plus-chip"
                                title={`smallGroup(${g.order}, ${e.i})`}
                                onClick={() => {
                                  onAdd(`smallGroup(${g.order}, ${e.i})`)
                                  setPlusOpen(false)
                                }}
                              >
                                {e.structure}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                {/* 造集合 / 造结构：与「目录」共用同一套表单（`ui/NewObjectForms.tsx`）*/}
                <NewObjectForms
                  onAdd={(e) => {
                    onAdd(e)
                    setPlusOpen(false)
                  }}
                  onBuildStructure={(e) => {
                    onBuildStructure(e)
                    setPlusOpen(false)
                  }}
                />
              </div>
            )}
          </div>

          {/* ── ② 台面：摆上来的对象（**不会因为点一下画布就消失**）──── */}
          {stage.length > 0 && (
            <div className="bench-stage">
              <span className="bench-stage-label">台面上</span>
              {stage.map((id) => {
                /*
                 * chip 上写**数学名**（`A₄` / `C₆`），不是对象名（`A` / `B`）——
                 * 用户在台面上认的是"这是哪个群"，不是"我给它起的第几个字母"。
                 * 对象名进 `title`，随时能查到。
                 */
                const obj = objects.find((o) => o.id === id)
                return (
                  <span key={id} className={`bench-chip${id === node?.id ? ' on' : ''}`}>
                    {/* 点一下 = 切到它 —— 走的是 `onPick`，与"点画布节点"**同一个函数** */}
                    <button className="bench-chip-main" onClick={() => onPick(id)} title={`切到 ${id}`}>
                      {obj ? <TexOrText text={mathLabel(obj).main} /> : id}
                    </button>
                    {/* `x` 是 ASCII（用户 2026-09-27 定的规矩：键盘打不出来的字符不许出现在文本流里）*/}
                    <button
                      className="bench-chip-x"
                      onClick={() => onDrop(id)}
                      title={`把 ${id} 拿下台面（不删对象）`}
                    >
                      x
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          {/* ── ③ 符号键盘（随焦点变）──────────────────────── */}
          <nav className="bench-pad" aria-label="工作台键盘">
            {!node ? (
              <p className="bench-pad-hint">
                键盘要**先有一个对象**：按 <b>＋</b> 造一个，或点画布上的节点。
              </p>
            ) : padCount === 0 ? (
              <p className="bench-pad-hint">这个对象暂时没有可用的操作。</p>
            ) : (
              padFamilies.map((f) => (
                <div key={f.key} className="bench-pad-row">
                  <span className="bench-pad-label">{f.label}</span>
                  <div className="bench-pad-keys">
                    {f.ops.map((op) => {
                      const n = benchArity(op)
                      return (
                        <button
                          key={op.id}
                          className="bench-key"
                          data-op={op.id}
                          onClick={() => onRunOp(op)}
                          title={`${menuLabel(op)}（${op.notation}）· ${howOf.get(op.id) ?? ''}\n${op.doc}`}
                        >
                          {/* 键面走 KaTeX：`×` `⋊` `≤` 这些字符键盘打不出来，
                              用户 2026-09-27 定的规矩是"不许出现在文本流里"——
                              显示只能靠排版（`opKey` 给 KaTeX 源，`keyAscii` 给纯文本替身）。 */}
                          <Tex className="bench-key-glyph" tex={opKey(op).tex} />
                          {n > 1 && <span className="bench-key-n">{n}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </nav>

          {/* ── ③ 明细区（一页铺开，不折叠）────────────────── */}
          <div className={`bench-detail${editorBusy ? ' busy' : ''}`}>
            {editorBusy ? (
              <p className="bench-blank">
                正在填一张表（下面那张卡片就是）。
                <br />
                填完提交，或者点它右上角的 x 取消 —— 键盘随时可以改主意。
              </p>
            ) : pending ? (
              /* **对象槽位**（T1）—— 工作台自己把参数对象凑齐，**不依赖画布** */
              <div className="bench-slots">
                <div className="bench-slot-head">
                  正在选对象：<code title={pending.op.notation}>{menuLabel(pending.op)}</code>
                  <span className="bench-slot-hint">（在下面点，不用去画布）</span>
                </div>
                <div className="bench-slot-list">
                  {Array.from({ length: Math.max(maxObjectArity(pending.op), slotIdx) }).map((_, i) => {
                    const id = pending.picked[i]
                    const obj = id ? objects.find((o) => o.id === id) : null
                    const p = pending.op.params[i]
                    return (
                      <div
                        key={i}
                        className={`bench-slot${obj ? ' filled' : i === slotIdx ? ' want' : ''}`}
                      >
                        <span className="bench-slot-n">{i + 1}</span>
                        {obj ? (
                          <>
                            <span className="bench-slot-id">{obj.id}</span>
                            <span className="bench-slot-def">{obj.def}</span>
                          </>
                        ) : (
                          <span className="bench-slot-want">
                            待选{p ? `：${p.name}（${PARAM_LABEL[p.type]}）` : ''}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
                {cands.length === 0 ? (
                  <p className="bench-blank">
                    画布上还没有能填这一位的对象 —— 按上面的 <b>＋</b> 造一个。
                  </p>
                ) : (
                  <>
                    <div className="bench-cands-title">点一下填进第 {slotIdx + 1} 位：</div>
                    <div className="bench-cands-list">
                      {cands.map((o) => (
                        <button key={o.id} className="bench-cand" onClick={() => onPick(o.id)}>
                          <span className="bench-cand-id">{o.id}</span>
                          <span className="bench-cand-def">{o.def}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : !node ? (
              <p className="bench-blank">
                按 <b>＋</b> 造一个对象，这里就会摊开它的结构。
              </p>
            ) : !showDetail ? (
              /*
               * **映射 / 作用 / 关系**这类"答案在画布上的"的值 —— 从前这里只有一句
               * 「答案在画布上」，用户实测第 9 条问的就是"那详细信息呢？"。
               * 现在把**结论层原样铺出来**（`insightsOf`，与信息面板同一份判据）。
               */
              ins.length > 0 || node.value.type === 'map' ? (
                <div className="bench-page">
                  {/* 结论层（"所以呢"）+ **事实表**（定义域/陪域/单·满/核/像）——
                      两者一份两处显示，与信息面板同源 */}
                  <Insights items={ins} />
                  {node.value.type === 'map' && <MapFacts map={node.value.map} />}
                </div>
              ) : (
                <p className="bench-blank">
                  <code>{node.id}</code> 是
                  {/* `map` 这一支**走不到这里**（上面那个条件已经把它接走了）——
                      所以下面不再列它，否则是死代码。 */}
                  {node.value.type === 'action'
                    ? '一个作用 —— 画布上那条作用线就是它'
                    : node.value.type === 'relation'
                      ? '一条关系边 —— 画布上那条线就是它'
                      : '一条边 —— 画布上那条线就是它'}
                  ，答案在画布上。
                </p>
              )
            ) : sections ? (
              <>
                {/* 结论层（识别 / 第一同构定理 / 轨道分解）—— 与信息面板同一份 */}
                {ins.length > 0 && (
                  <div className="bench-brief">
                    <Insights items={ins} />
                  </div>
                )}
                {/* 平铺 tab 条（**不是手风琴**：进工作台是"摊开读"，不是"一层层点开"）*/}
                <div className="bench-tabs">
                  {sections.map((t) => (
                    <button
                      key={t.id}
                      className={`bench-tab${t.id === tab ? ' on' : ''}`}
                      data-tab={t.id}
                      onClick={() => setTab(t.id)}
                    >
                      <span className="bench-tab-label">{t.label}</span>
                      {t.id === 'axioms' && struct ? (
                        <span className="bench-tab-sum">{STRUCTURE_LEVEL_LABEL[struct.axioms.level]}</span>
                      ) : t.id === 'table' && struct ? (
                        <span className="bench-tab-sum">
                          {struct.carrier.length > 0 ? `${struct.carrier.length} x ${struct.carrier.length}` : ''}
                        </span>
                      ) : showGroup &&
                        (t.id === 'basic' || t.id === 'elements' || t.id === 'conj' || t.id === 'subgroups') ? (
                        <span className="bench-tab-sum">{sectionSummary(t.id, showGroup, subCount)}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
                <div className="bench-page">
                  <SectionBody
                    section={tab}
                    group={showGroup}
                    struct={struct}
                    node={node}
                    active={null}
                    subCount={subCount}
                    onExtract={onExtract}
                  />
                </div>
              </>
            ) : (
              <div className="bench-page">
                <SectionBody
                  section="basic"
                  group={group}
                  struct={struct}
                  node={node}
                  active={null}
                  subCount={subCount}
                  onExtract={onExtract}
                />
              </div>
            )}
            {node && (
              <div className="bench-foot">
                <TexOrText text={node.def} />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
