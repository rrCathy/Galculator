import type { Group } from '@groupviz/core'
import type { GalObject } from './types'

/**
 * 一个**群对象**的内容摘要（符号 + 阶 + 元素 id）。
 *
 * ## ⚠️ 它不是身份键（2026-10-19 起）
 *
 * 曾经它被当作**缓存键**用在包含判定 / 同构识别 / 正规子群表上，于是撞出真事故：
 * 两张同标号不同表的群（结构面板手写的 `Import(4)` C₄ 表与 V₄ 表 —— 符号都是
 * `Import(4)`、阶都是 4、元素 id 都是 `g0…g3`）**摘要完全相同**，
 * 识别结果与正规子群表互相污染：V₄ 被认成 C₄、同构判定说它们同构、
 * 包含判定说"元素完全相同，就是同一个群"。
 *
 * 现在缓存一律按**群对象**（WeakMap：`insights.isoCache` / `relations` 的两处 /
 * `structure`），这条只留作内容摘要（走查断言用）。
 * **判断"是不是同一个群"走 `parents.sameGroup`** —— 它会真的对拍乘法表。
 *
 * ## 为什么连符号一起算
 *
 * 两个 `C_2` —— 一个从记号建（`e0 e1`）、一个从 `C_4` 里摘出来（`e0 e2`）——
 * 阶一样但内容不同，光看阶会串（2026-09-28，缺口 ⑧ 逼出来的真 bug）。
 *
 * ## 为什么它仍不够
 *
 * **乘法表不在里面**。摘要相同只说明"名字与编号一样"，不说明"群一样"。
 */
/**
 * `WeakMap` 记一层：`identifyGroup` 在**渲染路径**上被反复调用（信息面板 / `isomorphismOf`），
 * 而算一次指纹要 join 全部元素 id（O(|G|)）——对 S₆（720 元）不划算。core 的 `Group` 不可变，可安全缓存。
 */
const fingerprintCache = new WeakMap<Group, string>()

export function groupFingerprint(g: Group): string {
  const hit = fingerprintCache.get(g)
  if (hit !== undefined) return hit
  const s = `${g.symbol}#${g.order}#${g.elements.map((e) => e.id).join(',')}`
  fingerprintCache.set(g, s)
  return s
}

/**
 * 画布上「这个对象是不是已经有了」的判据（缺口 ⑯）。
 *
 * ## 用户撞上的那个坑
 *
 * "我手动创建的 `im(\phi)` 和我点 φ 的悬浮球创建的 `im` 居然不是同一对象？"
 * —— 从前的判据是**两行定义文本逐字相等**（`def` + `label`）。可同一个数学对象
 * 有很多种写出来的方式：别名（`像` / `im`）、空格、复合写法（`quotient(A, K)` 与 `A / K`），
 * 差一个字符就分成两份，画布上于是长出两个一模一样的节点。
 *
 * 这一层换成**两条判据，按强度排**：
 *
 *   ① **同一次推导**（最强）：`callKey` 相同 —— 命中的操作一样、实参对象一样。
 *      它由 `evalDef` 统一给出，所以"点出来的"与"打出来的"指纹同源。
 *   ② **同一行定义文本**（旧判据，兜底）：`def` 与 `label` 都逐字相同。
 *
 * ## 为什么不用"值相等"当判据
 *
 * `G = C_6` 与 `H = C_6` 是**两个**对象（课本例题里它们正是一个映射的定义域与靶群），
 * 按值合并会把例题都改坏。身份的正确粒度是"**同一次推导**"，
 * 不是"同构"——后者是一条**关系**（缺口 ⑰），不是同一性。
 */
export function findExistingObject(
  objects: readonly GalObject[],
  incoming: { callKey?: string; def: string; label: string },
): GalObject | null {
  if (incoming.callKey) {
    const hit = objects.find((o) => o.callKey === incoming.callKey)
    if (hit) return hit
  }
  return objects.find((o) => o.def === incoming.def && o.label === incoming.label) ?? null
}
