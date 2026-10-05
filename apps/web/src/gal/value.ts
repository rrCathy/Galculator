import type { Group, GroupElement, HomomorphismMap } from '@groupviz/core'
// ⚠️ **运行时**导入（不是 type-only）：下面是 S2c 要的"够不够格当群"唯一判据。
// 依赖是单向的 —— `algebra.ts` 只 `import type` 本模块，编译后不留 require，不会成环。
import { isGroupStructure, type AxiomProfile } from './algebra'

/**
 * 值类型（8 种）—— 架构 §3 / 交互模型 §2。
 *
 * 操作产出的**一切**都是这八类之一。
 * **「去哪」不在这里决定**——由下面的 `ValueSort`（存在层级）决定。
 */
export type ValueType =
  | 'group'
  | 'elements'
  | 'set'
  | 'subgroups'
  | 'map'
  | 'action'
  | 'relation'
  | 'number'
  | 'structure'

export const VALUE_TYPE_LABEL: Record<ValueType, string> = {
  group: '群',
  elements: '元素集',
  set: '集合',
  subgroups: '子群集',
  map: '映射',
  action: '作用',
  relation: '关系',
  number: '数值',
  structure: '代数结构',
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
    case 'structure':
      return 'vertex'
    case 'map':
    case 'action':
    case 'relation':
      // 作用不是 `G → H`（是 `G×Ω → Ω`）、关系不是映射（是"声明一条包含"），
      // 但它们在图里扮演的都是"关系"的角色，所以同属 edge 档；
      // 各自的**视觉**由 `kind` 区分（实线 / 作用线 / 关系线）。
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
  /**
   * **这一项就是母群自己**（F7，2026-10-05）。
   *
   * ## 为什么需要这个字段
   *
   * 同族三条 op 的口径天生不同，而**数学上它们都是对的**：
   *   · `Sub(G)` / `maximalSubgroups(G)` —— core 的 `findAllSubgroups`
   *     **不含 G 自身**（"极大子群"按定义是 G 的真子群）。
   *   · `normalSubgroups(G)` —— core 的 `findAllNormalSubgroups` **含 G 自身**，
   *     因为 `G ⊴ G` 恒成立（正规子群的定义允许 G 本身）。
   *
   * 用户看到的是**同一个族的三条并列入口**，正规子群那份"多算一个"，
   * 于是问「为什么正规子群多一个」—— 界面上没有任何地方回答这个问题。
   *
   * ## 为什么不"统一口径"
   *
   * 改任一边都要**说数学上的假话**：
   *   · 从 `normalSubgroups` 里剔掉 G ⇒ 漏掉 `G ⊴ G`（用户拿它当"正规性"的判据，
   *     `H ⊴ G` 判的就是"在列表里"）；
   *   · 往 `Sub(G)` 里塞 G ⇒ "子群"在多数教材里默认指**真**子群，
   *     而且 `findAllSubgroups` 是 core 的语义，不该由应用层加料。
   *
   * ⇒ **披露**而不是改口径：这一项在列表里标出来（UI 用它），顶部再写一句口径说明。
   */
  isSelf: boolean
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
    // F7：判据走**阶 + 元素数**（不是 `label`）—— G 自身的元素数与阶都等于母群。
    isSelf: order === group.order && s.elements.length === group.elements.length,
    label:
      order <= 1
        ? '{e}'
        : gens.length > 0
          ? `\\langle ${gens.map((g) => g.label).join(', ')}\\rangle`
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

export type ActionKind =
  | 'conjugation'
  | 'leftTranslation'
  | 'coset'
  /** G 通过共轭作用在一族子群上（Sylow III 的 `G ↷ Syl_p(G)`）*/
  | 'conjugationOnSubgroups'
  | 'custom'

export const ACTION_KIND_LABEL: Record<ActionKind, string> = {
  conjugation: '共轭作用',
  leftTranslation: '左正则作用',
  coset: '陪集作用',
  conjugationOnSubgroups: '共轭作用在子群集上',
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
  /**
   * **Ω 本身**（DIAGRAM_SPEC §6.4 第 1 条：Ω 升格为对象）。
   *
   * 从前 Ω 只是 `n` 这个数字加一串 `setLabels`——它在图里根本不存在。
   * 但 Sylow 的整条推理链（轨道分解、轨道-稳定子）都以 Ω 为主角，
   * 所以作用把它一并交出来：
   *   - `omega.from` 指向一个集合对象（`asSet(Syl_p(G))`）→ 作用线指向那个节点
   *   - 没有 `from` 时 Ω = G 自身（共轭 / 正则作用）→ 作用线是 G 上的自环
   */
  omega?: GalSet
  /**
   * Ω 的来源（决定作用线画到哪）：
   *   - `self`   Ω 就是 G 自身（共轭作用 / 正则作用）→ 作用线是 **G 上的自环**
   *   - `object` Ω 是另一个对象（集合）→ 作用线从 G 指向那个节点
   */
  omegaBase?: 'self' | 'object'
}

/* ── 关系（用户声明的一条包含）─────────────────────────────── */

/**
 * 关系（U20）—— 用户**声明**的一条关系，目前只有"包含"一种。
 *
 * ## 为什么它得是一等值（而不是个手势）
 *
 * 用户原话："我想拉个箭头表示 A₄ 和 K 的包含关系，但做不到"。而画布上的边
 * **一律由对象派生**（`derive.ts`）——手势画出来的线没有对象，就不可撤销、
 * 不可编辑、进不了证明模板、也上不了 `opsFor` 那张表。
 * 做成值类型之后，它自动获得三个入口（左栏 / 悬浮球 / 拖拽）与全部对象待遇。
 *
 * ## 正规性是**算出来的**，不是声明的
 *
 * 用户只说"H ⊆ G"；`⊴` 由 `containment()` 现场判定（U19 那套三道关）。
 * 所以那句"声明正规子群"是多余的，也无从撒谎。
 */
export interface GalRelation {
  /**
   * 关系种类：`contains`（H ⊆ G）或 `isomorphic`（A ≅ B，缺口 ⑰）。
   *
   * 缺省视为 `contains` —— 旧调用与旧快照不必逐个补字段。
   */
  kind?: 'contains' | 'isomorphic'
  /** 小的那个（子群方）；同构时是左边那个 */
  from: Group
  /** 大的那个（母群方）；同构时是右边那个 */
  to: Group
  /** 指数 [G:H] = |G| / |H|；同构没有指数，恒为 1 */
  index: number
  /** H ⊴ G？（判不出来时为 false，附注里会说明）；同构恒 false */
  isNormal: boolean
  /** `containment()` 判不出来正规性（超枚举守卫）——面板要据此换措辞 */
  normalUnknown?: boolean
  /**
   * 同构的账（`isomorphic` 专用）：识别出的同构类符号。
   * `null` = 超出本地识别范围 —— 面板照实说"未判定"，**不猜**。
   */
  isoSymbol?: string | null
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
  /**
   * 成员**背后的群元素 id**（F2，2026-10-05）。
   *
   * 为什么需要：Ω 是**另一个群对象**时（`conjOn(S_4, A_4)` 这类），
   * 成员的 label 来自那个群，按 label 在作用群里查**一个都找不到**
   * （`A_4` 的 `a` 与 `S_4` 的元素标签毫无关系）。
   * 置换群的元素 id **就是置换本身**、跨群有意义（`idsAreSelfDescribing`），
   * 所以先按 id 定位、退回 label。
   *
   * **可选**：合成点集（`pointSet(5)` / `labeledSet(a,b,c)`）与子群点没有 id。
   */
  id?: string
  /** 成员背后的子群元素集（若它是子群）*/
  subgroupElements?: GroupElement[]
}

/** 集合：群作用的作用对象 Ω，也是"列表提升"的产物。 */
export interface GalSet {
  /**
   * 上下文群（Ω 的成员取自哪里）。
   *
   * **`null` = 这批点不属于任何群**（U53 的合成点集：`pointSet(5)` / `labeledSet(a, b, c)`）。
   * 别把它退化成"取 `C_1` 当母群"：没有母群和"母群是平凡群"是两件事，
   * 前者任何 G 都能作用上去，后者会把 `G 与 Ω 来自不同的群` 那道关也一起骗过。
   */
  group: Group | null
  /** 展示名 */
  label: string
  members: SetMember[]
  /** 由哪个对象提升而来（`asSet(S)` 的 S）*/
  from?: string
}

/* ── 代数结构（集合 + 二元运算 + 公理档案）───────────────────── */

/**
 * 代数结构 —— 载体是一批点，加一张二元运算表，加一份**算出来的**公理档案。
 *
 * ## 为什么它得是一等值
 *
 * 「三阶集 + 一个运算，是群吗？」是群论/近世代数教材的**第一章主线**，
 * 而本项目从前只有"已经是群的东西"（core `Group` 公理写死）——用户拿着一张
 * 乘法表却无处可去。结构把这半步补上：先是一张**待检的表**，够格成群时才
 * **升格**为 core `Group`（`group` 是缓存指针，**不是第二个对象**）。
 *
 * ## 与 `GalSet` 的关系
 *
 * `carrier` 就是既有「集合」的一批成员（`SetMember`），不是新物种；
 * 结构 = 载体 + 运算 + 档案。所以"凭空造点集 → 给它一个运算"这条路是通的
 * （载体不要求有母群，`pointSet(3)` 合法）。
 */
export interface GalStructure {
  /** 载体（就是既有「集合」的一批成员，不是新物种）*/
  carrier: SetMember[]
  /** 载体来自哪个集合对象（来源线）*/
  carrierFrom?: string
  /** 二元运算：1-based 表。`table[i][j] ∈ 1..n`（见 DEVPLAN §1：与 core 同构）*/
  op: { table: number[][] }
  /** 公理档案 —— **算出来的** */
  axioms: AxiomProfile
  /** 够格成群时的 core `Group`（升格缓存，**不是第二个对象**）*/
  group?: Group
  /**
   * 单位群 U(M) —— 全体可逆元（`axioms.units`）构成的群。
   * 已群时 = 自身（即 `group`）；`units` 不构成群时为 undefined。
   * **缓存指针，不是第二个对象**。它把"非群"接回群论。
   */
  unitGroup?: Group
}

/* ── 值 ─────────────────────────────────────────────────── */

export type GalValue =
  | { type: 'group'; group: Group }
  | { type: 'elements'; group: Group; elements: GroupElement[] }
  | { type: 'set'; set: GalSet }
  | { type: 'subgroups'; group: Group; subgroups: NormalizedSubgroup[] }
  | { type: 'map'; map: GalMap }
  | { type: 'action'; action: GalAction }
  | { type: 'relation'; relation: GalRelation }
  | { type: 'number'; label: string; value: number }
  | { type: 'structure'; structure: GalStructure }

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
    case 'relation':
      // 上下文的"主场"是母群（子群是它的内部结构）
      return v.relation.to
    case 'number':
      return null
    case 'structure':
      // 够格成群才有上下文群；非群结构（原群 / 半群 / 幺半群）没有
      // —— 别拿 `C_1` 兜底，那会骗过"G 与 Ω 来自不同的群"那道关。
      return v.structure.group ?? null
  }
}

