/**
 * 有限域上的矩阵群（U50）：`GL(n,q)` / `SL(n,q)` / `PGL(n,q)` / `PSL(n,q)`。
 *
 * ── 为什么要有这一层（2026-10-02，用户原话）──────────────────────
 * 「常见群族不会没导入吧……前端都能搭 S6 了，导入常见群族也没什么问题吧。
 *   难道 desmos 算一些微积分还要跑去接入 matlab/sagemath 吗」
 *
 * core 那边是真的缺：`createGroupFromSymbol` 的 switch **只硬编码了 `GL(2, 2)` 与
 * `GL(2, 3)`**，而 `createGL2(p)` 内部第一行是 `if (!isPrime(p)) throw`。
 * 于是下面这九个常见记号**全部**被标成 `backend`（真跑 `parseGroupNotation` 得到）：
 *
 *   `GL(2,4)` 180 · `GL(2,5)` 480 · `GL(2,7)` 2016 · `GL(3,2)` 168 ·
 *   `SL(2,4)` 60 · `SL(2,5)` 120 · `PSL(2,7)` 168 · `PGL(2,7)` 336 · `PSL(2,5)` 60
 *
 * 界面当时说的是「该记号本地建不了：GL(2,4)，需要后端 GAP（后端通道尚未接入）」
 * （**旧 UI 文案，U50 已改**）—— 但那句话不成立：180 阶矩阵群在本机枚举出来只要
 * **0.2ms**，缺的只是"有人写"。
 *
 * ── 手法 ────────────────────────────────────────────────────────
 * 一行数学没抄：矩阵乘、行列式（高斯消元）、`det != 0` 判可逆，全是定义。
 * 唯一要"造"的是有限域：`F_p` 用取模；`F_4 = GF(2)[x]/(x^2+x+1)` 用异或加、
 * 按 `w^2 = w + 1` 乘（六个字符的公式）。`F_{p^k}`（k ≥ 2 且 q != 4）暂不做 ——
 * 那要先挑不可约多项式，且 `GL(2,8)` = 3528、`GL(2,9)` = 5760 画布也吃不下。
 *
 * ── 四条纪律 ────────────────────────────────────────────────────
 * ① **生成元自校验**：core 把 `a = [[1,1],[0,1]]`、`b = [[0,1],[1,0]]` 写死了
 *    （`index.js:2119`），**不检查这两个能不能生成整个群**。这里不照抄 —— 候选取
 *    初等矩阵 `E_ij(a)` 与 `diag(a,1,..)`，逐个加进生成元集并**重算闭包**，
 *    覆盖不满整个群就返回 `null`（U49 同一条纪律：生成元挑错的后果不是崩，
 *    是界面上给出"生成元生成不出这个群"的假象）。
 * ② **只补 core 真没实现的族**：`GL(2,2)` / `GL(2,3)` / `SL(2,3)` core 自己建得出，
 *    `symbol` 非空就不补 —— 同一个记号不许长出两个只是同构的群对象。
 * ③ **不猜**：域不支持、枚举超限、结果阶超限、生成元生不出全群 —— 一律 `null`，
 *    调用方照原样报"本地建不了"。
 * ④ **商自己算**：core 的 `computeQuotientGroup` 开头就读 `subgroup.isNormal`
 *    （而 `subgroupFromElementIds` 的 `isNormal` 恒为 false —— U40 记过这个坑），
 *    更要命的是**慢**（`PGL(2,7)` 实测 **19.5 秒**）。见 `quotientGroupOf`。
 */
import {
  parseGroupNotation,
  type Generator,
  type Group,
  type GroupElement,
} from '@groupviz/core'

// ── 有限域 ─────────────────────────────────────────────────────────

/** 元素编码成 `0..q-1` 的有限域运算。 */
interface Field {
  q: number
  add(a: number, b: number): number
  neg(a: number): number
  mul(a: number, b: number): number
  inv(a: number): number
}

function isPrime(n: number): boolean {
  if (n < 2) return false
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false
  return true
}

/** `F_p`：一切取模。 */
function primeField(p: number): Field {
  const mod = (x: number) => ((x % p) + p) % p
  return {
    q: p,
    add: (a, b) => mod(a + b),
    neg: (a) => mod(-a),
    mul: (a, b) => mod(a * b),
    // q 很小（<= 13），找乘逆直接试
    inv: (a) => {
      for (let b = 1; b < p; b++) if (mod(a * b) === 1) return b
      return 0
    },
  }
}

