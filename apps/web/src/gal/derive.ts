import type { Group } from '@groupviz/core'
import type { CanvasGraph, CanvasNode, GalEdge, GalObject } from './types'
import { canvasShape } from './value'

/**
 * 派生深度 = 依赖链长度。输入对象为 0，其派生结果为 1，再派生为 2……
 * 布局时 level 小者在上（与子群格「大在上」的约定同向）。
 */
export function computeLevels(objects: GalObject[]): Map<string, number> {
  const byId = new Map(objects.map((o) => [o.id, o]))
  const memo = new Map<string, number>()

  const visit = (id: string, stack: Set<string>): number => {
    const cached = memo.get(id)
    if (cached !== undefined) return cached
    if (stack.has(id)) return 0 // 环保护（本语法下不该出现）
    const o = byId.get(id)
    if (!o || o.sources.length === 0) {
      memo.set(id, 0)
      return 0
    }
    const next = new Set(stack)
    next.add(id)
    const lv = 1 + Math.max(...o.sources.map((s) => visit(s, next)))
    memo.set(id, lv)
    return lv
  }

  for (const o of objects) visit(o.id, new Set())
  return memo
}

/** 结果群是母群的子群（升级为真群对象）的那几个操作——它们带**包含箭头**。 */
const SUBGROUP_RESULT_OPS = new Set([
  'center',
  'centralizer',
  'normalizer',
  'commutatorGroup',
  'closure',
  // 集合运算在结果是子群时会升级为群对象（见 ops.ts 的 setOp）——
  // 那时它也该有 `↪` 包含箭头（第二同构定理的 `H∩N ↪ H` 靠这条）
  'intersection',
  'productSet',
])

/** 群对象 → 它在画布上的节点 id（同一个群可能有多个对象，取第一个）。 */
function groupNodeId(objects: GalObject[], group: Group): string | null {
  const exact = objects.find((o) => o.value.type === 'group' && o.value.group === group)
  if (exact) return exact.id
  const alike = objects.find(
    (o) =>
      o.value.type === 'group' &&
      o.value.group.symbol === group.symbol &&
      o.value.group.order === group.order,
  )
  return alike?.id ?? null
}

/**
 * 结构伴生边（U3）——**操作 = 结果对象 + 结构伴生**：
 * 一个操作在长出结果节点的同时，也长出了它和旧对象之间的那条**映射箭头**。
 *
 * | 操作 | 伴生箭头 |
 * |---|---|
 * | `Q = G / N` | `π : G → Q`（自然投影）|
 * | `P = A × B` | `π₁ : P → A`、`π₂ : P → B`（积投影）|
 * | `Z(G)` `[G,G]` `C_G` `N_G` `⟨S⟩` | `H ↪ G`（包含，H 是母群的子群）|
 * | `ker f` / `im f` | `ker ↪ dom`、`im ↪ cod`（母群从映射的端群取）|
 *
 * 这些箭头**不是**"来源线"那种辅助信息，它们是交换图上的一等公民（实线）。
 * 所以有伴生箭头的对象**不再画来源线**——否则同一对节点上会叠两条反向的线。
 */
