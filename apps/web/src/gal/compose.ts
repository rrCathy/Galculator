import { isScalarParam, type OpDef } from './ops'

/**
 * 从「注册表操作 + 实参」组装出一行可求值的表达式（U2）。
 *
 * 径向菜单点一下就该长出对象——但执行层只认**定义行**（`名字 = 表达式`），
 * 所以这里把「点选出来的实参」编回文本。走文本而不是直接调 `op.run`，
 * 有两个好处：
 *   1. 用户看得见系统替他写了什么（点出来的操作会变成左栏里的一行，可读可改）；
 *   2. 求值只有一条路径（`evalExpr`），不会出现"点出来的和打出来的行为不一致"。
 */

/** 能当函数头的调用名——排除 `⟨⟩` 这类只有记号意义的别名。 */
const FUNCTION_HEAD = /^[A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*$/

/** 该操作的函数式调用名（挑第一个合法的）。 */
export function callHead(op: OpDef): string | null {
  return (op.call ?? []).find((n) => FUNCTION_HEAD.test(n)) ?? null
}

/** 需要几个"画布上点得出来"的参数（非标量、非可选）。决定「算」还是「造」。 */
export function objectArity(op: OpDef): number {
  return op.params.filter((p) => !isScalarParam(p.type) && !p.optional).length
}

/**
 * 必需参数里"只能靠文本补"的位置（标量）。
 *
 * 注册表有断言保证标量参数只出现在末尾、且必需参数都在 `arity` 之内，
 * 所以这里用 `i < op.arity` 判定"必需"。
 */
export function scalarSlots(op: OpDef): number[] {
  return op.params
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => isScalarParam(p.type) && !p.optional && i < op.arity)
    .map(({ i }) => i)
}

/** 标量参数的默认值（补参条上的初值，省一次输入）。 */
export function scalarDefault(op: OpDef, index: number): string {
  return op.params[index]?.type === 'prime' ? '2' : '1'
}

/**
 * 组装表达式。参数不足或留空返回 `null`（调用方据此继续等在补参态）。
 *
 * 二元且声明了中缀的操作走中缀（`A ∩ B`、`G / N`），其余走函数式（`Z(G)`）。
 */
export function composeCall(op: OpDef, args: (string | null)[]): string | null {
  const vals = args.map((s) => (s ?? '').trim())
  if (vals.length < op.arity) return null
  if (vals.slice(0, op.arity).some((v) => !v)) return null

  if (op.infix?.length && vals.length === 2) {
    return `${vals[0]} ${op.infix[0]} ${vals[1]}`
  }
  const head = callHead(op)
  if (!head) return null
  return `${head}(${vals.join(', ')})`
}

/** 组装结果的可读展示（菜单/提示条上用，和表达式一致）。 */
export function previewCall(op: OpDef, args: (string | null)[]): string {
  return composeCall(op, args) ?? `${op.notation}`
}

/**
 * 编辑器产出的映射定义行（U3）：
 *
 *   `映射(G, H, r2→e, s→s)`
 *
 * 生成元的像连**顺序都是确定的**（按源群生成元表的次序），所以同一组像
 * 永远编出同一行——App 的去重逻辑因此照常管用（不会攒出一堆等价行）。
 */
export function composeMapLine(
  op: OpDef,
  refs: string[],
  pairs: { gen: string; img: string }[],
): string {
  const head = callHead(op) ?? '映射'
  const args = [...refs, ...pairs.map((p) => `${p.gen}→${p.img}`)]
  return `${head}(${args.join(', ')})`
}
