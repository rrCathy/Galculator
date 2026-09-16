import {
  binomialMod,
  buildSubgroupGroup,
  closeUnderMultiply,
  commutatorClosure,
  computeConjugationPerms,
  computeFixedPoints,
  computeImageFromMapping,
  computeKernelFromMapping,
  computeLeftTranslationPerms,
  computeOrbits,
  computeQuotientGroup,
  computeStabilizers,
  createAutomorphismGroup,
  createDirectProduct,
  elementOrder,
  factorizeOrder,
  findAllNormalSubgroups,
  findAllPSubgroups,
  findAllSubgroups,
  findSylowSubgroups,
  getCentralizer,
  getGroupCenter,
  getNormalizer,
  isSubgroupElementSet,
  resolveElement,
  subgroupFromElementIds,
  subgroupSetKey,
  subgroupStructureSymbol,
  type Group,
  type GroupElement,
  type HomomorphismMap,
  type Subgroup,
} from '@groupviz/core'
import { prettySymbol, subscript, superscript } from './pretty'
import {
  normalizeSubgroups,
  type GalAction,
  type GalMap,
  type GalValue,
  type ValueType,
} from './value'

/* ── 机制（架构 §3）：回答"操作怎么造出来" ────────────────── */

export type Mechanism =
  | 'atomic' // 原子构造：只能给定
  | 'action' // 作用导出：一个作用 × {轨道, 稳定子}
  | 'enumerate' // 枚举 + 筛
  | 'iterate' // 迭代：导出 + 终止条件
  | 'property' // 属性库：从对象读属性
  | 'arithmetic' // 算术库：纯数值
  | 'identify' // 识别：收集属性 + 匹配小群库

export const MECHANISM_LABEL: Record<Mechanism, string> = {
  atomic: '原子构造',
  action: '作用导出',
  enumerate: '枚举 + 筛',
  iterate: '迭代',
  property: '属性',
  arithmetic: '算术',
  identify: '识别',
}

export const MECHANISM_ORDER: Mechanism[] = [
  'atomic',
  'action',
  'enumerate',
  'iterate',
  'property',
  'arithmetic',
  'identify',
]

/* ── 参数与结果协议 ────────────────────────────────────── */

/**
 * 参数类型（交互模型 §4.1 的地基）。
 *
 * 与 `ValueType` 不完全同构，因为注册表要回答的是
 * **"用户选中画布上的什么，就能把这个参数填上"**：
 *
 * | 类型 | 画布上能填 | 说明 |
 * |---|---|---|
 * | `group` | 群节点 | |
 * | `subset` | 圆节点（元素集 / 子群集）| 也接受**群节点**——但限于"它是本操作前面某个参数的子群"（故需前缀上下文）|
 * | `action` | 作用节点 | |
 * | `map` | — | 映射不占节点，只画边（U3 对象编辑器接入后由它提供）|
 * | `element` | ✗ | **标量**：元素记号（id / label / 循环记号 `(123)`），由操作自行 `resolveElement` |
 * | `prime` | ✗ | **标量**：素数 |
 * | `int` | ✗ | **标量**：整数 |
 *
 * 约定：**标量参数只能排在参数表末尾**。`opsFor` 依赖这条做前缀匹配
 * ——前缀填不上的对象参数意味着"还得多选一个节点"，而末尾的标量参数
 * 可以由用户后续在输入框里补。
 */
export type ParamType = 'group' | 'subset' | 'action' | 'map' | 'element' | 'prime' | 'int'

/** 画布上选不出来的参数（须由文本 / 编辑器补），`opsFor` 视作"可后补"。 */
export const SCALAR_PARAM_TYPES: ParamType[] = ['element', 'prime', 'int']

export function isScalarParam(t: ParamType): boolean {
  return SCALAR_PARAM_TYPES.includes(t)
}

/** 命名参数——三个入口（径向菜单 / 工具条 / 操作表）共用的一张声明。 */
export interface OpParam {
  name: string
  type: ParamType
  optional?: boolean
}

/**
 * 一个已解析的参数。
 *
 * 三种形态：
 *   - `object`  引用了对象表里的一个值（或嵌套表达式的结果）
 *   - `number`  整数字面量，如 `pSub(G, 2)` 的 `2`
 *   - `literal` 既不是对象也不是数字的裸记号，如 `ord(G, r2)` 的 `r2`
 *
 * `sources` 是**来源线的唯一来源**：参数链上所有具名对象 id 的并集。
 */
export type OpArg =
  | { kind: 'object'; value: GalValue; text: string; ref?: string; sources: string[] }
  | { kind: 'number'; num: number; text: string; sources: string[] }
  | { kind: 'literal'; text: string; sources: string[] }

export type OpOutcome =
  | { ok: true; value: GalValue; label: string; sub?: string; note?: string }
  | { ok: false; error: string; hint?: string }

export interface OpDef {
  /** 注册表 id —— Proof Spec 的 `compute.op` 引用的就是它 */
  id: string
  /** 面向用户的记法 */
  notation: string
  mechanism: Mechanism
  /** 是否 §3 的 10 个原语之一 */
  primitive: boolean
  doc: string
  /** 配方：等价的原语复合。**元数据，只用于解释，不参与求值**（架构 §9） */
  recipe?: string
  /** core 落点 */
  impl: string
  /** 函数式调用名（大小写不敏感） */
  call?: string[]
  /** 中缀符号（输入规范化之后的形态） */
  infix?: string[]
  /**
   * 命名参数 + 类型 —— `opsFor(selection)` 的全部依据。
   * 长度必须等于 `arity + (optional ?? 0)`（模块加载时断言）。
   */
  params: OpParam[]
  /** 必需参数个数 */
  arity: number
  /** 末尾可选参数个数 */
  optional?: number
  /** 产出值类型 */
  result: ValueType
  run: (args: OpArg[]) => OpOutcome
}

/* ── 参数辅助 ──────────────────────────────────────────── */

const fail = (error: string, hint?: string): OpOutcome => ({ ok: false, error, hint })

function groupOf(a: OpArg | undefined): Group | null {
  if (!a || a.kind !== 'object') return null
  return a.value.type === 'group' ? a.value.group : null
}

