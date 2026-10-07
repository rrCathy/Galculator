import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { buildLines } from './gal/build'
import { deriveCanvas, STRUCT_PREFIX } from './gal/derive'
import { evalExpr } from './gal/evalDef'
import { opById, type OpDef } from './gal/ops'
import { composeCall, maxObjectArity, objectArity, scalarDefault, scalarSlots } from './gal/compose'
import {
  activeOpId,
  canPick,
  focusId,
  IDLE,
  menuLabel,
  multiOps,
  needsEditor,
  pairOps,
  pairMissHint,
  pickedIds,
  pendingHint,
  singleOpsFor,
  type Interaction,
  type PairCandidate,
} from './gal/interaction'
import { computedNumbers, type NumericEntry } from './gal/numeric'
import { renameRefs, nextAutoName } from './gal/naming'
import { findExistingObject } from './gal/identity'
import { parseSnapshot, serializeSnapshot, SNAPSHOT_VERSION } from './gal/snapshot'
import { boardDisabled, loadBoardLines, saveBoardLines } from './gal/board'
import { SnapshotCard } from './ui/SnapshotCard'
import type { Group } from '@groupviz/core'
import { opTemplate } from './gal/ops'
import { proofHighlight, proofLines, type ProofParams, type ProofTemplate } from './gal/proof'
import { CanvasView, type CanvasHandle, type NodeAnchor } from './ui/CanvasView'
import { ObjectOrb, type OrbStage } from './ui/ObjectOrb'
import { MultiOrb } from './ui/MultiOrb'
import { ComposerOrb } from './ui/ComposerOrb'
import { MapBuilder } from './ui/MapBuilder'
// 作用编辑器（U52）：点住一个群就能填「它作用在 n 个点上」的像
import { ActionBuilder } from './ui/ActionBuilder'
// 结构编辑器（S2a）：给一个集合配一张乘法表，实时算它到哪一级
import { StructureBuilder } from './ui/StructureBuilder'
import type { CanvasNode } from './gal/types'
import { ProofDock } from './ui/ProofDock'
import { ObjectDock } from './ui/ObjectDock'
import { Workbench } from './ui/Workbench'
import { OpDock } from './ui/OpDock'
import { CatalogDock } from './ui/CatalogDock'
import { InfoDock, type InfoTab } from './ui/InfoDock'
import { NumericDock } from './ui/NumericDock'
import type { GalValue, NormalizedSubgroup } from './gal/value'

/**
 * 默认示范（U0–U2 能力清单）：
 *   `G = D_4` 记号建群 · `Z(G)` 子群升级为**真群对象**（圆 → 方，于是 `Z(Z(G))` 合法）
 *   `commutator(G)` 迭代闭包 · `Z ∩ C` 集合运算 · `G / Z` 商群 · `Sub(G)` 枚举 · `ord` 数值进栈
 */
const DEFAULT_LINES = [
  // Sylow III 的完整故事（MVP 的落点）：
  //   造 Ω → 让 G 作用上去 → 轨道 / 稳定子 → 三条结论
  // 打开就能看到交换图：`G ↷ Ω`、`Orb(H) = Ω`（传递）、`N_G(H) ↪ G`
  'G = S_4',
  'Syl = Syl_p(G, 3)',
  'Omega= asSet(Syl)',
  'A = conjOn(G, Omega)',
  'O = orbits(A, 1)',
  'N = stabilizer(A, 1)',
]

/* ── 设置（缺口 ⑭）：本地持久化，跟钉住位置同一个待遇 ───────────── */

const SETTINGS_KEY = 'galculator.settings:v1'

/**
 * 「定义同态后自动补第一同构定理的顶点」——**默认开**。
 *
 * 默认开是因为**证明模板依赖它**（M2 只写 φ 那一行，正方形其余顶点由它铺出来）；
 * 手工搭图的人可以关掉（用户实测的原话："自动构图第一同构定理，其实没什么必要"）。
 */
export function loadAutoFirstIso(): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return true
    const parsed = JSON.parse(raw) as { autoFirstIso?: unknown }
    return parsed?.autoFirstIso === false ? false : true
  } catch {
    return true
  }
}

function saveAutoFirstIso(v: boolean) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ autoFirstIso: v }))
  } catch {
    /* 隐私模式下写不了——不影响本次会话 */
  }
}

/**
 * 应用外壳（UI v3）。
 *
 * 布局原则改了：**画布占满窗口，面板浮在它上面**。
 *   左上 —— 并排三个下拉抽屉：对象（含输入框）· 操作 · 信息
 *   左下 —— 数值上拉抽屉
 *   顶部中央 —— 多对象操作悬浮球
 *   节点左上角 —— 对象悬浮球（看 / 单对象操作）
 */
