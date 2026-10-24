/**
 * U9 回归线（2026-10-23）：**元素谓词求值器** —— `{x in A_4 : x^2 = e}` 里冒号右边那半。
 *
 * ## 这一层为什么需要单独一套
 *
 * 谓词是**一门新语言**（`gal/predicate.ts`），它不属于 `evalDef` 那套定义行语法 ——
 * 主求值器里 `^` 已经有三个意思（群记号的阶 `C_2^4` / 元素标号的幂 `r^4` / 现在这个
 * 元素幂），把三个塞进一个解析器是最容易出乱子的做法。既然独立，就得有独立的账。
 *
 * ## 期望值从哪来（**不许从运行结果抄**）
 *
 * 全部是"手算 + 真跑对拍"两遍都过的数字。手算过程写在这里，真跑脚本是
 * `.tmp-u8u9/probe.ts`（core 直算）与 `.tmp-u8u9/probe5.ts`（走本模块）。
 *
 * | 群 | 阶 | `x^2 = e` | `ord(x) = 2` | 手算依据 |
 * |---|---|---|---|---|
 * | `A_4` | 12 | **4** | 3 | `e` + 3 个双换位 `(12)(34)` 类；8 个 3-循环不合 |
 * | `S_3` | 6 | **4** | 3 | `e` + 3 个对换 |
 * | `S_4` | 24 | 10 | 9 | 9 个 2 阶元素（6 对换 + 3 双换位）+ `e` |
 * | `D_8` | **16** | 10 | 9 | ⚠️ core 的 `D_8` 是 16 阶（n 边形对称群 = 2n 阶）；`r^4` 是 8 阶元的平方 |
 * | `V_4` | 4 | 4 | 3 | 初等交换 ⇒ 每个元素平方皆 `e` |
 * | `C_6` | 6 | **2** | 1 | 加法群：`2x ≡ 0` 得 `x = 0, 3` |
 *
 * **`x^2 = e` 与 `ord(x) = 2` 差一个单位元** —— 这是本套最锋利的一条判据：
 * 差一位就说明实现把 `ord` 与"平方是单位元"混了。
 *
 * ## 本套守的判据
 *   ① 锚点数字（上表）；
 *   ② 语法形态：`^` 幂、并列即乘、`and`/`or` 优先级、括号、`!=`、空集不报错；
 *   ③ 元素记号：精确 label（`V_4` 的 `a`、`Q_8` 的 `i`）、纯数字标号（`S_3` 的 `12`）、
 *      生成元的幂（`r2`）；
 *   ④ 关键词裁定：单字母只在**精确命中**时放行；`ord` 一参 vs 主求值器两参不打架；
 *      `e` 是单位元；`1` 不当单位元（幂次专用）；
 *   ⑤ 报错全部**定向**（缺判断 / 混比元素与数字 / 非 ASCII / 括号不配对 / 多变量 …）；
 *   ⑥ 变量名不许占保留字与 `e`。
 */
import { resolveElement, type Group } from '@groupviz/core'
import { build, eq, ok, suite } from '../harness'
import { resolveElementLoose } from '../../src/gal/ops'
import { compilePredicate, filterElements, type ElementResolver } from '../../src/gal/predicate'

/** 造一个群对象。`build` 走的是与用户敲定义行完全相同的那条路。 */
function groupOf(sym: string): Group | null {
  const h = build([`G = ${sym}`])
  const o = h.byId('G')
  return o && o.value.type === 'group' ? o.value.group : null
}

/**
 * 与生产代码**同一份**判据：先精确（core `resolveElement`），再宽松回退。
 *
 * 这两级必须分得清 —— 见 `predicate.ts#ElementResolver` 的表格：
 * `V_4` 的 `a` 是精确命中（放行），`C_6` 的 `y` 只是生成元回退（拦下）。
 */
function resolver(g: Group): ElementResolver {
  return (t) => {
    const exact = resolveElement(g, t)
    if (exact) return { el: exact, exact: true }
    const loose = resolveElementLoose(g, t)
    return loose ? { el: loose, exact: false } : null
  }
}

interface Kept {
  n: number
  labels: string[]
  error: string
}

function kept(sym: string, cond: string, v = 'x'): Kept {
  const g = groupOf(sym)
  if (!g) return { n: -1, labels: [], error: `${sym} 建不出来` }
  const r = filterElements(g, g.elements, v, cond, resolver(g))
  if (!r.ok) return { n: -1, labels: [], error: r.error }
  return { n: r.kept.length, labels: r.kept.map((e) => e.label), error: '' }
}

const n = (sym: string, cond: string): number => kept(sym, cond).n
const err = (sym: string, cond: string): string => kept(sym, cond).error