function elementsOf(a: OpArg | undefined): { group: Group; elements: GroupElement[] } | null {
  if (!a || a.kind !== 'object') return null
  const v = a.value
  if (v.type === 'elements') return { group: v.group, elements: v.elements }
  if (v.type === 'group') return { group: v.group, elements: v.group.elements }
  return null
}

/**
 * 集合读法（`ParamType` 的 `subset`）：元素集 / 恰好一个子群的子群集 / 群本身。
 *
 * 群对象也接受——因为 `Z(G)` 这类子群已升级为真群对象（`buildSubgroupGroup`），
 * 用户手上拿到的就是一个「群」。是不是合法子群由调用方用 core 校验。
 */
function subgroupArgOf(a: OpArg | undefined): { group: Group; elements: GroupElement[] } | null {
  if (!a || a.kind !== 'object') return null
  const v = a.value
  if (v.type === 'elements') return { group: v.group, elements: v.elements }
  if (v.type === 'group') return { group: v.group, elements: v.group.elements }
  if (v.type === 'subgroups' && v.subgroups.length === 1) {
    return { group: v.group, elements: v.subgroups[0].elements }
  }
  return null
}

function intOf(a: OpArg | undefined): number | null {
  if (!a || a.kind !== 'number') return null
  return Number.isInteger(a.num) ? a.num : null
}

function textOf(a: OpArg | undefined): string {
  return a ? a.text : ''
}

/**
 * 参数在**定义行里的写法**：优先对象名，退回展示标签。
 *
 * 组合出来的标签要塞进画布节点（圆形节点直径有上限），
 * 所以集合运算 / 闭包这类会拼接多个参数的操作用它，得到 `Z ∩ C` 而不是
 * `Z(D₄) ∩ [D₄, D₄]`。
 */
function refText(a: OpArg | undefined): string {
  if (!a) return ''
  return a.kind === 'object' ? (a.ref ?? a.text) : a.text
}

/** 素数校验：恰好一个素因子 ⇔ 素数的幂；这里要求 p 本身是素数。 */
function checkPrime(p: number, notation: string): string | null {
  if (p < 2) return `${notation} 的 p 必须 ≥ 2`
  if (factorizeOrder(p).length !== 1 || factorizeOrder(p)[0].exponent !== 1) {
    return `${notation} 要求 p 是素数，收到 ${p}`
  }
  return null
}

/** 元素记号 hint：列出群里的元素，解析不到时给用户看。 */
function elementListHint(group: Group, cap = 24): string {
  const labels = group.elements.map((e) => e.label)
  const head = labels.slice(0, cap).join(', ')
  return labels.length > cap ? `${head}, …, 共 ${labels.length} 个` : head
}

/** 元素参数 → 群元素：走 core `resolveElement`，接受 id / label / value / **循环记号**（`(123)`）。 */
function elementArgOf(a: OpArg | undefined, group: Group): GroupElement | null {
  if (!a) return null
  if (a.kind === 'object') {
    const v = a.value
    if (v.type === 'elements' && v.elements.length === 1) return resolveElement(group, v.elements[0].id)
    return null
  }
  return resolveElement(group, a.text)
}

/** 两个集合是否来自同一个群：引用相等最快，否则看符号 + 阶（重建的 `A_4` 视作同群）。 */
function sameGroup(a: Group, b: Group): boolean {
  if (a === b) return true
  return a.symbol === b.symbol && a.order === b.order
}

/** 子群的结构符号（`C_2×C_2` / `S_3`）展示形态；识别不出返回 null。 */
function structureHint(parent: Group, elements: GroupElement[]): string | null {
  const s = subgroupStructureSymbol(
    parent,
    elements.map((e) => e.id),
  )
  return s ? prettySymbol(s) : null
}

/** 节点副行的结构后缀（` · C₂`）；识别不出时为空串，不留脏尾巴。 */
function structSuffix(parent: Group, elements: GroupElement[]): string {
  const s = structureHint(parent, elements)
  return s ? ` · ${s}` : ''
}

/**
 * 元素集 → **真群对象**（core `buildSubgroupGroup`）。
 *
 * 交互模型 §2：「类型改变是最强视觉信号」。`Z(G)` / `[G,G]` / `⟨S⟩` / `ker f`
 * 这类子群不再是圆形的集合，而是方形的群对象——于是 `Z(Z(G))` 合法。
 * 元素沿用母群对象（id 一致），故子群判定 / 商群 / 集合运算仍能对齐。
 */
function subgroupGroupOf(parent: Group, elements: GroupElement[], fallbackLabel: string): Group {
  return buildSubgroupGroup(
    parent,
    elements,
    subgroupStructureSymbol(
      parent,
      elements.map((e) => e.id),
    ) ?? fallbackLabel,
  )
}

/**
 * 校验并装配 core 的 `Subgroup`：先过 `subgroupFromElementIds`（含单位元 + 乘法封闭），
 * 再补 core 未给的正规性判定（同 `findAllNormalSubgroups` 的集合键比对）。
 * 非法集合（空 / 无单位元 / 不封闭）返回 `null`。
 */
function asCoreSubgroup(group: Group, elements: GroupElement[]): Subgroup | null {
  const checked = subgroupFromElementIds(
    group,
    elements.map((e) => e.id),
  )
  if (!checked) return null
  const key = subgroupSetKey(checked.elements.map((e) => e.id))
  const isNormal = findAllNormalSubgroups(group).some(
    (n) => subgroupSetKey(n.elements.map((e) => e.id)) === key,
  )
  return { ...checked, isNormal }
}

/** 精确组合数（BigInt，避免 n 到 2000 量级时溢出）。 */
function chooseExact(n: number, k: number): bigint {
  if (k < 0 || n < 0 || k > n) return 0n
  let r = 1n
  for (let i = 1; i <= k; i++) r = (r * BigInt(n - k + i)) / BigInt(i)
  return r
}

/* ── 作用取值辅助 ──────────────────────────────────────── */

function actionOf(a: OpArg | undefined): GalAction | null {
  if (!a || a.kind !== 'object') return null
  return a.value.type === 'action' ? a.value.action : null
}

