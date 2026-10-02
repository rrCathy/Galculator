/**
 * 本地构造的**补丁层**：core 挡下、但本地机器明明建得出的那几种记号。
 *
 * ── 为什么要有这一层（2026-10-01，用户原话）──────────────────────
 * 「逗我吗，S6能算，A6不能算？」
 *
 * 这是 core 里的一处**自相矛盾**，不是"算不动"：
 *
 *   · `groupFactory.ts` 的族门写的是 `A_{n}`：`3 <= n <= 6` —— 本意就是支持到 A_6；
 *   · 而 `AlternatingGroup.ts` 的构造器内部 `if (n > 5) throw 'A_{n} for n > 5 is too large'`
 *     ⇒ `A_6` **过了门、死在构造器**，`parseGroupNotation` 于是把它标成 `backend`。
 *
 * 邻居对照最难看：`S_{n}` 的门也是 6，而 `createSymmetricGroup` **没有任何内部上限** ——
 * 于是 720 元的 `S_6` 建得，360 元的 `A_6` 建不得。同类的还有 `D_16`（32 阶被挡，
 * 而 `C_2^5` 32 阶能建）、`GL(2,4)`（180 阶被挡）——**那些不在这一层管**（用户拍板：
 * 先只补 A_n 这一处）。
 *
 * ── 怎么办 ──────────────────────────────────────────────────
 * `A_n` 不需要新写一行置换数学：它就是 `S_n` 的**偶置换子群**，而 core 自带
 * `buildSubgroupGroup(parent, elements, symbol, generators?)` —— 把"父群里的一堆元素"
 * 包成一个群，`multiply`/`inverse` 直接继承父群（元素 id 因此与父群一致）。
 *
 * ── 三条纪律 ────────────────────────────────────────────────
 * ① **只在 core 建不出时才走这里**：`A_3`/`A_4`/`A_5` core 自己建得出，走它自己的。
 *    这里的 `n` 上限跟着 `S_n` 的门（6）——借哪个父群就受哪个父群的限。
 * ② **生成元必须自校验**：`buildSubgroupGroup` **不检查**传进去的生成元是否真能生成
 *    那堆元素，而 `minimalGenerators` 在 360 元上要 **4.2 秒**（实测，太慢）。
 *    所以这里给一对候选 `(1 2 3)` 与 `(2 3 ... n)`，**先算闭包验一遍**（尺寸 + 全偶），
 *    不过就退到"全部 3-循环 `(1 2 i)`"（A_n 由 3-循环生成，这是定理）。
 *    挑错的后果不是崩，是面板上给出"生成元生成不出这个群"的假象 —— 那比报错更难查。
 * ③ **不猜**：拿不到父群、偶置换不是恰好一半、闭包尺寸对不上 —— 一律返回 `null`，
 *    让调用方照原样报"本地建不了"。
 *
 * 实测（`ord=360`）：元素阶分布 `1^1 2^45 3^80 4^90 5^144` —— 与 A_6 的真分布一致
 * （3-循环 40 + 两个不交 3-循环 40 = 80；4-轮换乘对换 90；5-循环 144）。
 */
import {
  buildSubgroupGroup,
  createCyclicGroup,
  createDihedralGroup,
  createSymmetricGroup,
  parseGroupNotation,
  type Group,
  type GroupElement,
} from '@groupviz/core'

import { buildMatrixGroup } from './matrixGroups'

/** 能补的记号。`parseGroupNotation` 的 `canonical` 已归一（`A6`/`A_6`/`A_{ 6 }` 都是 `A_{6}`）。 */
const ALT = /^A_\{(\d+)\}$/
const SYM = /^S_\{(\d+)\}$/
const DIH = /^D_\{(\d+)\}$/
const CYC = /^C_\{(\d+)\}$/

