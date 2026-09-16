import type { Group, GroupElement, HomomorphismMap } from '@groupviz/core'

/**
 * 值类型（7 种）—— 架构 §3 / 交互模型 §2。
 *
 * 操作产出的**一切**都是这七类之一。
 * **「去哪」不在这里决定**——由下面的 `ValueSort`（存在层级）决定。
 */
export type ValueType = 'group' | 'elements' | 'set' | 'subgroups' | 'map' | 'action' | 'number'

export const VALUE_TYPE_LABEL: Record<ValueType, string> = {
  group: '群',
  elements: '元素集',
  set: '集合',
  subgroups: '子群集',
  map: '映射',
  action: '作用',
  number: '数值',
}

/* ── 存在层级：一个值「在数学图景里的位置」───────────────────── */

/**
 * 存在层级（docs/DIAGRAM_SPEC.md §3）—— 与 `ValueType` **正交**：
 *
 * | 维度 | 回答的问题 | 影响 |
 * |---|---|---|
 * | `ValueType` | 数据长什么样（怎么存、怎么算）| 求值层 |
 * | `ValueSort` | 它在图里处于什么位置 | **去哪**（画布 / 面板 / 数值区）|
 *
 * 为什么要拆开：`elements`（元素集）与 `subgroups`（子群集）在数据结构上相似，
 * 但在数学图景里一个是**对象**（能当映射的源或靶）、一个是**列表**（不能）。
 * v3 的 `canvasShape()` 把两者都判成 `'set'`，于是画布上分不出"对象"与"表格"。
 */
export type ValueSort =
  /** 交换图的顶点：群、集合 —— 能作为某个映射的源或靶 */
  | 'vertex'
  /** 交换图的边：映射、作用 —— 连接两个顶点 */
  | 'edge'
  /** 列表：子群集 —— 是信息不是对象，不上画布（但可"取出"成员为对象）*/
  | 'list'
  /** 标量：数值 —— 进数值区 */
  | 'scalar'

export function sortOf(v: GalValue): ValueSort {
  switch (v.type) {
    case 'group':
    case 'elements':
    case 'set':
      return 'vertex'
    case 'map':
    case 'action':
      // 作用不是 `G → H`（是 `G×Ω → Ω`），但它在图里扮演的是"关系"的角色，
      // 所以与映射同属 edge 档；两者的**视觉**由 `kind` 区分（实线 vs 作用线）。
      return 'edge'
    case 'subgroups':
      return 'list'
    case 'number':
      return 'scalar'
  }
}

/* ── 子群：三种 core 形态拉平为一种 ───────────────────────── */

/**
 * 归一化后的子群。
 *
 * core 里"子群"有三种形态，字段不一致：
 *   - `Subgroup`            { elements, order, index, generators, isNormal }
 *   - `PSubgroupInfo`       { elements, order, generators, isNormal, isSylow }（无 index）
 *   - `SylowSubgroupInfo`   { elements, generators, order, isNormal }
 * 这一层把它们拉平，画布与详情面板只认这一种。
 */
export interface NormalizedSubgroup {
  elements: GroupElement[]
  order: number
  /** 指数 [G:H]；core 未给时为 null（由阶现算，阶为 0 时兜底 null） */
  index: number | null
  generators: GroupElement[]
  isNormal: boolean
  /** null = 该来源不提供此信息（如 findAllSubgroups 的普通子群） */
  isSylow: boolean | null
  /** 生成元记号，如 ⟨r2, s⟩；平凡群为 {e} */
  label: string
}

/** core 各子群形态的结构超集（归一化入参）。 */
export interface RawSubgroupLike {
  elements: GroupElement[]
  order: number
  index?: number
  generators?: GroupElement[]
  isNormal: boolean
  isSylow?: boolean
}

export function normalizeSubgroup(s: RawSubgroupLike, group: Group): NormalizedSubgroup {
  // 生成元里若含单位元，展示上要剔除（否则 ⟨e, r2⟩ 这种读起来很怪）
  const gens = (s.generators ?? []).filter((g) => g.id !== group.identity.id)
  const order = s.order
  return {
    elements: s.elements,
    order,
    index: s.index ?? (order > 0 ? group.order / order : null),
    generators: gens,
    isNormal: !!s.isNormal,
    isSylow: s.isSylow ?? null,
    label:
      order <= 1
        ? '{e}'
        : gens.length > 0
          ? `⟨${gens.map((g) => g.label).join(', ')}⟩`
          : `阶 ${order} 子群`,
  }
}

export function normalizeSubgroups(list: RawSubgroupLike[], group: Group): NormalizedSubgroup[] {
  return list.map((s) => normalizeSubgroup(s, group))
}

/* ── 映射（一等对象，画布上是实线箭头）─────────────────────── */

