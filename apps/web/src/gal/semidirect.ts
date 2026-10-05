/**
 * 半直积 `N ⋊_φ H`（U51）—— 记号欠定时的**三态分诊**。
 *
 * ── 为什么要有这一层（2026-10-02，用户原话）────────────────────
 * 「GL(2,Z/4Z)、(C2)^4⋊S3 算不出来？」
 *
 * 分诊下来两个记号性质完全不同（探针账在 `apps/web/.tmp-u51/`）：
 *
 * | 记号 | core 的反应 | 真相 |
 * |---|---|---|
 * | `GL(2,Z/4Z)` | `unknown`（连记号都不认）| 群是确定的（96 阶），只是矩阵群层只做了**域** |
 * | `C_2^4:S_3` | `semidirect`：「**找不到**满足条件的非平凡作用 φ」| 非平凡作用**一抓一大把**（坐标写法 16800 种）|
 * | `C_2^2:C_3` | 同上 | 非平凡作用**唯一** ⇒ 群唯一 = `A_4` —— core 误拒 |
 *
 * 三条判据：
 *   ① **「找不到」和「太多」是两件事**。core 把"不唯一"说成"不存在"，于是用户
 *      既不知道填什么，也不知道其实有解。分诊必须分开说。
 *   ② **唯一就建**（`C_2^2:C_3` → `A_4`）：记号欠定不代表无解，唯一时没有歧义。
 *   ③ **多解不许替用户挑**：`C_2^4:S_3` 的多个作用类给出不同构的群，选哪个是数学
 *      问题不是实现细节。报「有 k 类」+ 各类的指纹。
 *
 * ── 手法 ────────────────────────────────────────────────────────
 * core 其实**备好了**半直积的零件（`groups/SemidirectProduct.d.ts`）：
 *   `createSemidirectProduct(N, H, phiMap)` · `verifyPhiHomomorphism` ·
 *   `findSemidirectDecompositions`（**内**分解：从 G 的子群里找 N、H）。
 * 缺的只有一件：**外**半直积的 φ 从哪来 —— 即 `Hom(H, Aut(N))` 的枚举。
 *
 * ── 三条纪律 ────────────────────────────────────────────────────
 * ① **φ 必须给全 H 的元素**：core 的 `phiMap` 只认 H 的**元素 id**，缺键按恒等处理
 *    （见 `verifyPhiHomomorphism` 文档）。于是"只给生成元"会静默退化成直积 ——
 *    实测真跑：写成 `key = 'a'`（生成元名）时得到 `C_2^2 × C_3`（12 阶交换群），
 *    `A_4` 飞了，而且 **`verify` 还返回 true**（恒等映射当然同态）。
 *    这里用生成元的像在 H 上做 **BFS 传播**补齐全元素；传播时的**一致性检查**
 *    同时就是"是不是同态"的判据（同一元素的两条字路径必须给同一个像）。
 * ② **不许猜**：组合数超线、`Aut(N)` 搜不出来、结果阶超线 —— 一律 `blocked`，
 *    报错语说清卡在哪一段。
 * ③ **多解按群指纹归并**：用户问的是"这个记号指哪个群"，判据就该是**群**而不是 φ
 *    （同一个群可以有多种等价的作用）。指纹 = `阶 | 交换 | |Z| | |[G,G]| | 阶分布`。
 */
import {
  createDirectProduct,
  createSemidirectProduct,
  findAllAutomorphisms,
  getGeneratorElement,
  minimalGenerators,
  type Automorphism,
  type Group,
  type GroupElement,
} from '@groupviz/core'
// `Aut` 的搜索守卫（U47/U50）—— 这条路**必须**复用，不能裸调 core：
// `findAllAutomorphisms(C_3^3)` 实测 8.8 秒（组合数 17576 x 阶 27 = 474552，超过线 30000）
import { AUT_SEARCH_BUDGET, autSearchCombinations } from './automorphisms'
// 母群指针（app 侧账外索引）：判断"两个参数是不是同一个母群里的子群"
import { rootOf, sameGroup } from './parents'
// `why` 会进**纯文本面**（状态行 / hint）——符号要过一道 `prettySymbol`（`C_{2}^{5}` -> `C_2^5`），
// 别把花括号摆到状态行上。core 的报错文案也是这么处理的（见 `evalDef` 的 `asciiClean`）。
import { prettySymbol } from './pretty'

/** 记号 → 纯文本面可用的形态。`why` 里一律走它，别直接用 `g.symbol`。 */
const nm = (g: Group): string => prettySymbol(g.symbol)