function mapArgOf(a: OpArg | undefined): GalMap | null {
  if (!a || a.kind !== 'object') return null
  return a.value.type === 'map' ? a.value.map : null
}

/**
 * Ω 中某记号对应的下标。Ω = G 本身时元素记号走 `resolveElement`
 * （于是 `(123)` / `123` / `…,+1,+2,+3` 都能命中同一个元素）。
 */
function omegaIndexOf(A: GalAction, text: string): number {
  if (A.setLabels && A.setLabels.length > 0) return A.setLabels.indexOf(text)
  const el = resolveElement(A.group, text)
  if (!el) return -1
  return A.group.elements.findIndex((e) => e.id === el.id)
}

function omegaLabels(A: GalAction): string[] {
  if (A.setLabels && A.setLabels.length > 0) return A.setLabels
  return A.group.elements.map((e) => e.label)
}

/** Ω 上的下标集合 → G 的元素数组。Ω 不是 G 本身时返回 null。 */
function omegaElements(A: GalAction, indices: number[]): GroupElement[] | null {
  if (A.setLabels && A.setLabels.length > 0) return null
  return indices.map((i) => A.group.elements[i]).filter(Boolean)
}

const COSET_OMEGA_HINT = 'Ω 是陪集而非 G 的元素；陪集视图接入后再支持'

/* ── 集合运算 ──────────────────────────────────────────── */

type SetOpKind = '∩' | '∪' | '\\' | '·'

/**
 * 集合运算的母群推断：只有 `elements` / `subgroups` 值携带**真正的母群**；
 * 群对象（子群升级而来）的 `group` 是它自己，符号是子群的结构符号，不作数。
 */
function parentGroupOf(a: OpArg | undefined): Group | null {
  if (!a || a.kind !== 'object') return null
  const v = a.value
  return v.type === 'elements' || v.type === 'subgroups' ? v.group : null
}

/**
 * 交 / 并 / 差 / 积集（架构 §5.2）。机制归「原子构造」——由给定集合直接算出新集合。
 *
 * 两条约束：
 * - 两边若都带着母群，必须是同一个群（否则 id 相同也不是同一个元素，会静默算错）；
 * - 积集走**母群乘法**，所以也要求母群可知（都不可知时退回元素 id 去重）。
 *
 * 产出 `elements`（不是群）：**固化出来的集合不自动升级**（决策 ⑤）——
 * 若它恰好是子群，再由用户用 `⟨S⟩` 或升级入口认可。
 */
function setOp(a: OpArg[], kind: SetOpKind): OpOutcome {
  const A = subgroupArgOf(a[0])
  const B = subgroupArgOf(a[1])
  if (!A || !B) {
    return fail(`${kind} 需要两个集合`, '可传元素集、恰含一个子群的子群集，或子群群对象')
  }
  const pa = parentGroupOf(a[0])
  const pb = parentGroupOf(a[1])
  if (pa && pb && !sameGroup(pa, pb)) {
    return fail(`${kind} 的两边来自不同的群`, `${prettySymbol(pa.symbol)} 与 ${prettySymbol(pb.symbol)}`)
  }
  const group = pa ?? pb ?? A.group
  const idsA = new Set(A.elements.map((e) => e.id))
  const idsB = new Set(B.elements.map((e) => e.id))

  let els: GroupElement[]
  switch (kind) {
    case '∩':
      els = A.elements.filter((e) => idsB.has(e.id))
      break
    case '∪':
      els = [...A.elements, ...B.elements.filter((e) => !idsA.has(e.id))]
      break
    case '\\':
      els = A.elements.filter((e) => !idsB.has(e.id))
      break
    case '·': {
      const seen = new Set<string>()
      els = []
      for (const x of A.elements) {
        for (const y of B.elements) {
          const p = group.multiply(x, y)
          if (seen.has(p.id)) continue
          seen.add(p.id)
          els.push(p)
        }
      }
      break
    }
  }

  return {
    ok: true,
    value: { type: 'elements', group, elements: els },
    label: `${refText(a[0])} ${kind} ${refText(a[1])}`,
    sub: `|·| = ${els.length}`,
  }
}

/* ── 注册表 ───────────────────────────────────────────── */

