import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  INFO_SECTIONS,
  Insights,
  insightsOf,
  MapCorrespondence,
  MapFacts,
  OtherTab,
  EdgeSection,
  SectionBody,
  STRUCT_SECTIONS,
  type InfoTab,
} from './InfoDock'
import { subgroupClassCount } from './infoHelpers'
import { Tex, TexOrText } from './Tex'
import type { GalEdge, GalObject, StructuralEdge } from '../gal/types'
import type { GalValue, NormalizedSubgroup } from '../gal/value'
import { VALUE_TYPE_LABEL } from '../gal/value'
import { OPS, takesCanvasObject, type OpDef } from '../gal/ops'
import { maxObjectArity } from '../gal/compose'
import { canPick, menuLabel, PARAM_LABEL } from '../gal/interaction'
import { BENCH_FAMILIES, benchArity, familyOps } from '../gal/workbench'
import { opKey } from '../gal/opLabels'
import { mathLabel } from '../gal/mathLabel'
import { STRUCTURE_LEVEL_LABEL } from '../gal/algebra'
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
 * | **v2 三稿** | **计算器**：显示条 + **符号键盘** + 明细区 | 用户：「**对味了。这样不错。**」 |
 * | **v2.1（2026-10-07 本版）** | **左键盘 / 右明细的横排计算器**：左列＝显示屏 + 键盘（三块）+ `＋`；右列＝明细大阅读区（操作时不动）；台面进标题栏；`＋` 面板＝左列内联紧凑手风琴 | 用户：「**先照方案二开发吧**」（方案一被否：「工作台比较宽，一行一行放会压缩用户想看的信息」）|
 *
 * ## 现在各段管什么（v2.1）
 *
 * | 段 | 是什么 | 判据 |
 * |---|---|---|
 * | **左列 · 显示屏** | 当前焦点对象的身份 + `＋` 前的状态行；pending 时在屏上写**算式**（`D₄ × ▢ = ...`）| 像计算器的显示屏 |
 * | **左列 · 符号键盘** | 每条 op 一枚**符号键**，按动作分**三块**（造新东西 / 读它的结构 / 作用与集合）；`＋` 面板开着时让位给它 | **随焦点变** |
 * | **左列 · 待选（pending）** | 槽位 + 候选在键盘上方；**键盘仍在下头**（换主意）| 判据同一份 `canPick` |
 * | **右列 · 明细区** | 焦点对象的精细结构，**一页铺开**（不折叠）；按键盘/翻台面时**纹丝不动** | 内容复用 `InfoDock#SectionBody` |
 * | **标题栏 · 台面** | 碰过的对象 chips（数学名；点它切焦点，`x` 拿下不删）| 存 id，与画布同一份数据 |
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
   * **编辑器卡片**（映射 / 作用 / 运算表那三张）—— 嵌在右列里（2026-10-08 起）。
   *
   * 非空 = 正在编辑：右列让给它，左列键盘留着（"随时可以改主意"）。
   * 它从"贴底浮层"改嵌进来是用户拍的板（「直接嵌入到工作台里面」）——
   * 工作台没开时进编辑器会自动升起（`App` 的 effect），编辑器开着时也不许收起（见 toggle 守卫）。
   */
  editor?: ReactNode
  /** **结构伴生边**（原信息面板的「这条箭头」）——`node` 为空时右列显示它 */
  edge?: { edge: GalEdge; info: StructuralEdge } | null
  /** **跳转请求**（球菜单的「元素 / 子群」入口）：`jumpTo.seq` 变化 ⇒ 切到 `jumpTo.tab` 那一节 */
  jumpTo?: { tab: InfoTab; seq: number } | null
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

/**
 * 升起的默认高度（视口百分比）· 可拖范围。
 *
 * ⚠️ `BENCH_H_DEFAULT` **导出**：对象球的"固定停位"也按它算
 * （`ui/ObjectOrb.tsx#dockY`，2026-10-10 用户拍板「拖台高度时球不动」）——
 * 判据只此一份，别在两处各写一个 0.68。
 */
export const BENCH_H_DEFAULT = 0.68
const H_MIN = 0.4
const H_MAX = 0.88