// ── 预算 ───────────────────────────────────────────────────────────

/** `Aut(N)` 的枚举上限（`GL(4,2)` = 20160 放行）。 */
export const SEMI_AUT_CAP = 100_000

/** 组合数在这条线以内 → **完整枚举**（结论精确）。 */
export const SEMI_FULL_COMBO_CAP = 1_200

/**
 * 超过上面那条线 → **分层抽样**，每个生成元位置最多留这么多个像。
 *
 * 抽样不是偷懒：`S_3 → GL(4,2)` 的完整枚举实测 **385 秒**（388080 个组合，
 * 每个都要走一遍传播 + 造群 + 指纹）。但用户问的是"这个记号是不是唯一的群"，
 * 而**证明不唯一只要两个**。超线时改为按"像的循环型"分组、每组取若干代表
 * ⇒ 覆盖各种作用形态，一秒内拿到"至少 k 类"。
 * 抽样时结论措辞带**"至少"**，不假装完整。
 */
export const SEMI_SAMPLE_CAP = 2_500

/** 抽样时**单个**生成元位置的像数上限 —— 生成元只有 1 个时别把 2500 全给它。 */
export const SEMI_PER_GEN_CAP = 60

/** 结果群阶上限 —— 96（`S_4 × C_2^2`）放行，再大指纹就算不动了。 */
export const SEMI_ORDER_CAP = 256

// ── 自同构：像数组 ─────────────────────────────────────────────────

/**
 * 自同构的像表示成**数组**（下标 = N 的元素序）。
 *
 * 不直接用 `Automorphism.map`：枚举 φ 时要几百万次复合与比较，
 * `Map.get/set` 比数组下标慢一个量级（U50 那条"量错了对象"的延伸）。
 */
type AutImage = readonly number[]

const IDENTITY_CACHE = new Map<number, AutImage>()
function identityImage(n: number): AutImage {
  let v = IDENTITY_CACHE.get(n)
  if (!v) {
    v = Array.from({ length: n }, (_, i) => i)
    IDENTITY_CACHE.set(n, v)
  }
  return v
}

/** 复合：`f ∘ g`（先 g 后 f）—— 与 core `createSemidirectProduct` 的约定一致。 */
function compose(f: AutImage, g: AutImage): AutImage {
  const out = new Array<number>(g.length)
  for (let i = 0; i < g.length; i++) out[i] = f[g[i]]
  return out
}

function imageEquals(a: AutImage, b: AutImage): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function imageOrder(a: AutImage, n: number): number {
  let cur = identityImage(n)
  for (let o = 1; o <= 64; o++) {
    cur = compose(a, cur)
    if (imageEquals(cur, identityImage(n))) return o
  }
  return -1
}

/**
 * 初等交换 2-群 `C_2^n` 的自同构 —— `Aut(C_2^n) = GL(n,2)`。
 *
 * 为什么不能只靠 core：`findAllAutomorphisms` 自带
 * `AUTOMORPHISM_MAX_COMBINATIONS = 30000` 守卫，而 `C_2^4` 的候选组合是
 * `15^4 = 50625` —— **过不了它自己那道门**（实测真跑：0ms 返回空数组）。
 * 那条线量的是 core 那条 DFS 的代价，不是这个群的大小：`C_2^4` 的自同构就是
 * `F_2` 上的 4×4 可逆矩阵，**20160 个**，枚举矩阵比 DFS 快得多。
 *
 * 判据与 U50 同源（**量错了对象**）：`Aut(C_2^n) = GL(n,2)` 是定义级结论，不叫猜。
 * 只做 `n ≤ 4`（`|GL(4,2)| = 20160`；`n = 5` 就是 9999360，超线）。
 */
