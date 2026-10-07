import type { GalObject } from './types'
import type { GalValue } from './value'
import { identifyGroup } from './insights'
import type { Group } from '@groupviz/core'

/**
 * **对象的数学标签**（工作台 v2，2026-10-06）—— 显示条上那个大标题该写什么。
 *
 * ## 为什么要有这一层
 *
 * 用户实测原话：
 *
 * > 「smallgroup(12,3)？你就这么突出信息？不是 A4？」
 * > 「map(B,D,a→0,b→1)？你就这么表示群同态？你在逗我吗，为什么不用 φ:A₄→C₃？」
 *
 * 病根：显示条拿 `obj.def`（**构造式**：`smallGroup(12, 3)` / `map(B, D, a→0, b→1)`）
 * 当标题。可 `def` 是"**它怎么被造出来的**"（要能原样贴回输入框），
 * **不是"它是什么"**。数学上这个群就是 `A₄`，这个映射就是 `φ: A₄ → C₃`。
 *
 * ⇒ 标题＝**数学身份**，`def` 降为副行。两者分工：
 *
 * | | 是什么 | 长什么样 | 给谁看 |
 * |---|---|---|---|
 * | `main` | **它是什么**（数学身份）| `A₄` · `φ: A₄ → C₃` | 想读懂的人 |
 * | `sub` | **它怎么来的**（定义）| `B = smallGroup(12, 3)` | 想改它的人 |
 *
 * ⚠️ 识别用的是 `insights#identifyGroup`（**与信息面板那一句"识别 A₄"同源一份**），
 * 不新写一套。识别不出来（超出小群库范围）就**不猜** —— 退回对象自己的符号。
 *
 * ⚠️ 返回的是**展示串**（可能带 `_` `\` `→`），渲染方按面选工具：
 * `<TexOrText>`（混排面）或 `plainSymbol`（纯文本面）。**别在这里拼 HTML。**
 */
export interface MathLabel {
  /** 主标题（数学身份，展示串） */
  main: string
  /** 副行（定义；与主标题相同时给空串） */
  sub: string
}

/**
 * 一个**群**的数学名：优先用识别结果，识别不出退回它自己的符号。
 *
 * 识别结果与人写的符号是**两回事**：`smallGroup(12, 3)` 的 `symbol` 可能是
 * `SmallGroup(12, 3)` 这类坐标式的串，而识别会给 `A_4` —— 后者才是人认的名字。
 */
export function groupName(g: Group): string {
  return identifyGroup(g) ?? g.symbol
}

/** 这个值的数学身份（认不出返回 `null`，由调用方退回 `obj.label`）。 */
function valueName(v: GalValue): string | null {
  switch (v.type) {
    case 'group':
      return groupName(v.group)
    case 'map':
      // 映射读作「φ: 定义域 → 陪域」——两端各用**它们自己的数学名**
      return `${groupName(v.map.domain)} → ${groupName(v.map.codomain)}`
    case 'action':
      // 作用读作「G ↷ Ω」——Ω 用它的标号（`omega.label` 就是它）
      return `${groupName(v.action.group)} ↷ ${v.action.omega?.label ?? 'Ω'}`
    default:
      return null
  }
}

/**
 * 给一个对象做数学标签。
 *
 * | 值类型 | `main` | 为什么 |
 * |---|---|---|
 * | 群 | `A₄`（识别）| 用户点名的就是这句 |
 * | 映射 | `φ: A₄ → C₃` | 用户点名的第二句 |
 * | 作用 | `S₄ ↷ Ω` | 同一个道理：把操作语读成关系 |
 * | 结构 / 集合 / 其它 | `obj.label`（构造时给的记号）| 没有"标准名"可识别，不硬造 |
 */
export function mathLabel(obj: GalObject): MathLabel {
  const name = valueName(obj.value)
  if (!name) return { main: obj.label, sub: defLine(obj) }
  // 映射/作用这类"关系型"的值，主标题里要带上**它自己的名字**（φ / A），
  // 否则 `A₄ → C₃` 只说了两端，没说这条箭头叫什么。
  const relational = obj.value.type === 'map' || obj.value.type === 'action'
  const main = relational ? `${obj.id}: ${name}` : name
  return { main, sub: defLine(obj) }
}

/** 副行：`名字 = 定义`；两者恰好重复时给空串（别写两遍一样的东西）。 */
function defLine(obj: GalObject): string {
  if (obj.def === obj.id || obj.def === obj.label) return ''
  return `${obj.id} = ${obj.def}`
}
