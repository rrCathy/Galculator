import {
  binomialMod,
  buildSubgroupGroup,
  closeUnderMultiply,
  commutatorClosure,
  computeBurnsideCount,
  computeConjugationPerms,
  computeCosetActionPerms,
  computeFixedPoints,
  computeImageFromMapping,
  computeKernelFromMapping,
  computeLeftTranslationPerms,
  computeOrbits,
  computeQuotientGroup,
  computeStabilizers,
  computeSubgroupLattice,
  conjugateSubgroup,
  createAutomorphismGroup,
  createDirectProduct,
  elementOrder,
  ENUMERATION_LIMIT,
  extendFromGenerators,
  factorizeOrder,
  findAllNormalSubgroups,
  findAllPSubgroups,
  findAllSubgroups,
  findMinimalGenerators,
  findSylowSubgroups,
  getCentralizer,
  getGeneratorElements,
  getGroupCenter,
  getHomomorphismProperties,
  getNormalizer,
  isSubgroupElementSet,
  resolveElement,
  subgroupFromElementIds,
  subgroupSetKey,
  subgroupStructureSymbol,
  verifyHomomorphism,
  type Group,
  type GroupElement,
  type HomomorphismMap,
  type Subgroup,
} from '@groupviz/core'
import { prettySymbol, subscript, superscript } from './pretty'
import { idsComparable, rememberParent, rootOf, sameGroup } from './parents'
import { elementSemanticKey } from './semantic'
// 包含判据与信息面板的「关系」层（U19）**共用同一份** —— `包含(H, G)` 声明出来的
// 关系，与面板里"算出来"的关系永远一致，不会出现两种说法
import { containment } from './relations'
// 同构判据同理（缺口 ⑰）：声明的 `A \cong B` 与面板那句"同构于 …"同源
import { identifyGroup, isomorphismOf } from './insights'
import {
  normalizeSubgroup,
  normalizeSubgroups,
  type GalAction,
  type GalMap,
  type GalSet,
  type GalValue,
  type SetMember,
  type ValueType,
} from './value'

/* ── 机制（架构 §3）：回答"操作怎么造出来" ────────────────── */

export type Mechanism =
  | 'atomic' // 原子构造：只能给定
  | 'action' // 作用导出：一个作用 \\times {轨道, 稳定子}
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
 * | `subset` | 圆节点（元素集）/ 群节点 | **单个**数集（`∩ ∪ ∖ ·`、`商`、`C_G`、`N_G`、`闭包` 都是它）：元素集 / 集合 / 群（当集合读，且须是前缀里某个群的子群）；`subgroups` 只在**恰好一个成员**时收（那等于一个子群，与 `subgroupArgOf` 一致）|
 * | `setlike` | 圆节点 / 群节点 | **把子群集列表整体当集合读**——**只有 `底集` 用它**（Sylow 链的 `底集(Syl_p(G))` 靠这条；`∩ ∪ ∖ ·` 走的是 `subgroupArgOf`，只收单个数集）|
 * | `omega` | 集合 / 元素集节点 / 群节点 | 作用的作用对象 Ω —— 恰好是 `omegaArgOf` 收的那几种 |
 * | `action` | 作用节点 | |
 * | `map` | — | 映射不占节点，只画边（U3 对象编辑器接入后由它提供）|
 * | `element` | ✗ | **标量**：元素记号（id / label / 循环记号 `(123)`），由操作自行 `resolveElement` |
 * | `prime` | ✗ | **标量**：素数 |
 * | `int` | ✗ | **标量**：整数 |
 *
 * 约定：**标量参数只能排在参数表末尾**。`opsFor` 依赖这条做前缀匹配
 * ——前缀填不上的对象参数意味着"还得多选一个节点"，而末尾的标量参数
 * 可以由用户后续在输入框里补。
 *
 * ## 为什么把 `subset` 拆成三个（U21）
 *
 * 从前只有 `subset` 一个，语义是"看起来像集合"，于是它对**一切**数集都回 true。
 * 但多数 op 其实吃不下一个**子群集列表**（Ω 走 `omegaArgOf`、H 走子群判定）。
 * 后果在拖拽连线里最刺眼：**菜单会列出点了必然报错的候选**
 * （把 `G` 拖到 `Syl_p(G)` 上，列着「共轭作用在」——它只收 `set`/`elements`）。
 * 拆开之后，"菜单里列的"与"真能跑的"才是一回事。
 */
export type ParamType =
  | 'group'
  | 'subset'
  | 'setlike'
  | 'omega'
  | 'action'
  | 'map'
  | 'element'
  | 'prime'
  | 'int'
  | 'genImage'

/**
 * 画布上选不出来的参数（须由文本 / 编辑器补），`opsFor` 视作"可后补"。
 *
 * `genImage`（生成元的像，如 `r2→e`）是 U3 映射构建器的产物：
 * 它是**一对**记号（生成元 → 像），画布上一个节点表达不了，所以归入这一类。
 */
export const SCALAR_PARAM_TYPES: ParamType[] = ['element', 'prime', 'int', 'genImage']

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

/**
 * 求值时能看到的**画布上下文**（U34）。
 *
 * 只放"跟这次计算无关、但可能用得上的**已有对象**" —— 目前是画布上的群：
 * 集合运算找不到共同母群时，会拿它们当候选（`交(C_3, C_7)` 在 F₂₁ 摆着的时候
 * 就该算出 {e}，而不是逼用户去写 `闭包(F, a)`——用户原话："我还得弄闭包……"）。
 */
export interface OpContext {
  /** 画布上的群对象（带引用名，报错与披露里用） */
  groups: { ref: string; group: Group }[]
}

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
  /**
   * 末尾**可变参数**（0..n 个）——`映射(G, H, r2→e, s→s)` 的像对就是这么来的。
   * 声明在 `params` 之外（不计入 arity），填不填都不影响 `opsFor` 的匹配。
   */
  variadic?: OpParam
  /**
   * 该操作**不能直接执行**，凑齐对象参数后要弹编辑器（U3 的映射构建器）。
   * 文本一行表达不了生成元的像，得让用户填（见 ARCHITECTURE §6.1 的输入层三形态）。
   */
  editor?: boolean
  /** 必需参数个数 */
  arity: number
  /** 末尾可选参数个数 */
  optional?: number
  /** 产出值类型 */
  result: ValueType
  run: (args: OpArg[], ctx?: OpContext) => OpOutcome
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

/**
 * 展示用的参数文本 —— **对象取它的数学标签**（缺口 ⑱）。
 *
 * `refText` 给的是**变量名**（`A`、`K`），它适合写进"定义行的写法"（可照抄回输入框），
 * 但用户看画布节点时想看的是数学：`A / K` 应该显示成 `S_4 / ker(\varphi)`。
 *
 * 两条边界：
 *   · **映射 / 作用** 仍走 `refText` —— 它们的标签是 `S_4 \to S_3` 这种长串，
 *     塞进圆形节点会撑破；引用名（`\varphi`）本来就是课本里的写法。
 *   · 散字（元素记号、素数）原样返回。
 */
function labelText(a: OpArg | undefined): string {
  if (!a) return ''
  if (a.kind === 'object' && a.value) {
    const t = a.value.type
    if (t === 'map' || t === 'action') return refText(a)
    return a.text || refText(a)
  }
  return a.text
}

/** 素数校验：恰好一个素因子 ⇔ 素数的幂；这里要求 p 本身是素数。 */
function checkPrime(p: number, notation: string): string | null {
  if (p < 2) return `${notation} 的 p 必须 \\ge 2`
  if (factorizeOrder(p).length !== 1 || factorizeOrder(p)[0].exponent !== 1) {
    return `${notation} 要求 p 是素数，收到 ${p}`
  }
  return null
}

/**
 * 元素记号 hint：列出群里的元素，解析不到时给用户看。
 *
 * **必须过 `prettySymbol`**：这条串是给用户**照着抄**的，而 core 的自同构群元素
 * 叫 `\alpha_{2}`——原样贴出来就成了一屏反斜杠（实测：`A = Aut(S₄)` 后
 * `ord(A, )` 的提示里 `\mathrm{id}, \alpha_1, …, \alpha_{23}` 糊成一片）。
 * 展示成 `id, α₁, …, α₂₃` 之后，用户敲回来也能解析（见 `resolveElementLoose` ⓪ 层）。
 */
function elementListHint(group: Group, cap = 24): string {
  const labels = group.elements.map((e) => prettySymbol(elementNotation(group, e)))
  const head = labels.slice(0, cap).join(', ')
  return labels.length > cap ? `${head}, ..., 共 ${labels.length} 个` : head
}

/**
 * 元素记号的**宽容解析**（数学惯例对齐）。
 *
 * core 的 `resolveElement` 认 id / label / value / 循环记号 `(123)`，但 core 的 `C_n`
 * 是加法群（生成元叫 `a`、元素是 `0..n-1`），而课本写的是**乘法循环群** `r^k`。
 * 于是用户写 `闭包(G, r4)` 时 `r4` 解析不了——而这正是最常见的写法。
 *
 * 四级回退：
 *   ⓪ **展示形态回认**：`prettySymbol(label)` 的唯一命中（`α₂` → `\alpha_2`，
 *      `id` → `\mathrm{id}`）——让"照着面板上的记号敲"成立
 *   ① core 的 `resolveElement`（精确；循环记号走这里）
 *   ② 生成元的幂：`r4` / `r^4` / `r^{4}`
 *   ③ 单生成元群（循环群）里的单字母：`r` / `a` / `g` 一律视作那个生成元
 */
export function resolveElementLoose(group: Group, text: string): GroupElement | null {
  const t = text.trim()
  const direct = resolveElement(group, t)
  if (direct) return direct

  /**
   * ⓪ **展示形态回认**：面板与提示里给用户看的是 `prettySymbol(label)`——
   * `α₂` / `id` / `⟨r₂, s⟩`。用户照着敲回来必须认得出，否则"看得见却打不出来"。
   * 于是 `\alpha_{2}` / `\alpha_2` / `α₂` 三种写法殊途同归。
   *
   * **只在唯一命中时接受**：pretty 是**多对一**的（`\alpha_{2}` 与 `\alpha_2`
   * 折叠成同一个 `α₂`），一旦有歧义就落到下面几级或干脆报错——
   * 概率性正确比明确失败更危险。
   */
  const tp = prettySymbol(t)
  const prettyHits = group.elements.filter((e) => prettySymbol(e.label) === tp)
  if (prettyHits.length === 1) return prettyHits[0]

  const m = /^([A-Za-z][A-Za-z0-9]*?)\^?\{?(\d*)\}?$/.exec(t)
  if (!m) return null
  const base = m[1]
  const exp = m[2] ? Number(m[2]) : 1

  const gens = getGeneratorElements(group)
  let gen = gens.find((x) => x.gen.name === base || x.el.label === base)?.el ?? null
  // 循环群只有唯一生成元：`r` / `a` / `g` 这类单字母都当作它（两种记号的桥）
  if (!gen && gens.length === 1 && base.length === 1) gen = gens[0].el
  if (!gen) return null

  let cur = group.identity
  for (let i = 0; i < exp; i++) cur = group.multiply(cur, gen)
  return cur
}

/**
 * 元素的**课本记号**（展示与"写进定义行"都用它）。
 *
 * core 的元素 `label` 在置换群上有个不一致：**单循环不带括号**——
 * S₄ 的 3-轮换标签是 `234`、对换是 `12`，而双对换却写着 `(12)(34)`。
 * 照着 core 的写法显示，画布上就长出 `⟨234⟩` / `⟨12⟩` 这种**看着像整数**的标签
 * （U15 把 S₄ / S₃ 变成推荐实例之后，这个毛病变得很显眼）。
 *
 * 升格成 `(234)` 之前必须过**回认**这一关（`resolveElementLoose` 命中同一个元素）：
 * 循环群 C₁₂ 里真有元素标签 `10` / `11`，但 `(10)` 解析不了——
 * 判据一放，它就自动留在 `10` 不动。**展示成什么样，就得能照着敲回去。**
 */
export function elementNotation(group: Group, e: GroupElement): string {
  if (!/^[0-9]{2,}$/.test(e.label)) return e.label
  const wrapped = `(${e.label})`
  const hit = resolveElementLoose(group, wrapped)
  return hit && hit.id === e.id ? wrapped : e.label
}

/** 元素参数 → 群元素：走 core `resolveElement`，接受 id / label / value / **循环记号**（`(123)`）。 */
function elementArgOf(a: OpArg | undefined, group: Group): GroupElement | null {  if (!a) return null
  if (a.kind === 'object') {
    const v = a.value
    if (v.type === 'elements' && v.elements.length === 1)
      return resolveElementLoose(group, v.elements[0].id)
    return null
  }
  return resolveElementLoose(group, a.text)
}