function elementaryAbelianAutomorphisms(N: Group): Automorphism[] | null {
  const n = Math.round(Math.log2(N.order))
  if (2 ** n !== N.order || n < 1 || n > 4) return null
  const e = N.identity
  for (const el of N.elements) {
    if (el.id === e.id) continue
    if (N.multiply(el, el).id !== e.id) return null // 有非 2 阶元 ⇒ 不是初等交换
  }
  const gens = N.generators
    .map((g) => getGeneratorElement(N, g))
    .filter((x): x is GroupElement => !!x)
  if (gens.length !== n) return null

  // 元素 → 生成元下标集合（F_2 向量）。初等交换 2-群里每个元素唯一写成子集和。
  const vecOf = new Map<string, number>([[e.id, 0]])
  const byVec = new Map<number, GroupElement>([[0, e]])
  const queue: GroupElement[] = [e]
  while (queue.length > 0) {
    const x = queue.shift() as GroupElement
    const vx = vecOf.get(x.id) as number
    for (let i = 0; i < n; i++) {
      const y = N.multiply(x, gens[i])
      if (vecOf.has(y.id)) continue
      const vy = vx | (1 << i)
      vecOf.set(y.id, vy)
      byVec.set(vy, y)
      queue.push(y)
    }
  }
  if (vecOf.size !== N.order) return null

  // 枚举 F_2 上 n×n 可逆矩阵：逐行挑（保持行秩 = 行数）
  const rows: number[] = []
  for (let r = 1; r < 1 << n; r++) rows.push(r)
  const rankOf = (rs: readonly number[]): number => {
    const t = [...rs]
    let rank = 0
    for (let bit = n - 1; bit >= 0; bit--) {
      let p = -1
      for (let i = rank; i < t.length; i++) if ((t[i] >> bit) & 1) { p = i; break }
      if (p < 0) continue
      ;[t[rank], t[p]] = [t[p], t[rank]]
      for (let i = 0; i < t.length; i++) if (i !== rank && ((t[i] >> bit) & 1)) t[i] ^= t[rank]
      rank++
    }
    return rank
  }
  const mats: number[][] = []
  const pick: number[] = []
  const dfs = (): void => {
    if (pick.length === n) {
      mats.push([...pick])
      return
    }
    for (const r of rows) {
      pick.push(r)
      if (rankOf(pick) === pick.length) dfs()
      pick.pop()
    }
  }
  dfs()
  if (mats.length === 0) return null

  const applyMat = (M: readonly number[], v: number): number => {
    let out = 0
    for (let i = 0; i < n; i++) {
      let s = M[i] & v
      s ^= s >> 2
      s ^= s >> 1
      out |= (s & 1) << i
    }
    return out
  }
  const idxOf = new Map(N.elements.map((el, i) => [el.id, i]))
  return mats.map((M, k): Automorphism => ({
    id: `gl-${k}`,
    label: '',
    map: new Map(N.elements.map((el) => [el.id, (byVec.get(applyMat(M, vecOf.get(el.id) as number)) ?? e).id])),
    apply: (el: GroupElement) => byVec.get(applyMat(M, vecOf.get(el.id) as number)) ?? e,
  }))
}

export type AutLookupResult = { kind: 'ok'; images: AutImage[] } | { kind: 'blocked'; why: string }

/**
 * `Aut(N)` 的像数组 —— core 优先，`C_2^n` 兜底。
 *
 * 兜底的判据：core 的守卫按**它那条 DFS 的候选组合数**设，对 `C_2^4` 会误伤
 * （50625 > 30000），而这个群的自同构是 20160 个 F_2 矩阵，枚举起来快得多。
 */
export function lookupAutImages(N: Group): AutLookupResult {
  const idxOf = new Map(N.elements.map((el, i) => [el.id, i]))
  const toImage = (a: Automorphism): AutImage =>
    N.elements.map((el) => idxOf.get(a.map.get(el.id) ?? el.id) ?? 0)

  const local = elementaryAbelianAutomorphisms(N)
  if (local && local.length > 0) {
    if (local.length > SEMI_AUT_CAP) {
      return { kind: 'blocked', why: `Aut(${nm(N)}) 有 ${local.length} 个元素，超过本地枚举线 ${SEMI_AUT_CAP}` }
    }
    return { kind: 'ok', images: local.map(toImage) }
  }
  const combos = autSearchCombinations(N)
  if (combos * N.order > AUT_SEARCH_BUDGET) {
    return {
      kind: 'blocked',
      why: `Aut(${nm(N)}) 要逐个同阶元素试 ${combos} x ${N.order} 次（超过本地搜索线 ${AUT_SEARCH_BUDGET}），本地不跑`,
    }
  }
  const auts = findAllAutomorphisms(N)
  if (auts.length === 0) {
    return {
      kind: 'blocked',
      why: `Aut(${nm(N)}) 本地搜不出来，core 的候选组合数守卫拦下的（它按"逐个同阶元素试"的代价算，${
        N.order
      } 阶群过不了那条线）`,
    }
  }
  if (auts.length > SEMI_AUT_CAP) {
    return { kind: 'blocked', why: `Aut(${nm(N)}) 有 ${auts.length} 个元素，超过本地枚举线 ${SEMI_AUT_CAP}` }
  }
  return { kind: 'ok', images: auts.map(toImage) }
}

// ── φ 的枚举 ──────────────────────────────────────────────────────

