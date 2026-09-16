import type { OpDef } from '../gal/ops'
import { opTemplate } from '../gal/ops'
import { menuLabel } from '../gal/interaction'
import type { GalValue } from '../gal/value'
import type { NodeAnchor } from './CanvasView'
import type { InfoTab } from './InfoDock'

export type OrbStage = 'closed' | 'ring' | 'ops'

interface RingItem {
  key: string
  label: string
  /** 有 tab = "看"这一类（填信息面板） */
  tab?: InfoTab
  /** 有 opId = 直接执行这个单对象操作 */
  opId?: string
  title: string
}

/**
 * 环绕按钮的内容**按值类型定**：
 *
 * - **群**：三个"看"（基本 / 元素 / 子群，各切一个信息 tab）+ 一个「操作」（单对象操作下拉，
 *   群的操作有十几条，铺不开）；
 * - **其它值**（映射 / 集合 / 作用…）：一个「信息」+ 直接铺出来的单对象操作。
 *
 * 后一条是 U3.1 加的：**映射的 ker / im 就该一步点到**——点箭头、点 `ker`，完事；
 * 比"点箭头 → 点操作 → 在面板里找 ker"少一步，更比手打 `K = ker(f)` 少打字。
 * 单对象操作超过 3 条才收进下拉（目前只有映射这么少，规则先按"铺得下就铺"）。
 */
function ringItems(value: GalValue, singleOps: OpDef[]): RingItem[] {
  if (value.type === 'group') {
    return [
      { key: 'basic', label: '基本', tab: 'basic', title: '看基本信息' },
      { key: 'elements', label: '元素', tab: 'elements', title: '看元素信息' },
      { key: 'subgroups', label: '子群', tab: 'subgroups', title: '看子群信息' },
      { key: 'ops', label: '操作', title: '只用一个对象就能做的操作' },
    ]
  }
  const info: RingItem = {
    key: 'info',
    label: '信息',
    tab: 'basic',
    title: '看这个对象的信息',
  }
  if (singleOps.length === 0) return [info]
  if (singleOps.length <= 3) {
    return [
      info,
      ...singleOps.map((op) => ({
        key: op.id,
        label: op.call?.[0] ?? menuLabel(op),
        opId: op.id,
        title: `${op.notation} —— ${op.doc}`,
      })),
    ]
  }
  return [info, { key: 'ops', label: '操作', title: '只用一个对象就能做的操作' }]
}

/** 环绕半径；节点大时按钮就推远一点 */
const RING_R_MIN = 54
/** 箭头锚点（映射）的环绕半径——箭头是水平的，上半圈铺开不会压住它 */
const RING_R_EDGE = 50

/**
 * 对象悬浮球。
 *
 * 挂在**节点的左上角**（不是右侧）：右侧和下方是交换图上出边的地方，
 * 左上角是空着的，不遮箭头。
 *
 * **映射这种"只画箭头"的对象**（U3.1 起可点选）没有节点，球改挂在**箭头中点上方**——
 * 于是"点箭头 → 点 ker"这条路径成立。
 *
 * 球本身**深色**——画布是浅色，深色球一放上去就是"这里可以点"的最强信号，
 * 而环绕出去的按钮保持浅色胶囊（它们是"选项"，不是"入口"）。
 */
export function ObjectOrb({
  anchor,
  stage,
  singleOps,
  value,
  containerW,
  containerH,
  onOpen,
  onClose,
  onToggleOps,
  onInspect,
  onRun,
}: {
  anchor: NodeAnchor
  stage: OrbStage
  singleOps: OpDef[]
  /** 焦点对象的值——决定环绕按钮的构成 */
  value: GalValue
  containerW: number
  containerH: number
  onOpen: () => void
  onClose: () => void
  onToggleOps: () => void
  onInspect: (tab: InfoTab) => void
  onRun: (op: OpDef) => void
}) {
  const clampX = (v: number) => Math.min(Math.max(v, 52), containerW - 52)
  const clampY = (v: number) => Math.min(Math.max(v, 20), containerH - 20)

  const isEdge = anchor.kind === 'edge'
  // 节点左上角（沿对角线挪一点，别压在节点边上）；箭头则挂在中点正上方
  const orbX = clampX(isEdge ? anchor.x : anchor.x - anchor.r * 0.74)
  const orbY = clampY(isEdge ? anchor.y - 28 : anchor.y - anchor.r * 0.74)
  const ringR = isEdge ? RING_R_EDGE : Math.max(RING_R_MIN, anchor.r + 22)

  const items = ringItems(value, singleOps)

  return (
    <>
      <button
        className={`orb${stage !== 'closed' ? ' on' : ''}`}
        style={{ left: orbX, top: orbY }}
        title={stage === 'closed' ? '操作这个对象' : '收起'}
        onClick={(e) => {
          e.stopPropagation()
          if (stage === 'closed') onOpen()
          else onClose()
        }}
      >
        ⋯
      </button>

      {stage === 'ring' &&
        items.map((item, i) => {
          const t = ((angleAt(i, items.length)) * Math.PI) / 180
          const x = clampX(orbX + Math.cos(t) * ringR)
          const y = clampY(orbY + Math.sin(t) * ringR)
          return (
            <button
              key={item.key}
              className={`orb-sat${item.tab ? ' orb-info' : ' orb-ops'}`}
              style={{ left: x, top: y }}
              title={item.title}
              onClick={(e) => {
                e.stopPropagation()
                if (item.opId) {
                  const op = singleOps.find((o) => o.id === item.opId)
                  if (op) onRun(op)
                  return
                }
                if (item.tab) onInspect(item.tab)
                else onToggleOps()
              }}
            >
              {item.label}
            </button>
          )
        })}

      {stage === 'ops' && (
        <div
          className="orb-ops-panel"
          style={{
            left: Math.min(Math.max(orbX - 12, 12), Math.max(12, containerW - 260)),
            top: Math.min(orbY + 26, Math.max(12, containerH - 320)),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="orb-ops-head">
            单对象操作 <span className="count">{singleOps.length}</span>
            <span className="orb-ops-hint">点一下直接创建</span>
          </div>
          {singleOps.length === 0 && <div className="empty">这个对象暂时没有可用操作</div>}
          {singleOps.map((op) => (
            <button
              key={op.id}
              className="orb-op"
              title={`${op.notation} —— ${op.doc}`}
              onClick={() => onRun(op)}
            >
              <span className="orb-op-label">{menuLabel(op)}</span>
              <code>{opTemplate(op)}</code>
              <span className="orb-op-doc">{op.doc}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

/**
 * 环绕角度。
 *
 * 球挂在偏左上（或箭头上方），对象在球的右下方——所以卫星按钮只铺在**上半圈 + 左侧**
 * （-180° 到 0°）：如果按整圈均分，正下方那颗会结结实实压住节点标签 / 压住箭头。
 */
function angleAt(i: number, n: number): number {
  if (n <= 1) return -90
  return -180 + (i * 180) / (n - 1)
}