/**
 * `F_4 = GF(2)[x]/(x^2+x+1)`，元素 `0,1,2,3` 即 `0,1,w,w+1`。
 *
 * 特征 2 的加法就是按位异或；乘法把 `a = a1*w + a0`、`b = b1*w + b0` 展开，
 * 用 `w^2 = w + 1` 约掉二次项、按 mod 2 合并 —— 就是下面那一行。
 * 自检（回归里守着）：`2*2 = 3`（`w^2 = w+1`）、`2*3 = 1`（`w*(w+1) = w^2+w = 1`）。
 */
function gf4Field(): Field {
  const mul = (a: number, b: number): number => {
    const a1 = a >> 1
    const a0 = a & 1
    const b1 = b >> 1
    const b0 = b & 1
    return (((a1 * b0) ^ (a0 * b1) ^ (a1 * b1)) << 1) | ((a0 * b0) ^ (a1 * b1))
  }
  return {
    q: 4,
    add: (a, b) => a ^ b,
    neg: (a) => a,
    mul,
    inv: (a) => (a === 1 ? 1 : a === 2 ? 3 : a === 3 ? 2 : 0),
  }
}

/** 支持哪些 `q`。`F_{p^k}` 除去 `q = 4` 暂不做（见文件头）。 */
function fieldOf(q: number): Field | null {
  if (q === 4) return gf4Field()
  if (q >= 2 && q <= 13 && isPrime(q)) return primeField(q)
  return null
}

// ── 矩阵 ───────────────────────────────────────────────────────────

/** `n x n` 矩阵，行优先展平成 `n^2` 个域元素。 */
type Mat = number[]

const keyOf = (m: readonly number[]): string => m.join(',')

function identityMat(n: number): Mat {
  return Array.from({ length: n * n }, (_, k) => (Math.floor(k / n) === k % n ? 1 : 0))
}

/**
 * 元素标签：`\begin{smallmatrix}a&b\\c&d\end{smallmatrix}`。
 *
 * 与 core `matrixLabel` 逐字同形（n=2 时就是它），只是推广到 n=3 ——
 * core 那个签名写死了 `[number, number, number, number]`。全 ASCII、KaTeX 认。
 */
function matLabel(n: number, m: readonly number[]): string {
  const rows: string[] = []
  for (let i = 0; i < n; i++) rows.push(m.slice(i * n, i * n + n).join('&'))
  return `\\begin{smallmatrix}${rows.join('\\\\')}\\end{smallmatrix}`
}

function matMul(F: Field, n: number, a: readonly number[], b: readonly number[]): Mat {
  const out = new Array<number>(n * n).fill(0)
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const aik = a[i * n + k]
      if (aik === 0) continue
      for (let j = 0; j < n; j++) out[i * n + j] = F.add(out[i * n + j], F.mul(aik, b[k * n + j]))
    }
  }
  return out
}

/** 高斯消元算行列式 —— 顺带就把可逆性判了（`det != 0`）。 */
function matDet(F: Field, n: number, src: readonly number[]): number {
  const m = src.slice()
  let det = 1
  for (let i = 0; i < n; i++) {
    let piv = -1
    for (let r = i; r < n; r++) {
      if (m[r * n + i] !== 0) {
        piv = r
        break
      }
    }
    if (piv < 0) return 0
    if (piv !== i) {
      for (let c = 0; c < n; c++) {
        const t = m[i * n + c]
        m[i * n + c] = m[piv * n + c]
        m[piv * n + c] = t
      }
      det = F.neg(det)
    }
    det = F.mul(det, m[i * n + i])
    const pivInv = F.inv(m[i * n + i])
    for (let r = i + 1; r < n; r++) {
      const f = F.mul(m[r * n + i], pivInv)
      if (f === 0) continue
      for (let c = i; c < n; c++) m[r * n + c] = F.add(m[r * n + c], F.neg(F.mul(f, m[i * n + c])))
    }
  }
  return det
}

