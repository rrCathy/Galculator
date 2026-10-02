import {
  elementOrder,
  elementOrderDistribution,
  findAllAutomorphisms,
  getGeneratorElement,
  type Automorphism,
  type Generator,
  type Group,
  type GroupElement,
} from '@groupviz/core'

/**
 * `Aut(G)` 的**本地预算**（2026-10-01，用户输入 `Aut(S_6)` 把页面卡死）。
 *
 * core 的 `createAutomorphismGroup` 分两段，代价差着数量级，所以守卫也得分两段：
 *
 * | 段 | 干什么 | 代价 | 实测 |
 * |---|---|---|---|
 * | 搜索 | `findAllAutomorphisms`：按生成元的同阶元素做 DFS，每个候选验一次同态 | ≈ 组合数 x 阶 x 0.02ms | 6 个点拟合，误差 2 倍内 |
 * | 建群 | `createAutomorphismGroup`：挑生成元 + 判交换 + 识别结构 | 随 **`|Aut|`** 陡涨 | 48 → 181ms / 96 → 2.1s / 120 → 21s |
 *
 * 实测（node 22，本机，单个进程内计时）：
 *
 * | G | 阶 | 组合数 | `|Aut|` | 搜索 | 建成 |
 * |---|---|---|---|---|---|
 * | C_6 | 6 | 2 | 2 | 8ms | 1ms |
 * | Q_8 | 8 | 36 | 24 | 9ms | 20ms |
 * | S_4 | 24 | 54 | 24 | 18ms | 34ms |
 * | D_8 | 16 | 36 | 32 | 11ms | 61ms |
 * | C_3 x C_3 | 9 | 4 | 48 | 11ms | 181ms |
 * | C_4 x C_4 | 16 | 144 | 96 | 25ms | 2.1s |
 * | A_5 | 60 | 360 | 120 | 280ms | 21s |
 * | C_2^3 | 8 | 343 | 168 | 26ms | 60s 都没完 |
 * | S_5 | 120 | 600 | 120 | 1.9s | 40s 都没完 |
 * | C_3^3 | 27 | 17576 | 11232 | 9.6s | |
 * | S_6 | 720 | 18000 | 1440（课本值，本地搜不出来） | 240s 都没完 | |
 *
 * 三条判据：
 *   1. **自变量是 `|Aut|` 不是 `|G|`** —— `C_2^3` 只有 8 阶，`|Aut| = 168`，照样死机；
 *      "阶小就没事"在这里是错的。
 *   2. 组合数的算法与 core `guards.ts#AUTOMORPHISM_MAX_COMBINATIONS = 30000` 同一条公式，
 *      但 core 只看组合数、不看阶 —— `S_6` 的 18000 组正好从 30000 下面钻过去（正是本次事故）。
 *      应用层补上"乘阶"，`S_6` 才拦得住。
 *   3. 搜索线取**实测还跑得动**的一侧：放行到 600ms（`A_5` 的 280ms 是最贵的放行）。
 *      ~~建群线 48~~ —— **U50 撤了**，见下。
 *
 * ⚠️ U50 更正（2026-10-02）。上表「建成」那一列是 **core** 的账：它慢在 `multiply`
 * 是"复合完再在 |Aut| 条 map 里线性搜一遍"（`index.js:46326`），每次乘法 O(|Aut| x |G|)。
 * **贵的是这个实现，不是"建群"这件事**。给每张 map 算个签名、建成哈希表之后：
 *
 * | 群 | |Aut| | core 建群 | 哈希乘法（`buildAutomorphismGroup`） |
 * |---|---|---|---|
 * | C_3 x C_3 | 48 | 181ms | 5ms |
 * | C_4 x C_4 | 96 | **2323ms** | **13ms** |
 * | A_5（60 阶） | 120 | 21000ms | 106ms |
 * | C_2^3 | 168 | **60s 没完** | 33ms |
 *
 * 后果是实打实的：用户敲 `AUT(C4^2)` 得到「有 96 个自同构，本地建不出这个群，
 * 建群线 48，待后端 GAP 通道」（**旧 UI 文案，U50 已改**）—— 96 个自同构**早就搜出来了**
 * （30ms），差的只是把它们包成群的 1ms。用户原话：「难道 desmos 算一些微积分还要跑去接入
 * matlab/sagemath 吗」。
 * **判据：报"建不出/算不了"之前，先量清到底是哪一步贵。**
 *
 * 为什么必须**在调用前**拦、不能靠"算完再判超时"：求值是按键预览触发的**同步**调用
 * （`ComposerOrb` 的 `useMemo`），一旦进去就没有 JS 能插话的地方 —— 只能提前判。
 */

/**
 * 搜索线：`组合数 x 阶` 的预算。
 *
 * 30000 来自实测最贵的一次放行（A_5：360 x 60 = 21600 → 280ms）。按拟合的
 * 0.02ms/单位算，30000 的上界约 600ms ——预览里按键触发还是嫌慢，但这条线只在
 * "能搜出来、后面还能给用户一个数"时才走，比直接说"算不了"值。
 */