export const OPS: OpDef[] = [
  /* ══ 原子构造 ══════════════════════════════════════════ */
  {
    id: 'directProduct',
    notation: 'A × B',
    mechanism: 'atomic',
    primitive: true,
    doc: '直积：两个群的笛卡尔积，逐分量运算',
    impl: 'createDirectProduct',
    infix: ['x'],
    call: ['直积', 'directProduct', 'product'],
    params: [
      { name: 'A', type: 'group' },
      { name: 'B', type: 'group' },
    ],
    arity: 2,
    result: 'group',
    run: (a) => {
      const A = groupOf(a[0])
      const B = groupOf(a[1])
      if (!A || !B) return fail('直积需要两个群', `如 G x H`)
      const g = createDirectProduct(A, B)
      return {
        ok: true,
        value: { type: 'group', group: g },
        label: prettySymbol(g.symbol),
        sub: `|G| = ${g.order}`,
      }
    },
  },
  {
    id: 'quotient',
    notation: 'G / N',
    mechanism: 'atomic',
    primitive: true,
    doc: '商群：把正规子群 N 的每个陪集压成一点',
    recipe: '原子构造（不归约）',
    impl: 'computeQuotientGroup',
    infix: ['/'],
    call: ['商', '商群', 'quotient'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'N', type: 'subset' },
    ],
    arity: 2,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('商需要第一个参数是群')
      const S = subgroupArgOf(a[1])
      if (!S) return fail('商需要第二个参数是子群', '可传元素集、恰含一个子群的子群集，或已是群对象的子群')
      // 用 G 作母群校验：元素 id 不在 G 里 / 不封闭 / 无单位元 → null
      const sub = asCoreSubgroup(G, S.elements)
      if (!sub) return fail(`${textOf(a[1])} 不是 ${textOf(a[0])} 的子群`, '要求含单位元且乘法封闭')
      if (!sub.isNormal) {
        return fail(`${textOf(a[1])} 不是 ${textOf(a[0])} 的正规子群`, '商群 G/N 要求 N ⊴ G')
      }
      const Q = computeQuotientGroup(G, sub)
      if (!Q) return fail('商群构造失败')
      return {
        ok: true,
        value: { type: 'group', group: Q },
        label: prettySymbol(Q.symbol),
        sub: `|G/N| = ${Q.order}`,
      }
    },
  },
  {
    id: 'conjugationAction',
    notation: '共轭作用(G)',
    mechanism: 'atomic',
    primitive: true,
    doc: 'G 通过共轭 g·x·g⁻¹ 作用在自身元素上',
    impl: 'computeConjugationPerms',
    call: ['共轭作用', 'conjAction', 'conjugation'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'action',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('共轭作用需要一个群')
      const perms = computeConjugationPerms(G)
      const action: GalAction = { group: G, kind: 'conjugation', n: G.order, perms }
      return {
        ok: true,
        value: { type: 'action', action },
        label: `共轭作用(${textOf(a[0])})`,
        sub: `|Ω| = ${G.order}`,
      }
    },
  },
  {
    id: 'leftTranslationAction',
    notation: '正则作用(G)',
    mechanism: 'atomic',
    primitive: true,
    doc: 'G 通过左乘作用在自身元素上（Cayley 正则表示）',
    impl: 'computeLeftTranslationPerms',
    call: ['正则作用', '左正则作用', 'leftAction'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'action',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('正则作用需要一个群')
      const perms = computeLeftTranslationPerms(G)
      const action: GalAction = { group: G, kind: 'leftTranslation', n: G.order, perms }
      return {
        ok: true,
        value: { type: 'action', action },
        label: `正则作用(${textOf(a[0])})`,
        sub: `|Ω| = ${G.order}`,
      }
    },
  },
  {
    id: 'automorphismGroup',
    notation: 'Aut(G)',
    mechanism: 'atomic',
    primitive: false,
    doc: '自同构群：G 到自身的同构全体',
    recipe: '筛( 枚举(G, 自同构), ⊤ )',
    impl: 'createAutomorphismGroup',
    call: ['Aut', '自同构群', 'aut'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('Aut(·) 需要一个群')
      const A = createAutomorphismGroup(G)
      if (!A) return fail(`${textOf(a[0])} 的自同构群太大，本地算不了`, '待后端 GAP 通道')
      return {
        ok: true,
        value: { type: 'group', group: A },
        label: prettySymbol(A.symbol),
        sub: `|Aut| = ${A.order}`,
      }
    },
  },
  {
    id: 'intersection',
    notation: 'A ∩ B',
    mechanism: 'atomic',
    primitive: true,
    doc: '交：同时属于两个集合的元素',
    impl: '本地元素集运算',
    infix: ['∩'],
    call: ['交', '交集', 'intersection', 'intersect'],
    params: [
      { name: 'A', type: 'subset' },
      { name: 'B', type: 'subset' },
    ],
    arity: 2,
    result: 'elements',
    run: (a) => setOp(a, '∩'),
  },
  {
    id: 'union',
    notation: 'A ∪ B',
    mechanism: 'atomic',
    primitive: true,
    doc: '并：属于两个集合中至少一个的元素',
    impl: '本地元素集运算',
    infix: ['∪'],
    call: ['并', '并集', 'union'],
    params: [
      { name: 'A', type: 'subset' },
      { name: 'B', type: 'subset' },
    ],
    arity: 2,
    result: 'elements',
    run: (a) => setOp(a, '∪'),
  },
  {
    id: 'difference',
    notation: 'A \\ B',
    mechanism: 'atomic',
    primitive: true,
    doc: '差：属于 A 但不属于 B 的元素',
    impl: '本地元素集运算',
    infix: ['\\', '∖'],
    call: ['差', '差集', 'difference', 'minus'],
    params: [
      { name: 'A', type: 'subset' },
      { name: 'B', type: 'subset' },
    ],
    arity: 2,
    result: 'elements',
    run: (a) => setOp(a, '\\'),
  },
  {
    id: 'productSet',
    notation: 'A · B',
    mechanism: 'atomic',
    primitive: true,
    doc: '积集：{ab : a ∈ A, b ∈ B}（子群时 |A·B| = |A||B| / |A∩B|）',
    impl: '本地元素集运算（母群乘法）',
    infix: ['·'],
    call: ['积集', 'productSet', 'setProduct'],
    params: [
      { name: 'A', type: 'subset' },
      { name: 'B', type: 'subset' },
    ],
    arity: 2,
    result: 'elements',
    run: (a) => setOp(a, '·'),
  },

  /* ══ 作用导出 ══════════════════════════════════════════ */
  {
    id: 'center',
    notation: 'Z(G)',
    mechanism: 'action',
    primitive: false,
    doc: '中心：与 G 中所有元素都交换的元素',
    recipe: '不动点( 共轭作用(G) )',
    impl: 'getGroupCenter → buildSubgroupGroup',
    call: ['Z', '中心', 'center'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('Z(·) 需要一个群')
      const els = getGroupCenter(G)
      return {
        ok: true,
        value: { type: 'group', group: subgroupGroupOf(G, els, `Z(${textOf(a[0])})`) },
        label: `Z(${textOf(a[0])})`,
        sub: `|Z| = ${els.length}${structSuffix(G, els)}`,
      }
    },
  },
  {
    id: 'centralizer',
    notation: 'C_G(S)',
    mechanism: 'action',
    primitive: false,
    doc: '中心化子：与 S 中每个元素都交换的元素',
    recipe: '稳定子( 共轭作用(G), S )',
    impl: 'getCentralizer → buildSubgroupGroup',
    call: ['C_G', '中心化子', 'centralizer'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'S', type: 'subset' },
    ],
    arity: 2,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('C_G(·) 的第一个参数必须是群')
      const S = elementsOf(a[1])
      if (!S) return fail('C_G(·) 的第二个参数必须是元素集或群')
      const els = getCentralizer(G, S.elements)
      return {
        ok: true,
        value: { type: 'group', group: subgroupGroupOf(G, els, `C(${textOf(a[1])})`) },
        label: `C(${textOf(a[1])})`,
        sub: `|C| = ${els.length}${structSuffix(G, els)}`,
      }
    },
  },
  {
    id: 'normalizer',
    notation: 'N_G(H)',
    mechanism: 'action',
    primitive: false,
    doc: '正规化子：使 gHg⁻¹ = H 的元素 g 全体',
    recipe: '稳定子( 共轭作用在子群集(G), H )',
    impl: 'getNormalizer → buildSubgroupGroup',
    call: ['N_G', '正规化子', 'normalizer'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'H', type: 'subset' },
    ],
    arity: 2,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('N_G(·) 的第一个参数必须是群')
      const S = subgroupArgOf(a[1])
      if (!S) return fail('N_G(·) 的第二个参数必须是子群')
      const els = getNormalizer(G, S.elements)
      return {
        ok: true,
        value: { type: 'group', group: subgroupGroupOf(G, els, `N(${textOf(a[1])})`) },
        label: `N(${textOf(a[1])})`,
        sub: `|N| = ${els.length}${structSuffix(G, els)}`,
      }
    },
  },
  {
    id: 'orbits',
    notation: '轨道(A, x)',
    mechanism: 'action',
    primitive: true,
    doc: 'x 在作用 A 下的轨道：x 能到达的全部点',
    impl: 'computeOrbits',
    call: ['轨道', 'orbits', 'orb'],
    params: [
      { name: 'A', type: 'action' },
      { name: 'x', type: 'element' },
    ],
    arity: 2,
    result: 'elements',
    run: (a) => {
      const A = actionOf(a[0])
      if (!A) return fail('轨道(·) 的第一个参数必须是作用', '先用 共轭作用(G) / 正则作用(G) 造一个')
      const x = textOf(a[1])
      const idx = omegaIndexOf(A, x)
      if (idx < 0) return fail(`Ω 中没有元素 ${x}`, `Ω = {${omegaLabels(A).slice(0, 24).join(', ')}}`)
      const { orbits, orbitOf } = computeOrbits(A.perms, A.n)
      const members = orbits[orbitOf[idx]]?.elements ?? []
      const els = omegaElements(A, members)
      if (!els) return fail('陪集作用的轨道暂不支持', COSET_OMEGA_HINT)
      return {
        ok: true,
        value: { type: 'elements', group: A.group, elements: els },
        label: `Orb(${x})`,
        sub: `|Orb| = ${members.length}`,
      }
    },
  },
  {
    id: 'stabilizers',
    notation: '稳定子(A, x)',
    mechanism: 'action',
    primitive: true,
    doc: 'x 的稳定子：使 g·x = x 的元素 g 全体',
    impl: 'computeStabilizers',
    call: ['稳定子', 'stabilizer', 'stab'],
    params: [
      { name: 'A', type: 'action' },
      { name: 'x', type: 'element' },
    ],
    arity: 2,
    result: 'elements',
    run: (a) => {
      const A = actionOf(a[0])
      if (!A) return fail('稳定子(·) 的第一个参数必须是作用')
      const x = textOf(a[1])
      const idx = omegaIndexOf(A, x)
      if (idx < 0) return fail(`Ω 中没有元素 ${x}`, `Ω = {${omegaLabels(A).slice(0, 24).join(', ')}}`)
      const stabs = computeStabilizers(A.group, A.perms, A.n)
      const ids = new Set(stabs.get(idx) ?? [])
      const els = A.group.elements.filter((e) => ids.has(e.id))
      return {
        ok: true,
        value: { type: 'elements', group: A.group, elements: els },
        label: `Stab(${x})`,
        sub: `|Stab| = ${els.length}`,
      }
    },
  },
  {
    id: 'fixedPoints',
    notation: '不动点(A)',
    mechanism: 'action',
    primitive: false,
    doc: '作用的全部不动点',
    recipe: '轨道 的长度 1 特例',
    impl: 'computeFixedPoints',
    call: ['不动点', 'fix', 'fixedPoints'],
    params: [{ name: 'A', type: 'action' }],
    arity: 1,
    result: 'elements',
    run: (a) => {
      const A = actionOf(a[0])
      if (!A) return fail('不动点(·) 需要作用')
      const pts = computeFixedPoints(A.perms, A.n)
      const els = omegaElements(A, pts)
      if (!els) return fail('陪集作用的不动点暂不支持', COSET_OMEGA_HINT)
      return {
        ok: true,
        value: { type: 'elements', group: A.group, elements: els },
        label: `Fix(A)`,
        sub: `|Fix| = ${pts.length}`,
      }
    },
  },
  {
    id: 'kernel',
    notation: 'ker f',
    mechanism: 'action',
    primitive: false,
    doc: '核：被 f 映到单位元的元素全体',
    recipe: '稳定子( 诱导作用(f), e )',
    impl: 'computeKernelFromMapping → buildSubgroupGroup',
    call: ['ker', '核', 'kernel'],
    params: [{ name: 'f', type: 'map' }],
    arity: 1,
    result: 'group',
    run: (a) => {
      const M = mapArgOf(a[0])
      if (!M) return fail('ker(·) 需要一个映射对象', '映射由对象编辑器产出（U3）')
      if (!M.mapping) return fail('该映射没有完整映射表', '生成元的像不足以定核，需编辑器补全（U3）')
      const ids = new Set(computeKernelFromMapping(M.domain, M.mapping, M.codomain.identity.id))
      const els = M.domain.elements.filter((e) => ids.has(e.id))
      return {
        ok: true,
        value: { type: 'group', group: subgroupGroupOf(M.domain, els, `ker(${textOf(a[0])})`) },
        label: `ker(${textOf(a[0])})`,
        sub: `|ker| = ${els.length}`,
      }
    },
  },
  {
    id: 'image',
    notation: 'im f',
    mechanism: 'action',
    primitive: false,
    doc: '像：f 的取值全体（⊆ 靶群）',
    recipe: '轨道( 诱导作用(f), e )',
    impl: 'computeImageFromMapping → buildSubgroupGroup',
    call: ['im', '像', 'image'],
    params: [{ name: 'f', type: 'map' }],
    arity: 1,
    result: 'group',
    run: (a) => {
      const M = mapArgOf(a[0])
      if (!M) return fail('im(·) 需要一个映射对象', '映射由对象编辑器产出（U3）')
      if (!M.mapping) return fail('该映射没有完整映射表', '生成元的像不足以定像，需编辑器补全（U3）')
      const ids = new Set(computeImageFromMapping(M.mapping))
      const els = M.codomain.elements.filter((e) => ids.has(e.id))
      return {
        ok: true,
        value: { type: 'group', group: subgroupGroupOf(M.codomain, els, `im(${textOf(a[0])})`) },
        label: `im(${textOf(a[0])})`,
        sub: `|im| = ${els.length}`,
      }
    },
  },

  /* ══ 枚举 + 筛 ════════════════════════════════════════ */
  {
    id: 'subgroups',
    notation: 'Sub(G)',
    mechanism: 'enumerate',
    primitive: true,
    doc: 'G 的全部子群',
    recipe: '筛( 枚举(G, 子群), ⊤ )',
    impl: 'findAllSubgroups',
    call: ['Sub', '子群', 'subgroups'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'subgroups',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('Sub(·) 需要一个群')
      const subs = normalizeSubgroups(findAllSubgroups(G), G)
      return {
        ok: true,
        value: { type: 'subgroups', group: G, subgroups: subs },
        label: `Sub(${textOf(a[0])})`,
        sub: `${subs.length} 个子群`,
      }
    },
  },
  {
    id: 'pSubgroups',
    notation: 'pSub(G, p)',
    mechanism: 'enumerate',
    primitive: false,
    doc: 'G 的全部 p-子群（阶为 p 的幂）',
    recipe: '筛( 枚举(G, 子群), 阶 = p^k )',
    impl: 'findAllPSubgroups',
    call: ['pSub', 'p子群', 'psub'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'p', type: 'prime' },
    ],
    arity: 2,
    result: 'subgroups',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('pSub(·) 的第一个参数必须是群')
      const p = intOf(a[1])
      if (p === null) return fail('pSub(·) 的第二个参数必须是整数')
      const bad = checkPrime(p, 'pSub')
      if (bad) return fail(bad)
      const subs = normalizeSubgroups(findAllPSubgroups(G, p), G)
      return {
        ok: true,
        value: { type: 'subgroups', group: G, subgroups: subs },
        label: `pSub(${textOf(a[0])}, ${p})`,
        sub: `${subs.length} 个 ${p}-子群`,
      }
    },
  },
  {
    id: 'sylow',
    notation: 'Syl_p(G)',
    mechanism: 'enumerate',
    primitive: false,
    doc: 'Sylow p-子群：阶恰为 p^k 的极大 p-子群',
    recipe: '筛( 枚举(G, 子群), p-群 ∧ 极大 )',
    impl: 'findSylowSubgroups',
    call: ['Syl', 'Sylow', 'sylow', 'Syl_p'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'p', type: 'prime' },
    ],
    arity: 2,
    result: 'subgroups',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('Syl_p(·) 的第一个参数必须是群')
      const p = intOf(a[1])
      if (p === null) return fail('Syl_p(·) 的第二个参数必须是整数')
      const bad = checkPrime(p, 'Syl_p')
      if (bad) return fail(bad)
      const subs = normalizeSubgroups(findSylowSubgroups(G, p), G)
      const order = subs[0]?.order ?? 1
      return {
        ok: true,
        value: { type: 'subgroups', group: G, subgroups: subs },
        label: `Syl(${textOf(a[0])}, ${p})`,
        sub: `n${subscript(String(p))} = ${subs.length}，阶 ${order}`,
      }
    },
  },
  {
    id: 'normalSubgroups',
    notation: '正规子群(G)',
    mechanism: 'enumerate',
    primitive: false,
    doc: 'G 的全部正规子群',
    recipe: '筛( 枚举(G, 子群), 正规 )',
    impl: 'findAllNormalSubgroups',
    call: ['正规子群', 'normalSubgroups', 'SubNormal'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'subgroups',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('正规子群(·) 需要一个群')
      const subs = normalizeSubgroups(findAllNormalSubgroups(G), G)
      return {
        ok: true,
        value: { type: 'subgroups', group: G, subgroups: subs },
        label: `正规子群(${textOf(a[0])})`,
        sub: `${subs.length} 个正规子群`,
      }
    },
  },

  /* ══ 迭代 ══════════════════════════════════════════════ */
  {
    id: 'commutatorGroup',
    notation: '[G, G]',
    mechanism: 'iterate',
    primitive: false,
    doc: '换位子群：全部换位子 [g,h] 生成的子群',
    recipe: '闭包( 换位子集(G) ) = 迭代(乘法, 直到封闭)',
    impl: 'commutatorClosure → buildSubgroupGroup',
    call: ['换位子群', 'commutator'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('换位子群(·) 需要一个群')
      const els = commutatorClosure(G, G.elements, G.elements)
      const t = textOf(a[0])
      return {
        ok: true,
        value: { type: 'group', group: subgroupGroupOf(G, els, `[${t},${t}]`) },
        label: `[${t}, ${t}]`,
        sub: `|[G,G]| = ${els.length}${structSuffix(G, els)}`,
      }
    },
  },
  {
    id: 'closure',
    notation: '⟨S⟩',
    mechanism: 'iterate',
    primitive: false,
    doc: '生成子群：把 S 在乘法下反复闭合到不再增长；也可写 ⟨G, (123), (12)⟩ 从记号生成',
    recipe: '迭代(乘法, 直到封闭)',
    impl: 'closeUnderMultiply → buildSubgroupGroup',
    call: ['⟨⟩', '闭包', '生成子群', 'closure', 'generate'],
    params: [
      { name: 'S', type: 'subset' },
      { name: 'g₁', type: 'element', optional: true },
      { name: 'g₂', type: 'element', optional: true },
      { name: 'g₃', type: 'element', optional: true },
    ],
    arity: 1,
    optional: 3,
    result: 'group',
    run: (a) => {
      const G0 = groupOf(a[0])
      let group: Group
      let seeds: GroupElement[]
      let genTexts: string[]
      if (G0) {
        // ⟨G, g₁, …⟩：G 只当上下文群（用来解析后面的元素记号），种子全来自元素参数
        group = G0
        seeds = []
        genTexts = a.slice(1).map(refText)
      } else {
        const S = subgroupArgOf(a[0])
        if (!S) return fail('⟨S⟩ 需要一个集合', '也可写 ⟨G, g₁, g₂⟩：群在前当上下文，后面填元素记号')
        group = S.group
        seeds = [...S.elements]
        genTexts = a.map(refText)
      }
      // 第 0 个参数已经当过"种子来源"了（集合模式），元素参数一律从 1 号位起
      for (let i = 1; i < a.length; i++) {
        const el = elementArgOf(a[i], group)
        if (!el) {
          return fail(`${group.symbol} 中没有元素 ${textOf(a[i])}`, `元素：${elementListHint(group)}`)
        }
        seeds.push(el)
      }
      if (seeds.length === 0) seeds = [group.identity]

      const els = closeUnderMultiply(group, seeds)
      const label = genTexts.length > 0 ? `⟨${genTexts.join(', ')}⟩` : '⟨⟩'
      return {
        ok: true,
        value: { type: 'group', group: subgroupGroupOf(group, els, label) },
        label,
        sub: `|⟨S⟩| = ${els.length}${structSuffix(group, els)}`,
      }
    },
  },

  /* ══ 属性 ══════════════════════════════════════════════ */
  {
    id: 'elementOrder',
    notation: 'ord(G, g)',
    mechanism: 'property',
    primitive: false,
    doc: '元素 g 的阶：使 gⁿ = e 的最小正整数 n',
    impl: 'elementOrder',
    call: ['ord', '元素阶', 'order'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'g', type: 'element' },
    ],
    arity: 2,
    result: 'number',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('ord(·) 的第一个参数必须是群')
      const txt = textOf(a[1])
      const el = resolveElement(G, txt)
      if (!el) return fail(`${textOf(a[0])} 中没有元素 ${txt}`, `元素：${elementListHint(G)}`)
      const o = elementOrder(G, el)
      return {
        ok: true,
        value: { type: 'number', label: `${o}`, value: o },
        label: `ord(${txt})`,
        sub: `= ${o}`,
      }
    },
  },

  /* ══ 算术 ══════════════════════════════════════════════ */
  {
    id: 'factorize',
    notation: '分解(n)',
    mechanism: 'arithmetic',
    primitive: false,
    doc: '整数素因子分解 n = ∏ pᵉ',
    impl: 'factorizeOrder',
    call: ['分解', 'factor', 'factorize'],
    params: [{ name: 'n', type: 'int' }],
    arity: 1,
    result: 'number',
    run: (a) => {
      const n = intOf(a[0])
      if (n === null) return fail('分解(·) 需要一个整数')
      if (n < 1) return fail('分解(·) 只接受正整数')
      const fs = factorizeOrder(n)
      const pretty = fs.map((f) => (f.exponent === 1 ? `${f.prime}` : `${f.prime}${superscript(f.exponent)}`)).join('·')
      return {
        ok: true,
        value: { type: 'number', label: pretty, value: n },
        label: `分解(${n})`,
        sub: `= ${pretty}`,
      }
    },
  },
  {
    id: 'binomial',
    notation: 'C(n, k)',
    mechanism: 'arithmetic',
    primitive: false,
    doc: '精确组合数 C(n, k)',
    impl: '本地 BigInt',
    call: ['C', '组合数', 'binomial', 'choose'],
    params: [
      { name: 'n', type: 'int' },
      { name: 'k', type: 'int' },
    ],
    arity: 2,
    result: 'number',
    run: (a) => {
      const n = intOf(a[0])
      const k = intOf(a[1])
      if (n === null || k === null) return fail('C(n, k) 需要两个整数')
      if (n < 0 || k < 0) return fail('C(n, k) 只接受非负整数')
      if (k > n) return fail(`C(${n}, ${k})：k 不能大于 n`)
      const v = chooseExact(n, k)
      return {
        ok: true,
        value: { type: 'number', label: v.toString(), value: Number(v) },
        label: `C(${n}, ${k})`,
        sub: `= ${v.toString()}`,
      }
    },
  },
  {
    id: 'binomialMod',
    notation: 'C(n, k, p)',
    mechanism: 'arithmetic',
    primitive: false,
    doc: '组合数对 p 取模（Lucas 定理），Wielandt 证明的计数段用它',
    impl: 'binomialMod',
    call: ['Cmod', '组合数模', 'binomialMod'],
    params: [
      { name: 'n', type: 'int' },
      { name: 'k', type: 'int' },
      { name: 'p', type: 'prime' },
    ],
    arity: 3,
    result: 'number',
    run: (a) => {
      const n = intOf(a[0])
      const k = intOf(a[1])
      const p = intOf(a[2])
      if (n === null || k === null || p === null) return fail('Cmod(n, k, p) 需要三个整数')
      if (p < 2) return fail('Cmod(·) 的 p 必须 ≥ 2')
      if (n < 0 || k < 0) return fail('Cmod(·) 只接受非负整数')
      const v = binomialMod(n, k, p)
      return {
        ok: true,
        value: { type: 'number', label: `${v}`, value: v },
        label: `C(${n}, ${k}) mod ${p}`,
        sub: `= ${v}`,
      }
    },
  },
]