/**
 * 用生成元的像在 H 上 BFS 传播，同时检查一致性。
 *
 *   · 传播走 `H.multiply(h, s)`（右乘生成元）⇒ `φ(h·s) = φ(h) ∘ φ(s)`；
 *   · **同一元素被两条字路径走到时必须给同一个像** —— 这一条就是"φ 是同态"的
 *     充要条件（H 由这组生成元生成），所以不必再跑一遍全表 verify。
 *
 * 返回 `null` = 这组像**不可能**是同态（当场剪掉，这是枚举快得起来的关键）。
 */
function propagate(H: Group, gens: readonly GroupElement[], images: readonly AutImage[], n: number): Map<string, AutImage> | null {
  const phi = new Map<string, AutImage>([[H.identity.id, identityImage(n)]])
  const queue: GroupElement[] = [H.identity]
  while (queue.length > 0) {
    const h = queue.shift() as GroupElement
    const ph = phi.get(h.id) as AutImage
    for (let i = 0; i < gens.length; i++) {
      const hs = H.multiply(h, gens[i])
      const expected = compose(ph, images[i])
      const seen = phi.get(hs.id)
      if (seen) {
        if (!imageEquals(seen, expected)) return null
      } else {
        phi.set(hs.id, expected)
        queue.push(hs)
      }
    }
  }
  return phi.size === H.order ? phi : null
}

/** 一个候选作用。 */
export interface PhiOption {
  /** 生成元像在 `Aut(N)` 里的展示名（`α₃` 这类） */
  genImages: string[]
  /** 签名：生成元像的下标串（去重用） */
  signature: string
  group: Group
  /** `阶 | 交换 | |Z| | |[G,G]| | 阶分布` */
  fingerprint: string
}

export type SemidirectPlan =
  /** 只有一个同构类 ⇒ 直接给 */
  | { kind: 'ok'; group: Group; actionCount: number; sampled?: boolean; faithfulOnly?: boolean }
  /** 有多个本质不同的作用 ⇒ 列出来，不替用户挑 */
  | {
      kind: 'multi'
      options: PhiOption[]
      actionCount: number
      normal: Group
      acting: Group
      sampled?: boolean
      faithfulOnly?: boolean
    }
  /** 只有平凡作用 ⇒ 这个记号其实指的是直积 */
  | { kind: 'trivial'; group: Group }
  /** 算不动 / 超线 —— 说清卡在哪 */
  | { kind: 'blocked'; why: string }

/** 像数组的循环型（`Sym(N)` 共轭下的不变量）—— 抽样时用它保证"各种形态都抽到"。 */
function cycleTypeOf(img: AutImage): string {
  const seen = new Uint8Array(img.length)
  const lens: number[] = []
  for (let i = 0; i < img.length; i++) {
    if (seen[i]) continue
    let k = 0
    let j = i
    while (!seen[j]) {
      seen[j] = 1
      j = img[j]
      k++
    }
    lens.push(k)
  }
  return lens.sort((a, b) => a - b).join('.')
}

/** 按循环型分组、每组取前若干个 —— 覆盖面优先，不是为了"少算"。 */
function sampleCandidates(list: readonly number[], auts: readonly AutImage[], perGen: number): number[] {
  const byCycle = new Map<string, number[]>()
  for (const i of list) {
    const key = cycleTypeOf(auts[i])
    const arr = byCycle.get(key)
    if (arr) arr.push(i)
    else byCycle.set(key, [i])
  }
  const groups = [...byCycle.values()]
  const per = Math.max(1, Math.ceil(perGen / groups.length))
  const out: number[] = []
  for (const g of groups) out.push(...g.slice(0, per))
  return out
}

/**
 * 群指纹 —— 同构必同指纹（反向不一定，但这几项已经很强）。
 *
 * 用**乘法表**（`Uint16Array(n*n)`）而不是 `G.multiply`：枚举 φ 时每个候选都要算
 * 一次指纹，`n²` 次函数调用对 96 阶群就是 9216 次/候选 —— 实测这是第一个版本
 * 385 秒的主因（`C_2^4:S_3`）。查表后同样的量降到可忽略。
 */