export const AUT_SEARCH_BUDGET = 30_000

/**
 * 建群预算：`|Aut|^2 x |G|`。
 *
 * 「建群」这一段被 U47 误判过一次：当时看到 `|Aut| = 96` 要 2.1s，就以为
 * "建群这件事本身就贵"，于是划了条 `|Aut| <= 48`。**贵的是 core 的实现，不是问题**
 * —— 换成哈希乘法（见 `buildAutomorphismGroup`）后 96 阶只要 13ms（快 178 倍）。
 *
 * 真正要花的代价是两件同量级的事：**求逆与全表闭包的自校验**（`|Aut|^2` 次查表）
 * 与**贪心挑生成元**（每轮评估全部候选）。实测（本机 node 22，含自校验）：
 *
 * | 群 | \|Aut\| | 代价 | 实测 |
 * |---|---|---|---|
 * | C_3 x C_3 | 48 | 20,736 | 5ms |
 * | C_4 x C_4 | 96 | 147,456 | 13ms |
 * | C_2^3 | 168 | 225,792 | 33ms |
 * | A_5（60 阶） | 120 | 864,000 | 106ms |
 *
 * 即 1 单位 ≈ 120ns。**线取 100 万（≈120ms）**：最贵的一次实测放行就是 `A_5`
 * 的 864k（106ms），再往上没有实测锚点，而按键预览是同步求值 —— 超过这条线宁可说清。
 */
export const AUT_BUILD_BUDGET = 1_000_000

/** 建群的代价估计 —— 调用方拿它跟 `AUT_BUILD_BUDGET` 比，**在调用前**。 */
export function autBuildCost(count: number, groupOrder: number): number {
  return count * count * groupOrder
}

/** 搜索段的判定结果。`ok` 之外只有一种"没算"，报错语据此说清是哪一段拦的。 */
export type AutLookup =
  | { kind: 'ok'; auts: Automorphism[] }
  | { kind: 'searchTooBig'; combos: number }

/**
 * 候选组合数 —— core `findAllAutomorphisms` 内部那条公式的重写：
 * 每个生成元的候选 = 与它同阶的元素个数（阶 1 只有它自己），连乘。
 *
 * 与 core 同源（core 用 `group.elements.filter(同阶)`，这里用 `elementOrderDistribution`
 * 的直方图，结果一样快得多）。core 自己的 30000 守卫也用这个量。
 */
export function autSearchCombinations(G: Group): number {
  const hist = elementOrderDistribution(G)
  let combos = 1
  for (const gen of G.generators) {
    const el = getGeneratorElement(G, gen)
    if (!el) continue
    combos *= hist.get(elementOrder(G, el)) ?? 1
  }
  return combos
}

/**
 * 搜索一段真算：按 `组合数 x 阶` 拦下太贵的那一档（`S_6` 的 18000 x 720）。
 *
 * 返回 `auts` 而不是成品群，是为了把结果交给 `buildAutomorphismGroup` ——
 * 这条路的搜索与 core 完全一样（就是 `findAllAutomorphisms`），省掉的只是建群。
 *
 * `findAllAutomorphisms` 回空数组只有一种含义：**连恒等同构都搜没了**，也就是
 * 搜索被 core 自己的 30000 守卫拦下（群一定有恒等自同构）——所以归到 `searchTooBig`。
 */
export function lookupAutomorphisms(G: Group): AutLookup {
  const combos = autSearchCombinations(G)
  if (combos * G.order > AUT_SEARCH_BUDGET) return { kind: 'searchTooBig', combos }
  const auts = findAllAutomorphisms(G)
  if (auts.length === 0) return { kind: 'searchTooBig', combos }
  return { kind: 'ok', auts }
}

// ── 建群：哈希乘法 ──────────────────────────────────────────────────

/** 生成元配色 —— 与 core `xa` 的循环取色同一族（画布上的箭头靠它区分）。 */
const GEN_COLORS = ['#4ea1ff', '#ff6b6b', '#34d399', '#fbbf24', '#a78bfa', '#f472b6']

/**
 * 把搜出来的一堆自同构**包成一个群**（U50）。
 *
 * 与 core `createAutomorphismGroup` 的三处差别：
 *   ① **乘法查表**：给每张 map 算签名（`G` 的元素 id 按序取像、拼成串），建成
 *      `签名 -> 下标` 的哈希表 —— core 是"复合完再在 n 条 map 里线性搜一遍"。
 *   ② **先验后建**：全表闭包与求逆都落得回这堆自同构里，才动手；否则返回 `null`。
 *      不猜（U49 同一条纪律：挑错了后果不是崩，是面板上给出一个**假群**）。
 *   ③ 元素按"恒等排第一"重编号，与 core 的 `s` 数组同形；id 仍用 core 的 `auto-k`。
 *
 * 一行数学没抄 —— `Aut(G)` 的乘法**就是映射复合**，这是定义。
 */
