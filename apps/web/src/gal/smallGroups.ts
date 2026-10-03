import {
  createCyclicGroup,
  createGroupFromSymbol,
  getAllSmallGroups,
  parseGroupNotation,
  type Group,
} from '@groupviz/core'
import { asciiSymbol } from './pretty'

/**
 * **小群表**（U55）—— 把引擎内嵌的 1–31 阶小群库接成可导入的对象。
 *
 * ## 为什么要这一层
 *
 * 用户原话（2026-10-03）：「学学 groupviz 怎么**导入常见群**」。
 *
 * 引擎里躺着 93 个群的**完整乘法表**（`SMALL_GROUP_DATA`，AUTO-GENERATED from
 * GAP 4.16 SmallGroups library，orders 1–31），每个群一条记录，形如
 * `{ n, i, structure, abelian, exponent, gens, table }`。可是在 Galculator 里
 * 这些群**一个都拿不到** —— `S_4` / `D_4` / `C_2^2` 这类常见群靠记号构造还好，
 * 而 `(C_4 x C_2):C_2`（16 阶）、`C_3:Q_8`（24 阶）这些**没有惯用记号、也没写
 * 构造器**的群，用户完全没有入口。更糟的是报错语里已经在承诺出路了：
 * `evalDef.ts` 与 `ops.ts` 都写着「改用 SmallGroup(n, i)」—— 而那时
 * `SmallGroup(16, 3)` 在界面上**根本不是个能敲的东西**。这一层把这个悬空承诺兑现。
 *
 * ## 编号是 GAP 的（1 起），不是引擎注册表的
 *
 * `SmallGroup(n, i)` 是 GAP / ATLAS 的通用记号：`SmallGroup(8,3) ≅ D_8`、
 * `SmallGroup(24,12) ≅ S_4`（依据 GAP 的 `NAMES_OF_SMALL_GROUPS`）。本层**照抄这个口径**，
 * 因为它要跟"用户从文献里抄下来的编号"对上。
 *
 * ⚠️ 但引擎的 `getAllSmallGroups()` **不是**这个口径：
 *
 * | 阶 | 引擎注册表怎么来的 | 编号 |
 * |---|---|---|
 * | 1–15 | 手写工厂表（`createCyclicGroup` / `createKleinFour` …），**顺序自定** | ≠ GAP |
 * | 16–31 | 直接映射 GAP 数据 `{ index: r.i - 1 }` | = GAP |
 *
 * 8 阶最典型：引擎是 `C_8, C_4×C_2, C_2³, D_4, Q_8`，GAP 是 `C_8, C_4×C_2, D_8, Q_8, C_2³`
 * —— 引擎的 index 2（`C_2³`）在 GAP 里是 `(8,5)`，而 GAP 的 `(8,3)` 是 `D_8`。
 * 于是 **`entry.index + 1` 只在 16 阶以上等于 GAP 编号**；1–15 阶要按 `GAP_INDEX_PERM` 校正。
 *
 * 这张校正表**手算**（依据 GAP `grpnames.g` 的 `NAMES_OF_SMALL_GROUPS`），
 * 并且**可执行地核对**（`verify/suites/u55.ts`：逐条把注册表条目与
 * `SmallGroup(order, 校正后编号)` 重建的群比 **元素阶分布 + 结构符号**）。手写数据
 * 只准由运行结果背书 —— 表里没有的阶一律按 `index + 1`（那些阶两边本来就同序）。
 *
 * ## 建群走 core 自己那条路（不是我们自己乘表）
 *
 * `planSmallGroup` 把 `SmallGroup(n, i)` 交给 `parseGroupNotation` → `createGroupFromSymbol`，
 * 也就是**用户在输入球里敲 `G = SmallGroup(8, 3)` 所走的那条路**（引擎 `groupFactory`
 * 认得这个记号，且为它专门回退到 GAP 数据重建，见那里的注释）。好处有两个：
 *
 *   - **两个入口同一结果**：手敲与点目录得到的是同一门 id 空间的群，可以直接互相比；
 *   - **不重造乘法表**：`Group.multiply`/`inverse` 由 core 给，我们一行置换数学都不写。
 *
 * 实测产物与手写记号**共享 id 空间**：`SmallGroup(8, 3)` 的元素 id 是 `r0…s3`，
 * 与 `D_4` 一模一样；`SmallGroup(24, 12)` 用置换串 id，与手写 `S_4` 一致。
 */

/** 小群表覆盖的阶（与引擎 `SMALL_GROUP_DATA` 的范围一致，写死在两处是故意的：越界要能报出来）。 */
export const SMALL_GROUP_MIN_ORDER = 1
export const SMALL_GROUP_MAX_ORDER = 31

/**
 * 引擎注册表下标（0 起） → GAP 编号（1 起）的**校正表**。
 *
 * 只列"引擎顺序 ≠ GAP 顺序"的阶；其余阶（含 16 阶以上）恒为 `index + 1`。
 * 数组的**第 j 项就是注册表 index j 对应的 GAP 编号**。
 *
 * | 阶 | 引擎注册表顺序 | GAP 顺序 |
 * |---|---|---|
 * | 6 | `C_6, S_3` | `S_3, C_6` |
 * | 8 | `C_8, C_4×C_2, C_2³, D_4, Q_8` | `C_8, C_4×C_2, D_8, Q_8, C_2³` |
 * | 10 | `C_10, D_5` | `D_10, C_10` |
 * | 12 | `C_12, C_6×C_2, D_6, A_4, C_3:C_4` | `C_3:C_4, C_12, A_4, D_12, C_6×C_2` |
 * | 14 | `C_14, D_7` | `D_14, C_14` |
 */