export function run(): void {
  suite('U9 谓词：筛选条件的语言')

  /* ── ① 锚点（手算 + 真跑双确认）──────────────────────── */
  eq('A_4 里 x^2=e 有 4 个（e + 3 个双换位）', n('A_4', 'x^2 = e'), 4)
  eq('A_4 里 ord(x)=2 只有 3 个（不含 e）', n('A_4', 'ord(x) = 2'), 3)
  eq('A_4 里 ord(x)=1 只有单位元', n('A_4', 'ord(x) = 1'), 1)
  eq('S_3 里 x^2=e 有 4 个（e + 3 个对换）', n('S_3', 'x^2 = e'), 4)
  eq('S_4 里 x^2=e 有 10 个', n('S_4', 'x^2 = e'), 10)
  eq('D_8（16 阶）里 ord(x)=2 有 9 个', n('D_8', 'ord(x) = 2'), 9)
  eq('C_6 里 x^2=e 有 2 个（0 与 3）', n('C_6', 'x^2 = e'), 2)
  eq('V_4 里 x^2=e 全员通过（初等交换）', n('V_4', 'x^2 = e'), 4)

  /* ── ② 语法形态 ──────────────────────────────────────── */
  eq('x^3=e 在 S_3 上是 3 个（e 与两个 3-循环）', n('S_3', 'x^3 = e'), 3)
  eq('x^-1 = x 与 x^2 = e 同解（阶 <= 2）', n('S_3', 'x^-1 = x'), 4)
  eq('x^0 = e 全员通过（0 次幂是单位元）', n('S_3', 'x^0 = e'), 6)
  eq('括号只是分组，不改结果', n('S_3', '(x)^2 = e'), 4)
  eq('并列即乘：x x = e 同 x^2 = e', n('S_3', 'x x = e'), 4)
  eq('星号乘法与并列等价', n('S_3', 'x*x = e'), 4)
  eq('and 收窄：x^2=e 且 x!=e 得 3 个', n('S_3', 'x^2 = e and x != e'), 3)
  eq('or 放宽：x=e 或 ord=2 得 4 个', n('S_3', 'x = e or ord(x) = 2'), 4)
  eq('and 优先级高于 or', n('S_3', 'x = e or x != e and ord(x) = 3'), 3)
  eq('筛出空集不报错（ord(x)=5 在 S_3 上）', n('S_3', 'ord(x) = 5'), 0)
  ok('空集时 kept 是空数组而不是错误', kept('S_3', 'ord(x) = 5').error === '')

  /* ── ③ 元素记号 ──────────────────────────────────────── */
  eq('V_4 的单字母元素 a 精确命中，放行', n('V_4', 'x = a'), 1)
  eq('Q_8 的单字母元素 i 精确命中，放行', n('Q_8', 'x = i'), 1)
  eq('S_3 的纯数字标号 12 当作元素', n('S_3', 'x = 12'), 1)
  eq('C_6 的纯数字标号 3 当作元素', n('C_6', 'x = 3'), 1)
  eq('C_6 里 x^2=2 有 2 个（x=1 与 x=4）', n('C_6', 'x^2 = 2'), 2)
  eq('单位元 e 到处认', n('A_4', 'x = e'), 1)

  /* ── ④ 关键词裁定 ────────────────────────────────────── */
  ok(
    'C_6 的 y 被拦（它只是生成元回退，不是这个群的元素）',
    err('C_6', 'y^2 = e').includes('不是变量'),
    err('C_6', 'y^2 = e'),
  )
  ok(
    '单变量限制说清了（x*y=y*x 那条）',
    err('V_4', 'x*y = y*x').includes('不是变量'),
    err('V_4', 'x*y = y*x'),
  )
  ok('ord 在谓词里是一参（ord(x)）', n('S_3', 'ord(x) = 2') === 3)
  const rv = compilePredicate('x^2 = e', 'e')
  ok('变量名不许叫 e（会与单位元撞）', !rv.ok, rv.ok ? '竟然 OK' : rv.error)
  const rk = compilePredicate('x^2 = e', 'ord')
  ok('变量名不许用保留字 ord', !rk.ok, rk.ok ? '竟然 OK' : rk.error)
  const rbad = compilePredicate('x^2 = e', '1x')
  ok('变量名必须是字母开头', !rbad.ok, rbad.ok ? '竟然 OK' : rbad.error)

  /* ── ⑤ 报错全部定向 ──────────────────────────────────── */
  ok('裸表达式缺判断：x^2', err('S_3', 'x^2').includes('没有给出判断'), err('S_3', 'x^2'))
  ok('元素与数字混比：x = 2 在 S_3 上是"没有这个元素"', err('S_3', 'x = 2').includes('没有元素'), err('S_3', 'x = 2'))
  ok('大小比较不支持', err('S_3', 'ord(x) < 2').includes('没有大小比较'), err('S_3', 'ord(x) < 2'))
  ok('幂次必须是整数', err('S_3', 'x^y = e').includes('幂次必须是一个整数'), err('S_3', 'x^y = e'))
  ok('中文不进谓词', err('S_3', '阶(x) = 2').includes('只能用 ASCII'), err('S_3', '阶(x) = 2'))
  ok('括号不配对', err('S_3', '(x^2 = e').includes('括号'), err('S_3', '(x^2 = e'))
  ok('逗号不是连接词', err('S_3', 'x^2 = e, x != e').includes('不认识字符'), err('S_3', 'x^2 = e, x != e'))
  ok('不等式写 != 而不是 ≠', err('S_3', 'x ≠ e').includes('!='), err('S_3', 'x ≠ e'))
  ok('ord 不能当元素用', err('S_3', 'ord(x) = ord(ord(x))').length > 0)
  ok('空谓词有话说', err('S_3', '   ').includes('条件为空'), err('S_3', '   '))

  /* ── ⑥ 结果可用于后续计算（与 elements 档一致）──────── */
  const g3 = groupOf('S_3')
  if (g3) {
    const r = filterElements(g3, g3.elements, 'x', 'x^2 = e and x != e', resolver(g3))
    ok('筛出来的元素仍带母群的 id（能继续当参数）', r.ok && r.kept.every((e) => g3.elements.some((x) => x.id === e.id)))
    ok('筛出来的是元素对象本身，不是副本', r.ok && r.kept.every((e) => typeof e.id === 'string' && e.label.length > 0))
  } else {
    ok('S_3 建不出来（不该发生）', false)
  }

  /* ── ⑦ 端到端：走完整定义行（语法糖 + op 注册表）──────── */
  /**
   * 上面 ⑥ 测的是求值器本身，这里测**用户真敲的那一整行** ——
   * 从 `normalizeBraces` 的糖、到 op 分发、到结果落行，一条不漏。
   */
  const line = (pre: string[], probe: string) => build([...pre, probe]).line(probe.split('=')[0].trim())
  const objOf = (pre: string[], probe: string) => {
    const h = build([...pre, probe])
    return h.byId(probe.split('=')[0].trim())
  }
  const elemsOf = (pre: string[], probe: string): number => {
    const o = objOf(pre, probe)
    return o?.value.type === 'elements' ? o.value.elements.length : -1
  }

  ok(
    '`{x in A_4 : x^2 = e}` 整行能敲（糖 → filter）',
    line([], 'X = {x in A_4 : x^2 = e}')?.ok === true,
    String(line([], 'X = {x in A_4 : x^2 = e}')?.error ?? ''),
  )
  eq('…筛出 4 个', elemsOf([], 'X = {x in A_4 : x^2 = e}'), 4)
  eq('`filter(A_4, x, ord(x) = 2)` 显式调用同效', elemsOf([], 'X = filter(A_4, x, ord(x) = 2)'), 3)
  eq('S 里含半直积冒号也对（取最后一个顶层冒号）', elemsOf([], 'X = {x in C_2^2:C_3 : x^2 = e}'), 4)
  eq('空集是合法结果，整行照旧 OK', elemsOf([], 'X = {x in A_4 : ord(x) = 6}'), 0)
  ok('`{a, b, c}` 老写法一条不改（仍是 set）', objOf([], 'X = {a, b, c}')?.value.type === 'set')
  ok('筛出来的能直接喂 closure', line(['Y = {x in S_3 : x != e}'], 'X = closure(Y)')?.ok === true)
  ok(
    '变量名对不上要指名（z 与 x）',
    (line([], 'X = {z in S_3 : x^2 = e}')?.error ?? '').includes('不是变量'),
    String(line([], 'X = {z in S_3 : x^2 = e}')?.error ?? ''),
  )
  /* ── ⑧ elementSet（U9-c 的手挑子集）────────────────── */
  const es = (pre: string[], probe: string) => build([...pre, probe]).line(probe.split('=')[0].trim())
  ok('elementSet(S_3, (12), (13)) 能挑出 2 个', es([], 'X = elementSet(S_3, (12), (13))')?.ok === true,
    String(es([], 'X = elementSet(S_3, (12), (13))')?.error ?? ''))
  eq('…正是那两个', elemsOf([], 'X = elementSet(S_3, (12), (13))'), 2)
  eq('同一个元素写两遍只算一个', elemsOf([], 'X = elementSet(S_3, (12), (12))'), 1)
  eq('S_4 的双换位也能挑（(12)(34) 这种标号 labeledSet 收不了）', elemsOf([], 'X = elementSet(S_4, (12)(34))'), 1)
  ok('一个都不挑要报错（不是静默造空集）',
    (es([], 'X = elementSet(S_3)')?.error ?? '').includes('至少要挑一个'),
    String(es([], 'X = elementSet(S_3)')?.error ?? ''))
  ok('挑不存在的元素要点名',
    (es([], 'X = elementSet(S_3, zz)')?.error ?? '').includes('没有元素'),
    String(es([], 'X = elementSet(S_3, zz)')?.error ?? ''))
  ok('挑出来的能喂 closure（它是 elements 不是 set）',
    es(['Y = elementSet(S_3, (12), (13))'], 'X = closure(Y)')?.ok === true)

  ok(
    '超 144 阶报规模问题（不是条件问题）',
    (line([], 'X = {x in S_6 : x^2 = e}')?.error ?? '').includes('超过'),
    String(line([], 'X = {x in S_6 : x^2 = e}')?.error ?? ''),
  )
}