/* ── 索引 ─────────────────────────────────────────────── */

const byId = new Map(OPS.map((o) => [o.id, o]))
const byCall = new Map<string, OpDef>()
for (const o of OPS) {
  for (const name of o.call ?? []) {
    const key = name.toLowerCase()
    if (!byCall.has(key)) byCall.set(key, o)
  }
}

/* ── 自洽检查：注册表是三个入口的唯一来源，声明错了必须早失败 ── */

for (const op of OPS) {
  const expected = op.arity + (op.optional ?? 0)
  if (op.params.length !== expected) {
    throw new Error(
      `注册表不一致：${op.id} 声明了 ${op.params.length} 个参数，` +
        `但 arity(${op.arity}) + optional(${op.optional ?? 0}) = ${expected}`,
    )
  }
  const firstScalar = op.params.findIndex((p) => isScalarParam(p.type))
  if (firstScalar >= 0 && op.params.slice(firstScalar).some((p) => !isScalarParam(p.type))) {
    throw new Error(`注册表不一致：${op.id} 的标量参数必须排在末尾（opsFor 依赖前缀匹配）`)
  }
}

export function opById(id: string): OpDef | undefined {
  return byId.get(id)
}

export function opByCall(name: string): OpDef | undefined {
  return byCall.get(name.toLowerCase())
}

