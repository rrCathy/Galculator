import {
  isScalarParam,
  OPS,
  opsFor,
  paramAccepts,
  type OpDef,
  type ParamType,
} from './ops'
import { maxObjectArity, objectArity } from './compose'
// 包含判据与信息面板的「关系」层（U19）**共用同一份**。
// `embeddingSearchBlocked` = 「嵌入那条路被守卫挡下了」（U38），`pairMissHint` 用它区分
// "证明了没有"与"没算"
import { containment, embeddingSearchBlocked } from './relations'
// 同构判据同源（缺口 ⑰）
import { isomorphismOf } from './insights'
import { prettySymbol } from './pretty'
import type { GalValue } from './value'

/**
 * 画布交互状态机（交互模型 §4.2）。
 *
 * 这一层只描述**状态**与**转移**，不碰 DOM——于是它能被单元测试直接断言
 * （U2 的验证脚本就是这么做的）。
 *
 * ```
 * idle ──click(node)──→ selected ──click(悬浮球)──→ menu
 * menu ──click(单对象操作)──→ 执行 ──→ selected(新对象)
 * menu ──click(多对象操作)──→ pending(opId,[node])
 * menu ──click(需要标量的一元操作)──→ fill(opId,[node])
 * pending ──click(node)──→ pending(opId, picked+[node]) ──凑够对象参数──→ 执行 / fill / editor
 * pending / fill / editor ──Esc / 点空白──→ idle
 * ```
 *
 * `editor` 是 U3 补的一档：**映射**这类操作的实参一行文本表达不了
 * （要填生成元的像），凑齐对象参数后转交构建器，而不是直接执行。
 */
export type Interaction =
  | { kind: 'idle' }
  | { kind: 'selected'; target: string }
  | { kind: 'menu'; target: string }
  /** 等对象参数：点画布上的节点往下凑 */
  | { kind: 'pending'; opId: string; picked: string[] }
  /** 等标量参数：顶部补参条，回车执行 */
  | { kind: 'fill'; opId: string; picked: string[]; scalars: (string | null)[] }
  /** 交给编辑器（映射构建器）：对象参数已齐，还要用户填生成元的像 */
  | { kind: 'editor'; opId: string; picked: string[] }

export const IDLE: Interaction = { kind: 'idle' }

/** 竖卡要展示哪个对象（pending / editor 时停在**第一个**参数——它是"源"）。 */
export function focusId(inter: Interaction): string | null {
  switch (inter.kind) {
    case 'selected':
    case 'menu':
      return inter.target
    case 'pending':
    case 'fill':
    case 'editor':
      return inter.picked[0] ?? null
    default:
      return null
  }
}

/** 需要高亮的节点（pending/fill/editor 时已点过的那些）。 */
export function pickedIds(inter: Interaction): string[] {
  return inter.kind === 'pending' || inter.kind === 'fill' || inter.kind === 'editor'
    ? inter.picked
    : []
}

/** 正在进行的操作 id（提示条要显示它的记法）。 */
export function activeOpId(inter: Interaction): string | null {
  return inter.kind === 'pending' || inter.kind === 'fill' || inter.kind === 'editor'
    ? inter.opId
    : null
}

/**
 * **单对象操作**（UI v3：对象悬浮球 → 第 4 个按钮）：只需这一个对象就能算完，点了立刻创建对象。
 *
 * 两处过滤：
 *   - `objectArity ≤ 1`——只需一个对象（末尾的标量参数交给补参条）；
 *   - **排除产数值的**（`ord` 这类）——用户定了"计算先不弄"，所以它不进菜单。
 */
export function singleOpsFor(value: GalValue): OpDef[] {
  return opsFor([value]).filter((op) => objectArity(op) <= 1 && op.result !== 'number')
}

