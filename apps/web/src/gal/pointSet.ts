/**
 * 点集（U53）——「任意阶集合」的构造器。
 *
 * ── 为什么要有它（2026-10-02，用户原话）────────────────────────────────
 * 「逗我吗，连任意阶集合都创建不了，怎么创建自定义群作用？」
 *
 * 实测（`.tmp-u53/probe2.ts`，语义层真跑）：`{1,2,3}` / `集合(1,2,3)` / `点集(5)`
 * **全都不通**，而唯一能造出 `set` 的 `底集(S)` 要求 `S` **已经存在**
 * （子群集 / 元素集 / 群）—— 也就是说集合的点**必须从某个已存在的群里借**。
 * 后果就是 U52 那个「自定义作用」的 Ω 只能是内核硬造的 `{1..n}`，
 * 而"让 G 作用在**你自己的**集合上"根本表达不出来：
 * `自定义作用(S_4, 底集(Syl(S_4, 3)), s12 -> (12))` 报「作用点集的基数 n 必须是正整数」。
 *
 * 这个模块补两件事：
 *   ① **凭空造点集**：`点集(5)` → 5 个抽象点（点号 `1..5`）；`集合(a, b, c)` → 标号由你定；
 *   ② **点记号解析**：循环记号里的**非数字**记号 → Ω 的位置下标。
 *      （数字段一律不碰 —— `(12)` 是 core 自己的语法，见 `labelCycleToNumeric` 的注释）
 *
 * ## 点集没有母群
 * `GalSet.group` 从此可以是 `null` —— 一批抽象点不属于任何群。
 * 见 `value.ts` 的 `GalSet.group` 注释：这一点**不许**用"母群 = `C_1`"糊过去。
 *
 * ## 为什么是两个 op 而不是一个
 * `集合(5)` 到底指"5 个点"还是"一个叫 5 的点"？两种读法都通 —— 那就**不许猜**。
 * `点集(n)` 只管点数，`集合(...)` 只管标号，而**单给一个整数**那一支一律报错并指路
 * （见 `planLabeledPointSet`）。这条与 U25「恒等必须写 `e`、留空不算」同源：
 * 静默默认会让用户看不出自己表达错了。
 */
import type { GalSet } from './value'

/**
 * 点集的点数上限（`点集(n)` 与作用编辑器里那个 `n` **共用一个数**）。
 *
 * 不是"算不动"（置换表对 n 几乎免费），而是**手写记号**的边界：
 * 循环记号里点号一个个敲，400 个点已经没人真去敲了，超线大概率是数字打错。
 */
export const POINT_SET_MAX = 400

/** 点标号必须**能直接写进循环记号**：不许含空白 / 圆括号 / 逗号（那三个是记号自己的语法）。 */
const INLINE_LABEL = /^[^\s(),]+$/

/** 这个标号能不能直接写进循环记号（`(a b c)`）。 */
export function labelWritable(l: string): boolean {
  return INLINE_LABEL.test(l)
}

export interface PointSetOk {
  ok: true
  set: GalSet
  labels: string[]
}

export interface PointSetBlocked {
  ok: false
  error: string
  hint?: string
}

export type PointSetPlan = PointSetOk | PointSetBlocked

/** 点集值的唯一构造点：`group: null`（这批点不属于任何群）。 */
function make(labels: string[], label: string): GalSet {
  return { group: null, label, members: labels.map((l) => ({ label: l })) }
}

/** 造 `n` 个抽象点，点号 `1..n`。 */
export function planCountPointSet(n: number, label?: string): PointSetPlan {
  /*
   * 一个数不是正整数时**只说这一句**（拖到末尾是因为要覆盖 0 / 负数 / 小数三种）。
   * 措辞里有「必须是正整数」这五个字是**契约**：`verify/suites/u52.ts` 按它断言
   * （U53 之前这句住在 `planCustomAction` 里，搬家时逐字保住）。
   */
  if (!Number.isInteger(n) || n < 1) {
    return {
      ok: false,
      error: `点数必须是正整数，收到 ${Number.isFinite(n) ? n : '一个不是数字的东西'}`,
      hint: `如 点集(5)：5 个抽象点，点号 1 到 5；标号自己定写 集合(a, b, c)`,
    }
  }
  if (n > POINT_SET_MAX) {
    return {
      ok: false,
      error: `点数 ${n} 超过上限 ${POINT_SET_MAX}`,
      hint: `点号要一个个敲，点多了多半是数字写错了`,
    }
  }
  const labels = Array.from({ length: n }, (_, i) => String(i + 1))
  return { ok: true, set: make(labels, label ?? `点集(${n})`), labels }
}

/**
 * 造一个点集，**标号就是你写的那串记号**（`集合(a, b, c)`）。
 *
 * 首关挡"只给一个纯整数"那一支：`集合(5)` 读不出你要 5 个点还是要一个叫 `5` 的点，
 * 所以直接报错指路 `点集(5)` —— 见模块头的"为什么是两个 op"。
 */
