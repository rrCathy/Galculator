/**
 * 群身份：**同标号不同表**不许撞车（2026-10-19）。
 *
 * ## 用户撞上的那个坑
 *
 * 结构面板手写两张 4 阶乘法表（一张 C₄、一张 V₄），标号都是 1、2、3、4。
 * core 的 `createGroupFromImport` 给任何导入群的元素一律起 `g0…g(n-1)`、符号一律
 * `Import(n)` —— 于是两边指纹完全相同，判定链一路放行：
 *
 *   · `sameGroup` 说"同一个群"（只比符号 + 阶 + 元素 id）
 *   · `identifyGroup` 的缓存串号 ⇒ V₄ 被认成 C₄
 *   · `isomorphismOf` ⇒ 说它们同构
 *   · `contains` ⇒ 说"元素完全相同，就是同一个群"
 *
 * 真值只有**乘法表**。修法三条（详见各源码注释）：
 *   ① `sameGroup` 前三关（引用 / 符号阶 / 元素 id）全过后**对拍乘法表**
 *   ② 三处缓存（识别 / 正规子群 / 包含）从字符串指纹改成按群对象的 WeakMap
 *   ③ `literalContainment` 加跨世界门（陪集层豁免，第三同构不受影响）
 *
 * ## 期望值
 *
 * 全是对照数学事实手写的：C₄ 有 4 阶元、V₄ 除单位元外全是 2 阶 ⇒ 两者不同构。
 * 小群表 16 阶的 `(16,3)` 与 `(16,4)` 是**不同的群**，同阶谁也不包含谁。
 */
import { createGroupFromImport } from '@groupviz/core'
import { build, eq, ok, suite } from '../harness'
import { containment } from '../../src/gal/relations'
import { idsComparable, sameGroup } from '../../src/gal/parents'
import { identifyGroup, isomorphismOf } from '../../src/gal/insights'
import { planSmallGroup, smallGroupCount } from '../../src/gal/smallGroups'

const C4_TABLE = [
  [1, 2, 3, 4],
  [2, 3, 4, 1],
  [3, 4, 1, 2],
  [4, 1, 2, 3],
]
const V4_TABLE = [
  [1, 2, 3, 4],
  [2, 1, 4, 3],
  [3, 4, 1, 2],
  [4, 3, 2, 1],
]

/** 两张同标号的表（标号都是 1…4，正是用户手写结构的产物）。 */
function importTable(table: number[][], gens: number[]) {
  return createGroupFromImport({
    gap_expr: '',
    order: table.length,
    table,
    gens,
    idents: ['1', '2', '3', '4'],
    structure: '',
  } as any)
}

export function run(): void {
  suite('群身份 · 同标号不同表（2026-10-19）')

  const c4a = importTable(C4_TABLE, [2])
  const c4b = importTable(C4_TABLE, [2])
  const v4 = importTable(V4_TABLE, [2, 3])

  // ── ① 同一张表的两份拷贝：仍是同一个群（免检路径不能被误杀）
  ok('两张 C₄ 表：sameGroup = true', sameGroup(c4a, c4b))
  ok('两张 C₄ 表：idsComparable = true', idsComparable(c4a, c4b))
  eq('两张 C₄ 表：containment 的指数 = 1', containment(c4a, c4b)?.index ?? -1, 1)

  // ── ② 同标号、不同表：必须是两个群
  ok('C₄ 表 vs V₄ 表：sameGroup = false', !sameGroup(c4a, v4))
  ok('C₄ 表 vs V₄ 表：idsComparable = false', !idsComparable(c4a, v4))
  ok('C₄ 表 vs V₄ 表：containment = null', containment(c4a, v4) === null)
  ok('C₄ 表 vs V₄ 表：containment 反向同样 null', containment(v4, c4a) === null)

  // ── ③ 识别与同构：不能被缓存串号
  eq('identify(C₄ 表) = C_4', identifyGroup(c4a), 'C_{4}')
  eq('identify(V₄ 表) = C_2 × C_2（V₄ 的标准同构类）', identifyGroup(v4), 'C_{2}\\times C_{2}')
  eq('isomorphismOf(C₄ 表, V₄ 表) = no', isomorphismOf(c4a, v4), 'no')
  eq('isomorphismOf(V₄ 表, C₄ 表) = no（对称）', isomorphismOf(v4, c4a), 'no')

  // ── ④ 用户可见的报错语
  const b1 = build(['A = SmallGroup(16, 3)', 'B = SmallGroup(16, 4)', 'R = contains(A, B)'])
  ok('contains(SmallGroup(16,3), SmallGroup(16,4)) 停下', b1.line('R')?.ok === false)
  ok(
    '理由：同阶但不是同一个群',
    (b1.line('R')?.error ?? '').includes('同阶，但不是同一个群'),
    b1.line('R')?.error,
  )
  ok(
    '不再说"元素完全相同，就是同一个群"',
    !(b1.line('R')?.error ?? '').includes('元素完全相同'),
    b1.line('R')?.error,
  )

  // ── ⑤ 全表扫描：小群表里同阶异符号的群，一对都不许判成 index = 1
  const built: { n: number; i: number; g: any }[] = []
  for (let n = 1; n <= 31; n++) {
    const c = smallGroupCount(n)
    for (let i = 1; i <= c; i++) {
      const p = planSmallGroup(n, i)
      if (p.ok) built.push({ n, i, g: p.group })
    }
  }
  let pairs = 0
  let bad = 0
  for (let a = 0; a < built.length; a++) {
    for (let b = a + 1; b < built.length; b++) {
      const A = built[a]
      const B = built[b]
      if (A.n !== B.n || A.g.symbol === B.g.symbol) continue
      pairs++
      const c = containment(A.g, B.g)
      if (c && c.index === 1) bad++
    }
  }
  eq('小群表同阶异符号的对数 = 267（改前同）', pairs, 267)
  eq('其中被判"同一个群"的 = 0（改前 27）', bad, 0)

  // ── ⑥ 门不能误杀：真包含与第三同构照旧
  const b2 = build(['A = C_3', 'B = C_6', 'R = contains(A, B)'])
  ok('contains(C_3, C_6) 仍成立（C₆ 唯一的 3 阶子群）', b2.line('R')?.ok === true, b2.line('R')?.error)
  eq('  指数 = 2', ((b2.byId('R')?.value as any)?.relation?.index ?? -1), 2)

  const b3 = build(['A = A_4', 'B = S_4', 'R = contains(A, B)'])
  ok('contains(A_4, S_4) 仍成立（独立构造的置换群）', b3.line('R')?.ok === true, b3.line('R')?.error)

  const b4 = build([
    'G = S_4',
    'N = V_4',
    'Q = quotient(G, N)',
    'K = A_4',
    'P = quotient(K, N)',
    'R = contains(P, Q)',
  ])
  ok('第三同构：A₄/N ≤ S₄/N 仍成立（陪集层豁免跨世界门）', b4.line('R')?.ok === true, b4.line('R')?.error)
  eq('  指数 = 2', ((b4.byId('R')?.value as any)?.relation?.index ?? -1), 2)

  const b5 = build(['G = S_4', 'H = closure(G, (12))', 'K = closure(G, (34))', 'I = intersection(H, K)'])
  ok('同母群的两个子群仍能做交（root 相同 ⇒ 免门）', b5.line('I')?.ok === true, b5.line('I')?.error)
  eq('  ⟨(12)⟩ ∩ ⟨(34)⟩ = {e}', ((b5.byId('I')?.value as any)?.group?.order ?? -1), 1)
}