/** 求逆（对 `[A | I]` 做高斯-约当）。 */
function matInv(F: Field, n: number, src: readonly number[]): Mat | null {
  const m: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: 2 * n }, (_, j) => (j < n ? src[i * n + j] : j - n === i ? 1 : 0)),
  )
  for (let i = 0; i < n; i++) {
    let piv = -1
    for (let r = i; r < n; r++) if (m[r][i] !== 0) { piv = r; break }
    if (piv < 0) return null
    if (piv !== i) {
      const t = m[i]
      m[i] = m[piv]
      m[piv] = t
    }
    const scale = F.inv(m[i][i])
    for (let j = 0; j < 2 * n; j++) m[i][j] = F.mul(m[i][j], scale)
    for (let r = 0; r < n; r++) {
      if (r === i) continue
      const f = m[r][i]
      if (f === 0) continue
      for (let j = 0; j < 2 * n; j++) m[r][j] = F.add(m[r][j], F.neg(F.mul(f, m[i][j])))
    }
  }
  const flat: Mat = []
  for (let i = 0; i < n; i++) for (let j = n; j < 2 * n; j++) flat.push(m[i][j])
  return flat
}

/** 枚举上限：`q^(n^2)` 个候选矩阵再多就不枚举了。 */
const ENUM_CAP = 100_000
/** 结果阶上限：`GL(3,3)` = 11232 这种建得出也画不动。 */
const ORDER_CAP = 3000

/** 枚举全部矩阵，按 `det` 筛（`specialOnly` 只留 `det = 1`，即 SL）。 */
function enumMats(F: Field, n: number, specialOnly: boolean): Mat[] | null {
  const slots = n * n
  const total = F.q ** slots
  if (total > ENUM_CAP) return null
  const out: Mat[] = []
  const cur = new Array<number>(slots).fill(0)
  for (let code = 0; code < total; code++) {
    let rest = code
    for (let i = 0; i < slots; i++) {
      cur[i] = rest % F.q
      rest = Math.floor(rest / F.q)
    }
    const det = matDet(F, n, cur)
    if (specialOnly ? det === 1 : det !== 0) out.push(cur.slice())
  }
  return out
}

/**
 * 生成元候选：**初等矩阵** `E_ij(a) = I + a*e_ij`（`i != j`）与 `diag(a, 1, ..., 1)`。
 *
 * 这两个族生成 `GL(n,q)`（`SL` 由初等矩阵、`GL` 再多一个对角因子）—— 是定理，
 * 但**不靠它担保**：下面照样逐个验闭包，生成不出全群就不建（纪律①）。
 * 池子小是刻意的：`n=2, q=7` 只有 30 个候选，比"拿全部元素当候选"快得多。
 */
function generatorCandidates(F: Field, n: number): Mat[] {
  const out: Mat[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      for (let a = 1; a < F.q; a++) {
        const m = identityMat(n)
        m[i * n + j] = a
        out.push(m)
      }
    }
  }
  for (let a = 2; a < F.q; a++) {
    const m = identityMat(n)
    m[0] = a
    out.push(m)
  }
  return out
}

/** 标量矩阵 `a*I`（`a` 取遍 `F_q*`）——`PGL` / `PSL` 就是拿它当核去商。 */
function scalarMats(F: Field, n: number): Mat[] {
  const out: Mat[] = []
  for (let a = 1; a < F.q; a++) {
    const m = new Array<number>(n * n).fill(0)
    for (let k = 0; k < n; k++) m[k * n + k] = a
    out.push(m)
  }
  return out
}

// ── 造群 ───────────────────────────────────────────────────────────

/**
 * 把"下标 + 乘法表"包成一个 core 认的 `Group`。
 *
 * `GL`/`SL` 与它们的商 `PGL`/`PSL` 只差三样东西 —— 元素标签、乘法怎么算、逆怎么算；
 * **生成元贪心、闭包自校验、`Group` 骨架完全一样**，所以抽到这里共用。
 */
interface GroupTable {
  symbol: string
  name: string
  order: number
  identityIdx: number
  labelOf(i: number): string
  valueOf(i: number): number[]
  idxOf(e: GroupElement): number
  /** 乘法落不到表里返回 `undefined` —— 据此拒建（纪律③：不猜）。 */
  mulIdx(i: number, j: number): number | undefined
  invIdx(i: number): number | undefined
  /** 生成元候选，按"最可能生成全群"排序。 */
  candidates: number[]
}

