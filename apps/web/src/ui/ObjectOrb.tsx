import type { OpDef } from '../gal/ops'
import { opTemplate } from '../gal/ops'
import { menuLabel } from '../gal/interaction'
import type { NodeAnchor } from './CanvasView'
import type { InfoTab } from './InfoDock'

export type OrbStage = 'closed' | 'ring' | 'ops'

/** 环绕的 4 个按钮：三个"看"（各切一个信息 tab）+ 一个"单对象操作"。 */
const RING: { key: string; label: string; tab?: InfoTab }[] = [
  { key: 'basic', label: '基本', tab: 'basic' },
  { key: 'elements', label: '元素', tab: 'elements' },
  { key: 'subgroups', label: '子群', tab: 'subgroups' },
  { key: 'ops', label: '操作' },
]

/** 环绕半径的下限；实际按节点尺寸放大，节点大时按钮就推远一点 */
const RING_R_MIN = 54

/**
 * 对象悬浮球（UI v3）。
 *
 * 挂在节点的**左上角**（不是右侧）：右侧和下方是交换图上出边的地方，
 * 左上角是空着的，不遮箭头。
 *
 * 球本身**深色**——画布是浅色，深色球一放上去就是"这里可以点"的最强信号，
 * 而环绕出去的 4 个卫星按钮保持浅色胶囊（它们是"选项"，不是"入口"）。
 *
 * 点「操作」→ 展开下拉面板：里面全是**单对象操作**，点哪个就立刻创建对象，
 * 不需要再选参数（这正是"单对象"的含义）。
 */
export function ObjectOrb({
  anchor,
  stage,
  singleOps,
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

  // 节点左上角：沿对角线往外挪一点，别压在节点边上
  const orbX = clampX(anchor.x - anchor.r * 0.74)
  const orbY = clampY(anchor.y - anchor.r * 0.74)
  const ringR = Math.max(RING_R_MIN, anchor.r + 22)

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
        RING.map((item, i) => {
          const t = ((angleAt(i, RING.length)) * Math.PI) / 180
          const x = clampX(orbX + Math.cos(t) * ringR)
          const y = clampY(orbY + Math.sin(t) * ringR)
          return (
            <button
              key={item.key}
              className={`orb-sat${item.tab ? ' orb-info' : ' orb-ops'}`}
              style={{ left: x, top: y }}
              title={item.tab ? `看${item.label}信息` : '只用一个对象就能做的操作'}
              onClick={(e) => {
                e.stopPropagation()
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
 * 球挂在节点**左上角**，节点在球的右下方向——所以 4 颗卫星只铺在**上半圈 + 左侧**
 * （-180° 到 0°）：如果按整圈均分，正下方那颗会结结实实压住节点标签。
 */
function angleAt(i: number, n: number): number {
  return -180 + (i * 180) / Math.max(n - 1, 1)
}