export function buildAutomorphismGroup(G: Group, auts: readonly Automorphism[]): Group | null {
  const n = auts.length
  if (n === 0) return null

  const ids = G.elements.map((e) => e.id)
  const sigOf = (map: ReadonlyMap<string, string>): string => ids.map((id) => map.get(id) ?? '').join('|')

  // ① 签名索引。两张 map 签名一样 = 同一个自同构出现两次（core 已去重）⇒ 异常，不建。
  const bySig = new Map<string, number>()
  auts.forEach((a, i) => bySig.set(sigOf(a.map), i))
  if (bySig.size !== n) return null

  const identityIdx = auts.findIndex((a) => ids.every((id) => a.map.get(id) === id))
  if (identityIdx < 0) return null

  // 复合：(f o g)(x) = f(g(x))
  const rawMul = (i: number, j: number): number | undefined => {
    const mi = auts[i].map
    const mj = auts[j].map
    return bySig.get(ids.map((id) => mi.get(mj.get(id) ?? '') ?? '').join('|'))
  }
  const rawInv = (i: number): number | undefined => {
    const invMap = new Map<string, string>()
    for (const [k, v] of auts[i].map) invMap.set(v, k)
    return bySig.get(ids.map((id) => invMap.get(id) ?? '').join('|'))
  }

  // ② 全表闭包自校验 —— 这一步就是 `|Aut|^2 x |G|` 的主要开销
  for (let i = 0; i < n; i++) {
    if (rawInv(i) === undefined) return null
    for (let j = 0; j < n; j++) if (rawMul(i, j) === undefined) return null
  }

  // ③ 重编号：恒等排第一，其余保持搜索原序
  const order: number[] = [identityIdx, ...auts.map((_, i) => i).filter((i) => i !== identityIdx)]
  const posOf = new Array<number>(n)
  order.forEach((src, pos) => (posOf[src] = pos))
  const mul = (i: number, j: number): number => posOf[rawMul(order[i], order[j]) as number] ?? 0
  const inv = (i: number): number => posOf[rawInv(order[i]) as number] ?? 0

  // ④ 贪心挑生成元（与 core `xa` 同一条启发式：每轮选"能把已覆盖集合扩得最大"的）
  const closeOf = (seeds: readonly number[], gens: readonly number[]): Set<number> => {
    const seen = new Set(seeds)
    const stack = [...seeds]
    while (stack.length > 0) {
      const x = stack.pop() as number
      for (const g of gens) {
        const y = mul(x, g)
        if (!seen.has(y)) {
          seen.add(y)
          stack.push(y)
        }
      }
    }
    return seen
  }

  const gens: number[] = []
  let covered = new Set<number>([0])
  const remaining = new Set<number>(Array.from({ length: n }, (_, i) => i).filter((i) => i !== 0))
  while (covered.size < n && remaining.size > 0) {
    let best = -1
    let bestSize = covered.size
    for (const cand of remaining) {
      const size = closeOf([...covered, cand], [...gens, cand]).size
      if (size > bestSize) {
        bestSize = size
        best = cand
      }
    }
    if (best < 0) break
    gens.push(best)
    covered = closeOf([...covered], gens)
    for (const c of covered) remaining.delete(c)
  }
  // 生成元生成不出整堆 —— 不建（core 这条路会静默给出一个缺元素的群）
  if (covered.size !== n) return null

  const elements: GroupElement[] = order.map((src, pos) => ({
    id: auts[src].id,
    label: pos === 0 ? '\\mathrm{id}' : pos >= 10 ? `\\alpha_{${pos}}` : `\\alpha_${pos}`,
    value: [pos],
  }))

  const generators: Generator[] = gens.map((g, k) => {
    const color = GEN_COLORS[k % GEN_COLORS.length]
    const forward: Generator = {
      name: elements[g].label,
      symbol: elements[g].label,
      color,
      apply: (e) => elements[mul(e.value[0], g)],
      inverse: undefined as unknown as Generator,
    }
    forward.inverse = {
      name: `${elements[g].label}^{-1}`,
      symbol: `${elements[g].label}^{-1}`,
      color,
      apply: (e) => elements[mul(e.value[0], inv(g))],
      inverse: forward,
    }
    return forward
  })

  let isAbelian = true
  for (let i = 0; i < n && isAbelian; i++) {
    for (let j = i + 1; j < n; j++) {
      if (mul(i, j) !== mul(j, i)) {
        isAbelian = false
        break
      }
    }
  }

  return {
    name: `Automorphism Group Aut(${G.symbol})`,
    symbol: `\\operatorname{Aut}(${G.symbol})`,
    order: n,
    elements,
    generators,
    multiply: (x, y) => elements[mul(x.value[0], y.value[0])],
    inverse: (x) => elements[inv(x.value[0])],
    identity: elements[0],
    isAbelian,
    automorphismParentSymbol: G.symbol,
  }
}
