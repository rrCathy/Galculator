import {
  computeSubgroupSeries,
  findSemidirectDecompositions,
  isPerfect,
  isSimpleGroup,
  type Group,
} from '@groupviz/core'
import { prettySymbol } from './pretty'
import { isKnownGroup } from './known'

/**
 * 「结构」节（U27）—— 群的**结构事实**：合成列 / 导来列 / 半直积分解 / 完美。
 *
 * 这几件事在 core 里都有现成原语，但一直没接线（`docs/USABILITY.md` 缺口 ⑪、
 * `docs/TASKS.md` 缺口清单 ②–⑥）：用户能建出 `S_4`、能枚举子群、能看到"可解 = 是"，
 * 却始终没地方看到「因子是 `C_2·C_3·C_2·C_2`」「`S_4 ≅ A_4 ⋊ C_2`」这类
 * **课本上一定会写、老师一定会问**的事实。
 *
 * ## 为什么不放进结论层（`insights.ts`）
 *
 * 结论层是"一眼"级的（同构 / 第一同构定理，一条一行），而这里是**一节**（四行 + 附注）。
 * 更硬的约束是**成本**：结论层在对象被选中的瞬间计算，而半直积分解要枚举子群
 * （实测 A₅ 70ms、C₃³ 217ms、S₅ **3 秒**）—— 只有把节放在「基本」tab 里、
 * 并且**自己有阶上限**，才能既不卡住选中操作、又不假装算得完。
 *
 * ## 上限与缓存
 *
 * - `STRUCTURE_CAP = 60`：实测 60 阶（A₅）一次约 250ms、30 阶（D₁₅）26ms；
 *   120 阶（S₅）合成列要 2.2 秒 —— 所以上限取 60 而不是 core 的枚举线 144。
 * - 缓存 key 带**元素 id 指纹**：这是 U26 用真 bug 换来的纪律 ——
 *   记号与阶相同的两个群（记号建的 `C_2` vs 从 `C_4` 里摘出来的 2 阶子群）
 *   在"叫什么"上完全一样，只有元素 id 能区分"它们是谁"。
 */
export const STRUCTURE_CAP = 60

/** 一条已验证的分解（`G ≅ N ⋊ H`；作用平凡时就是直积 `N × H`）。 */
export interface Decomposition {
  kind: 'direct' | 'semidirect'
  /** 正规子群的记号（TeX） */
  normal: string
  /** 作用群的记号（TeX） */
  acting: string
  /** |N| —— 与 actingOrder 相乘必须等于 |G|（断言里核的就是这条） */
  normalOrder: number
  /** |H| */
  actingOrder: number
  /** 作用是否平凡（平凡 ⟹ 直积） */
  trivialAction: boolean
  /** 重建出来的记号（core 的 `rebuiltIsoSymbol`，与 G 同构类是这条候选"通过验证"的意思） */
  rebuilt: string
  /** 与展示的这条**同类**的其余已验证候选数 */
  otherVerified: number
}

export interface StructureFacts {
  /** G = [G, G]（完美群：没有非平凡交换商） */
  perfect: boolean
  /** 合成列（Jordan–Hölder）：因子多重集 + 条数 + 各项阶（降链） */
  composition: { factors: string[]; alternativeCount: number; termOrders: number[] } | null
  /** 导来列 G ⊇ G′ ⊇ …：各项阶（降链） */
  derived: { orders: number[]; reachesTrivial: boolean } | null
  /** 展示用的分解（直积优先——`×` 比 `⋊` 更该被先看到）；`null` = 没有已验证的非平凡分解 */
  decomposition: Decomposition | null
  /** 没有分解时的说明（单群 / 压根没有组合） */
  indecomposableReason: string | null
}

const cache = new Map<string, StructureFacts | null>()