export function planLabeledPointSet(rawLabels: string[], label?: string): PointSetPlan {
  const labels = rawLabels.map((s) => s.trim()).filter((s) => s !== '')
  if (labels.length === 0) {
    return {
      ok: false,
      error: '集合() 至少要给一个点',
      hint: `如 集合(a, b, c)；只要点数就这样写 点集(5)`,
    }
  }
  if (labels.length === 1 && /^[0-9]+$/.test(labels[0])) {
    return {
      ok: false,
      error: `集合(${labels[0]}) 读不出来：是要 ${labels[0]} 个点，还是要一个叫 ${labels[0]} 的点`,
      hint: `要 ${labels[0]} 个点写 点集(${labels[0]})；要给一个点起名就换个不带歧义的标号，如 集合(a)`,
    }
  }
  if (labels.length > POINT_SET_MAX) {
    return { ok: false, error: `点数 ${labels.length} 超过上限 ${POINT_SET_MAX}`, hint: `如 集合(a, b, c)` }
  }
  const seen = new Set<string>()
  for (const l of labels) {
    if (seen.has(l)) {
      return { ok: false, error: `点标号「${l}」出现了两次`, hint: '一个集合里的点标号必须互不相同' }
    }
    seen.add(l)
  }
  const bad = labels.find((l) => !labelWritable(l))
  if (bad) {
    return {
      ok: false,
      error: `点标号「${bad}」写不进循环记号`,
      hint: '标号里不能有空格 / 圆括号 / 逗号（那三个是循环记号自己的语法）；如 集合(a, b, c)',
    }
  }
  return { ok: true, set: make(labels, label ?? `集合(${labels.join(', ')})`), labels }
}

/**
 * 循环记号里的一个**非数字记号** → Ω 的下标（0 起）；认不出来回 `null`。
 *
 * ⚠️ **只按标签读**。纯数字串走不到这里 —— 那是 core 自己的语法
 * （`(12)` 是"1 和 2 两个点"，`(1 2)` 也是），见 `labelCycleToNumeric`。
 *
 * 为什么不让数字也能命中标签：`(12)(34)` 这种**紧凑写法**是 core 的主力形态
 * （U52 的回归套件里满屏都是），把它切成"记号 `12`"再拿去查表，会把
 * "点 1 和点 2"读成"叫 12 的那个点"——**实测踩过**，46 条断言当场红。
 * 数字一律归 core 读，标号只负责"数字之外的记号"。
 */
export function resolvePointToken(labels: readonly string[], token: string): number | null {
  const byLabel = labels.indexOf(token)
  return byLabel >= 0 ? byLabel : null
}

export interface CycleRewriteOk {
  ok: true
  /** core 的 `parseCycleNotation` 认的数字形态（点号 1 起） */
  numeric: string
}

export interface CycleRewriteBlocked {
  ok: false
  /** 认不出来的那个记号（给编辑器标红 / 报错指名用） */
  token: string
}

/**
 * 带标号的循环记号 → core 认的**数字形态**。
 *
 * 逐段扫，只做**一件事**：
 *   · **纯数字的一段原样留着**（core 的语法：`(12)` = 点 1 与点 2，紧凑写法不许拆）
 *   · **非数字的一段**当成 Ω 的标号，换成它的位置号（1 起）
 *
 * 括号与空白一律原样 —— 语法仍然由 core 的 `parseCycleNotation` 负责，
 * **不另写一份循环记号解析器**（U52 立的纪律：core 备好的零件别抄第二份）。
 *
 * ```
 * (a b c)      -> (1 2 3)     标号命中
 * (12)(34)     -> (12)(34)    原样（数字归 core）
 * (1 2 3 4)    -> (1 2 3 4)   原样
 * (红 绿)       -> (1 2)       标号命中
 * (12 x)       -> 报错：x 不是点集里的点
 * ```
 */
export function labelCycleToNumeric(labels: readonly string[], cycle: string): CycleRewriteOk | CycleRewriteBlocked {
  let out = ''
  let i = 0
  while (i < cycle.length) {
    const c = cycle[i]
    // 分隔符：空白 / 圆括号 / 逗号（core 的解析器都认）
    if (c === ' ' || c === '\t' || c === '(' || c === ')' || c === ',') {
      out += c
      i++
      continue
    }
    let j = i
    while (j < cycle.length && !/[\s(),]/.test(cycle[j])) j++
    const token = cycle.slice(i, j)
    if (/^[0-9]+$/.test(token)) {
      out += token // 数字段归 core 读（紧凑写法 `(12)` 靠这条活着）
    } else {
      const idx = resolvePointToken(labels, token)
      if (idx === null) return { ok: false, token }
      out += String(idx + 1)
    }
    i = j
  }
  return { ok: true, numeric: out }
}

/** 点标号的一行提示（报错与编辑器状态行共用，措辞只有一份）。 */
export function labelsHint(labels: readonly string[], max = 12): string {
  if (labels.length === 0) return '这个点集是空的'
  const head = labels.slice(0, max).map((l, i) => `${i + 1} ${l}`)
  const more = labels.length > max ? ` ...共 ${labels.length} 个` : ''
  return `点集有 ${labels.length} 个点：${head.join('，')}${more}`
}
