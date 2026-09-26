import { useEffect, useMemo, useRef, useState } from 'react'
import { computeLatticeLayout } from '@groupviz/core'
import type { CanvasGraph, CanvasNode, GalEdge, GalObject } from '../gal/types'
import { gridOf, gridSpec, quantize, snapToGrid, visibleGridPoints, type GridSpec } from '../gal/grid'
import { pairOps } from '../gal/interaction'
import type { GalValue } from '../gal/value'
import { labelTexHtml, measureTex } from './Tex'

/** 基础留白（viewBox 单位） */
const BASE_PAD = 20
const VW = 900
const VH = 620

/** 同层节点最小水平间距（世界坐标） */
/**
 * 网格化的间距（DIAGRAM_SPEC §1.1）：对象落在整数格点上，
 * **列间距**取固定值、**列宽**取该列最宽节点——这样列与列之间才有稳定节奏。
 */
const COL_GAP = 64
/** 行间距（行高取该行最高节点）*/
const ROW_GAP = 76
const GROUP_H = 54
const ACTION_H = 42
const SET_MIN_R = 32
const SET_MAX_R = 66

const INPUT_FILL = '#E6F1FB'
const INPUT_STROKE = '#185FA5'
const INPUT_TEXT = '#0C447C'
const DERIVED_FILL = '#EEEDFE'
const DERIVED_STROKE = '#534AB7'
const DERIVED_TEXT = '#3C3489'
const ACTION_FILL = '#E1F5EE'
const ACTION_STROKE = '#0F6E56'
const ACTION_TEXT = '#0A5744'

const PROV = '#B9B6AD'
const ACTION_EDGE = '#0F6E56'
const MAP_EDGE = '#2C2C2A'
/** 结构伴生箭头（pi / pi1 / 包含）：蓝灰，与映射对象的深色区分开 */
const ALONGSIDE_EDGE = '#4A6FA5'
const PICK_STROKE = '#C2410C'

/** 格点（DIAGRAM_SPEC §1.1）：对象只允许停在列中心 × 行中心的交点上 */
const GRID_DOT = '#C9C5B8'
/** 拖动时的吸附预览环 */
const SNAP_STROKE = '#C2410C'

/**
 * 视图变换：**世界坐标 → viewBox 坐标**（`screen = world * k + t`）。
 * `k` 就是缩放，`tx/ty` 是平移。自动 fit 只是它的一个初值。
 */
interface View {
  k: number
  tx: number
  ty: number
}

/** 缩放范围（世界单位 → viewBox 单位的倍率） */
const K_MIN = 0.15
const K_MAX = 6

/** 拖动的世界坐标偏移（拖动过程中临时叠加在布局结果上） */
interface DragState {
  id: string
  dx: number
  dy: number
}

/** 钉住的位置（世界坐标）持久化在浏览器里（决策 ④：拖动 = 钉住 + 持久化） */
const PIN_KEY = 'galculator.pins:v1'

function loadPins(): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(PIN_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, { x: number; y: number }> = {}
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      const p = v as { x?: unknown; y?: unknown }
      if (typeof p?.x === 'number' && typeof p?.y === 'number') out[id] = { x: p.x, y: p.y }
    }
    return out
  } catch {
    return {}
  }
}

function savePins(pins: Record<string, { x: number; y: number }>) {
  try {
    if (Object.keys(pins).length === 0) localStorage.removeItem(PIN_KEY)
    else localStorage.setItem(PIN_KEY, JSON.stringify(pins))
  } catch {
    /* 隐私模式等场景下写不了——拖动的即时效果不受影响 */
  }
}

/** `?empty=1`（走查用的空画布）**不读也不写**钉住，免得走查之间互相污染 */
const persistPins = () =>
  typeof location === 'undefined' || !location.search.includes('empty')

const clampK = (k: number) => Math.min(K_MAX, Math.max(K_MIN, k))

/**
 * 边的视觉族。**箭头颜色必须与线色一致**——从前的 marker 颜色写死在定义里，
 * 于是蓝灰的伴生边配了一个深色箭头；拆成四族后各归各的。
 */
const EDGE_STYLES = [
  { id: 'prov', color: PROV },
  { id: 'action', color: ACTION_EDGE },
  { id: 'alongside', color: ALONGSIDE_EDGE },
  { id: 'map', color: MAP_EDGE },
] as const

interface Pt {
  x: number
  y: number
}

interface Box {
  hw: number
  hh: number
  round: boolean
  /** 主标签字号（世界坐标） */
  font: number
  /** 副行字号（世界坐标） */
  subFont: number
}

/** 上报给宿主（App）的锚点位置——悬浮球要贴在它旁边。 */
export interface NodeAnchor {
  id: string
  /** 相对画布容器的像素坐标（节点中心 / 箭头中点） */
  x: number
  y: number
  /** 节点在屏幕上的半径（球据此往外让开）；箭头是 0 */
  r: number
  /**
   * `node` = 节点中心；`edge` = 箭头中点。
   *
   * 映射在画布上**不占节点、只画箭头**，但它是一等对象（U3.1 起可点选）——
   * 所以箭头也要有锚点，悬浮球才知道该浮在哪。
   */
  kind: 'node' | 'edge'
}

/** 文本宽度估算：CJK / 全角约 1em，拉丁与数字约 0.58em。 */
function textWidth(s: string, fontSize: number): number {
  let w = 0
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? 1 : 0.58
  return w * fontSize
}

/**
 * 标签宽度：**先问 KaTeX 实测**（离屏容器，带缓存），拿不到再退回字符估算。
 *
 * U4 起画布标签也走 KaTeX 了，所以尺寸依据换成实测——比估算更准，
 * 而且 `\operatorname{Sub}(D_{4})` 这种带函数名的串只有实测才量得对。
 */
function labelWidth(s: string, font: number): number {
  return measureTex(s, font)?.w ?? textWidth(s, font)
}

/**
 * 节点尺寸由**标签实际宽度**决定。
 * 固定尺寸会让 `pSub(D₄, 2)` 这种长标签撑破圆形、或被视口裁掉。
 */
function measure(n: CanvasNode): Box {
  if (n.shape === 'set') {
    let font = 15
    let labelW = labelWidth(n.label, font)
    const maxInner = 2 * (SET_MAX_R - 12)
    if (labelW > maxInner) {
      font = 12.5
      labelW = labelWidth(n.label, font)
    }
    if (labelW > maxInner) {
      font = 11
      labelW = labelWidth(n.label, font)
    }
    const r = Math.min(SET_MAX_R, Math.max(SET_MIN_R, labelW / 2 + 12))
    return { hw: r, hh: r, round: true, font, subFont: 11 }
  }
  // 群 / 作用：**尺寸贴着标签走**——交换图里对象就是它的符号，不该是"装信息的卡片"
  let font = n.shape === 'action' ? 13 : 18
  let w = labelWidth(n.label, font)
  if (w > 250) {
    font = 13
    w = labelWidth(n.label, font)
  }
  const h = measureTex(n.label, font)?.h ?? font * 1.4
  return {
    hw: Math.max(w / 2 + 10, 24),
    hh: Math.max(h / 2 + 4, 13),
    round: false,
    font,
    subFont: 11,
  }
}

/** 从节点中心朝 target 方向，取节点边界上的点（边不插进卡片里）。 */
function edgeAnchor(p: Pt, b: Box, target: Pt): Pt {
  const dx = target.x - p.x
  const dy = target.y - p.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  if (b.round) return { x: p.x + ux * (b.hw + 4), y: p.y + uy * (b.hh + 4) }
  const tx = b.hw / Math.max(Math.abs(ux), 1e-6)
  const ty = b.hh / Math.max(Math.abs(uy), 1e-6)
  const t = Math.min(tx, ty) + 4
  return { x: p.x + ux * t, y: p.y + uy * t }
}

