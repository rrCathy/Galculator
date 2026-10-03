import { OPS } from './ops'
import { scanNotAscii, subscript } from './pretty'

/**
 * 自动命名与"名字体检"（交互模型 §3.2）。
 *
 * 输入框拆成两块后，名字栏可以留空——于是**系统必须替用户起名**。
 * 起名有一条硬约束：**自动名不能撞上注册表的调用名**，否则
 * `Z = …` 会把 `Z(G)` 这个操作名遮掉（`evalExpr` 第一步就是查对象表，
 * 撞上就再也调不到那个操作了）。这类遮蔽是**静默**的，用户只会觉得
 * "Z(G) 突然不好使了"，所以名单必须由注册表自己出，不能手写。
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** 注册表的全部调用名（小写）。自动命名与体检都避让它们。 */
export const RESERVED_CALL_NAMES: string[] = [
  ...new Set(OPS.flatMap((o) => o.call ?? []).map((s) => s.toLowerCase())),
].sort()

/**
 * 惯用单字母保留：`e`（单位元）· `p`（素数）· `g` / `h`（群名）。
 * 这些是**元素记号/习惯写法**，占了它们会让 `ord(G, e)` 里的 `e` 被当成对象引用。
 */
export const RESERVED_LETTERS = ['e', 'p', 'g', 'h']

const RESERVED = new Set<string>([...RESERVED_CALL_NAMES, ...RESERVED_LETTERS])

/** 名字是否被注册表 / 惯例占用。**大小写不敏感**——`E` 一样会遮住 `e`。 */
export function isReservedName(name: string): boolean {
  return RESERVED.has(name.trim().toLowerCase())
}

/**
 * 名字允许：拉丁字母 / 数字 / 下划线 / 中文 / **LaTeX 命令**（`\varphi`、`\Omega`）。
 *
 * ⚠️ 2026-09-27 起**不再允许直接写希腊字母字符**（φ、Ω）——它们键盘打不出来，
 * 而本轮的约定是"系统里出现的每个字符都必须是键盘打得出的"。要叫 φ 就写 `\varphi`：
 * 它全是 ASCII，显示时由 KaTeX 渲染成 φ，复制出去还是 `\varphi`。
 *
 * 反斜杠**不会**与集合差的中缀冲突：中缀要求"两侧都不是标识符字符"，
 * 而命令名里 `\` 后面必定紧跟字母（`findTopLevelInfix` 那侧天然避开）。
 */
const NAME_RE = /^[A-Za-z0-9_\\\u4e00-\u9fff]+$/

/**
 * 名字归一 —— **只去掉首尾空白**。
 *
 * 这曾经是个真漏洞的现场（U23，2026-09-26）：那时会把 `\phi` 与 `φ` 归一成
 * 同一个字符，而**只归一了一半**（建对象那侧归一、引用那侧没有），于是
 * "当名字用行、当引用用不行"。2026-09-27 用户把约定改成"文本形态一律 ASCII"
 * 之后，归一这件事**整条不需要了**：`\varphi` 就是它本身的形态，
 * 没有第二套写法要去对齐 —— 那一整类 bug 随之消失。
 */
export function normalizeName(raw: string): string {
  return raw.trim()
}

/** 是否像一个名字（用于"整行粘贴"的拆分判断）。 */
export function isNameLike(s: string): boolean {
  return NAME_RE.test(s.trim())
}

export interface NameCheck {
  ok: boolean
  /** 阻塞提交的问题 */
  error?: string
  /** 不阻塞的提醒（如命中操作名） */
  warn?: string
  /** 出错时给出的写法提示（如希腊字母的 LaTeX 写法） */
  hint?: string
}

/**
 * 校验用户手写的名字。空串表示"交给自动命名"，一律算 ok。
 *
 * 命中保留名**只提醒不拦截**——`Z = Z(G)` 是用户明确表达，系统不该管；
 * 但得让他知道自动命名会跳过这个名字。
 */
