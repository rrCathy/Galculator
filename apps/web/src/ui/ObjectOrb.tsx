import type { OpDef } from '../gal/ops'
import { opTemplate } from '../gal/ops'
import { menuLabel } from '../gal/interaction'
import type { GalValue } from '../gal/value'
import type { NodeAnchor } from './CanvasView'
import type { InfoTab } from './InfoDock'
import { BENCH_H_DEFAULT } from './Workbench'

export type OrbStage = 'closed' | 'ring' | 'ops'

interface RingItem {
  key: string
  label: string
  /** 有 tab = "看"这一类（填信息面板） */
  tab?: InfoTab
  /** 有 opId = 直接执行这个单对象操作 */
  opId?: string
  /** 有 act = "被作用"（U57：起一个 `customAction`，把这个集合当 Ω） */
  act?: boolean
  /** 有 build = "给它一个运算"（S2b：起 `structure` 编辑器，把这个集合当载体） */
  build?: boolean
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
    /*
     * 结构是"载体 + 运算 + 档案"，它那一节的落点是**公理档案**（§11.2：级别去面板），
     * 不是群那三节里的「基本」。所以「信息」要开的是 `axioms` —— 开了 `basic`
     * 会落在空节上（结构的面板里根本没有 basic）。
     */
    tab: value.type === 'structure' ? 'axioms' : 'basic',
    title: '看这个对象的信息',
  }
  /*
   * **能被作用的集合**（U57）。
   *
   * 点集 / 元素集从前是个**死角**：光点它，球上的操作菜单恒空 —— 因为没有任何一条 op
   * 拿"集合"当第一参（`customAction` 的第一参是群 G）。从 Ω 那头看过去零线索。
   * 用户原话（2026-10-03）：「我创建了群和点集，然后怎么创建群作用？」。
   *
   * 这一颗就是那条路的入口：起一个 `customAction`，并把这个集合**当成 Ω**
   * （App 的 `startActionOnSet`）—— 于是"点集合 → 选个群 → 填生成元的像"成立。
   */
  const act: RingItem | null =
    value.type === 'set' || value.type === 'elements'
      ? {
          key: 'actOn',
          label: '被作用',
          act: true,
          title: '让某个群作用在这个集合上（选一个群 G，Ω 就是这个集合）',
        }
      : null
  /*
   * **给它一个运算**（S2b）—— 头号场景（§10 场景 0）的入口。
   *
   * `structure` 那条 op 本来就在 `singleOpsFor(点集)` 里（S1 之后点集只有这一条单对象
   * 操作），但它铺出来的按钮名不如用户的问题句贴切。
   * 用户的问题句是「给它一个运算」—— 这里就用那句当标签，
   * 并把 `structure` 从下面那排通用 op 里摘掉（免得同一个入口出现两次）。
   */
  const build: RingItem | null =
    (value.type === 'set' || value.type === 'elements') &&
    singleOps.some((o) => o.id === 'structure')
      ? {
          key: 'buildOn',
          label: '给它一个运算',
          build: true,
          title: '给这个集合配一个二元运算（乘法表），算出它到哪一级',
        }
      : null
  const head: RingItem[] = [info, ...[build, act].filter((x): x is RingItem => x !== null)]
  // `structure` 已经被上面那颗「给它一个运算」代表了，别再铺一遍
  const generic = singleOps.filter((o) => o.id !== 'structure')
  if (generic.length === 0) return head
  if (generic.length <= 3) {
    return [
      ...head,
      ...generic.map((op) => ({
        key: op.id,
        // 中文显示名（2026-10-06 起 `menuLabel` 就是中文）——
        // 从前这里是 `op.call?.[0] ?? menuLabel(op)`，会把 `conjOn` 这种英文名贴到按钮上。
        label: menuLabel(op),
        opId: op.id,
        title: `${menuLabel(op)}（${op.notation}）---- ${op.doc}`,
      })),
    ]
  }
  return [...head, { key: 'ops', label: '操作', title: '只用一个对象就能做的操作' }]
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
  dock,
  benchH,
  onOpen,
  onClose,
  onToggleOps,
  onInspect,
  onRun,
  onActOn,
  onBuild,
}: {
  anchor: NodeAnchor
  stage: OrbStage
  singleOps: OpDef[]
  /** 焦点对象的值——决定环绕按钮的构成 */
  value: GalValue
  containerW: number
  containerH: number
  /**
   * **靠左停**（2026-10-09 用户拍板）——台升起时球不再贴着被台盖住的节点，
   * 而是固定到左缘（与输入球同一条竖线、叠在它下面）。环与操作面板随向翻到右侧。
   */
  dock?: boolean
  /** 工作台高度（px）——dock 时贴着台顶算位（与 `--bench-h` 同源） */
  benchH?: number
  onOpen: () => void
  onClose: () => void
  onToggleOps: () => void
  onInspect: (tab: InfoTab) => void
  onRun: (op: OpDef) => void
  /** 「被作用」（U57）：把这个集合当 Ω 起一个作用 —— 只对 set / elements 出现 */
  onActOn?: () => void
  /** 「给它一个运算」（S2b）：把这个集合当载体起 `structure` 编辑器 —— 只对 set / elements 出现 */
  onBuild?: () => void
}) {
  const clampX = (v: number) => Math.min(Math.max(v, 52), containerW - 52)
  const clampY = (v: number) => Math.min(Math.max(v, 20), containerH - 20)

  const isEdge = anchor.kind === 'edge'
  /*
   * **左停位**（dock，2026-10-09）：中心 x=25（盒左 12，与输入球左缘同一条线）。
   *
   * **y 从"贴台顶"改成"固定位 + 碰到才让位"**（2026-10-10 用户拍板）——
   * 从前的 y = `containerH - benchH - 41` 是**贴台顶上方 41px**，
   * 用户一拖台的高度，台顶一动球就跟着滑（用户原话：
   * 「当工作台上下拉高度时，对象球会跟着动。我要解绑这个，让对象球固定」）。
   *
   * 现在：
   *   · **固定位** = 默认台高（`BENCH_H_DEFAULT` = 68%）时的台顶上方 41px；
   *   · **让位值** = 当前台顶上方 41px（旧公式）；
   *   · 取 `min` ⇒ 台 ≤ 68% 时球**纹丝不动**（让位值更高、够不着它）；
   *     台拖过 68% 快要碰/盖到它时，才上浮贴住台顶 —— **永不被盖**。
   */
  const dockX = 25
  const dockYFixed = Math.round(containerH * (1 - BENCH_H_DEFAULT) - 41)
  const dockYSafe = Math.round(containerH - (benchH ?? 0) - 41)
  const dockY = Math.min(dockYFixed, dockYSafe)
  // 节点左上角（沿对角线挪一点，别压在节点边上）；箭头挂在中点正上方；dock 固定左缘
  const orbX = dock ? dockX : clampX(isEdge ? anchor.x : anchor.x - anchor.r * 0.74)
  const orbY = dock ? dockY : clampY(isEdge ? anchor.y - 28 : anchor.y - anchor.r * 0.74)
  const ringR = dock ? RING_R_MIN : isEdge ? RING_R_EDGE : Math.max(RING_R_MIN, anchor.r + 22)

  const items = ringItems(value, singleOps)

  return (
    <>
      <button
        className={`orb${stage !== 'closed' ? ' on' : ''}${dock ? ' dock-left' : ''}`}
        style={{ left: orbX, top: orbY }}
        title={stage === 'closed' ? '操作这个对象' : '收起'}
        onClick={(e) => {
          e.stopPropagation()
          if (stage === 'closed') onOpen()
          else onClose()
        }}
      >
        {/* 球面上的三点。**必须是 ASCII**（2026-09-27 起）——
            它从前是 `⋯`（U+22EF），那个字符键盘打不出来 */}
        ...
      </button>

      {stage === 'ring' &&
        items.map((item, i) => {
          const t = ((dock ? angleAtDock(i, items.length) : angleAt(i, items.length)) * Math.PI) / 180
          // dock 时只往**右侧半圈**铺（左侧是屏幕外）；x 再兜一道下限，别贴出左缘
          const x = dock
            ? Math.max(40, orbX + Math.cos(t) * ringR)
            : clampX(orbX + Math.cos(t) * ringR)
          const y = clampY(orbY + Math.sin(t) * ringR)
          return (
            <button
              key={item.key}
              className={`orb-sat${item.tab ? ' orb-info' : ' orb-ops'}${dock ? ' dock-left' : ''}`}
              data-op={item.opId}
              style={{ left: x, top: y }}
              title={item.title}
              onClick={(e) => {
                e.stopPropagation()
                if (item.act) {
                  onActOn?.()
                  return
                }
                if (item.build) {
                  onBuild?.()
                  return
                }
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
          className={`orb-ops-panel${dock ? ' dock-left' : ''}`}
          style={{
            left: dock ? 12 : Math.min(Math.max(orbX - 12, 12), Math.max(12, containerW - 260)),
            top: dock
              ? Math.min(dockY + 34, Math.max(12, containerH - 330))
              : Math.min(orbY + 26, Math.max(12, containerH - 320)),
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
              data-op={op.id}
              title={`${menuLabel(op)}（${op.notation}）---- ${op.doc}`}
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

/**
 * dock（球靠左停）时的环绕角度：**右侧半圈**（-90° 到 +90°）。
 * 球在屏幕左缘，左侧是屏幕外 —— 原版"上半圈 + 左侧"在这里会铺到屏幕外。
 */
function angleAtDock(i: number, n: number): number {
  if (n <= 1) return 0
  return -90 + (i * 180) / (n - 1)
}
