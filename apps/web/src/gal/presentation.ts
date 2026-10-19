import {
  DISCOVERER_MAX_ORDER,
  PRESENTATION_MAX_ORDER,
  discoverPresentation,
  formatPresentation,
  presentationOf,
  type Group,
  type GroupPresentation,
} from '@groupviz/core'
import { isKnownGroup } from './known'

/**
 * 群的**表示** `<S | R>`（2026-10-19）。
 *
 * 用户原话：「为什么没看见群展示 `<S|R>`」——core 里这套能力一直是齐的
 * （`presentationOf` / `formatPresentation` / `parsePresentation` /
 * `buildGroupFromPresentation` / `discoverPresentation` + Todd-Coxeter），
 * 应用层此前**一行都没接**。于是界面上只看得见群的名字（`C_4` / `Import(4)`），
 * 看不到它是用哪些生成元、满足哪些关系定义的。
 *
 * ## 两条来源，优先级不同
 *
 * | 来源 | 谁算 | 成本 | 可信度 |
 * |---|---|---|---|
 * | **标准表示** | `presentationOf` 按族给（C / D / S / A / Q₈ / 直积 / 半直积…） | 微秒级 | 教科书写法，短、干净 |
 * | **反推表示** | `discoverPresentation`（Todd-Coxeter 搜索） | 实测 16 阶约 **1.7s**，且结果**未化简**（可上百条关系） | 只在标准表示没有时才用，且必须由用户**按需触发** |
 *
 * ⚠️ 反推**绝不能放进渲染路径**：一次 1.7s 会卡住整个工作台。UI 侧是"点按钮 → 转圈 →
 * setTimeout(0) 再算"（与「子群」标题行那条成本闸门同款）。
 *
 * ## 表示不是身份
 *
 * 同一个群有无数种表示，两个不同群也可能写出很像的关系。这条只用于**展示**：
 * 判断"是不是同一个群"走 `parents#sameGroup`（对拍乘法表），与本文件无关。
 */
export interface GroupPresentationView {
  source: 'standard' | 'discovered'
  /** 完整 `<S | R>` 的 TeX（已过 core 的 `formatPresentation`） */
  tex: string
  generators: string[]
  relators: string[]
}

const stdCache = new WeakMap<Group, GroupPresentationView | null>()
const discoCache = new WeakMap<Group, GroupPresentationView | null>()

function viewOf(p: GroupPresentation, source: GroupPresentationView['source']): GroupPresentationView {
  return {
    source,
    tex: formatPresentation(p.generators, p.relators),
    generators: [...p.generators],
    relators: [...p.relators],
  }
}

/** 为什么这一节给不出表示（`null` = 没被挡，只是需要反推或本来就没有）。 */
export function presentationBlockedReason(group: Group): string | null {
  if (isKnownGroup(group)) return '结论表里的群没有元素表，给不出生成元与关系。'
  if (group.order > PRESENTATION_MAX_ORDER) {
    return `阶 ${group.order} 超过表示上限 ${PRESENTATION_MAX_ORDER}，本地不构造表示。`
  }
  return null
}

/** 标准表示（短、教科书写法）。没有就 `null`，**不猜**。 */
export function standardPresentation(group: Group): GroupPresentationView | null {
  const hit = stdCache.get(group)
  if (hit !== undefined) return hit
  let out: GroupPresentationView | null = null
  if (!isKnownGroup(group) && group.order <= PRESENTATION_MAX_ORDER) {
    try {
      const p = presentationOf(group)
      if (p) out = viewOf(p, 'standard')
    } catch {
      out = null
    }
  }
  stdCache.set(group, out)
  return out
}

/** 反推表示能不能做（阶 ≤ `DISCOVERER_MAX_ORDER`；结论表里的群没有元素表，不做）。 */
export function canDiscoverPresentation(group: Group): boolean {
  return !isKnownGroup(group) && group.order <= DISCOVERER_MAX_ORDER
}

/**
 * **重活**：Todd-Coxeter 反推（按需调用，结果按群对象缓存）。
 *
 * 反推出来的关系**没有化简**——16 阶的群就可能给上百条。
 * 界面上超过 8 条只展示前 3 条 + 总数（见 `PresentationTab`），别把一堵墙塞进面板。
 */
export function discoverGroupPresentation(group: Group): GroupPresentationView | null {
  const hit = discoCache.get(group)
  if (hit !== undefined) return hit
  let out: GroupPresentationView | null = null
  if (canDiscoverPresentation(group)) {
    try {
      const p = discoverPresentation(group)
      if (p) out = viewOf(p, 'discovered')
    } catch {
      out = null
    }
  }
  discoCache.set(group, out)
  return out
}