/**
 * 各族补到哪为止 —— **每一条都要说清为什么停在这**（U50 扩族时补的账）。
 *
 * | 族 | 上限 | 实测与理由 |
 * |---|---|---|
 * | `S_n` / `A_n` | `n <= 7` | `S_7` = 5040 个元素（11ms）。`S_8` = 40320（44ms、堆 +13.5MB）**建得出，但元素表四万行必然把页面卡死** —— U47 的教训正是"建得出不等于该建"。 |
 * | `D_n` | `n <= 120` | `D_120` = 240 个元素、0ms。core 的门只到 8（`D_8` = 16 阶）。 |
 * | `C_n` | `n <= 1000` | 纯循环群的乘法是闭式（core 自己的注释就这么说），1000 阶 0ms；core 的门停在 120。 |
 *
 * 借谁的父群受谁的门限：`A_n` 借 `S_n`，所以它跟 `S_n` 共用同一条线。
 */
const ALT_MAX = 7
const SYM_MAX = 7
const DIH_MAX = 120
const CYC_MAX = 1000

/** 借 `S_n` 拿偶置换的上限 —— `createSymmetricGroup` 本身没有内部上限，这条线是上面那张表定的。 */
const SOURCE_MAX = ALT_MAX

/** 逆序数的奇偶 —— 置换的符号。 */
function isEvenPermutation(p: readonly number[]): boolean {
  let inversions = 0
  for (let i = 0; i < p.length; i++) {
    for (let j = i + 1; j < p.length; j++) {
      if (p[i] > p[j]) inversions++
    }
  }
  return inversions % 2 === 0
}

/** 置换数组 → 父群里的元素对象（找不到给 null，不猜）。 */
function permOf(parent: Group, perm: readonly number[]): GroupElement | null {
  return (
    parent.elements.find((e) => e.value.length === perm.length && e.value.every((v, i) => v === perm[i])) ?? null
  )
}

/** `gens` 在 `parent` 里的闭包大小（含单位元）。 */
function closureSize(parent: Group, gens: readonly GroupElement[]): number {
  const seen = new Set([parent.identity.id])
  const stack: GroupElement[] = [parent.identity]
  while (stack.length > 0) {
    const x = stack.pop() as GroupElement
    for (const g of gens) {
      const y = parent.multiply(x, g)
      if (!seen.has(y.id)) {
        seen.add(y.id)
        stack.push(y)
      }
    }
  }
  return seen.size
}

/** 3-循环 `(1 2 i)`：1→2、2→i、i→1，其余不动。 */
function threeCycle(n: number, i: number): number[] {
  const p = Array.from({ length: n }, (_, j) => j + 1)
  p[0] = 2
  p[1] = i
  p[i - 1] = 1
  return p
}

/** `(2 3 ... n)`：1 不动。`n` 偶时是偶置换（`(n-1)`-循环的符号是 `(-1)^(n-2)`）。 */
function cycleOnRange(n: number): number[] {
  const p = Array.from({ length: n }, (_, j) => j + 1)
  for (let k = 1; k < n - 1; k++) p[k] = k + 2
  p[n - 1] = 2
  return p
}

/**
 * 挑生成元：**先验后取**。
 *
 * 判据三条，缺一不给：① 每个生成元都在那堆偶置换里 ② 闭包尺寸正好等于该堆的尺寸
 * ③ 至少一个生成元。
 */
function pickGenerators(sn: Group, even: readonly GroupElement[], n: number): GroupElement[] | null {
  const inEven = new Set(even.map((e) => e.id))
  const usable = (gs: GroupElement[]): boolean =>
    gs.length > 0 && gs.every((g) => inEven.has(g.id)) && closureSize(sn, gs) === even.length

  // 候选一：经典的二元生成元 (1 2 3) 与 (2 3 ... n)
  const a = permOf(sn, threeCycle(n, 3))
  const b = permOf(sn, cycleOnRange(n))
  if (a && b && usable([a, b])) return [a, b]

  // 候选二（定理兜底）：A_n 由 3-循环 (1 2 i)（i = 3..n）生成
  const all: GroupElement[] = []
  for (let i = 3; i <= n; i++) {
    const e = permOf(sn, threeCycle(n, i))
    if (!e) return null
    all.push(e)
  }
  return usable(all) ? all : null
}