/**
 * **多对象操作**（UI v3：显示区正上方的悬浮球）：**全局**列表，不依赖选中了谁。
 *
 * 这里**不能**用 `opsFor` 去筛——它的语义是"选中的值能把参数填满"，
 * 而"多对象操作"恰恰是"参数还没填满"的那些，用 `opsFor` 筛必然为空。
 * （U2 就是栽在这儿：菜单里的「造」类恒空。）
 *
 * 判据用 `maxObjectArity`（**含可选对象参数**）：`像(f, H)` 必需位只有 1 个
 * （f），但第二位 H 是"可以再点一个对象"的 —— 它得在这里出现，
 * 否则 `f(H)` 除了拖拽 / 打字就没有入口（用户实测的正是这条）。
 */
export function multiOps(): OpDef[] {
  return OPS.filter((op) => maxObjectArity(op) > 1)
}

/**
 * 悬浮球面板里的短标签：一圈放不下 `pSub(G, p)` 这种全记法。
 *
 * ⚠️ **这一张表里不许写 LaTeX 命令**（2026-09-27 起）。这一圈标签在按钮上是
 * **纯文本**显示，写了 `\times` 用户就会看到一串反斜杠；而如果改成走渲染，
 * 数学模式又会把 `中心 Z` 里的空格吃掉（KaTeX 在数学模式下忽略空格）。
 * 所以这里的形态就是**中文 + ASCII**：`交`、`并`、`包含` 这些词已经说清了操作，
 * 不需要再挂一个符号。要挂符号就得把标签拆成"文字 + 数学"两段渲染 —— 不值得。
 */
const MENU_LABEL: Record<string, string> = {
  directProduct: '直积',
  quotient: '商 /',
  intersection: '交',
  union: '并',
  difference: '差',
  productSet: '积集',
  center: '中心 Z',
  centralizer: '中心化子 C_G',
  normalizer: '正规化子 N_G',
  commutatorGroup: '换位子群 [G,G]',
  automorphismGroup: '自同构 Aut',
  subgroups: '所有子群',
  pSubgroups: 'p-子群',
  sylow: 'Sylow p-子群',
  normalSubgroups: '正规子群',
  conjugationAction: '共轭作用',
  leftTranslationAction: '正则作用',
  orbits: '轨道',
  stabilizers: '稳定子',
  fixedPoints: '不动点',
  kernel: '核 ker',
  image: '像 f(H)',
  closure: '生成子群 <S>',
  elementOrder: '元素阶 ord',
  map: '映射 f: G -> H',
  contains: '包含',
  isomorphism: '同构',
}

export function menuLabel(op: OpDef): string {
  if (MENU_LABEL[op.id]) return MENU_LABEL[op.id]
  const paren = op.notation.indexOf('(')
  return paren > 0 ? op.notation.slice(0, paren) : op.notation
}

export const PARAM_LABEL: Record<ParamType, string> = {
  group: '群',
  subset: '元素集 / 子群',
  setlike: '集合 / 子群集',
  omega: '集合 \\Omega',
  action: '作用',
  map: '映射',
  element: '元素记号',
  prime: '素数',
  int: '整数',
  genImage: '生成元 \\to 像',
}

/** 该操作凑齐对象参数后要不要弹编辑器（映射构建器）。 */
export function needsEditor(op: OpDef): boolean {
  return !!op.editor
}

/** pending 提示条文案：下一个要选的是哪一位。 */
export function pendingHint(op: OpDef, pickedCount: number): string {
  const p = op.params[pickedCount]
  if (!p) return '选择参数'
  // 必需位**已经选满**、还剩可选对象位（`像(f, ·)` 的 H）：这不是"还差一个"，
  // 而是"可以再点一个"——措辞得让"不选也行"一眼可见，否则用户以为卡住了。
  if (pickedCount >= objectArity(op)) {
    return `可选：「${p.name}」（${PARAM_LABEL[p.type]}）----不选就直接执行`
  }
  return `选择「${p.name}」（${PARAM_LABEL[p.type]}），第 ${pickedCount + 1} / ${maxObjectArity(op)} 个对象`
}

