import {
  isScalarParam,
  OPS,
  opsFor,
  paramAccepts,
  takesCanvasObject,
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
// 「已知群」不能当输入（U48）
import { isKnownGroup } from './known'
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
  /**
   * 等对象参数：点画布上的节点往下凑。
   *
   * `presetOmega`（U57）：用户**已经指明了 Ω**（点集合节点的「被作用」），
   * 这个 id 一路带到编辑器，填进 Ω 那一格 —— 不这么做的话，他点过的那个集合
   * 会在编辑器里被 `|G|` 覆盖掉，等于把他指的东西弄丢。只 `customAction` 用得上。
   */
  | { kind: 'pending'; opId: string; picked: string[]; presetOmega?: string }
  /** 等标量参数：顶部补参条，回车执行 */
  | { kind: 'fill'; opId: string; picked: string[]; scalars: (string | null)[] }
  /** 交给编辑器（映射构建器）：对象参数已齐，还要用户填生成元的像 */
  | { kind: 'editor'; opId: string; picked: string[]; presetOmega?: string }

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
 * 判据用 `takesCanvasObject`（**含可选对象位、也含 `omegaOrInt` 那一档半对象**）：
 * `image(f, H)` 必需位只有 1 个（f），但第二位 H 是"可以再点一个对象"的 —— 它得在这里出现，
 * 否则 `f(H)` 除了拖拽 / 打字就没有入口（用户实测的正是这条）。
 *
 * ⚠️ **U57 改判据**：从前这里是 `maxObjectArity(op) > 1`（"两个**纯**对象位"）。
 * 它漏掉了 `customAction` —— 那条 op 的第二位 Ω 是 `omegaOrInt`（既能吃画布上的集合，
 * 也能空着填个点数，U53），于是**第二种筛子看不见它**。实测后果：用户手上正好有
 * `G` 与一个点集、点开这颗球想「把两样凑一起」，菜单里 15 条全列出来偏偏没有它
 * （同族的 `conjOn` / `cosetAction` 都在），只能去群节点的球里找。
 * 换成 `takesCanvasObject` 之后，"要不要从画布上点对象"这个**真问题**才问对了。
 */
export function multiOps(): OpDef[] {
  return OPS.filter(
    (op) => op.params.filter((p) => takesCanvasObject(p.type)).length > 1,
  )
}

/**
 * 悬浮球面板里的短标签。
 *
 * ⚠️ **这张表在 U54 被删掉了** —— 它从前是一张"每个 op 手写一条中文短标签"的表，
 * 漏写一条就退到 `op.notation`。那时的 `notation` 是 LaTeX 源（`N \rtimes H`），
 * 退过去就是把反斜杠当纯文本贴按钮上（U51 踩过）。于是表只增不减，
 * 每加一个 op 都得记得同步 —— 而"记得同步"从来不是一条能靠得住的纪律。
 *
 * 现在 `notation` 本身就是**纯 ASCII 函数式**（`directProduct(A, B)`，见 ops.ts），
 * 兜底切出 `(` 之前那段正好就是用户要敲的英文名。所以**兜底即正解**：
 * 一张需要手工同步的表，不如一个不会漂移的派生。
 *
 * ⚠️ 唯一的约束：`notation` 里不许再出现 LaTeX 命令或非 ASCII（回归里有一条断言守着）。
 */
export function menuLabel(op: OpDef): string {
  const paren = op.notation.indexOf('(')
  return paren > 0 ? op.notation.slice(0, paren) : op.notation
}

/**
 * 补参条 / 提示里的**参数类型**说明。
 *
 * 这是**说明文字**（告诉用户"该选什么"），不是标识符 —— 所以保持中文 UI 语言。
 * 但同样**不许写 LaTeX**：`pendingHint` 把它拼进纯文本串（`选择「A」（群）`），
 * 写了 `\Omega` 用户看见的就是反斜杠。写 `Omega`。
 */
export const PARAM_LABEL: Record<ParamType, string> = {
  group: '群',
  subset: '元素集 / 子群',
  setlike: '集合 / 子群集',
  omega: '集合 Omega',
  // U53：Ω 或它的点数 —— 补参条上就是这个意思（画布给不了就填个数字）
  omegaOrInt: '点集 Omega 或点数',
  action: '作用',
  map: '映射',
  element: '元素记号',
  prime: '素数',
  int: '整数',
  genImage: '生成元 -> 像',
}

/** 该操作凑齐对象参数后要不要弹编辑器（映射构建器）。 */
export function needsEditor(op: OpDef): boolean {
  return !!op.editor
}

/** pending 提示条文案：下一个要选的是哪一位。 */
export function pendingHint(op: OpDef, pickedCount: number): string {
  const p = op.params[pickedCount]
  if (!p) return '选择参数'
  // 必需位**已经选满**、还剩可选对象位（`image(f, ·)` 的 H）：这不是"还差一个"，
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
   * 拖拽天然不表达顺序，而参数是**有序**的（`image(f, H)` 的 f 必须在前面）。
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
  // 半直积（U51）紧挨直积 —— 同上"造个新的"，只是多要一个作用
  'semidirectProduct',
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
 * 参数有序而拖拽无序：`image(f, H)` 与 `contains(H, G)` 都是两参，但先后不能反。
 * 于是正反各试一次、合并去重（同一 op 只留先匹配上的那个顺序）。
 */
export function pairOps(a: GalValue, b: GalValue): PairCandidate[] {
  // 「已知群」没有元素表（U48）：拖动两条边也列不出能跑的操作（菜单不撒谎）
  const known = (v: GalValue) => v.type === 'group' && isKnownGroup(v.group)
  if (known(a) || known(b)) return []
  const out: PairCandidate[] = []
  for (const op of OPS) {
    if (op.params.length < 2) continue
    const [p0, p1] = op.params
    /*
     * 前两位都得是**画布上选得出来的对象**参数：标量（元素记号 / 素数 / 整数）拖不出来。
     *
     * U57：判据走 `takesCanvasObject` 而**不是** `isScalarParam` —— `omegaOrInt`
     * 是半对象档（能吃画布上的集合），漏掉它的话「把 G 拖到点集上」列不出
     * `customAction`（与 ⊕ 球同一处病根，共用同一份判据）。
     */
    if (!takesCanvasObject(p0.type) || !takesCanvasObject(p1.type)) continue
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
    /**
     * **候选预检**（U51）：类型上"填得上"不等于**跑得动**。
     *
     * `⋊` 与直积不同 —— 它对任意两个群都有定义，但本地不一定算得动
     * （`A_4 ⋊ S_4` 实测要 14 秒：160 组生成元像，每组建一个 288 阶群再算指纹）。
     * 列出来点下去被预算拦住，就是这一批最忌讳的「菜单撒谎」。
     *
     * 与 `planSemidirect` 的首道门共用同一个判据（`semidirectBudget`），两处不会打架。
     * 顺序取"能匹配上的那个方向"（参数有序而拖拽无序）——预检也跟着同一个顺序判。
     */
    if (op.fits && !op.fits(forward ? [a, b] : [b, a])) continue
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
 * 背景：菜单**不撒谎** —— `contains(H, G)` 只有真判得出包含关系时才会出现在候选里。
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