/**
 * `＋` 面板上那一排**常见群**（一键导入）。
 *
 * 用的全是**输入层本来就认的记号**（`S_4` / `A_4` / `D_4` …），不是 `smallGroup(阶,编号)`：
 * 用户认得 `A₄`，认不得 GAP 编号（用户实测原话：「为什么不能导入常见群？」）。
 * 想浏览全部 93 个群仍然走左栏「目录」。
 *
 * ⚠️ `expr`（能敲的 ASCII 输入语法）与 `tex`（渲染面）**分家**（2026-10-08）：
 * 按钮上显示 `tex`（标准记号：下标 + 乘号），点下去交给输入层的是 `expr`。
 * `C_2 x C_2` 那个 `x` 是输入语法的一部分（键盘敲得出），渲染时必须换成 `\times`。
 */
const COMMON_GROUPS: { expr: string; tex: string }[] = [
  { expr: 'C_6', tex: 'C_{6}' },
  { expr: 'C_12', tex: 'C_{12}' },
  { expr: 'D_4', tex: 'D_{4}' },
  { expr: 'S_3', tex: 'S_{3}' },
  { expr: 'S_4', tex: 'S_{4}' },
  { expr: 'A_4', tex: 'A_{4}' },
  { expr: 'A_5', tex: 'A_{5}' },
  { expr: 'Q_8', tex: 'Q_{8}' },
  { expr: 'C_2 x C_2', tex: 'C_{2}\\times C_{2}' },
]

