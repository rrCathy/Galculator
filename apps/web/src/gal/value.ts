import type { Group, GroupElement } from '@groupviz/core'

/**
 * 值类型（6 种）—— 架构 §3 / 交互模型 §2。
 *
 * 操作产出的**一切**都是这六类之一。画布只承载前五类里"有节点"的那些；
 * 数值走左栏「数值区」（`number` 不上画布）。
 */
export type ValueType = 'group' | 'elements' | 'subgroups' | 'map' | 'action' | 'number'

export const VALUE_TYPE_LABEL: Record<ValueType, string> = {
  group: '群',
  elements: '元素集',
  subgroups: '子群集',
  map: '映射',
  action: '作用',
  number: '数值',
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

/* ── 值 ─────────────────────────────────────────────────── */

export type GalValue =
  | { type: 'group'; group: Group }
  | { type: 'elements'; group: Group; elements: GroupElement[] }
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
 * 画布形状 —— 形状编码类型（交互模型 §2）：
 *   group   → 方（圆角矩形）
 *   set     → 圆（元素集 / 子群集）
 *   action  → 虚线方（作用线节点）
 *   edge    → 不占节点，只画一条边（映射）
 *   none    → 不上画布（数值 → 左栏数值区）
 */
export type CanvasShape = 'group' | 'set' | 'action' | 'edge' | 'none'

export function canvasShape(v: GalValue): CanvasShape {
  switch (v.type) {
    case 'group':
      return 'group'
    case 'elements':
    case 'subgroups':
      return 'set'
    case 'action':
      return 'action'
    case 'map':
      return 'edge'
    case 'number':
      return 'none'
  }
}

/** 画布上是否呈现为节点。 */
export function isCanvasValue(v: GalValue): boolean {
  const s = canvasShape(v)
  return s === 'group' || s === 'set' || s === 'action'
}