/** 群指纹：记号 + 阶 + 元素 id 列表（U26：key 必须决定"是谁"，不是"叫什么"）。 */
function fingerprint(group: Group): string {
  return `${group.symbol}#${group.order}#${group.elements.map((e) => e.id).join(',')}`
}

/** φ 是否恒为恒等自同构（是 ⟹ 这个分解其实是直积）。 */
function isTrivialAction(phiMap: { map: Map<string, string> }[]): boolean {
  return phiMap.every((auto) => [...auto.map.entries()].every(([from, to]) => from === to))
}

function compute(group: Group): StructureFacts {
  const comp = computeSubgroupSeries(group, 'composition')
  const der = computeSubgroupSeries(group, 'derived')
  const candidates = findSemidirectDecompositions(group).filter((c) => c.verified)

  // 直积优先：有"作用平凡"的已验证分解时先展示它（`D_6 ≅ D_3 × C_2` 比
  // `D_6 ≅ C_6 ⋊ C_2` 更贴用户想问的那个问题）。两条都没有才说"不可分解"。
  const trivial = candidates.find((c) => isTrivialAction([...c.phiMap.values()]))
  const chosen = trivial ?? candidates[0] ?? null

  let decomposition: Decomposition | null = null
  let indecomposableReason: string | null = null
  if (chosen) {
    const isDirect = isTrivialAction([...chosen.phiMap.values()])
    const sameKind = candidates.filter(
      (c) => isTrivialAction([...c.phiMap.values()]) === isDirect,
    ).length
    decomposition = {
      kind: isDirect ? 'direct' : 'semidirect',
      normal: chosen.normal.symbol,
      acting: chosen.acting.symbol,
      normalOrder: chosen.normal.order,
      actingOrder: chosen.acting.order,
      trivialAction: isDirect,
      rebuilt: chosen.rebuiltIsoSymbol ?? chosen.normal.symbol,
      otherVerified: sameKind - 1,
    }
  } else if (group.order > 1) {
    indecomposableReason = isSimpleGroup(group)
      ? '单群：没有非平凡正规子群，不可能是（真）半直积'
      : '没有（已验证的）非平凡分解：找不到「正规子群 N + 补子群 H」的组合'
  }

  return {
    perfect: isPerfect(group),
    composition: comp
      ? {
          factors: comp.factors.map((f) => f.label),
          alternativeCount: comp.alternativeCount,
          termOrders: comp.terms.map((t) => t.length),
        }
      : null,
    derived: der ? { orders: der.terms.map((t) => t.length), reachesTrivial: der.reachesTrivial } : null,
    decomposition,
    indecomposableReason,
  }
}

/**
 * 结构事实（超限或计算失败返回 `null` —— 面板据此显示"为什么没算"，
 * **不猜**：算不出来就说算不出来，别给半截答案）。
 */
export function structureFacts(group: Group): StructureFacts | null {
  // 「已知群」没有元素表（U48）—— 合成列 / 半直积分解全都要遍历元素，直接说没算
  if (isKnownGroup(group)) return null
  if (group.order > STRUCTURE_CAP) return null
  const key = fingerprint(group)
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  let out: StructureFacts | null = null
  try {
    out = compute(group)
  } catch {
    out = null
  }
  cache.set(key, out)
  return out
}

/**
 * 合成列因子的文本形态（`C_2 \cdot C_3 \cdot C_2 \cdot C_2`）。
 *
 * 分隔符用 `\cdot` 而**不是**中文间隔号 —— 一是这里的"乘"就是字面意思
 * （各因子的阶相乘 = |G|），二是 `data-*` 属性会过 U25 那条"全 ASCII"走查
 *（`verify/e2e/no-unicode-leak.mjs` 连 data-* 一起扫）。
 */
export function factorsText(factors: string[]): string {
  return factors.map((f) => prettySymbol(f)).join(' \\cdot ')
}

/** 降链的文本形态（`24 > 12 > 4 > 1`）。 */
export function chainText(orders: number[]): string {
  return orders.join(' > ')
}
