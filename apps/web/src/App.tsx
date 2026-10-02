import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type { CanvasNode } from './gal/types'
import { ProofDock } from './ui/ProofDock'
import { ObjectDock } from './ui/ObjectDock'
import { OpDock } from './ui/OpDock'
import { InfoDock, type InfoTab } from './ui/InfoDock'
import { NumericDock } from './ui/NumericDock'
import type { GalValue, NormalizedSubgroup } from './gal/value'

/**
 * 默认示范（U0–U2 能力清单）：
 *   `G = D_4` 记号建群 · `Z(G)` 子群升级为**真群对象**（圆 → 方，于是 `Z(Z(G))` 合法）
 *   `换位子群(G)` 迭代闭包 · `Z ∩ C` 集合运算 · `G / Z` 商群 · `Sub(G)` 枚举 · `ord` 数值进栈
 */
const DEFAULT_LINES = [
  // Sylow III 的完整故事（MVP 的落点）：
  //   造 Ω → 让 G 作用上去 → 轨道 / 稳定子 → 三条结论
  // 打开就能看到交换图：`G ↷ Ω`、`Orb(H) = Ω`（传递）、`N_G(H) ↪ G`
  'G = S_4',
  'Syl = Syl_p(G, 3)',
  'Omega= 底集(Syl)',
  'A = 共轭作用在(G, Omega)',
  'O = 轨道(A, 1)',
  'N = 稳定子(A, 1)',
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

  // 默认只展开「对象」：三个都摊开会把画布左上角整片盖住，连顶部那颗球都压上去了
  const [openObjects, setOpenObjects] = useState(true)
  const [openOps, setOpenOps] = useState(false)
  const [openInfo, setOpenInfo] = useState(false)
  const [openNumeric, setOpenNumeric] = useState(true)
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
  }, [openObjects, openOps, openInfo, openNumeric, lines])

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
      // 拿它当 `闭包(S, …)` 的上下文会被求值器拒掉（真浏览器走查抓到的）。
      const parent = objects.find(
        (o) => o.value.type === 'group' && o.value.group === v.group,
      )
      if (!parent) return
      const name = nextAutoName(objects.map((o) => o.id))
      // 平凡子群没有生成元，用单位元记号兜底（`闭包(G, e)` 合法）
      const gens =
        sub.generators.length > 0
          ? sub.generators.map((g) => g.label)
          : [v.group.identity.label]
      setLines((p) => [...p, `${name} = 闭包(${parent.id}, ${gens.join(', ')})`])
      setNotice(null)
    },
    [focusedObj, objects],
  )

  /* ── 执行：把点选出来的操作编成一行定义，交给同一个求值器 ───────── */

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

  /**
   * 「这个顺序求值走得通吗」—— UI 手势的**顺序兜底**判据（拖拽连线 / pending 收尾共用）。
   *
   * 拖拽不表达顺序，而参数是有序的：`pairOps` 只能按类型匹配猜一次，
   * 对 `包含(H, G)` 这种**两位同型**的操作猜不出谁该在前
   * （`(S₄, A₄)` 与 `(A₄, S₄)` 都能填进两个 `group` 槽），于是"把 S₄ 拖到 A₄ 上"
   * 会拼出 `包含(S₄, A₄)` —— 那是错的。pending 收尾同理：顺序 = **点击顺序**，
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
      if (needsEditor(op) && objectArity(op) === picked.length) {
        setInter({ kind: 'editor', opId: op.id, picked })
        setOrbStage('closed')
        return
      }
      const slots = scalarSlots(op)
      // 停下来的判据用 `maxObjectArity`（**含可选对象位**）：`像(f, H)` 选满 f
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

  /* ── 画布点击 ──────────────────────────────────────── */

  const onNodeClick = useCallback(
    (id: string) => {
      // 编辑器开着时画布点击不改状态（用户在弹层里填像，别误触丢输入）
      if (inter.kind === 'editor') return
      setNotice(null)
      if (inter.kind === 'pending' && pendOp) {
        const picked = [...inter.picked, id]
        // 上界是 `maxObjectArity`（含可选对象位）：`像(f, ·)` 停在 pending 时，
        // 再点一个群 = 把可选位 H 填上（点满就执行）；不点就走条上的"直接执行"。
        if (picked.length < maxObjectArity(pendOp)) {
          setInter({ kind: 'pending', opId: pendOp.id, picked })
          return
        }
        // 对象参数齐了：要编辑器的转交构建器，缺标量的走补参条，其余直接执行
        if (needsEditor(pendOp)) {
          setInter({ kind: 'editor', opId: pendOp.id, picked })
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
       * 「选够了就回车」：pending 里必需位已满、只剩可选对象位时（`像(f, ·)`），
       * 回车 = 直接执行（`im f`）。**打字时不抢**——输入框里的回车归输入框。
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
          runOp(pendOp, inter.picked)
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
      // 必需位已满、只剩**可选**对象位（`像(f, ·)` 的 H）：给一个"直接执行"的出口 ——
      // 没有它，进到这一步的用户会以为卡住了（Esc 之外无路可走）。
      const optionalSlot =
        inter.picked.length >= objectArity(pendOp) && inter.picked.length < maxObjectArity(pendOp)
      return (
        <div className="pending-bar">
          <span className="pending-hint">{pendingHint(pendOp, inter.picked.length)}</span>
          <code className="pending-what">{pendOp.notation}</code>
          {inter.picked.length > 0 && (
            <span className="pending-picked">
              已选 {inter.picked.map((id) => byId.get(id)?.label ?? id).join(' , ')}
            </span>
          )}
          {optionalSlot && (
            <button
              className="pending-btn primary"
              title={pendOp.doc}
              onClick={() => runOp(pendOp, inter.picked)}
            >
              不填 {pendOp.params[inter.picked.length]?.name}，直接执行
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
          <code className="pending-what">{pendOp.notation}</code>
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

  return (
    <div className="app">
      <CanvasView
        ref={canvasRef}
        graph={graph}
        objects={objects}
        selectedId={busy ? null : focus}
        onSelect={onNodeClick}
        onBackgroundClick={() => {
          // 编辑器开着时点空白不关它（填了一半的像不该被误触清掉）
          if (inter.kind !== 'editor') reset()
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
              title={`${c.op.notation} ---- ${c.op.doc}`}
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
        />
      )}

      <div className="dock-topleft" ref={dockTopRef}>
        {/*
         * 「对象」与「操作」是**同一件事的两半**（输入的定义 / 运算的产物），
         * 用户来回复查的就是这两栏 —— 所以它们叠成一列（`dock-col`），
         * 「信息」另占一列（它是"看"的那一栏，跟上面两栏不是一类活）。
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
