import type { Group } from '@groupviz/core'
import type { CanvasGraph, CanvasNode, GalEdge, GalObject } from './types'
import { canvasShape, isCanvasValue, type GalSet } from './value'

/**
 * 派生深度 = 依赖链长度。输入对象为 0，其派生结果为 1，再派生为 2……
 * 布局时 level 小者在上（与子群格「大在上」的约定同向）。
 *
 * **不上画布的对象不占行**（映射 / 作用 / 子群集 / 数值）：它们是"关系"或"表格"，
 * 不是顶点。若让它们也加一层，图里就会出现**空行**——第一同构定理的正方形
 * 会摊成三行（`G`、`H` 一行 ‖ 空一行 ‖ 商群与像一行），而课本里它是两行。
 * 所以它们的层级贡献 = 自己来源的层级（不加一），让顶点图的行距等于它的拓扑距离。
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
    const below = Math.max(...o.sources.map((s) => visit(s, next)))
    const lv = isCanvasValue(o.value) ? 1 + below : below
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
  // 稳定子：`Stab(H) ↪ G`（母群从作用取，见 parentOf）
  'stabilizers',
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

/** 找 Ω 对应的那个集合节点（先按引用同一性，再按标签 + 基数）。 */
function setNodeId(objects: GalObject[], omega: GalSet): string | null {
  const exact = objects.find((o) => o.value.type === 'set' && o.value.set === omega)
  if (exact) return exact.id
  const alike = objects.find(
    (o) =>
      o.value.type === 'set' &&
      o.value.set.label === omega.label &&
      o.value.set.members.length === omega.members.length,
  )
  return alike?.id ?? null
}

/**
 * 映射类型 → 箭头形状（DIAGRAM_SPEC §1.6）：
 *   满射 `↠`（双箭头）· 单射 `↪`（尾钩）· 同构（两者都要）。
 *
 * `isInjective` / `isSurjective` 可能为 `null`（超出可判定范围），
 * 那时退回普通箭头——**不猜**。
 */
export function arrowOf(m: { isInjective: boolean | null; isSurjective: boolean | null }):
  | 'injective'
  | 'surjective'
  | 'iso'
  | undefined {
  if (m.isInjective && m.isSurjective) return 'iso'
  if (m.isSurjective) return 'surjective'
  if (m.isInjective) return 'injective'
  return undefined
}

