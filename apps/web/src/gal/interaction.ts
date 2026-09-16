import {
  isScalarParam,
  OPS,
  opsFor,
  paramAccepts,
  type OpDef,
  type ParamType,
} from './ops'
import { objectArity } from './compose'
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
 */
export function multiOps(): OpDef[] {
  return OPS.filter((op) => objectArity(op) > 1)
}

/** 悬浮球面板里的短标签：一圈放不下 `pSub(G, p)` 这种全记法。 */
const MENU_LABEL: Record<string, string> = {
  directProduct: '直积 ×',
  quotient: '商 /',
  intersection: '交 ∩',
  union: '并 ∪',
  difference: '差 \\',
  productSet: '积集 ·',
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
  image: '像 im',
  closure: '生成子群 ⟨S⟩',
  elementOrder: '元素阶 ord',
  map: '映射 f: G → H',
}

export function menuLabel(op: OpDef): string {
  if (MENU_LABEL[op.id]) return MENU_LABEL[op.id]
  const paren = op.notation.indexOf('(')
  return paren > 0 ? op.notation.slice(0, paren) : op.notation
}

export const PARAM_LABEL: Record<ParamType, string> = {
  group: '群',
  subset: '集合 / 子群',
  action: '作用',
  map: '映射',
  element: '元素记号',
  prime: '素数',
  int: '整数',
  genImage: '生成元 → 像',
}

/** 该操作凑齐对象参数后要不要弹编辑器（映射构建器）。 */
export function needsEditor(op: OpDef): boolean {
  return !!op.editor
}

/** pending 提示条文案：下一个要选的是哪一位。 */
export function pendingHint(op: OpDef, pickedCount: number): string {
  const p = op.params[pickedCount]
  if (!p) return '选择参数'
  return `选择「${p.name}」（${PARAM_LABEL[p.type]}）· 第 ${pickedCount + 1} / ${objectArity(op)} 个对象`
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
