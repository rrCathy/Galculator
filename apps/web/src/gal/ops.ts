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
  createDirectProduct,
  elementOrder,
  elementOrderDistribution,
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
import { asciiSymbol, prettySymbol, subscript, superscript } from './pretty'
import { idsComparable, rememberParent, rootOf, sameGroup } from './parents'
import { elementSemanticKey } from './semantic'
// 「G 里有没有与 H 同构的子群」—— 求商 / 陪集作用的自动翻译（U30）、报错时的配方（U29）、
// 集合运算的候选对齐（U32），以及 `containment` 的嵌入关（U38）**共用同一份搜索**
import { ENUM_LIMIT, hasCosetElements, isomorphicSubgroupsIn } from './embedding'
// 自定义作用（U52）：`customAction(G, n, a\to (1 2 3 4))`。
// 生成元记号的对齐（`resolveGenerator`）也在这边 —— 一条判据只留一份，
// 编辑器的下拉与手打的字形因此永远给出同一个答案。
import {
  IDENTITY_TOKEN,
  generatorCollisionReason,
  generatorsDistinct,
  isOmegaCarrier,
  planCustomAction,
  resolveGenerator,
  omegaSpecOfValue,
  type GenImageDraft,
  type OmegaSpec,
} from './customAction'
// 点集（U53）：凭空造「任意阶集合」——`pointSet(5)` / `labeledSet(a, b, c)`。
// 这是 U52 缺的那一层：没有它，「自定义作用」的 Ω 只能是内核硬造的 `{1..n}`。
import { planCountPointSet, planLabeledPointSet } from './pointSet'
// 小群表（U55）：把引擎内嵌的 1–31 阶 93 个群接成可导入的对象 —— `smallGroup(16, 3)`。
// 编号是 GAP 的（1 起），与结论层打印的 `SmallGroup(阶, 编号)` 同一口径。
import { planSmallGroup } from './smallGroups'
// `Aut` 的搜索预算 + 建群路（2026-10-01 事故：`Aut(S_6)` 在按键预览里跑 240s 没完 = 死机；
// 2026-10-02 U50 更正：贵的是 core 的线性搜索乘法，建群本身 96 阶只要 1ms）
import {
  AUT_BUILD_BUDGET,
  AUT_SEARCH_BUDGET,
  autBuildCost,
  autSearchCombinations,
  buildAutomorphismGroup,
  lookupAutomorphisms,
} from './automorphisms'
// 半直积的三态分诊（U51）：core 有 `createSemidirectProduct`，缺的是"φ 从哪来"
import { humanFingerprint, planInnerSemidirect, planSemidirect, semidirectBudget } from './semidirect'
// 已知结论层（U48）：课本有闭式的族**先查表再谈计算** —— `Aut(S_6) = 1440` 是背下来的结论，
// 不是现场搜索出来的（用户：「说 S6 搜不动我不是很认可」）
import { isKnownGroup, knownFacts, realizeKnownGroup, type KnownGroupSpec } from './known'
// 包含判据与信息面板的「关系」层（U19）**共用同一份** —— `contains(H, G)` 声明出来的
// 关系，与面板里"算出来"的关系永远一致，不会出现两种说法。
// `embeddingSearchBlocked` = 「嵌入那条路被守卫挡下了」（U38），报错语据此说"未判定"
import { containment, embeddingSearchBlocked } from './relations'
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
// 代数结构（DEVPLAN-algebra-structures）：`isGroupStructure` 是"够不够格当群"的**唯一**判据，
// `paramAccepts('group', 结构)` 与菜单必须与它同源 —— 判据分家就是菜单撒谎。
import { asGroupOf, isGroupStructure, planStructure, STRUCTURE_LEVEL_LABEL } from './algebra'

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
 * | `subset` | 圆节点（元素集）/ 群节点 | **单个**数集（`∩ ∪ ∖ ·`、`商`、`C_G`、`N_G`、`闭包` 都是它）：元素集 / 元素集的提升（`asSet` 过的群或元素集）/ 群（当集合读，且须是前缀里某个群的子群）；`subgroups` 只在**恰好一个成员**时收（那等于一个子群，与 `subgroupArgOf` 一致）|
 * | `setlike` | 圆节点 / 群节点 | **把子群集列表整体当集合读**——**只有 `底集` 用它**（Sylow 链的 `asSet(Syl_p(G))` 靠这条；`∩ ∪ ∖ ·` 走的是 `subgroupArgOf`，只收单个数集）|
 * | `omega` | 集合 / 元素集节点 / 群节点 | 作用的作用对象 Ω —— 恰好是 `omegaArgOf` 收的那几种 |
 * | `omegaOrInt` | 集合 / 元素集节点 / 群节点 | **Ω 或它的点数**（U53）：填不出节点时由文本 / 编辑器补一个整数（`自定义作用` 用它）|
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
  | 'carrier'
  | 'subset'
  | 'setlike'
  | 'omega'
  | 'omegaOrInt'
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
 *
 * 判据的真正含义是"**这个参数允许空着**"——`opsFor` 用它回答
 * "选中这三样之后，还差的那些参数用户能不能后面补"。
 * `omegaOrInt` **同时**满足"能空着"与"能吃画布上的集合"两件事（U53）：
 * 它既可能由画布给（选中 G 与一个集合 → 列得出「自定义作用」），
 * 也可能空着等编辑器填（只选中 G → 照样列得出，`n` 由编辑器补）。
 * ⇒ 所以 `opsFor` 的前缀匹配**不能**再拿 `isScalarParam` 当"画布给不了"的替身，
 * 必须交给 `paramAccepts` 逐项真判（见那里的注释）。
 */
export const SCALAR_PARAM_TYPES: ParamType[] = ['element', 'prime', 'int', 'genImage', 'omegaOrInt']

export function isScalarParam(t: ParamType): boolean {
  return SCALAR_PARAM_TYPES.includes(t)
}

/**
 * 这一档**能从画布上拿一个对象**吗？（U57）
 *
 * 与 `isScalarParam` 只差**一档**：`omegaOrInt`（U53）同时是"能空着填一个点数"
 * 与"能吃画布上的集合"—— 它是**半对象档**。
 *
 * ⊕ 球与拖拽连线问的正是"要不要从画布上点对象"，所以半对象档得算进来：
 * 用户手上正好有 `G` 与一个点集时，「把这两样凑一起」就该列出 `customAction`。
 * （从前这两种筛子只看 `isScalarParam`，于是 `customAction` 被漏掉 ——
 * 用户 2026-10-03 那句「我创建了群和点集，然后怎么创建群作用？」正是撞在这上面。）
 *
 * 判据**只有这一份**：⊕ 球列出来的、拖拽列出来的、点下去能跑的，三处永远同一批
 * —— 判据分家就是 U38/U51 反复立的「菜单不撒谎」被悄悄破坏。
 */
export function takesCanvasObject(t: ParamType): boolean {
  return !isScalarParam(t) || t === 'omegaOrInt'
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
 * 集合运算找不到共同母群时，会拿它们当候选（`intersection(C_3, C_7)` 在 F₂₁ 摆着的时候
 * 就该算出 {e}，而不是逼用户去写 `closure(F, a)`——用户原话："我还得弄闭包……"）。
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
   * 末尾**可变参数**（0..n 个）——`map(G, H, r2→e, s→s)` 的像对就是这么来的。
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
  /**
   * **候选预检**（U51）：`opsFor` / `pairOps` 用它挡掉"列出来点下去必被拦住"的候选。
   *
   * 与 op 内部真正的守卫**必须共用同一个判据** —— 预检拦下的，正式求值也一定拦下；
   * 预检放过的，正式求值可以再拦（那时用户已经点了，会看到理由）。
   *
   * ⚠️ **契约**（U52 收紧）：`values` 可能是**前缀**（用户还没选完）——
   * 实现必须容忍它：**判不了就返回 `true`**，不许对 `undefined` 抛错，也不许因为
   * "参数没齐"而返回 `false`（那会把一条只是还没选完的操作从菜单里抹掉）。
   *
   * 收紧要读 U52 那一处：单对象 op（`customAction(G, n, ...)`）的参数里夹着标量 `n`，
   * `opsFor` 永远等不到 `selection.length === params.length`（画布给不了 `n`），
   * 于是"只在参数凑齐时预检"这条旧写法**对它永远不触发** —— 直积群上
   * 「自定义作用」照列，点开却只得到一句"做不了"。菜单不撒谎，所以这一钩子
   * 改成**类型匹配就调**，把"要不要再判一次"交给实现自己。
   */
  fits?: (values: GalValue[]) => boolean
  run: (args: OpArg[], ctx?: OpContext) => OpOutcome
}

/* ── 参数辅助 ──────────────────────────────────────────── */

const fail = (error: string, hint?: string): OpOutcome => ({ ok: false, error, hint })

function groupOf(a: OpArg | undefined): Group | null {
  if (!a || a.kind !== 'object') return null
  return asGroupOf(a.value)
}

/** `GalValue` 形态的同一个取群（`fits` 收到的是值不是实参）。 */
function groupValueOf(v: GalValue | undefined): Group | null {
  return v ? asGroupOf(v) : null
}

/**
 * `set` 值 → 元素集（**`subset` 位的唯一读法**，内核与菜单共用）。
 *
 * 集合本身是 Ω（一批点），**不是**群元素表。只有它确实是"某个群的元素的提升"时才能当元素集读：
 *   ① `set.group` 非空 —— `pointSet(n)` / `labeledSet(...)` 是抽象点集，**没有母群** ⇒ 拒；
 *   ② 每个成员的记号都能在母群里解析回元素 —— `asSet(子群集)` 的成员是**子群记号** ⇒ 拒。
 *
 * 两条都过才给出 `{group, elements}`。**判据只写这一份**：`elementsOf`（喂内核）与
 * `paramAccepts`（定菜单）都调它 —— "菜单里列出来的"与"点下去跑得动的"于是永不分家。
 *
 * ⚠️ 从前 `paramAccepts` 的 `subset`/`setlike` **无条件**收 `set`，而内核
 * （`subgroupArgOf` / `elementSetArgOf` / `asSet.run`）一条都不收 ⇒ 拖 `S_4 → pointSet(4)`
 * 列出 10 条候选、**9 条点下去必报错**（实测 486 个拖拽候选里 324 个如此）。
 * 病根就是**同一件事的判据写成两份**（见 `isScalarParam` 五处散写的同款教训）。
 */
function setElementSetOf(v: GalValue): { group: Group; elements: GroupElement[] } | null {
  if (v.type !== 'set' || !v.set.group) return null
  const G = v.set.group
  const elements: GroupElement[] = []
  for (const m of v.set.members) {
    // 成员带 `subgroupElements` ⇒ 它是个**子群点**（`asSet(子群集)` 的产物）。
    // 这条必须靠**结构**判，不能靠 label：子群的记号常常就是生成元的循环记号
    // （`⟨(123)⟩` 里的 `(123)` 解析得回元素），只看 label 会把 4 个子群当成 4 个元素。
    if (m.subgroupElements) return null
    const e = resolveElementLoose(G, m.label)
    if (!e) return null
    elements.push(e)
  }
  return { group: G, elements }
}

function elementsOf(a: OpArg | undefined): { group: Group; elements: GroupElement[] } | null {
  if (!a || a.kind !== 'object') return null
  const v = a.value
  if (v.type === 'elements') return { group: v.group, elements: v.elements }
  if (v.type === 'group') return { group: v.group, elements: v.group.elements }
  if (v.type === 'set') return setElementSetOf(v)
  return null
}

/**
 * 集合读法（`ParamType` 的 `subset`）：元素集 / 恰好一个子群的子群集 / 群本身 / 元素集的提升。
 *
 * 群对象也接受——因为 `Z(G)` 这类子群已升级为真群对象（`buildSubgroupGroup`），
 * 用户手上拿到的就是一个「群」。是不是合法子群由调用方用 core 校验。
 */