function fingerprintOf(G: Group): string {
  const n = G.order
  const idx = new Map(G.elements.map((el, i) => [el.id, i]))
  const mulT = new Uint16Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) mulT[i * n + j] = idx.get(G.multiply(G.elements[i], G.elements[j]).id) ?? 0
  }
  const id = idx.get(G.identity.id) ?? 0
  const invT = new Uint16Array(n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (mulT[i * n + j] === id) {
        invT[i] = j
        break
      }
    }
  }

  const hist = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    let o = 1
    let cur = mulT[id * n + i]
    while (cur !== id && o < 512) {
      cur = mulT[cur * n + i]
      o++
    }
    hist.set(o, (hist.get(o) ?? 0) + 1)
  }

  let center = 0
  let abelian = true
  for (let i = 0; i < n; i++) {
    let ok = true
    for (let j = 0; j < n; j++) {
      if (mulT[i * n + j] !== mulT[j * n + i]) {
        ok = false
        break
      }
    }
    if (ok) center++
    else abelian = false
  }

  const comm = new Set<number>()
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      comm.add(mulT[mulT[i * n + j] * n + mulT[invT[i] * n + invT[j]]])
    }
  }
  const gens = [...comm]
  const sub = new Set<number>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const s of [...sub]) {
      for (const g of gens) {
        const p = mulT[s * n + g]
        if (!sub.has(p)) {
          sub.add(p)
          grew = true
        }
      }
    }
  }
  const sorted = [...hist.entries()].sort((a, b) => a[0] - b[0])
  return `${n}|${abelian ? 'ab' : 'non'}|Z${center}|C${sub.size}|${sorted.map(([o, c]) => `${o}:${c}`).join(',')}`
}

/**
 * **预算预检**：只看两边的阶，**不看生成元、不枚举 φ**。
 *
 * 同一个判据有两处消费者，所以抽出来（不许两处各写一份，进度迟早会打架）：
 *   ① `planSemidirect` 的第一道门 —— 拦下时给一句"卡在哪"；
 *   ② **候选菜单的预检**（`ops.ts` 的 `OpDef.fits`）—— `⋊` 与直积不同：它对
 *      **任意**两个群都有定义，但本地不一定算得动。列出来点下去必被预算拦 =
 *      「菜单撒谎」。实测标本：`A_4 ⋊ S_4`（288 阶）要枚举 160 组生成元像、
 *      每组建一个 288 阶群再算指纹 —— 单候选 ~90ms，合计 14 秒。
 */
export function semidirectBudget(N: Group, H: Group): { ok: true } | { ok: false; why: string } {
  const size = N.order * H.order
  if (size > SEMI_ORDER_CAP) {
    return { ok: false, why: `|N| x |H| = ${size} 超过半直积的本地规模线 ${SEMI_ORDER_CAP}` }
  }
  return { ok: true }
}

/**
 * 分诊：`N`、`H` 之间有哪些作用，各自给出什么群。
 *
 * 「平凡作用」单独算一态：`:` / `⋊` 记号的语义是**非平凡**半直积，只有平凡作用时
 * 这个记号其实指的是直积（该说清楚，而不是混进候选里凑数）。
 */
/**
 * `planSemidirect` 的**前四道门**抽出来 —— 菜单预检（`OpDef.fits`）与正式求值共用。
 *
 * ## 为什么抽（F3，2026-10-05）
 *
 * `fits` 此前只调 `semidirectBudget`（第 1 道），而 `planSemidirect` 还有三道
 * `blocked` 门。于是拖 `G(S_4)` → `Z(= Z(S_4) = C_1)` 照样列出「半直积」，
 * 点下去报「G 与 Z 的半直积本地算不了」——
 * "共用同一个判据"这句话本身又变成了**两份**（`AUDIT-2026-10-04-canvas.md` F3 原话）。
 *
 * ⚠️ **只抽"预算 / 平凡性"这四道**，不抽后面的枚举：
 *  · `trivial` / `multi` 是**数学答复**（这个记号本来就定不下一个群），不是"点了必报错"；
 *  · 枚举的 `blocked` 要算 `Aut(N)` 的全部像，预检时算一遍、run 里再算一遍太贵。
 * 那两类由 `planSemidirect` 自己判（预检放过的，run 可以再拦 —— 那时用户已经点了，
 * 会看到理由）。
 */