/* ── opsFor：三个入口共用的一张派生 ─────────────────────── */

/**
 * 单个参数位置的类型匹配（`subset` 对群对象的放宽见 `ParamType` 注释）。
 *
 * 除 `opsFor` 外，U2 的 pending 也用它——点第二个参数时要知道"这个节点能不能当这一位"。
 */
export function paramAccepts(t: ParamType, v: GalValue, earlier: GalValue[]): boolean {
  switch (t) {
    case 'group':
      return v.type === 'group'
    case 'action':
      return v.type === 'action'
    case 'map':
      return v.type === 'map'
    case 'subset': {
      if (v.type === 'elements' || v.type === 'subgroups') return true
      if (v.type !== 'group') return false
      // 群对象当集合读。两种情形：
      //   · 本操作前面**没有**群参数（`∩` `∪` `\` `·`）——群总是可以当集合读；
      //   · 前面有群参数（`G/N`、`C_G(G,S)`）——要求它是其中某个的子群，
      //     否则 `A × B` 的 B 也会被当成集合，选中两个群就会冒出多余的候选。
      const groups = earlier.filter((e) => e.type === 'group')
      if (groups.length === 0) return true
      return groups.some(
        (e) =>
          e.type === 'group' &&
          isSubgroupElementSet(
            e.group,
            v.group.elements.map((x) => x.id),
          ),
      )
    }
    case 'element':
    case 'prime':
    case 'int':
      return false // 标量：画布上选不出来
  }
}