function alongsideEdges(objects: GalObject[], nodeIds: Set<string>): {
  edges: GalEdge[]
  consumed: Set<string>
} {
  const edges: GalEdge[] = []
  const consumed = new Set<string>()
  const byId = new Map(objects.map((o) => [o.id, o]))

  /** 子群结果的母群：从来源里找——直接来源是群就用它；是映射就用映射的端群。 */
  const parentOf = (o: GalObject, want: 'domain' | 'codomain'): string | null => {
    for (const s of o.sources) {
      const src = byId.get(s)
      if (!src) continue
      if (src.value.type === 'group') return groupNodeId(objects, src.value.group)
      if (src.value.type === 'map') {
        const g = src.value.map[want]
        const id = groupNodeId(objects, g)
        if (id) return id
      }
    }
    return null
  }

  for (const o of objects) {
    if (o.value.type !== 'group' || !nodeIds.has(o.id)) continue
    const op = o.opId ?? ''

    if (op === 'quotient') {
      const g = parentOf(o, 'domain')
      if (g && g !== o.id) {
        edges.push({ id: `${g}->${o.id}:pi`, kind: 'map', from: g, to: o.id, label: 'π' })
        consumed.add(o.id)
      }
      continue
    }

    if (op === 'directProduct') {
      const factors = o.sources.filter((s) => nodeIds.has(s)).slice(0, 2)
      factors.forEach((f, i) => {
        edges.push({
          id: `${o.id}->${f}:proj${i}`,
          kind: 'map',
          from: o.id,
          to: f,
          label: i === 0 ? 'π₁' : 'π₂',
        })
      })
      if (factors.length > 0) consumed.add(o.id)
      continue
    }

    if (op === 'firstIso') {
      // 第一同构定理的三条线：`G --φ--> H`（用户画的）+ 工具补的两条：
      //   `G --π--> G/ker φ` 与 `G/ker φ --≅--> im φ`（满射时 im φ = H）
      const m = (() => {
        for (const src of o.sources) {
          const hit = byId.get(src)
          if (hit?.value.type === 'map') return hit.value.map
        }
        return null
      })()
      if (!m) continue
      const dom = groupNodeId(objects, m.domain)
      if (dom) {
        edges.push({ id: `${dom}->${o.id}:pi`, kind: 'map', from: dom, to: o.id, label: 'π' })
      }
      if (m.isSurjective) {
        const cod = groupNodeId(objects, m.codomain)
        if (cod && cod !== o.id) {
          edges.push({ id: `${o.id}->${cod}:iso`, kind: 'map', from: o.id, to: cod, label: '≅' })
        }
      }
      consumed.add(o.id)
      continue
    }

    const isSubgroupResult = SUBGROUP_RESULT_OPS.has(op) || op === 'kernel' || op === 'image'
    if (!isSubgroupResult) continue
    const parent = parentOf(o, op === 'image' ? 'codomain' : 'domain')
    if (parent && parent !== o.id) {
      edges.push({
        id: `${o.id}->${parent}:incl`,
        kind: 'map',
        from: o.id,
        to: parent,
        label: '↪',
      })
      consumed.add(o.id)
    }
  }

  return { edges, consumed }
}

/**
 * 画布图派生（docs/INTERACTION.md §10.2）。
 *
 *   每个对象 → 一个节点（数值除外；映射不占节点，只画箭头）
 *   每个操作的源 → 一条边；作用是「作用线」，其余是「来源线」
 *   映射对象 → **实线箭头**（domain → codomain）；某些操作另带**结构伴生箭头**
 */
export function deriveCanvas(objects: GalObject[]): CanvasGraph {
  const levels = computeLevels(objects)

  const nodes: CanvasNode[] = []
  for (const o of objects) {
    // **去哪由存在层级决定**（DIAGRAM_SPEC §3）：
    //   none  → 不上画布：`list`（子群集）去面板、`scalar`（数值）去数值区
    //   edge  → 只画边不占节点：映射（作用暂时仍占节点，见 value.ts 的过渡注释）
    //   group / set / action → 占一个节点
    const shape = canvasShape(o.value)
    if (shape === 'none' || shape === 'edge') continue
    nodes.push({
      ...o,
      shape,
      level: levels.get(o.id) ?? 0,
    })
  }

  const ids = new Set(nodes.map((n) => n.id))
  const edges: GalEdge[] = []

  // ① 来源线 / 作用线
  const { edges: structural, consumed } = alongsideEdges(objects, ids)
  for (const n of nodes) {
    if (consumed.has(n.id)) continue // 已有结构伴生箭头，别叠一条来源线
    const isAction = n.value.type === 'action'
    for (const src of n.sources) {
      if (!ids.has(src)) continue
      edges.push({
        id: `${src}->${n.id}`,
        kind: isAction ? 'action' : 'provenance',
        from: src,
        to: n.id,
        label: isAction ? '↷' : undefined,
      })
    }
  }

  // ② 结构伴生箭头（一等公民，实线）
  edges.push(...structural)

  // ③ 显式映射对象 → 实线箭头（标签就是映射的名字，且箭头**背后是这个对象**，可点选）
  for (const o of objects) {
    if (o.value.type !== 'map') continue
    const from = groupNodeId(objects, o.value.map.domain)
    const to = groupNodeId(objects, o.value.map.codomain)
    if (!from || !to || !ids.has(from) || !ids.has(to)) continue
    edges.push({ id: `map:${o.id}`, kind: 'map', from, to, label: o.id, objectId: o.id })
  }

  // 去重（同一 from→to 只留一条；结构伴生优先于来源线）
  const seen = new Set<string>()
  const deduped = edges.filter((e) => {
    const key = `${e.from}->${e.to}:${e.kind}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { nodes, edges: deduped }
}