const GAP_INDEX_PERM: Record<number, number[]> = {
  6: [2, 1],
  8: [1, 2, 5, 3, 4],
  10: [2, 1],
  12: [2, 5, 4, 3, 1],
  14: [2, 1],
}

/** 16 阶以上引擎直接照抄 GAP 数据，编号天然一致 —— 这是那条分界线。 */
const GAP_ALIGNED_FROM = 16

/**
 * 引擎注册表条目 → GAP 编号。越界或该阶不在表里返回 `null`（**不猜**）。
 *
 * 消费者：`insights.ts` 的「识别」坐标（那个 `SmallGroup(阶, 编号)` 文本）与
 * op `smallGroup(n, i)` 共用同一口径 —— 界面**打印出来的坐标就是能敲的坐标**。
 */
export function gapNumberOf(order: number, registryIndex: number): number | null {
  if (order < SMALL_GROUP_MIN_ORDER || order > SMALL_GROUP_MAX_ORDER) return null
  if (!Number.isInteger(registryIndex) || registryIndex < 0) return null
  if (order >= GAP_ALIGNED_FROM) return registryIndex + 1
  const perm = GAP_INDEX_PERM[order]
  if (!perm) return registryIndex + 1
  return perm[registryIndex] ?? null
}

/** 某个阶在表里有几个群（不在表里返回 0）。 */
export function smallGroupCount(order: number): number {
  if (!Number.isInteger(order)) return 0
  return getAllSmallGroups().filter((e) => e.order === order).length
}

/** 建群计划。`error` 面向用户（纯文本面，不写 LaTeX），`hint` 给可照抄的出路。 */
export type SmallGroupPlan =
  | { ok: true; group: Group }
  | { ok: false; error: string; hint?: string }

/**
 * 按 GAP 编号取群。**唯一**的建群入口。
 *
 * 不复用 `smallGroupCount` 之外的任何缓存：`getAllSmallGroups()` 首次调用要
 * **311ms**（它给 93 个群跑一遍 `findAllSubgroups`/共轭类），此后 core 自己缓存，
 * 所以这里只查不建 —— 真正的构造只有 `parseGroupNotation` + `createGroupFromSymbol`，
 * 单车 0–3ms（实测 27 阶最慢）。
 */
export function planSmallGroup(order: number, i: number): SmallGroupPlan {
  if (!Number.isInteger(order) || !Number.isInteger(i)) {
    return { ok: false, error: 'smallGroup 的两个参数都必须是整数' }
  }
  if (order < SMALL_GROUP_MIN_ORDER || order > SMALL_GROUP_MAX_ORDER) {
    return {
      ok: false,
      error: `小群表只收 ${SMALL_GROUP_MIN_ORDER} 到 ${SMALL_GROUP_MAX_ORDER} 阶，${order} 阶不在表里`,
      hint: `表外的阶没有内嵌乘法表；${SMALL_GROUP_MIN_ORDER} 到 ${SMALL_GROUP_MAX_ORDER} 阶共 93 个群`,
    }
  }
  const count = smallGroupCount(order)
  if (i < 1 || i > count) {
    return {
      ok: false,
      error: `${order} 阶只有 ${count} 个群，编号 ${i} 越界`,
      hint: `编号从 1 数起（GAP 的 SmallGroup(${order}, 1) 到 SmallGroup(${order}, ${count})）`,
    }
  }
  /*
   * 1 阶：引擎把 `SmallGroup(1,1)` 归一到符号 `"1"`，而 `createGroupFromSymbol("1")`
   * 不认这个符号（实测返回 undefined）—— 平凡群是这条路上唯一的洞，就地补上。
   */
  if (order === 1) return { ok: true, group: createCyclicGroup(1) }
  const parsed = parseGroupNotation(`SmallGroup(${order}, ${i})`)
  const group = parsed.ok && parsed.symbol ? createGroupFromSymbol(parsed.symbol) : null
  if (!group) {
    return {
      ok: false,
      error: `SmallGroup(${order}, ${i}) 本地建不出来`,
      hint: '这是引擎内部条目，理论上都建得出；报这个说明 core 的解析表有洞',
    }
  }
  return { ok: true, group }
}

/** 目录条目（给界面列用）。`structure` 是**纯文本面**写法（`asciiSymbol`）。 */
export interface SmallGroupListEntry {
  /** GAP 编号（1 起）—— 就是 `smallGroup(n, i)` 的 `i` */
  i: number
  structure: string
}

export interface SmallGroupList {
  order: number
  count: number
  entries: SmallGroupListEntry[]
}

/**
 * 全部 93 群，按阶分组、组内按 GAP 编号排序。
 *
 * 给「群目录」用（U55 只把它做成数据面；可点的目录面板属 U8）。
 * `structure` 取注册表条目的符号 —— 两个**结构描述重名**的群在引擎里已被改名成
 * `SmallGroup(16,13)` / `SmallGroup(20,3)`，所以这里如实显示那个记号，
 * 而不是硬编一个"看起来更像结构描述"的串。
 */
export function smallGroupCatalog(): SmallGroupList[] {
  const byOrder = new Map<number, SmallGroupListEntry[]>()
  for (const e of getAllSmallGroups()) {
    const i = gapNumberOf(e.order, e.index)
    if (i === null) continue
    const list = byOrder.get(e.order) ?? []
    list.push({ i, structure: asciiSymbol(e.group.symbol) })
    byOrder.set(e.order, list)
  }
  return [...byOrder.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([order, entries]) => ({
      order,
      count: entries.length,
      entries: entries.sort((a, b) => a.i - b.i),
    }))
}
