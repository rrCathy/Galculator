import type { CanvasGraph, CanvasNode, GalEdge, GalObject } from './types'

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

/**
 * 画布图派生（docs/INTERACTION.md §10.2）。
 *
 *   每个对象 → 一个节点（数值除外）
 *   每个操作的源 → 一条边；作用是「作用线」，其余是「来源线」
 *
 * 映射（`map`）在画布上是 domain→codomain 的**实线箭头**而非节点，
 * 需要对象编辑器产出映射对象后接入——见 value.ts 的 GalMap。
 */
export function deriveCanvas(objects: GalObject[]): CanvasGraph {
  const levels = computeLevels(objects)

  const nodes: CanvasNode[] = []
  for (const o of objects) {
    // 数值 → 左栏「数值区」，不进画布
    if (o.value.type === 'number') continue
    // 映射 → 只画边不占节点（待对象编辑器接入）
    if (o.value.type === 'map') continue
    nodes.push({
      ...o,
      shape: o.value.type === 'group' ? 'group' : o.value.type === 'action' ? 'action' : 'set',
      level: levels.get(o.id) ?? 0,
    })
  }

  const ids = new Set(nodes.map((n) => n.id))
  const edges: GalEdge[] = []
  for (const n of nodes) {
    const isAction = n.value.type === 'action'
    for (const src of n.sources) {
      if (!ids.has(src)) continue
      edges.push({
        id: `${src}->${n.id}`,
        // 作用 = 特殊样式的箭头（作用线）；其余 = 辅助性的来源线
        kind: isAction ? 'action' : 'provenance',
        from: src,
        to: n.id,
        label: isAction ? '↷' : undefined,
      })
    }
  }
  return { nodes, edges }
}