export function semidirectBlockedReason(N: Group, H: Group): string | null {
  const budget = semidirectBudget(N, H)
  if (!budget.ok) return budget.why
  const autLookup = lookupAutImages(N)
  if (autLookup.kind === 'blocked') return autLookup.why
  const auts = autLookup.images
  const nOrder = N.order

  const gens = minimalGenerators(H, H.elements)
  if (gens.length === 0) return `${nm(H)} 是平凡群，没有能作用的生成元`
  const genOrders = gens.map((g) => {
    let o = 1
    let cur = g
    while (cur.id !== H.identity.id && o < 512) {
      cur = H.multiply(cur, g)
      o++
    }
    return o
  })
  const autOrders = auts.map((a) => imageOrder(a, nOrder))
  const cands = genOrders.map((go) =>
    auts.map((_, i) => i).filter((i) => autOrders[i] > 0 && go % autOrders[i] === 0),
  )
  const combos = cands.reduce((acc, c) => acc * c.length, 1)
  const sampled = combos > SEMI_FULL_COMBO_CAP
  const perGen = Math.min(
    SEMI_PER_GEN_CAP,
    Math.max(1, Math.ceil(Math.pow(SEMI_SAMPLE_CAP, 1 / cands.length))),
  )
  const used = sampled ? cands.map((list) => sampleCandidates(list, auts, perGen)) : cands
  const usedCombos = used.reduce((acc, c) => acc * c.length, 1)
  if (usedCombos > SEMI_SAMPLE_CAP * 4) {
    return `生成元像的组合有 ${combos} 种（H 的生成元 ${gens.length} 个、Aut(${nm(N)}) 有 ${auts.length} 个元素），分层抽样后仍有 ${usedCombos} 种，本地跑不完`
  }
  return null
}

export function planSemidirect(N: Group, H: Group): SemidirectPlan {
  // 四道门的判据只有一份（`semidirectBlockedReason`）—— 菜单预检与这里共用。
  const blocked = semidirectBlockedReason(N, H)
  if (blocked !== null) return { kind: 'blocked', why: blocked }
  const autLookup = lookupAutImages(N)
  if (autLookup.kind === 'blocked') return autLookup
  const auts = autLookup.images
  const nOrder = N.order

  const gens = minimalGenerators(H, H.elements)
  const genOrders = gens.map((g) => {
    let o = 1
    let cur = g
    while (cur.id !== H.identity.id && o < 512) {
      cur = H.multiply(cur, g)
      o++
    }
    return o
  })
  const autOrders = auts.map((a) => imageOrder(a, nOrder))
  const cands = genOrders.map((go) => auts.map((_, i) => i).filter((i) => autOrders[i] > 0 && go % autOrders[i] === 0))
  const combos = cands.reduce((acc, c) => acc * c.length, 1)
  // 组合数超线 ⇒ 分层抽样（"至少 k 类"够回答"唯不唯一"）。完整枚举只在小规模上做。
  const sampled = combos > SEMI_FULL_COMBO_CAP
  const perGen = Math.min(SEMI_PER_GEN_CAP, Math.max(1, Math.ceil(Math.pow(SEMI_SAMPLE_CAP, 1 / cands.length))))
  const used = sampled ? cands.map((list) => sampleCandidates(list, auts, perGen)) : cands
  const usedCombos = used.reduce((acc, c) => acc * c.length, 1)

  const idImg = identityImage(nOrder)
  const idxOf = new Map(N.elements.map((el, i) => [el.id, i]))
  const toAutomorphism = (img: AutImage): Automorphism => {
    const map = new Map<string, string>()
    N.elements.forEach((el, i) => map.set(el.id, N.elements[img[i]]?.id ?? el.id))
    return {
      id: `phi-${img.join('.')}`,
      label: '',
      map,
      apply: (el: GroupElement) => N.elements[img[idxOf.get(el.id) ?? 0]] ?? el,
    }
  }

  /*
   * 两个桶：**忠实**作用（φ 单）与非平凡作用（φ 可能非单）。
   *
   * `N ⋊_φ H` 对任意同态 φ 都有定义，所以非单的那些也是合法解；但 φ 非单时
   * "H 其实没整体动起来"（`ker φ` 直接成了直积因子）。实测真跑：不过滤时
   * `C_2^4:S_3` 有 **5** 个不同构的 96 阶群，而**忠实**作用的等价类只有 **3** 个
   * （轨道枚举：3360 + 10080 + 3360 = 16800 个 (A,B) 对，全覆盖）。
   * 判据：**先忠实，忠实的没有才退非平凡** —— 用户写 `⋊ S_3` 要的是"S_3 真的在动"；
   * 反过来 `C_2^2:C_4` 这类根本不存在忠实作用（C_4 嵌不进 GL(2,2)）的记号，
   * 不能因为"没有忠实的"就判成直积。
   */
  const faithful = new Map<string, PhiOption>()
  const loose = new Map<string, PhiOption>()
  let actionCount = 0
  let sawTrivial = false
  const pick: number[] = []
  const walk = (i: number): void => {
    if (i === gens.length) {
      const images = pick.map((k) => auts[k])
      if (images.every((img) => imageEquals(img, idImg))) {
        sawTrivial = true
        return
      }
      const phi = propagate(H, gens, images, nOrder)
      if (!phi) return
      actionCount++
      const isFaithful = H.elements.every(
        (h) => h.id === H.identity.id || !imageEquals(phi.get(h.id) ?? idImg, idImg),
      )
      const phiMap = new Map<string, Automorphism>()
      for (const h of H.elements) {
        const img = phi.get(h.id)
        if (!img) return
        phiMap.set(h.id, toAutomorphism(img))
      }
      let G: Group
      try {
        G = createSemidirectProduct(N, H, phiMap)
      } catch {
        return
      }
      const fp = fingerprintOf(G)
      const signature = pick.join(',')
      const bucket = isFaithful ? faithful : loose
      const prev = bucket.get(fp)
      if (!prev || prev.signature > signature) {
        bucket.set(fp, {
          genImages: pick.map((k) => `\\alpha_{${k}}`),
          signature,
          group: G,
          fingerprint: fp,
        })
      }
      return
    }
    for (const k of used[i]) {
      pick.push(k)
      walk(i + 1)
      pick.pop()
    }
  }
  walk(0)

  const faithfulOnly = faithful.size > 0
  const options = [...(faithfulOnly ? faithful : loose).values()]
  if (options.length === 0) {
    if (sawTrivial) return { kind: 'trivial', group: createDirectProduct(N, H) }
    return {
      kind: 'blocked',
      why: `本地把 ${nm(H)} 的生成元在 Aut(${nm(N)}) 里的合法像枚举完了，没有一组能闭合出非平凡同态`,
    }
  }
  if (options.length === 1) {
    return { kind: 'ok', group: options[0].group, actionCount, sampled, faithfulOnly }
  }
  return { kind: 'multi', options, actionCount, normal: N, acting: H, sampled, faithfulOnly }
}

