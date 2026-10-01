/**
 * 「对应定理」卡片 —— `N ⊴ G` 时，把两侧的格摆出来对着看。
 *
 * 左边是含 N 的 G 的子群，右边是商群 G/N 的子群；同一个编号就是同一对（`H` 与 `H/N`）。
 * 两条栏**同层同列**，因为 `|H/N| = |H| / |N|`，两侧按阶降序必然同序。
 *
 * 全是真数据（`gal/correspondence.ts` 现算），不缓存也不预置表 —— 预置表只覆盖库内
 * 具名群，而这里的主角常常是构造物（`S_4/V_4` 这种）。
 */
import { useMemo } from 'react'
import type { Group } from '@groupviz/core'
import { computeCorrespondence, type CorrNode } from '../gal/correspondence'
import { circled, plainSymbol } from './marks'

export { plainSymbol }

const W = 720
const CX_L = 180
const CX_R = 540
const COL_GAP = 8
const BAND = 260
const NODE_H = 48
const ROW_H = 100
const TOP = 66
const NODE_W_MAX = 88

function boxOf(level: number, slot: number, cx: number, n: number) {
  const w = Math.min(NODE_W_MAX, (BAND - COL_GAP * (n - 1)) / n)
  const total = n * w + COL_GAP * (n - 1)
  const start = cx - total / 2
  return { x: start + slot * (w + COL_GAP), w, cy: TOP + level * ROW_H }
}

