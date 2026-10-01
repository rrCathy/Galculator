/**
 * 语义层：对应定理（第四同构定理）的**真计算**（U40，2026-09-30）。
 *
 * 用户原话：「逗我呢，你运行一下展示一下对应定理给我看看。」
 * —— 上一轮只给了设计稿，这一轮做成项目里能点开的东西。
 *
 *   N ⊴ G ⇒ { H : N ≤ H ≤ G } ⟷ { S : S ≤ G/N },  H ↦ H/N
 *
 * 期望值全部**手算**给出（理由写在每条旁边），不从运行结果抄。
 * 这里守的是"两侧数目一致、|H/N|·|N| = |H|、覆盖边数相同、正规数相同"——
 * 也就是定理的四句断言。
 */
import { findAllSubgroups, type Group } from '@groupviz/core'
import { buildLines } from '../../src/gal/build'
import { computeCorrespondence } from '../../src/gal/correspondence'
import { eq, ok, suite } from '../harness'

function group(name: string, expr: string): Group | null {
  const objs = buildLines([`${name} = ${expr}`]).objects
  const v = objs.find((o) => o.id === name)?.value
  return v?.type === 'group' ? v.group : null
}

const idsOf = (s: { elements: { id: string }[] }) => s.elements.map((e) => e.id)