/**
 * `subset` 参数的**元素记号回退**。
 *
 * 教材里 `C_G(σ)` 比 `C_G({σ})` 常见得多，而 `subset` 参数原本只收**对象**
 *（元素集 / 群），于是 `C_G(S_4, (12)(34))` 会被拒（实测清单里就是这么发现的）。
 * 这条回退把"读不出对象"的那串文本当**元素记号**解析成单元素集。
 *
 * 于是 `C_G(S_4, (12)(34))`、`C_G(S_4, H)`、`C_G(S_4, S)` 三种写法都成立。
 */
function elementSetArgOf(
  a: OpArg | undefined,
  G: Group,
): { group: Group; elements: GroupElement[] } | null {
  const asObj = elementsOf(a)
  if (asObj) return asObj
  if (!a || a.kind === 'object') return null
  const el = resolveElementLoose(G, a.text)
  return el ? { group: G, elements: [el] } : null
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
  return s ? `，${s}` : ''
}

/**
 * 元素集 → **真群对象**（core `buildSubgroupGroup`）。
 *
 * 交互模型 §2：「类型改变是最强视觉信号」。`Z(G)` / `[G,G]` / `⟨S⟩` / `ker f`
 * 这类子群不再是圆形的集合，而是方形的群对象——于是 `Z(Z(G))` 合法。
 * 元素沿用母群对象（id 一致），故子群判定 / 商群 / 集合运算仍能对齐。
 */