/**
 * pending 时某个候选节点能不能当**下一位**参数。
 *
 * 复用的就是 `opsFor` 的匹配规则，所以"菜单里能点出来的"与"这里能点的"永远一致。
 */
export function canPick(
  op: OpDef,
  index: number,
  pickedValues: GalValue[],
  candidate: GalValue,
): boolean {
  const p = op.params[index]
  if (!p) return false
  if (isScalarParam(p.type)) return false
  return paramAccepts(p.type, candidate, pickedValues)
}

/* ── 两个对象凑一起（第四批：拖拽连线）────────────────────── */

export interface PairCandidate {
  op: OpDef
  /**
   * `true` = 参数顺序与"从 A 拖到 B"相反（B 当第一参）。
   *
   * 拖拽天然不表达顺序，而参数是**有序**的（`像(f, H)` 的 f 必须在前面）。
   * 所以两个方向都试、各自记下顺序 —— 于是"从 H 拖向 f"和"从 f 拖向 H"都能成，
   * 用户不必记住哪个该在前面。
   */
  swapped: boolean
}

/**
 * 菜单里的排序 —— 越靠前越像"用户此刻想干的事"。
 *
 * 判据是**数学意图**而不是注册表顺序：声明包含 / 商 / 像 是"说清这两个的关系"，
 * 直积是"造个新的"，集合运算（∩ ∪ ∖ ·）在群上用得最少，映射要进编辑器（最重）。
 */
const PAIR_PRIORITY = [
  'contains',
  'isomorphism',
  'quotient',
  'image',
  'directProduct',
  'intersection',
  'productSet',
  'union',
  'difference',
  'map',
]

/**
 * 把两个对象凑一起能做的操作（拖拽连线的候选）。
 *
 * ## 与 `opsFor` 的关系
 *
 * `opsFor([A, B])` 会连**单对象**操作一起返回（B 只是"顺带选中"），
 * 而拖拽的语义是"**这两个**能凑出什么" —— 所以这里要求两个对象
 * **各占一个参数位**，且第二个参数位之后的必需参数都必须能由文本补（标量）或是可选的。
 *
 * ## 两个方向都试
 *
 * 参数有序而拖拽无序：`像(f, H)` 与 `包含(H, G)` 都是两参，但先后不能反。
 * 于是正反各试一次、合并去重（同一 op 只留先匹配上的那个顺序）。
 */