/** 结构伴生边（U3）——**操作 = 结果对象 + 结构伴生**：
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

  /**
   * 子群结果的母群：从来源里找——
   * 直接来源是群就用它；是映射就用映射的端群；是**作用**就用作用的群
   * （`Stab(H)` 的母群是 G —— DIAGRAM_SPEC §5.2 的 `Stab ↪ G`）。
   */
  const parentOf = (o: GalObject, want: 'domain' | 'codomain'): string | null => {
    for (const s of o.sources) {
      const src = byId.get(s)
      if (!src) continue
      if (src.value.type === 'group') return groupNodeId(objects, src.value.group)
      if (src.value.type === 'action') return groupNodeId(objects, src.value.action.group)
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
        // 自然投影是**满射**（课本写 `π : G ↠ G/N`）
        edges.push({
          id: `${g}->${o.id}:pi`,
          kind: 'map',
          from: g,
          to: o.id,
          label: 'π',
          arrow: 'surjective',
        })
        consumed.add(o.id)
      }
      // **商的第二个参数是母群的子群**——求值时就校验过（`asCoreSubgroup` 不过则报错），
      // 所以这里照直画 `Y ↪ X`。第三同构定理的 `K/N ↪ G/N` 靠这一条：
      // 没有它，那个梯形少一条腰（而 `KN` 自己不是子群升级来的对象，
      // 它的 `↪` 不会由别处产生）。
      // 重复情形（`商(G, N)` 且 N 自己是 `闭包` 等子群升级对象）会被末尾的去重收掉。
      const second = o.sources.map((s) => byId.get(s))[1]
      if (g && second?.value.type === 'group' && nodeIds.has(second.id)) {
        edges.push({
          id: `${second.id}->${g}:incl`,
          kind: 'map',
          from: second.id,
          to: g,
          label: '↪',
          arrow: 'injective',
        })
      }
      continue
    }

    if (op === 'directProduct') {
      const factors = o.sources.filter((s) => nodeIds.has(s)).slice(0, 2)
      factors.forEach((f, i) => {
        // 积投影是**满射**（`π₁ : A × B ↠ A`）
        edges.push({
          id: `${o.id}->${f}:proj${i}`,
          kind: 'map',
          from: o.id,
          to: f,
          label: i === 0 ? 'π₁' : 'π₂',
          arrow: 'surjective',
        })
      })
      if (factors.length > 0) consumed.add(o.id)
      continue
    }

    if (op === 'firstIso') {
      // 第一同构定理的边：`G --φ--> H`（用户画的）+ 工具补出来的：
      //   `G --π--> G/ker φ`（满射）与 `G/ker φ --≅--> ?`
      // 那个 `?` 取决于像占不占满靶群 —— 这正是三角形与正方形的分岔：
      //   满射   `im φ = H`      → 直指靶群节点（三角形）
      //   非满射 `im φ ⊊ H`      → 指工具补的 `im φ` 顶点（正方形）
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
        edges.push({
          id: `${dom}->${o.id}:pi`,
          kind: 'map',
          from: dom,
          to: o.id,
          label: 'π',
          arrow: 'surjective',
        })
      }
      const imSize = m.image?.length ?? 0
      const target = (() => {
        // 满射：像 = 靶群，直接连到靶群那个顶点
        if (imSize === 0 || imSize === m.codomain.order) return groupNodeId(objects, m.codomain)
        // 非满射：连到工具为**同一个映射**补出来的那个 `im φ` 顶点
        //（`firstIsoImage` 顶点的 sources 也是这个映射，所以按"共享来源"认亲）
        return (
          objects.find(
            (x) => x.opId === 'firstIsoImage' && x.sources.some((s) => o.sources.includes(s)),
          )?.id ?? null
        )
      })()
      if (target && target !== o.id) {
        // 第一同构的结论本身就是**同构**（双向箭头）
        edges.push({
          id: `${o.id}->${target}:iso`,
          kind: 'map',
          from: o.id,
          to: target,
          label: '≅',
          arrow: 'iso',
        })
      }
      consumed.add(o.id)
      continue
    }

    // `im φ`（第一同构定理补出来的像）也是**单射进靶群**——下面的通用包含分支负责它，
    // 只要把母群取成映射的 codomain。
    const wantsCodomain = op === 'image' || op === 'firstIsoImage'
    const isSubgroupResult = SUBGROUP_RESULT_OPS.has(op) || op === 'kernel' || wantsCodomain
    if (!isSubgroupResult) continue
    const parent = parentOf(o, wantsCodomain ? 'codomain' : 'domain')
    if (parent && parent !== o.id) {
      // 包含是**单射**（`i : im φ ↪ H`）
      edges.push({
        id: `${o.id}->${parent}:incl`,
        kind: 'map',
        from: o.id,
        to: parent,
        label: '↪',
        arrow: 'injective',
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

  // ── 作用的 Ω 升格为节点（DIAGRAM_SPEC §6.4 第 1 条）──────────────
  //
  // Ω 从前只是 `GalAction.n` 这个数字，图里根本不存在；但 Sylow 的整条推理链
  // （轨道分解 / 轨道-稳定子）都以它为主角。这里给它一个家：
  //   ① `omegaBase === 'self'` → Ω = G 自身，家就是 G 的节点（作用线画成自环）
  //   ② `omega.from` / 同引用 / 同标签 → 用户自己那行 `Ω = 底集(S)` 的节点
  //   ③ 都没有（`共轭作用在(G, 底集(S))` 内联写法）→ **就地造一个 Ω 节点**
  const omegaHome = new Map<string, string>()
  for (const o of objects) {
    if (o.value.type !== 'action') continue
    const A = o.value.action
    const omega = A.omega
    if (!omega) continue
    if (A.omegaBase === 'self') {
      const gid = groupNodeId(objects, A.group)
      if (gid) omegaHome.set(o.id, gid)
      continue
    }
    let home: string | null =
      omega.from && objects.some((x) => x.id === omega.from) ? omega.from : null
    if (!home) home = setNodeId(objects, omega)
    if (!home) {
      home = `${o.id}/Ω`
      nodes.push({
        id: home,
        origin: 'derived',
        label: 'Ω',
        def: `${o.id} 的作用点集`,
        sources: [o.id],
        value: { type: 'set', set: omega },
        opId: 'omega',
        recipe: '作用的 Ω',
        shape: 'set',
        level: (levels.get(o.id) ?? 0) + 1,
      })
    }
    omegaHome.set(o.id, home)
  }

  const ids = new Set(nodes.map((n) => n.id))
  const edges: GalEdge[] = []

  // ① 来源线（淡虚线，辅助）
  const { edges: structural, consumed } = alongsideEdges(objects, ids)
  // 轨道的边：`Orb ↪ Ω`（DIAGRAM_SPEC §5.2 的下层）。
  // 轨道长度**等于 Ω 时写 `=`** —— 那就是「作用传递」，
  // 也正是 Sylow II 的结论（G 在 Syl_p(G) 上只有一个轨道）。
  for (const o of objects) {
    if (o.opId !== 'orbits' || !ids.has(o.id)) continue
    for (const s of o.sources) {
      const src = objects.find((x) => x.id === s)
      if (src?.value.type !== 'action') continue
      const home = omegaHome.get(s)
      const size = o.value.type === 'set' ? o.value.set.members.length : 0
      if (home && home !== o.id) {
        // 轨道 **等于** Ω 时标签写 `=`（传递）——那其实是"相等"，
        // 所以画成同构箭头（既单又满）；否则是严格的子集包含 → 单射。
        const same = size > 0 && size === src.value.action.n
        edges.push({
          id: `${o.id}->${home}:incl`,
          kind: 'map',
          from: o.id,
          to: home,
          label: same ? '=' : '↪',
          arrow: same ? 'iso' : 'injective',
        })
      }
      consumed.add(o.id)
      break
    }
  }

  for (const n of nodes) {
    if (consumed.has(n.id)) continue // 已有结构伴生箭头，别叠一条来源线
    for (const src of n.sources) {
      if (!ids.has(src) || src === n.id) continue
      edges.push({ id: `${src}->${n.id}`, kind: 'provenance', from: src, to: n.id })
    }
  }

  // ② 结构伴生箭头（一等公民，实线）
  edges.push(...structural)

  // ③ 作用线：`G ↷ Ω`（一等边，DIAGRAM_SPEC §6.4 第 2 条）
  //
  // 作用不再是画布上的一个方块 —— 它是**关系**。Ω = G 自身时画成 G 上的**自环**
  // （共轭作用 / 正则作用都是这种），否则从 G 指到 Ω 那个节点。
  for (const o of objects) {
    if (o.value.type !== 'action') continue
    const from = groupNodeId(objects, o.value.action.group)
    const to = omegaHome.get(o.id)
    if (!from || !to || !ids.has(from) || !ids.has(to)) continue
    edges.push({
      id: `act:${o.id}`,
      kind: 'action',
      from,
      to,
      label: '↷',
      objectId: o.id,
    })
  }

  // ④ 显式映射对象 → 实线箭头（标签就是映射的名字，且箭头**背后是这个对象**，可点选）
  for (const o of objects) {
    if (o.value.type !== 'map') continue
    const from = groupNodeId(objects, o.value.map.domain)
    const to = groupNodeId(objects, o.value.map.codomain)
    if (!from || !to || !ids.has(from) || !ids.has(to)) continue
    edges.push({
      id: `map:${o.id}`,
      kind: 'map',
      from,
      to,
      label: o.id,
      objectId: o.id,
      // 用户画的映射：箭头形状按它**实际的**单 / 满 / 同构来（DIAGRAM_SPEC §1.6）
      arrow: arrowOf(o.value.map),
    })
  }

  // 去重（同一 from→to 只留一条；结构伴生优先于来源线）
  const seen = new Set<string>()
  const deduped = edges.filter((e) => {
    // 键带 `objectId`：共轭作用与正则作用都是 G 上的自环，
    // 不带的话后一条会被前一条吃掉。
    const key = `${e.from}->${e.to}:${e.kind}:${e.objectId ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { nodes, edges: deduped }
}