/**
 * 指纹 → 人话（「多个候选」列表里必须能区分，光看符号是同一个记号）。
 *
 * 分隔符用 `、`（顿号）**不用 `·`**：这条串会进 `.composer-status` 这个
 * **纯文本面**，而 `·` 键盘打不出来 —— `e2e/no-unicode-leak.mjs` 会把整个界面
 * （KaTeX 之外）的文本节点扫一遍，`·` 直接算泄漏。
 */
export function humanFingerprint(fp: string): string {
  const [order, ab, z, c, hist] = fp.split('|')
  const histText = hist
    .split(',')
    .map((p) => {
      const [o, n] = p.split(':')
      return `${o}${n === '1' ? '' : `^${n}`}`
    })
    .join(' ')
  return `|G| = ${order}、${ab === 'ab' ? '交换' : '非交换'}、|Z| = ${z.slice(1)}、|[G,G]| = ${c.slice(1)}、阶分布 ${histText}`
}

/** 直接造一个 —— 只有唯一解才该用它（`evalDef` 与半直积 op 共用）。 */
export function buildSemidirectOnce(N: Group, H: Group): { group: Group } | { why: string; options?: PhiOption[] } {
  const plan = planSemidirect(N, H)
  if (plan.kind === 'ok') return { group: plan.group }
  if (plan.kind === 'trivial') return { group: plan.group }
  if (plan.kind === 'multi') return { why: `有 ${plan.options.length} 个本质不同的作用`, options: plan.options }
  return { why: plan.why }
}

/* ── 内半直积：作用由母群定死，没有歧义可挑（U51）──────────────── */

/*
 * ── 为什么内半直积要单独走一条路（2026-10-02，用户问"半直积什么时候接入画布"）
 *
 * `⋊` 记号的欠定性是**从记号层面**说的：`C_2^4 : S_3` 谁都定不下来 φ。
 * 但画布上的操作不是记号 —— 用户从那个 96 阶群 G 里挑出两个子群 N、H 时，
 * `⋊(N, H)` 指的**就是 G 自己**：作用 φ 是 G 内部的共轭，**存在且唯一**。
 * 实测真跑（`.tmp-u51/probe-*`）：`C_2^4 : S_3` 从记号读有 3 个本质不同的群，
 * 而同一个母群里挑出的 (N, H) 只有一个答案 —— 两条路给出的不是同一个问题。
 *
 * 判据一句话：**母群在场时，"选哪个作用"不是用户要做的决定，是 G 给的。**
 *
 * 三条纪律：
 *   ① **不在同一个母群里 → 不说话**（不是"不成立"，是"这条路不适用"），
 *      交给外半直积去枚举，别让用户以为自己哪里写错了；
 *   ② **在同一个母群里但不成立 → 说清是哪一条**（阶乘不出来 / 交不平凡 / 不正规），
 *      用户可以据此修正（比如对调两个参数）；
 *   ③ **判不出来 → 也不说话**（退外路径）。"不知道"不能报成"不成立"。
 */