export function checkName(raw: string, used: Iterable<string>): NameCheck {
  const name = normalizeName(raw)
  if (!name) return { ok: true }
  // 「键盘打不出来的字符」先拦，并给出**可照抄的改法**（与表达式那侧同一套判据）
  const bad = scanNotAscii(name)
  if (bad) {
    const what =
      bad.kind === 'subscript' ? '下标字符'
      : bad.kind === 'superscript' ? '上标字符'
      : bad.kind === 'greek' ? '希腊字母'
      : '数学符号'
    return { ok: false, error: `${what}「${bad.char}」键盘打不出来`, hint: `改用：${bad.suggestion}` }
  }
  if (!NAME_RE.test(name)) {
    return {
      ok: false,
      error: '名字只能用字母 / 数字 / 下划线 / 中文，或 LaTeX 命令（如 \\varphi）',
      hint: '要显示成希腊字母 phi 就写 \\varphi（敲进去的全是 ASCII，显示时渲染成 phi 的字形）',
    }
  }
  const lower = name.toLowerCase()
  for (const u of used) {
    if (u.toLowerCase() === lower) {
      return { ok: false, error: `名字「${name}」已被占用` }
    }
  }
  if (isReservedName(name)) {
    return { ok: true, warn: `「${name}」也是操作名 ---- 手写没问题，但自动命名会跳过它` }
  }
  return { ok: true }
}

/**
 * 下一个自动名：`A, B, …, Z, A₁, B₁, …`（跳过已用名与保留名）。
 *
 * 跳号是必然的（`C` 被 `C(n,k)` 占、`E`/`G`/`H`/`P`/`Z` 被惯例或操作名占），
 * 这没问题——**能用的最短名字**比"字母表顺序"重要。
 */
export function nextAutoName(used: Iterable<string>): string {
  const taken = new Set<string>()
  for (const u of used) taken.add(u.trim().toLowerCase())
  for (let round = 0; round < 100; round++) {
    for (const L of LETTERS) {
      const name = round === 0 ? L : `${L}${subscript(String(round))}`
      const lower = name.toLowerCase()
      if (taken.has(lower) || RESERVED.has(lower)) continue
      return name
    }
  }
  return `A${subscript('101')}` // 兜底：2600 个候选都用完（实际到不了）
}

/**
 * 改名时**同步改写别的定义行里对它的引用**（缺口 ⑱）。
 *
 * 为什么必须有这一步：定义行之间是**按名字**引用的（`J = A / K`）。
 * 只改左边那半，右边那些引用会立刻变成"算不出来"——用户看到一堆红行，
 * 还得自己去一行行找。改名的语义是"A 从今天起叫 S_4"，那就该全局生效。
 *
 * 判据是**独立标识符**：两侧都不能是 `[A-Za-z0-9_\\]`。
 *   · `\Alpha` 不动（前面是反斜杠 ⇒ 那是个命令名，不是引用）
 *   · `AB` / `A_1` 不动（那是**另外的名字**，标识符字符连着）
 *   · `A/K`、`contains(A, G)` 里的 `A` 会被改
 *
 * 返回改动过的行下标（面板上可以说清"连带改了几行"——静默改写才是坏文明）。
 */
export function renameRefs(
  lines: string[],
  skipIndex: number,
  oldName: string,
  newName: string,
): { lines: string[]; touched: number[] } {
  const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?<![A-Za-z0-9_\\\\])${esc}(?![A-Za-z0-9_\\\\])`, 'g')
  const touched: number[] = []
  const out = lines.map((raw, i) => {
    if (i === skipIndex) return raw
    const eq = raw.indexOf('=')
    if (eq < 0) return raw
    const rhs = raw.slice(eq + 1)
    if (!re.test(rhs)) return raw
    re.lastIndex = 0
    touched.push(i)
    return `${raw.slice(0, eq + 1)}${rhs.replace(re, newName)}`
  })
  return { lines: out, touched }
}

/** 自动命名的候选序列（展示用，例如设置里的说明文案）。 */
export function autoNamePreview(used: Iterable<string>, count = 5): string[] {
  const out: string[] = []
  const taken = new Set([...used].map((u) => u.toLowerCase()))
  for (let round = 0; out.length < count && round < 100; round++) {
    for (const L of LETTERS) {
      if (out.length >= count) break
      const name = round === 0 ? L : `${L}${subscript(String(round))}`
      const lower = name.toLowerCase()
      if (taken.has(lower) || RESERVED.has(lower)) continue
      taken.add(lower)
      out.push(name)
    }
  }
  return out
}