export function Workbench({
  open,
  onToggle,
  onRunOp,
  node,
  pending,
  objects,
  onPick,
  editor,
  edge,
  jumpTo,
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
   * 群库在 `＋` 面板里**默认折起**（2026-10-07 方案二：手风琴要紧凑——
   * 用户原话「导入按钮拉出来的手风琴太大了，明显可以紧凑一点」）。
   */
  const [libOpen, setLibOpen] = useState(false)
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
  /**
   * `＋` 面板的两种关法（旧账，2026-10-07 修）：**Esc** 与**点外面**。
   *
   * ⚠️ Esc 必须走**捕获阶段 + stopPropagation**：App 的全局 Esc 在 window 冒泡段
   * （清 pending / 清焦点），不拦的话"想关面板"会先把焦点清了（真机复现过：
   * 面板还在、显示条却回了「还没有对象」）。层叠语义：面板开着时 Esc 先关面板，
   * 再按一次才轮到 App 的取消。
   */
  useEffect(() => {
    if (!plusOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setPlusOpen(false)
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || t.closest('.bench-plus-panel') || t.closest('.bench-plus')) return
      setPlusOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [plusOpen])
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

  /** 跳转请求（球菜单的「元素 / 子群」入口）：`seq` 变化 ⇒ 切到那一节 */
  useEffect(() => {
    if (jumpTo) setTab(jumpTo.tab)
  }, [jumpTo])

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
   *
   * 明细区怎么显示以 `sections` 为准（群 / 结构 ⇒ 分节表；其余走 `OtherTab` / `MapFacts`）——
   * 从前这里还有一道 `homeOf(v) === 'bench'` 的闸门（三区投影的旧判据），
   * 信息面板砍掉之后它会让"集合 / 子群集 / 作用"这类对象在工作台里**没有信息可看**
   * （那些内容原来只在信息面板的 `OtherTab` 里）⇒ 2026-10-08 撤掉，统一在这里看。
   */
  const busy = !!editor
  const hasContent = open && (!!node || !!pending || !!edge)

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
  /** 显示屏算式里的已选对象（按槽位顺序，丢引用就跳过）*/
  const pickedObjs = useMemo(
    () =>
      pending
        ? pending.picked
            .map((id) => objects.find((o) => o.id === id))
            .filter((o): o is GalObject => !!o)
        : [],
    [pending, objects],
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

  const h = viewportH ? Math.round(viewportH * (hRatio ?? BENCH_H_DEFAULT)) : undefined

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
    drag.current = { y: e.clientY, h0: (hRatio ?? BENCH_H_DEFAULT) * viewportH }
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

      {/* 标题条 = 收起后那条胶囊。**贴着底**，所以点它落回去时位置不变。
          2026-10-08：台面 chips 已挪进左列当「对象槽」（用户点名），这里只剩标题与焦点 id。 */}
      <header className="bench-head">
        <button
          className="bench-toggle"
          /*
           * ⚠️ 编辑器开着时**不许收起**（2026-10-08）：卡片嵌在右列里，
           * 收起工作台 = 卡片没地方显示（填了一半的输入会变成"消失"）。先完成或取消。
           */
          onClick={() => {
            if (busy) return
            onToggle()
          }}
          disabled={busy}
          title={busy ? '编辑器开着，先完成或取消' : open ? '收起工作台' : '展开工作台'}
        >
          <span className="bench-caret">{open ? 'v' : '^'}</span>
          <span className="bench-title">工作台</span>
          {/* 收起态也要说清"它能干什么"，否则一条光秃秃的胶囊没人敢点。
              2026-10-10 精简：删「点开：」（胶囊摆在那，不必教点）+「翻它的结构」→「看结构」。 */}
          {!open && <span className="bench-peek">造对象 - 对它做事 - 看结构</span>}
        </button>
        {node && <span className="bench-target">{node.id}</span>}
      </header>

      {open && (
        <div className="bench-body">
          {/*
           * ══ 最左列：对象槽（竖排，2026-10-10 用户点名）════════════
           *
           * 用户原话：「对象槽在工作台的位置挪到工作台最左侧竖着放」——
           * 从"左列里的横排 chips"改成**贴工作台最左缘的独立竖列**：
           * 对象多了往下长（列内滚动），不再把左列越撑越高。
           *
           * chips 写**数学名**（`A₄` / `C₆` / `(A, *)`）——用户在槽里认的是"这是哪个对象"，
           * 不是"我给它起的第几个字母"（对象名进 `title`）。
           * 点一下切焦点（走 `onPick`，与"点画布节点"同一个函数）、`x` 拿下不删对象。
           */}
          {stage.length > 0 && (
            <div className="bench-stage">
              <span className="bench-stage-label">对象槽</span>
              <div className="bench-stage-chips">
                {stage.map((id) => {
                  const obj = objects.find((o) => o.id === id)
                  return (
                    <span key={id} className={`bench-chip${id === node?.id ? ' on' : ''}`}>
                      <button className="bench-chip-main" onClick={() => onPick(id)} title={`切到 ${id}`}>
                        {obj ? <TexOrText text={mathLabel(obj).main} /> : id}
                      </button>
                      {/* `x` 是 ASCII（用户 2026-09-27 定的规矩：键盘打不出来的字符不许出现在文本流里）*/}
                      <button
                        className="bench-chip-x"
                        onClick={() => onDrop(id)}
                        title={`把 ${id} 拿下对象槽（不删对象）`}
                      >
                        x
                      </button>
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* ══ 左列：显示屏 + 待选 + 键盘（或 ＋ 面板）+ ＋ 按钮 ══ */}
          <div className="bench-left">
            {/* ── ① 显示屏（计算器的"显示屏"）──────────────────── */}
            <div className="bench-display">
              <div className="bench-screen">
                {node ? (
                  <>
                    {/*
                     * ⚠️ 标题写**数学身份**，不是 `def`（用户实测两条：
                     * 「smallgroup(12,3)？不是 A4？」「map(B,D,a→0,b→1)？为什么不用 φ:A₄→C₃？」）。
                     * `def` 是"它怎么被造出来的"，降为副行（`.bench-foot`）。判据在 `gal/mathLabel.ts`。
                     * 头前那个 chip 是**值类型**（群 / 子群集 / 映射…）——2026-10-08 信息面板
                     * 并入时补搬（原 `.info-target .chip`，走查按它认"这是一包子群"）。
                     *
                     * 2026-10-10 用户点名：结构的 chip 别写泛称「代数结构」，
                     * **直接说它是哪一级**（原群 / 半群 / 幺半群 / 群）——级别判定复用
                     * `algebra.ts#STRUCTURE_LEVEL_LABEL`（与公理档案同一份读数）。
                     */}
                    <div className="bench-screen-title">
                      <span className={`chip chip-${node.value.type}`}>
                        {node.value.type === 'structure'
                          ? STRUCTURE_LEVEL_LABEL[node.value.structure.axioms.level]
                          : VALUE_TYPE_LABEL[node.value.type]}
                      </span>
                      <TexOrText text={ml?.main ?? node.def} />
                    </div>
                    <div className="bench-screen-sub">
                      {[
                        ml?.sub,
                        /*
                         * ⚠️ 副行的「- 阶 N」已撤（2026-10-10 用户点名：「'阶三'也是没必要显示的」）——
                         * 阶在明细「基本」节第一行就有，显示屏副行别再重复。
                         */
                        pending
                          ? `正在选参数：${pending.picked.length} / ${maxObjectArity(pending.op)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join('  -  ')}
                    </div>
                    {/*
                     * pending 时显示屏写**算式**（2026-10-07 方案二）：
                     * 已选对象 + 这枚 op 的符号键 + 一个空格子 + `= ...`。
                     * 空格子是**无文本的样式盒**——`▢` 那种字符键盘打不出来（文本流纪律）。
                     */}
                    {pending && (
                      <div className="bench-eq">
                        {pickedObjs.map((o) => (
                          <TexOrText key={o.id} text={mathLabel(o).main} />
                        ))}
                        <Tex className="bench-eq-op" tex={opKey(pending.op).tex} />
                        <span className="bench-eq-blank" />
                        <span className="bench-eq-tail">= ...</span>
                      </div>
                    )}
                  </>
                ) : (
                  /* 只报状态，不教操作（2026-10-07 用户：「你见过计算器还要标注『按数字按钮来计算』吗」）*/
                  <div className="bench-screen-title">还没有对象</div>
                )}
              </div>
            </div>

            {/*
             * ── ③ 待选（pending）：槽位 + 候选，在键盘**上方** ──────
             * 键盘留在下面（busy 不掐焦点：按另一枚键 = 换主意），列内超长时自己滚。
             */}
            {pending && (
              <div className="bench-slots">
                <div className="bench-slot-head">
                  正在选对象：<code title={pending.op.notation}>{menuLabel(pending.op)}</code>
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
                  <p className="bench-blank">没有能填这一位的对象。</p>
                ) : (
                  <>
                    <div className="bench-cands-title">填第 {slotIdx + 1} 位：</div>
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
            )}

            {/* ── ③ 符号键盘（随焦点变）；`＋` 面板开着时让位给它 ── */}
            {plusOpen ? (
              /*
               * `＋` 面板（2026-10-07 方案二）：**左列内联的紧凑手风琴**。
               * 用户原话：「导入按钮拉出来的手风琴太大了，明显可以紧凑一点」
               * ⇒ 常见群一排小 chip / 群库默认折起 / 自定义三行紧凑表单。
               */
              <div className="bench-plus-panel">
                <div className="plus-head">
                  <span>导入对象</span>
                  <button className="plus-close" onClick={() => setPlusOpen(false)} title="关闭">
                    x
                  </button>
                </div>
                {/* 常见群：显示标准记号（`tex`），点一下把输入语法（`expr`）交给输入层 */}
                <div className="plus-quick">
                  <span className="plus-quick-label">常见群</span>
                  {COMMON_GROUPS.map((g) => (
                    <button
                      key={g.expr}
                      className="plus-chip"
                      title={`导入 ${g.expr}`}
                      onClick={() => {
                        onAdd(g.expr)
                        setPlusOpen(false)
                      }}
                    >
                      <Tex tex={g.tex} />
                    </button>
                  ))}
                </div>
                {/*
                 * 群库：**默认折起**（手风琴要紧凑）；展开才铺 93 个群、按阶分组的
                 * **可读结构名**（`A4` / `C6` / `D8`…），点名字导入。
                 * **不再让用户填「阶, 编号」** —— 用户原话：
                 * 「什么叫群库导入是输入阶和序数？**谁记得住 A4 是 12,3**？你想给谁用？」
                 */}
                <div className="plus-lib">
                  <button className="plus-lib-head" onClick={() => setLibOpen((v) => !v)}>
                    <span className="plus-lib-caret">{libOpen ? 'v' : '>'}</span>
                    <span>群库</span>
                    <span className="plus-lib-hint">93 个群 - 点名字导入</span>
                  </button>
                  {libOpen && (
                    <div className="plus-lib-body">
                      {orders === null ? (
                        <span className="plus-lib-hint">载入中...</span>
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
                                  {/* 群名走渲染面（`structure` 已是 TeX 源，见 `gal/smallGroups.ts`）*/}
                                  <Tex tex={e.structure} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
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
            ) : (
              <nav className="bench-pad" aria-label="工作台键盘">
                {node ? (
                  padCount === 0 ? (
                    <p className="bench-pad-hint">没有可用的操作。</p>
                  ) : (
                    padFamilies.map((f) => (
                    <div key={f.key} className="bench-pad-row" data-fam={f.key}>
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
                              title={`${menuLabel(op)}（${op.notation}）- ${howOf.get(op.id) ?? ''}\n${op.doc}`}
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
                  )
                ) : null}
              </nav>
            )}

            {/* `＋ 导入对象` —— 左列底部的主按钮（用户点名的那枚：「用『＋』按钮让用户来导入对象」）*/}
            <button
              className={`bench-plus${plusOpen ? ' on' : ''}`}
              onClick={() => setPlusOpen((v) => !v)}
              title="造对象（集合 / 群 / 结构）"
            >
              <span className="bench-plus-glyph">＋</span>
              <span className="bench-plus-word">导入对象</span>
            </button>
          </div>

          {/* ══ 右列：明细大阅读区（按键盘 / 翻对象槽时纹丝不动）══ */}
          <div className="bench-right">
            <div className={`bench-detail${busy ? ' busy' : ''}`}>
              {busy ? (
                /*
                 * **编辑器卡片**（映射 / 作用 / 运算表）：由 App 传进来的 ReactNode。
                 * 2026-10-08 起它嵌在这里 —— 不再"贴底浮层吊在台面下沿"
                 * （用户：「卡片位置应该挪到中间或者直接嵌入到工作台里面」）。
                 */
                editor
              ) : node ? (
                sections ? (
                  /* 分节对象（群 / 结构）：**左缘竖排节导航 + 右内容**（2026-10-08 用户：
                     「基本，元素，共轭类等等全部竖着放，不要横着摆」）。
                     标签只写名字 —— 计数 / 级别在内容区里都有，不在标签上重复。 */
                  <div className="bench-read">
                    <nav className="bench-tabs" aria-label="明细区节导航">
                      {sections.map((t) => (
                        <button
                          key={t.id}
                          className={`bench-tab${t.id === tab ? ' on' : ''}`}
                          data-tab={t.id}
                          onClick={() => setTab(t.id)}
                        >
                          <span className="bench-tab-label">{t.label}</span>
                        </button>
                      ))}
                    </nav>
                    <div className="bench-main">
                      {/* 结论层（识别 / 第一同构定理 / 轨道分解）—— 与信息面板同源 */}
                      {ins.length > 0 && (
                        <div className="bench-brief">
                          <Insights items={ins} />
                        </div>
                      )}
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
                    </div>
                  </div>
                ) : (
                  /* 非分节对象（集合 / 元素集 / 子群集 / 作用 / 关系 / 映射）。
                     ⚠️ 这些内容原来住在**信息面板**（`OtherTab` / `MapFacts` 那一支）——
                     2026-10-08 信息面板砍掉、全部并进工作台（用户：「所有信息合并到工作台里面显示」）。
                     这里没有"答案在画布上"的敷衍话：能说的事实全部铺出来。 */
                  <div className="bench-page">
                    {ins.length > 0 && (
                      <div className="bench-brief">
                        <Insights items={ins} />
                      </div>
                    )}
                    {node.value.type === 'map' ? (
                      <>
                        {/* 事实表（定义域/陪域/单·满/核/像/生成元的像）逐项渲染 */}
                        <MapFacts map={node.value.map} />
                        {/* 「元素送到哪里去」——逐元素对应表（U58） */}
                        <MapCorrespondence map={node.value.map} />
                      </>
                    ) : (
                      <OtherTab node={node} onExtract={onExtract} />
                    )}
                  </div>
                )
              ) : edge ? (
                /* 结构伴生边（原信息面板的「这条箭头」）——`node` 与它互斥 */
                <div className="bench-page">
                  <EdgeSection edge={edge} />
                </div>
              ) : null}
              {/* def 行（"它怎么被造出来的"）——编辑器开着时不显示（右列是卡片的地盘）。
                  ⚠️ 结构对象的 def 是 `structure(A, 1, 2, 3, …)` 的完整平铺表（n 阶 = n² 个数字）
                  —— 2026-10-10 用户点名「就不能换个更简洁的记号吗？4 阶要写 16 个数字吗」
                  ⇒ 结构对象这一行不显示（记号在显示屏副行 `B = (A, *)`，表在「运算表」节）。 */}
              {node && !busy && node.value.type !== 'structure' && (
                <div className="bench-foot">
                  <TexOrText text={node.def} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
