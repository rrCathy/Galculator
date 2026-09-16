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
 * idle ──click(node)──→ selected ──click(径向)──→ menu
 * menu ──click(一元操作)──→ 执行 ──→ selected(新对象)
 * menu ──click(多元操作)──→ pending(opId,[node])
 * menu ──click(需要标量的一元操作)──→ fill(opId,[node])
 * pending ──click(node)──→ pending(opId, picked+[node]) ──凑够对象参数──→ 执行 或 fill
 * pending / fill ──Esc / 点空白──→ idle
 * ```
 */
export type Interaction =
  | { kind: 'idle' }
  | { kind: 'selected'; target: string }
  | { kind: 'menu'; target: string }
  /** 等对象参数：点画布上的节点往下凑 */
  | { kind: 'pending'; opId: string; picked: string[] }
  /** 等标量参数：顶部补参条，回车执行 */
  | { kind: 'fill'; opId: string; picked: string[]; scalars: (string | null)[] }

export const IDLE: Interaction = { kind: 'idle' }

/** 竖卡要展示哪个对象（pending 时停在**第一个**参数——它是"源"）。 */
export function focusId(inter: Interaction): string | null {
  switch (inter.kind) {
    case 'selected':
    case 'menu':
      return inter.target
    case 'pending':
    case 'fill':
      return inter.picked[0] ?? null
    default:
      return null
  }
}

/** 需要高亮的节点（pending/fill 时已点过的那些）。 */
export function pickedIds(inter: Interaction): string[] {
  return inter.kind === 'pending' || inter.kind === 'fill' ? inter.picked : []
}

/** 正在进行的操作 id（提示条要显示它的记法）。 */
export function activeOpId(inter: Interaction): string | null {
  return inter.kind === 'pending' || inter.kind === 'fill' ? inter.opId : null
}

/**
 * 径向菜单的「算 / 造」二分（交互模型 §4.3）。
 *
 * 两者的判定口径**不一样**，这是容易搞错的地方：
 *   - **算**：`opsFor([v])` 里那些"只需这一个对象"的操作——选中即能算完；
 *   - **造**：**不能**用 `opsFor` 筛。`opsFor` 的语义是"选中的值能把参数填满"，
 *     所以单选一个对象时 `G × H` 这类多元操作**根本不在结果里**，拿它分类必然为空。
 *     造类要找的是"以该对象为**第一个参数**、但还要再选"的操作，故直接遍历注册表。
 *
 * 「看」不在这里——它只往竖卡填内容，不产生对象，所以不是注册表里的操作。
 */
export function splitForNode(value: GalValue): { compute: OpDef[]; build: OpDef[] } {
  const compute = opsFor([value]).filter((op) => objectArity(op) <= 1)
  const build = OPS.filter(
    (op) => objectArity(op) > 1 && paramAccepts(op.params[0].type, value, []),
  )
  return { compute, build }
}

export const PARAM_LABEL: Record<ParamType, string> = {
  group: '群',
  subset: '集合 / 子群',
  action: '作用',
  map: '映射',
  element: '元素记号',
  prime: '素数',
  int: '整数',
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
