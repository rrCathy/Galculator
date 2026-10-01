/**
 * 对应定理（第四同构定理）的**真计算**。
 *
 *   N ⊴ G ⇒ { H : N ≤ H ≤ G } ⟷ { S : S ≤ G/N }，H ↦ H/N
 *
 * 这个双射**保包含**（两边的格同构）且**把正规映到正规**。
 *
 * 数据全部来自 core，没有一处手写：区间靠 `computeSubgroupLattice(G)` 的子图筛出，
 * 商群靠 `computeQuotientGroup(G, N)`，而 `H ↦ H/N` 这个像**真算**——拿 H 里每个元素的
 * label 去商群元素的 `cosetMemberLabels` 里查它落在哪个陪集，落在同一个陪集的元素
 * 合成一个像点。不按阶猜、不按位置猜。
 *
 * 为什么必须真配对：`H/N` 是**具体的子群**。同阶的子群可能有多个（S₄ 的三个 D₄ 都在
 * 区间里），按阶配会在排列上出错；按 label 配则天然正确，也顺带证明了"这是双射"。
 *
 * 为什么不用 core 的 `getPrecomputed`：那张表只覆盖库内**具名群**，构造物（`S_4/V_4`）
 * 返回 `null`。而对应定理的主体恰恰就是构造物。
 */
import {
  computeQuotientGroup,
  computeSubgroupLattice,
  findAllSubgroups,
  subgroupStructureSymbol,
  type Group,
  type Subgroup,
} from '@groupviz/core'

/** 与 InfoDock / relations 同一条守卫线：超过就不枚举。 */
export const CORR_ENUM_CAP = 144

export interface CorrNode {
  /** 图内唯一 key（`g:3` / `q:sg-4`）*/
  key: string
  /** 显示名（简化 LaTeX，交给展示层转成 Unicode）*/
  symbol: string | null
  order: number
  /** 在这一侧的指数（G 侧 = [G:H]，商侧 = [Q:K]）*/
  index: number
  normal: boolean
  /** 第几层（0 = 顶）*/
  level: number
  /** 层内第几列 */
  slot: number
  /** 对侧配对节点的 key */
  pair: string
}

export interface Correspondence {
  /** N 的符号，如 `C_{2}\times C_{2}` */
  nSymbol: string | null
  nOrder: number
  /** 商群符号（core 给的名字，如 `S_{4}/N`）*/
  qSymbol: string
  qOrder: number
  /** 商群自己的结构符号，如 `D_{3}`（就是"≅ S₃"那件事）*/
  qStruct: string | null
  left: CorrNode[]
  right: CorrNode[]
  /** 左栏的 Hasse 边（key 对）*/
  leftEdges: [string, string][]
  /** 右栏的 Hasse 边（key 对）*/
  rightEdges: [string, string][]
  levelCount: number
  /** 两侧边数（定理说应当相等）*/
  leftEdgeCount: number
  rightEdgeCount: number
}

export type CorrResult = { ok: true; value: Correspondence } | { ok: false; reason: string }

const safeStruct = (G: Group, ids: string[]): string | null => {
  try {
    return subgroupStructureSymbol(G, ids) ?? null
  } catch {
    return null
  }
}

/** `H ↦ H/N`：H 的元素按 label 落进商群的哪个陪集。 */
function imageInQuotient(G: Group, Q: Group, elementIds: string[]): string[] {
  const idSet = new Set(elementIds)
  const labels = new Set(G.elements.filter((e) => idSet.has(e.id)).map((e) => e.label))
  return Q.elements
    .filter((qe) => (qe.cosetMemberLabels ?? []).some((l) => labels.has(l)))
    .map((qe) => qe.id)
}

/**
 * 按元素集合找出 G 里那个**真**子群对象。
 *
 * ⚠️ 不能拿 `subgroupFromElementIds` 顶替。它造出来的 `Subgroup` 只保证"是子群"，
 * `isNormal` 一律 `false` —— 而 core 的 `computeQuotientGroup` 会读这个字段，
 * 于是**直接返回 null**（实测 `V₄ ⊴ S₄` 也照样"算不出商群"）。
 * `findAllSubgroups` 给的才是算过正规性的那个。
 */
function findSubgroup(G: Group, ids: string[]): Subgroup | null {
  const hit = findAllSubgroups(G).find((s) => {
    const sid = s.elements.map((e) => e.id)
    return sid.length === ids.length && ids.every((id) => sid.includes(id))
  })
  if (hit) return hit
  // `findAllSubgroups` **不含 G 自身**
  if (ids.length === G.order) {
    return { elements: G.elements, order: G.order, index: 1, isNormal: true, generators: [] }
  }
  return null
}