export default function App() {
  const [lines, setLines] = useState<string[]>(() => {
    // `?empty=1` 从**空画布**起（走查脚本用它，免得依赖默认示范的内容）
    if (typeof location !== 'undefined' && location.search.includes('empty')) return []
    /**
     * 上次离开时的那张图（用户实测反馈第一条："我希望刷新时保存画布"）。
     * 定义行是整张图的唯一真相 —— 存下它就等于存下整张图；钉住位置与视口
     * 由画布自己持久化（决策 ④）。都没存过才落到默认示范。
     */
    return loadBoardLines() ?? DEFAULT_LINES
  })
  const [inter, setInter] = useState<Interaction>(IDLE)
  const [orbStage, setOrbStage] = useState<OrbStage>('closed')
  const [multiOpen, setMultiOpen] = useState(false)
  const [anchors, setAnchors] = useState<NodeAnchor[]>([])
  const [canvasSize, setCanvasSize] = useState({ w: 900, h: 620 })
  const [notice, setNotice] = useState<{ text: string; hint?: string } | null>(null)
  /**
   * 拖拽连线松手后的**候选菜单**（多个候选时才出现）。
   * `at` 是画布容器内像素坐标——菜单按它定位，跟悬浮球同一套坐标。
   */
  const [connectMenu, setConnectMenu] = useState<{
    at: { x: number; y: number }
    from: string
    to: string
    cands: PairCandidate[]
    /**
     * 「为什么没有【包含】」的一句话（U38）。两个群凑一起却没列出包含时给个理由
     * （阶不整除 / 群太大没算 / 算过确实没有）—— 菜单不撒谎，但也不该沉默。
     */
    missHint: string | null
  } | null>(null)

  // 默认只展开「对象」：都摊开会把画布左上角整片盖住，连顶部那颗球都压上去了
  const [openObjects, setOpenObjects] = useState(true)
  const [openOps, setOpenOps] = useState(false)
  /**
   * 「目录」面板（U56）：从库里挑群 / 凭空造集合。
   *
   * 它与「对象 / 操作」同列 —— 三者都是"让画布上多一个对象"的入口，
   * 区别只在东西从哪来（手输 / 运算产出 / 库）。默认收起：它一展开就是
   * 93 个群的长列表，常驻会把画布压掉。
   */
  const [openCatalog, setOpenCatalog] = useState(false)
  const [openInfo, setOpenInfo] = useState(false)
  const [openNumeric, setOpenNumeric] = useState(true)
  /**
   * **工作台**的升起 / 收起（P1，2026-10-05）。
   *
   * 与 `openInfo` 是**两个独立开关**，不是同一个：用户定的是"工作台从底部升起"，
   * 而 `InfoDock` 仍留在左上那一列抽屉里（它是"随手瞄一眼"的入口）。
   * 两者显示同一批内容（`SectionBody`）—— **内容一份、两个地方**。
   *
   * 默认**收起**：它一升起就吃掉 45vh 的画布高度，而用户可能只是瞄一眼。
   */
  const [benchOpen, setBenchOpen] = useState(false)
  /**
   * 工作台当前的升起高度（px，收起时 0）。工作台自己报上来（`Workbench#onHeight`）。
   *
   * ⚠️ 它是**给输入球让位用的**：工作台占大半屏会盖住 `.composer-orb`
   * （真机实测：点「添加」报 `intercepts pointer events`）。见 App.css 里
   * `.app.bench-open .composer-orb` 那条规则。
   */
  const [benchH, setBenchH] = useState(0)

  /**
   * **工作台台面上的对象**（2026-10-06，用户实测第 2 条）。
   *
   * > 「工作台不能储存对象啊？我点两下画布，对象就取消选中了，**谁会用丢东西的工作台**？」
   *
   * ⇒ 台面自己记一份"摆上来的对象"，**与画布焦点解耦**：焦点被清掉不影响它。
   *
   * ⚠️ 存的是 **id**，不是对象的副本 —— 台面上的对象与画布上的对象**是同一个**
   * （用户 2026-10-06 拍板：「肯定都是同一个对象啊，工作台的对象和画布的对象肯定是同一个」）。
   * 所以这只是一份**选择**，不新造数据（避开三区那个"同一性"陷阱）。
   */
  const [benchStage, setBenchStage] = useState<string[]>([])

  /**
   * **工作台升起 ⇒ 自动收起信息面板**（2026-10-06，用户实测第 4 条）。
   *
   * > 「又是工作台，又是信息栏，不知道取舍？不会收起信息栏？」
   *
   * 工作台的明细区本来就是 `InfoDock#SectionBody` 的**同一份内容**（一份两处显示），
   * 同时摆出来就是两遍。收掉的那份用户还能自己再点开（这条只在他"升起工作台"那一下触发）。
   */
  useEffect(() => {
    if (benchOpen) setOpenInfo(false)
  }, [benchOpen])
  /**
   * 信息面板**展开的那一节**（U45 起是手风琴，不再是 tab）。
   * `null` = 全收 —— 默认状态就是它：不点开，面板只剩摘要 + 三行标题。
   */
  const [infoTab, setInfoTab] = useState<InfoTab | null>(null)
  const [dragged, setDragged] = useState<NumericEntry[]>([])
  const [composerOpen, setComposerOpen] = useState(false)
  /**
   * 正在**编辑的旧定义行**（缺口 ⑱：对象不能改名/改定义，只能删了重打）。
   *
   * 复用的是底部那个输入球：点行上的「改」→ 输入球展开并预填这一行 →
   * 提交时**替换**该行而不是追加。于是改名与改定义是同一条路（改名就是改左边那半）。
   */
  const [editing, setEditing] = useState<{ index: number; name: string; expr: string } | null>(null)
  /**
   * 设置：定义同态后是否自动补第一同构定理的两个顶点（缺口 ⑭，默认开）。
   * 关掉之后，`φ` 那一行只长出它自己 —— 手工搭图的人不被"自动构图"打扰。
   */
  const [autoFirstIso, setAutoFirstIso] = useState(() =>
    typeof location !== 'undefined' && location.search.includes('empty')
      ? true
      : loadAutoFirstIso(),
  )
  useEffect(() => {
    if (typeof location === 'undefined' || location.search.includes('empty')) return
    saveAutoFirstIso(autoFirstIso)
  }, [autoFirstIso])

  /**
   * 定义行**自动落盘**（用户实测反馈第一条："刷新时保存画布"）。
   *
   * 静默、无感：每次改定义就写一次，刷新回来还是这张图。空画布 = 删档
   * （见 `board.ts`）——所以"清空画布"之后刷新不会把图变回来。
   */
  useEffect(() => {
    if (boardDisabled()) return
    saveBoardLines(lines)
  }, [lines])

  /**
   * 清空画布：定义行（App 的）+ 钉住 / 视口（画布的）一起清。
   * 只清定义行的话，钉住的位置会变成下一张图的**孤儿数据**——
   * 自动命名又从 `A` 开始，新对象会继承旧位置，画布一开就是歪的。
   *
   * 落盘交给 `lines` 那个 effect：它会把**空数组**写进去（而不是删档），
   * 于是刷新之后是空画布，而不是又冒出来的默认示范页。
   */
  const clearBoard = useCallback(() => {
    setLines([])
    setInter(IDLE)
    setOrbStage('closed')
    setMultiOpen(false)
    setConnectMenu(null)
    setEditing(null)
    setDragged([])
    canvasRef.current?.resetViewState()
    setNotice({
      text: '画布已清空',
      hint: '输入一行定义就能重新开始（默认示范页不会自己回来）',
    })
  }, [])

  /* ── 证明（M1）：step-through = 替用户一行行写定义 ─────────
   *
   * 证明的每一步携带一整行定义；「下一步」= 把它写进 `lines`。
   * 于是走完一遍，画布上就长出了完整的证明图——**走的是同一个求值器**，
   * 与手打、与点出来的操作完全等价（设计说明见 `gal/proof.ts` 顶部）。
   */
  const [proofOpen, setProofOpen] = useState(true)
  /**
   * 正在跑的「模板 × 实例」；`null` = 还没开始。
   *
   * `extra` 是**参数槽**的值（M3：点 x / 靶群 / 生成元的像）——群与 p 之外，
   * 各条定理自己要的那点东西（见 `gal/proof.ts` 的 `ParamSlot`）。
   */
  const [proofRun, setProofRun] = useState<{
    tpl: ProofTemplate
    params: ProofParams
    extra: Record<string, string>
  } | null>(null)
  const [proofCursor, setProofCursor] = useState(-1)
  const proofTpl = proofRun?.tpl ?? null
  const proofSteps = useMemo(
    () =>
      proofRun
        ? proofRun.tpl.build(proofRun.params.group, proofRun.params.p, proofRun.extra)
        : [],
    [proofRun],
  )

  const { lineStates, objects } = useMemo(
    () => buildLines(lines, { autoFirstIso }),
    [lines, autoFirstIso],
  )
  const graph = useMemo(() => deriveCanvas(objects), [objects])
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects])
  const valuesById = useMemo(() => new Map(objects.map((o) => [o.id, o.value])), [objects])
  const usedNames = useMemo(() => objects.map((o) => o.id), [objects])

  const focus = focusId(inter)
  /**
   * 焦点**对象**（不一定是节点）：映射不占节点、只画箭头，但它是一等对象——
   * 点箭头就能选中它（U3.1）。所以这里查的是对象表，不是节点表。
   */
  const focusedObj = useMemo(() => {
    const hit = objects.find((o) => o.id === focus)
    if (hit) return hit
    // 有些节点是 derive **就地造**的（作用的 Ω）——它们不在对象表里，
    // 但同样该能点、能看信息（CanvasNode 就是带 shape/level 的 GalObject）。
    return graph.nodes.find((n) => n.id === focus) ?? null
  }, [objects, graph.nodes, focus])

  /**
   * 工作台开着时，**碰过谁就把谁摆上台面**（去重、只增不减）。
   *
   * 这就是"工作台会存东西"：不需要用户额外按"收藏"，他点过/造过的对象自动留在台上。
   * ⚠️ 只在 `benchOpen` 时记 —— 工作台没开时不该在背后攒一堆。
   */
  useEffect(() => {
    if (!benchOpen) return
    const id = focusedObj?.id
    if (!id) return
    setBenchStage((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [benchOpen, focusedObj?.id])

  /** 台面上还活着的对象（对象被删了就不该再挂着）—— 查的是**同一份对象表**。 */
  const benchStageLive = useMemo(
    () => benchStage.filter((id) => byId.has(id) || graph.nodes.some((n) => n.id === id)),
    [benchStage, byId, graph.nodes],
  )
  const anchor = focus ? (anchors.find((a) => a.id === focus) ?? null) : null

  /**
   * 焦点是一条**结构伴生边**（缺口 ⑧）：`π` / `π_1` / `↪` / `=` / `≅`。
   *
   * 它不是一等对象（不进对象表、不能被引用），所以 `focusedObj` 查不到它 ——
   * 但用户点它时想看的东西很具体：**这条箭头是什么、账是多少**。
   * 单独走这一支，不硬塞进 `GalValue`（那会为了一个"只读的说明"动值类型的定义）。
   *
   * 前缀 `struct:` 不可能与对象名撞：对象名过 `NAME_RE`，不许出现冒号。
   */
  const focusedEdge = useMemo(() => {
    if (!focus?.startsWith(STRUCT_PREFIX)) return null
    const e = graph.edges.find((x) => `${STRUCT_PREFIX}${x.id}` === focus)
    return e?.structural ? { edge: e, info: e.structural } : null
  }, [focus, graph.edges])

  const pendOp = useMemo(() => {
    const id = activeOpId(inter)
    return id ? (opById(id) ?? null) : null
  }, [inter])

  /** 对象悬浮球里的「单对象操作」（产数值的已被排除）——映射会拿到 ker / im */
  const singleOps = useMemo(() => (focusedObj ? singleOpsFor(focusedObj.value) : []), [focusedObj])
  /** 顶部多对象球的内容：全局列表 */
  const allMultiOps = useMemo(() => multiOps(), [])

  /** pending 时可点的节点（匹配规则与 opsFor 同一份，所以永远一致） */
  const pickableIds = useMemo(() => {
    if (inter.kind !== 'pending' || !pendOp) return null
    const pickedValues = inter.picked
      .map((id) => valuesById.get(id))
      .filter((v): v is GalValue => !!v)
    return graph.nodes
      .filter((n) => canPick(pendOp, inter.picked.length, pickedValues, n.value))
      .map((n) => n.id)
  }, [inter, pendOp, graph.nodes, valuesById])

  const numericEntries = useMemo<NumericEntry[]>(
    () => [...computedNumbers(objects), ...dragged],
    [objects, dragged],
  )

  const onAnchors = useCallback((a: NodeAnchor[], s: { w: number; h: number }) => {
    setAnchors(a)
    setCanvasSize(s)
  }, [])

  /**
   * 量出左上/左下面板各自的右边界，给顶部多对象球与底部输入球做避让——
   * **只挪球，不动画布**（UI v3.1）：面板收展时画布节点纹丝不动。
   */
  const dockTopRef = useRef<HTMLDivElement>(null)
  const dockBottomRef = useRef<HTMLDivElement>(null)
  const [barriers, setBarriers] = useState({ top: 0, bottom: 0 })

  useEffect(() => {
    const measure = () => {
      const t = dockTopRef.current?.getBoundingClientRect()
      const b = dockBottomRef.current?.getBoundingClientRect()
      const next = {
        top: t && t.width > 0 ? Math.round(t.right) : 0,
        bottom: b && b.width > 0 ? Math.round(b.right) : 0,
      }
      setBarriers((p) => (p.top === next.top && p.bottom === next.bottom ? p : next))
    }
    measure()
    const els = [dockTopRef.current, dockBottomRef.current].filter(Boolean) as HTMLElement[]
    if (typeof ResizeObserver === 'undefined' || els.length === 0) return
    const ro = new ResizeObserver(measure)
    els.forEach((el) => ro.observe(el))
    return () => ro.disconnect()
  }, [openObjects, openOps, openCatalog, openInfo, openNumeric, lines])

  const reset = useCallback(() => {
    setInter(IDLE)
    setOrbStage('closed')
    setMultiOpen(false)
    setComposerOpen(false)
    setConnectMenu(null)
    setNotice(null)
  }, [])

  /* ── 视图快照（缺口 ⑫）─────────────────────────────────
   *
   * 用户的实测反馈："可以把视图保存起来，下次打开网站还能导入视图"。
   * 一份快照 = **定义行 + 画布上的钉住位置 + 视口**，压成一段文本。
   *
   * 为什么读画布要用 `canvasRef` 而不是让画布上报：钉住与视口本来就只属于画布，
   * 而导出要的是"按下按钮那一刻"的它们 —— 上报会变成每帧一次 setState。
   */
  const canvasRef = useRef<CanvasHandle | null>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [snapshotText, setSnapshotText] = useState('')
  const [snapshotErr, setSnapshotErr] = useState<string | null>(null)

  /** 导出：取画布当下的钉住 + 视口，连同定义行写成一段文本。 */
  const exportSnapshot = useCallback(() => {
    const vs = canvasRef.current?.getViewState() ?? { pins: {}, view: null }
    setSnapshotText(
      serializeSnapshot({ v: SNAPSHOT_VERSION, lines, pins: vs.pins, view: vs.view, autoFirstIso }),
    )
    setSnapshotErr(null)
    setNotice({
      text: `快照已写进框里：${lines.length} 行定义，${Object.keys(vs.pins).length} 个钉住的位置`,
      hint: '复制走收好；下次贴回来点「应用快照」',
    })
  }, [lines, autoFirstIso])

  /** 导入：照文本重建视图。**坏快照只报错，不动当前的图**。 */
  const applySnapshot = useCallback(() => {
    const r = parseSnapshot(snapshotText)
    if (!r.ok) {
      setSnapshotErr(r.error)
      return
    }
    const s = r.snapshot
    setLines(s.lines)
    reset()
    setEditing(null)
    setSnapshotErr(null)
    if (typeof s.autoFirstIso === 'boolean') setAutoFirstIso(s.autoFirstIso)
    // 图还没重渲染也不碍事：钉不住的 id 会被布局忽略
    canvasRef.current?.applyViewState({ pins: s.pins, view: s.view })
    setNotice({
      text: `已导入视图：${s.lines.length} 行定义，${Object.keys(s.pins).length} 个钉住的位置`,
    })
  }, [snapshotText, reset])

  const removeLine = useCallback((index: number) => {
    setLines((p) => p.filter((_, k) => k !== index))
    setInter(IDLE)
    setOrbStage('closed')
    setEditing((e) => (e && e.index === index ? null : e))
  }, [])

  /**
   * 点行上的「改」= 把这一行装进底部输入球（缺口 ⑱）。
   *
   * 改名与改定义走同一条路：左边那半改了就是改名（并且**同步改写别处的引用**），
   * 右边那半改了就是改定义。
   */
  const startEdit = useCallback(
    (index: number) => {
      const raw = lines[index]
      if (raw === undefined) return
      const eq = raw.indexOf('=')
      if (eq < 0) {
        setEditing({ index, name: '', expr: raw.trim() })
      } else {
        setEditing({ index, name: raw.slice(0, eq).trim(), expr: raw.slice(eq + 1).trim() })
      }
      setComposerOpen(true)
      setNotice(null)
    },
    [lines],
  )

  /** 编辑提交：替换那一行；改了名就连带把别处的引用一起改（面板会说清改了几行）。 */
  const replaceLine = useCallback(
    (index: number, line: string) => {
      const eq = line.indexOf('=')
      if (eq <= 0) return
      const newName = line.slice(0, eq).trim()
      const oldRaw = lines[index] ?? ''
      const oldEq = oldRaw.indexOf('=')
      const oldName = oldEq > 0 ? oldRaw.slice(0, oldEq).trim() : ''
      // 名字撞车就地拦下（别让用户提交完才发现整行报红）
      if (newName && newName !== oldName && usedNames.includes(newName)) {
        setNotice({ text: `名字「${newName}」已被占用`, hint: '换一个名字，或先删掉重名的那一行' })
        return
      }
      const withLine = lines.map((l, i) => (i === index ? line : l))
      let next = withLine
      let touched = 0
      if (oldName && newName && oldName !== newName) {
        const r = renameRefs(withLine, index, oldName, newName)
        next = r.lines
        touched = r.touched.length
      }
      setLines(next)
      setNotice(
        touched > 0
          ? {
              text: `已改名：${oldName} 到 ${newName}`,
              hint: `另有 ${touched} 行引用了它，已一并改写`,
            }
          : null,
      )
      setInter(IDLE)
      setEditing(null)
    },
    [lines, usedNames],
  )

  /** 面板里点对象行 = 选中它：画布高亮 + 对象球出现 + 信息面板打开（信息都在那边看） */
  const selectFromDock = useCallback((id: string) => {
    setInter({ kind: 'selected', target: id })
    setOrbStage('closed')
    setOpenInfo(true)
    setNotice(null)
  }, [])

  /* ── 证明：走一步 = 写一行 ────────────────────────────── */

  /**
   * 走到第 `i` 步：`lines` **直接由 `proofLines(steps, i)` 重建**。
   *
   * 用"重建"而不是"增删一行"，是因为它幂等 —— 用户（或走查）中途删了几行、
   * 或者跳着点，结果都一致。代价是证明运行期间 `lines` 归证明独占
   *（面板上也写明了"开始时清空画布"）。
   */
  const proofGoto = useCallback(
    (i: number) => {
      if (!proofTpl || proofSteps.length === 0) return
      const at = Math.max(0, Math.min(i, proofSteps.length - 1))
      setProofCursor(at)
      setLines(proofLines(proofSteps, at))
      setInter(IDLE)
      setOrbStage('closed')
      setMultiOpen(false)
      setNotice(null)
    },
    [proofTpl, proofSteps],
  )

  const proofStart = useCallback(
    (t: ProofTemplate, params: ProofParams, extra: Record<string, string>) => {
      const steps = t.build(params.group, params.p, extra)
      setProofRun({ tpl: t, params, extra })
      setProofCursor(0)
      setLines(proofLines(steps, 0))
      setProofOpen(true)
      setInter(IDLE)
      setOrbStage('closed')
      setNotice(null)
    },
    [],
  )

  /** 退出证明：**画布保留**（走完的图可以继续手动玩）。 */
  const proofExit = useCallback(() => {
    setProofRun(null)
    setProofCursor(-1)
    setInter(IDLE)
  }, [])

  /**
   * 「取出为对象」：把子群集里的一项变成一行定义（DIAGRAM_SPEC §3）。
   *
   * 列表不上画布，**但它是入口不是终点**——因为列表里的每一项本身就是个对象
   * （子群）。走的是同一条路：编出一行文本 → 交给同一个求值器，
   * 于是"取出来的"与"手写的"完全等价，用户也看得见系统写了什么。
   */
  const extractSubgroup = useCallback(
    (sub: NormalizedSubgroup) => {
      const v = focusedObj?.value
      if (!v || v.type !== 'subgroups') return
      // 上下文群必须取**群**那一行的名字——子群集那一行（S）本身不是群，
      // 拿它当 `closure(S, …)` 的上下文会被求值器拒掉（真浏览器走查抓到的）。
      const parent = objects.find(
        (o) => o.value.type === 'group' && o.value.group === v.group,
      )
      if (!parent) return
      const name = nextAutoName(objects.map((o) => o.id))
      // 平凡子群没有生成元，用单位元记号兜底（`closure(G, e)` 合法）
      const gens =
        sub.generators.length > 0
          ? sub.generators.map((g) => g.label)
          : [v.group.identity.label]
      setLines((p) => [...p, `${name} = closure(${parent.id}, ${gens.join(', ')})`])
      setNotice(null)
    },
    [focusedObj, objects],
  )

  /* ── 执行：把点选出来的操作编成一行定义，交给同一个求值器 ───────── */

  /**
   * 求值 → 去重 → 命名 → 落成一行定义 → 选中（U56 从 `runOp` 里抽出来）。
   *
   * `runOp`（把手势编好的表达式交给它）与「目录」面板（`CatalogDock` 直接给
   * 表达式）共用这一步 —— 在用户看来"点操作"与"点目录里的群"是同一件事：
   * 都该长出一行**可读可改**的定义，而且同一个东西不重复添行
   * （缺口 ⑯：判据看"同一次推导"）。
   */
  const commitExpr = useCallback(
    (expr: string) => {
      const check = evalExpr(expr, byId)
      if (!check.ok) {
        setNotice({ text: check.error, hint: check.hint })
        return
      }
      // 已经算过的**同一个东西**就不重复添行，直接选中它（缺口 ⑯：判据看"同一次推导"）
      const dup = findExistingObject(objects, {
        callKey: check.callKey,
        def: expr,
        label: check.label,
      })
      if (dup) {
        setInter({ kind: 'selected', target: dup.id })
        setOrbStage('closed')
        setNotice({
          text: `${dup.id} 已经是这个对象了（${dup.def}）`,
          hint: '同一次推导只会有一个对象，已替你选中它',
        })
        return
      }
      const name = nextAutoName(usedNames)
      setLines((p) => [...p, `${name} = ${expr}`])
      setInter({ kind: 'selected', target: name })
      setOrbStage('closed')
      setNotice(null)
    },
    [byId, objects, usedNames],
  )

  const runOp = useCallback(
    (op: OpDef, picked: string[], scalars: (string | null)[] = []) => {
      const args: (string | null)[] = op.params.map((_, i) => scalars[i] ?? null)
      picked.forEach((p, i) => {
        args[i] = p
      })
      const expr = composeCall(op, args)
      if (!expr) {
        setNotice({ text: `${op.notation} 的参数还没凑齐` })
        return
      }
      commitExpr(expr)
    },
    [commitExpr],
  )

  /**
   * 「这个顺序求值走得通吗」—— UI 手势的**顺序兜底**判据（拖拽连线 / pending 收尾共用）。
   *
   * 拖拽不表达顺序，而参数是有序的：`pairOps` 只能按类型匹配猜一次，
   * 对 `contains(H, G)` 这种**两位同型**的操作猜不出谁该在前
   * （`(S₄, A₄)` 与 `(A₄, S₄)` 都能填进两个 `group` 槽），于是"把 S₄ 拖到 A₄ 上"
   * 会拼出 `contains(S₄, A₄)` —— 那是错的。pending 收尾同理：顺序 = **点击顺序**，
   * 而用户点第一个对象时想的是"拿它做什么"，不是"它是第一参"。
   *
   * **只在 UI 手势上兜**：手打的 `R = S_4 ⊆ A_4` 要照样报错，不许替用户改（U21）。
   */
  const tryOrder = useCallback(
    (op: OpDef, picked: string[]): boolean => {
      const args: (string | null)[] = op.params.map((_, i) => picked[i] ?? null)
      const expr = composeCall(op, args)
      return !!expr && evalExpr(expr, byId).ok
    },
    [byId],
  )

  /**
   * pending 收尾时的**参数顺序兜底**（2026-09-30）。
   *
   * 从对象旁边点进"两位同型"的操作时，参数顺序由**点击顺序**决定，而顺序是有语义的：
   * `N_G(G, H)` 的第一参是**母群**。实测用户的心智是"我要算 A₄ 的正规化子，先点 A₄"——
   * 那一下被填进第一槽 G，于是拼成 `N_G(A₄, S₄)`，而 core 对"第二参放不进第一参"
   * 是**静默**的（返回空集）⇒ 画布上长出一个 **0 阶的"群"**（用户报的就是这条）。
   *
   * 兜一次：正序求值走得通就用正序，走不通才试反序；**两个都不通就还给正序**
   * （那时 `runOp` 的报错才有着落）。
   */
  const orderForUi = useCallback(
    (op: OpDef, picked: string[]): string[] => {
      // 有标量位的 op 不兜：`picked` 是按对象位顺序摆的，换了位会把标量塞错槽。
      if (picked.length !== 2 || scalarSlots(op).length > 0) return picked
      if (tryOrder(op, picked)) return picked
      const swapped = [picked[1], picked[0]]
      return tryOrder(op, swapped) ? swapped : picked
    },
    [tryOrder],
  )

  /**
   * 从某个节点发起一个操作：一元直接算，多元进 pending，缺标量进 fill，要编辑器进 editor。
   *
   * `dispatchOp` 是它的本体（**已经知道参数顺序**）；`startOp` 是"只点了第一个对象"
   * 那种从零开始的形态。拖拽连线拿到的是**两个**已经定好顺序的对象，
   * 走的是同一个 `dispatchOp`——所以三个入口（悬浮球 / 拖拽 / 左栏）最终都落到一处。
   */
  const dispatchOp = useCallback(
    (op: OpDef, picked: string[]) => {
      /*
       * 判据是 `>=` 而**不是** `===`（U57）：拖拽那条路会把 **Ω 也当对象点出来**
       * （`customAction` 的 Ω 是 `omegaOrInt`，画布上的集合填得进），于是
       * `picked.length` 可能大于 `objectArity(op)`（后者只数"纯对象位"，Ω 不算）。
       * 用 `===` 的话「把 G 拖到点集上」会掉进补参条而不是编辑器 —— 那不是用户要的。
       * 多出来的那一位不浪费：渲染时拿它当 `presetOmega`（见下面的 `presetOmegaOf`）。
       */
      if (needsEditor(op) && picked.length >= objectArity(op)) {
        setInter({ kind: 'editor', opId: op.id, picked })
        setOrbStage('closed')
        return
      }
      const slots = scalarSlots(op)
      // 停下来的判据用 `maxObjectArity`（**含可选对象位**）：`image(f, H)` 选满 f
      // 之后不是直接算，而是进 pending 等一个**可选**的 H —— 用户点它就变
      // `f(H)`，不点（点条上的「不填 H，直接执行」/ 回车）就还是 `im f`。
      // 需要"还差一个对象"的 op（`商` 这种）行为不变。
      if (maxObjectArity(op) > picked.length) {
        setInter({ kind: 'pending', opId: op.id, picked })
        setOrbStage('closed')
        return
      }
      if (slots.length > 0) {
        const scalars: (string | null)[] = op.params.map(() => null)
        slots.forEach((s) => {
          scalars[s] = scalarDefault(op, s)
        })
        setInter({ kind: 'fill', opId: op.id, picked, scalars })
        setOrbStage('closed')
        return
      }
      runOp(op, orderForUi(op, picked))
    },
    [runOp, orderForUi],
  )

  const startOp = useCallback((op: OpDef, from: string) => dispatchOp(op, [from]), [dispatchOp])

  const dispatchPairOp = useCallback(
    (op: OpDef, from: string, to: string, swappedPref = false) => {
      const first = swappedPref ? [to, from] : [from, to]
      const second = swappedPref ? [from, to] : [to, from]
      if (tryOrder(op, first)) return dispatchOp(op, first)
      if (tryOrder(op, second)) return dispatchOp(op, second)
      return dispatchOp(op, first)
    },
    [tryOrder, dispatchOp],
  )

  /**
   * **拖拽连线松手**（第四批）：两个对象已定，「这两个能做的事」列出来。
   *
   * 三条纪律：
   *   · **唯一候选直接执行** —— 这是"方便"的关键（拖 H 到 f 上就该直接出 `f(H)`）；
   *   · 多个才弹菜单，且按**数学意图**排序（声明包含 / 商 / 像 在最前）；
   *   · 一个都没有 → 说清"这两个之间没有可做的操作"，而不是静默无反应。
   */
  const onConnect = useCallback(
    (from: string, to: string, at: { x: number; y: number }) => {
      const a = byId.get(from)
      const b = byId.get(to)
      if (!a || !b) return
      const cands = pairOps(a.value, b.value)
      if (cands.length === 0) {
        setNotice({
          text: `${a.id} 与 ${b.id} 之间暂时没有可做的操作`,
          hint: '拖拽只列"真的用到这两个对象"的操作；单个对象的操作请点它左上角的球',
        })
        setConnectMenu(null)
        return
      }
      if (cands.length === 1) {
        const c = cands[0]
        setConnectMenu(null)
        dispatchPairOp(c.op, from, to, c.swapped)
        return
      }
      setNotice(null)
      // 候选里没有「包含」时，顺手带一句"为什么"（两个群才有；别的组合给 null）
      const missHint = cands.some((c) => c.op.id === 'contains')
        ? null
        : pairMissHint(a.value, b.value)
      setConnectMenu({ at, from, to, cands, missHint })
    },
    [byId, dispatchPairOp],
  )

  /** 编辑器确认：产出一行定义，走与"打出来的"完全相同的那条求值路径。 */
  const submitEditorLine = useCallback(
    (line: string) => {
      const eq = line.indexOf('=')
      if (eq <= 0) return
      const name = line.slice(0, eq).trim()
      const expr = line.slice(eq + 1).trim()
      const check = evalExpr(expr, byId)
      if (!check.ok) {
        setNotice({ text: check.error, hint: check.hint })
        return
      }
      const dup = findExistingObject(objects, {
        callKey: check.callKey,
        def: expr,
        label: check.label,
      })
      if (dup) {
        setInter({ kind: 'selected', target: dup.id })
        setNotice({ text: `${dup.id} 已经是这个对象了（${dup.def}）` })
        return
      }
      setLines((p) => [...p, line])
      setInter({ kind: 'selected', target: name })
      setNotice(null)
    },
    [byId, objects],
  )

  /** 顶部球选了一个多对象操作 → 空着手进 pending，等用户点对象。 */
  const startMultiOp = useCallback((op: OpDef) => {
    setMultiOpen(false)
    setOrbStage('closed')
    setNotice(null)
    setInter({ kind: 'pending', opId: op.id, picked: [] })
  }, [])

  /**
   * 「被作用」（U57）：从**点集那一头**起一个作用。
   *
   * 这是用户心智里最顺的一条路 —— 他手上有个集合，"让某个群作用在它上面"。
   * 从前点集合是一片死寂：球上的操作菜单恒空（没有任何一条 op 拿"集合"当第一参，
   * `customAction` 的第一参是群 G），从 Ω 那侧看过去零线索。
   *
   * 所以这条路得由界面起头：先进 pending 让用户在地画布上点一个群，
   * 同时**把这个集合记进 `presetOmega`** —— 一路带到编辑器填进 Ω 那一格
   * （不记的话会在他点完群之后被 `|G|` 覆盖掉，等于把他指的东西弄丢）。
   *
   * ⚠️ 与群节点 / ⊕ 球 / 拖拽三条路落到**同一个 op**（`customAction`）、
   * 同一份内核（`planCustomAction`）—— 四条入口，一个函数。
   */
  const startActionOnSet = useCallback((setId: string) => {
    const op = opById('customAction')
    if (!op) return
    setOrbStage('closed')
    setMultiOpen(false)
    setConnectMenu(null)
    setNotice({
      text: '选一个群当作用群 G',
      hint: '点画布上的群节点，接着在编辑器里填生成元的像',
    })
    setInter({ kind: 'pending', opId: op.id, picked: [], presetOmega: setId })
  }, [])

  /**
   * 「给它一个运算」（S2b）：**从集合节点那头**起一个结构编辑器。
   *
   * 与 `startActionOnSet` 同一个位置、同一条理由：集合本身没有"单对象操作"的死角
   * 由一个**界面起的头**补上。区别在终点 —— 那边进 `customAction` 的编辑器（填 Ω），
   * 这边进 `structure` 的编辑器（填运算表），而且载体**已经指好了**（就是它）,
   * 所以直接进 `editor` 态，不用先 pending 等用户再点一次。
   */
  const startStructureOn = useCallback((carrierId: string) => {
    setOrbStage('closed')
    setMultiOpen(false)
    setConnectMenu(null)
    setNotice(null)
    setInter({ kind: 'editor', opId: 'structure', picked: [carrierId] })
  }, [])

  /**
   * 「造结构」（S2b 目录面板那条路）：**先落载体那一行，再开编辑器**。
   *
   * 为什么不让结构"吞掉"载体（把 `structure(labeledSet(...), ...)` 写成一行的内联形式）：
   * §11.3 —— 载体与结构是**两个节点**，`P` 可能同时被别的东西引用
   * （`G ↷ P` 里它就是作用舞台）。而且来源线（`P -> M`）要有个真节点可指。
   *
   * `commitExpr` 那条路是"求值 → 去重 → 落行"，返回的是新名字；这里要拿到
   * **那个名字**才能开编辑器，所以自己走一遍同样的三步（判据同源：`evalExpr` + `findExistingObject`）。
   */
  const startStructureFromCatalog = useCallback(
    (carrierExpr: string) => {
      const check = evalExpr(carrierExpr, byId)
      if (!check.ok) {
        setNotice({ text: check.error, hint: check.hint })
        return
      }
      const dup = findExistingObject(objects, {
        callKey: check.callKey,
        def: carrierExpr,
        label: check.label,
      })
      const id = dup ? dup.id : nextAutoName(usedNames)
      if (!dup) setLines((p) => [...p, `${id} = ${carrierExpr}`])
      setOrbStage('closed')
      setMultiOpen(false)
      setConnectMenu(null)
      setNotice(null)
      setInter({ kind: 'editor', opId: 'structure', picked: [id] })
    },
    [byId, objects, usedNames],
  )

  /* ── 画布点击 ──────────────────────────────────────── */

  const onNodeClick = useCallback(
    (id: string) => {
      // 编辑器开着时画布点击不改状态（用户在弹层里填像，别误触丢输入）
      if (inter.kind === 'editor') return
      setNotice(null)
      if (inter.kind === 'pending' && pendOp) {
        const picked = [...inter.picked, id]
        /*
         * 上界是 `maxObjectArity`（含可选对象位）：`image(f, ·)` 停在 pending 时，
         * 再点一个群 = 把可选位 H 填上（点满就执行）；不点就走条上的"直接执行"。
         *
         * ⚠️ `!inter.presetOmega` 这一半是 U58 补的（**回归修复**）：
         * `customAction` 的 Ω 也算进 `maxObjectArity` 之后，从点集那头进来的那条路
         * （点了集合的「被作用」⇒ `presetOmega` 已经指着它）在点完 G 之后会被拦下来
         * 问"还要不要选 Ω" —— 可他**刚点的就是 Ω**，那条 hint 说的"可选：不选就…"
         * 等于把他已经指过的东西又说成没指。**Ω 已经有了 ⇒ 没有"可选位"可等，直接进编辑器。**
         * （⊕ 球那条路 `presetOmega` 是空的 ⇒ 照旧停下来让他从画布上点一个集合当 Ω。）
         */
        if (picked.length < maxObjectArity(pendOp) && !inter.presetOmega) {
          setInter({ kind: 'pending', opId: pendOp.id, picked, presetOmega: inter.presetOmega })
          return
        }
        // 对象参数齐了：要编辑器的转交构建器，缺标量的走补参条，其余直接执行
        if (needsEditor(pendOp)) {
          // `presetOmega` 一路带过去（U57）：从点集那头进来的，Ω 已经指好了
          setInter({ kind: 'editor', opId: pendOp.id, picked, presetOmega: inter.presetOmega })
          return
        }
        const slots = scalarSlots(pendOp)
        if (slots.length > 0) {
          const scalars: (string | null)[] = pendOp.params.map(() => null)
          slots.forEach((s) => {
            scalars[s] = scalarDefault(pendOp, s)
          })
          setInter({ kind: 'fill', opId: pendOp.id, picked, scalars })
          return
        }
        runOp(pendOp, orderForUi(pendOp, picked))
        return
      }
      setInter({ kind: 'selected', target: id })
      setOrbStage('closed')
      // 点对象 = 想看它 —— 信息面板直接打开（与"点对象行"的行为一致）
      setOpenInfo(true)
    },
    [inter, pendOp, runOp, orderForUi],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /**
       * 「选够了就回车」：pending 里必需位已满、只剩可选对象位时，
       * 回车 = **不含糊地往下一步走**。往哪走分两种（U58）：
       *   · 要编辑器的（`customAction` 的 Ω / `map`）⇒ 进编辑器（Ω 留空，回落 |G|）；
       *   · 不要编辑器的（`image(f, ·)`）⇒ 直接执行（`im f`）。
       * 从前这里无条件 `runOp` —— 对 `customAction` 会撞上"至少要给一个生成元的像"，
       * 用户以为这条 op 坏了。**打字时不抢**：输入框里的回车归输入框。
       */
      const t = e.target as HTMLElement | null
      const typing =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable === true)
      if (!typing && e.key === 'Enter' && inter.kind === 'pending' && pendOp) {
        if (
          inter.picked.length >= objectArity(pendOp) &&
          inter.picked.length < maxObjectArity(pendOp)
        ) {
          e.preventDefault()
          if (needsEditor(pendOp)) {
            setInter({
              kind: 'editor',
              opId: pendOp.id,
              picked: inter.picked,
              presetOmega: inter.presetOmega,
            })
          } else {
            runOp(pendOp, inter.picked)
          }
          return
        }
      }
      if (e.key !== 'Escape') return
      if (inter.kind === 'pending' || inter.kind === 'fill' || inter.kind === 'editor') reset()
      // 连线菜单最先关：它是"刚松手"的那一层，不该连带把选中也取消掉
      else if (connectMenu) {
        setConnectMenu(null)
        setNotice(null)
      } else if (composerOpen) setComposerOpen(false)
      else if (orbStage !== 'closed' || multiOpen) {
        setOrbStage('closed')
        setMultiOpen(false)
      } else reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inter, pendOp, runOp, orbStage, multiOpen, composerOpen, connectMenu, reset])

  /* ── 数值区 ────────────────────────────────────────── */

  const removeNumeric = useCallback(
    (key: string) => {
      if (key.startsWith('c:')) {
        const id = key.slice(2)
        const st = lineStates.find((s) => s.ok && s.object?.id === id)
        if (st) removeLine(st.index)
        return
      }
      setDragged((p) => p.filter((d) => d.key !== key))
    },
    [lineStates, removeLine],
  )

  const dropNumber = useCallback((label: string, value: number) => {
    setDragged((p) => {
      const key = `d:${label}:${value}`
      if (p.some((d) => d.key === key)) return p
      return [...p, { key, label, value, source: 'drag' }]
    })
    setOpenNumeric(true)
  }, [])

  /* ── 待选 / 补参提示条 ─────────────────────────────── */

  const banner = (() => {
    if (!pendOp) return null
    if (inter.kind === 'pending') {
      // 必需位已满、只剩**可选**对象位：给一个出口 —— 没有它，进到这一步的用户
      // 会以为卡住了（Esc 之外无路可走）。出口分两种（U58）：
      //   · `image(f, ·)` 的 H ⇒ 直接执行（`im f`）；
      //   · `customAction` 的 Ω ⇒ 进编辑器（那儿能填一个点数，也能改选集合）。
      const optionalSlot =
        inter.picked.length >= objectArity(pendOp) && inter.picked.length < maxObjectArity(pendOp)
      const slotName = pendOp.params[inter.picked.length]?.name ?? ''
      const toEditor = () =>
        setInter({
          kind: 'editor',
          opId: pendOp.id,
          picked: inter.picked,
          presetOmega: inter.presetOmega,
        })
      return (
        <div className="pending-bar">
          <span className="pending-hint">{pendingHint(pendOp, inter.picked.length)}</span>
          <code className="pending-what" title={pendOp.notation}>
            {menuLabel(pendOp)}
          </code>
          {inter.picked.length > 0 && (
            <span className="pending-picked">
              已选 {inter.picked.map((id) => byId.get(id)?.label ?? id).join(' , ')}
            </span>
          )}
          {optionalSlot && (
            <button
              className="pending-btn primary"
              title={pendOp.doc}
              onClick={() => (needsEditor(pendOp) ? toEditor() : runOp(pendOp, inter.picked))}
            >
              {needsEditor(pendOp)
                ? `不选 ${slotName}，在编辑器里填`
                : `不填 ${slotName}，直接执行`}
            </button>
          )}
          <button className="pending-btn" onClick={reset}>
            Esc 取消
          </button>
        </div>
      )
    }
    if (inter.kind === 'fill') {
      const slots = scalarSlots(pendOp)
      return (
        <div className="pending-bar">
          <span className="pending-hint">补参数</span>
          <code className="pending-what" title={pendOp.notation}>
            {menuLabel(pendOp)}
          </code>
          {slots.map((s) => (
            <label key={s} className="fill-field">
              <span>{pendOp.params[s].name}</span>
              <input
                value={inter.scalars[s] ?? ''}
                onChange={(e) =>
                  setInter({
                    ...inter,
                    scalars: inter.scalars.map((v, i) => (i === s ? e.target.value : v)),
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runOp(pendOp, inter.picked, inter.scalars)
                }}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          ))}
          <button
            className="pending-btn primary"
            onClick={() => runOp(pendOp, inter.picked, inter.scalars)}
          >
            执行
          </button>
          <button className="pending-btn" onClick={reset}>
            Esc 取消
          </button>
        </div>
      )
    }
    return null
  })()

  const busy =
    inter.kind === 'pending' || inter.kind === 'fill' || inter.kind === 'editor'

  /**
   * 画布上的"标记"（高亮）：pending 已选的对象 + **证明当前步要看重的对象**。
   * 后者让 step-through 的"每步高亮对应对象"落地 —— 用户不用自己找刚才那步说的是谁。
   */
  const markedIds = (() => {
    const base = pickedIds(inter)
    if (!proofTpl || proofCursor < 0) return base
    return [...new Set([...base, ...proofHighlight(proofSteps, proofCursor)])]
  })()

  /**
   * 编辑器要看的那几个画布节点。
   *
   * **不再固定两个**（U52）：`映射` 要源与靶两端，而 `自定义作用` 只要作用群这一端。
   * 按 `inter.picked` 逐个找，找齐几个就交出几个（少一个就整块不渲染）。
   */
  const editorNodes = (() => {
    if (inter.kind !== 'editor') return null
    const found = inter.picked.map((id) => graph.nodes.find((n) => n.id === id))
    return found.some((n) => !n) ? null : (found as CanvasNode[])
  })()

  /**
   * 编辑器里 Ω 那一格的预置值（U57）。两种来路，都躺在 `inter` 里：
   *   · `presetOmega` —— 用户点了集合节点的「被作用」；
   *   · `picked[1]`   —— 拖拽把 G 与那个集合**两位都选好了**（Ω 是第二位）。
   * 都没有就不给（编辑器自己回落到 `|G|` 或 4）。只 `customAction` 用得上。
   */
  const presetOmegaOf = (() => {
    if (inter.kind !== 'editor') return undefined
    return inter.presetOmega ?? inter.picked[1]
  })()

  return (
    <div
      className={`app${benchOpen && benchH > 0 ? ' bench-open' : ''}`}
      style={{ '--bench-h': `${benchH}px` } as CSSProperties}
    >
      <CanvasView
        ref={canvasRef}
        graph={graph}
        objects={objects}
        selectedId={busy ? null : focus}
        onSelect={onNodeClick}
        onBackgroundClick={() => {
          /**
           * 编辑器开着时点空白**不关它**。
           *
           * ⚠️ P0-1（2026-10-05）把它从居中弹层改成底部常驻卡片时，**这一道特意留下**：
           * "填了一半的像不该被误触清掉"在两种形态下都成立 —— 用户还要在填的时候
           * 点画布看别的对象（那是"边填边看"的一部分，不是"要关掉编辑器"）。
           * 它与"常驻"不矛盾：常驻说的是**位置与形态**，不是"点哪都不关"。
           */
          if (inter.kind === 'editor') return
          /*
           * **工作台展开时，点画布空白 = 收起工作台**（2026-10-06，用户实测第 5 条）：
           *
           * > 「点画布为什么是取消对象？再怎么弄也得是收起工作台吧？」
           *
           * 用户此刻想"退出"的是**工作台**（它盖住了大半屏），不是那个焦点对象 ——
           * 焦点是他在台面上干活的对象，点一下空白就丢掉太粗暴了。
           * ⇒ 先收台；再点一次才轮到清焦点（那时台已经收了，`benchOpen` 为假）。
           */
          if (benchOpen) {
            setBenchOpen(false)
            return
          }
          reset()
        }}
        onAnchors={onAnchors}
        pickedIds={markedIds}
        pickableIds={pickableIds}
        onConnect={onConnect}
        autoFirstIso={autoFirstIso}
        onToggleAutoFirstIso={() => setAutoFirstIso((v) => !v)}
        onOpenSnapshot={() => setSnapshotOpen(true)}
        onClearBoard={clearBoard}
      />

      {/*
        拖拽连线的候选菜单（第四批）。**唯一候选不弹菜单**----直接执行了，
        所以这里出现就一定是"这两个能做好几件事"，得让用户挑。
       */}
      {connectMenu && (
        <div
          className="connect-menu"
          style={{
            left: Math.min(Math.max(connectMenu.at.x, 12), Math.max(12, canvasSize.w - 268)),
            top: Math.min(Math.max(connectMenu.at.y, 12), Math.max(12, canvasSize.h - 300)),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="connect-head">
            <b>{connectMenu.from}</b> 与 <b>{connectMenu.to}</b>
            <span className="count">{connectMenu.cands.length}</span>
            <button className="connect-close" onClick={reset} title="Esc">
              x
            </button>
          </div>
          {connectMenu.cands.map((c) => (
            <button
              key={`${c.op.id}:${c.swapped ? 1 : 0}`}
              className="connect-item"
              data-op={c.op.id}
              title={`${menuLabel(c.op)}（${c.op.notation}）---- ${c.op.doc}`}
              onClick={() => {
                setConnectMenu(null)
                dispatchPairOp(c.op, connectMenu.from, connectMenu.to, c.swapped)
              }}
            >
              <span className="connect-label">{menuLabel(c.op)}</span>
              <code>{opTemplate(c.op)}</code>
            </button>
          ))}
          {connectMenu.missHint && (
            <div className="connect-miss">{connectMenu.missHint}</div>
          )}
          <div className="connect-hint">参数顺序已经按操作摆好，点一下就建出来</div>
        </div>
      )}

      {focusedObj && anchor && !busy && (
        <ObjectOrb
          anchor={anchor}
          stage={orbStage}
          singleOps={singleOps}
          containerW={canvasSize.w}
          containerH={canvasSize.h}
          onOpen={() => setOrbStage('ring')}
          onClose={() => setOrbStage('closed')}
          onToggleOps={() => setOrbStage(orbStage === 'ops' ? 'ring' : 'ops')}
          onInspect={(tab) => {
            setInfoTab(tab)
            setOpenInfo(true)
            setOrbStage('closed')
          }}
          value={focusedObj.value}
          onRun={(op) => startOp(op, focusedObj.id)}
          // 点集 / 元素集才有的那颗（U57）：让某个群作用在它上面
          onActOn={() => startActionOnSet(focusedObj.id)}
          // 点集 / 元素集才有的那颗（S2b）：给它配一个二元运算 → 结构编辑器
          onBuild={() => startStructureOn(focusedObj.id)}
        />
      )}

      <div className="dock-topleft" ref={dockTopRef}>
        {/*
         * 「对象」与「操作」是**同一件事的两半**（输入的定义 / 运算的产物），
         * 用户来回复查的就是这两栏 —— 所以它们叠成一列（`dock-col`），
         * 「信息」另占一列（它是"看"的那一栏，跟上面两栏不是一类活）。
         *
         * 「目录」（U56）也进这一列：三者都是"让画布上多一个对象"的入口，
         * 区别只在东西从哪来（手输 / 运算产出 / 库里挑）。
         */}
        <div className="dock-col">
          <ObjectDock
            open={openObjects}
            onToggle={() => setOpenObjects((v) => !v)}
            lineStates={lineStates}
            onRemove={removeLine}
            onEdit={startEdit}
            onSelect={selectFromDock}
          />
          <OpDock
            open={openOps}
            onToggle={() => setOpenOps((v) => !v)}
            lineStates={lineStates}
            onRemove={removeLine}
            onEdit={startEdit}
            onSelect={selectFromDock}
            // 不上画布的对象（子群集）只有这条路能跑操作 —— 它们没有悬浮球
            onRunOp={(op, id) => startOp(op, id)}
          />
          <CatalogDock
            open={openCatalog}
            onToggle={() => setOpenCatalog((v) => !v)}
            // 点出来的表达式走 `commitExpr` —— 与径向菜单 / 拖拽落行完全同一条路
            onAdd={commitExpr}
            // 「造结构」：载体的那一行也走同一条落行路（`startStructureFromCatalog`），
            // 只是落完还要把编辑器接上去
            onBuildStructure={startStructureFromCatalog}
          />
        </div>
        <InfoDock
          open={openInfo}
          onToggle={() => setOpenInfo((v) => !v)}
          tab={infoTab}
          onTab={setInfoTab}
          node={busy ? null : focusedObj}
          // 焦点也可能是一条**结构伴生边**（缺口 ⑧）——它与 `node` 互斥
          edge={busy ? null : focusedEdge}
          onExtract={extractSubgroup}
        />
      </div>

      <MultiOrb
        open={multiOpen}
        onToggle={() => setMultiOpen((v) => !v)}
        ops={allMultiOps}
        onPick={startMultiOp}
        minLeft={barriers.top}
      />

      <div className="dock-topright">
        <ProofDock
          open={proofOpen}
          onToggle={() => setProofOpen((v) => !v)}
          template={proofTpl}
          params={proofRun?.params ?? null}
          extra={proofRun?.extra ?? null}
          steps={proofSteps}
          cursor={proofCursor}
          onStart={proofStart}
          onGoto={proofGoto}
          onRestart={() => proofGoto(0)}
          onExit={proofExit}
        />
      </div>

      <ComposerOrb
        open={composerOpen}
        onToggle={() => {
          setComposerOpen((v) => !v)
          // 收起输入球 = 放弃这次编辑（否则下次展开会莫名其妙预填旧行）
          setEditing(null)
        }}
        objects={objects}
        editing={editing}
        onAdd={(l) => (editing ? replaceLine(editing.index, l) : setLines((p) => [...p, l]))}
        minLeft={barriers.bottom}
        /*
         * 让位给底部那两个（**走 prop 不走 CSS** —— `.composer-orb` 的 `left` 是内联
         * style，内联压过样式表规则，P0-1 已栽过一次）：
         *   · 编辑器卡片常驻底部居中（P0-1）⇒ 让到右边；
         *   · 工作台贴底**全宽**（P1）⇒ 让到右上角（右边那条已被编辑器占的语义不冲突：
         *     两者基本不会同时，真同时也是"最上层那个让开"）。
         */
        dockRight={inter.kind === 'editor'}
        /*
         * **工作台升起 ⇒ 输入球靠左停**（2026-10-06，用户实测第 3 条）。
         *
         * 用户原话：「工作台展开后上面一个输入口也太神秘了，不会挪个位置？比如放左边？」
         * 上一版只治了遮挡（把球整体上移），没治语义 ⇒ 一个孤零零的球浮在台面上方。
         * `dockLeft` 优先于 `dockRight`（工作台是更大的面，编辑器会收进它里面）。
         */
        dockLeft={benchOpen}
      />

      {/*
        **工作台**（P1）—— 从底部升起的那一区。
         *
         * 位置刻意在 `ComposerOrb` **之后**：两者都在底部，DOM 顺序与视觉顺序一致，
         * 而输入球是 z-index 12、工作台 14 —— 真撞上了也是工作台在上。
         * `focusedObj` 与 `InfoDock` 共用同一个（`busy` 时为 null，两处一起消失）。
         */}
      <Workbench
        open={benchOpen}
        onToggle={() => setBenchOpen((v) => !v)}
        /*
         * 任务栏点一条 ⇒ 走**与球菜单 / 拖拽 / 目录同一条路**（`startOp`）。
         *
         * 关键：**焦点对象有就带上它当第一参数，没有就 `picked: []` 进 pending** ——
         * 于是"没选中任何东西也能开始"是**天然**成立的，不是一句承诺。
         * （第一版工作台没有这个入口，用户问"创建一个集合工作台怎么只能看"
         *  根子就在这儿：功能全塞在球菜单里，工作台只是个查看器。）
         *
         * `params[0]` 收不收当前焦点由 `canPick` 判 —— 收不下就当没选，
         * 免得把一个"类型就不对"的对象硬塞进第一位。
         */
        onRunOp={(op) => {
          const focusNow = busy ? null : focusedObj
          const use = focusNow && canPick(op, 0, [], focusNow.value) ? focusNow.id : null
          dispatchOp(op, use ? [use] : [])
        }}
        node={busy ? null : focusedObj}
        /*
         * **槽位**（T1）—— pending 时工作台自己把参数对象凑齐。
         *
         * 真机复现过的卡死：工作台升起后画布节点全被盖住（`top≈380` vs 节点 `y≈450`），
         * 于是"点一条二元操作 → 按提示去画布点对象"这条路走不通。
         * ⇒ 槽位区列出候选，点一下就填。`onPick` 直接复用 `onNodeClick` ——
         * **点槽位候选与点画布节点在语义上是同一件事**（"用这个对象"），
         * 各写一份必然分家。
         */
        pending={inter.kind === 'pending' && pendOp ? { op: pendOp, picked: inter.picked } : null}
        objects={objects}
        onPick={onNodeClick}
        editorBusy={inter.kind === 'editor'}
        viewportH={canvasSize.h}
        onExtract={extractSubgroup}
        /* 工作台把升起高度报上来 ⇒ App 拾起输入球让位（见 `benchH` 的注释）*/
        onHeight={setBenchH}
        /* **台面上的对象**（第 2 条）：存 id、与画布同一份数据；点槽位走同一个 `onNodeClick` */
        stage={benchStageLive}
        onDrop={(id) => setBenchStage((prev) => prev.filter((x) => x !== id))}
        /*
         * **`＋` 导入对象**（W2）—— 与左栏「目录」面板**同一对回调**：
         * `commitExpr` 是"把手势编好的表达式落成一行定义"的同一条路，
         * `startStructureFromCatalog` 是"先落载体、再把编辑器接上去"。
         * 用户原话：「为什么不能在工作台内就创建出任意集合？还得我先点击目录栏导入对象？」
         */
        onAdd={commitExpr}
        onBuildStructure={startStructureFromCatalog}
      />

      <div className="dock-bottomleft" ref={dockBottomRef}>
        <NumericDock
          open={openNumeric}
          onToggle={() => setOpenNumeric((v) => !v)}
          entries={numericEntries}
          onRemove={removeNumeric}
          onDropNumber={dropNumber}
        />
      </div>

      {banner}

      {inter.kind === 'editor' &&
        pendOp &&
        editorNodes &&
        (pendOp.id === 'customAction' ? (
          <ActionBuilder
            op={pendOp}
            src={editorNodes[0]}
            objects={objects}
            presetOmega={presetOmegaOf}
            onSubmit={submitEditorLine}
            onCancel={reset}
          />
        ) : pendOp.id === 'structure' ? (
          /*
           * 结构编辑器（S2a）：载体是 `editorNodes[0]`（集合或元素集）。
           * 它**产出的是定义行的表达式**，与手打的 `structure(P, ...)` 逐字同源。
           */
          <StructureBuilder
            op={pendOp}
            carrier={editorNodes[0]}
            objects={objects}
            onSubmit={submitEditorLine}
            onCancel={reset}
          />
        ) : (
          <MapBuilder
            op={pendOp}
            src={editorNodes[0]}
            tgt={editorNodes[1]}
            objects={objects}
            onSubmit={submitEditorLine}
            onCancel={reset}
          />
        ))}

      {snapshotOpen && (
        <SnapshotCard
          text={snapshotText}
          error={snapshotErr}
          onText={(v) => {
            setSnapshotText(v)
            setSnapshotErr(null)
          }}
          onExport={exportSnapshot}
          onApply={applySnapshot}
          onClose={() => setSnapshotOpen(false)}
        />
      )}

      {notice && (
        <div className="notice">
          <span>
            {notice.text}
            {notice.hint ? ` -${notice.hint}` : ''}
          </span>
          <button onClick={() => setNotice(null)} title="关闭">
            x
          </button>
        </div>
      )}
    </div>
  )
}
