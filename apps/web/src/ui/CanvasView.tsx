import { useEffect, useMemo, useRef, useState } from 'react'
import { computeLatticeLayout } from '@groupviz/core'
import type { CanvasGraph, CanvasNode, GalEdge } from '../gal/types'
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
  selectedId,
  onSelect,
  onBackgroundClick,
  onAnchors,
  pickedIds,
  pickableIds,
}: {
  graph: CanvasGraph
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
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: VW, h: VH })

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
     *   `π` / `π₁` / `π₂`（投影）与 `↪`（包含）在课本里都是竖直线；
     *   而用户造的映射（带 `objectId`）是**水平**的、`≅` 是**对角**的、
     *   来源线是辅助信息 —— 这三类都不该把两端拉到同一列。
     *
     * 第一版没做这个区分（只看"dy ≥ dx"），结果 `≅` 把 `C₆`、`C₃`、`C₆/ker φ`
     * 传染成一列（`C₆` 与 `C₃` 直接叠在一起）。判据必须按**边的语义**来，
     * 而不是按几何猜。
     */
    const isVerticalConstraint = (e: GalEdge): boolean =>
      !e.objectId && (e.label === 'π' || e.label === 'π₁' || e.label === 'π₂' || e.label === '↪')

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
    for (const e of graph.edges) {
      if (!isVerticalConstraint(e)) continue
      const i = idx.get(e.from)
      const j = idx.get(e.to)
      if (i === undefined || j === undefined || i === j) continue
      const ri = find(i)
      const rj = find(j)
      if (ri !== rj) uf[ri] = rj
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
    for (let i = 0; i < n; i++) pos[i].x = colX.get(colOf[i])!

    // 行：同层 y 严格相等，行高取该行最高节点
    const byLevel = new Map<number, number[]>()
    graph.nodes.forEach((node, i) => {
      const arr = byLevel.get(node.level)
      if (arr) arr.push(i)
      else byLevel.set(node.level, [i])
    })
    let rowCursor = 0
    for (const lv of [...byLevel.keys()].sort((a, b) => a - b)) {
      const members = byLevel.get(lv)!
      const h = Math.max(...members.map((i) => boxes[i].hh)) * 2
      rowCursor += h / 2
      for (const i of members) pos[i].y = rowCursor
      rowCursor += h / 2 + ROW_GAP
    }

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

    // 统一缩放（含字号），避免"位置缩了、节点没缩"导致的互相压盖
    const s = Math.min(usableW / worldW, usableH / worldH, 1)
    const offX = padL + (usableW - worldW * s) / 2 - minX * s
    const offY = padT + (usableH - worldH * s) / 2 - minY * s

    const screen: Pt[] = pos.map((p) => ({ x: offX + p.x * s, y: offY + p.y * s }))
    const screenBoxes: Box[] = boxes.map((b) => ({
      hw: b.hw * s,
      hh: b.hh * s,
      round: b.round,
      font: b.font * s,
      subFont: b.subFont * s,
    }))

    // 边的两端在这里算好：渲染与「箭头中点上报」（映射的可点锚点）共用同一份
    const edgePts = graph.edges.map((e) => {
      const i = idx.get(e.from) ?? -1
      const j = idx.get(e.to) ?? -1
      if (i < 0 || j < 0) return null
      return {
        p1: edgeAnchor(screen[i], screenBoxes[i], screen[j]),
        p2: edgeAnchor(screen[j], screenBoxes[j], screen[i]),
      }
    })

    return { screen, boxes: screenBoxes, edgePts }
  }, [graph])

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
        x: offX + ((pts.p1.x + pts.p2.x) / 2) * scale,
        y: offY + ((pts.p1.y + pts.p2.y) / 2) * scale,
        r: 0,
        kind: 'edge',
      })
    })
    onAnchors(anchors, size)
  }, [view, size, graph.nodes, graph.edges, onAnchors])

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

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <svg
        className={`canvas${pickable ? ' picking' : ''}`}
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="交换图画布"
        onClick={(e) => {
          if (e.target === e.currentTarget) onBackgroundClick?.()
        }}
      >
        <defs>
          {[
            { id: 'arrow-prov', color: PROV },
            { id: 'arrow-action', color: ACTION_EDGE },
            { id: 'arrow-map', color: MAP_EDGE },
          ].map((m) => (
            <marker
              key={m.id}
              id={m.id}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path
                d="M2 1L8 5L2 9"
                fill="none"
                stroke={m.color}
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
          ))}
        </defs>

        {graph.edges.map((e, k) => {
          const pts = view.edgePts[k]
          if (!pts) return null
          const { p1, p2 } = pts
          // 三种 map 边要能一眼分开：
          //   · 显式映射对象（带 objectId）→ 深色粗线（数学主角）
          //   · 结构伴生（pi / pi1 / hook）→ 蓝灰细线（派生出来的结构关系）
          //   · 来源线 → 淡虚线
          const isExplicitMap = e.kind === 'map' && !!e.objectId
          const stroke =
            e.kind === 'action'
              ? ACTION_EDGE
              : isExplicitMap
                ? MAP_EDGE
                : e.kind === 'map'
                  ? ALONGSIDE_EDGE
                  : PROV
          const marker =
            e.kind === 'action' ? 'arrow-action' : e.kind === 'map' ? 'arrow-map' : 'arrow-prov'
          const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
          // 箭头背后的对象（映射）→ 可点选，于是能"点箭头 → ker / im"
          const selectable = !!e.objectId
          const isSelected = selectable && e.objectId === selectedId
          const line = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
          return (
            <g key={e.id} className={`gedge gedge-${e.kind}${isSelected ? ' on' : ''}`}>
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
                      : isExplicitMap
                        ? 2.4
                        : 1.7
                }
                strokeDasharray={e.kind === 'provenance' ? '5 4' : undefined}
                markerEnd={`url(#${marker})`}
              />
              {e.label && (
                <text
                  x={mid.x}
                  y={mid.y - 6}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
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

        {graph.nodes.map((n, i) => {
          const p = view.screen[i]
          const b = view.boxes[i]
          const isPicked = picked.has(n.id)
          const selected = n.id === selectedId || isPicked
          const dimmed = pickable ? !pickable.has(n.id) : false
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
              className={`gnode${dimmed ? ' dim' : ''}`}
              data-label={n.label}
              onClick={(e) => {
                e.stopPropagation()
                if (dimmed) return
                onSelect(n.id)
              }}
              style={{ cursor: dimmed ? 'not-allowed' : 'pointer' }}
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
      </svg>
    </div>
  )
}
