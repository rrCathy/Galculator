import { useEffect, useMemo, useRef, useState } from 'react'
import { computeLatticeLayout } from '@groupviz/core'
import type { CanvasGraph, CanvasNode } from '../gal/types'
import { labelTexHtml, measureTex } from './Tex'

/** 基础留白（viewBox 单位） */
const BASE_PAD = 20
const VW = 900
const VH = 620

/** 同层节点最小水平间距（世界坐标） */
const GAP_X = 30
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
    const subW = n.sub ? labelWidth(n.sub, 11.5) : 0
    const r = Math.min(SET_MAX_R, Math.max(SET_MIN_R, Math.max(labelW, subW) / 2 + 14))
    return { hw: r, hh: r, round: true, font, subFont: 11.5 }
  }
  const font = n.shape === 'action' ? 12.5 : 16
  const minW = n.shape === 'action' ? 104 : 96
  const maxW = n.shape === 'action' ? 220 : 210
  const h = n.shape === 'action' ? ACTION_H : GROUP_H
  return {
    hw: Math.min(maxW, Math.max(minW, labelWidth(n.label, font) + 28)) / 2,
    hh: h / 2,
    round: false,
    font,
    subFont: n.shape === 'action' ? 10.5 : 11.5,
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

    // 按层归拢：同层 y 对齐（交换图的"同一层对象对齐"），并在水平方向去重叠
    const byLevel = new Map<number, number[]>()
    graph.nodes.forEach((n, i) => {
      const arr = byLevel.get(n.level)
      if (arr) arr.push(i)
      else byLevel.set(n.level, [i])
    })
    for (const arr of byLevel.values()) {
      const avgY = arr.reduce((s, i) => s + pos[i].y, 0) / arr.length
      for (const i of arr) pos[i].y = avgY
      if (arr.length < 2) continue
      arr.sort((a, b) => pos[a].x - pos[b].x)
      const before = (pos[arr[0]].x + pos[arr[arr.length - 1]].x) / 2
      for (let k = 1; k < arr.length; k++) {
        const prev = arr[k - 1]
        const cur = arr[k]
        const minX = pos[prev].x + boxes[prev].hw + GAP_X + boxes[cur].hw
        if (pos[cur].x < minX) pos[cur].x = minX
      }
      const after = (pos[arr[0]].x + pos[arr[arr.length - 1]].x) / 2
      for (const i of arr) pos[i].x += before - after
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
          const subHtml = n.sub ? labelTexHtml(n.sub) : null
          // 内容高度按实测算：KaTeX 自带 strut，直接拿框高居中会整体偏上
          const labelH = measureTex(n.label, b.font)?.h ?? b.font * 1.3
          const subH = n.sub ? (measureTex(n.sub, b.subFont)?.h ?? b.subFont * 1.3) : 0
          const contentH = labelH + subH + 2

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
                  cx={p.x}
                  cy={p.y}
                  r={b.hw}
                  fill={fill}
                  stroke={edge}
                  strokeWidth={selected ? 2.2 : 1}
                />
              ) : (
                <rect
                  x={p.x - b.hw}
                  y={p.y - b.hh}
                  width={b.hw * 2}
                  height={b.hh * 2}
                  rx={11}
                  fill={fill}
                  stroke={edge}
                  strokeWidth={selected ? 2.2 : 1}
                  strokeDasharray={n.shape === 'action' ? '6 4' : undefined}
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
                  {n.sub && (
                    <span
                      className="gnode-sub"
                      style={{ fontSize: b.subFont, color: stroke }}
                      {...(subHtml
                        ? { dangerouslySetInnerHTML: { __html: subHtml } }
                        : { children: n.sub })}
                    />
                  )}
                </div>
              </foreignObject>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