function subgroupArgOf(a: OpArg | undefined): { group: Group; elements: GroupElement[] } | null {
  // 元素集 / 群 / `set`（真的元素提升）走同一份读法；`set` 的取舍全在 `setElementSetOf` 那一处。
  const direct = elementsOf(a)
  if (direct) return direct
  if (!a || a.kind !== 'object') return null
  const v = a.value
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
  if (p < 2) return `${notation} 的 p 必须 >= 2`
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
 * 于是用户写 `closure(G, r4)` 时 `r4` 解析不了——而这正是最常见的写法。
 *
 * 四级回退：
 *   ⓪ **展示形态回认**：`prettySymbol(label)` 的唯一命中（`α₂` → `\alpha_2`，
 *      `id` → `\mathrm{id}`）——让"照着面板上的记号敲"成立
 *   ① core 的 `resolveElement`（精确；循环记号走这里）
 *   ② 单位元通用记号 `e` / `id` / `1`（**标签被改写的群**上唯一认得它的路，见下）
 *   ③ 生成元的幂：`r4` / `r^4` / `r^{4}`
 *   ④ 单生成元群（循环群）里的单字母：`r` / `a` / `g` 一律视作那个生成元
 */

/** 单位元的通用记号（`e` / `id` / `1`）。 */
const UNIT_TOKENS = new Set(['e', 'id', '1'])

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

  /**
   * 单位元的**通用记号**：`e` / `id` / `1`（2026-09-30）。
   *
   * 必须在下面那截"循环群单生成元的桥"**之前**短路。反例（实测，陪集层）：
   * core 给商群单位元的 label 是 `e, \dots`（陪集成员列表拼出来的），所以
   * `prettySymbol(label) <=> "e"` 回认不命中 ⇒ 一路掉到桥里 ⇒ 而 `C_2` 的商群
   * **只有一个生成元** ⇒ `e` 被当成生成元 ⇒ **`closure(Q, e)` 返回整个 Q（2 阶）、
   * `ord(Q, e)` = 2**（单位元的阶居然不是 1），而且不报错。
   *
   * 放在这里不改其它群的行为：常见群里的 `e` 在上面 `resolveElement`
   * 或 pretty 回认那两关就已经命中单位元了；只有**标签被改写**的群
   * （陪集层）才走得到这一条。
   */
  if (UNIT_TOKENS.has(t.toLowerCase())) return group.identity

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
 * 结论表给出的群 → 操作结果（U48）。
 *
 * 能本地构造就是**真群**（用户还能接着对它算）；构造不了就是**已知群**
 * （有符号有阶、没有元素表）—— 面板据此披露来源，元素级操作明说不能算。
 *
 * `sub` 传纯文本（对象列表的副行不吃 KaTeX）；结论区的 LaTeX 版在
 * `groupInsights` 里由 `knownGroupInfo` 给。
 */
function knownGroupOutcome(spec: KnownGroupSpec, sub: string): OpOutcome {
  const g = realizeKnownGroup(spec)
  return {
    ok: true,
    value: { type: 'group', group: g },
    label: prettySymbol(g.symbol),
    sub,
  }
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
 * 找同构的子群：**恰好一个**时给出可照抄的 `closure(...)`（唯一性由数学保证，
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
      `${hRef} 是独立构造的群，元素和 ${gRef} 对不上；想用 ${gRef} 里的子群，请从它构造（如 closure(${gRef}, 生成元)）`,
  )
}

/* ── 跨群元素表示的分诊（2026-09-29）─────────────────────── */

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
      `想用 ${gRef} 里的子群，先从它构造（如 closure(${gRef}, 生成元)）`,
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
 * `N_G` / `C_G` 这类"第二参是一个元素集 / 子群"的操作的**统一前置检查**（2026-09-30）。
 *
 * 它们与集合运算 / `商` / `包含` 用的是同一条判据（U29–U34 那一族）：第二参的元素
 * 必须**能在 G 里对齐**（`idsComparable` + 元素 id 全在），否则 core 会静默给出
 * 两个方向都假的答案 —— 用户实测（`S_4` + `A_4` 两个独立对象）：
 *
 *   · `N_G(A_4, S_4)` → `getNormalizer` 返回 **[]** ⇒ 画布上长出一个 **0 阶的"群"**
 *     （数学上不存在，`subgroupGroupOf(G, [])` 也不拦）；
 *   · `C_G(A_4, S_4)` → `getCentralizer` 返回**整个群**（看着像"全都与它交换"）；
 *   · `N_G(V_4, S_4)` → core 内部直接抛（`findPermIndex` 拿到对不上的元素）。
 *
 * 所以：**先判再算**，判不过就走 U29 那套分诊（说清是"不在同一个群里"还是
 * "记号碰巧重合"，并给出可照抄的配方）。
 */
function foreignElementSetFail(
  gRef: string,
  G: Group,
  hRef: string,
  S: { group: Group; elements: GroupElement[] },
): OpOutcome | null {
  if (S.elements.length === 0) {
    return fail(
      `${hRef} 里一个元素都没有 ---- 空集不是群，也算不出中心化子 / 正规化子`,
      `检查一下 ${hRef} 是不是哪一步算空了（0 阶的对象不是群）`,
    )
  }
  const gIds = new Set(G.elements.map((e) => e.id))
  if (idsComparable(S.group, G) && S.elements.every((e) => gIds.has(e.id))) return null
  return (
    subgroupMisdiagnosis(gRef, G, hRef, S, false) ??
    fail(
      `${hRef} 的元素对不上 ${gRef}`,
      `想用 ${gRef} 里的子群，先从它构造（如 closure(${gRef}, 生成元)）`,
    )
  )
}

/**
 * 子群的**可照抄**写法：`closure(G, g_1, g_2)`（生成元走 `prettySymbol`；
 * 平凡子群写成 `closure(G)`）。错误语 / 状态行都是**纯文本面**，这里不带 LaTeX 命令。
 */