/**
 * 同态由**生成元的像**唯一决定（若良定义），所以内部存的就是生成元像表。
 * 文本一行表达不了，由「对象编辑器」产出（见 ARCHITECTURE §6.1）。
 */
export interface GalMap {
  domain: Group
  codomain: Group
  /**
   * 完整映射表（元素 id → 元素 id）。同态由生成元的像唯一决定，
   * `genImages` 供编辑器回显，`mapping` 供 ker / im 求值（core 的
   * `computeKernelFromMapping` / `computeImageFromMapping` 吃整表）。
   */
  mapping?: HomomorphismMap
  /** 生成元名 → 像元素 */
  genImages: { generator: string; image: GroupElement }[]
  isHomomorphism: boolean
  isInjective: boolean | null
  isSurjective: boolean | null
  kernel?: GroupElement[]
  image?: GroupElement[]
}

/* ── 作用（一等对象，画布上是作用线）───────────────────────── */

export type ActionKind = 'conjugation' | 'leftTranslation' | 'coset' | 'custom'

export const ACTION_KIND_LABEL: Record<ActionKind, string> = {
  conjugation: '共轭作用',
  leftTranslation: '左正则作用',
  coset: '陪集作用',
  custom: '自定义作用',
}

export interface GalAction {
  group: Group
  kind: ActionKind
  /** Ω 的基数 */
  n: number
  /** G 的元素 id → Ω 上的置换 */
  perms: Map<string, number[]>
  /** Ω 的标签（陪集作用时是陪集代表） */
  setLabels?: string[]
  /** kind='coset' 时的子群 */
  subgroup?: NormalizedSubgroup
}

/* ── 集合（Ω 的载体）───────────────────────────────────────── */

/**
 * 集合的成员。
 *
 * 成员**不一定是群元素**——所以不能复用 `elements`（那一类的成员被绑死成
 * `GroupElement`）。Ω 就是这种情形：
 *   - Sylow III 里 `Ω = Syl_p(G)`，成员是**子群**
 *   - Sylow I 里 Ω 是 `p^k` 元子集，成员是**子集**
 *   - 共轭作用里 `Ω = G`，成员才是群元素
 *
 * `subgroupElements` 让成员保留"它是个子群"的信息——面板上「取出为对象」靠它
 * （`buildSubgroupGroup` 能把元素集变成真群对象）。
 */
export interface SetMember {
  /** 展示记号（`⟨r2, s⟩` / `H₁` / `r2` …）*/
  label: string
  /** 成员背后的子群元素集（若它是子群）*/
  subgroupElements?: GroupElement[]
}

/** 集合：群作用的作用对象 Ω，也是"列表提升"的产物。 */
export interface GalSet {
  /** 上下文群（Ω 的成员取自哪里）*/
  group: Group
  /** 展示名 */
  label: string
  members: SetMember[]
  /** 由哪个对象提升而来（`底集(S)` 的 S）*/
  from?: string
}

/* ── 值 ─────────────────────────────────────────────────── */

export type GalValue =
  | { type: 'group'; group: Group }
  | { type: 'elements'; group: Group; elements: GroupElement[] }
  | { type: 'set'; set: GalSet }
  | { type: 'subgroups'; group: Group; subgroups: NormalizedSubgroup[] }
  | { type: 'map'; map: GalMap }
  | { type: 'action'; action: GalAction }
  | { type: 'number'; label: string; value: number }

/** 取该值所属的上下文群（数值没有）。详情面板与后续计算都要它。 */
export function contextGroup(v: GalValue): Group | null {
  switch (v.type) {
    case 'group':
      return v.group
    case 'elements':
      return v.group
    case 'set':
      return v.set.group
    case 'subgroups':
      return v.group
    case 'action':
      return v.action.group
    case 'map':
      return v.map.domain
    case 'number':
      return null
  }
}

/**
 * 画布形状 —— **由存在层级（`sortOf`）派生**，不再各自 switch 一遍。
 *
 * 这是本轮的关键修正：从前 `elements` 与 `subgroups` 都落到 `'set'`，
 * 画布上"集合对象"与"子群列表"长得一样。现在判据只有一条。
 */
export type CanvasShape = 'group' | 'set' | 'action' | 'edge' | 'none'

export function canvasShape(v: GalValue): CanvasShape {
  switch (sortOf(v)) {
    case 'list':
    case 'scalar':
      return 'none'
    case 'edge':
      // 过渡：`action` 的层级已是 edge（它是一条关系），但作用线还没做，
      // 所以暂时仍占一个节点。下一批把 `G ↷ Ω` 画出来后就返回 'edge'。
      return v.type === 'map' ? 'edge' : 'action'
    case 'vertex':
      return v.type === 'group' ? 'group' : 'set'
  }
}

/** 画布上是否呈现为**节点**。 */
export function isCanvasValue(v: GalValue): boolean {
  const s = canvasShape(v)
  return s === 'group' || s === 'set' || s === 'action'
}
