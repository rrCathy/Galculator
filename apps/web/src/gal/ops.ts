import {
  binomialMod,
  commutatorClosure,
  computeConjugationPerms,
  computeFixedPoints,
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
  findMinimalGenerators,
  findSylowSubgroups,
  getCentralizer,
  getGroupCenter,
  getNormalizer,
  subgroupSetKey,
  type Group,
  type GroupElement,
  type Subgroup,
} from '@groupviz/core'
import { prettySymbol, subscript, superscript } from './pretty'
import {
  normalizeSubgroups,
  type GalAction,
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

/** 子群入参：元素集 / 群本身 / 恰好一个元素的子群集。 */
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

/** 素数校验：恰好一个素因子 ⇔ 素数的幂；这里要求 p 本身是素数。 */
function checkPrime(p: number, notation: string): string | null {
  if (p < 2) return `${notation} 的 p 必须 ≥ 2`
  if (factorizeOrder(p).length !== 1 || factorizeOrder(p)[0].exponent !== 1) {
    return `${notation} 要求 p 是素数，收到 ${p}`
  }
  return null
}

/** 元素记号 → G 中的元素（先按 label，再按 id）。 */
function findElement(group: Group, text: string): GroupElement | null {
  return (
    group.elements.find((e) => e.label === text) ??
    group.elements.find((e) => e.id === text) ??
    null
  )
}

function elementListHint(group: Group, cap = 24): string {
  const labels = group.elements.map((e) => e.label)
  const head = labels.slice(0, cap).join(', ')
  return labels.length > cap ? `${head}, …, 共 ${labels.length} 个` : head
}

/** 把元素集当作 core 的 `Subgroup`（补 generators / index / isNormal）。 */
function asCoreSubgroup(group: Group, elements: GroupElement[]): Subgroup {
  const order = elements.length
  const gens = findMinimalGenerators(elements, group)
  const key = subgroupSetKey(elements.map((e) => e.id))
  const isNormal = findAllNormalSubgroups(group).some(
    (n) => subgroupSetKey(n.elements.map((e) => e.id)) === key,
  )
  return { elements, order, index: order > 0 ? group.order / order : 0, generators: gens, isNormal }
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

/** Ω 中某记号对应的下标（Ω = G 本身时按元素 label/id；陪集作用时按陪集标签）。 */
function omegaIndexOf(A: GalAction, text: string): number {
  if (A.setLabels && A.setLabels.length > 0) return A.setLabels.indexOf(text)
  return A.group.elements.findIndex((e) => e.label === text || e.id === text)
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
    arity: 2,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('商需要第一个参数是群')
      const S = subgroupArgOf(a[1])
      if (!S) return fail('商需要第二个参数是子群', '可传元素集，或恰好含一个子群的子群集')
      const sub = asCoreSubgroup(G, S.elements)
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

  /* ══ 作用导出 ══════════════════════════════════════════ */
  {
    id: 'center',
    notation: 'Z(G)',
    mechanism: 'action',
    primitive: false,
    doc: '中心：与 G 中所有元素都交换的元素',
    recipe: '不动点( 共轭作用(G) )',
    impl: 'getGroupCenter',
    call: ['Z', '中心', 'center'],
    arity: 1,
    result: 'elements',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('Z(·) 需要一个群')
      const els = getGroupCenter(G)
      return {
        ok: true,
        value: { type: 'elements', group: G, elements: els },
        label: `Z(${textOf(a[0])})`,
        sub: `|Z| = ${els.length}`,
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
    impl: 'getCentralizer',
    call: ['C_G', '中心化子', 'centralizer'],
    arity: 2,
    result: 'elements',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('C_G(·) 的第一个参数必须是群')
      const S = elementsOf(a[1])
      if (!S) return fail('C_G(·) 的第二个参数必须是元素集或群')
      const els = getCentralizer(G, S.elements)
      return {
        ok: true,
        value: { type: 'elements', group: G, elements: els },
        label: `C(${textOf(a[1])})`,
        sub: `|C| = ${els.length}`,
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
    impl: 'getNormalizer',
    call: ['N_G', '正规化子', 'normalizer'],
    arity: 2,
    result: 'elements',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('N_G(·) 的第一个参数必须是群')
      const S = subgroupArgOf(a[1])
      if (!S) return fail('N_G(·) 的第二个参数必须是子群')
      const els = getNormalizer(G, S.elements)
      return {
        ok: true,
        value: { type: 'elements', group: G, elements: els },
        label: `N(${textOf(a[1])})`,
        sub: `|N| = ${els.length}`,
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
    impl: 'commutatorClosure',
    call: ['换位子群', 'commutator'],
    arity: 1,
    result: 'elements',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('换位子群(·) 需要一个群')
      const els = commutatorClosure(G, G.elements, G.elements)
      return {
        ok: true,
        value: { type: 'elements', group: G, elements: els },
        label: `[${textOf(a[0])}, ${textOf(a[0])}]`,
        sub: `|[G,G]| = ${els.length}`,
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
    arity: 2,
    result: 'number',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('ord(·) 的第一个参数必须是群')
      const txt = textOf(a[1])
      const el = findElement(G, txt)
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

export function opById(id: string): OpDef | undefined {
  return byId.get(id)
}

export function opByCall(name: string): OpDef | undefined {
  return byCall.get(name.toLowerCase())
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
  center: 'Z(G)',
  centralizer: 'C_G(G, S)',
  normalizer: 'N_G(G, H)',
  orbits: '轨道(A, e)',
  stabilizers: '稳定子(A, e)',
  fixedPoints: '不动点(A)',
  subgroups: 'Sub(G)',
  pSubgroups: 'pSub(G, 2)',
  sylow: 'Syl(G, 2)',
  normalSubgroups: '正规子群(G)',
  commutatorGroup: '换位子群(G)',
  elementOrder: 'ord(G, r2)',
  factorize: '分解(12)',
  binomial: 'C(12, 4)',
  binomialMod: 'Cmod(12, 4, 2)',
}

export function opTemplate(op: OpDef): string {
  return TEMPLATES[op.id] ?? op.notation
}