export type InnerSemidirectPlan =
  | { kind: 'ok'; group: Group }
  /**
   * `why === null` = 这条路**不适用**（不在同一母群 / 判不了），调用方照常走外半直积；
   * `why` 非空 = **真的不成立**。
   *
   * ⚠️ `why` **必须短**：它会进 `sub` 副行（`.composer-status` 那个一行位置）。
   * 所以措辞里**不带群记号**（只用"两边 / 左边的群 / 母群"），也只用 ASCII。
   */
  | { kind: 'no'; why: string | null }

/**
 * `N ⊴ G`？**逐生成元共轭**（比 `gN` 与 `Ng` 这两个集合），`O(|生成元| x |N|)` 次乘法。
 *
 * 为什么不借 `relations.ts` 的 `normalKeys`：那条路是 `findAllNormalSubgroups`
 * （枚举 G 的**全部**子群，`|G| > 144` 直接不判）。这里只需要回答"**这一个** N
 * 正不正规"，共轭检验又便宜又任意阶都精确。
 *
 * 两者都是**精确判定**（不是启发式），所以不会出现"两处说法不一致"。
 *
 * 只查生成元为什么够：`S = { g : gN ⊆ Ng }` 是子群——`gN⊆Ng` 且 `hN⊆Nh`
 * ⇒ `ghN ⊆ gNh ⊆ Ngh`；又 `|gN| = |Ng|` ⇒ `gN ⊆ Ng` 就是 `gN = Ng`
 * ⇒ 反元素那一半自动成立。于是"生成元都在 S 里"就推出 `S = G`。
 */
function normalSubgroupOf(N: Group, G: Group): boolean | null {
  const gIds = new Set(G.elements.map((e) => e.id))
  if (!N.elements.every((e) => gIds.has(e.id))) return null
  const gens = G.generators.map((g) => getGeneratorElement(G, g)).filter((x): x is GroupElement => !!x)
  if (gens.length === 0) return N.order === 1
  for (const g of gens) {
    const gN = new Set(N.elements.map((n) => G.multiply(g, n).id))
    const Ng = new Set(N.elements.map((n) => G.multiply(n, g).id))
    if (gN.size !== Ng.size) return false
    for (const x of gN) if (!Ng.has(x)) return false
  }
  return true
}

/**
 * `N`、`H` 是不是**同一个母群里的两个真子群**，且 `N ⊴ G`、`N ∩ H = 1`、`|N||H| = |G|`
 * —— 三条都成立就是「内半直积」（等价于 `G = NH`，于是答案就是 G 自己）。
 */
export function planInnerSemidirect(N: Group, H: Group): InnerSemidirectPlan {
  const R = rootOf(N)
  // 各造各的群（`C_2` 与另一个 `C_2`）根本没有共同母群 —— 这条路不适用
  if (!sameGroup(R, rootOf(H))) return { kind: 'no', why: null }
  // 母群得**严格大于**两边；`N = R` 这种退化情形交给外路径（那里算得动）
  if (R.order <= N.order || R.order <= H.order) return { kind: 'no', why: null }
  // 「同一个世界」也可能是符号撞出来的 —— 元素 id 真的落在母群的表里才算（见 parents.ts）
  const rIds = new Set(R.elements.map((e) => e.id))
  if (!N.elements.every((e) => rIds.has(e.id)) || !H.elements.every((e) => rIds.has(e.id))) {
    return { kind: 'no', why: null }
  }

  if (N.order * H.order !== R.order) {
    return {
      kind: 'no',
      why: `|N| x |H| = ${N.order * H.order} 与母群的 ${R.order} 阶不等，乘不出整个母群`,
    }
  }
  const hIds = new Set(H.elements.map((e) => e.id))
  const inter = N.elements.filter((e) => hIds.has(e.id))
  if (inter.length > 1) {
    return { kind: 'no', why: `两边相交于 ${inter.length} 个元素，不是平凡交` }
  }
  const normal = normalSubgroupOf(N, R)
  if (normal === null) return { kind: 'no', why: null }
  if (!normal) {
    // 反过来成立时顺手指出 —— 省用户一次试错
    const flip = normalSubgroupOf(H, R) === true ? '；右边那个反过来正规，两个参数对调即可' : ''
    return { kind: 'no', why: `左边的群在母群里不正规${flip}` }
  }
  return { kind: 'ok', group: R }
}