function subgroupRecipe(G: Group, gRef: string, h: Subgroup): string {
  const gens = h.generators
    .filter((g) => g.id !== G.identity.id)
    .map((g) => prettySymbol(g.label))
  return `closure(${gRef}${gens.length > 0 ? `, ${gens.join(', ')}` : ''})`
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
 *     `quotient(G/N, K)` 这种"层级错了"的行会被静默翻译成另一个问题
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
 * 报错时的出路：在 `G` 里找与 `S` 同构的子群，给**可照抄**的 `closure(...)` 写法。
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
 *
 * **判据只有一份**（U52）：实现在 `customAction.ts#resolveGenerator`，
 * 那里同时供「自定义作用」用（它要的是 `gen.symbol`）。两处若各写一份，
 * 迟早对同一串记号给出不同答案。
 */
function generatorOf(group: Group, text: string): { genName: string; el: GroupElement } | null {
  const r = resolveGenerator(group, text)
  return r ? { genName: r.name, el: r.el } : null
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
    ? `Omega 的 ${labels.length} 个点：${head.map((l, i) => `#${i + 1} ${l}`).join('，')}`
    : `Omega = {${head.join(', ')}}`
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

/* ── 共轭作用在子群集上（Sylow 定理的主角动作）────────────── */

/** 子群（元素数组）的规范键。core 的 `conjugateSubgroup` 也返回排序结果，两边对得上。 */
function subgroupKeyOf(els: GroupElement[]): string {
  return els.map((e) => e.id).sort().join('|')
}

/**
 * 把一个「被作用的点集 Ω」实参读成结构化形式。
 *
 * 三种来源：
 *   - `set`（`asSet(Syl_p(G))` / `pointSet(5)` 的产物）：成员可能带 `subgroupElements` → **点就是子群**
 *   - `elements`：点是 G 的元素（共轭类 / 正规子群集 …）
 *   - `group`：同上（Ω = G 自身）
 *
 * `points` 为 null 表示"点是元素"而不是子群 —— 这两条路走的是两套置换算法。
 *
 * `group` 为 null 表示**这批点不属于任何群**（U53 的合成点集 `pointSet(5)`）——
 * 目前只有 `共轭作用在` 用它，那里会把 null 当作"共轭干不了"（共轭作用要的真是子群集）。
 */
interface OmegaArg {
  group: Group | null
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
      label: `asSet(${refText(a)})`,
      members: v.elements.map((e) => ({ label: e.label })),
      points: null,
    }
  }
  if (v.type === 'group') {
    return {
      group: v.group,
      label: `asSet(${refText(a)})`,
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
    return { error: 'Omega 里有重复的点', hint: '同一个子群在 Omega 里出现了两次' }
  }
  const perms = new Map<string, number[]>()
  for (const g of acting) {
    const perm: number[] = []
    for (const H of points) {
      const j = index.get(subgroupKeyOf(conjugateSubgroup(G, H, g)))
      if (j === undefined) {
        return {
          error: `${elementLabel(G, g.id)} 把 Omega 里的某个子群映到了 Omega 之外`,
          hint: 'Omega 必须在共轭下封闭（Sylow 子群的全体就是封闭的）',
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
    return { error: 'Omega 里有 G 中找不到的元素', hint: 'Omega 的成员必须是 G 的元素' }
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
          error: `${elementLabel(G, g.id)} 把 Omega 里的元素映到了 Omega 之外`,
          hint: 'Omega 要在共轭下封闭：取共轭类、正规子群或 G 自身',
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
  if (!O.group) return `自由点集（${O.members.length} 个点）`
  return O.points ? `Syl / 子群集（${O.members.length} 个点）` : `G 的元素（${O.members.length} 个点）`
}

/**
 * 「自定义作用」的第二个实参 → `OmegaSpec`（U53）。
 *
 * 认两种：
 *   · **一个整数** ⇒ 点数（`customAction(C_4, 4, a -> (1 2 3 4))`，U52 的老写法，契约不改）；
 *   · **一个集合 / 元素集 / 群对象** ⇒ 就用它当 Ω（`pointSet(5)` / `labeledSet(a,b,c)` / `asSet(Syl_p(G))`）。
 *
 * 值的筛选**不在这里另写一份** —— 交给 `customAction.ts#omegaSpecOfValue`，
 * 那个函数同时供作用编辑器用（"编辑器能填的"与"手打的能吃"必须是同一批）。
 *
 * 第三种情况（一句既不是数字也不是集合的话）**点名报错**，不静默当成点数 1。
 */
function omegaSpecOf(a: OpArg | undefined): OmegaSpec | { error: string; hint?: string } {
  if (!a) {
    return {
      error: '自定义作用的第二个参数要一个点数或一个点集',
      hint: '点数如 4；点集如 pointSet(5) / labeledSet(a, b, c) / Syl(G, 3)',
    }
  }
  if (a.kind === 'number') return { kind: 'count', n: a.num }
  /*
   * **长得像数字的也算点数**（`1.5` / `-3`）：`resolveArg` 只把 `^-?\d+$` 认成数字，
   * 于是 `1.5` 会落到 `literal`。但它的错是"点数不是正整数"，不是"这个参数不是点集"——
   * 交给同一个校验点去说，报错才具体。
   */
  if (a.kind === 'literal' && /^[-+]?\d*\.?\d+$/.test(a.text.trim())) {
    return { kind: 'count', n: Number(a.text) }
  }
  if (a.kind === 'object') {
    const spec = omegaSpecOfValue(a.value, a.ref ?? a.text, a.ref)
    if (spec) return spec
  }
  return {
    error: `自定义作用的第二个参数要一个点数或一个点集，「${a.text}」两者都不是`,
    // 例子必须是**照抄就能跑**的：`Syl_p(G)` 只是个数学记号，当输入会报"要 2 个参数"
    hint: '点数如 4；点集如 pointSet(5) / labeledSet(a, b, c) / Syl(G, 3) / asSet(Syl(G, 3))；作用在 G 自身上用 leftAction',
  }
}

const COSET_OMEGA_HINT = 'Omega 是陪集而非 G 的元素；陪集视图接入后再支持'

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
 *   - `closure(G,(12)) · closure(G,(34))` 误报"不是同一个群"（拿 K₁ 当上下文群去乘 K₂ 的元素）；
 *   - 独立构造的 `V_4` 参与运算时好时坏（母群只能猜一边，反序就死）。
 *
 * 现在的规则一句话：**候选上下文群逐个试，第一个"两边都能对齐、且结果说得清"的赢**。
 * 候选按"最像用户正在工作的那个家"排序：显式母群 → 子群对象的**根** → 两边各自的群 →
 * **画布上的其它群**（U34：`intersection(C_3, C_7)` 在 F₂₁ 摆着时就该算出 {e}，不该逼人写闭包）。
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
            ? '画布上现成的群都装不下这两边；先建它们共同的大群，再从里面取子群（如 closure(大群, 生成元)）'
            : '先把两边放进共同的大群再算：比如 closure(大群, 生成元)；或从大群的子群列表里取',
        )
      }
    }
    return (
      best?.out ??
      fail(
        `${kind} 的两边不在同一个群里`,
        '把两边先放进同一个群里（如 closure(母群, 生成元)），或从子群列表里取',
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
      sub: `结果大小 = ${els.length}${structSuffix(group, els)}${said}`,
      note: chosen.said || undefined,
    }
  }

  return {
    ok: true,
    value: { type: 'elements', group, elements: els },
    label,
    sub: `结果大小 = ${els.length}${said}`,
    note: chosen.said || undefined,
  }
}

/* ── p-子群枚举的预算（2026-10-01）────────────────────────── */

/**
 * p-子群枚举的**实测分界线**。
 *
 * 为什么不能用阶当判据：core `guards.ts` 把 `SYLOW_MAX_ORDER` 定在 144（那条线是
 * **子群枚举**测出来的），可它自己**没有**用在 `findSylowSubgroups` / `findAllPSubgroups`
 * 里，而这两条路真正卡死的地方在 144 之下 —— 64 阶的 `C_2^6` 就是。阶完全分不开。
 *
 * 真正的自变量是 **p-子群个数**（core 的 `vi()`：对每个 p-元素，与已找到的每个子群
 * 合并一次闭包，每个闭包又是 O(子群²)）—— 而那正是我们要算的东西，不能拿来当判据。
 * 用"p-元素对数 ÷ 阶"当代理（一对元素生成一个子群，子群越大被重复数到的次数越多）：
 *
 * | G | p | p-元素 | 对数/阶 | p-子群 | 实测 |
 * |---|---|---|---|---|---|
 * | C_2^3 | 2 | 7 | 6 | 15 | 1ms |
 * | Q_8 | 2 | 7 | 6 | 5 | 0ms |
 * | A_5 | 2 | 15 | 4 | 20 | 3ms |
 * | C_4 x C_4 | 2 | 15 | 14 | 14 | 2ms |
 * | C_3^3 | 3 | 26 | 25 | 27 | 13ms |
 * | C_2^5 | 2 | 31 | 30 | 373 | 0.85s |
 * | S_5 | 2 | 55 | 25 | 75 | 0.20s |
 * | S_6 | 3 | 80 | 9 | 10 | 1.2s |
 * | S_6 | 5 | 144 | 29 | 6 | 0.45s |
 * | C_2^6 | 2 | 63 | **62** | 2825（手算） | **60s 没完** |
 * | S_6 | 2 | 255 | **90** | | **45s 没完** |
 *
 * 线取 50：放行最贵的一档是 30（C_2^5 的 0.85s，`S_6` 的 3-子群 1.2s 也放行 ——
 * 那是课本上的经典题，舍不得不算），拦下最小的一档是 62。两档之间空两倍，不是"差不多安全"。
 */
const P_SUBGROUP_LOAD_CAP = 50

/**
 * p-元素的**对数密度**：`(阶为 p 的幂的元素个数)² / |G|`。
 *
 * `elements` 是 p-元素个数（不含单位元），`load` 是上面那条代理量。
 */
function pSubgroupLoad(G: Group, p: number): { elements: number; load: number } {
  let elements = 0
  for (const [order, count] of elementOrderDistribution(G)) {
    if (order === 1) continue
    let rest = order
    while (rest % p === 0) rest /= p
    if (rest === 1) elements += count
  }
  return { elements, load: (elements * elements) / G.order }
}

/* ── 注册表 ───────────────────────────────────────────── */

export const OPS: OpDef[] = [
  /* ══ 原子构造 ══════════════════════════════════════════ */
  {
    id: 'directProduct',
    notation: 'directProduct(A, B)',
    mechanism: 'atomic',
    primitive: true,
    doc: '直积：两个群的笛卡尔积，逐分量运算',
    impl: 'createDirectProduct',
    // 中缀用 ASCII：`x`（短、好打）与 `\times`（LaTeX 形态，与显示一致）
    infix: ['x', '\\times'],
    call: ['directProduct', 'product'],
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
    id: 'semidirectProduct',
    notation: 'semidirectProduct(N, H)',
    mechanism: 'atomic',
    primitive: true,
    doc: '半直积：N 被 H 作用着拼起来。记号定不下作用时分诊：唯一就建、多解列出、算不动说清',
    recipe: '原子构造（不归约）',
    impl: 'createSemidirectProduct + gal/semidirect 的 phi 枚举（core 备好了零件，缺的只是"phi 从哪来"）',
    // 中缀只收 `\rtimes`（`rtimes` 由输入规范化折过来）：**不收 `:`** ——
    // `:` 那个形态由输入层的记号分诊（`evalDef`）接，两条路共用同一个 `planSemidirect`。
    // 这里收 `\rtimes` 是为了**让参数能是画布对象**（`A \rtimes B`）：
    // 记号解析那条路只认群记号，不认对象名。
    infix: ['\\rtimes'],
    call: ['semidirectProduct', 'semidirect', 'rtimes'],
    params: [
      { name: 'N', type: 'group' },
      { name: 'H', type: 'group' },
    ],
    arity: 2,
    result: 'group',
    /*
     * **候选预检**：预算拦得下来的，菜单里就别列（列了点下去必被拦住 = 撒谎）。
     * 判据与 `planSemidirect` 的第一道门共用同一个 `semidirectBudget`。
     *
     * 注意分寸：这里只挡**预算**，不挡"多解"—— 「多解」是**数学答复**
     *（这个记号本来就定不下一个群），不是"点了必然报错"的实现问题。
     */
    fits: (vs) => {
      const A = groupValueOf(vs[0])
      const B = groupValueOf(vs[1])
      return !A || !B || semidirectBudget(A, B).ok
    },
    run: (a) => {
      const N = groupOf(a[0])
      const H = groupOf(a[1])
      // `fail` 的两个参数都会进 `.composer-status` 这个**纯文本面**（不走 KaTeX）：
      // 不许有 LaTeX 命令（`\rtimes`）、也不许有键盘打不出来的字符（`——` / `⇒` / `·`）。
      if (!N || !H) return fail('半直积需要两个群', `如 semidirectProduct(N, H)：左边当正规子群，右边当作用群`)

      /*
       * ① **内半直积**：两个参数是同一个母群里的子群 ⇒ 作用由母群内部的共轭定死。
       *
       * 画布上最常发生的正是这一种：从 G 里挑两个子群拉一条线。答案**就是 G 自己**，
       * 不存在"选哪个作用"的问题 —— 不该被外路径报成"有 3 类"。
       */
      const inner = planInnerSemidirect(N, H)
      if (inner.kind === 'ok') {
        return {
          ok: true,
          value: { type: 'group', group: inner.group },
          label: prettySymbol(inner.group.symbol),
          sub: `|G| = ${inner.group.order}，内半直积：就是它所在的母群本身`,
        }
      }

      /*
       * ② **外半直积**：枚举 `Hom(H, Aut(N))` 做三态分诊（`gal/semidirect.ts`）。
       *
       * 措辞两条（`fail` 的文案落在**纯文本面**：状态行 `/composer-status`）：
       *   · 不写 LaTeX 命令 —— 记号 `\rtimes_{\phi}` 带反斜杠，只用对象名说话；
       *   · "有多解"与"算不动"分开说 —— 前者是数学结论（该列候选），后者是本地能力（该说卡在哪）。
       */
      const plan = planSemidirect(N, H)
      const nRef = refText(a[0])
      const hRef = refText(a[1])
      const innerWhy = inner.why ? `另外，${inner.why}` : ''

      if (plan.kind === 'ok' || plan.kind === 'trivial') {
        const g = plan.group
        const how = plan.kind === 'trivial' ? '只有平凡作用，就指直积' : '作用唯一'
        /*
         * 两边真的在同一个母群里、但内半直积不成立时，**必须披露**：这时给的是
         * 「外半直积」的答案（另一个群），不说明白就等于静默换题。
         *
         * ⚠️ 披露只能写在 `sub` 里，而且必须短：`sub` 落在 `.composer-status` 的
         * `.status-meta` 上，那是 `flex: none`（不收缩、不换行），写长了整行溢出。
         * 完整原因进 `note`（对象上的记录字段）；失败那条路上 hint 有地方，写全。
         */
        const sub = inner.why ? `|G| = ${g.order}，按外半直积算（${how}）` : `|G| = ${g.order}，${how}`
        return {
          ok: true,
          value: { type: 'group', group: g },
          label: prettySymbol(g.symbol),
          sub,
          note: inner.why ?? undefined,
        }
      }
      if (plan.kind === 'multi') {
        const kindWord = plan.faithfulOnly ? '忠实作用' : '非平凡作用'
        // 候选**不能只列符号**：同一个记号下不同作用的群符号长得一模一样
        //（`C_{2}^{4} \rtimes_{\phi} S_{3}`），只有不变量能区分。
        const list = plan.options.map((o) => humanFingerprint(o.fingerprint)).join('；')
        return fail(
          `${nRef} 与 ${hRef} 的${kindWord}有 ${plan.options.length} 个本质不同的选法，各自给出不同构的群，它不是一个群`,
          `候选（按不变量区分）：${list}` +
            (plan.sampled ? `。候选较多，本地做了分层抽样，"${plan.options.length}"是下界` : '') +
            `。要指定作用：改用 smallGroup(n, i) 从表里挑一个，或从同一个母群里挑两个子群，走 semidirectProduct（内半直积）` +
            (innerWhy ? `。${innerWhy}` : ''),
        )
      }
      return fail(
        `${nRef} 与 ${hRef} 的半直积本地算不了`,
        `${plan.why}${innerWhy ? `。${innerWhy}` : ''}`,
      )
    },
  },
  {
    id: 'quotient',
    notation: 'quotient(G, N)',
    mechanism: 'atomic',
    primitive: true,
    doc: '商群：把正规子群 N 的每个陪集压成一点',
    recipe: '原子构造（不归约）',
    impl: 'computeQuotientGroup',
    infix: ['/'],
    call: ['quotient'],
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
      // 只看 id 会把 `quotient(C_7, C_3)` 当成"子群判定失败"，而真相是两边没有共同母群。
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
    notation: 'map(G, H, r -> e, ...)',
    mechanism: 'atomic',
    primitive: true,
    doc: '同态 f : G -> H，由**生成元的像**给出（如 r2 -> e, s -> s）',
    impl: 'extendFromGenerators + verifyHomomorphism',
    call: ['map', 'hom'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'H', type: 'group' },
    ],
    variadic: { name: 'genImage', type: 'genImage' },
    arity: 2,
    editor: true,
    result: 'map',
    run: (a) => {
      const G = groupOf(a[0])
      const H = groupOf(a[1])
      if (!G || !H) return fail('映射需要源群与靶群', 'map(G, H, r2\\to e, s\\to s)')
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
        return fail('至少要给一个生成元的像', 'map(G, H, r2\\to e)')
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
            `不是同态：f(${elementLabel(G, v.a)} * ${elementLabel(G, v.b)}) != f(${elementLabel(G, v.a)}) * f(${elementLabel(G, v.b)})`,
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
        ? '同构'
        : props.isInjective
          ? '单射（嵌入）'
          : props.isSurjective
            ? '满射'
            : '同态'
      return {
        ok: true,
        value: { type: 'map', map },
        label: `${prettySymbol(G.symbol)} \\to ${prettySymbol(H.symbol)}`,
        sub: `${kind}, |ker| = ${kernel.length}, |im| = ${image.length}`,
      }
    },
  },
  {
    id: 'conjugationAction',
    notation: 'conjAction(G)',
    mechanism: 'atomic',
    primitive: true,
    doc: 'G 通过共轭 g*x*g^-1 作用在自身元素上',
    impl: 'computeConjugationPerms',
    call: ['conjAction', 'conjugation'],
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
          label: `asSet(${refText(a[0])})`,
          members: G.elements.map((e) => ({ label: e.label })),
        },
        omegaBase: 'self',
      }
      return {
        ok: true,
        value: { type: 'action', action },
        label: `conjAction(${refText(a[0])})`,
        sub: `|Omega| = ${G.order}, Omega = ${refText(a[0])} 自身`,
      }
    },
  },
  {
    id: 'leftTranslationAction',
    notation: 'leftAction(G)',
    mechanism: 'atomic',
    primitive: true,
    doc: 'G 通过左乘作用在自身元素上（Cayley 正则表示）',
    impl: 'computeLeftTranslationPerms',
    call: ['leftAction'],
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
          label: `asSet(${refText(a[0])})`,
          members: G.elements.map((e) => ({ label: e.label })),
        },
        omegaBase: 'self',
      }
      return {
        ok: true,
        value: { type: 'action', action },
        label: `leftAction(${refText(a[0])})`,
        sub: `|Omega| = ${G.order}, Omega = ${refText(a[0])} 自身`,
      }
    },
  },
  {
    id: 'conjugationOnSet',
    notation: 'conjOn(G, Omega)',
    mechanism: 'atomic',
    primitive: true,
    doc: 'G 通过共轭 g*x*g^-1 作用在集合 Omega 上 ---- Sylow 定理的主角动作（Omega = Syl(G, p)）',
    recipe: '原子构造（作用）',
    impl: 'conjugateSubgroup（core）\\to 点集上的置换',
    call: ['conjOn', 'conjugationOn'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'Omega', type: 'omega' },
    ],
    arity: 2,
    result: 'action',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('conjOn 的第一个参数必须是群')
      const O = omegaArgOf(a[1])
      if (!O) {
        return fail(
          'conjOn 的第二个参数必须是集合 Omega',
          '如 conjOn(G, asSet(Syl(G, 3)))：先把子群集取底集成集合，再让 G 作用上去',
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
      // Ω 是**没有母群的合成点集**（U53 的 `pointSet(5)` / `labeledSet(a,b,c)`）——
      // 共轭作用要的是"G 共轭作用在它的一族子群/元素上"，抽象点集没有共轭可言。
      // 这不是"算不动"，是**这个问题在这里不成立**，要说清并指向自定义作用。
      if (!ambient) {
        return fail(
          'conjOn 要 Omega 是某个群的子群集 / 元素集',
          `Omega = ${O.label} 是一批抽象点，没有被共轭的结构；要给它定作用就用「customAction」，G 上的共轭用「conjAction(G)」`,
        )
      }
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
          'G 与 Omega 来自不同的群',
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
        label: `conjOn(${refText(a[0])}, ${refText(a[1])})`,
        sub: `|Omega| = ${O.members.length}, Omega = ${omegaDisplayName(O)}`,
      }
    },
  },
  {
    id: 'cosetAction',
    notation: 'cosetAction(G, H)',
    mechanism: 'atomic',
    primitive: true,
    doc: 'G 左乘作用在 H 的左陪集上（共 [G:H] 个点）---- Sylow I 的舞台',
    impl: 'computeCosetActionPerms',
    call: ['cosetAction', 'coset'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'H', type: 'subset' },
    ],
    arity: 2,
    result: 'action',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('cosetAction 的第一个参数必须是群', '如 cosetAction(G, P)')
      const S = subgroupArgOf(a[1])
      if (!S) return fail('cosetAction 的第二个参数必须是子群')
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
        label: `cosetAction(${gRef}, ${hRef})`,
        sub: `|Omega| = ${n} = [G : H]${translated ? `，${translated}` : ''}`,
        note: translated ?? undefined,
      }
    },
  },
  {
    id: 'customAction',
    notation: 'customAction(G, Omega, a -> (1 2 3 4))',
    mechanism: 'atomic',
    primitive: true,
    doc: 'G 通过你给的置换作用在点集上：每个生成元配一个循环记号（恒等写 e），立刻报是否忠实',
    recipe: '同态 G -> S_n，由生成元的像唯一决定',
    impl: 'gal/customAction 的 planCustomAction（core 备好 extendAndVerifyPerms + parseCycleNotation）',
    call: ['customAction'],
    params: [
      { name: 'G', type: 'group' },
      /*
       * 第二参 = **Ω 或它的点数**（U53）。
       *
       * U52 时这里是 `int`：Ω 只能是内核硬造的 `{1..n}`，"让 G 作用在**你自己的**
       * 集合上"根本表达不出来（用户 2026-10-02 当晚的原话是
       * 「逗我吗，连任意阶集合都创建不了，怎么创建自定义群作用？」）。
       * 现在它同时收**集合对象**：`pointSet(5)` / `labeledSet(a,b,c)` / `asSet(Syl(S_4,3))` 都行。
       *
       * 两件属性都要（见 `SCALAR_PARAM_TYPES` 的注释）：
       *   · 画布上给了集合 ⇒ 前缀匹配得上（只选 G 与一个集合也能列出它）；
       *   · 画布上给不出 ⇒ 允许空着，由编辑器填一个整数。
       */
      { name: 'Omega', type: 'omegaOrInt' },
    ],
    variadic: { name: 'genImage', type: 'genImage' },
    arity: 2,
    editor: true,
    result: 'action',
    /*
     * **候选预检**（U52）：直积群（`C_2^2` / `C_2^3` …）的生成元在 core 里重名重号，
     * "给每个生成元分别指定像"这件事**表达不出来**（见 `generatorsDistinct`）。
     * 判据与 `run` 里的那道门、与编辑器包装层的守卫**共用同一个函数** ——
     * 于是"菜单里列着的"与"点下去能做的"永远是同一批（菜单不撒谎）。
     *
     * 容忍前缀：`n` 是标量位，画布答不出来 ⇒ 这里只可能拿到 `[G]`（或 `[G, Ω]`）。
     */
    fits: (vs) => {
      const G = groupValueOf(vs[0])
      return !G || generatorsDistinct(G)
    },
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('自定义作用的作用群必须是群', '如 customAction(C_4, 4, a -> (1 2 3 4))')
      // 直积群的生成元在 core 里重名重号（`C_2^3` 是三个 `a`/`1`）—— 那种群上
      // "给每个生成元分别指定像"表达不出来。**先于生成元名字检查**说这件事：
      // 否则用户会先撞上"G 里没有生成元 b"（而对着一串 `a` 他不知道该写什么）。
      if (!generatorsDistinct(G)) {
        return fail(
          `${generatorCollisionReason(G)}，给不了它们不同的像`,
          '想让 G 作用在自己身上用 leftAction，其余三种内置作用也各有现成的路',
        )
      }
      const gRef = refText(a[0])

      // ── Ω：一个整数（点数）或一个集合对象（U53）──
      const omega = omegaSpecOf(a[1])
      if ('error' in omega) return fail(omega.error, omega.hint)

      // 像对：`a\to (1 2 3 4)` —— 三种箭头都认（与 `映射` 同款）
      const drafts: GenImageDraft[] = []
      for (let i = 2; i < a.length; i++) {
        const raw = a[i].text
        const parts = raw.split(/\\to\s*|->|=>/)
        if (parts.length !== 2 || !parts[0].trim()) {
          return fail(
            `像对的写法不对：${raw}`,
            `应形如 a -> (1 2 3 4)（生成元 -> 循环记号）；恒等写 ${IDENTITY_TOKEN}`,
          )
        }
        drafts.push({ genText: parts[0].trim(), cycle: parts[1].trim() })
      }
      if (drafts.length === 0) {
        return fail(
          '自定义作用至少要给一个生成元的像',
          `如 customAction(${gRef}, 4, ${generatorNames(G)[0] ?? 'a'} -> (1 2 3 4))`,
        )
      }
      // 生成元记号先在这里对一遍 —— 报错要能指名道姓（core 那边只认 symbol，对不上会 THROW）
      for (const d of drafts) {
        if (!resolveGenerator(G, d.genText)) {
          return fail(`${gRef} 里没有生成元 ${d.genText}`, `生成元：${generatorNames(G).join('、')}`)
        }
      }

      const plan = planCustomAction(G, omega, drafts)
      if (!plan.ok) return fail(plan.error, plan.hint)

      const n = plan.action.n
      const count = plan.orbitSizes.length
      const transitive = count === 1 && plan.orbitSizes[0] === n
      // 忠实性**必须说出来**：不忠实不是错误，但用户不该自己去猜（第一同构定理的入口）
      const faithfulPart = plan.faithful ? '忠实' : `不忠实，核阶 ${plan.kernelIds.length}`
      // Ω 是**用户给的集合**时把它的名字挂上（`|Ω| = 4` 之外还得说清是哪个 Ω）
      const omegaPart =
        omega.kind === 'set' ? `|Omega| = ${n}, Omega = ${omega.set.label}` : `|Omega| = ${n}`
      return {
        ok: true,
        value: { type: 'action', action: plan.action },
        label: `customAction(${gRef})`,
        sub: `${omegaPart}, ${transitive ? '传递（1 个轨道）' : `${count} 个轨道`}, ${faithfulPart}`,
        note: plan.faithful
          ? undefined
          : `${gRef} 到置换群的像只有 ${G.order / plan.kernelIds.length} 阶（G 是 ${G.order} 阶）`,
      }
    },
  },
  {
    id: 'automorphismGroup',
    notation: 'Aut(G)',
    mechanism: 'atomic',
    primitive: false,
    doc: '自同构群：G 到自身的同构全体',
    recipe: '枚举所有映射 -> 留下自同构',
    impl: 'createAutomorphismGroup',
    call: ['Aut', 'aut'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('Aut 需要一个群')
      /**
       * ① **结论表只在本地算不动的时候接手**（U48）。
       *
       * 顺序有讲究：`Aut(S₄)` 本地算得动（62ms），那就**照旧真算** —— 算出来的元素是
       * **自同构本身**（`\mathrm{id}, \alpha_1, …`），结论区能说 `Aut(S₄) ≅ S₄`。
       * 换成表里"记号的同构品"反而**丢信息**（元素变成了置换）。
       *
       * 只有搜索预算外（`S₆` 的 18000×720、`S₅` 的 600×120）才查表 ——
       * 那正是用户报的那条路：「敲完 6 网站卡死」。判据用**便宜的那一步**
       * （组合数 × 阶，走 `elementOrderDistribution`），不必先跑搜索。
       *
       * ⚠️ U50 更正：`A₅` 的 `|Aut| = 120` 原本也挂在这句里当"建不出"的例子 ——
       * 那是错的，它本地建得动（哈希乘法 2ms，见 ③）。
       */
      const facts = knownFacts(G)
      if (facts?.aut) {
        const combos = autSearchCombinations(G)
        if (combos * G.order > AUT_SEARCH_BUDGET) {
          return knownGroupOutcome(facts.aut, `|Aut| = ${facts.aut.order}`)
        }
      }
      /**
       * ② 搜索预算（`automorphisms.ts` 里有实测账）：core 只看候选组合数、不看阶，
       * `S_6` 的 18000 组正好从它的 30000 下面钻过去 —— 这条 op 于是能在按键预览里
       * 跑上百秒（等于死机），而界面连"在算"都显示不出来。
       */
      const found = lookupAutomorphisms(G)
      if (found.kind === 'searchTooBig') {
        // 表里有结论就救回来（理论上上面那一关已经拦下了，这里是兜底）
        if (facts?.aut) return knownGroupOutcome(facts.aut, `|Aut| = ${facts.aut.order}`)
        return fail(
          `${refText(a[0])} 的自同构本地搜不完（阶 ${G.order}，候选 ${found.combos} 组）`,
          `候选组合数 x 阶超过搜索线 ${AUT_SEARCH_BUDGET} ---- 这一步是逐个同阶元素试出来的，本地没有更快的路`,
        )
      }
      /**
       * ③ 建群预算（U50）。U47 曾在这里划 `|Aut| <= 48`，那是**量错了对象**：当时看到
       * `|Aut| = 96` 要 2.1s，就以为建群本身贵 —— 其实贵的是 core 的 `multiply`
       * （复合完再线性搜一遍，每次 O(|Aut| x |G|)）。换哈希乘法后 96 阶 **1ms**。
       * 用户那句「本地建不出这个群」在 96 阶上就是错的（他当场就报了）。
       */
      const cost = autBuildCost(found.auts.length, G.order)
      if (cost > AUT_BUILD_BUDGET) {
        if (facts?.aut) return knownGroupOutcome(facts.aut, `|Aut| = ${facts.aut.order}`)
        return fail(
          `${refText(a[0])} 有 ${found.auts.length} 个自同构，包成这个群超出本地预算`,
          `代价 |Aut|^2 x |G| = ${cost}，预算 ${AUT_BUILD_BUDGET}`,
        )
      }
      const A = buildAutomorphismGroup(G, found.auts)
      if (!A) {
        return fail(
          `${refText(a[0])} 的自同构集不自洽，包不成群`,
          '本地搜出来的那堆映射与群公理对不上 ---- 这是内部异常，不是"算不动"',
        )
      }
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
    notation: 'intersection(A, B)',
    mechanism: 'atomic',
    primitive: true,
    doc: '交：同时属于两个集合的元素',
    impl: '本地元素集运算',
    infix: ['\\cap'],
    call: ['intersection', 'intersect'],
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
    notation: 'union(A, B)',
    mechanism: 'atomic',
    primitive: true,
    doc: '并：属于两个集合中至少一个的元素',
    impl: '本地元素集运算',
    infix: ['\\cup'],
    call: ['union'],
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
    notation: 'difference(A, B)',
    mechanism: 'atomic',
    primitive: true,
    doc: '差：属于 A 但不属于 B 的元素',
    impl: '本地元素集运算',
    // ⚠️ 用完整的 `\setminus` 而不是孤立的反斜杠：反斜杠现在也是**命令名的开头**
    //（`\varphi` / `\Omega` 都是合法名字），孤零零一个 `\` 当中缀会让歧义面变大。
    infix: ['\\setminus'],
    call: ['difference', 'minus'],
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
    notation: 'productSet(A, B)',
    mechanism: 'atomic',
    primitive: true,
    doc: '积集：{a*b : a in A, b in B}（子群时 |A*B| = |A||B| / |A 交 B|）',
    impl: '本地元素集运算（母群乘法）',
    infix: ['\\cdot'],
    call: ['productSet', 'setProduct'],
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
    notation: 'asSet(S)',
    mechanism: 'atomic',
    primitive: false,
    doc: '取底集：忘记结构，只把里面的东西当作点 ---- 这是造 Omega（被作用的集合）的正规做法',
    recipe: '原子构造（取底集 / 忘记结构）',
    impl: '本地（NormalizedSubgroup / GroupElement \\to SetMember）',
    call: ['asSet', 'underlying'],
    params: [{ name: 'S', type: 'setlike' }],
    arity: 1,
    result: 'set',
    run: (a) => {
      const arg = a[0]
      if (!arg || arg.kind !== 'object') return fail('asSet 需要一个子群集 / 元素集 / 群')
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
      } else if (v.type === 'set') {
        // 已经是集合了：底集的作用是**忘记结构**，而 set 早就没有结构可忘。
        // （从前这里落到 else，报"没有底集可取"——把"没有结构可忘"说成了"里面没东西"，
        //  措辞误导，见 U52「披露事实 ≠ 报错」。）
        return fail(
          `${name} 已经是集合了`,
          '底集用于忘记结构：可传子群集（如 Syl(G, 2)）、元素集、群',
        )
      } else {
        return fail(
          `${name} 没有底集可取`,
          'asSet 接受子群集（如 Syl(G, 2)）、元素集、群',
        )
      }

      return {
        ok: true,
        value: {
          type: 'set',
          set: { group, label: `asSet(${name})`, members, from: arg.ref },
        },
        label: `asSet(${name})`,
        sub: `|Omega| = ${members.length}`,
      }
    },
  },
  /*
   * ── 点集（U53）：**凭空**造任意阶集合 ────────────────────────────
   *
   * 上面那个 `asSet(S)` 要求 `S` 已经存在（子群集 / 元素集 / 群）——
   * 也就是说集合的点**必须从某个已存在的群里借**。于是一批抽象点
   * （"G 作用在 5 个点上"、"作用在立方体的 8 个顶点上"）根本造不出来。
   *
   * 这两个 op 补的就是这一层。分成两个而不是一个，是因为 `labeledSet(5)` 到底指
   * "5 个点"还是"一个叫 5 的点"两种读法都通 —— **不许猜**（见 `pointSet.ts` 模块头）。
   *
   * `primitive: false`：它们不是 §3 的 10 个原语，而是「原子构造」机制下的实例
   * （与 `底集` 同一个待遇）—— 别为了两个构造器去动那份架构账。
   */
  {
    id: 'pointSet',
    notation: 'pointSet(n)',
    mechanism: 'atomic',
    primitive: false,
    doc: '造 n 个抽象点：点号 1 到 n，不属于任何群 ---- 给「自定义作用」准备舞台',
    recipe: '原子构造（凭空给一个集合）',
    impl: 'gal/pointSet 的 planCountPointSet',
    call: ['pointSet', 'points'],
    params: [{ name: 'n', type: 'int' }],
    arity: 1,
    result: 'set',
    run: (a) => {
      const arg = a[0]
      const n = arg?.kind === 'number' ? arg.num : Number((arg?.text ?? '').trim())
      const plan = planCountPointSet(n)
      if (!plan.ok) return fail(plan.error, plan.hint)
      return {
        ok: true,
        value: { type: 'set', set: plan.set },
        label: `pointSet(${n})`,
        sub: `|Omega| = ${n}, 点号 1 到 ${n}`,
      }
    },
  },
  {
    id: 'labeledSet',
    notation: 'labeledSet(a, b, c)',
    mechanism: 'atomic',
    primitive: false,
    doc: '造一个点集，点标号由你定（`labeledSet(a, b, c)`）---- 标号能直接写进循环记号',
    recipe: '原子构造（凭空给一个集合）',
    impl: 'gal/pointSet 的 planLabeledPointSet',
    call: ['labeledSet', 'labels'],
    /*
     * 参数个数不定（1 到 `POINT_SET_MAX` 个点），所以走 variadic 而不是 params：
     * `params` 是"参数表长度"，注册表有一致性断言（`params.length === arity + optional`）。
     * `variadic` 的类型是 `element`：每个实参就是一个**记号**（`a` / `红` / `v1`），
     * 由这两个 op 自己解释成"点标号"，不走元素解析。
     */
    params: [],
    variadic: { name: 'point', type: 'element' },
    arity: 0,
    result: 'set',
    run: (a) => {
      /*
       * `arity: 0` + variadic：实参全部落在 `a` 里。
       * 取 `text` 而不是 `num` —— 标号是**记号**（`a` / `v1` / `红`），`12` 这种
       * 纯数字也按原样当标号用（会不会歧义由 `planLabeledPointSet` 判，见那边）。
       */
      const labels = a.map((x) => x.text)
      const plan = planLabeledPointSet(labels)
      if (!plan.ok) return fail(plan.error, plan.hint)
      return {
        ok: true,
        value: { type: 'set', set: plan.set },
        label: plan.set.label,
        sub: `|Omega| = ${plan.labels.length}, 点号 ${plan.labels.slice(0, 8).join(' ')}${plan.labels.length > 8 ? ' ...' : ''}`,
      }
    },
  },
  /*
   * ── 代数结构（S1b）：**给一个集合配一个运算，看它到哪一级** ───────────────
   *
   * 群论教材的第一章主线（原群 → 半群 → 幺半群 → 群），而本项目从前只有"已经是群的
   * 东西"。这条 op 把"待检的表"变成一等对象：够格成群时**升格**为 core `Group`，
   * 于是 `Sub` / `Z` / 商 / Sylow 全都接得上（`paramAccepts('group', ·)` 放行）。
   *
   * 与 `pointSet` 同一档：不是 §3 的 10 个原语，而是「原子构造」机制下的实例。
   */
  {
    id: 'structure',
    notation: 'structure(P, table)',
    mechanism: 'atomic',
    primitive: false,
    doc: '给一个集合配一个二元运算（乘法表），算出它到哪一级：原群 / 半群 / 幺半群 / 群',
    recipe: '原子构造（集合 + 运算表 -> 结构）',
    impl: 'gal/algebra 的 planStructure',
    call: ['structure', 'algebra'],
    /*
     * **要编辑器**（S2a）：n² 个表项不是一行能敲出来的东西（`structure(P, 1,2,3, …)`
     * 三阶就要 9 个数，四阶 16 个）。这与映射的 `editor: true` 同一条理由
     * （`ARCHITECTURE §6.1` 的输入层三形态：几格表单比一串数字诚实得多）。
     * 文本形态照旧可用 —— 编辑器**产出**的也正是那一行的表达式。
     */
    editor: true,
    params: [{ name: 'carrier', type: 'carrier' }],
    /* n² 个表项，行优先展平、1-based。variadic 不计入 arity（与 `labeledSet` 同款）。*/
    variadic: { name: 'entry', type: 'int' },
    arity: 1,
    result: 'structure',
    run: (a) => {
      const carrierArg = a[0]
      if (!carrierArg || carrierArg.kind !== 'object') return fail('structure 需要一个集合当载体')
      const cv = carrierArg.value
      const name = refText(carrierArg)
      let labels: string[]
      if (cv.type === 'set') labels = cv.set.members.map((m) => m.label)
      else if (cv.type === 'elements') labels = cv.elements.map((e) => e.label)
      else
        return fail(
          `${name} 不能当载体`,
          '载体要一个集合（pointSet / labeledSet / asSet 的产物）或一个元素集',
        )
      const entries = a
        .slice(1)
        .map((x) => (x.kind === 'number' ? x.num : Number((x.text ?? '').trim())))
      if (entries.some((e) => !Number.isFinite(e)))
        return fail('运算表里有不认识的记号', `表项要 1..${labels.length} 的整数（1 是单位元位）`)
      const plan = planStructure(labels, entries)
      if (!plan.ok) return fail(plan.error, plan.hint)
      const s = plan.structure
      const lvl = STRUCTURE_LEVEL_LABEL[s.axioms.level]
      const extra =
        s.axioms.level === 'group' ? (s.axioms.commutative ? ' (交换)' : ' (非交换)') : ''
      return {
        ok: true,
        value: { type: 'structure', structure: s },
        label: `(${name}, *)`,
        sub: `|P| = ${s.carrier.length}, ${lvl}${extra}`,
      }
    },
  },
  /*
   * ── 小群表（U55）：**导入**引擎内嵌的 93 个群 ────────────────────────────
   *
   * 与 `pointSet` 同一档：不是 §3 的 10 个原语，而是「原子构造」机制下的实例。
   *
   * 为什么非得有这条 op（而不是靠记号解析自带的 `SmallGroup(n, i)`）：
   *   ① 报错语**早就在承诺**它了（`evalDef` / `ops.ts` 都写着"改用 SmallGroup(n, i)"），
   *      而承诺了就得有个能敲、能解释的地方 —— 这是兑现，不是新功能；
   *   ② 记号解析那条路只会回一句 core 的通用话，而这里能说清"16 阶有 14 个群，
   *      编号 1 到 14" —— 用户想试错时，边界得看得见。
   */
  {
    id: 'smallGroup',
    notation: 'smallGroup(n, i)',
    mechanism: 'atomic',
    primitive: false,
    doc: '小群表：1 到 31 阶共 93 个群，按 GAP 编号取 ---- 表格里没有的群在这里也能拿到',
    recipe: '原子构造（查内嵌小群表）',
    impl: 'gal/smallGroups 的 planSmallGroup',
    call: ['smallGroup'],
    params: [
      { name: 'n', type: 'int' },
      { name: 'i', type: 'int' },
    ],
    arity: 2,
    result: 'group',
    run: (a) => {
      const num = (x: OpArg | undefined): number => {
        if (!x) return Number.NaN
        if (x.kind === 'number') return x.num
        return Number((x.text ?? '').trim())
      }
      const n = num(a[0])
      const i = num(a[1])
      const plan = planSmallGroup(n, i)
      if (!plan.ok) return fail(plan.error, plan.hint)
      const g = plan.group
      return {
        ok: true,
        value: { type: 'group', group: g },
        // 标签给**结构**（节点上看得懂），出处（`SmallGroup(n, i)`）放副行
        label: prettySymbol(g.symbol),
        // ⚠️ `sub` 是纯文本面（`ComposerOrb` 的普通 `<span>`）—— 必须过 `asciiSymbol`，
        // 否则 `C_{2}\times C_{2}` 会把反斜杠摆在用户眼前（U54 立的规矩）
        sub: `SmallGroup(${n}, ${i})，|G| = ${g.order}，${asciiSymbol(g.symbol)}`,
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
    recipe: 'fix( conjAction(G) )',
    impl: 'getGroupCenter \\to buildSubgroupGroup',
    call: ['Z', 'center'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('Z 需要一个群')
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
    doc: '内自同构群：共轭作用给出的自同构全体，Inn(G) 同构于 G / Z(G)（第一同构定理）',
    recipe: 'quotient(G, Z(G))，第一同构定理：G/Z(G) 同构于 Inn(G)',
    impl: 'getGroupCenter \\to computeQuotientGroup',
    call: ['Inn', 'innerAutomorphisms'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('Inn 需要一个群')
      /**
       * **已知结论接手，但只在本地真算不动的时候**（U48）。
       *
       * 判据是**阶**（与 `enumeration` 那条线同源）：`Inn(S₆)` 走 core 要把 720 元商一遍
       * （实测 1.3s，在按键预览里就是一次可见的卡顿），而 `Inn(S₅)` / `Inn(A₅)` 只有
       * 几十毫秒 —— 那种就照旧真算（元素是陪集，比"同构的代表"更贴题）。
       */
      const facts = knownFacts(G)
      if (facts?.inn && G.order > ENUMERATION_LIMIT) {
        const k = realizeKnownGroup(facts.inn)
        return {
          ok: true,
          value: { type: 'group', group: k },
          label: `Inn(${refText(a[0])})`,
          sub: `|Inn| = ${facts.inn.order} = |G| / |Z| = ${G.order} / ${facts.center?.order ?? 1}`,
        }
      }
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
    notation: 'C_G(G, S)',
    mechanism: 'action',
    primitive: false,
    doc: '中心化子：与 S 中每个元素都交换的元素',
    recipe: 'stabilizer( conjAction(G), S )',
    impl: 'getCentralizer \\to buildSubgroupGroup',
    call: ['C_G', 'centralizer'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'S', type: 'subset' },
    ],
    arity: 2,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('C_G 的第一个参数必须是群')
      const S = elementSetArgOf(a[1], G)
      if (!S) {
        return fail(
          `C_G 的第二个参数必须是元素集、群，或一个元素记号`,
          `如 C_G(G, H) 或 C_G(G, (12)(34))`,
        )
      }
      const foreign = foreignElementSetFail(refText(a[0]), G, refText(a[1]), S)
      if (foreign) return foreign
      const els = getCentralizer(G, S.elements)
      // 上面已保证元素能对齐，这里空集只可能是 core 的意外 —— 不许建 0 阶群对象。
      if (els.length === 0) {
        return fail(
          `C_G 算出来是空集 ---- 空集不是群`,
          `这通常是元素没对上导致的，请检查 ${refText(a[1])} 是不是 ${refText(a[0])} 里的子集`,
        )
      }
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
    notation: 'N_G(G, H)',
    mechanism: 'action',
    primitive: false,
    doc: '正规化子：使 gHg^-^1 = H 的元素 g 全体',
    recipe: 'stabilizer( conjOn(G, Omega), H )',
    impl: 'getNormalizer \\to buildSubgroupGroup',
    call: ['N_G', 'normalizer'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'H', type: 'subset' },
    ],
    arity: 2,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('N_G 的第一个参数必须是群')
      const S = subgroupArgOf(a[1]) ?? elementSetArgOf(a[1], G)
      if (!S) return fail('N_G 的第二个参数必须是子群（或一个元素记号）')
      const foreign = foreignElementSetFail(refText(a[0]), G, refText(a[1]), S)
      if (foreign) return foreign
      const els = getNormalizer(G, S.elements)
      if (els.length === 0) {
        return fail(
          `N_G 算出来是空集 ---- 空集不是群`,
          `正规化子至少含单位元，出现空集说明元素没对上，请检查 ${refText(a[1])} 是不是 ${refText(a[0])} 里的子群`,
        )
      }
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
    notation: 'orbits(A, x)',
    mechanism: 'action',
    primitive: true,
    doc: 'x 在作用 A 下的轨道：x 能到达的全部点',
    impl: 'computeOrbits',
    call: ['orbits', 'orb'],
    params: [
      { name: 'A', type: 'action' },
      { name: 'x', type: 'element' },
    ],
    arity: 2,
    result: 'elements',
    run: (a) => {
      const A = actionOf(a[0])
      if (!A) return fail('orbits 的第一个参数必须是作用', '先用 conjAction(G) / leftAction(G) 造一个')
      const x = refText(a[1])
      // 标签带上**作用的名字**：Sylow III 的图上同时有 `G ↷ Ω` 与 `P ↷ Ω`，
      // 两个轨道若都叫 `Orb(1)`，画布上就出现两个同名节点（真截图抓到的）。
      const act = refText(a[0])
      const idx = omegaIndexOf(A, x)
      if (idx < 0) return fail(`Omega 中没有点 ${x}`, omegaHint(A))
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
            // 母群**跟着 Ω 走**（U53）：自由点集（`pointSet(5)`）的轨道也是自由点集，
            // 别硬填 `A.group` —— 那会让"Ω 的成员是 G 的元素"这句话变成谎
            set: { group: A.omega.group, label: `轨道_${act}(${x})`, members: picked },
          },
          label: `Orb_${act}(${x})`,
          sub: `|Orb| = ${members.length}${members.length === A.n ? '，传递（就是整个 Omega）' : ''}`,
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
    notation: 'stabilizer(A, x)',
    mechanism: 'action',
    primitive: true,
    doc: 'x 的稳定子：使 g*x = x 的元素 g 全体（G 的子群）',
    impl: 'computeStabilizers \\to buildSubgroupGroup',
    call: ['stabilizer', 'stab'],
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
      if (!A) return fail('stabilizer 的第一个参数必须是作用')
      const x = refText(a[1])
      // 标签带上**作用的名字**：Sylow III 的图上同时有 `G ↷ Ω` 与 `P ↷ Ω`，
      // 两个轨道若都叫 `Orb(1)`，画布上就出现两个同名节点（真截图抓到的）。
      const act = refText(a[0])
      const idx = omegaIndexOf(A, x)
      if (idx < 0) return fail(`Omega 中没有点 ${x}`, omegaHint(A))
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
    notation: 'fix(A)',
    mechanism: 'action',
    primitive: false,
    doc: '作用的全部不动点',
    recipe: 'fix(A)：orbits 的长度 1 特例',
    impl: 'computeFixedPoints',
    call: ['fix', 'fixedPoints'],
    params: [{ name: 'A', type: 'action' }],
    arity: 1,
    result: 'elements',
    run: (a) => {
      const A = actionOf(a[0])
      if (!A) return fail('fix 需要作用')
      const pts = computeFixedPoints(A.perms, A.n)
      // 标签用**作用自己的名字**：从前写死成 `Fix(A)`，于是 `fix(B)` 也标成 `Fix(A)`
      const act = refText(a[0])
      if (A.omega && A.omegaBase === 'object') {
        const picked = pts.map((i) => A.omega?.members[i]).filter((m): m is SetMember => !!m)
        return {
          ok: true,
          value: {
            type: 'set',
            // 母群跟着 Ω 走（U53，同 `轨道`）
            set: { group: A.omega.group, label: `不动点_${act}`, members: picked },
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
    notation: 'burnside(A)',
    mechanism: 'action',
    primitive: false,
    doc: '轨道条数：直接数 = Burnside 引理的平均 (1/|G|) * sum |Fix(g)|（两条路当场互相核对）',
    recipe: '(1/|G|) * sum_{g in G} |Fix(g)|（Burnside 引理）',
    impl: 'computeOrbits + computeBurnsideCount',
    call: ['burnside', 'Burnside', 'orbitCount'],
    params: [{ name: 'A', type: 'action' }],
    arity: 1,
    result: 'number',
    run: (a) => {
      const A = actionOf(a[0])
      if (!A) return fail('burnside 需要一个作用', '先用 conjAction(G) / leftAction(G) 造一个')
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
        label: `burnside(${refText(a[0])})`,
        sub: `= ${direct}（Burnside: ${sum} / ${A.group.order} = ${average} ${okMark}）`,
      }
    },
  },
  {
    id: 'kernel',
    notation: 'ker(f)',
    mechanism: 'action',
    primitive: false,
    doc: '核：被 f 映到单位元的元素全体',
    recipe: 'stabilizer( 诱导作用(f), e )',
    impl: 'computeKernelFromMapping \\to buildSubgroupGroup',
    call: ['ker', 'kernel'],
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
    notation: 'image(f, H)',
    mechanism: 'action',
    primitive: false,
    doc: '像：只给 f -> 整个像 im f；再给一个子群 H（H <= 定义域）-> f(H)，靶群里的子群（第二同构定理的 H\'）',
    recipe: '把 H 的每个元素过一遍映射表 -> 靶群的子群',
    impl: 'computeImageFromMapping（整体）/ 逐元素取像 + buildSubgroupGroup（子群）',
    call: ['im', 'image'],
    params: [
      { name: 'f', type: 'map' },
      // **可选第二参**：`image(f)` 是整个像（U14 就有），`image(f, H)` 是子群的像（U20 补）。
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

      // ── 两参形态：`image(f, H) = f(H)`（U20）──
      const S = groupOf(a[1])
      /**
       * 第二位**给了、却不是群**：明确报出来，别静默当成没给。
       *
       * 会撞上的场景：从「像 f(H)」进 pending 后误点了别的对象（映射 / 集合）——
       * 那时用户明明点了一下，系统却一声不吭地算成 `im f`（"点了跟没点一样"最费解）。
       * 空第二参（`image(f, )` 这种留空写法）仍按"没给"处理。
       */
      if (a[1] && !S && textOf(a[1]).trim() !== '') {
        return fail(
          `像的第二个参数得是群（H 是定义域的子群），收到的是「${refText(a[1])}」`,
          'H 要从定义域里取（如 closure(定义域, 生成元)）；不给 H 就直接算整个像 im f',
        )
      }
      if (S) {
        const dom = M.domain
        // 三关：阶不能超 → id 全覆盖 → 真的封闭（前两关只是快速筛，判据交给 core）
        if (S.order > dom.order) {
          return fail(
            `「${refText(a[1])}」比定义域还大，不可能是它的子群`,
            `子群像要求 H <= ${asciiSymbol(dom.symbol)}`,
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
          note: `H 在 ${asciiSymbol(M.codomain.symbol)} 里的像`,
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
    notation: 'contains(H, G)',
    mechanism: 'atomic',
    primitive: false,
    doc: '声明 H 是 G 的子群----画布上长出一条包含箭头（正规性由工具现场判定）',
    recipe: '子群判定（单位元 + 乘法封闭）-> 一条关系边',
    impl: 'relations.containment（与信息面板的「关系」层同一判据）',
    infix: ['\\subseteq'],
    call: ['contains', 'include', 'subset'],
    params: [
      { name: 'H', type: 'group' },
      { name: 'G', type: 'group' },
    ],
    arity: 2,
    result: 'relation',
    run: (a) => {
      const H = groupOf(a[0])
      const G = groupOf(a[1])
      if (!H || !G) return fail('contains 需要两个群对象', '形如 contains(H, G)')
      const hn = refText(a[0])
      const gn = refText(a[1])
      if (H === G) return fail('两边是同一个对象', '包含要求两个不同的群')
      if (H.order > G.order) {
        return fail(
          `|${hn}| = ${H.order} > |${gn}| = ${G.order}，不可能是它的子群`,
          '子群判定第一关就是阶整除',
        )
      }
      /**
       * **拉格朗日先判**（U38）：子群的阶必须整除母群的阶。
       * 这是**证明**了"没有"，比笼统的"不是子群"有信息量得多——
       * 用户实测的 `contains(C_3, V_4)` 就该说这句（3 不整除 4），
       * 而不是被含糊地打发成"元素不在同一个群里"。
       *
       * 有一种情形还得**补一句**：H 的 id 全都能在 G 里"找到"、却来自另一个群
       * （`C_3` 的 `e0 e1 e2` 在 `C_7` 里"也有"）—— 那是用户最容易踩的陷阱，
       * 不点破的话他会以为"名字对得上就该是子群"。
       */
      if (G.order % H.order !== 0) {
        const gIds = new Set(G.elements.map((e) => e.id))
        const trap =
          H.elements.every((e) => gIds.has(e.id)) && !idsComparable(H, G)
            ? `另外注意：${hn} 的元素记号在 ${gn} 里也"找得到"，但那是两个各自构造的群、记号碰巧重合，不是同一个东西`
            : '子群的阶必须整除母群的阶（这条是证明，不是"没算出来"）'
        return fail(
          `|${hn}| = ${H.order} 不整除 |${gn}| = ${G.order}，按拉格朗日定理不可能是子群`,
          trap,
        )
      }
      // 判据复用 U19 的 `containment()`（信息面板「关系」层用的是同一份）——
      // 于是"声明出来的关系"和"算出来的关系"永远一致，不会出现两种说法。
      // U38 起它还带**第二关**：元素 id 对不上时，在 G 里搜同构子群（独立构造的 V₄ ≤ S₄）。
      const c = containment(H, G)
      if (!c) {
        /**
         * 守卫挡下过就先说"未判定"（U38）：`containment` 的 `null` 在那种情形下
         * 只表示"**不知道**"。`contains(C_11, C_2^7)`（|G| = 128 超枚举上限）得说这句，
         * 说"不是子群"是假话。
         */
        if (embeddingSearchBlocked(H, G)) {
          return fail(
            `没能判定「${hn}」是不是「${gn}」的子群`,
            `${prettySymbol(G.symbol)} 太大（阶 ${G.order}）或带陪集元素，没做嵌入枚举；` +
              `若 ${hn} 的元素本来就取自 ${gn}，请从它构造（如 closure(${gn}, 生成元)）`,
          )
        }
        /**
         * 走到这里：**第二关真的搜过了**（阶严格且整除、两边都没陪集元素、|G| 在枚举
         * 上限内），结论是「G 里没有与 H 同构的子群」—— 所以"不是子群"这句是**算出来的**，
         * 不是"没算出来"。分诊那套（"元素不在同一个群里"/"记号碰巧重合"）退成**附注**：
         * 它解释的是"为什么两边元素对不上"，不再充当结论。
         */
        const why = subgroupMisdiagnosis(gn, G, hn, { group: H, elements: H.elements }, false)
        const tail =
          why && !why.ok
            ? `另外，${why.error}`
            : `${prettySymbol(H.symbol)} 的元素也不是 ${prettySymbol(G.symbol)} 的子集`
        return fail(
          `「${hn}」不是「${gn}」的子群`,
          `${prettySymbol(G.symbol)} 里没有与 ${prettySymbol(H.symbol)} 同构的子群（已枚举全部子群）。${tail}`,
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
        sub: `|H| = ${H.order}, [G:H] = ${c.index}`,
        note:
          c.normal === true
            ? '正规子群（判出来的，不是声明的）'
            : c.normal === null
              ? '正规性判不准：群太大未枚举，或 H 在 G 里有多个嵌入、正规性不一致（只要有非正规的嵌入，「非正规」就不是普适的说法）'
              : '非正规子群',
      }
    },
  },
  {
    id: 'isomorphism',
    notation: 'isomorphism(A, B)',
    mechanism: 'atomic',
    primitive: false,
    doc: '声明 A 与 B 同构----画布上长出一条双向箭头（同构判据与信息面板那句「同构于」同源）',
    recipe: '同构识别（阶 -> 结构不变量）-> 一条关系边',
    impl: 'insights.isomorphismOf（与信息面板「同构」结论同一判据）',
    infix: ['\\cong'],
    call: ['isomorphism', 'isomorphic', 'iso'],
    params: [
      { name: 'A', type: 'group' },
      { name: 'B', type: 'group' },
    ],
    arity: 2,
    result: 'relation',
    run: (a) => {
      const A = groupOf(a[0])
      const B = groupOf(a[1])
      if (!A || !B) return fail('isomorphism 需要两个群对象', '形如 isomorphism(A, B)')
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
          ? `都同构于 ${asciiSymbol(iso)}`
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
    recipe: '枚举全部子群',
    impl: 'findAllSubgroups',
    call: ['Sub', 'subgroups'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'subgroups',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('Sub 需要一个群')
      /**
       * 守卫必须自己判：core 的 `findAllSubgroups` 超限时**不报错**，直接回空数组
       * （720 阶实测 0ms 回 []）——照单全收就是"S_6 有 0 个子群"这种假答案。
       */
      if (G.order > ENUMERATION_LIMIT) {
        return fail(
          `|G| = ${G.order} 超过子群枚举线 ${ENUMERATION_LIMIT}：子群要逐个筛出来，这个规模本地跑不完`,
          `本地枚举上限 ${ENUMERATION_LIMIT}`,
        )
      }
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
    notation: 'maximalSubgroups(G)',
    mechanism: 'enumerate',
    primitive: false,
    doc: '极大子群：不能落在任何更大的真子群里的真子群（子群格上 G 的直接下层）',
    recipe: '在子群格里找覆盖边（上端 = G）',
    impl: 'computeSubgroupLattice',
    call: ['maximalSubgroups', 'maxSub'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'subgroups',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('maximalSubgroups 需要一个群')
      /**
       * 守卫必须**自己**判：core 的 `computeSubgroupLattice` 超限时不报错，
       * 而是退化成"{e} 与 G 两个节点"（实测 216 阶群）——照单全收会把**平凡子群**
       * 当成 G 的极大子群，正是最该避开的那类静默错误。
       */
      if (G.order > ENUMERATION_LIMIT) {
        return fail(
          `|G| = ${G.order} 超过子群枚举线 ${ENUMERATION_LIMIT}：极大子群要先有整张子群格，这个规模本地立不出来`,
          `本地枚举上限 ${ENUMERATION_LIMIT}`,
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
        label: `maximalSubgroups(${refText(a[0])})`,
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
    recipe: '枚举子群 -> 留阶 = p^k 的',
    impl: 'findAllPSubgroups',
    call: ['pSub', 'psub'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'p', type: 'prime' },
    ],
    arity: 2,
    result: 'subgroups',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('pSub 的第一个参数必须是群')
      const p = intOf(a[1])
      if (p === null) return fail('pSub 的第二个参数必须是整数')
      const bad = checkPrime(p, 'pSub')
      if (bad) return fail(bad)
      const load = pSubgroupLoad(G, p)
      if (load.load > P_SUBGROUP_LOAD_CAP) {
        return fail(
          `${refText(a[0])} 的 ${p}-元素有 ${load.elements} 个（压力 ${load.load.toFixed(0)}），p-子群要逐个枚举闭包，本地跑不完`,
          `本地压力上限 ${P_SUBGROUP_LOAD_CAP}`,
        )
      }
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
    notation: 'Syl(G, p)',
    mechanism: 'enumerate',
    primitive: false,
    doc: 'Sylow p-子群：阶恰为 p^k 的极大 p-子群',
    recipe: '枚举子群 -> 留 p-群 -> 取极大',
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
      if (!G) return fail('Syl 的第一个参数必须是群')
      const p = intOf(a[1])
      if (p === null) return fail('Syl 的第二个参数必须是整数')
      const bad = checkPrime(p, 'Syl_p')
      if (bad) return fail(bad)
      // 同 `pSub`：同一条枚举、同一条线（`Syl_2(S_6)` 实测 45s 没完）
      const load = pSubgroupLoad(G, p)
      if (load.load > P_SUBGROUP_LOAD_CAP) {
        return fail(
          `${refText(a[0])} 的 ${p}-元素有 ${load.elements} 个（压力 ${load.load.toFixed(0)}），Sylow 子群要逐个枚举闭包，本地跑不完`,
          `本地压力上限 ${P_SUBGROUP_LOAD_CAP}`,
        )
      }
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
    notation: 'normalSubgroups(G)',
    mechanism: 'enumerate',
    primitive: false,
    doc: 'G 的全部正规子群',
    recipe: '枚举子群 -> 留正规的',
    impl: 'findAllNormalSubgroups',
    call: ['normalSubgroups', 'SubNormal'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'subgroups',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('normalSubgroups 需要一个群')
      // 同上：core 超限静默回空数组，自己不拦就会说"S_6 没有正规子群"
      if (G.order > ENUMERATION_LIMIT) {
        return fail(
          `|G| = ${G.order} 超过子群枚举线 ${ENUMERATION_LIMIT}：正规子群要先把子群全筛一遍，这个规模本地跑不完`,
          `本地枚举上限 ${ENUMERATION_LIMIT}`,
        )
      }
      const subs = normalizeSubgroups(findAllNormalSubgroups(G), G)
      return {
        ok: true,
        value: { type: 'subgroups', group: G, subgroups: subs },
        label: `normalSubgroups(${refText(a[0])})`,
        sub: `${subs.length} 个正规子群`,
      }
    },
  },

  /* ══ 迭代 ══════════════════════════════════════════════ */
  {
    id: 'commutatorGroup',
    notation: 'commutator(G)',
    mechanism: 'iterate',
    primitive: false,
    doc: '换位子群：全部换位子 [g,h] 生成的子群',
    recipe: 'closure(换位子集) = 迭代乘法直到封闭',
    impl: 'commutatorClosure \\to buildSubgroupGroup',
    call: ['commutator'],
    params: [{ name: 'G', type: 'group' }],
    arity: 1,
    result: 'group',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('commutator 需要一个群')
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
    notation: 'closure(S, g_1, ...)',
    mechanism: 'iterate',
    primitive: false,
    doc: '生成子群：把 S 在乘法下反复闭合到不再增长；也可写 <G, (123), (12)> 从记号生成',
    recipe: '迭代(乘法, 直到封闭)',
    impl: 'closeUnderMultiply \\to buildSubgroupGroup',
    call: ['closure', 'generate'],
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
      //   `closure(G, r2)` → G 当上下文，种子来自 r2
      //   `closure(J)`     → J 自己就是（子）群对象，**取它的元素当种子**
      // 之前只判 `if (G0)`，于是 `closure(J)` 落到"G 当上下文 + 空种子"⇒ 得到平凡群
      // （复现定理的体检抓到的：`Z ∩ C` 阶 2，闭包后变阶 1）。
      if (G0 && a.length > 1) {
        group = G0
        seeds = []
        genTexts = a.slice(1).map(refText)
      } else {
        const S = subgroupArgOf(a[0])
        if (!S) return fail('closure 需要一个集合', '也可写 closure(G, g_1, g_2)：群在前当上下文，后面填元素记号')
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
        sub: `|<S>| = ${els.length}${structSuffix(group, els)}`,
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
    call: ['ord', 'order'],
    params: [
      { name: 'G', type: 'group' },
      { name: 'g', type: 'element' },
    ],
    arity: 2,
    result: 'number',
    run: (a) => {
      const G = groupOf(a[0])
      if (!G) return fail('ord 的第一个参数必须是群')
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
    notation: 'factorize(n)',
    mechanism: 'arithmetic',
    primitive: false,
    doc: '整数素因子分解 n = prod p^e',
    impl: 'factorizeOrder',
    call: ['factor', 'factorize'],
    params: [{ name: 'n', type: 'int' }],
    arity: 1,
    result: 'number',
    run: (a) => {
      const n = intOf(a[0])
      if (n === null) return fail('factorize 需要一个整数')
      if (n < 1) return fail('factorize 只接受正整数')
      const fs = factorizeOrder(n)
      const pretty = fs.map((f) => (f.exponent === 1 ? `${f.prime}` : `${f.prime}${superscript(f.exponent)}`)).join(' * ')
      return {
        ok: true,
        value: { type: 'number', label: pretty, value: n },
        label: `factorize(${n})`,
        sub: `= ${pretty}`,
      }
    },
  },
  {
    id: 'binomial',
    notation: 'binomial(n, k)',
    mechanism: 'arithmetic',
    primitive: false,
    doc: '精确组合数 C(n, k)',
    impl: '本地 BigInt',
    call: ['C', 'binomial', 'choose'],
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
    notation: 'binomialMod(n, k, p)',
    mechanism: 'arithmetic',
    primitive: false,
    doc: '组合数对 p 取模（Lucas 定理），Wielandt 证明的计数段用它',
    impl: 'binomialMod',
    call: ['Cmod', 'binomialMod'],
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
      if (p < 2) return fail('binomialMod 的 p 必须 >= 2')
      if (n < 0 || k < 0) return fail('binomialMod 只接受非负整数')
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
    doc: '最大公因数（`closure(G, r6, r4)` 那类"生成元的合成"里天天用到的那一步）',
    impl: '本地（欧几里得）',
    call: ['gcd'],
    params: [
      { name: 'a', type: 'int' },
      { name: 'b', type: 'int' },
    ],
    arity: 2,
    result: 'number',
    run: (a) => {
      const x = intOf(a[0])
      const y = intOf(a[1])
      if (x === null || y === null) return fail('gcd 需要两个整数')
      if (x < 0 || y < 0) return fail('gcd 只接受非负整数')
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
    doc: '最小公倍数（a*b = gcd*lcm）',
    impl: '本地（gcd \\to lcm）',
    call: ['lcm'],
    params: [
      { name: 'a', type: 'int' },
      { name: 'b', type: 'int' },
    ],
    arity: 2,
    result: 'number',
    run: (a) => {
      const x = intOf(a[0])
      const y = intOf(a[1])
      if (x === null || y === null) return fail('lcm 需要两个整数')
      if (x < 0 || y < 0) return fail('lcm 只接受非负整数')
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
    notation: 'eulerPhi(n)',
    mechanism: 'arithmetic',
    primitive: false,
    doc: '欧拉函数：1 <= k <= n 里与 n 互素的 k 的个数（= n * prod (1 - 1/p)）',
    impl: '本地（走 factorizeOrder）',
    call: ['phi', 'eulerPhi'],
    params: [{ name: 'n', type: 'int' }],
    arity: 1,
    result: 'number',
    run: (a) => {
      const n = intOf(a[0])
      if (n === null) return fail('eulerPhi 需要一个整数')
      if (n < 1) return fail('eulerPhi 只接受正整数')
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
      // 群位：结构**够格成群**时放行（判据与 `structureToGroup` / `level` 同源）；
      // 非群结构（原群 / 半群 / 幺半群）在这里被挡 ⇒ 菜单因此不撒谎。
      if (v.type === 'group') return true
      if (v.type === 'structure') return isGroupStructure(v.structure)
      return false
    case 'carrier':
      // 载体位：**还没加运算的集合**。`set`（任意，含无母群的 `pointSet`）或 `elements`。
      // 不复用 `subset`：F1 修完的 `subset` 要求 `set` 有母群，而载体恰是 `pointSet(3)`
      // 这种抽象点集 —— 塞进 `subset` 会被拒，又是一轮菜单撒谎。
      return v.type === 'set' || v.type === 'elements'
    case 'action':
      return v.type === 'action'
    case 'map':
      return v.type === 'map'
    case 'setlike': {
      // **集合代数**（`∩ ∪ ∖ ·` 与 `底集`）：子群集列表**整体**当集合读。
      //
      // ⚠️ **不收 `set`**：`底集` 要的是"还没忘记结构的东西"（子群集 / 元素集 / 群），
      // 而 set 已经没有结构可忘了 —— 从前无条件收，于是集合节点的球上铺着 `asSet`、
      // 点下去只报「没有底集可取」（菜单撒谎）。判据与 `underlyingSet.run` 的 else 分支同宽。
      if (v.type === 'elements' || v.type === 'subgroups') return true
      if (v.type !== 'group') return false
      return groupAsSet(v.group)
    }
    case 'omega': {
      // Ω：恰好是 `omegaArgOf` 收的那几种（**不收 subgroups 列表**，哪怕是单元素）
      // —— `共轭作用在` / `陪集作用` 走的是"点背后必须有子群/元素"那套算法，
      // 而 `omegaArgOf` 只从 `set` / `elements` / `group` 里读出 `points`。
      // U58 只把 `omegaOrInt`（`customAction` 的 Ω）放开了子群集，这里**故意不动**：
      // 要放开得连 `omegaArgOf` 的 `points` 一起改，等点名。
      //
      // ⚠️ `omega` 位**唯一**的消费者是 `conjOn`（`conjugationOnSet`，F4）：它要的是
      // "G 共轭作用在它的一族子群/元素上"，而 `pointSet(n)` / `labeledSet(...)` 这批
      // **抽象点集没有共轭可言**（`v.set.group` 是 null ⇒ `omegaArgOf` 读出的 `ambient`
      // 是 null ⇒ run 里必然报"要 Omega 是某个群的子群集/元素集"）。列出来点下去必报错
      // 就是菜单撒谎，所以这里要求 `set` **有母群**才收 —— 判据与 `conjOn.run` 里
      // `ambient` 那道关同宽。抽象点集要走「customAction」（它的位是 `omegaOrInt`）。
      if (v.type === 'elements') return true
      if (v.type === 'set') return v.set.group != null
      if (v.type !== 'group') return false
      return groupAsSet(v.group)
    }
    case 'omegaOrInt': {
      // Ω **或**它的点数（U53）：画布给得了的那些与 `omega` 一样，
      // 给不了的那一支（一个整数）由文本 / 编辑器补 —— 那一支不是 `GalValue`，走不到这儿。
      //
      // U58：判据**委托内核那一份**（`customAction.ts#isOmegaCarrier`）——
      // 于是"画布上点得动的"与"`omegaSpecOfValue` 读得出的"永远是同一批。
      // 多出来的那一档是 `subgroups`：子群集本身就是一族点，用户 2026-10-03 问
      // 「特殊构造的集合（比如子群集）你怎么弄？」—— 从前得先手打一次 `asSet`。
      if (isOmegaCarrier(v)) {
        if (v.type !== 'group') return true
        return groupAsSet(v.group)
      }
      return false
    }
    case 'subset': {
      // **单个**数集。`subgroups` 只在恰好一个成员时收——那时它等于一个子群
      //（`closure(S)` / `quotient(G, N)` 这类就是这么用的）。
      if (v.type === 'elements') return true
      // `set`：只有真的是"某个群的元素的提升"才收（`asSet(群/元素集)` 成立；
      // `pointSet(n)` / `asSet(子群集)` 不成立）。判据与内核共用 `setElementSetOf`。
      if (v.type === 'set') return setElementSetOf(v) !== null
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
  /*
   * 「已知群」没有元素表（U48）—— **一条都不列**。
   * 「菜单不撒谎」这条纪律要求列给用户点的东西点下去必须真能跑，而它跑不了；
   * 与其列出来再报错，不如这里就空着（面板侧另有说明为什么空）。
   */
  if (selection.some((v) => v.type === 'group' && isKnownGroup(v.group))) return []
  return OPS.filter((op) => {
    if (selection.length > op.params.length) return false
    for (let i = 0; i < selection.length; i++) {
      const p = op.params[i]
      /*
       * ⚠️ **U53**：这里原来还有一句"标量参数不能由画布提供 ⇒ 直接 return false"。
       * 它是 `paramAccepts` 的**冗余替身**（那个 switch 对四个标量类型本来就回 false），
       * 但 `omegaOrInt` 同时是"能空着"与"能吃画布上的集合"——那句替身会把
       * "选中 G 与一个集合"整条路误杀。删掉它，逐项交给 `paramAccepts` 真判。
       */
      if (!paramAccepts(p.type, selection[i], selection.slice(0, i))) return false
    }
    for (let i = selection.length; i < op.params.length; i++) {
      const p = op.params[i]
      if (!p.optional && !isScalarParam(p.type)) return false
    }
    /*
     * **候选预检**（U51）：类型匹配还不够 —— 有些 op 对任意两个对象都有定义，
     * 但**本地算不动**（`A_4 ⋊ S_4` 要 14 秒）。列出来点下去必被守卫拦住就是撒谎。
     *
     * ⚠️ **U52 收紧**：从前这里要求 `selection.length === op.params.length`（"参数凑齐才判"），
     * 那对**夹着标量参数**的单对象 op 永远不成立 —— 画布给不了 `n`（`自定义作用` 的 `int`），
     * 于是预检形同虚设。现在改成**类型匹配就调**，实现自己按契约容忍前缀
     * （判不了返回 `true`，见 `OpDef.fits` 的注释）。
     */
    if (op.fits && !op.fits(selection)) return false
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
  semidirectProduct: 'G \\rtimes H',
  quotient: 'G / N',
  conjugationAction: 'conjAction(G)',
  leftTranslationAction: 'leftAction(G)',
  cosetAction: 'cosetAction(G, P)',
  // U52：不给这一条，径向菜单那个 `<code>` 会退到 `notation`（一长串占位符），
  // 而模板的意思是"**照这个敲就能跑**"——给个真能跑的短例子。
  // U53：第二参改成 `4` 或 `pointSet(4)` 都行，模板给短的（数字）。
  customAction: 'customAction(G, 4, a -> (1 2 3 4))',
  // U53：凭空造集合的两条 —— 它们不需要任何对象，所以只可能在"照这个敲"的地方露面
  pointSet: 'pointSet(5)',
  labeledSet: 'labeledSet(a, b, c)',
  automorphismGroup: 'Aut(G)',
  intersection: 'A \\cap B',
  union: 'A \\cup B',
  difference: 'A \\setminus B',
  productSet: 'A \\cdot B',
  center: 'Z(G)',
  centralizer: 'C_G(G, S)',
  normalizer: 'N_G(G, H)',
  orbits: 'orbits(A, e)',
  stabilizers: 'stabilizer(A, e)',
  fixedPoints: 'fix(A)',
  orbitCount: 'burnside(A)',
  kernel: 'ker(f)',
  image: 'im(f)',
  subgroups: 'Sub(G)',
  maximalSubgroups: 'maximalSubgroups(G)',
  innerAutomorphismGroup: 'Inn(G)',
  pSubgroups: 'pSub(G, 2)',
  sylow: 'Syl(G, 2)',
  normalSubgroups: 'normalSubgroups(G)',
  commutatorGroup: 'commutator(G)',
  closure: '\\langle G, (123), (12)\\rangle',
  elementOrder: 'ord(G, r2)',
  factorize: 'factorize(12)',
  binomial: 'C(12, 4)',
  binomialMod: 'Cmod(12, 4, 2)',
  gcd: 'gcd(12, 18)',
  lcm: 'lcm(4, 6)',
  eulerPhi: 'phi(12)',
}

export function opTemplate(op: OpDef): string {
  return TEMPLATES[op.id] ?? op.notation
}