/**
 * 画布形状 —— **由存在层级（`sortOf`）派生**，不再各自 switch 一遍。
 *
 * 这是本轮的关键修正：从前 `elements` 与 `subgroups` 都落到 `'set'`，
 * 画布上"集合对象"与"子群列表"长得一样。现在判据只有一条。
 *
 * **S2c 新增第四档 `'structure'`**（DEVPLAN §11.1，D3 已修正）：
 * 非群的代数结构（原群 / 半群 / 幺半群）画成**双线圆** —— 它还是"一个集合，
 * 只是里面装了个运算"，内环就是这个意思；够格成群时**与群同款**（方，描边透明）。
 * 所以"升格"在屏幕上的可见形式是**内环消失 + 圆变方**。
 */
export type CanvasShape = 'group' | 'set' | 'structure' | 'action' | 'edge' | 'none'

export function canvasShape(v: GalValue): CanvasShape {
  switch (sortOf(v)) {
    case 'list':
    case 'scalar':
      return 'none'
    case 'edge':
      // 两种边都不占节点：映射画 `G → H`，作用画 `G ↷ Ω`。
      // 作用的目标节点是它的 Ω —— 由 derive 找（或造）出来（DIAGRAM_SPEC §6.4 第 1 条）。
      return 'edge'
    case 'vertex':
      if (v.type === 'group') return 'group'
      /*
       * 结构：够格成群 ⇒ 与群同款（方）；否则 ⇒ 双线圆（§11.1）。
       *
       * ⚠️ 判据走 `isGroupStructure`（**不是** `v.structure.group != null`）——
       * §11.6 要求"画布形状 / `paramAccepts('group')` / 菜单里列不列 `Sub` /
       * `structureToGroup` 非 null"是**同一个函数**。拿缓存指针 `group` 判，
       * 就又多了一份判据（缓存没填上时形状与菜单会打架）。
       */
      if (v.type === 'structure') return isGroupStructure(v.structure) ? 'group' : 'structure'
      return 'set'
  }
}

/** 画布上是否呈现为**节点**（群 / 集合 / 非群结构；映射与作用都是边）。 */
export function isCanvasValue(v: GalValue): boolean {
  const s = canvasShape(v)
  return s === 'group' || s === 'set' || s === 'structure'
}
