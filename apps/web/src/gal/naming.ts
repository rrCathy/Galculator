import { OPS } from './ops'
import { subscript } from './pretty'

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

/** 合法名字：拉丁字母 / 数字 / 下划线 / 中文。 */
/**
 * 名字允许：拉丁字母 / 数字 / 下划线 / 中文 / **希腊字母**。
 * 希腊字母是刻意的——数学里映射习惯叫 φ、ψ，群同态写成 `φ : G → H`
 * 比 `f` 更"像交换图"（用户提的）。
 */
const NAME_RE = /^[A-Za-z0-9_\u4e00-\u9fff\u0370-\u03ff\u1f00-\u1fff]+$/

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
}

/**
 * 校验用户手写的名字。空串表示"交给自动命名"，一律算 ok。
 *
 * 命中保留名**只提醒不拦截**——`Z = Z(G)` 是用户明确表达，系统不该管；
 * 但得让他知道自动命名会跳过这个名字。
 */
export function checkName(raw: string, used: Iterable<string>): NameCheck {
  const name = raw.trim()
  if (!name) return { ok: true }
  if (!NAME_RE.test(name)) {
    return { ok: false, error: '名字只能用字母（含希腊字母）/ 数字 / 下划线 / 中文' }
  }
  const lower = name.toLowerCase()
  for (const u of used) {
    if (u.toLowerCase() === lower) {
      return { ok: false, error: `名字「${name}」已被占用` }
    }
  }
  if (isReservedName(name)) {
    return { ok: true, warn: `「${name}」也是操作名 —— 手写没问题，但自动命名会跳过它` }
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