export function run(): void {
  const S4 = group('G', 'S_4')
  ok('S_4 建出来了', !!S4)
  const subs4 = S4 ? findAllSubgroups(S4) : []
  const V4 = subs4.find((s) => s.order === 4 && s.isNormal)
  const A4 = subs4.find((s) => s.order === 12)
  const D4 = subs4.find((s) => s.order === 8)
  const triv = subs4.find((s) => s.order === 1)
  ok('S_4 里有 V₄ / A₄ / D₄ / 平凡群', !!V4 && !!A4 && !!D4 && !!triv)

  /* ══ ① 教科书例子：S₄ / V₄ ═══════════════════════════════ */

  suite('correspondence \\cdot S₄ / V₄：6 个子群 ↔ 6 个子群')

  const rv = S4 && V4 ? computeCorrespondence(S4, idsOf(V4)) : null
  ok('S₄/V₄ 算得出来', !!rv && rv.ok, rv && !rv.ok ? rv.reason : '')
  if (rv && rv.ok) {
    const c = rv.value
    // 手算：含 V₄ 的子群 —— 阶必须被 4 整除且 ≤ 24。
    //   阶 4：只有 V₄ 自己（1 个）
    //   阶 8：Sylow 2-子群 ≅ D₄，3 个（每个都含 V₄）
    //   阶 12：A₄，1 个（它唯一的 4 阶子群就是 V₄）
    //   阶 24：S₄
    // ⇒ 1 + 3 + 1 + 1 = 6
    eq('区间 6 个', c.left.length, 6)
    // 商群 S₄/V₄ ≅ S₃，子群数 = 1（平凡）+ 3（C₂）+ 1（A₃=C₃）+ 1（自身）= 6
    eq('商群子群 6 个', c.right.length, 6)
    // |H| 只取 4/8/12/24 四种 ⇒ 四层
    eq('层数 4', c.levelCount, 4)
    // 左栏：S₄ 覆盖 A₄ 与 3 个 D₄（4 条），V₄ 被 A₄ 与 3 个 D₄ 覆盖（4 条）
    eq('左栏覆盖边 8', c.leftEdgeCount, 8)
    // 右栏同构 ⇒ 也 8 条
    eq('右栏覆盖边 8', c.rightEdgeCount, 8)
    // 正规：V₄（指数 6）、A₄（指数 2）、S₄；3 个 D₄ 非正规
    eq('左栏正规 3 个', c.left.filter((n) => n.normal).length, 3)
    // 商侧同理：{e}、C₃、S₄/V₄ 正规；3 个 C₂ 非正规
    eq('右栏正规 3 个', c.right.filter((n) => n.normal).length, 3)
    ok(
      '配对是双射（6 对不重不漏）',
      new Set(c.left.map((n) => n.pair)).size === 6 &&
        new Set(c.right.map((n) => n.key)).size === 6 &&
        new Set(c.right.map((n) => n.pair)).size === 6,
    )
    // 定理的核心断言：|H/N| · |N| = |H|，这里 |N| = 4
    ok(
      '每对满足 |H/N| x |N| = |H|',
      c.left.every((l) => {
        const r = c.right.find((x) => x.key === l.pair)
        return !!r && r.order * 4 === l.order
      }),
    )
    // 同层的左右两侧节点数必须一样（否则摆位会错行）
    ok(
      '同层左右列数一致',
      [...new Set(c.left.map((n) => n.level))].every(
        (lv) =>
          c.left.filter((n) => n.level === lv).length ===
          c.right.filter((n) => n.level === lv).length,
      ),
    )
    ok('G 自身在区间里（阶 24）', c.left.some((n) => n.order === 24))
    ok('N 自身在区间里（阶 4）', c.left.some((n) => n.order === 4))
    ok('商群阶 = |G|/|N| = 6', c.qOrder === 6, String(c.qOrder))
  }

  /* ══ ② 指数 2 的小例子 ═══════════════════════════════════ */

  suite('correspondence \\cdot S₄ / A₄：指数 2，商群 ≅ C₂')

  const ra = S4 && A4 ? computeCorrespondence(S4, idsOf(A4)) : null
  ok('S₄/A₄ 算得出来', !!ra && ra.ok, ra && !ra.ok ? ra.reason : '')
  if (ra && ra.ok) {
    // 含 A₄ 的子群只有 A₄ 与 S₄
    eq('区间 2 个', ra.value.left.length, 2)
    // C₂ 的子群 = 1 + 1
    eq('商群子群 2 个', ra.value.right.length, 2)
    eq('左覆盖边 1', ra.value.leftEdgeCount, 1)
    eq('右覆盖边 1', ra.value.rightEdgeCount, 1)
    eq('两侧全正规', ra.value.left.filter((n) => n.normal).length, 2)
    eq('两侧全正规（商侧）', ra.value.right.filter((n) => n.normal).length, 2)
  }

  suite('correspondence \\cdot C₆ / C₃：循环群上也对')

  const C6 = group('K', 'C_6')
  const C3in6 = C6 ? findAllSubgroups(C6).find((s) => s.order === 3) : undefined
  const rc = C6 && C3in6 ? computeCorrespondence(C6, idsOf(C3in6)) : null
  ok('C₆/C₃ 算得出来', !!rc && rc.ok, rc && !rc.ok ? rc.reason : '')
  if (rc && rc.ok) {
    eq('区间 2 个（C₃ 与 C₆）', rc.value.left.length, 2)
    eq('商群 ≅ C₂ ⇒ 2 个子群', rc.value.right.length, 2)
    // 循环群全交换 ⇒ 子群全正规
    eq('两侧全正规', rc.value.left.filter((n) => n.normal).length, 2)
  }

  /* ══ ③ 极限情况：N = {e} 与 N = G ═══════════════════════ */

  suite('correspondence \\cdot 极限：N = {e} 时区间是全部子群')

  const rt = S4 && triv ? computeCorrespondence(S4, idsOf(triv)) : null
  ok('S₄/{e} 算得出来', !!rt && rt.ok, rt && !rt.ok ? rt.reason : '')
  if (rt && rt.ok) {
    // {e} 含于每个子群 ⇒ 区间 = 含平凡群的子群 = L(S₄) 全部（30 个，含 G 自身）
    eq('区间 30 个', rt.value.left.length, 30)
    // 商群 ≅ S₄，子群也 30 个
    eq('商群子群 30 个', rt.value.right.length, 30)
    // 覆盖边 = S₄ 的格边数，两侧同构 ⇒ 66 / 66
    eq('左栏覆盖边 66', rt.value.leftEdgeCount, 66)
    eq('右栏覆盖边 66', rt.value.rightEdgeCount, 66)
    eq('正规数一致', rt.value.left.filter((n) => n.normal).length,
      rt.value.right.filter((n) => n.normal).length)
  }

  suite('correspondence \\cdot 极限：N = G 时商群平凡')

  const rg = S4 ? computeCorrespondence(S4, S4.elements.map((e) => e.id)) : null
  ok('S₄/S₄ 算得出来', !!rg && rg.ok, rg && !rg.ok ? rg.reason : '')
  if (rg && rg.ok) {
    eq('区间只有 G 自己', rg.value.left.length, 1)
    eq('商群（平凡群）只有自己', rg.value.right.length, 1)
    eq('没有覆盖边', rg.value.leftEdgeCount, 0)
  }

  /* ══ ④ 守卫 ═══════════════════════════════════════════ */

  suite('correspondence \\cdot 守卫：非正规 / 超限')

  // S₄ 的 3 个 D₄ 都非正规 —— 对应定理要求 N ⊴ G，必须拒
  const rd = S4 && D4 ? computeCorrespondence(S4, idsOf(D4)) : null
  ok(
    '非正规子群被拒（要求 N ⊴ G）',
    !!rd && !rd.ok && rd.reason.includes('正规'),
    rd && !rd.ok ? rd.reason : JSON.stringify(rd),
  )

  // 阶 256 > 144 的守卫线：**不枚举**，直接说清
  const BIG = group('B', 'C_2xC_2xC_2xC_2xC_2xC_2xC_2xC_2')
  ok('阶 256 的群建出来了', !!BIG, BIG ? String(BIG.order) : 'null')
  if (BIG) {
    const rb = computeCorrespondence(BIG, [BIG.identity.id])
    ok('超限被拒且说清是守卫', !rb.ok && rb.reason.includes('144'), !rb.ok ? rb.reason : '')
  }
}