export function CanvasView({
  graph,
  objects = [],
  selectedId,
  onSelect,
  onBackgroundClick,
  onAnchors,
  pickedIds,
  pickableIds,
  onConnect,
}: {
  graph: CanvasGraph
  /**
   * 全量对象表。**连线手势要它**——映射 / 关系**不占节点只画边**，
   * 它们的值只能从这里拿（`graph.nodes` 里没有）。
   */
  objects?: GalObject[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** 点空白处（含边）——用于取消 pending / 收起菜单 */
  onBackgroundClick?: () => void
  /** 节点屏幕位置上报（径向菜单定位用）；同时报画布容器尺寸供菜单做边界钳制 */
  onAnchors?: (anchors: NodeAnchor[], size: { w: number; h: number }) => void
  /** 已选中的参数节点（pending 态高亮） */
  pickedIds?: string[]
  /** 当前允许点的节点；`null` = 不限制（非 pending 态） */
  pickableIds?: string[] | null
  /**
   * **拖拽连线**（第四批）：从 A 拖到 B 松手。
   * `at` 是**容器像素坐标**（弹出的菜单按它定位）。
   */
  onConnect?: (from: string, to: string, at: { x: number; y: number }) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: VW, h: VH })
  /**
   * 用户自己调整过的视图（pan / zoom）。`null` = **跟随自动 fit**：
   * 内容一变就重新排版并居中（这是原来的行为，也是新画布的默认状态）；
   * 用户一旦动手，视图就归他管，加一行不会把他正在看的地方弹走。
   */
  const [userView, setUserView] = useState<View | null>(null)
  /** 拖动中的世界坐标偏移（state 供渲染；ref 供 window 上的原生监听读最新值） */
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  /**
   * 被**钉住**的节点（世界坐标）——决策 ④：拖动 = 钉住 + 吸附网格 + 一键恢复自动 + 持久化。
   * 钉住只覆盖**最终坐标**（布局照常算，它仍占着自己原来的行列），
   * 所以拖走一个节点不会引起其它节点重排。
   */
  const [pinned, setPinned] = useState<Record<string, { x: number; y: number }>>(() =>
    persistPins() ? loadPins() : {},
  )
  useEffect(() => {
    if (persistPins()) savePins(pinned)
  }, [pinned])

  /**
   * 指针手势的起点（viewBox 坐标）。节点拖动 / 画布平移 / **连线**共用一条通路。
   *
   * `connect`（第四批）是"把两个对象凑一起"那条路：从 A 拖到 B 松手，
   * 弹出这两个能做的事。它与"拖动节点"共用一个起点（都在节点上按下），
   * 所以必须**显式区分**——判据是"连线模式开着"或"按着 Shift"，
   * 于是 U10 的拖动/钉住行为一个像素都不动。
   */
  const gesture = useRef<
    | { mode: 'node'; id: string; x: number; y: number; wx: number; wy: number; moved: boolean }
    | { mode: 'pan'; x: number; y: number; view: View; moved: boolean }
    | { mode: 'connect'; from: string; x: number; y: number; moved: boolean }
    | null
  >(null)
  /** 这一次手势算不算"拖动"——算的话要把紧随其后的 click 吞掉（否则一拖就选中/取消选中） */
  const suppressClick = useRef(false)
  /**
   * **连线模式**（第四批）：底栏那个开关。开着时在节点上按下 = 拉线而不是拖动；
   * 按住 Shift 也随时算（开关是给它做门面的 —— 修饰键没人猜得到）。
   */
  const [connectMode, setConnectMode] = useState(false)
  /** 正在拉的那根线：起点、指针位置（viewBox 坐标）、当前悬停的目标 */
  const [connect, setConnect] = useState<{ from: string; at: Pt; hover: string | null } | null>(null)
  /** 悬停目标另存一份 ref：`pointercancel` 时要拿它兜底（state 在闭包里是旧的） */
  const connectHover = useRef<string | null>(null)
  /** 当前视图（供原生 wheel 监听与指针换算读取） */
  const viewRef = useRef<{
    k: number
    tx: number
    ty: number
    grid: GridSpec
    world: Pt[]
    gridAt: string[]
    /** 渲染位置（viewBox 坐标）与盒子——连线手势要在原生监听里做命中测试 */
    screen: Pt[]
    boxes: Box[]
    /** 每条边的几何（下标与 `graph.edges` 平行）——连线也要能**落到边上**（映射不占节点） */
    edgePts: { labelPt: Pt | null }[]
  } | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const read = () => setSize({ w: el.clientWidth || VW, h: el.clientHeight || VH })
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /**
   * 容器像素坐标 → viewBox 坐标。
   * `viewBox` 是按 `preserveAspectRatio="xMidYMid meet"` 等比装进容器的，
   * 所以这里要照着同一套居中规则反算（与锚点上报是同一个换算）。
   */
  const toVB = (clientX: number, clientY: number): Pt => {
    const el = svgRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    const scale = Math.min(r.width / VW, r.height / VH) || 1
    const offX = (r.width - VW * scale) / 2
    const offY = (r.height - VH * scale) / 2
    return { x: (clientX - r.left - offX) / scale, y: (clientY - r.top - offY) / scale }
  }

  const view = useMemo(() => {
    if (graph.nodes.length === 0) return null
    const idx = new Map(graph.nodes.map((n, i) => [n.id, i]))
    const layoutNodes = graph.nodes.map((n) => ({ level: n.level }))
    const layoutEdges = graph.edges
      .map((e) => ({ from: idx.get(e.from) ?? -1, to: idx.get(e.to) ?? -1 }))
      .filter((e) => e.from >= 0 && e.to >= 0)

    const layout = computeLatticeLayout(layoutNodes, layoutEdges, { nodeScale: 1.15 })
    const boxes = graph.nodes.map(measure)
    const pos: Pt[] = layout.positions.map((p) => ({ x: p.x, y: p.y }))

    // ── 网格化：对象落在整数格点上（DIAGRAM_SPEC §1.1 / §1.2）────────
    //
    // 课本级交换图的**第一判据**是"水平箭头同高、垂直箭头同列"。
    // 从前的做法只对齐了 y（同层取平均），x 是"防重叠推挤"出来的
    // （`pos[cur].x = minX`）——于是 `G` 与 `G/ker φ` 不在同一列，
    // 那条本该垂直的 `π` 成了斜线。改硬约束：
    //   ① 行 = 派生层：同层 y **严格相等**，行高 = 该行最高节点
    //   ② 列 = 并查集：凡"竖直倾向"的边，两端**强制同列**
    //   ③ 列宽 = 该列最宽节点
    //
    // 为什么用硬约束而不是"尽量对齐"：软约束得到的是 *nearly-but-not-quite
    // aligned*，看着差不多、实际差几个像素，比明显不对齐更难看。
    const n = graph.nodes.length

    /**
     * **竖直约束**：只有"结构伴生"的边要求两端同列。
     *
     *   `π` / `π₁` / `π₂`（投影）、`↪`（包含）与 `=`（轨道等于 Ω，即"传递"）
     *   在课本里都是竖直线；而用户造的映射（带 `objectId`）是**水平**的、
     *   `≅` 是**对角**的、来源线是辅助信息 —— 这几类都不该把两端拉到同一列。
     *
     * 第一版没做这个区分（只看"dy ≥ dx"），结果 `≅` 把 `C₆`、`C₃`、`C₆/ker φ`
     * 传染成一列（`C₆` 与 `C₃` 直接叠在一起）。判据必须按**边的语义**来，
     * 而不是按几何猜。
     */
    const VERTICAL_LABELS = new Set(['π', 'π₁', 'π₂', '↪', '=', '⊴'])
    const isVerticalConstraint = (e: GalEdge): boolean =>
      // **作用线**也算：课本里 `G ↷ Ω` 本来就是往下画的（DIAGRAM_SPEC §5.2 的三层结构）
      e.kind === 'action' ||
      // **声明的包含**（U20）也算：自动生成的 `↪` 是竖直的，用户声明的那条
      // 若画成斜线，同一张图上两种包含就会长得不一样。
      e.kind === 'relation' ||
      (!e.objectId && !!e.label && VERTICAL_LABELS.has(e.label))

    const uf = Array.from({ length: n }, (_, i) => i)
    const find = (i: number): number => {
      let r = i
      while (uf[r] !== r) r = uf[r]
      let c = i
      while (uf[c] !== c) {
        const next = uf[c]
        uf[c] = r
        c = next
      }
      return r
    }
    /**
     * 竖直约束的**优先级** —— 冲突时谁让位。
     *
     * `π` 系是课本站位最硬的规范（商映射只能竖直画），`↪` 是软的：
     * 包含箭头斜着画完全正常（课本里两种都有）。所以 π 先占列，
     * `↪` 挤不进去就自己变斜线。
     */
    const VERTICAL_PRIORITY: Record<string, number> = { 'π': 0, 'π₁': 0, 'π₂': 0, '=': 0, '↪': 1 }

    const members: number[][] = Array.from({ length: n }, (_, i) => [i])
    const lvl = (i: number) => graph.nodes[i].level
    const verticals: { i: number; j: number; gap: number; prio: number }[] = []
    for (const e of graph.edges) {
      if (!isVerticalConstraint(e)) continue
      const i = idx.get(e.from)
      const j = idx.get(e.to)
      if (i === undefined || j === undefined || i === j) continue
      // **同层的边不参与列合并**：同层就是要画成水平箭头的（`N ↪ K` 在
      // 第三同构里就是矩形的上边）。把它当竖直约束没有意义，反而会把
      // 不相干的节点拉进同一组、挤出一堆空列。
      if (lvl(i) === lvl(j)) continue
      verticals.push({
        i,
        j,
        gap: Math.abs(lvl(i) - lvl(j)),
        prio: VERTICAL_PRIORITY[e.label ?? ''] ?? 1,
      })
    }
    verticals.sort((a, b) => a.prio - b.prio || a.gap - b.gap)

    // 合并的**合法性判据**：合并之后，任何一条竖直约束边的两端之间都不许夹着
    // 别的成员 —— 否则那条边的箭头会从中间那个对象身上穿过去。
    //
    // 只看"当前这一条边"不够（那是第一版的错）：`K ↪ G` 与 `G ↠ G/N` 单看各自都干净，
    // 但把 `K` 合进 `G` 那一组之后，`G ↠ G/N` 就跨过了 `K`。判据必须是
    // **合并后整组**的全局检查。真图（第三同构 `D₄ ⊵ ⟨r⟩ ⊵ ⟨r²⟩`）里
    // `G ↠ G/N` 就是这么从 `⟨r²⟩` 身上穿过去的。
    const pairs = verticals.map(({ i, j }) => [i, j] as [number, number])
    for (const { i, j } of verticals) {
      const ri = find(i)
      const rj = find(j)
      if (ri === rj) continue
      const merged = [...members[ri], ...members[rj]]
      const has = new Set(merged)
      const blocked = pairs.some(([u, v]) => {
        if (!has.has(u) || !has.has(v)) return false
        const lo = Math.min(lvl(u), lvl(v))
        const hi = Math.max(lvl(u), lvl(v))
        return merged.some((k) => lvl(k) > lo && lvl(k) < hi)
      })
      if (blocked) continue
      uf[ri] = rj
      members[rj] = merged
      members[ri] = []
    }

    // 一行内两个节点不能占同一列（否则叠在一起）——撞了就右移到最近的空列
    const colOf = new Array<number>(n).fill(0)
    const used = new Map<number, Set<number>>()
    const free = (c: number, lv: number) => !used.get(c)?.has(lv)
    const claim = (c: number, lv: number) => {
      const st = used.get(c)
      if (st) st.add(lv)
      else used.set(c, new Set([lv]))
    }
    const firstFree = (start: number, lv: number) => {
      let c = start
      while (!free(c, lv)) c++
      return c
    }

    const grouped = new Map<number, number[]>()
    for (let i = 0; i < n; i++) {
      const r = find(i)
      const arr = grouped.get(r)
      if (arr) arr.push(i)
      else grouped.set(r, [i])
    }
    // 组的左右顺序沿用初值（谁在左谁在右，lattice layout 已经想过一遍）
    const groupList = [...grouped.values()]
      .map((members) => ({
        members,
        x: members.reduce((t, i) => t + layout.positions[i].x, 0) / members.length,
      }))
      .sort((a, b) => a.x - b.x)

    // ── 行内相邻约束：水平箭头不许从无关的对象身上穿过 ────────
    //
    // "对象落在格点上、箭头只是注解"有个推论：**箭头的路径上不该有别的对象**
    // （DIAGRAM_SPEC §1.2）。竖直方向已由"不许跨过同列节点"保证；水平方向
    // 这里补上——**同层的显式映射边**（`φ : G → H`）两端之间不许夹别的组，
    // 夹着的组整体挪到该行末尾。
    //
    // 场景（真截图抓到的）：画布上同时有 `C₆ ──φ──▶ C₃` 与另一个无关的输入对象
    // `D₄`。两者同层（都是输入），`D₄` 若排在 φ 的两端之间，箭头就从它身上穿过去。
    const levelOfNode = (i: number) => graph.nodes[i].level
    const horizontalPairs: [number, number][] = []
    for (const e of graph.edges) {
      // 只有**用户画的**箭头才算水平关系：
      // 结构伴生（π / ↪）是竖直的，作用线也是竖直的，`≅` 是对角的。
      // 声明的包含（U20）与显式映射同档：同层时画水平，跨层时由竖直约束接管。
      const userDrawn = (e.kind === 'map' || e.kind === 'relation') && !!e.objectId
      if (!userDrawn) continue
      const i = idx.get(e.from)
      const j = idx.get(e.to)
      if (i === undefined || j === undefined || i === j) continue
      if (levelOfNode(i) !== levelOfNode(j)) continue // 同层才画得成水平
      horizontalPairs.push([i, j])
    }

    /**
     * 列序：把"水平边"当约束图，**分量内穷举**，取"被别的组夹住的边最少"的那个列序。
     *
     * ## 为什么换掉老的"挪到末尾"
     *
     * 老法是"夹在中间的组整体挪到该行末尾"，迭代 ≤ 6 轮。它在
     * **两条水平边共用一个端点**时会自相打架 —— 满足 `A→G` 要把中间的 H 挪走，
     * 满足 `G→H` 又要把中间的 A 挪走，于是震荡回原样。
     *
     * 实测（U20 之前就有，不是新功能引入的）：`psi: B→G` 与 `phi: G→H` 并存时，
     * `psi` 的线从 `H` 身上横穿过去 —— 而 DIAGRAM_SPEC §1.2 说"箭头的路径上不该有别的对象"。
     * 正解其实一直都在（`H·G·B` 排成一列链），只是"挪到末尾"表达不出"把度 2 的节点放中间"。
     *
     * ## 为什么是穷举而不是更聪明的贪心
     *
     * 约束小到可以数清：分量通常只有 2–3 个组。并列时**只接受严格更优**，
     * 于是先枚举到的（更接近初始顺序的）胜出 —— 布局要稳，不能因为多一条边就整张图重排。
     * 分量超过 `PERM_CAP` 就保持原序**不猜**（真实图里到不了）。
     */
    const PERM_CAP = 7
    const groupPairs: [number, number][] = []
    for (const [i, j] of horizontalPairs) {
      const a = find(i)
      const b = find(j)
      // 同组的边两端在同一列，本来就不是水平关系
      if (a !== b) groupPairs.push([a, b])
    }
    if (groupPairs.length > 0) {
      // ① 约束图的连通分量（只看有约束的点）
      const adj = new Map<number, Set<number>>()
      const link = (a: number, b: number) => {
        const s = adj.get(a)
        if (s) s.add(b)
        else adj.set(a, new Set([b]))
      }
      for (const [a, b] of groupPairs) {
        link(a, b)
        link(b, a)
      }
      const comps: number[][] = []
      const visited = new Set<number>()
      for (const start of adj.keys()) {
        if (visited.has(start)) continue
        const comp: number[] = []
        const stack = [start]
        visited.add(start)
        while (stack.length > 0) {
          const cur = stack.pop() as number
          comp.push(cur)
          for (const nx of adj.get(cur) ?? []) {
            if (!visited.has(nx)) {
              visited.add(nx)
              stack.push(nx)
            }
          }
        }
        comps.push(comp)
      }

      /** 某个列序里"两端之间夹着别的组"的边数（越少越好）。 */
      const violations = (order: number[]): number => {
        const pos = new Map(order.map((r, k) => [r, k]))
        let bad = 0
        for (const [a, b] of groupPairs) {
          const pa = pos.get(a)
          const pb = pos.get(b)
          if (pa === undefined || pb === undefined) continue
          if (Math.abs(pa - pb) > 1) bad++
        }
        return bad
      }
      /** 分量内穷举；只接受**严格更优**，所以并列时保留原来的先后。 */
      const permute = (arr: number[]): number[] => {
        let best = [...arr]
        let bestBad = violations(best)
        if (bestBad === 0) return best // 原序已经全满足 → 一个字都不动
        const out: number[] = []
        const used = new Array<boolean>(arr.length).fill(false)
        const walk = () => {
          if (out.length === arr.length) {
            const bad = violations(out)
            if (bad < bestBad) {
              bestBad = bad
              best = [...out]
            }
            return
          }
          for (let k = 0; k < arr.length; k++) {
            if (used[k]) continue
            used[k] = true
            out.push(arr[k])
            walk()
            out.pop()
            used[k] = false
          }
        }
        walk()
        return best
      }

      const order = [...groupList]
      for (const comp of comps) {
        if (comp.length > PERM_CAP) continue // 太大就不猜，保持原序
        const inComp = new Set(comp)
        const slots: number[] = []
        const picked: typeof order = []
        order.forEach((g, k) => {
          if (inComp.has(find(g.members[0]))) {
            slots.push(k)
            picked.push(g)
          }
        })
        if (picked.length < 2) continue
        // 以**全局顺序**为基准做排列 → 并列时的稳定性正是我们想要的
        const rootsInOrder = picked.map((g) => find(g.members[0]))
        const fixed = permute(rootsInOrder)
        if (fixed.every((r, t) => r === rootsInOrder[t])) continue
        const byRoot = new Map(picked.map((g) => [find(g.members[0]), g]))
        slots.forEach((slot, t) => {
          const g = byRoot.get(fixed[t])
          if (g) order[slot] = g
        })
      }
      groupList.length = 0
      groupList.push(...order)
    }

    let nextCol = 0
    for (const grp of groupList) {
      let maxUsed = nextCol - 1
      const byLevelInGroup = [...grp.members].sort(
        (a, b) => graph.nodes[a].level - graph.nodes[b].level,
      )
      for (const i of byLevelInGroup) {
        const c = firstFree(nextCol, graph.nodes[i].level)
        colOf[i] = c
        claim(c, graph.nodes[i].level)
        if (c > maxUsed) maxUsed = c
      }
      nextCol = maxUsed + 1
    }

    // 列宽 = 该列最宽节点（这样列与列之间才有稳定节奏）
    const colIds = [...new Set(colOf)].sort((a, b) => a - b)
    const colX = new Map<number, number>()
    let colCursor = 0
    for (const c of colIds) {
      const members = colOf.map((cc, i) => (cc === c ? i : -1)).filter((i) => i >= 0)
      const w = Math.max(...members.map((i) => boxes[i].hw)) * 2
      colCursor += w / 2
      colX.set(c, colCursor)
      colCursor += w / 2 + COL_GAP
    }

    // 行：同层 y 严格相等，行高取该行最高节点
    const byLevel = new Map<number, number[]>()
    graph.nodes.forEach((node, i) => {
      const arr = byLevel.get(node.level)
      if (arr) arr.push(i)
      else byLevel.set(node.level, [i])
    })
    let rowCursor = 0
    const rowCenterY = new Map<number, number>()
    const rowLevels = [...byLevel.keys()].sort((a, b) => a - b)
    for (const lv of rowLevels) {
      const members = byLevel.get(lv)!
      const h = Math.max(...members.map((i) => boxes[i].hh)) * 2
      rowCursor += h / 2
      rowCenterY.set(lv, rowCursor)
      rowCursor += h / 2 + ROW_GAP
    }

    // ── 格点：把行列中心**量化到一条规则网格**上（DIAGRAM_SPEC §1.1）──────
    //
    // 网格是一条**无限延伸**的规则点阵（像坐标纸）：铺满整个画布，pan / zoom 到多远都有。
    // 自动布局算出的行列中心先**量化到网格线上**，对象才真的落在格点上；
    // 量化顺带把不均匀的列宽差拉平成等距（DIAGRAM_SPEC §2.2 那条"节点宽度参与布局"）。
    const spec: GridSpec = gridSpec(
      colIds.map((c) => colX.get(c)!),
      rowLevels.map((lv) => rowCenterY.get(lv)!),
    )
    quantize(
      colIds.map((c) => colX.get(c)!),
      spec.x0,
      spec.stepX,
    ).forEach((x, i) => colX.set(colIds[i], x))
    quantize(
      rowLevels.map((lv) => rowCenterY.get(lv)!),
      spec.y0,
      spec.stepY,
    ).forEach((y, i) => rowCenterY.set(rowLevels[i], y))

    for (let i = 0; i < n; i++) pos[i].x = colX.get(colOf[i])!
    for (const lv of rowLevels) {
      const y = rowCenterY.get(lv)!
      for (const i of byLevel.get(lv)!) pos[i].y = y
    }

    // ── 包围盒：用**自动布局**的位置算 ──────────────────────────
    //
    // 刻意**不含**被钉住 / 正在拖的节点：否则把一个节点拖走，包围盒一变，
    // 整张图就跟着重新缩放——松手那一瞬间所有东西都跳一下，根本没法用
    // （走查里真的抓到了：拖完 D₄ 后全图像素位置全变，落点也不是格点了）。
    // 拖到框外的节点配合 pan 看，或者按「恢复自动布局」。
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    pos.forEach((p, i) => {
      minX = Math.min(minX, p.x - boxes[i].hw)
      maxX = Math.max(maxX, p.x + boxes[i].hw)
      minY = Math.min(minY, p.y - boxes[i].hh)
      maxY = Math.max(maxY, p.y + boxes[i].hh)
    })

    // ── 钉住 / 拖动：只覆盖**最终坐标** ──────────────────────────
    //
    // 布局照常算（被钉住的节点仍占着它原来的行列），最后一步才把坐标换成用户放的位置。
    // 这样拖走一个节点**不会引起别的节点重排**。
    for (let i = 0; i < n; i++) {
      const pin = pinned[graph.nodes[i].id]
      if (pin) pos[i] = { x: pin.x, y: pin.y }
    }
    if (drag) {
      const di = graph.nodes.findIndex((nd) => nd.id === drag.id)
      if (di >= 0) pos[di] = { x: pos[di].x + drag.dx, y: pos[di].y + drag.dy }
    }

    const worldW = Math.max(maxX - minX, 1)
    const worldH = Math.max(maxY - minY, 1)

    // 面板是浮层，画布**不让位**（UI v3.1）：收起展开时节点纹丝不动，
    // 面板与节点的偶发重叠交给用户开合面板解决
    const padL = BASE_PAD
    const padT = BASE_PAD
    const padR = BASE_PAD
    const padB = BASE_PAD
    const usableW = Math.max(VW - padL - padR, 160)
    const usableH = Math.max(VH - padT - padB, 160)

    // 自动 fit 只是视图变换的**初值**；用户一旦 pan / zoom，就听用户的。
    // 上限 1.4（而不是 1）：只写了三五个对象的图本来会缩在画布中央一小块，
    // 稍微放大一点才看得清符号——反正用户随时能滚轮调。
    const autoK = Math.min(usableW / worldW, usableH / worldH, 1.4)
    const autoTx = padL + (usableW - worldW * autoK) / 2 - minX * autoK
    const autoTy = padT + (usableH - worldH * autoK) / 2 - minY * autoK
    const k = clampK(userView?.k ?? autoK)
    const tx = userView?.tx ?? autoTx
    const ty = userView?.ty ?? autoTy

    const screen: Pt[] = pos.map((p) => ({ x: tx + p.x * k, y: ty + p.y * k }))
    const screenBoxes: Box[] = boxes.map((b) => ({
      hw: b.hw * k,
      hh: b.hh * k,
      round: b.round,
      font: b.font * k,
      subFont: b.subFont * k,
    }))

    // 边的几何在这里算好：渲染与「箭头可点锚点」共用同一份。
    // **自环**（`G ↷ G`，如共轭作用 / 正则作用）要单独画一条弧——
    // 两端重合时"从节点边界出发的直线"没有意义。
    const LOOP_H = 34
    /** 映射标签比对象**小一号**（DIAGRAM_SPEC §1.4，`\scriptstyle` ≈ 0.7 倍）*/
    const labelFontOf = (i: number, j: number) =>
      Math.min(13, Math.max(10, Math.min(screenBoxes[i].font, screenBoxes[j].font) * 0.68))
    const edgePts = graph.edges.map((e) => {
      const i = idx.get(e.from) ?? -1
      const j = idx.get(e.to) ?? -1
      if (i < 0 || j < 0) return null
      if (i === j) {
        const c = screen[i]
        const b = screenBoxes[i]
        const x0 = c.x - b.hw * 0.55
        const x1 = c.x + b.hw * 0.55
        const y0 = c.y - b.hh
        return {
          p1: { x: x0, y: y0 },
          p2: { x: x1, y: y0 },
          d: `M ${x0} ${y0} C ${x0 - 8} ${y0 - LOOP_H} ${x1 + 8} ${y0 - LOOP_H} ${x1} ${y0}`,
          labelPt: { x: c.x, y: y0 - LOOP_H * 0.78 },
          labelFont: labelFontOf(i, j),
        }
      }
      const p1 = edgeAnchor(screen[i], screenBoxes[i], screen[j])
      const p2 = edgeAnchor(screen[j], screenBoxes[j], screen[i])
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const len = Math.hypot(dx, dy) || 1
      // ── 标签摆位只有一条规则：**沿行进方向的左侧**（tikz-cd 的 `auto`，DIAGRAM_SPEC §1.5）
      //
      // 屏幕坐标 y 向下，"方向 (dx,dy) 的左侧" = 法向 (dy, −dx)：
      // 右向 → 上方 · 下向 → 右方 · 左向 → 下方 · 上向 → 左方。
      // 不必为四个方向各记一条规则，也不必按几何猜（`π` 与 `≅` 就不会再挤在一起）。
      const nx = dy / len
      const ny = -dx / len
      // 沿箭头方向走 **30%** 处再往左侧让开——多条箭头汇聚到同一节点时
      // （第二同构定理里有五条 `↪` 都指向 D₄），中点标签会糊成一团。
      const bx = p1.x + dx * 0.3
      const by = p1.y + dy * 0.3
      const LABEL_OFF = 9
      return {
        p1,
        p2,
        d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`,
        labelPt: { x: bx + nx * LABEL_OFF, y: by + ny * LABEL_OFF },
        labelFont: labelFontOf(i, j),
      }
    })

    return {
      screen,
      boxes: screenBoxes,
      edgePts,
      /** 视图变换（指针换算 / 格点渲染 / 吸附预览都要用） */
      k,
      tx,
      ty,
      /** 自动 fit 的缩放——工具条上的百分比以它为 100% */
      autoK,
      /** 世界坐标（拖动起点与吸附都以它为准） */
      world: pos,
      /** 规则网格：无限延伸，拖动吸附与格点渲染都按它来 */
      grid: spec,
      /** 当前视口对应的世界矩形（按它现算可见格点） */
      worldBox: { x0: -tx / k, y0: -ty / k, x1: (VW - tx) / k, y1: (VH - ty) / k },
      /** 可见范围内的格点（世界坐标；网格无限，所以按视口现算） */
      gridPts: visibleGridPoints(
        { x0: -tx / k, y0: -ty / k, x1: (VW - tx) / k, y1: (VH - ty) / k },
        spec,
      ),
      /** 每个节点落在哪个格点（`col:row`）——判"这个格点被占了"用 */
      gridAt: pos.map((p) => gridOf(p.x, p.y, spec)),
    }
  }, [graph, pinned, drag, userView])

  /** 视图存一份到 ref：原生 wheel 监听与指针换算要读最新值，但不必每次重建监听 */
  useEffect(() => {
    viewRef.current = view
      ? {
          k: view.k,
          tx: view.tx,
          ty: view.ty,
          grid: view.grid,
          world: view.world,
          gridAt: view.gridAt,
          screen: view.screen,
          boxes: view.boxes,
          edgePts: view.edgePts.map((p) => ({ labelPt: p?.labelPt ?? null })),
        }
      : null
  }, [view])

  /**
   * 滚轮缩放。必须用**原生非 passive** 监听 —— React 的 `onWheel` 是 passive 的，
   * `preventDefault()` 会失效并往控制台丢警告（走查要求控制台零错误）。
   * 缩放围绕**指针位置**：指针底下的那个世界点保持不动。
   */
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current
      if (!v) return
      e.preventDefault()
      const p = toVB(e.clientX, e.clientY)
      const k = clampK(v.k * Math.exp(-e.deltaY * 0.0016))
      if (k === v.k) return
      const wx = (p.x - v.tx) / v.k
      const wy = (p.y - v.ty) / v.k
      setUserView({ k, tx: p.x - wx * k, ty: p.y - wy * k })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // toVB 只读 svgRef（每次实时取 rect），不必进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // viewBox → 容器像素：菜单浮层用像素坐标
  useEffect(() => {
    if (!onAnchors) return
    if (!view) {
      onAnchors([], size)
      return
    }
    const scale = Math.min(size.w / VW, size.h / VH)
    const offX = (size.w - VW * scale) / 2
    const offY = (size.h - VH * scale) / 2
    const anchors: NodeAnchor[] = graph.nodes.map((n, i) => ({
      id: n.id,
      x: offX + view.screen[i].x * scale,
      y: offY + view.screen[i].y * scale,
      r: Math.max(view.boxes[i].hw, view.boxes[i].hh) * scale,
      kind: 'node',
    }))
    // 映射箭头的中点也上报——箭头背后的对象要能选中（点箭头 → ker / im）
    graph.edges.forEach((e, k) => {
      if (!e.objectId) return
      const pts = view.edgePts[k]
      if (!pts) return
      anchors.push({
        id: e.objectId,
        x: offX + pts.labelPt.x * scale,
        y: offY + pts.labelPt.y * scale,
        r: 0,
        kind: 'edge',
      })
    })
    onAnchors(anchors, size)
  }, [view, size, graph.nodes, graph.edges, onAnchors])

  /**
   * 连线时的**合法目标** = 与起点凑得出至少一个操作的对象。
   *
   * 候选由 `gal/interaction.ts#pairOps` 算 —— 与左栏表 / 悬浮球 / 拖拽三个入口
   * **同一份匹配规则**，所以"拖得出来的"与"菜单里列出来的"永远一致。
   *
   * 目标可以是**节点**（群 / 集合），也可以是**边背后的对象**（映射 / 关系）——
   * 后者是用户的原始诉求："拖 H 到 f 上做 f(H)"，而 `f` 是条箭头不是节点。
   */
  const connectOk = useMemo(() => {
    if (!connect) return null
    const objectsById = new Map(objects.map((o) => [o.id, o.value]))
    for (const n of graph.nodes) if (!objectsById.has(n.id)) objectsById.set(n.id, n.value)
    const fromVal = objectsById.get(connect.from)
    if (!fromVal) return null
    const ok = new Set<string>()
    for (const [id, v] of objectsById) {
      if (id === connect.from) continue
      if (pairOps(fromVal, v).length > 0) ok.add(id)
    }
    return ok
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect, graph.nodes, objects])

  if (!view) {
    return (
      <div className="canvas-wrap" ref={wrapRef}>
        <div className="canvas-empty">
          <p>点下方的 ✎ 输入一行定义，画布长出第一个对象</p>
          <code>G = D_4</code>
        </div>
      </div>
    )
  }

  const picked = new Set(pickedIds ?? [])
  const pickable = pickableIds ? new Set(pickableIds) : null

  /* ── 指针手势：节点拖动 / 画布平移 ────────────────────────── */
  //
  // 监听挂在 **window** 上，而不是依赖 `setPointerCapture`：
  // capture 在 React 合成事件里不可靠——实测**只收到第一次 pointermove**，
  // 平移量因此只有应到的 1/8（真浏览器走查抓到的：拖 90px 只动了 11px）。
  // 挂 window 之后指针移出画布 / 移到浮层上都能继续拖。

  const beginGesture = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    const p = toVB(e.clientX, e.clientY)
    const g = (e.target as Element).closest?.('g.gnode') as SVGGElement | null | undefined
    const id = g?.getAttribute('data-id') ?? null
    /**
     * 连线模式：**底栏那个开关**打开，或者按下时按着 Shift。
     *
     * 为什么要显式区分（而不是"拖到别的节点上就算连线"）：拖动节点本来是
     * "钉住 + 吸附格点"，落点由 `snapToGrid` 决定——用户瞄准 B 的中心时，
     * 吸附会把他推到 B 旁边的空格点上。于是"想连线"与"想摆在这儿"在几何上
     * 分不开，只能靠一个明确的信号。Shift 是零成本的快捷方式，开关是给它做门面。
     */
    /** 对象表里的值（节点与**边背后的对象**都用它）。 */
    const valueOf = (id: string): GalValue | null =>
      objects.find((o) => o.id === id)?.value ?? graph.nodes.find((n) => n.id === id)?.value ?? null

    /**
     * 连线手势的命中测试：先看**节点**（它们大），再看**边**（映射 / 关系不占节点，
     * 只能按标签位置认）。返回能作为连线下一个端点的**对象 id**。
     */
    const hitAt = (q: Pt): string | null => {
      const v = viewRef.current
      if (!v) return null
      const from = gesture.current?.mode === 'connect' ? gesture.current.from : null
      let best: string | null = null
      let bestD = Infinity
      graph.nodes.forEach((nd, i) => {
        if (nd.id === from) return
        const b = v.boxes[i]
        const c = v.screen[i]
        if (!b || !c) return
        const d = Math.hypot(q.x - c.x, q.y - c.y)
        // 外扩一点：节点小的时候不必"像素级对准"
        if (d <= Math.max(b.hw, b.hh) + 26 && d < bestD) {
          bestD = d
          best = nd.id
        }
      })
      // 边：半径小得多（它是线不是块），且只认**背后有对象**的那些（映射 / 关系）
      const EDGE_HIT_R = 20
      graph.edges.forEach((e, k) => {
        const oid = e.objectId
        if (!oid || oid === from) return
        const pt = v.edgePts[k]?.labelPt
        if (!pt) return
        const d = Math.hypot(q.x - pt.x, q.y - pt.y)
        if (d <= EDGE_HIT_R && d < bestD) {
          bestD = d
          best = oid
        }
      })
      return best
    }

    /** 起点：按在**节点**上取它的 id；按在**边**上取边背后的对象 id（映射 / 关系）。 */
    const edgeStartId = (e: React.PointerEvent<SVGSVGElement>): string | null => {
      const el = (e.target as Element).closest?.('g.gedge') as SVGGElement | null
      const eid = el?.getAttribute('data-edge-id')
      if (!eid) return null
      return graph.edges.find((x) => x.id === eid)?.objectId ?? null
    }

    const wantsConnect = connectMode || e.shiftKey
    const startId = id ?? (wantsConnect ? edgeStartId(e) : null)
    if (startId && wantsConnect) {
      gesture.current = { mode: 'connect', from: startId, x: p.x, y: p.y, moved: false }
      connectHover.current = null
      setConnect({ from: startId, at: p, hover: null })
    } else if (id) {
      const i = graph.nodes.findIndex((nd) => nd.id === id)
      if (i < 0) return
      gesture.current = {
        mode: 'node',
        id,
        x: p.x,
        y: p.y,
        wx: view.world[i].x,
        wy: view.world[i].y,
        moved: false,
      }
    } else {
      // 空白处按下 = 平移画布（pan）
      gesture.current = {
        mode: 'pan',
        x: p.x,
        y: p.y,
        view: { k: view.k, tx: view.tx, ty: view.ty },
        moved: false,
      }
    }

    const move = (ev: PointerEvent) => {
      const gs = gesture.current
      if (!gs) return
      const q = toVB(ev.clientX, ev.clientY)
      // 4px 阈值：手抖不该被当成拖动（否则点选会变成微移）
      if (!gs.moved && Math.hypot(q.x - gs.x, q.y - gs.y) < 4) return
      gs.moved = true
      if (gs.mode === 'node') {
        const d = { id: gs.id, dx: (q.x - gs.x) / view.k, dy: (q.y - gs.y) / view.k }
        dragRef.current = d
        setDrag(d)
      } else if (gs.mode === 'connect') {
        const over = hitAt(q)
        connectHover.current = over
        setConnect({ from: gs.from, at: q, hover: over })
      } else {
        setUserView({ k: gs.view.k, tx: gs.view.tx + (q.x - gs.x), ty: gs.view.ty + (q.y - gs.y) })
      }
    }

    const finish = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      const gs = gesture.current
      gesture.current = null
      if (!gs) return
      if (gs.mode === 'connect') {
        const q = toVB(ev.clientX, ev.clientY)
        /**
         * 先按松手位置命中；**`pointercancel` 兜底**——浏览器偶尔会把拖动抢去
         * 当"选文本"（节点标签是 KaTeX 的 HTML），此时派发的是 `pointercancel`，
         * 位置信息可能已失真。那就用拖动过程中**最后一次悬停**到的目标顶上：
         * 用户明明已经指到它了，不该因为浏览器的插手白拖一次。
         * （根因另有一道防线：`.canvas { user-select: none }`。）
         */
        const to = (gs.moved ? hitAt(q) : null) ?? (gs.moved ? connectHover.current : null)
        // 连线手势**永远吞掉 click**：它从来不是"点选"
        suppressClick.current = true
        connectHover.current = null
        setConnect(null)
        if (to) {
          const wrap = wrapRef.current?.getBoundingClientRect()
          onConnect?.(gs.from, to, {
            x: ev.clientX - (wrap?.left ?? 0),
            y: ev.clientY - (wrap?.top ?? 0),
          })
        }
        return
      }
      if (gs.mode === 'node') {
        const d = dragRef.current
        if (gs.moved && d) {
          // 松手 → 吸附到**最近的空格点**并钉住（决策 ④）：
          // 跳过已被别的节点占住的格点，免得两个节点叠在一起。
          suppressClick.current = true
          const i = graph.nodes.findIndex((nd) => nd.id === gs.id)
          const taken = view.gridAt.filter((_, t) => t !== i)
          const hit = snapToGrid(gs.wx + d.dx, gs.wy + d.dy, view.grid, taken)
          setPinned((prev) => ({ ...prev, [gs.id]: { x: hit.x, y: hit.y } }))
        }
        dragRef.current = null
        setDrag(null)
        return
      }
      // 拖过画布就不该再触发一次"点空白"（否则一 pan 就把选中取消了）
      if (gs.moved) suppressClick.current = true
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  /** 拖动中的**吸附预览**：松手会落在哪个格点（跟真正落点用同一份计算） */
  const snapPreview = (() => {
    const gs = gesture.current
    if (!drag || gs?.mode !== 'node') return null
    const i = graph.nodes.findIndex((nd) => nd.id === drag.id)
    if (i < 0) return null
    const taken = view.gridAt.filter((_, t) => t !== i)
    const hit = snapToGrid(gs.wx + drag.dx, gs.wy + drag.dy, view.grid, taken)
    return {
      x: view.tx + hit.x * view.k,
      y: view.ty + hit.y * view.k,
      r: Math.max(view.boxes[i].hw, view.boxes[i].hh) + 8,
    }
  })()

  const pinnedCount = Object.keys(pinned).length
  const zoomPct = Math.round((view.k / view.autoK) * 100)


  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className={`canvas${pickable ? ' picking' : ''}${drag ? ' dragging' : ''}${connectMode ? ' linking' : ''}`}
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="交换图画布"
        onPointerDown={beginGesture}
        onDoubleClick={(e) => {
          // 双击空白 = 适应窗口（把整张图重新装进视口）
          if (e.target === e.currentTarget) setUserView(null)
        }}
        onClick={(e) => {
          // 刚拖过（节点或画布）→ 别把这次 click 当成点选 / 点空白
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          if (e.target === e.currentTarget) onBackgroundClick?.()
        }}
      >
        <defs>
          {/*
            箭头**形状**编码映射类型（DIAGRAM_SPEC §1.6）。课本里
            `G ↠ G/N`、`im φ ↪ H`、`G/ker φ ≅ im φ` 一眼可分，
            因为三种形状分别承担定理的三个断言（满 / 单 / 双）：
              · `-head` 一般同态（V 形）
              · `-surj` 满射：**双箭头**（两个 V 叠放）
              · `-hook` 单射：**尾部竖钩**（挂在 markerStart 上，`↪`）
            同构 = 双箭头 + 尾钩，两件一起用。
          */}
          {EDGE_STYLES.map((st) => (
            <g key={st.id}>
              <marker
                id={`${st.id}-head`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >                <path
                  d="M2 1L8 5L2 9"
                  fill="none"
                  stroke={st.color}
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </marker>
              {/* 满射：双箭头 */}
              <marker
                id={`${st.id}-surj`}
                viewBox="0 0 14 10"
                refX="11"
                refY="5"
                markerWidth="10"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path
                  d="M6 1L11 5L6 9M1 1L6 5L1 9"
                  fill="none"
                  stroke={st.color}
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </marker>
              {/* 单射：尾部钩子（`orient` 取 auto-start-reverse 才能当 markerStart 用）*/}
              <marker
                id={`${st.id}-hook`}
                viewBox="0 0 8 10"
                refX="4"
                refY="5"
                markerWidth="8"
                markerHeight="10"
                orient="auto-start-reverse"
              >
                <path
                  d="M4 1.5L4 8.5"
                  fill="none"
                  stroke={st.color}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </marker>
            </g>
          ))}
        </defs>

        {/* 格点（DIAGRAM_SPEC §1.1）：一条**无限延伸**的规则网格，像坐标纸一样铺满画布。
            自动布局的行列中心量化到它上面，拖动松手也吸附到它上面——
            所以"对象落在格点上"在两条路径上都成立。 */}
        {view.gridPts.length > 0 && (
          <g className="grid" aria-hidden="true">
            {view.gridPts.map((p) => (
              <circle
                key={`${p.col}:${p.row}`}
                className="grid-dot"
                cx={view.tx + p.x * view.k}
                cy={view.ty + p.y * view.k}
                r={2.6}
              />
            ))}
          </g>
        )}

        {graph.edges.map((e, k) => {
          const pts = view.edgePts[k]
          if (!pts) return null
          const { p1, p2 } = pts
          /**
           * 连线手势下，**边**也参与"能不能落上去"：映射 / 关系不占节点，
           * 但正是用户要拖过去的那种目标（`拖 H 到 f 上`）。
           * 只有"背后有对象"的边才有这个资格——结构伴生（π / ↪）不是对象。
           */
          const isConnTargetEdge = !!connect && !!e.objectId && !!connectOk?.has(e.objectId)
          const edgeDim = !!connect && !!e.objectId && !isConnTargetEdge && e.objectId !== connect.from
          // 三种 map 边要能一眼分开：
          //   · 显式映射对象（带 objectId）→ 深色粗线（数学主角）
          //   · 结构伴生（pi / pi1 / hook）→ 蓝灰细线（派生出来的结构关系）
          //   · 来源线 → 淡虚线
          // 声明的包含（U20）与**显式映射同档**：它是用户画的、一等的、可点选的。
          const isExplicitMap = (e.kind === 'map' || e.kind === 'relation') && !!e.objectId
          const stroke =
            e.kind === 'action'
              ? ACTION_EDGE
              : isExplicitMap
                ? MAP_EDGE
                : e.kind === 'map'
                  ? ALONGSIDE_EDGE
                  : PROV
          const styleKey =
            e.kind === 'action'
              ? 'action'
              : isExplicitMap
                ? 'map'
                : e.kind === 'map'
                  ? 'alongside'
                  : 'prov'
          // 箭头**形状**编码映射类型（DIAGRAM_SPEC §1.6）：
          //   满射 → **双箭头** `↠`（两个尖都朝终点）
          //   单射 → **尾部钩子** `↪`
          //   同构 → **双向箭头**（双射：两端各一个尖）—— 同构必有逆，方向是对称的
          const surj = e.arrow === 'surjective'
          const inj = e.arrow === 'injective'
          const iso = e.arrow === 'iso'
          const endMarker = `url(#${styleKey}-${surj ? 'surj' : 'head'})`
          const startMarker = iso
            ? // 起点端也用普通箭头：`orient="auto-start-reverse"` 会把它翻向外侧，
              // 于是这条边两端都有箭头尖 = 双向
              `url(#${styleKey}-head)`
            : inj
              ? `url(#${styleKey}-hook)`
              : undefined
          // 标签位置在 `view.edgePts` 里按**沿行进方向左侧**算好（§1.5），
          // 字号比对象小一号（§1.4）。
          const mid = pts.labelPt
          // 箭头背后的对象（映射 / 作用）→ 可点选，于是能"点箭头 → ker / im"
          const selectable = !!e.objectId
          const isSelected = selectable && e.objectId === selectedId
          const line = pts.d
          return (
            <g
              key={e.id}
              className={`gedge gedge-${e.kind}${isSelected ? ' on' : ''}${edgeDim ? ' dim' : ''}${
                isConnTargetEdge ? ' conn-target' : ''
              }`}
              data-edge-id={e.id}
              data-object-id={e.objectId ?? ''}
            >
              {selectable && (
                <path
                  className="gedge-hit"
                  d={line}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    onSelect(e.objectId!)
                  }}
                />
              )}
              <path
                d={line}
                fill="none"
                stroke={isSelected ? PICK_STROKE : stroke}
                strokeWidth={
                  isSelected
                    ? 3.2
                    : e.kind === 'provenance'
                      ? 1.3
                      : e.kind === 'action'
                        ? 2.2
                        : isExplicitMap
                          ? 2.4
                          : 1.7
                }
                strokeDasharray={e.kind === 'provenance' ? '5 4' : undefined}
                markerEnd={endMarker}
                markerStart={startMarker}
              />
              {e.label && (
                <text
                  x={mid.x}
                  y={mid.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={pts.labelFont}
                  fill={isSelected ? PICK_STROKE : stroke}
                  stroke="#fff"
                  strokeWidth={3.5}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                >
                  {e.label}
                </text>
              )}
            </g>
          )
        })}

        {/* 拖拽连线的**橡皮筋**：从起点到指针（吸到悬停目标就改成吸到它的中心）。
            起点可能是**节点**（群/集合）也可能是**边**（映射/关系）——
            后者没有 `screen` 坐标，取它的标签位置。
            画在边之上、节点之下；`pointerEvents="none"`，不干扰命中测试。 */}
        {connect &&
          (() => {
            const ni = graph.nodes.findIndex((n) => n.id === connect.from)
            const ei = ni < 0 ? graph.edges.findIndex((e) => e.objectId === connect.from) : -1
            const a = ni >= 0 ? view.screen[ni] : ei >= 0 ? view.edgePts[ei]?.labelPt : null
            if (!a) return null
            const hi = connect.hover ? graph.nodes.findIndex((n) => n.id === connect.hover) : -1
            const he =
              hi < 0 && connect.hover
                ? graph.edges.findIndex((e) => e.objectId === connect.hover)
                : -1
            const t = hi >= 0 ? view.screen[hi] : he >= 0 ? view.edgePts[he]?.labelPt : null
            const b = hi >= 0 ? view.boxes[hi] : null
            const end = t ?? connect.at
            return (
              <g className="connect-band">
                <line x1={a.x} y1={a.y} x2={end.x} y2={end.y} markerEnd="url(#map-head)" />
                {t && <circle className="connect-ring" cx={t.x} cy={t.y} r={(b ? Math.max(b.hw, b.hh) : 16) + 12} />}
              </g>
            )
          })()}

        {graph.nodes.map((n, i) => {
          const p = view.screen[i]
          const b = view.boxes[i]
          const isPicked = picked.has(n.id)
          const selected = n.id === selectedId || isPicked
          const isConnFrom = connect?.from === n.id
          const isConnOver = connect?.hover === n.id
          const isConnTarget = !!connectOk?.has(n.id)
          // 拉线时压暗"没得可做"的节点：合法目标一眼可见（复用 pending 的"不可点就变暗"规则）
          const dimmed = pickable
            ? !pickable.has(n.id)
            : connect
              ? !(isConnTarget || isConnFrom)
              : false
          const stroke =
            n.shape === 'action'
              ? ACTION_STROKE
              : n.origin === 'input'
                ? INPUT_STROKE
                : DERIVED_STROKE
          const fill =
            n.shape === 'action' ? ACTION_FILL : n.origin === 'input' ? INPUT_FILL : DERIVED_FILL
          const text =
            n.shape === 'action' ? ACTION_TEXT : n.origin === 'input' ? INPUT_TEXT : DERIVED_TEXT
          const edge = isPicked ? PICK_STROKE : stroke
          const labelHtml = labelTexHtml(n.label)
          // 内容高度按实测算：KaTeX 自带 strut，直接拿框高居中会整体偏上
          const labelH = measureTex(n.label, b.font)?.h ?? b.font * 1.3
          const contentH = labelH + 2
          // **画布是交换图，不是卡片列表**：节点只放符号（没有副行、没有信息栏），
          // 但符号后面留**一小块淡背景**——纯裸符号在多条线穿过时会看不清，
          // 一块淡底就够把它"托"出来，同时保留"对象就是它的符号"这个感觉。
          // 底色沿用「颜色 = 来源」：输入对象偏蓝、运算结果偏紫。
          const inputish = n.origin === 'input'
          const bodyFill = b.round
            ? 'rgba(83, 74, 183, 0.07)'
            : n.shape === 'action'
              ? 'rgba(15, 110, 86, 0.07)'
              : selected || isPicked
                ? inputish
                  ? 'rgba(24, 95, 165, 0.16)'
                  : 'rgba(83, 74, 183, 0.16)'
                : inputish
                  ? 'rgba(24, 95, 165, 0.07)'
                  : 'rgba(83, 74, 183, 0.07)'
          const bodyStroke = b.round
            ? selected || isPicked
              ? edge
              : 'rgba(83, 74, 183, 0.3)'
            : selected || isPicked || n.shape === 'action'
              ? edge
              : 'transparent'

          return (
            <g
              key={n.id}
              className={`gnode${dimmed ? ' dim' : ''}${drag?.id === n.id ? ' dragging' : ''}${
                isConnOver ? ' conn-over' : isConnTarget ? ' conn-target' : ''
              }`}
              data-label={n.label}
              data-id={n.id}
              onClick={(e) => {
                e.stopPropagation()
                // 刚把这个节点拖过 → 这次 click 是拖动的尾巴，不算点选
                if (suppressClick.current) {
                  suppressClick.current = false
                  return
                }
                if (dimmed) return
                onSelect(n.id)
              }}
              style={{ cursor: dimmed ? 'not-allowed' : drag?.id === n.id ? 'grabbing' : 'pointer' }}
            >
              {b.round ? (
                <circle
                  className="gnode-hit"
                  cx={p.x}
                  cy={p.y}
                  r={b.hw}
                  fill={bodyFill}
                  stroke={bodyStroke}
                  strokeWidth={selected || isPicked ? 2 : 1}
                />
              ) : (
                <rect
                  className="gnode-hit"
                  x={p.x - b.hw}
                  y={p.y - b.hh}
                  width={b.hw * 2}
                  height={b.hh * 2}
                  rx={9}
                  fill={bodyFill}
                  stroke={bodyStroke}
                  strokeWidth={selected || isPicked ? 2 : 1.4}
                  strokeDasharray={n.shape === 'action' ? '5 4' : undefined}
                />
              )}
              {/* 标签走 KaTeX（HTML），所以用 foreignObject 承载 */}
              <foreignObject
                x={p.x - b.hw}
                y={p.y - contentH / 2}
                width={b.hw * 2}
                height={contentH}
                className="gnode-fo"
              >
                <div className="gnode-label" style={{ color: text }}>
                  <span
                    className="gnode-main"
                    style={{ fontSize: b.font }}
                    {...(labelHtml
                      ? { dangerouslySetInnerHTML: { __html: labelHtml } }
                      : { children: n.label })}
                  />
                  {/* 副行（|G| = 24 这类）不再画在画布上——交换图的节点只有符号，
                      要数字去信息面板看 */}
                </div>
              </foreignObject>
            </g>
          )
        })}
        {/* 吸附预览：松手会落在这个格点上（与真正的落点用同一份计算） */}
        {snapPreview && (
          <circle className="snap-ring" cx={snapPreview.x} cy={snapPreview.y} r={snapPreview.r} />
        )}
      </svg>

      {/* 视图工具条（右下）：**看得见**的视图状态 + 一键还原 */}
      <div className="canvas-toolbar">
        <span className="canvas-zoom" title="滚轮缩放 · 空白处拖动平移 · 双击空白适应窗口">
          {zoomPct}%
        </span>
        <button
          className={`ct-btn${connectMode ? ' on' : ''}`}
          onClick={() => {
            setConnectMode((v) => !v)
            setConnect(null)
          }}
          title="连线模式：在对象上按下、拖到另一个对象上松手 —— 这两个能做的事会列出来（按住 Shift 拖也是连线，不必开这个开关）"
        >
          连线{connectMode ? ' ✓' : ''}
        </button>
        <button
          className="ct-btn"
          onClick={() => setUserView(null)}
          title="适应窗口：把整张图重新装进视口（双击空白同效）"
        >
          适应窗口
        </button>
        <button
          className="ct-btn"
          onClick={() => {
            setPinned({})
            setDrag(null)
          }}
          disabled={pinnedCount === 0}
          title="清除手动摆放的位置，回到自动排版"
        >
          恢复自动布局{pinnedCount > 0 ? ` · ${pinnedCount}` : ''}
        </button>
      </div>
    </div>
  )
}