export function computeCorrespondence(G: Group, nIds: string[]): CorrResult {
  if (nIds.length === 0) return { ok: false, reason: '没有选中子群' }
  if (G.order > CORR_ENUM_CAP) {
    return { ok: false, reason: `|G| = ${G.order} 超过 ${CORR_ENUM_CAP}，不做子群枚举（守卫）` }
  }

  const N = findSubgroup(G, nIds)
  if (!N) return { ok: false, reason: '选中的子集不是子群' }

  const latG = computeSubgroupLattice(G)

  /**
   * ⚠️ 正规性**不能读 `N.isNormal`**：`subgroupFromElementIds` 造出来的 `Subgroup`
   * 只保证"是子群"，`isNormal` 一律给 `false`（实测 `A₄ ⊴ S₄` 被判成 false，
   * 卡片会误报"要求正规子群"，而 A₄ 恰恰是 S₄ 唯一的指数 2 正规子群）。
   * 判据以**子群格节点**为准 —— 那里是真算过的。
   */
  const nNode = latG.nodes.find(
    (nd) => nd.elementIds.length === nIds.length && nIds.every((id) => nd.elementIds.includes(id)),
  )
  if (!nNode) return { ok: false, reason: '这个子群不在子群表里' }
  if (!nNode.isNormal) return { ok: false, reason: '对应定理要求 N 是 G 的正规子群（N ⊴ G）' }

  const Q = computeQuotientGroup(G, N)
  if (!Q) return { ok: false, reason: '这个子群算不出商群' }

  const latQ = computeSubgroupLattice(Q)

  // ── ① 区间 { H : N ≤ H ≤ G }：含 N 的节点（`computeSubgroupLattice` 含 G 自身）──
  const nset = new Set(nIds)
  const interval: { node: (typeof latG.nodes)[number]; img: string[] }[] = []
  for (const node of latG.nodes) {
    if (![...nset].every((id) => node.elementIds.includes(id))) continue
    interval.push({ node, img: imageInQuotient(G, Q, node.elementIds) })
  }
  if (interval.length === 0) return { ok: false, reason: '区间是空的（不该发生）' }

  // ── ② 配对：把 `H/N` 的元素集合对到 `L(Q)` 的节点上 ──
  const qNodeByKey = new Map(latQ.nodes.map((n, i) => [`q${i}`, n]))
  const pairOf = new Map<string, string>() // 左 key -> 右 key
  const imgOf = new Map<string, string[]>()
  for (let i = 0; i < interval.length; i++) {
    const img = interval[i].img
    const hit = latQ.nodes.find(
      (n) => n.elementIds.length === img.length && img.every((id) => n.elementIds.includes(id)),
    )
    if (!hit) return { ok: false, reason: '有子群的像落不到商群的子群上（不该发生）' }
    const qKey = `q${latQ.nodes.indexOf(hit)}`
    pairOf.set(`g${i}`, qKey)
    imgOf.set(qKey, img)
  }
  if (pairOf.size !== latQ.nodes.length) {
    return {
      ok: false,
      reason: `区间有 ${pairOf.size} 个、商群有 ${latQ.nodes.length} 个子群，数目不等（不该发生）`,
    }
  }

  // ── ③ 分层：两侧各自按阶降序。因为 |H/N| = |H|/|N|，两边的降序是同序的 ──
  const orderDesc = (ns: { order: number }[]) => [...new Set(ns.map((n) => n.order))].sort((a, b) => b - a)

  const leftOrders = orderDesc(interval.map((e) => e.node))
  const left: CorrNode[] = []
  interval.forEach((e, i) => {
    const key = `g${i}`
    const level = leftOrders.indexOf(e.node.order)
    left.push({
      key,
      symbol: safeStruct(G, e.node.elementIds),
      order: e.node.order,
      index: e.node.index,
      normal: e.node.isNormal,
      level,
      slot: 0,
      pair: pairOf.get(key)!,
    })
  })
  // 层内按 key 稳定排序，再编 slot
  left.sort((a, b) => a.level - b.level || a.key.localeCompare(b.key))
  {
    const counter = new Map<number, number>()
    for (const n of left) {
      const s = counter.get(n.level) ?? 0
      n.slot = s
      counter.set(n.level, s + 1)
    }
  }

  const rightOrderKeys = [...pairOf.values()]
  const rightOrderList = rightOrderKeys.map((k) => qNodeByKey.get(k)!).filter(Boolean)
  const rightOrders = orderDesc(rightOrderList)
  const right: CorrNode[] = rightOrderList.map((qn, idx) => {
    const qKey = rightOrderKeys[idx]
    const gKey = [...pairOf.entries()].find(([, v]) => v === qKey)![0]
    const gNode = left.find((n) => n.key === gKey)!
    return {
      key: qKey,
      symbol: safeStruct(Q, qn.elementIds),
      order: qn.order,
      index: qn.index,
      normal: qn.isNormal,
      level: rightOrders.indexOf(qn.order),
      // 与左侧同一 slot —— 同一层的左右两侧因此一一对齐
      slot: gNode.slot,
      pair: gKey,
    }
  })
  right.sort((a, b) => a.level - b.level || a.slot - b.slot)

  // ── ④ 两侧各自的 Hasse 边（先转成 key，再筛子图）──
  const gKeyByNodeId = new Map<string, string>()
  interval.forEach((e, i) => gKeyByNodeId.set(e.node.id, `g${i}`))
  const leftEdges: [string, string][] = []
  for (const ed of latG.edges) {
    // ⚠️ `edges.from/to` 是 `nodes` 的**下标**，不是节点 id
    const a = gKeyByNodeId.get(latG.nodes[ed.from]?.id)
    const b = gKeyByNodeId.get(latG.nodes[ed.to]?.id)
    if (a && b) leftEdges.push([a, b])
  }

  const qKeyByNodeId = new Map<string, string>()
  latQ.nodes.forEach((n, i) => qKeyByNodeId.set(n.id, `q${i}`))
  const rightEdges: [string, string][] = []
  for (const ed of latQ.edges) {
    const a = qKeyByNodeId.get(latQ.nodes[ed.from]?.id)
    const b = qKeyByNodeId.get(latQ.nodes[ed.to]?.id)
    if (a && b) rightEdges.push([a, b])
  }

  const levelCount = Math.max(leftOrders.length, rightOrders.length)

  return {
    ok: true,
    value: {
      nSymbol: safeStruct(G, nIds),
      nOrder: N.order,
      qSymbol: Q.symbol,
      qOrder: Q.order,
      qStruct: safeStruct(Q, Q.elements.map((e) => e.id)),
      left,
      right,
      leftEdges,
      rightEdges,
      levelCount,
      leftEdgeCount: leftEdges.length,
      rightEdgeCount: rightEdges.length,
    },
  }
}