/**
 * 选中若干对象后可做的操作（交互模型 §4.1 的地基）。
 *
 * 三个入口（节点旁径向菜单 / 顶部工具条 / 操作表）共用它，于是
 * 「入口是死的、操作是活的、两者靠用户脑中对齐」这个根因被消掉。
 *
 * 规则：
 *   ① 选中的值按顺序逐参匹配（前缀）；
 *   ② 剩下的必需参数**必须是标量**（`element` / `prime` / `int`）——它们可由用户
 *      在输入框里补，所以不算"还缺一个对象"；
 *   ③ 需要再选一个对象参数的，不出现：选中一个群时没有 `G × H`，得再选一个群。
 *
 * 对照 §4.1 的表：选 `A₄` → `Z` / `[G,G]` / `Aut` / `Sub` / `pSub` / `Syl` /
 * `正规子群` / `共轭作用` / `正则作用`（`pSub`、`Syl` 的第二参是素数，属可补标量）；
 * 选 `A₄` + 一个子群 → 多出 `G/N`；选两个群 → 多出 `G × H`。
 */
export function opsFor(selection: GalValue[]): OpDef[] {
  if (selection.length === 0) return []
  return OPS.filter((op) => {
    if (selection.length > op.params.length) return false
    for (let i = 0; i < selection.length; i++) {
      const p = op.params[i]
      // 标量参数不能由画布提供，所以它不可能落在选中前缀里
      if (isScalarParam(p.type)) return false
      if (!paramAccepts(p.type, selection[i], selection.slice(0, i))) return false
    }
    for (let i = selection.length; i < op.params.length; i++) {
      const p = op.params[i]
      if (!p.optional && !isScalarParam(p.type)) return false
    }
    return true
  })
}