/**
 * 用 `canonical` 记号本地补一个群；补不了返回 `null`（调用方照原样报错）。
 *
 * 加新族之前先问一句：**"core 那边是真算不动，还是只是一行人为上限？"**
 *   · 人为上限 → 归这一层：`A_n`（构造器卡在 n ≤ 5，而门写 6）·
 *     `S_n` / `D_n` / `C_n`（构造器**都没有内部上限**，纯粹门写窄了）；
 *   · 真没实现 → 归 `matrixGroups.ts`：`GL` / `SL` / `PGL` / `PSL`。
 */
export function buildLocally(canonical: string): Group | null {
  const key = canonical.replace(/\s+/g, '')
  return (
    buildAlternatingLocally(key) ??
    buildSymmetricLocally(key) ??
    buildDihedralLocally(key) ??
    buildCyclicLocally(key) ??
    buildMatrixGroup(key)
  )
}

/** `A_n`（3 ≤ n ≤ 7）= `S_n` 的**偶置换子群** —— 一行置换数学不用抄。 */
function buildAlternatingLocally(key: string): Group | null {
  const m = ALT.exec(key)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isInteger(n) || n < 3 || n > SOURCE_MAX) return null

  /*
   * 纪律①由**函数自己**守住，不指望调用方记得：core 建得出的（`A_3`/`A_4`/`A_5`）
   * 一律不补 —— 否则同一个记号会出现"两条路各建一个群对象"，而它们只是同构、不是同一个。
   */
  if (parseGroupNotation(`A_{${n}}`).symbol) return null

  const sn = createSymmetricGroup(n)
  if (!sn) return null

  const even = sn.elements.filter((e) => isEvenPermutation(e.value))
  // 偶置换必须恰好一半 —— 对不上说明拿错了父群，宁可不建也不给半个群
  if (even.length * 2 !== sn.order) return null

  const gens = pickGenerators(sn, even, n)
  if (!gens) return null

  return buildSubgroupGroup(sn, even, `A_{${n}}`, gens)
}

/**
 * `S_n`（7 ≤ n ≤ 7 —— `S_8` 建得出但元素表四万行必卡，见上限表）。
 *
 * `createSymmetricGroup` 没有任何内部上限，`S_7` 是纯粹被门挡在外面的：
 * 同一条 `S_{n}` 门给 `A_{n}` 写 3..6，给 `S_{n}` 也写 6。
 */
function buildSymmetricLocally(key: string): Group | null {
  const m = SYM.exec(key)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isInteger(n) || n < 2 || n > SYM_MAX) return null
  if (parseGroupNotation(`S_{${n}}`).symbol) return null // core 建得出的不抢
  return createSymmetricGroup(n)
}

/** `D_n`（4 ≤ n ≤ 120）。core 的门停在 8，`createDihedralGroup` 自己没有上限。 */
function buildDihedralLocally(key: string): Group | null {
  const m = DIH.exec(key)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isInteger(n) || n < 4 || n > DIH_MAX) return null
  if (parseGroupNotation(`D_{${n}}`).symbol) return null
  return createDihedralGroup(n)
}

/** `C_n`（2 ≤ n ≤ 1000）。core 的门是 `CYCLIC_GROUP_MAX_ORDER = 120`，而闭式乘法本该任意阶都行。 */
function buildCyclicLocally(key: string): Group | null {
  const m = CYC.exec(key)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isInteger(n) || n < 2 || n > CYC_MAX) return null
  if (parseGroupNotation(`C_{${n}}`).symbol) return null
  return createCyclicGroup(n)
}