function subgroupGroupOf(parent: Group, elements: GroupElement[], fallbackLabel: string): Group {
  return rememberParent(
    buildSubgroupGroup(
      parent,
      elements,
      subgroupStructureSymbol(
        parent,
        elements.map((e) => e.id),
      ) ?? fallbackLabel,
    ),
    parent,
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

/**
 * 把一个元素集**翻译**到目标群里的对应元素（G4：第三同构定理 `(G/N)/(K/N)`）。
 *
 * 全部命中才返回——有一项对不上就 `null`。**不猜、不部分匹配**：
 * 部分匹配出来的"子群"会让商群静静算错，比直接失败更糟。
 */
function alignElementSet(target: Group, els: GroupElement[]): GroupElement[] | null {
  const byKey = new Map<string, GroupElement>()
  for (const t of target.elements) byKey.set(elementSemanticKey(t), t)
  const out: GroupElement[] = []
  for (const e of els) {
    const hit = byKey.get(elementSemanticKey(e))
    if (!hit) return null
    out.push(hit)
  }
  return out
}

/* ── 跨群元素表示的分诊（2026-09-29）─────────────────────── */

/**
 * 「两边元素表示不通」的分诊 —— 与「真的不是子群」**必须分开报**。
 *
 * 用户实测：`Q = A_4 / V_4` 报「V4 不是 A4 的子群，要求含单位元且乘法封闭」，
 * 可这句话**在数学上是错的**（A₄ 里确实有一个 Klein 子群，而且正规）。
 * 真相是 `A_4` 与 `V_4` 是**各自独立构造**的两个群：前者元素 id 是置换
 * （`1,2,3,4`…），后者是抽象记号（`e a b c`）——`V_4` 的元素**根本不在**
 * `A_4` 的元素表里，所以既谈不上"是子群"，也不该被说成"不是子群"。
 *
 * 判据与 `containment` 第①关同源（**只看 id**）：`S` 的元素 id 是否全落在 `G` 里。
 * 全在 → 交给 core 判，那时"不是子群"才是实话；有一个不在 → 走这条分诊。
 *
 * 分诊**不只是改措辞**：还要给出路。同一个母群里"长得像"的子群往往不止一种
 * 造法，用户手里那个（`V_4`）常常就是想用这里面的某一个 —— 所以顺手在 `G` 里
 * 找同构的子群：**恰好一个**时给出可照抄的 `闭包(...)`（唯一性由数学保证，
 * 不是猜），多个 / 都不是正规（`requireNormal`）时照实说为什么没法唯一。
 *
 * `requireNormal` 是**商**这类只认正规子群的路传进来的筛子（积集 / 陪集作用不传）。
 */
function foreignSubgroupFail(
  gRef: string,
  G: Group,
  hRef: string,
  S: { group: Group; elements: GroupElement[] },
  requireNormal: boolean,
): OpOutcome | null {
  const gIds = new Set(G.elements.map((e) => e.id))
  if (S.elements.every((e) => gIds.has(e.id))) return null
  return fail(
    `${hRef} 的元素不在 ${gRef} 里，两者不是同一个群里的子群`,
    isoSubgroupHint(G, S, gRef, hRef, requireNormal) ??
      `${hRef} 是独立构造的群，元素和 ${gRef} 对不上；想用 ${gRef} 里的子群，请从它构造（如 闭包(${gRef}, 生成元)）`,
  )
}

/** 元素表里有没有**陪集元素**（商群的元素）。跨"层级"的翻译靠它守。 */
function hasCosetElements(g: Group): boolean {
  return g.elements.some((e) => (e.cosetMemberLabels?.length ?? 0) > 0)
}

/**
 * 「两边根本不在同一个**世界**」的统一诊断（2026-09-29，记号串号那笔账）。
 *
 * `foreignSubgroupFail` 管的是"元素 id 根本不在 `G` 里"；这一条管**更阴的那半**：
 * id 全都在、却是**另一个群**的元素（`C_3` 的 `e0 e1 e2` 与 `C_7` 的 `e0…e6` 撞号），
 * 而且两边各造各的、没有共同母群。措辞必须点破"记号碰巧重合"——
 * 说"元素不在里面"是假话，说"不是子群"又像在讲"同一个群里挑错了子集"。
 */
function crossWorldFail(
  gRef: string,
  G: Group,
  hRef: string,
  S: { group: Group; elements: GroupElement[] },
  requireNormal: boolean,
): OpOutcome {
  return fail(
    `${hRef} 与 ${gRef} 是两个各自构造的群，元素记号碰巧重合，不是同一个群里的子群`,
    isoSubgroupHint(G, S, gRef, hRef, requireNormal) ??
      `想用 ${gRef} 里的子群，先从它构造（如 闭包(${gRef}, 生成元)）`,
  )
}

/**
 * 一条统一的「不是子群」分诊：三个分支按**从具体到笼统**排 ——
 *   ① id 全在但**世界不同**（记号串号）→ `crossWorldFail`（说破碰巧重合）；
 *   ② id 有缺 → `foreignSubgroupFail`（"元素不在 G 里" + 唯一的同构子群配方）；
 *   ③ 都齐（真在同一个世界里挑错了子集）→ 调用方给"不是子群/不封闭"的实话。
 */
function subgroupMisdiagnosis(
  gRef: string,
  G: Group,
  hRef: string,
  S: { group: Group; elements: GroupElement[] },
  requireNormal: boolean,
): OpOutcome | null {
  const gIds = new Set(G.elements.map((e) => e.id))
  const idsAllIn = S.elements.every((e) => gIds.has(e.id))
  if (idsAllIn && !idsComparable(S.group, G)) return crossWorldFail(gRef, G, hRef, S, requireNormal)
  return foreignSubgroupFail(gRef, G, hRef, S, requireNormal)
}

/**
 * 在 `G` 里找与 `S` 同构（同阶 + 同结构符号）的子群。
 *
 * 三道守卫任一不满足就返回 `null`（调用方退回中性措辞，不硬编建议）：
 * 阶超枚举上限 / 结构符号算不出 / 枚举抛错。只在**报错与翻译**路径上调用。
 *
 * 结构符号跨母群**形式一致**（实测：`V_4` 自身与 `A_4` 的那个 Klein 子群
 * 都算出 `C_{2}\times C_{2}`），所以可以直接比字符串。
 */
function isomorphicSubgroupsIn(
  G: Group,
  S: { group: Group; elements: GroupElement[] },
): Subgroup[] | null {
  if (G.order > ENUM_LIMIT || S.elements.length === 0) return null
  let want: string | null
  try {
    want = subgroupStructureSymbol(S.group, S.elements.map((e) => e.id))
    if (!want) return null
    const out = findAllSubgroups(G).filter(
      (h) =>
        h.order === S.elements.length &&
        subgroupStructureSymbol(G, h.elements.map((e) => e.id)) === want,
    )
    /**
     * `findAllSubgroups` **不含 G 自身** —— 而"与 S 同构的子群"完全可能就是 G 自己：
     * `商(V_4, 独立 V_4)`（→ 平凡商）、`Klein × 独立 V_4`（↔ V₄ 整个映到它）都要它。
     * 补进候选：`G ⊴ G` 恒正规，生成元取声明的那组。
     */
    if (
      G.order === S.elements.length &&
      subgroupStructureSymbol(G, G.elements.map((e) => e.id)) === want
    ) {
      out.push({
        elements: G.elements,
        order: G.order,
        index: 1,
        generators: getGeneratorElements(G).map((x) => x.el),
        isNormal: true,
      })
    }
    return out
  } catch {
    return null
  }
}

/**
 * 子群的**可照抄**写法：`闭包(G, g_1, g_2)`（生成元走 `prettySymbol`；
 * 平凡子群写成 `闭包(G)`）。错误语 / 状态行都是**纯文本面**，这里不带 LaTeX 命令。
 */
function subgroupRecipe(G: Group, gRef: string, h: Subgroup): string {
  const gens = h.generators
    .filter((g) => g.id !== G.identity.id)
    .map((g) => prettySymbol(g.label))
  return `闭包(${gRef}${gens.length > 0 ? `, ${gens.join(', ')}` : ''})`
}

/**
 * 唯一时**自动翻译**：`S` 是独立构造的群（元素和 `G` 对不上），但 `G` 里与它
 * 同构的子群（`requireNormal` 时还要正规）**恰好一个** —— 直接拿它当分母。
 *
 * 为什么敢替用户拿主意：候选唯一时这个选择是**数学逼出来的**，不是猜。
 * 用户实测的 `S_4 / V_4` 就是标本：S₄ 有 4 个 Klein 子群，但求商只认正规的，
 * 4 个里正规的**只有 1 个** —— 让人"从 4 个里选一个"既没人可选、
 * 也没必要选（另外 3 个点中了也还是不正规）。
 *
 * 两道边界：
 *   · **只认普通元素**：任一边带着陪集元素（商群）就停 —— 否则
 *     `商(G/N, K)` 这种"层级错了"的行会被静默翻译成另一个问题
 *     （第三同构的反例钉着这条：要求它继续报错）；
 *   · 超限 / 结构符号算不出 → `null`（`isomorphicSubgroupsIn` 的守卫），退回报错。
 */
function autoTranslatedSubgroup(
  G: Group,
  S: { group: Group; elements: GroupElement[] },
  requireNormal: boolean,
): Subgroup | null {
  if (hasCosetElements(G) || hasCosetElements(S.group)) return null
  const subs = isomorphicSubgroupsIn(G, S)
  if (!subs) return null
  const cands = requireNormal ? subs.filter((h) => h.isNormal) : subs
  return cands.length === 1 ? cands[0] : null
}

/**
 * 报错时的出路：在 `G` 里找与 `S` 同构的子群，给**可照抄**的 `闭包(...)` 写法。
 *
 * `requireNormal` = 调用方（商）只认正规子群：候选先按正规性筛一遍，
 * 筛空时**照实说**「有 N 个同构的，但都不是正规子群」—— 别让人去挑一个
 * 挑中了也点不动的候选（S₄ 的 9 个 C₂ 就是这么回事）。
 * 多个候选时把配方也列出来 ——「指明一个」得**真能指明**。
 */
function isoSubgroupHint(
  G: Group,
  S: { group: Group; elements: GroupElement[] },
  gRef: string,
  hRef: string,
  requireNormal: boolean,
): string | null {
  const subs = isomorphicSubgroupsIn(G, S)
  if (!subs || subs.length === 0) return null
  const cands = requireNormal ? subs.filter((h) => h.isNormal) : subs
  if (cands.length === 0) {
    return `${gRef} 里与 ${hRef} 同构的子群有 ${subs.length} 个，但没有一个是正规子群（商群要求 N 正规）`
  }
  if (cands.length === 1) {
    return requireNormal
      ? `${gRef} 里与 ${hRef} 同构的正规子群恰有一个：${subgroupRecipe(G, gRef, cands[0])}`
      : `${gRef} 里恰有一个这样的子群：${subgroupRecipe(G, gRef, cands[0])}`
  }
  const shown = cands.slice(0, 3).map((h) => subgroupRecipe(G, gRef, h))
  return `${gRef} 里有 ${cands.length} 个${requireNormal ? '正规' : ''}这样的子群，指明一个即可：${shown.join('、')}${cands.length > 3 ? ' 等' : ''}`
}

/** 精确组合数（BigInt，避免 n 到 2000 量级时溢出）。 */
function chooseExact(n: number, k: number): bigint {
  if (k < 0 || n < 0 || k > n) return 0n
  let r = 1n
  for (let i = 1; i <= k; i++) r = (r * BigInt(n - k + i)) / BigInt(i)
  return r
}

/** 最大公因数（欧几里得；非负入参由调用方保证）。 */
function gcdInt(a: number, b: number): number {
  let x = a
  let y = b
  while (y !== 0) {
    const t = x % y
    x = y
    y = t
  }
  return x
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

/** 元素 id → 展示记号（core 的报错结构里给的是 id，展示前要翻一遍）。 */
function elementLabel(group: Group, id: string): string {
  const e = group.elements.find((x) => x.id === id)
  return e ? prettySymbol(e.label) : id
}

/**
 * 生成元记号 → core 的生成元项。
 *
 * 生成元有三种写法要对上：core 的 `gen.name`（如 `r2`、`s12`、`a`）、
 * 生成元**元素**的 `label`（如 `s`、`(12)`、`1`）与 `id`。
 * 编辑器填的是 name（好读），用户手写时常写 label，所以都认。
 *
 * 注意 core 的 `extendFromGenerators` 收的 Map 的 key 是**元素 id**，
 * 不是名字——这里返回 `el` 就是为了这个（踩过：传名字一律得到 null）。
 */
function generatorOf(group: Group, text: string): { genName: string; el: GroupElement } | null {
  const gens = getGeneratorElements(group)
  const hit = gens.find((g) => g.gen.name === text || g.el.label === text || g.el.id === text)
  if (hit) return { genName: hit.gen.name, el: hit.el }
  // 循环群的两种通行写法：core 叫 `a`，课本写 `r`（或反之）
  if (gens.length === 1 && /^[A-Za-z]$/.test(text.trim())) {
    return { genName: gens[0].gen.name, el: gens[0].el }
  }
  return null
}

/** 生成元的候选记号（报错提示 / 编辑器下拉都要用）。 */
export function generatorNames(group: Group): string[] {
  return getGeneratorElements(group).map((g) => g.gen.name)
}

/**
 * Ω 中某记号对应的下标。Ω = G 本身时元素记号走 `resolveElement`
 * （于是 `(123)` / `123` / `…,+1,+2,+3` 都能命中同一个元素）。
 */
function omegaIndexOf(A: GalAction, text: string): number {
  if (A.setLabels && A.setLabels.length > 0) {
    const raw = text.trim()
    const exact = A.setLabels.indexOf(raw)
    if (exact >= 0) return exact
    // 多生成元的子群标签带逗号（`⟨(12)(34), (13)(24)⟩`），而实参按逗号切分
    // —— 所以再试一次"去掉所有空白"的比对
    const squeeze = (x: string) => x.replace(/\s+/g, '')
    const loose = A.setLabels.findIndex((l) => squeeze(l) === squeeze(raw))
    if (loose >= 0) return loose
    // 还是对不上就按**下标**：Ω 是集合（成员是子群）时，纯数字的唯一解释
    // 就是"第几个点"——面板上每项都带 `#n`，这正是给带逗号标签留的入口。
    if (A.omega && A.omegaBase === 'object' && /^\d+$/.test(raw)) {
      const i = Number(raw) - 1
      if (i >= 0 && i < A.setLabels.length) return i
    }
    return -1
  }
  const el = resolveElementLoose(A.group, text)
  if (!el) return -1
  return A.group.elements.findIndex((e) => e.id === el.id)
}

/**
 * Ω 对不上时的提示串。
 * 集合型 Ω 的成员标签可能很长（`⟨(12)(34), (13)(24)⟩`），所以带上下标——
 * 用户可以照 `#n` 写数字，绕开逗号切分。
 */
function omegaHint(A: GalAction): string {
  const labels = omegaLabels(A)
  const head = labels.slice(0, 12)
  return A.omega && A.omegaBase === 'object'
    ? `\\Omega 的 ${labels.length} 个点：${head.map((l, i) => `#${i + 1} ${l}`).join('，')}`
    : `\\Omega = {${head.join(', ')}}`
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

/** 枚举类操作的规模上限（与 core 的守卫阈值同量级）*/
const ENUM_LIMIT = 120


/* ── 共轭作用在子群集上（Sylow 定理的主角动作）────────────── */

/** 子群（元素数组）的规范键。core 的 `conjugateSubgroup` 也返回排序结果，两边对得上。 */
function subgroupKeyOf(els: GroupElement[]): string {
  return els.map((e) => e.id).sort().join('|')
}

/**
 * 把一个「被作用的点集 Ω」实参读成结构化形式。
 *
 * 三种来源：
 *   - `set`（`底集(Syl_p(G))` 的产物）：成员可能带 `subgroupElements` → **点就是子群**
 *   - `elements`：点是 G 的元素（共轭类 / 正规子群集 …）
 *   - `group`：同上（Ω = G 自身）
 *
 * `points` 为 null 表示"点是元素"而不是子群 —— 这两条路走的是两套置换算法。
 */
interface OmegaArg {
  group: Group
  label: string
  members: SetMember[]
  /** 点背后的子群元素集（按 `members` 对齐）；点是元素时为 null */
  points: GroupElement[][] | null
}

function omegaArgOf(a: OpArg | undefined): OmegaArg | null {
  if (!a || a.kind !== 'object') return null
  const v = a.value
  if (v.type === 'set') {
    const subs = v.set.members.map((m) => m.subgroupElements)
    const allSubs = subs.length > 0 && subs.every((x): x is GroupElement[] => !!x)
    return {
      group: v.set.group,
      label: v.set.label,
      members: v.set.members,
      points: allSubs ? subs : null,
    }
  }
  if (v.type === 'elements') {
    return {
      group: v.group,
      label: `底集(${refText(a)})`,
      members: v.elements.map((e) => ({ label: e.label })),
      points: null,
    }
  }
  if (v.type === 'group') {
    return {
      group: v.group,
      label: `底集(${refText(a)})`,
      members: v.group.elements.map((e) => ({ label: e.label })),
      points: null,
    }
  }
  return null
}

/**
 * G 通过共轭作用在一族**子群**上 → 每个 g 在点集上的置换。
 *
 * `acting` 是**真正在动的那些元素**。多数时候它就是 `G` 的全部元素；
 * 但 Sylow III 的第一条（`n_p ≡ 1 mod p`）要的是 **P ↷ Syl_p(G)**——
 * 作用群是子群 P、Ω 的成员却是**母群 G** 的子群。于是共轭在母群 `G` 里做
 * （子群对象沿用母群的元素 id），置换只对 `acting` 取。
 *
 * 用 core 的 `conjugateSubgroup` 算 `gHg⁻¹`。要验证每个 g 都把点集**映到自身**：
 * 不封闭说明这族子群不是共轭闭的（比如只挑了一部分 Sylow 子群）——
 * 这时给的是定向报错而不是静默算错。
 */
function conjugationPermsOnSubgroups(
  G: Group,
  points: GroupElement[][],
  acting: readonly GroupElement[],
): { perms: Map<string, number[]> } | { error: string; hint?: string } {
  const keys = points.map(subgroupKeyOf)
  const index = new Map<string, number>()
  keys.forEach((k, i) => {
    if (!index.has(k)) index.set(k, i)
  })
  if (index.size !== keys.length) {
    return { error: '\\Omega 里有重复的点', hint: '同一个子群在 \\Omega 里出现了两次' }
  }
  const perms = new Map<string, number[]>()
  for (const g of acting) {
    const perm: number[] = []
    for (const H of points) {
      const j = index.get(subgroupKeyOf(conjugateSubgroup(G, H, g)))
      if (j === undefined) {
        return {
          error: `${elementLabel(G, g.id)} 把 \\Omega 里的某个子群映到了 \\Omega 之外`,
          hint: '\\Omega 必须在共轭下封闭（Sylow p-子群的全体就是封闭的）',
        }
      }
      perm.push(j)
    }
    perms.set(g.id, perm)
  }
  return { perms }
}

/**
 * Ω 是**元素集**时的共轭置换：借 core 在 G 上的共轭置换，
 * 再检查 Ω 是不是若干个共轭轨道的并（正规子群 / 共轭类 / G 自身都是）。
 */
function conjugationPermsOnElements(
  G: Group,
  O: OmegaArg,
  acting: readonly GroupElement[],
): { perms: Map<string, number[]>; omega?: undefined } | { error: string; hint?: string } {
  const full = computeConjugationPerms(G)
  const posInG = (label: string) => G.elements.findIndex((e) => e.label === label)
  const src = O.members.map((m) => posInG(m.label))
  if (src.some((i) => i < 0)) {
    return { error: '\\Omega 里有 G 中找不到的元素', hint: '\\Omega 的成员必须是 G 的元素' }
  }
  const posInO = new Map<string, number>()
  O.members.forEach((m, i) => {
    if (!posInO.has(m.label)) posInO.set(m.label, i)
  })
  const perms = new Map<string, number[]>()
  for (const g of acting) {
    const p = full.get(g.id)
    if (!p) return { error: 'core 没有给出该共轭置换' }
    const perm: number[] = []
    for (const i of src) {
      const j = posInO.get(G.elements[p[i]].label)
      if (j === undefined) {
        return {
          error: `${elementLabel(G, g.id)} 把 \\Omega 里的元素映到了 \\Omega 之外`,
          hint: '\\Omega 要在共轭下封闭：取共轭类、正规子群或 G 自身',
        }
      }
      perm.push(j)
    }
    perms.set(g.id, perm)
  }
  return { perms }
}

/** Ω 的展示名（作用线的副行与结论用）。 */
function omegaDisplayName(O: OmegaArg): string {
  return O.points ? `Syl / 子群集（${O.members.length} 个点）` : `G 的元素（${O.members.length} 个点）`
}

const COSET_OMEGA_HINT = '\\Omega 是陪集而非 G 的元素；陪集视图接入后再支持'

/* ── 集合运算 ──────────────────────────────────────────── */

type SetOpKind = '\\cap' | '\\cup' | '\\' | '\\cdot'

/**
 * 集合运算的母群推断：只有 `elements` / `subgroups` 值携带**真正的母群**；
 * 群对象（子群升级而来）的 `group` 是它自己 —— 它的母群去 `parents.ts` 的
 * **母群指针**里找（`rootOf`），别拿它自己当上下文群。
 */
function parentGroupOf(a: OpArg | undefined): Group | null {
  if (!a || a.kind !== 'object') return null
  const v = a.value
  return v.type === 'elements' || v.type === 'subgroups' ? v.group : null
}

/**
 * 把一边在候选上下文群 `g` 里的**全部落点**列出来（U34 起返回数组）：
 *   · 能**原位**放下（id 直接对着读 + 都对得上）→ 就一个落点：原样；
 *   · 否则给出 `g` 里所有与它同构的子群 —— **不在这里定夺**，
 *     由调用方看"这些落点算出来的结果是否相同"：相同 = 没有选择这回事（直接算），
 *     不同 = 真歧义（停下让用户指明）。
 * 一个落点都没有 → `null`（这个候选"家"不成立）。
 */
function alignSetSideAll(
  side: { group: Group; elements: GroupElement[] },
  g: Group,
): GroupElement[][] | null {
  const gIds = new Set(g.elements.map((e) => e.id))
  if (idsComparable(side.group, g) && side.elements.every((e) => gIds.has(e.id))) {
    return [side.elements]
  }
  if (hasCosetElements(g) || hasCosetElements(side.group)) return null
  const subs = isomorphicSubgroupsIn(g, side)
  if (!subs || subs.length === 0) return null
  return subs.map((h) => h.elements)
}

/** 集合运算的**核心算式**：给定同一个群里的两边元素，算出结果元素（按 id 去重）。 */
function computeSetEls(
  kind: SetOpKind,
  group: Group,
  elsA: GroupElement[],
  elsB: GroupElement[],
): GroupElement[] {
  const idsA = new Set(elsA.map((e) => e.id))
  const idsB = new Set(elsB.map((e) => e.id))
  switch (kind) {
    case '\\cap':
      return elsA.filter((e) => idsB.has(e.id))
    case '\\cup':
      return [...elsA, ...elsB.filter((e) => !idsA.has(e.id))]
    case '\\':
      return elsA.filter((e) => !idsB.has(e.id))
    case '\\cdot': {
      // 积集走**上下文群的乘法**。对齐已经保证两边的元素都在 `group` 里 ——
      // core 的乘法在查不到元素时会静默回退成单位元（U29 的教训），这里没有那个窗口了。
      const seen = new Set<string>()
      const out: GroupElement[] = []
      for (const x of elsA) {
        for (const y of elsB) {
          const p = group.multiply(x, y)
          if (seen.has(p.id)) continue
          seen.add(p.id)
          out.push(p)
        }
      }
      return out
    }
  }
}

const idSetKey = (els: GroupElement[]) => els.map((e) => e.id).sort().join('|')

/**
 * 交 / 并 / 差 / 积集（架构 §5.2）。机制归「原子构造」——由给定集合直接算出新集合。
 *
 * **先对齐，再算**（2026-09-29 重写）。从前这里只按元素 id 相交 / 相乘，三条病征：
 *   - `A_4 ∩ 独立 V_4` 静默给**空集**（id 空间不通，看着像真的，用户实测）；
 *   - `闭包(G,(12)) · 闭包(G,(34))` 误报"不是同一个群"（拿 K₁ 当上下文群去乘 K₂ 的元素）；
 *   - 独立构造的 `V_4` 参与运算时好时坏（母群只能猜一边，反序就死）。
 *
 * 现在的规则一句话：**候选上下文群逐个试，第一个"两边都能对齐、且结果说得清"的赢**。
 * 候选按"最像用户正在工作的那个家"排序：显式母群 → 子群对象的**根** → 两边各自的群 →
 * **画布上的其它群**（U34：`交(C_3, C_7)` 在 F₂₁ 摆着时就该算出 {e}，不该逼人写闭包）。
 *
 * 一边对不上时允许**翻译**过去，分寸拿两条：
 *   · 同构子群**恰好一个** → 直接翻译（唯一性由数学保证，不是猜），并写进 `sub`；
 *   · **多个但算出来的结果都一样** → 也直接算（结果与选哪个无关 = 没有选择这回事，
 *     用户原话："只要拉两个子群箭头就应该能猜对"）——`sub` 里写明"N 个候选结果相同"；
 *   · 多个且结果不同 → 停下，让用户指明（那是真歧义）。
 *
 * 全失败时挑"最有料"的报错（带候选配方的 > 只说"对不上"的）——
 * **宁可停下，也不静默给空集 / 给怪结果**。
 */
function setOp(a: OpArg[], kind: SetOpKind, ctx?: OpContext): OpOutcome {
  const A = subgroupArgOf(a[0])
  const B = subgroupArgOf(a[1])
  if (!A || !B) {
    return fail(`${kind} 需要两个集合`, '可传元素集、恰含一个子群的子群集，或子群群对象')
  }
  const aRef = refText(a[0])
  const bRef = refText(a[1])
  const pa = parentGroupOf(a[0])
  const pb = parentGroupOf(a[1])
  if (pa && pb && !sameGroup(pa, pb)) {
    return fail(`${kind} 的两边来自不同的群`, `${prettySymbol(pa.symbol)} 与 ${prettySymbol(pb.symbol)}`)
  }

  const cands: Group[] = []
  const push = (g: Group | null | undefined) => {
    if (g && !cands.some((c) => sameGroup(c, g))) cands.push(g)
  }
  push(pa)
  push(pb)
  push(rootOf(A.group))
  push(rootOf(B.group))
  push(A.group)
  push(B.group)
  // 画布上的其它群（U34）：排在"由运算对象推出来的家"之后，绝不让它顶掉前者
  for (const g of ctx?.groups ?? []) push(g.group)

  /** 候选家的**名字**：运算对象自己的群 / 画布上的群用引用名，否则退回数学符号。 */
  const nameOf = (g: Group) =>
    g === A.group
      ? aRef
      : g === B.group
        ? bRef
        : (ctx?.groups.find((x) => x.group === g)?.ref ?? prettySymbol(g.symbol))

  let chosen: { group: Group; els: GroupElement[]; said: string } | null = null
  let best: { score: number; out: OpOutcome } | null = null

  for (const g of cands) {
    const ra = alignSetSideAll(A, g)
    const rb = alignSetSideAll(B, g)
    if (ra && rb) {
      // 枚举所有落点组合，看结果是否**全部相同**
      const outcomes: GroupElement[][] = []
      for (const ea of ra) for (const eb of rb) outcomes.push(computeSetEls(kind, g, ea, eb))
      if (new Set(outcomes.map(idSetKey)).size !== 1) {
        // 真歧义：指谁都不对（结果不同）——停，并把候选配方给上
        const n = ra.length > 1 ? ra.length : rb.length
        const which = ra.length > 1 ? aRef : bRef
        const out = fail(
          `${which} 在 ${nameOf(g)} 里有 ${n} 个同构的子群，算出来的结果不一样，得指明一个`,
          isoSubgroupHint(
            g,
            ra.length > 1 ? A : B,
            nameOf(g),
            which,
            false,
          ) ?? undefined,
        )
        if (!best || best.score < 3) best = { score: 3, out }
        continue
      }
      // 结果与选择无关：把"翻译过"说出来（唯一 / 多候选结果相同，两种措辞）
      const name = nameOf(g)
      const named = g === A.group || g === B.group || ctx?.groups.some((x) => x.group === g)
      const said: string[] = []
      const saySide = (ref: string, all: GroupElement[][], side: { group: Group; elements: GroupElement[] }) => {
        if (idsComparable(side.group, g) && side.elements.every((e) => new Set(g.elements.map((x) => x.id)).has(e.id))) {
          return
        }
        if (all.length === 1) {
          const h = isomorphicSubgroupsIn(g, side)?.[0]
          said.push(
            `${ref} 自动取 ${name} 里唯一与它同构的子群${named && h ? ` ${subgroupRecipe(g, name, h)}` : ''}`,
          )
        } else {
          said.push(`${ref} 取 ${name} 里与它同构的子群（${all.length} 个候选，结果相同）`)
        }
      }
      saySide(aRef, ra, A)
      saySide(bRef, rb, B)
      chosen = { group: g, els: outcomes[0], said: said.join('；') }
      break
    }
    // 失败诊断：缺席的那一边说清楚；每个候选都记分，最后取"最有料"的那条。
    // **记分只认"可操作的"**：另一边已经**原位**站住了，这条提示照着做才有意义 ——
    // 否则会出现"去 A_4 里指明 K3 的位置"这种指了也没用的建议（C_7 照样塞不进 A_4）。
    const sideIn = (side: { group: Group; elements: GroupElement[] }) => {
      if (!idsComparable(side.group, g)) return false
      const gIds = new Set(g.elements.map((e) => e.id))
      return side.elements.every((e) => gIds.has(e.id))
    }
    const aIn = sideIn(A)
    const bIn = sideIn(B)
    const foreign = aIn ? { ref: bRef, side: B } : { ref: aRef, side: A }
    const out = foreignSubgroupFail(nameOf(g), g, foreign.ref, foreign.side, false)
    if (out && !out.ok) {
      const actionable = aIn || bIn
      const score = actionable ? ((out.hint ?? '').includes('指明一个即可') ? 2 : 1) : 1
      if (!best || score > best.score) best = { score, out }
    }
  }
  if (!chosen) {
    /**
     * 全失败。挑报错分两档：
     *   · 有"带候选配方"的诊断（真歧义 / "指明一个即可"）→ 用最具体的那条；
     *   · 否则如果两边的**根**就不是同一个群（各造各的，比如 `C_3` 与 `C_7`）→
     *     说清"没有共同的母群"，并指路（先建共同的大群，再从里面取子群）。
     */
    if (!best || best.score <= 1) {
      const aRoot = rootOf(A.group)
      const bRoot = rootOf(B.group)
      const canvasHint = (ctx?.groups ?? []).some((x) => x.group !== A.group && x.group !== B.group)
      if (!sameGroup(aRoot, bRoot)) {
        return fail(
          `${aRef} 与 ${bRef} 不在同一个群里（两者没有共同的母群）`,
          canvasHint
            ? '画布上现成的群都装不下这两边；先建它们共同的大群，再从里面取子群（如 闭包(大群, 生成元)）'
            : '先把两边放进共同的大群再算：比如 闭包(大群, 生成元)；或从大群的子群列表里取',
        )
      }
    }
    return (
      best?.out ??
      fail(
        `${kind} 的两边不在同一个群里`,
        '把两边先放进同一个群里（如 闭包(母群, 生成元)），或从子群列表里取',
      )
    )
  }

  const { group, els } = chosen
  const label = `${aRef} ${kind} ${bRef}`
  const said = chosen.said ? `，${chosen.said}` : ''

  // **「交」的结果是子群，这是定理不是猜测** —— 所以升级为真群对象：
  // 它才能继续参与 `H/(H∩N)`、也才能在画布上画出 `H∩N ↪ H` 的包含箭头。
  // （决策 ⑤ 的"固化集合不自动升级"针对的是**用户手工构造的集合**——
  //  那种"是不是子群"要判断；而两个子群之交必是子群，无需判断。）
  if (
    (kind === '\\cap' || kind === '\\cdot') &&
    els.length > 0 &&
    els.length <= ENUM_LIMIT &&
    isSubgroupElementSet(group, els.map((e) => e.id))
  ) {
    return {
      ok: true,
      value: { type: 'group', group: subgroupGroupOf(group, els, label) },
      label,
      sub: `|\\cdot| = ${els.length}${structSuffix(group, els)}${said}`,
      note: chosen.said || undefined,
    }
  }

  return {
    ok: true,
    value: { type: 'elements', group, elements: els },
    label,
    sub: `|\\cdot| = ${els.length}${said}`,
    note: chosen.said || undefined,
  }
}

/* ── 注册表 ───────────────────────────────────────────── */

export const OPS: OpDef[] = [
  /* ══ 原子构造 ══════════════════════════════════════════ */
  {
    id: 'directProduct',
    notation: 'A \\times B',
    mechanism: 'atomic',
    primitive: true,
    doc: '直积：两个群的笛卡尔积，逐分量运算',
    impl: 'createDirectProduct',
    // 中缀用 ASCII：`x`（短、好打）与 `\times`（LaTeX 形态，与显示一致）
    infix: ['x', '\\times'],
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
      const gRef = refText(a[0])
      const hRef = refText(a[1])
      // **跨商群对齐**（G4）：第二个参数是另一个商群时（`(G/N)/(K/N)`），
      // 它的元素 id 是**那个商群母群**的编号，不能直接拿来在 G 里查——
      // 实测直接查会"侥幸命中另一个陪集"（静默算错）或判定失败。
      // 先在语义层（陪集成员集合）翻译成 G 的元素，再判定。
      // 额外一道（2026-09-29）：**陪集层**（跨商群，G4）走语义键对齐；普通元素还要求
      // 两边的 id 能**直接对着读**（同一条母群链，或都是自证式 id 的置换群）——
      // 记号群的 id 跨群会串（`C_3` 的 `e0 e1 e2` 在 `C_7` 里"也有"），
      // 只看 id 会把 `商(C_7, C_3)` 当成"子群判定失败"，而真相是两边没有共同母群。
      const cosetLevel = hasCosetElements(S.group)
      const aligned =
        !cosetLevel && !idsComparable(S.group, G) ? null : alignElementSet(G, S.elements)
      if (!aligned) {
        // `D` 是**独立构造**的群（元素和 G 对不上）时，先在 G 里找与它同构的正规子群：
        // 唯一 → 直接翻译过去当分母（求商只认正规子群，唯一性由数学保证，
        // 见 `autoTranslatedSubgroup` 的说明）；否则走分诊：措辞分开 + 给出路。
        const auto = autoTranslatedSubgroup(G, S, true)
        if (auto) {
          const Q = computeQuotientGroup(G, auto)
          if (Q) {
            const translated = `N 自动取 ${gRef} 里唯一与 ${hRef} 同构的正规子群 ${subgroupRecipe(G, gRef, auto)}`
            return {
              ok: true,
              value: { type: 'group', group: Q },
              label: `${labelText(a[0])} / ${labelText(a[1])}`,
              sub: `|G/N| = ${Q.order}，${translated}`,
              note: translated,
            }
          }
        }
        // 分诊：id 全在但世界不同（记号串号）→ 说破；有 id 不在 G 里 → "元素不在同一个群里"；
        // 都齐（同一世界里挑错了子集）→ 才是"不是子群"的实话。
        return (
          subgroupMisdiagnosis(gRef, G, hRef, S, true) ??
          fail(`${hRef} 不是 ${gRef} 的子群`, '要求含单位元且乘法封闭')
        )
      }
      // 用 G 作母群校验：元素不在 G 里 / 不封闭 / 无单位元 → null
      const sub = asCoreSubgroup(G, aligned)
      if (!sub) return fail(`${hRef} 不是 ${gRef} 的子群`, '要求含单位元且乘法封闭')
      if (!sub.isNormal) {
        return fail(`${hRef} 不是 ${gRef} 的正规子群`, '商群 G/N 要求 N \\trianglelefteq G')
      }
      const Q = computeQuotientGroup(G, sub)
      if (!Q) return fail('商群构造失败')
      /**
       * label 用**参数的数学标签**（缺口 ⑱）：`A / K` 显示成 `S_4 / ker(\varphi)`。
       *
       * 从前用 `refText`（引用名），于是用户输入 `A/D` 就只能看到 `A/D` ——
       * 名字是系统自动起的，用户要认的是数学。
       * 也不用 core 的结构符号：它是从母群拼的（`H/I` 会显示成 `C₄/N`），读起来对不上。
       */
      return {
        ok: true,
        value: { type: 'group', group: Q },
        label: `${labelText(a[0])} / ${labelText(a[1])}`,
        sub: `|G/N| = ${Q.order}`,
      }
    },
  },
  {
    id: 'map',
    notation: '映射(G, H, r2\\to e, ...)',
    mechanism: 'atomic',
    primitive: true,
    doc: '同态 f : G \\to H，由**生成元的像**给出（如 r2\\to e, s\\to s）',
    impl: 'extendFromGenerators + verifyHomomorphism',
    call: ['映射', '同态', 'map', 'hom'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'H', type: 'group' },
    ],
    variadic: { name: '像', type: 'genImage' },
    arity: 2,
    editor: true,
    result: 'map',
    run: (a) => {
      const G = groupOf(a[0])
      const H = groupOf(a[1])
      if (!G || !H) return fail('映射需要源群与靶群', '映射(G, H, r2\\to e, s\\to s)')
      const gens = getGeneratorElements(G)
      if (gens.length === 0) return fail(`${refText(a[0])} 没有生成元，无法由生成元的像定义映射`)

      const pairs: { genName: string; genId: string; image: GroupElement }[] = []
      const seen = new Set<string>()
      for (let i = 2; i < a.length; i++) {
        const raw = a[i].text
        // 三种箭头都认：→（编辑器产出）/ -> / =>（手写友好）
        const parts = raw.split(/\\to\s*|->|=>/)
        if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
          return fail(`像对的写法不对：${raw}`, '应形如 r2\\to e（生成元 \\to 像）')
        }
        const genText = parts[0].trim()
        const g = generatorOf(G, genText)
        if (!g) {
          return fail(
            `${refText(a[0])} 里没有生成元 ${genText}`,
            `生成元：${gens.map((x) => x.gen.name).join(', ')}`,
          )
        }
        if (seen.has(g.genName)) return fail(`生成元 ${genText} 给了两个像`)
        const img = resolveElementLoose(H, parts[1].trim())
        if (!img) {
          return fail(
            `${refText(a[1])} 里没有元素 ${parts[1].trim()}`,
            `元素：${H.elements.map((e) => e.label).slice(0, 24).join(', ')}`,
          )
        }
        seen.add(g.genName)
        pairs.push({ genName: g.genName, genId: g.el.id, image: img })
      }
      if (pairs.length === 0) {
        return fail('至少要给一个生成元的像', '映射(G, H, r2\\to e)')
      }

      // core 的延拓 Map 收的是**生成元元素 id**（不是名字）
      const genMapping = new Map(pairs.map((p) => [p.genId, p.image.id]))
      const full = extendFromGenerators(G, H, genMapping)
      if (!full) {
        return fail(
          '这组像无法唯一延拓成映射',
          `生成元之间的乘法关系没被保持（在 ${refText(a[0])} 里成立的等式，到 ${refText(a[1])} 里不成立）`,
        )
      }
      const res = verifyHomomorphism(G, H, full)
      if (!res.isHomomorphism) {
        const v = res.violation
        if (v) {
          return fail(
            `不是同态：f(${elementLabel(G, v.a)}\\cdot ${elementLabel(G, v.b)}) \\ne f(${elementLabel(G, v.a)})\\cdot f(${elementLabel(G, v.b)})`,
            `左 = ${elementLabel(H, v.lhs)}；右 = ${elementLabel(H, v.rhs)}`,
          )
        }
        return fail('这组像不构成同态')
      }

      const props = getHomomorphismProperties(G, H, res)
      const kernel = G.elements.filter((e) => res.kernel.includes(e.id))
      const image = H.elements.filter((e) => res.image.includes(e.id))
      const map: GalMap = {
        domain: G,
        codomain: H,
        mapping: full,
        genImages: pairs.map((p) => ({ generator: p.genName, image: p.image })),
        isHomomorphism: true,
        isInjective: props.isInjective,
        isSurjective: props.isSurjective,
        kernel,
        image,
      }
      const kind = props.isIsomorphism
        ? '同构 \\cong'
        : props.isInjective
          ? '单射（嵌入）'
          : props.isSurjective
            ? '满射'
            : '同态'
      return {
        ok: true,
        value: { type: 'map', map },
        label: `${prettySymbol(G.symbol)} \\to ${prettySymbol(H.symbol)}`,
        sub: `${kind} \\cdot|ker| = ${kernel.length} \\cdot|im| = ${image.length}`,
      }
    },
  },
  {
    id: 'conjugationAction',
    notation: '共轭作用(G)',
    mechanism: 'atomic',
    primitive: true,
    doc: 'G 通过共轭 g\\cdot x\\cdot g^-^1 作用在自身元素上',
    impl: 'computeConjugationPerms',
    call: ['共轭作用', 'conjAction', 'conjugation'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'action',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('共轭作用需要一个群')
      const perms = computeConjugationPerms(G)
      const action: GalAction = {
        group: G,
        kind: 'conjugation',
        n: G.order,
        perms,
        // Ω = G 自身（DIAGRAM_SPEC §6.4 第 1 条）：作用线因此是 G 上的**自环**。
        // 元素一个个列出来，面板上就能看到 Ω 是什么。
        omega: {
          group: G,
          label: `底集(${refText(a[0])})`,
          members: G.elements.map((e) => ({ label: e.label })),
        },
        omegaBase: 'self',
      }
      return {
        ok: true,
        value: { type: 'action', action },
        label: `共轭作用(${refText(a[0])})`,
        sub: `|\\Omega| = ${G.order} \\cdot \\Omega = ${refText(a[0])} 自身`,
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
      const action: GalAction = {
        group: G,
        kind: 'leftTranslation',
        n: G.order,
        perms,
        omega: {
          group: G,
          label: `底集(${refText(a[0])})`,
          members: G.elements.map((e) => ({ label: e.label })),
        },
        omegaBase: 'self',
      }
      return {
        ok: true,
        value: { type: 'action', action },
        label: `正则作用(${refText(a[0])})`,
        sub: `|\\Omega| = ${G.order} \\cdot \\Omega = ${refText(a[0])} 自身`,
      }
    },
  },
  {
    id: 'conjugationOnSet',
    notation: '共轭作用在(G, \\Omega)',
    mechanism: 'atomic',
    primitive: true,
    doc: 'G 通过共轭 g\\cdot x\\cdot g^-^1 作用在集合 \\Omega 上 ---- Sylow 定理的主角动作（\\Omega = Syl_p(G)）',
    recipe: '原子构造（作用）',
    impl: 'conjugateSubgroup（core）\\to 点集上的置换',
    call: ['共轭作用在', 'conjOn', 'conjugationOn'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'Omega', type: 'omega' },
    ],
    arity: 2,
    result: 'action',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('共轭作用在(\\cdot) 的第一个参数必须是群')
      const O = omegaArgOf(a[1])
      if (!O) {
        return fail(
          '共轭作用在(\\cdot) 的第二个参数必须是集合 \\Omega',
          '如 \\Omega = 底集(Syl_p(G))：先把子群集取底集成集合，再让 G 作用上去',
        )
      }
      if (G.order > ENUM_LIMIT) {
        return fail(`${prettySymbol(G.symbol)} 太大（阶 ${G.order}），共轭置换算不动`, `上限 ${ENUM_LIMIT}`)
      }

      /**
       * 作用群不必是 Ω 的**母群本身**——它的**子群**也可以。
       *
       * Sylow III 的第一条（`n_p ≡ 1 mod p`）就是让 `P ↷ Syl_p(G)`：
       * 作用群是子群 P，而 Ω 的成员是**母群 G** 的子群（不是 P 的子群），
       * 于是从前这条一律被"来自不同的群"挡掉。共轭本来就在母群里做，
       * 子群对象又沿用母群的元素 id，所以这里只要判"P 是不是 G 的子群"。
       */
      const ambient = O.group
      const sameAs = sameGroup(G, ambient)
      const asSub =
        !sameAs &&
        G.order <= ambient.order &&
        isSubgroupElementSet(
          ambient,
          G.elements.map((e) => e.id),
        )
      if (!sameAs && !asSub) {
        return fail(
          'G 与 \\Omega 来自不同的群',
          `${prettySymbol(G.symbol)} 与 ${prettySymbol(ambient.symbol)}`,
        )
      }
      const acting = asSub ? G.elements : ambient.elements

      const r = O.points
        ? conjugationPermsOnSubgroups(ambient, O.points, acting)
        : conjugationPermsOnElements(ambient, O, acting)
      if ('error' in r) return fail(r.error, r.hint)

      const action: GalAction = {
        group: G,
        kind: O.points ? 'conjugationOnSubgroups' : 'conjugation',
        n: O.members.length,
        perms: r.perms,
        // Ω 的成员记号（`⟨r⟩` / `⟨s⟩` …）——轨道 / 稳定子按它定位点
        setLabels: O.members.map((m) => m.label),
        omega: {
          group: O.group,
          label: O.label,
          members: O.members,
          from: a[1]?.kind === 'object' ? a[1].ref : undefined,
        },
        omegaBase: 'object',
      }
      return {
        ok: true,
        value: { type: 'action', action },
        label: `共轭作用在(${refText(a[0])}, ${refText(a[1])})`,
        sub: `|\\Omega| = ${O.members.length} \\cdot ${omegaDisplayName(O)}`,
      }
    },
  },
  {
    id: 'cosetAction',
    notation: '陪集作用(G, H)',
    mechanism: 'atomic',
    primitive: true,
    doc: 'G 左乘作用在 H 的左陪集上（共 [G:H] 个点）---- Sylow I 的舞台',
    impl: 'computeCosetActionPerms',
    call: ['陪集作用', 'cosetAction', 'coset'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'H', type: 'subset' },
    ],
    arity: 2,
    result: 'action',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('陪集作用(\\cdot) 的第一个参数必须是群', '如 陪集作用(G, P)')
      const S = subgroupArgOf(a[1])
      if (!S) return fail('陪集作用(\\cdot) 的第二个参数必须是子群')
      const gRef = refText(a[0])
      const hRef = refText(a[1])
      // 与 `商` 同一条对齐规则 + 同一道"id 能不能对着读"的检查（普通元素才要；陪集层走语义键）
      const cosetLevel = hasCosetElements(S.group)
      const aligned =
        !cosetLevel && !idsComparable(S.group, G) ? null : alignElementSet(G, S.elements)
      // 独立构造的 H：唯一同构的子群就直接翻译过去（陪集作用**不要求正规性**，
      // 与 `商` 的筛子不同，见 `autoTranslatedSubgroup`）
      const auto = aligned ? null : autoTranslatedSubgroup(G, S, false)
      const sub = aligned ? asCoreSubgroup(G, aligned) : auto
      const translated = auto
        ? `H 自动取 ${gRef} 里唯一与 ${hRef} 同构的子群 ${subgroupRecipe(G, gRef, auto)}`
        : null
      if (!sub) {
        return (
          subgroupMisdiagnosis(gRef, G, hRef, S, false) ??
          fail(`${hRef} 不是 ${gRef} 的子群`, '要求含单位元且乘法封闭')
        )
      }
      if (G.order > ENUM_LIMIT) {
        return fail(`${prettySymbol(G.symbol)} 太大（阶 ${G.order}），陪集置换算不动`, `上限 ${ENUM_LIMIT}`)
      }

      const { perms, n, setLabels } = computeCosetActionPerms(G, sub.elements)
      const action: GalAction = {
        group: G,
        kind: 'coset',
        n,
        perms,
        // Ω 的点是**陪集**（代表元的记号），不是 G 的元素 —— 这正是 Ω 需要
        // `set` 值类型的原因（成员不一定是群元素，见 value.ts 的 SetMember）。
        setLabels,
        omega: {
          group: G,
          label: `陪集(${gRef}/${hRef})`,
          members: setLabels.map((l) => ({ label: l })),
        },
        omegaBase: 'object',
      }
      return {
        ok: true,
        value: { type: 'action', action },
        label: `陪集作用(${gRef}, ${hRef})`,
        sub: `|\\Omega| = ${n} = [G : H]${translated ? `，${translated}` : ''}`,
        note: translated ?? undefined,
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
      if (!G) return fail('Aut(\\cdot) 需要一个群')
      const A = createAutomorphismGroup(G)
      if (!A) return fail(`${refText(a[0])} 的自同构群太大，本地算不了`, '待后端 GAP 通道')
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
    notation: 'A \\cap B',
    mechanism: 'atomic',
    primitive: true,
    doc: '交：同时属于两个集合的元素',
    impl: '本地元素集运算',
    infix: ['\\cap'],
    call: ['交', '交集', 'intersection', 'intersect'],
    params: [
      { name: 'A', type: 'subset' },
      { name: 'B', type: 'subset' },
    ],
    arity: 2,
    result: 'elements',
    run: (a, ctx) => setOp(a, '\\cap', ctx),
  },
  {
    id: 'union',
    notation: 'A \\cup B',
    mechanism: 'atomic',
    primitive: true,
    doc: '并：属于两个集合中至少一个的元素',
    impl: '本地元素集运算',
    infix: ['\\cup'],
    call: ['并', '并集', 'union'],
    params: [
      { name: 'A', type: 'subset' },
      { name: 'B', type: 'subset' },
    ],
    arity: 2,
    result: 'elements',
    run: (a, ctx) => setOp(a, '\\cup', ctx),
  },
  {
    id: 'difference',
    notation: 'A \ B',
    mechanism: 'atomic',
    primitive: true,
    doc: '差：属于 A 但不属于 B 的元素',
    impl: '本地元素集运算',
    // ⚠️ 用完整的 `\setminus` 而不是孤立的反斜杠：反斜杠现在也是**命令名的开头**
    //（`\varphi` / `\Omega` 都是合法名字），孤零零一个 `\` 当中缀会让歧义面变大。
    infix: ['\\setminus'],
    call: ['差', '差集', 'difference', 'minus'],
    params: [
      { name: 'A', type: 'subset' },
      { name: 'B', type: 'subset' },
    ],
    arity: 2,
    result: 'elements',
    run: (a, ctx) => setOp(a, '\\', ctx),
  },
  {
    id: 'productSet',
    notation: 'A \\cdot B',
    mechanism: 'atomic',
    primitive: true,
    doc: '积集：{ab : a \\in A, b \\in B}（子群时 |A\\cdot B| = |A||B| / |A\\cap B|）',
    impl: '本地元素集运算（母群乘法）',
    infix: ['\\cdot'],
    call: ['积集', 'productSet', 'setProduct'],
    params: [
      { name: 'A', type: 'subset' },
      { name: 'B', type: 'subset' },
    ],
    arity: 2,
    result: 'elements',
    run: (a, ctx) => setOp(a, '\\cdot', ctx),
  },

  {
    id: 'underlyingSet',
    notation: '底集(S)',
    mechanism: 'atomic',
    primitive: false,
    doc: '取底集：忘记结构，只把里面的东西当作点 ---- 这是造 \\Omega （被作用的集合）的正规做法',
    recipe: '原子构造（取底集 / 忘记结构）',
    impl: '本地（NormalizedSubgroup / GroupElement \\to SetMember）',
    call: ['底集', 'asSet', 'underlying'],
    params: [{ name: 'S', type: 'setlike' }],
    arity: 1,
    result: 'set',
    run: (a) => {
      const arg = a[0]
      if (!arg || arg.kind !== 'object') return fail('底集(\\cdot) 需要一个子群集 / 元素集 / 群')
      const v = arg.value
      const name = refText(arg)

      let members: SetMember[]
      let group: Group
      if (v.type === 'subgroups') {
        // 子群集 → 每个子群成为**一个点**，同时保留它的元素集
        // （面板上「取出为对象」靠它；Sylow III 的 Ω = Syl_p(G) 就是这条路）
        group = v.group
        members = v.subgroups.map((s) => ({ label: s.label, subgroupElements: s.elements }))
      } else if (v.type === 'elements') {
        group = v.group
        members = v.elements.map((e) => ({ label: e.label }))
      } else if (v.type === 'group') {
        group = v.group
        members = v.group.elements.map((e) => ({ label: e.label }))
      } else {
        return fail(
          `${name} 没有底集可取`,
          '底集(\\cdot) 接受子群集（如 Syl(G, 2)）\\cdot 元素集 \\cdot 群',
        )
      }

      return {
        ok: true,
        value: {
          type: 'set',
          set: { group, label: `底集(${name})`, members, from: arg.ref },
        },
        label: `底集(${name})`,
        sub: `|\\Omega| = ${members.length}`,
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
    impl: 'getGroupCenter \\to buildSubgroupGroup',
    call: ['Z', '中心', 'center'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('Z(\\cdot) 需要一个群')
      const els = getGroupCenter(G)
      return {
        ok: true,
        value: { type: 'group', group: subgroupGroupOf(G, els, `Z(${refText(a[0])})`) },
        label: `Z(${refText(a[0])})`,
        sub: `|Z| = ${els.length}${structSuffix(G, els)}`,
      }
    },
  },
  {
    id: 'innerAutomorphismGroup',
    notation: 'Inn(G)',
    mechanism: 'action',
    primitive: false,
    doc: '内自同构群：共轭作用给出的自同构全体，Inn(G) \\cong G / Z(G)（第一同构定理）',
    recipe: '商( G, Z(G) )（第一同构定理：G/Z(G) \\cong Inn(G)）',
    impl: 'getGroupCenter \\to computeQuotientGroup',
    call: ['Inn', '内自同构群', 'innerAutomorphisms'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('Inn(\\cdot) 需要一个群')
      /**
       * 走**第一同构定理**这条经典路径：`G → Aut(G), g ↦ conj_g` 的核是 Z(G)，
       * 所以 `Inn(G) ≅ G/Z(G)`——这也是课本上唯一"算得动"的算法。
       * 产出的群对象元素就是陪集，面板的结论层会把它识别成具体的同构类。
       */
      const Z = getGroupCenter(G)
      const sub: Subgroup = {
        elements: Z,
        order: Z.length,
        index: G.order / Z.length,
        generators: [],
        isNormal: true,
      }
      const Q = computeQuotientGroup(G, sub)
      if (!Q) return fail(`${refText(a[0])} 商掉中心算不出来`)
      return {
        ok: true,
        value: { type: 'group', group: Q },
        label: `Inn(${refText(a[0])})`,
        sub: `|Inn| = ${Q.order} = |G| / |Z| = ${G.order} / ${Z.length}`,
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
    impl: 'getCentralizer \\to buildSubgroupGroup',
    call: ['C_G', '中心化子', 'centralizer'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'S', type: 'subset' },
    ],
    arity: 2,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('C_G(\\cdot) 的第一个参数必须是群')
      const S = elementSetArgOf(a[1], G)
      if (!S) {
        return fail(
          `C_G(\\cdot) 的第二个参数必须是元素集、群，或一个元素记号`,
          `如 C_G(G, H) 或 C_G(G, (12)(34))`,
        )
      }
      const els = getCentralizer(G, S.elements)
      return {
        ok: true,
        value: { type: 'group', group: subgroupGroupOf(G, els, `C(${refText(a[1])})`) },
        label: `C(${refText(a[1])})`,
        sub: `|C| = ${els.length}${structSuffix(G, els)}`,
      }
    },
  },
  {
    id: 'normalizer',
    notation: 'N_G(H)',
    mechanism: 'action',
    primitive: false,
    doc: '正规化子：使 gHg^-^1 = H 的元素 g 全体',
    recipe: '稳定子( 共轭作用在子群集(G), H )',
    impl: 'getNormalizer \\to buildSubgroupGroup',
    call: ['N_G', '正规化子', 'normalizer'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'H', type: 'subset' },
    ],
    arity: 2,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('N_G(\\cdot) 的第一个参数必须是群')
      const S = subgroupArgOf(a[1]) ?? elementSetArgOf(a[1], G)
      if (!S) return fail('N_G(\\cdot) 的第二个参数必须是子群（或一个元素记号）')
      const els = getNormalizer(G, S.elements)
      return {
        ok: true,
        value: { type: 'group', group: subgroupGroupOf(G, els, `N(${refText(a[1])})`) },
        label: `N(${refText(a[1])})`,
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
      if (!A) return fail('轨道(\\cdot) 的第一个参数必须是作用', '先用 共轭作用(G) / 正则作用(G) 造一个')
      const x = refText(a[1])
      // 标签带上**作用的名字**：Sylow III 的图上同时有 `G ↷ Ω` 与 `P ↷ Ω`，
      // 两个轨道若都叫 `Orb(1)`，画布上就出现两个同名节点（真截图抓到的）。
      const act = refText(a[0])
      const idx = omegaIndexOf(A, x)
      if (idx < 0) return fail(`\\Omega 中没有点 ${x}`, omegaHint(A))
      const { orbits, orbitOf } = computeOrbits(A.perms, A.n)
      const members = orbits[orbitOf[idx]]?.elements ?? []

      // Ω 是**集合**（成员可能是子群，如 `Syl_p(G)`）→ 轨道是 Ω 的子集，
      // 产出 `set`：轨道本身就该是个能继续被作用 / 被取出的对象。
      if (A.omega && A.omegaBase === 'object') {
        const picked = members.map((i) => A.omega?.members[i]).filter((m): m is SetMember => !!m)
        return {
          ok: true,
          value: {
            type: 'set',
            set: { group: A.group, label: `轨道_${act}(${x})`, members: picked },
          },
          label: `Orb_${act}(${x})`,
          sub: `|Orb| = ${members.length}${members.length === A.n ? ' \\cdot 传递（就是整个 \\Omega ）' : ''}`,
        }
      }

      const els = omegaElements(A, members)
      if (!els) return fail('陪集作用的轨道暂不支持', COSET_OMEGA_HINT)
      return {
        ok: true,
        value: { type: 'elements', group: A.group, elements: els },
        label: `Orb_${act}(${x})`,
        sub: `|Orb| = ${members.length}`,
      }
    },
  },
  {
    id: 'stabilizers',
    notation: '稳定子(A, x)',
    mechanism: 'action',
    primitive: true,
    doc: 'x 的稳定子：使 g\\cdot x = x 的元素 g 全体（G 的子群）',
    impl: 'computeStabilizers \\to buildSubgroupGroup',
    call: ['稳定子', 'stabilizer', 'stab'],
    params: [
      { name: 'A', type: 'action' },
      { name: 'x', type: 'element' },
    ],
    arity: 2,
    // **稳定子是 G 的子群**，所以和其它子群结果一样升级为真群对象
    // （U0 那批升级漏了它：`Stab` 的 result 还停在 'elements'，
    //  于是它没法继续参与群运算，和其它子群结果不一致）。
    result: 'group',
    run: (a) => {
      const A = actionOf(a[0])
      if (!A) return fail('稳定子(\\cdot) 的第一个参数必须是作用')
      const x = refText(a[1])
      // 标签带上**作用的名字**：Sylow III 的图上同时有 `G ↷ Ω` 与 `P ↷ Ω`，
      // 两个轨道若都叫 `Orb(1)`，画布上就出现两个同名节点（真截图抓到的）。
      const act = refText(a[0])
      const idx = omegaIndexOf(A, x)
      if (idx < 0) return fail(`\\Omega 中没有点 ${x}`, omegaHint(A))
      const stabs = computeStabilizers(A.group, A.perms, A.n)
      const ids = new Set(stabs.get(idx) ?? [])
      const els = A.group.elements.filter((e) => ids.has(e.id))
      return {
        ok: true,
        value: { type: 'group', group: subgroupGroupOf(A.group, els, `Stab_${refText(a[0])}(${x})`) },
        label: `Stab_${refText(a[0])}(${x})`,
        sub: `|Stab| = ${els.length}${structSuffix(A.group, els)}`,
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
      if (!A) return fail('不动点(\\cdot) 需要作用')
      const pts = computeFixedPoints(A.perms, A.n)
      // 标签用**作用自己的名字**：从前写死成 `Fix(A)`，于是 `不动点(B)` 也标成 `Fix(A)`
      const act = refText(a[0])
      if (A.omega && A.omegaBase === 'object') {
        const picked = pts.map((i) => A.omega?.members[i]).filter((m): m is SetMember => !!m)
        return {
          ok: true,
          value: {
            type: 'set',
            set: { group: A.group, label: `不动点_${act}`, members: picked },
          },
          label: `Fix_${act}`,
          sub: `|Fix| = ${pts.length}`,
        }
      }
      const els = omegaElements(A, pts)
      if (!els) return fail('陪集作用的不动点暂不支持', COSET_OMEGA_HINT)
      return {
        ok: true,
        value: { type: 'elements', group: A.group, elements: els },
        label: `Fix_${act}`,
        sub: `|Fix| = ${pts.length}`,
      }
    },
  },
  {
    id: 'orbitCount',
    notation: '轨道数(A)',
    mechanism: 'action',
    primitive: false,
    doc: '轨道条数：直接数 = Burnside 引理的平均 (1/|G|) \\cdot \\sum |Fix(g)|（两条路当场互相核对）',
    recipe: '(1/|G|) \\cdot \\sum_{g \\in G} |Fix(g)|（Burnside 引理）',
    impl: 'computeOrbits + computeBurnsideCount',
    call: ['轨道数', 'burnside', 'Burnside', 'orbitCount'],
    params: [{ name: 'A', type: 'action' }],
    arity: 1,
    result: 'number',
    run: (a) => {
      const A = actionOf(a[0])
      if (!A) return fail('轨道数(\\cdot) 需要一个作用', '先用 共轭作用(G) / 正则作用(G) 造一个')
      const { orbits } = computeOrbits(A.perms, A.n)
      const direct = orbits.length
      /**
       * Burnside 引理的另一条路：`(1/|G|)·Σ|Fix(g)|`。
       *
       * 两条路**互相核对**——直接数轨道是本系统自己算的，Burnside 平均值走的
       * 是 core 的定理实现；两边对不上一定是哪里错了（这正是 U12 那条教训：
       * "概率性正确"最危险，得有一条会叫的线）。
       */
      const average = computeBurnsideCount(A.perms, A.n)
      const sum = average * A.group.order
      const okMark = Math.abs(average - direct) < 1e-9 ? 'v' : 'x'
      return {
        ok: true,
        value: { type: 'number', label: `${direct}`, value: direct },
        label: `轨道数(${refText(a[0])})`,
        sub: `= ${direct}（Burnside: ${sum} / ${A.group.order} = ${average} ${okMark}）`,
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
    impl: 'computeKernelFromMapping \\to buildSubgroupGroup',
    call: ['ker', '核', 'kernel'],
    params: [{ name: 'f', type: 'map' }],
    arity: 1,
    result: 'group',
    run: (a) => {
      const M = mapArgOf(a[0])
      if (!M) return fail('核需要一个映射对象', '映射由对象编辑器产出（U3）')
      if (!M.mapping) return fail('该映射没有完整映射表', '生成元的像不足以定核，需编辑器补全（U3）')
      const ids = new Set(computeKernelFromMapping(M.domain, M.mapping, M.codomain.identity.id))
      const els = M.domain.elements.filter((e) => ids.has(e.id))
      return {
        ok: true,
        value: { type: 'group', group: subgroupGroupOf(M.domain, els, `ker(${refText(a[0])})`) },
        label: `ker(${refText(a[0])})`,
        sub: `|ker| = ${els.length}`,
      }
    },
  },
  {
    id: 'image',
    notation: '像(f, H)',
    mechanism: 'action',
    primitive: false,
    doc: '像：只给 f \\to 整个像 im f；再给一个子群 H（H \\le 定义域）\\to f(H)，靶群里的子群（第二同构定理的 H\'）',
    recipe: '把 H 的每个元素过一遍映射表 \\to 靶群的子群',
    impl: 'computeImageFromMapping（整体）/ 逐元素取像 + buildSubgroupGroup（子群）',
    call: ['im', '像', 'image'],
    params: [
      { name: 'f', type: 'map' },
      // **可选第二参**：`像(f)` 是整个像（U14 就有），`像(f, H)` 是子群的像（U20 补）。
      // 用同一个 op 而不是新开一个：用户嘴里都叫"像"，且 `像` 这个别名只该指向一条路。
      { name: 'H', type: 'group', optional: true },
    ],
    arity: 1,
    optional: 1,
    result: 'group',
    run: (a) => {
      const M = mapArgOf(a[0])
      if (!M) return fail('像需要一个映射对象', '映射由对象编辑器产出（U3）')
      if (!M.mapping) return fail('该映射没有完整映射表', '生成元的像不足以定像，需编辑器补全（U3）')

      // ── 两参形态：`像(f, H) = f(H)`（U20）──
      const S = groupOf(a[1])
      /**
       * 第二位**给了、却不是群**：明确报出来，别静默当成没给。
       *
       * 会撞上的场景：从「像 f(H)」进 pending 后误点了别的对象（映射 / 集合）——
       * 那时用户明明点了一下，系统却一声不吭地算成 `im f`（"点了跟没点一样"最费解）。
       * 空第二参（`像(f, )` 这种留空写法）仍按"没给"处理。
       */
      if (a[1] && !S && textOf(a[1]).trim() !== '') {
        return fail(
          `像的第二个参数得是群（H 是定义域的子群），收到的是「${refText(a[1])}」`,
          'H 要从定义域里取（如 闭包(定义域, 生成元)）；不给 H 就直接算整个像 im f',
        )
      }
      if (S) {
        const dom = M.domain
        // 三关：阶不能超 → id 全覆盖 → 真的封闭（前两关只是快速筛，判据交给 core）
        if (S.order > dom.order) {
          return fail(
            `「${refText(a[1])}」比定义域还大，不可能是它的子群`,
            `子群像要求 H \\le ${prettySymbol(dom.symbol)}`,
          )
        }
        // 表示不通的两态（跨世界 / id 不在）统一走分诊；都在才谈得上"封闭不封闭"
        const bad = subgroupMisdiagnosis(
          prettySymbol(dom.symbol),
          dom,
          refText(a[1]),
          { group: S, elements: S.elements },
          false,
        )
        if (bad) return bad
        const checked = subgroupFromElementIds(dom, S.elements.map((e) => e.id))
        if (!checked || checked.order !== S.order) {
          return fail(
            `「${refText(a[1])}」不是 ${prettySymbol(dom.symbol)} 的子群`,
            '子集还不够----得对乘法封闭',
          )
        }
        // 逐元素取像（映射表可能对 S 里的元素没有词条 → 那是映射不完整，直接报出来）
        const imgIds = new Set<string>()
        for (const e of S.elements) {
          const y = M.mapping.get(e.id)
          if (!y) {
            return fail(
              `映射表里没有 ${prettySymbol(dom.symbol)} 的元素「${e.label}」的像`,
              '该映射不完整，无法取子群的像（用对象编辑器补全映射）',
            )
          }
          imgIds.add(y)
        }
        const els = M.codomain.elements.filter((e) => imgIds.has(e.id))
        const name = `${refText(a[0])}(${refText(a[1])})`
        return {
          ok: true,
          value: { type: 'group', group: subgroupGroupOf(M.codomain, els, name) },
          label: name,
          sub: `|f(H)| = ${els.length}`,
          note: `H 在 ${prettySymbol(M.codomain.symbol)} 里的像`,
        }
      }

      const ids = new Set(computeImageFromMapping(M.mapping))
      const els = M.codomain.elements.filter((e) => ids.has(e.id))
      return {
        ok: true,
        value: { type: 'group', group: subgroupGroupOf(M.codomain, els, `im(${refText(a[0])})`) },
        label: `im(${refText(a[0])})`,
        sub: `|im| = ${els.length}`,
      }
    },
  },

  /* ══ 关系（U20）═══════════════════════════════════════ */
  {
    id: 'contains',
    notation: '包含(H, G) / H \\subseteq G',
    mechanism: 'atomic',
    primitive: false,
    doc: '声明 H 是 G 的子群----画布上长出一条包含箭头（正规性由工具现场判定）',
    recipe: '子群判定（单位元 + 乘法封闭）\\to 一条关系边',
    impl: 'relations.containment（与信息面板的「关系」层同一判据）',
    infix: ['\\subseteq'],
    call: ['包含', 'include', 'subset'],
    params: [
      { name: 'H', type: 'group' },
      { name: 'G', type: 'group' },
    ],
    arity: 2,
    result: 'relation',
    run: (a) => {
      const H = groupOf(a[0])
      const G = groupOf(a[1])
      if (!H || !G) return fail('包含(\\cdot, \\cdot) 需要两个群对象', '形如 H \\subseteq G')
      const hn = refText(a[0])
      const gn = refText(a[1])
      if (H === G) return fail('两边是同一个对象', '包含要求两个不同的群')
      if (H.order > G.order) {
        return fail(
          `|${hn}| = ${H.order} > |${gn}| = ${G.order}，不可能是它的子群`,
          '子群判定第一关就是阶整除',
        )
      }
      // 判据复用 U19 的 `containment()`（信息面板「关系」层用的是同一份）——
      // 于是"声明出来的关系"和"算出来的关系"永远一致，不会出现两种说法
      const c = containment(H, G)
      if (!c) {
        /**
         * 分诊三态（与 `商` 同一套）：
         *   · 世界不同（`D = V_4` 独立构造、或记号串号）→ "元素记号碰巧重合"；
         *   · 有 id 不在 G 里 → "元素不在同一个群里"；
         *   · 都齐（同一世界里挑错了子集）→ 才是"不是子集 / 不封闭"的实话。
         */
        const out = subgroupMisdiagnosis(gn, G, hn, { group: H, elements: H.elements }, false)
        if (out) return out
        return fail(
          `「${hn}」不是「${gn}」的子群`,
          `${prettySymbol(H.symbol)} 的元素不是 ${prettySymbol(G.symbol)} 的子集，或对乘法不封闭`,
        )
      }
      // 指数 1 = 元素完全相同 = 同一个群（U19 的关系层把这一档单列成「同一」）。
      // 包含是**严格**的：`H ⊆ H` 不是一条关系，是同一句话说了两遍。
      if (c.index === 1) {
        return fail(
          `「${hn}」与「${gn}」的元素完全相同，就是同一个群`,
          '包含是严格小于；要说明"它们相等"不属于包含关系',
        )
      }
      return {
        ok: true,
        value: {
          type: 'relation',
          relation: {
            from: H,
            to: G,
            index: c.index,
            isNormal: c.normal === true,
            normalUnknown: c.normal === null,
          },
        },
        label: `${labelText(a[0])} ${c.normal === true ? '\\trianglelefteq' : '\\subseteq'} ${labelText(a[1])}`,
        sub: `|H| = ${H.order} \\cdot [G:H] = ${c.index}`,
        note:
          c.normal === true
            ? '正规子群（判出来的，不是声明的）'
            : c.normal === null
              ? '正规性超出可判定范围（群太大，未枚举）'
              : '非正规子群',
      }
    },
  },
  {
    id: 'isomorphism',
    notation: '同构(A, B) / A \\cong B',
    mechanism: 'atomic',
    primitive: false,
    doc: '声明 A 与 B 同构----画布上长出一条双向箭头（同构判据与信息面板那句「同构于」同源）',
    recipe: '同构识别（阶 \\to 结构不变量）\\to 一条关系边',
    impl: 'insights.isomorphismOf（与信息面板「同构」结论同一判据）',
    infix: ['\\cong'],
    call: ['同构', 'isomorphic', 'iso'],
    params: [
      { name: 'A', type: 'group' },
      { name: 'B', type: 'group' },
    ],
    arity: 2,
    result: 'relation',
    run: (a) => {
      const A = groupOf(a[0])
      const B = groupOf(a[1])
      if (!A || !B) return fail('同构(\\cdot, \\cdot) 需要两个群对象', '形如 A \\cong B')
      const an = labelText(a[0])
      const bn = labelText(a[1])
      if (A === B) return fail('两边是同一个对象', '同构要两个不同的群')
      // **第一关不用识别**：阶不同必不同构（Lagrange 的直接推论）——这一关永远判得出来
      if (A.order !== B.order) {
        return fail(
          `|${an}| = ${A.order} \\ne |${bn}| = ${B.order}，阶不同不可能同构`,
          '同构必保阶',
        )
      }
      const verdict = isomorphismOf(A, B)
      if (verdict === 'no') {
        const ia = identifyGroup(A)
        const ib = identifyGroup(B)
        return fail(
          `${an} 与 ${bn} 阶相同但不同构`,
          ia && ib ? `识别为 ${prettySymbol(ia)} 与 ${prettySymbol(ib)}` : '结构不变量不同',
        )
      }
      /**
       * `unknown` 也**收下**这条声明 —— 识别不出不等于不同构，用户可能自己证得出来。
       * 但账上照实说"未判定"，不许拿'阶相同'冒充结论（与 `containment` 超限时的口径一致）。
       */
      const iso = verdict === 'yes' ? identifyGroup(A) : null
      return {
        ok: true,
        value: {
          type: 'relation',
          relation: {
            kind: 'isomorphic',
            from: A,
            to: B,
            index: 1,
            isNormal: false,
            isoSymbol: iso ?? null,
          },
        },
        label: `${an} \\cong ${bn}`,
        sub: iso
          ? `都 \\cong ${prettySymbol(iso)}`
          : `阶相同（${A.order}），同构类未识别出`,
        note:
          verdict === 'yes'
            ? '同构（判出来的：同构类识别一致）'
            : '超出本地识别范围，未判定，这条声明是你下的，不是工具证的',
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
      if (!G) return fail('Sub(\\cdot) 需要一个群')
      const subs = normalizeSubgroups(findAllSubgroups(G), G)
      return {
        ok: true,
        value: { type: 'subgroups', group: G, subgroups: subs },
        label: `Sub(${refText(a[0])})`,
        sub: `${subs.length} 个子群`,
      }
    },
  },
  {
    id: 'maximalSubgroups',
    notation: '极大子群(G)',
    mechanism: 'enumerate',
    primitive: false,
    doc: '极大子群：不能落在任何更大的真子群里的真子群（子群格上 G 的直接下层）',
    recipe: '筛( 格(G) 的覆盖边, 上端 = G )',
    impl: 'computeSubgroupLattice',
    call: ['极大子群', 'maximalSubgroups', 'maxSub'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'subgroups',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('极大子群(\\cdot) 需要一个群')
      /**
       * 守卫必须**自己**判：core 的 `computeSubgroupLattice` 超限时不报错，
       * 而是退化成"{e} 与 G 两个节点"（实测 216 阶群）——照单全收会把**平凡子群**
       * 当成 G 的极大子群，正是最该避开的那类静默错误。
       */
      if (G.order > ENUMERATION_LIMIT) {
        return fail(
          `|G| = ${G.order} 超过子群枚举线 ${ENUMERATION_LIMIT}，极大子群本地算不了`,
          '待后端 GAP 通道',
        )
      }
      const { nodes, edges } = computeSubgroupLattice(G)
      const full = nodes.find((n) => n.order === G.order)
      // 格边的方向：小的在 `from`、大的在 `to`（自下而上）——极大子群 = 指向 G 的覆盖边
      const targets = full ? edges.filter((e) => nodes[e.to] === full).map((e) => nodes[e.from]) : []
      const subs = targets.map((n) => {
        const ids = new Set(n.elementIds)
        const elements = G.elements.filter((e) => ids.has(e.id))
        return normalizeSubgroup(
          {
            elements,
            order: n.order,
            index: n.index,
            generators: findMinimalGenerators(elements, G),
            isNormal: n.isNormal,
          },
          G,
        )
      })
      subs.sort((x, y) => y.order - x.order)
      return {
        ok: true,
        value: { type: 'subgroups', group: G, subgroups: subs },
        label: `极大子群(${refText(a[0])})`,
        sub: subs.length > 0 ? `${subs.length} 个，最大阶 ${subs[0].order}` : '没有真子群（G 本身平凡）',
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
      if (!G) return fail('pSub(\\cdot) 的第一个参数必须是群')
      const p = intOf(a[1])
      if (p === null) return fail('pSub(\\cdot) 的第二个参数必须是整数')
      const bad = checkPrime(p, 'pSub')
      if (bad) return fail(bad)
      const subs = normalizeSubgroups(findAllPSubgroups(G, p), G)
      return {
        ok: true,
        value: { type: 'subgroups', group: G, subgroups: subs },
        label: `pSub(${refText(a[0])}, ${p})`,
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
    recipe: '筛( 枚举(G, 子群), p-群 \\wedge 极大 )',
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
      if (!G) return fail('Syl_p(\\cdot) 的第一个参数必须是群')
      const p = intOf(a[1])
      if (p === null) return fail('Syl_p(\\cdot) 的第二个参数必须是整数')
      const bad = checkPrime(p, 'Syl_p')
      if (bad) return fail(bad)
      const subs = normalizeSubgroups(findSylowSubgroups(G, p), G)
      const order = subs[0]?.order ?? 1
      return {
        ok: true,
        value: { type: 'subgroups', group: G, subgroups: subs },
        label: `Syl(${refText(a[0])}, ${p})`,
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
      if (!G) return fail('正规子群(\\cdot) 需要一个群')
      const subs = normalizeSubgroups(findAllNormalSubgroups(G), G)
      return {
        ok: true,
        value: { type: 'subgroups', group: G, subgroups: subs },
        label: `正规子群(${refText(a[0])})`,
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
    impl: 'commutatorClosure \\to buildSubgroupGroup',
    call: ['换位子群', 'commutator'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('换位子群(\\cdot) 需要一个群')
      const els = commutatorClosure(G, G.elements, G.elements)
      const t = refText(a[0])
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
    notation: '\\langle S\\rangle',
    mechanism: 'iterate',
    primitive: false,
    doc: '生成子群：把 S 在乘法下反复闭合到不再增长；也可写 \\langle G, (123), (12)\\rangle 从记号生成',
    recipe: '迭代(乘法, 直到封闭)',
    impl: 'closeUnderMultiply \\to buildSubgroupGroup',
    call: ['闭包', '生成子群', 'closure', 'generate'],
    params: [
      { name: 'S', type: 'subset' },
      { name: 'g_1', type: 'element', optional: true },
      { name: 'g_2', type: 'element', optional: true },
      { name: 'g_3', type: 'element', optional: true },
    ],
    arity: 1,
    optional: 3,
    result: 'group',
    run: (a) => {
      const G0 = groupOf(a[0])
      let group: Group
      let seeds: GroupElement[]
      let genTexts: string[]
      // 「上下文群」形态**只在后面还有元素参数时**才成立：
      //   `闭包(G, r2)` → G 当上下文，种子来自 r2
      //   `闭包(J)`     → J 自己就是（子）群对象，**取它的元素当种子**
      // 之前只判 `if (G0)`，于是 `闭包(J)` 落到"G 当上下文 + 空种子"⇒ 得到平凡群
      // （复现定理的体检抓到的：`Z ∩ C` 阶 2，闭包后变阶 1）。
      if (G0 && a.length > 1) {
        group = G0
        seeds = []
        genTexts = a.slice(1).map(refText)
      } else {
        const S = subgroupArgOf(a[0])
        if (!S) return fail('\\langle S\\rangle 需要一个集合', '也可写 \\langle G, g_1, g_2\\rangle ：群在前当上下文，后面填元素记号')
        group = S.group
        seeds = [...S.elements]
        genTexts = a.map(refText)
      }
      // 第 0 个参数已经当过"种子来源"了（集合模式），元素参数一律从 1 号位起
      for (let i = 1; i < a.length; i++) {
        const el = elementArgOf(a[i], group)
        if (!el) {
          return fail(
            `${prettySymbol(group.symbol)} 中没有元素 ${textOf(a[i])}`,
            `元素：${elementListHint(group)}`,
          )
        }
        seeds.push(el)
      }
      if (seeds.length === 0) seeds = [group.identity]

      const els = closeUnderMultiply(group, seeds)
      const label = genTexts.length > 0 ? `\\langle ${genTexts.join(', ')}\\rangle` : '\\langle \\rangle'
      return {
        ok: true,
        value: { type: 'group', group: subgroupGroupOf(group, els, label) },
        label,
        sub: `|\\langle S\\rangle| = ${els.length}${structSuffix(group, els)}`,
      }
    },
  },

  /* ══ 属性 ══════════════════════════════════════════════ */
  {
    id: 'elementOrder',
    notation: 'ord(G, g)',
    mechanism: 'property',
    primitive: false,
    doc: '元素 g 的阶：使 g^n = e 的最小正整数 n',
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
      if (!G) return fail('ord(\\cdot) 的第一个参数必须是群')
      const txt = refText(a[1])
      const el = resolveElementLoose(G, txt)
      if (!el) return fail(`${refText(a[0])} 中没有元素 ${txt}`, `元素：${elementListHint(G)}`)
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
    doc: '整数素因子分解 n = \\prod p^e',
    impl: 'factorizeOrder',
    call: ['分解', 'factor', 'factorize'],
    params: [{ name: 'n', type: 'int' }],
    arity: 1,
    result: 'number',
    run: (a) => {
      const n = intOf(a[0])
      if (n === null) return fail('分解(\\cdot) 需要一个整数')
      if (n < 1) return fail('分解(\\cdot) 只接受正整数')
      const fs = factorizeOrder(n)
      const pretty = fs.map((f) => (f.exponent === 1 ? `${f.prime}` : `${f.prime}${superscript(f.exponent)}`)).join('\\cdot ')
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
      if (p < 2) return fail('Cmod(\\cdot) 的 p 必须 \\ge 2')
      if (n < 0 || k < 0) return fail('Cmod(\\cdot) 只接受非负整数')
      const v = binomialMod(n, k, p)
      return {
        ok: true,
        value: { type: 'number', label: `${v}`, value: v },
        label: `C(${n}, ${k}) mod ${p}`,
        sub: `= ${v}`,
      }
    },
  },
  {
    id: 'gcd',
    notation: 'gcd(a, b)',
    mechanism: 'arithmetic',
    primitive: false,
    doc: '最大公因数（`闭包(G, r6, r4)` 那类"生成元的合成"里天天用到的那一步）',
    impl: '本地（欧几里得）',
    call: ['gcd', '最大公因数', '最大公约数'],
    params: [
      { name: 'a', type: 'int' },
      { name: 'b', type: 'int' },
    ],
    arity: 2,
    result: 'number',
    run: (a) => {
      const x = intOf(a[0])
      const y = intOf(a[1])
      if (x === null || y === null) return fail('gcd(\\cdot) 需要两个整数')
      if (x < 0 || y < 0) return fail('gcd(\\cdot) 只接受非负整数')
      const v = gcdInt(x, y)
      return {
        ok: true,
        value: { type: 'number', label: `${v}`, value: v },
        label: `gcd(${x}, ${y})`,
        sub: `= ${v}`,
      }
    },
  },
  {
    id: 'lcm',
    notation: 'lcm(a, b)',
    mechanism: 'arithmetic',
    primitive: false,
    doc: '最小公倍数（`a \\cdot b = gcd \\cdot lcm`）',
    impl: '本地（gcd \\to lcm）',
    call: ['lcm', '最小公倍数'],
    params: [
      { name: 'a', type: 'int' },
      { name: 'b', type: 'int' },
    ],
    arity: 2,
    result: 'number',
    run: (a) => {
      const x = intOf(a[0])
      const y = intOf(a[1])
      if (x === null || y === null) return fail('lcm(\\cdot) 需要两个整数')
      if (x < 0 || y < 0) return fail('lcm(\\cdot) 只接受非负整数')
      const v = x === 0 || y === 0 ? 0 : (x / gcdInt(x, y)) * y
      return {
        ok: true,
        value: { type: 'number', label: `${v}`, value: v },
        label: `lcm(${x}, ${y})`,
        sub: `= ${v}`,
      }
    },
  },
  {
    id: 'eulerPhi',
    notation: '\\varphi(n)',
    mechanism: 'arithmetic',
    primitive: false,
    doc: '欧拉函数：1 \\le k \\le n 里与 n 互素的 k 的个数（= n \\cdot \\prod (1 - 1/p)）',
    impl: '本地（走 factorizeOrder）',
    call: ['phi', '欧拉函数', 'eulerPhi'],
    params: [{ name: 'n', type: 'int' }],
    arity: 1,
    result: 'number',
    run: (a) => {
      const n = intOf(a[0])
      if (n === null) return fail('\\varphi(\\cdot) 需要一个整数')
      if (n < 1) return fail('\\varphi(\\cdot) 只接受正整数')
      let v = n
      for (const f of factorizeOrder(n)) v = (v / f.prime) * (f.prime - 1)
      return {
        ok: true,
        value: { type: 'number', label: `${v}`, value: v },
        label: `\\varphi(${n})`,
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
  /** 群对象当集合读的共用判据（见 `subset` 的分支注释）。 */
  const groupAsSet = (g: Group): boolean => {
    const groups = earlier.filter((e) => e.type === 'group')
    if (groups.length === 0) return true
    return groups.some(
      (e) => e.type === 'group' && isSubgroupElementSet(e.group, g.elements.map((x) => x.id)),
    )
  }

  switch (t) {
    case 'group':
      return v.type === 'group'
    case 'action':
      return v.type === 'action'
    case 'map':
      return v.type === 'map'
    case 'setlike': {
      // **集合代数**（`∩ ∪ ∖ ·` 与 `底集`）：子群集列表**整体**当集合读
      if (v.type === 'elements' || v.type === 'subgroups' || v.type === 'set') return true
      if (v.type !== 'group') return false
      return groupAsSet(v.group)
    }
    case 'omega': {
      // Ω：恰好是 `omegaArgOf` 收的那几种（**不收 subgroups 列表**，哪怕是单元素）
      if (v.type === 'set' || v.type === 'elements') return true
      if (v.type !== 'group') return false
      return groupAsSet(v.group)
    }
    case 'subset': {
      // **单个**数集。`subgroups` 只在恰好一个成员时收——那时它等于一个子群
      //（`闭包(S)` / `商(G, N)` 这类就是这么用的）。
      if (v.type === 'elements' || v.type === 'set') return true
      if (v.type === 'subgroups') return v.subgroups.length === 1
      if (v.type !== 'group') return false
      // 群对象当集合读，且前面有群参数时要求它是其中某个的子群
      //（否则 `A × B` 的 B 也会被当成集合，选中两个群就冒出多余的候选）
      return groupAsSet(v.group)
    }
    case 'element':
    case 'prime':
    case 'int':
    case 'genImage':
      return false // 画布上选不出来（由文本 / 编辑器补）
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

/**
 * 中缀符号，**按长度降序** —— 长串必须先试。
 *
 * 反例：若 `\cap` 与 `\c` 同时在表里，短的会抢先匹配掉长的前缀。
 * 排序是**符号表自身**的纪律，不依赖 OPS 的书写顺序。
 */
export const INFIX_SYMBOLS: string[] = [...new Set(INFIX_TABLE.map((x) => x.sym))].sort(
  (a, b) => b.length - a.length,
)

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
  cosetAction: '陪集作用(G, P)',
  automorphismGroup: 'Aut(G)',
  intersection: 'A \\cap B',
  union: 'A \\cup B',
  difference: 'A \ B',
  productSet: 'A \\cdot B',
  center: 'Z(G)',
  centralizer: 'C_G(G, S)',
  normalizer: 'N_G(G, H)',
  orbits: '轨道(A, e)',
  stabilizers: '稳定子(A, e)',
  fixedPoints: '不动点(A)',
  orbitCount: '轨道数(A)',
  kernel: 'ker(f)',
  image: 'im(f)',
  subgroups: 'Sub(G)',
  maximalSubgroups: '极大子群(G)',
  innerAutomorphismGroup: 'Inn(G)',
  pSubgroups: 'pSub(G, 2)',
  sylow: 'Syl(G, 2)',
  normalSubgroups: '正规子群(G)',
  commutatorGroup: '换位子群(G)',
  closure: '\\langle G, (123), (12)\\rangle',
  elementOrder: 'ord(G, r2)',
  factorize: '分解(12)',
  binomial: 'C(12, 4)',
  binomialMod: 'Cmod(12, 4, 2)',
  gcd: 'gcd(12, 18)',
  lcm: 'lcm(4, 6)',
  eulerPhi: 'phi(12)',
}

export function opTemplate(op: OpDef): string {
  return TEMPLATES[op.id] ?? op.notation
}
