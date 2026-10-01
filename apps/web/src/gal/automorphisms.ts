import {
  elementOrder,
  elementOrderDistribution,
  findAllAutomorphisms,
  getGeneratorElement,
  type Automorphism,
  type Group,
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
 *   3. 两条线都取**实测还跑得动**的一侧：搜索放行到 600ms（A_5 的 280ms 是最贵的放行），
 *      建群放行到 200ms（C_3 x C_3 的 181ms 放行，C_4 x C_4 的 2.1s 拦下）。
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
 * 建群线：`|Aut|` 的预算。
 *
 * 48 = 实测放行的最大一档（`C_3 x C_3`，181ms）；再往上一档 96 就要 2.1s
 * （`C_4 x C_4`）——按键预览里 2 秒和死机没有区别，所以卡在 48。
 */
export const AUT_COUNT_CAP = 48

/** 两段的判定结果。`ok` 之外两种都是"没算"，报错语据此分别说清是哪一段拦的。 */
export type AutLookup =
  | { kind: 'ok'; auts: Automorphism[] }
  | { kind: 'searchTooBig'; combos: number }
  | { kind: 'overCap'; count: number }

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
 * 两关都过才真算：先按 `组合数 x 阶` 拦搜索，搜出来再看 `|Aut|` 拦建群。
 *
 * 返回 `auts` 而不是成品群，是为了把结果**交给 `createAutomorphismGroup(g, auts)`** ——
 * 那条路与不传第二参完全等价（core 里就是 `t ?? va(e)`），不会再搜一遍。
 *
 * `findAllAutomorphisms` 回空数组只有一种含义：**连恒等同构都搜没了**，也就是
 * 搜索被 core 自己的 30000 守卫拦下（群一定有恒等自同构）——所以归到 `searchTooBig`。
 */
export function lookupAutomorphisms(G: Group): AutLookup {
  const combos = autSearchCombinations(G)
  if (combos * G.order > AUT_SEARCH_BUDGET) return { kind: 'searchTooBig', combos }
  const auts = findAllAutomorphisms(G)
  if (auts.length === 0) return { kind: 'searchTooBig', combos }
  if (auts.length > AUT_COUNT_CAP) return { kind: 'overCap', count: auts.length }
  return { kind: 'ok', auts }
}