function assembleGroup(t: GroupTable): Group | null {
  const order = t.order
  if (order <= 0 || order > ORDER_CAP) return null
  const elements: GroupElement[] = Array.from({ length: order }, (_, i) => ({
    id: `m${i}`,
    label: t.labelOf(i),
    value: t.valueOf(i),
  }))

  const closeOf = (gs: readonly number[]): Set<number> => {
    const seen = new Set<number>([t.identityIdx])
    const stack = [t.identityIdx]
    while (stack.length > 0) {
      const x = stack.pop() as number
      for (const g of gs) {
        const y = t.mulIdx(x, g)
        if (y !== undefined && !seen.has(y)) {
          seen.add(y)
          stack.push(y)
        }
      }
    }
    return seen
  }

  // 生成元自校验（纪律①）：贪心加候选，每加一个重算闭包；覆盖不满全群就不建
  const gens: number[] = []
  let covered = closeOf(gens)
  for (const cand of t.candidates) {
    if (covered.size === order) break
    if (cand === t.identityIdx) continue
    const withCand = closeOf([...gens, cand])
    if (withCand.size > covered.size) {
      gens.push(cand)
      covered = withCand
    }
  }
  if (covered.size !== order) return null

  const invOf = new Map<number, number>()
  for (let i = 0; i < order; i++) {
    const inv = t.invIdx(i)
    if (inv === undefined) return null
    invOf.set(i, inv)
  }

  const mulOf = (x: GroupElement, y: GroupElement): GroupElement =>
    elements[t.mulIdx(t.idxOf(x), t.idxOf(y)) ?? t.identityIdx]

  const generators: Generator[] = gens.map((g, k) => {
    const color = ['#4ea1ff', '#ff6b6b', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'][k % 6]
    const forward: Generator = {
      name: elements[g].label,
      symbol: elements[g].label,
      color,
      apply: (e) => mulOf(e, elements[g]),
      inverse: undefined as unknown as Generator,
    }
    forward.inverse = {
      name: `${elements[g].label}^{-1}`,
      symbol: `${elements[g].label}^{-1}`,
      color,
      apply: (e) => mulOf(e, elements[invOf.get(g) as number]),
      inverse: forward,
    }
    return forward
  })

  /*
   * `n >= 2` 的 `GL`/`SL`/`PGL`/`PSL` 一律非交换 —— 不是猜：`[[1,1],[0,1]]` 与
   * `[[1,0],[1,1]]` 不交换（只要 `q >= 2`，`1 != 0`），它们的像在商群里也不交换。
   * 全表实算对 `GL(2,7)` 是 400 万次矩阵乘，纯浪费。
   */
  return {
    name: t.name,
    symbol: t.symbol,
    order,
    elements,
    generators,
    multiply: mulOf,
    inverse: (x) => elements[invOf.get(t.idxOf(x)) ?? t.identityIdx],
    identity: elements[t.identityIdx],
    isAbelian: false,
  }
}

/** `GL(n,q)` / `SL(n,q)`：`mats` 已经按 `det` 筛过。 */
function makeMatrixGroup(F: Field, n: number, mats: Mat[], symbol: string, name: string): Group | null {
  if (mats.length === 0) return null
  const idxOfMat = new Map<string, number>()
  mats.forEach((m, i) => idxOfMat.set(keyOf(m), i))
  const identityIdx = idxOfMat.get(keyOf(identityMat(n)))
  if (identityIdx === undefined) return null

  const candidates: number[] = []
  for (const cand of generatorCandidates(F, n)) {
    const at = idxOfMat.get(keyOf(cand))
    if (at !== undefined) candidates.push(at)
  }

  return assembleGroup({
    symbol,
    name,
    order: mats.length,
    identityIdx,
    labelOf: (i) => matLabel(n, mats[i]),
    valueOf: (i) => mats[i],
    idxOf: (e) => idxOfMat.get(keyOf(e.value)) ?? identityIdx,
    mulIdx: (i, j) => idxOfMat.get(keyOf(matMul(F, n, mats[i], mats[j]))),
    invIdx: (i) => {
      const inv = matInv(F, n, mats[i])
      return inv ? idxOfMat.get(keyOf(inv)) : undefined
    },
    candidates,
  })
}

/**
 * `PGL(n,q)` / `PSL(n,q)`：拿标量矩阵当核做商。
 *
 * **陪集自己算，不走 core 的 `computeQuotientGroup`** —— 那一头有两个坑：
 *   ① 它第一行就是 `if (!subgroup.isNormal) return null`，而自造 `Subgroup` 要绕过
 *      U40 记过的坑（`subgroupFromElementIds` 的 `isNormal` 恒 false）；
 *   ② 更要命的是**慢**：`PGL(2,7)` 实测 **19.5 秒**（2016 个元素的左陪集逐个展开）。
 *
 * 陪集本身是 `O(|G| x |Z|)`：遍历元素，没归属的就开一个新陪集、拿 `Z` 乘开
 * （`Z` 在中心，左乘右乘一样）。`|Z| = q - 1 <= 6`，2016 x 6 = 12k 步 —— 快三个数量级。
 */
function quotientGroupOf(F: Field, n: number, mats: Mat[], symbol: string, name: string): Group | null {
  const scalars = scalarMats(F, n)
  if (scalars.length === 0 || mats.length === 0) return null

  /*
   * 关键一步：乘出来的矩阵**必须还在 `mats` 里**才算数。
   *
   * `PSL(n,q) = SL(n,q) / (Z ∩ SL)`，而 `det(a*I) = a^2` —— 只有 `a^2 = 1` 的那几个
   * 标量才落在 SL 里（`q = 7` 时是 `±I` 两个，`q = 4` 时只有 `I`）。拿全部 `q-1` 个
   * 标量去乘，会写进一堆**根本不在 SL 里**的矩阵；如果不筛，`cosetOf` 的条数就
   * 超过 `mats.length`，下一步的相等检查会把 `PSL(2,7)` 判成"建不出"。
   */
  const inMats = new Set(mats.map(keyOf))
  const cosetOf = new Map<string, number>()
  const reps: Mat[] = []
  for (const m of mats) {
    if (cosetOf.has(keyOf(m))) continue
    const ci = reps.length
    reps.push(m)
    for (const s of scalars) {
      const k = keyOf(matMul(F, n, m, s))
      if (inMats.has(k)) cosetOf.set(k, ci)
    }
  }
  // 每个矩阵必须恰好落进一个陪集 —— 对不上说明核没取对，不建
  if (cosetOf.size !== mats.length) return null

  const identityIdx = cosetOf.get(keyOf(identityMat(n)))
  if (identityIdx === undefined) return null

  const candidates: number[] = []
  for (const cand of generatorCandidates(F, n)) {
    const c = cosetOf.get(keyOf(cand))
    if (c !== undefined && !candidates.includes(c)) candidates.push(c)
  }

  return assembleGroup({
    symbol,
    name,
    order: reps.length,
    identityIdx,
    // 元素是**陪集**，用代表矩阵的标签显示（教材也这么写）
    labelOf: (i) => matLabel(n, reps[i]),
    valueOf: (i) => [i],
    idxOf: (e) => e.value[0],
    mulIdx: (i, j) => cosetOf.get(keyOf(matMul(F, n, reps[i], reps[j]))),
    invIdx: (i) => {
      const inv = matInv(F, n, reps[i])
      return inv ? cosetOf.get(keyOf(inv)) : undefined
    },
    candidates,
  })
}

/** 记号匹配。`parseGroupNotation` 的 `canonical` 已经去掉了空格（`GL(2,4)`）。 */
const MATRIX_NOTATION = /^(GL|SL|PGL|PSL)\((\d+),(\d+)\)$/

const KIND_NAME: Record<string, string> = {
  GL: 'General Linear Group',
  SL: 'Special Linear Group',
  PGL: 'Projective General Linear Group',
  PSL: 'Projective Special Linear Group',
}

/**
 * 本地造一个矩阵群记号；造不了返回 `null`（调用方照原样报"本地建不了"）。
 *
 * 加新族之前先问一句：**core 那边是真算不动，还是只是一行人为上限？**
 * `GL(2,q)` 属于**真没实现**（构造器只吃素数、switch 只到 p=3）—— 这一类才归本文件；
 * `A_6` / `S_7` / `D_16` 那种"算得出却被人为上限挡下"的归 `localBuild.ts`。
 */
export function buildMatrixGroup(canonical: string): Group | null {
  const m = MATRIX_NOTATION.exec(canonical.replace(/\s+/g, ''))
  if (!m) return null
  const kind = m[1]
  const n = Number(m[2])
  const q = Number(m[3])
  if (!Number.isInteger(n) || !Number.isInteger(q) || n < 2 || n > 3) return null

  // 纪律②由**函数自己**守住：core 建得出的（`GL(2,2)` / `GL(2,3)` / `SL(2,3)`）一律不补，
  // 否则同一个记号会长出两个只是同构的群对象。
  if (parseGroupNotation(canonical).symbol) return null

  const F = fieldOf(q)
  if (!F) return null

  const special = kind === 'SL' || kind === 'PSL'
  const mats = enumMats(F, n, special)
  if (!mats) return null

  const symbol = `${kind}(${n}, ${q})`
  const name = `${KIND_NAME[kind]} ${symbol}`
  if (kind === 'GL' || kind === 'SL') return makeMatrixGroup(F, n, mats, symbol, name)
  return quotientGroupOf(F, n, mats, symbol, name)
}