export function CorrespondenceCard({
  G,
  nIds,
  onClose,
}: {
  G: Group
  nIds: string[]
  onClose: () => void
}) {
  const res = useMemo(() => computeCorrespondence(G, nIds), [G, nIds])

  const view = useMemo(() => {
    if (!res.ok) return null
    const c = res.value
    const levels = Array.from({ length: c.levelCount }, (_, i) => i)
    const at = (nodes: CorrNode[], lv: number) =>
      nodes.filter((n) => n.level === lv).sort((a, b) => a.slot - b.slot)

    const badge = new Map<string, number>()
    let k = 0
    for (const lv of levels) {
      for (const n of at(c.left, lv)) {
        k += 1
        badge.set(n.key, k)
        badge.set(n.pair, k)
      }
    }
    const box = new Map<string, { x: number; w: number; cy: number }>()
    for (const lv of levels) {
      const nl = at(c.left, lv).length
      const nr = at(c.right, lv).length
      for (const n of at(c.left, lv)) box.set(n.key, boxOf(lv, n.slot, CX_L, nl || nr))
      for (const n of at(c.right, lv)) box.set(n.key, boxOf(lv, n.slot, CX_R, nr || nl))
    }
    return { c, levels, at, badge, box }
  }, [res])

  if (!res.ok) {
    return (
      <div className="corr-card" onClick={(e) => e.stopPropagation()}>
        <div className="corr-head">
          <strong>对应定理</strong>
          <button className="corr-x" onClick={onClose} title="关闭">
            x
          </button>
        </div>
        <div className="corr-bad">{res.reason}</div>
      </div>
    )
  }

  const { c, levels, at, badge, box } = view!
  const height = TOP + (c.levelCount - 1) * ROW_H + NODE_H / 2 + 26

  const node = (n: CorrNode, side: 'L' | 'R') => {
    const b = box.get(n.key)!
    const raw = plainSymbol(n.symbol, `阶 ${n.order}`)
    // 平凡群：core 给的是结构符号 `C₁`，界面上 `{e}` 更好认
    const label = raw === 'C₁' ? '{e}' : raw
    const badgeText = circled(badge.get(n.key) ?? 1)
    const border = n.normal ? 'corr-node-nrm' : ''
    return (
      <g key={n.key} className={`corr-node ${border}`}>
        <text className="corr-badge" x={b.x + b.w / 2} y={b.cy - NODE_H / 2 - 8} textAnchor="middle">
          {badgeText}
        </text>
        <rect x={b.x} y={b.cy - NODE_H / 2} width={b.w} height={NODE_H} rx="8" />
        <text className="corr-sym" x={b.x + b.w / 2} y={b.cy - 6} textAnchor="middle">
          {label}
        </text>
        <text className="corr-ord" x={b.x + b.w / 2} y={b.cy + 13} textAnchor="middle">
          {side === 'L' ? `|H|=${n.order}` : `|H/N|=${n.order}`}
        </text>
      </g>
    )
  }

  const edge = (e: [string, string], side: 'L' | 'R') => {
    const a = box.get(e[0])
    const b = box.get(e[1])
    if (!a || !b) return null
    const ax = a.x + a.w / 2
    const bx = b.x + b.w / 2
    return (
      <line
        key={`${side}${e[0]}-${e[1]}`}
        className="corr-edge"
        x1={ax}
        y1={a.cy}
        x2={bx}
        y2={b.cy}
      />
    )
  }

  /** 每层一条对应线：从左栏该层最右节点，到右栏该层最左节点。 */
  const spans = levels.map((lv) => {
    const l = at(c.left, lv)
    const r = at(c.right, lv)
    if (l.length === 0 || r.length === 0) return null
    const x1 = Math.max(...l.map((n) => box.get(n.key)!.x + box.get(n.key)!.w))
    const x2 = Math.min(...r.map((n) => box.get(n.key)!.x))
    const cy = TOP + lv * ROW_H
    return (
      <g key={`sp${lv}`} className="corr-link">
        <line x1={x1 + 10} y1={cy} x2={x2 - 10} y2={cy} />
        <text x={(x1 + x2) / 2} y={cy - 7} textAnchor="middle">
          ↦
        </text>
      </g>
    )
  })

  const normalL = c.left.filter((n) => n.normal).length
  const normalR = c.right.filter((n) => n.normal).length
  const okEdges = c.leftEdgeCount === c.rightEdgeCount
  const okNormal = normalL === normalR

  return (
    <div className="corr-card" onClick={(e) => e.stopPropagation()}>
      <div className="corr-head">
        <strong>对应定理</strong>
        <span className="corr-sub">
          N = <b>{plainSymbol(c.nSymbol, `阶 ${c.nOrder}`)}</b>（阶 {c.nOrder}）⊴{' '}
          {plainSymbol(G.symbol, 'G')}（阶 {G.order}）
        </span>
        <button className="corr-x" onClick={onClose} title="关闭">
          x
        </button>
      </div>

      <div className="corr-hint">
        左侧含 N 的子群共 {c.left.length} 个，右侧商群的子群 {c.right.length} 个 ——
        同编号即同一对（H 与 H/N）。商群 {plainSymbol(c.qSymbol, 'G/N')}
        {c.qStruct ? ` ≅ ${plainSymbol(c.qStruct, '')}` : ''}，阶 {c.qOrder}。
      </div>

      <svg className="corr-svg" viewBox={`0 0 ${W} ${height}`} role="img">
        <title>对应定理：含 N 的子群与商群的子群一一对应</title>
        <text className="corr-col" x={CX_L} y={22} textAnchor="middle">
          含 N 的 G 的子群
        </text>
        <text className="corr-col" x={CX_R} y={22} textAnchor="middle">
          {plainSymbol(c.qSymbol, 'G/N')} 的子群
        </text>
        {c.leftEdges.map((e) => edge(e, 'L'))}
        {c.rightEdges.map((e) => edge(e, 'R'))}
        {spans}
        {c.left.map((n) => node(n, 'L'))}
        {c.right.map((n) => node(n, 'R'))}
      </svg>

      <div className="corr-facts">
        <span className={okEdges ? 'corr-ok' : 'corr-no'}>
          覆盖边 {okEdges ? '相等' : '不等'}：{c.leftEdgeCount} / {c.rightEdgeCount}
        </span>
        <span className={okNormal ? 'corr-ok' : 'corr-no'}>
          正规数 {okNormal ? '相同' : '不同'}：{normalL} / {normalR}
        </span>
        <span className="corr-dim">底色不同 = 非正规（两侧同步）</span>
      </div>
    </div>
  )
}