export function pairOps(a: GalValue, b: GalValue): PairCandidate[] {  const out: PairCandidate[] = []
  for (const op of OPS) {
    if (op.params.length < 2) continue
    const [p0, p1] = op.params
    // 前两位都得是**画布上选得出来的对象**参数：标量（元素记号 / 素数 / 整数）拖不出来
    if (isScalarParam(p0.type) || isScalarParam(p1.type)) continue
    // 第三位往后：可选的留着，标量的交给补参条，其余（还得再选对象的）这条手势凑不齐
    const restOk = op.params.slice(2).every((p) => p.optional || isScalarParam(p.type))
    if (!restOk) continue
    /**
     * **`包含` 单独走一遍实判**。
     *
     * 它的两个参数都是 `group` —— 类型上任何两个群都"填得上"，而且正反都算匹配，
     * 于是**顺序也无从区分**。可它偏偏有真判据（H 得真是 G 的子群、且严格小于）：
     * 只按类型匹配的话，"把 S₄ 拖到 S₃ 上"会列出一条点了必然报错的「包含」，
     * 而这一批的纪律就是**菜单不撒谎**。
     *
     * 所以这里：两个方向各判一次，取成立的那个（判据本身就定了顺序）。
     * 别的同型参数 op（直积 / 映射）没这个问题 —— 它们对任意两个对象都成立。
     */
    if (op.id === 'contains') {
      if (a.type !== 'group' || b.type !== 'group') continue
      const ab = containment(a.group, b.group)
      const ba = containment(b.group, a.group)
      if (ab && ab.index > 1) out.push({ op, swapped: false })
      else if (ba && ba.index > 1) out.push({ op, swapped: true })
      continue
    }

    /**
     * **`同构` 也单独走一遍实判**（缺口 ⑰）——理由与 `包含` 同款：
     * 两个 `group` 参数类型上永远"填得上"，所以必须用真判据决定它是否该出现在候选里
     * （菜单不撒谎：列出来的点了就得成）。
     *
     * 判据是**三态**（`isomorphismOf`）：
     *   · `no`（阶不同，或阶同而识别出不同的同构类）→ **不列**，点了必然报错；
     *   · `yes` → 列，点一下直接长出一条 `≅`；
     *   · `unknown`（超出本地识别范围）→ 也列 —— 操作本身收下这条声明（面板照实说"未判定"），
     *     不存在"点了必然报错"的情形。
     */
    if (op.id === 'isomorphism') {
      if (a.type !== 'group' || b.type !== 'group') continue
      if (a.group === b.group) continue
      if (isomorphismOf(a.group, b.group) !== 'no') out.push({ op, swapped: false })
      continue
    }

    const forward = paramAccepts(p0.type, a, []) && paramAccepts(p1.type, b, [a])
    const backward = paramAccepts(p0.type, b, []) && paramAccepts(p1.type, a, [b])
    if (!forward && !backward) continue
    out.push({ op, swapped: !forward && backward })
  }

  const rank = (c: PairCandidate): number => {
    const i = PAIR_PRIORITY.indexOf(c.op.id)
    return i < 0 ? PAIR_PRIORITY.length : i
  }
  const regIndex = new Map(OPS.map((o, i) => [o.id, i]))
  return out.sort(
    (x, y) =>
      rank(x) - rank(y) ||
      (regIndex.get(x.op.id) ?? 0) - (regIndex.get(y.op.id) ?? 0),
  )
}

/**
 * 两个群凑在一起、候选里却**没有「包含」**时的一句解释（U38）。
 *
 * 背景：菜单**不撒谎** —— `包含(H, G)` 只有真判得出包含关系时才会出现在候选里。
 * 但"没列出来"和"为什么没列出来"是两件事：用户实测把 `C_3` 拖到 `V_4` 上，
 * 菜单里只有直积 / 映射，没有任何地方说一句"3 不整除 4"。
 *
 * 只对**两个群**给答案（别的情形原因太杂，硬凑一句话反而会误导）；其余返回 `null`。
 * 措辞分三种，正好对应 `containment` 的三种"没有"：
 *   · 阶不整除 → 拉格朗日**证明了**没有；
 *   · 群太大 / 带陪集 → **没算**（`embeddingSearchBlocked`）；
 *   · 其余 → **算过了**，G 里确实没有与 H 同构的子群。
 */
export function pairMissHint(a: GalValue, b: GalValue): string | null {
  if (a.type !== 'group' || b.type !== 'group') return null
  const g1 = a.group
  const g2 = b.group
  if (g1 === g2) return null
  const [lo, hi] = g1.order <= g2.order ? [g1, g2] : [g2, g1]
  if (hi.order % lo.order !== 0) {
    return `|${prettySymbol(lo.symbol)}| = ${lo.order} 不整除 |${prettySymbol(hi.symbol)}| = ${hi.order}，按拉格朗日定理不可能有包含关系`
  }
  if (embeddingSearchBlocked(lo, hi)) {
    return `${prettySymbol(hi.symbol)}（阶 ${hi.order}）太大或带陪集元素，没做嵌入枚举，所以包含关系也判不了`
  }
  return `${prettySymbol(hi.symbol)} 里没有与 ${prettySymbol(lo.symbol)} 同构的子群（已枚举全部子群）`
}