/** 中缀符号表（输入规范化之后的形态）。 */
export const INFIX_TABLE: { sym: string; op: OpDef }[] = OPS.flatMap((o) =>
  (o.infix ?? []).map((sym) => ({ sym, op: o })),
)

export const INFIX_SYMBOLS: string[] = INFIX_TABLE.map((x) => x.sym)

/** 操作面板：按机制分组（§3 的四个机制 + 三个库）。 */
export function opsByMechanism(): { mechanism: Mechanism; label: string; ops: OpDef[] }[] {
  return MECHANISM_ORDER.map((m) => ({
    mechanism: m,
    label: MECHANISM_LABEL[m],
    ops: OPS.filter((o) => o.mechanism === m),
  })).filter((g) => g.ops.length > 0)
}

/**
 * 面板点击后插进输入框的模板。
 *
 * 用具体的 `G` / `H` / `A` / 字面量，而不是 `notation` 里的占位符——
 * 占位符要用户自己翻译一遍，模板则改一处就能跑。
 */
const TEMPLATES: Record<string, string> = {
  directProduct: 'G x H',
  quotient: 'G / N',
  conjugationAction: '共轭作用(G)',
  leftTranslationAction: '正则作用(G)',
  automorphismGroup: 'Aut(G)',
  intersection: 'A ∩ B',
  union: 'A ∪ B',
  difference: 'A \\ B',
  productSet: 'A · B',
  center: 'Z(G)',
  centralizer: 'C_G(G, S)',
  normalizer: 'N_G(G, H)',
  orbits: '轨道(A, e)',
  stabilizers: '稳定子(A, e)',
  fixedPoints: '不动点(A)',
  kernel: 'ker(f)',
  image: 'im(f)',
  subgroups: 'Sub(G)',
  pSubgroups: 'pSub(G, 2)',
  sylow: 'Syl(G, 2)',
  normalSubgroups: '正规子群(G)',
  commutatorGroup: '换位子群(G)',
  closure: '⟨G, (123), (12)⟩',
  elementOrder: 'ord(G, r2)',
  factorize: '分解(12)',
  binomial: 'C(12, 4)',
  binomialMod: 'Cmod(12, 4, 2)',
}

export function opTemplate(op: OpDef): string {
  return TEMPLATES[op.id] ?? op.notation
}
