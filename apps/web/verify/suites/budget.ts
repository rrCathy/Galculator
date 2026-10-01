/**
 * 本地预算的回归线（U47 立、U48 改，2026-10-01）。
 *
 * 事故：用户在输入球里敲 `Aut(S6)`，页面直接卡死。查下去是**一族**问题：
 *
 *   · `Aut(G)`  —— core 的搜索守卫只看候选组合数（30000），`S_6` 的 18000 组从它下面钻过去，
 *                  实测 240s 没完；建群那一步又是随 `|Aut|` 陡涨的（`A_5` 的 120 个要 21s）；
 *   · `Syl_p` / `pSub` —— core 内部**没有**守卫，`Syl_2(S_6)` 45s 没完；
 *   · `Sub` / `正规子群` —— core 超限**静默回空数组**，于是 S_6 会说"有 0 个子群"（假答案）。
 *
 * U47 的处置是**拦住 + 当场说"算不了"**；用户不接受这个答案（"说 S6 搜不动我不是很认可"），
 * 于是 U48 补了**已知结论层**（`src/gal/known.ts`）：常见族的 `Aut` 是**课本闭式**，先查表。
 *
 * 所以这套断言现在守三件事：
 *   ① 预算**外**的不许卡、也不许只说"算不了" —— 要给出真答案（`|Aut(S₆)| = 1440`）；
 *   ② 预算**内**的照旧真算（元素是自同构本身，结论区才能说 `Aut(S₄) ≅ S₄`）—— 不许退化成表里的同构品；
 *   ③ 表里**没有**的那一族（`C₄ × C₄`）照旧走守卫拦住。
 */
import { createGroupFromSymbol, parseGroupNotation, type Group } from '@groupviz/core'
import type { GalObject } from '../../src/gal/types'
import { isKnownGroup, knownFacts } from '../../src/gal/known'
import { build, eq, ok, suite } from '../harness'

/** 一行定义 + 拿最后一个对象（`build` 的 byId 在本套件里写成小助手）。 */
function calcOf(lines: string[]): { obj: GalObject | undefined; ms: number } {
  const t0 = Date.now()
  const b = build(lines)
  const obj = b.byId(lines[lines.length - 1].split('=')[0].trim())
  return { obj, ms: Date.now() - t0 }
}

/** 一行定义 + 最后一行**该失败**，返回报错语（顺带把耗时带出来）。 */
function failOf(lines: string[]): { err: string; ms: number } {
  const t0 = Date.now()
  const b = build(lines)
  const name = lines[lines.length - 1].split('=')[0].trim()
  const st = b.line(name)
  return { err: st && !st.ok ? (st.error ?? '') : '', ms: Date.now() - t0 }
}

/** 群值的阶；不是群值就回 null。 */
function orderOf(o: GalObject | undefined): number | null {
  return o?.value.type === 'group' ? o.value.group.order : null
}

/** 子群集列表的成员数；不是那种值就回 null。 */
function subCount(o: GalObject | undefined): number | null {
  return o?.value.type === 'subgroups' ? o.value.subgroups.length : null
}

/** 群值的元素个数（已知群是 0）；不是群值回 null。 */
function elemCount(o: GalObject | undefined): number | null {
  return o?.value.type === 'group' ? o.value.group.elements.length : null
}

/** 是不是「已知群」（只有符号 + 阶、没有元素表）。 */
function knownOf(o: GalObject | undefined): boolean {
  return o?.value.type === 'group' && isKnownGroup(o.value.group)
}

export function run(): void {
  suite('budget \\cdot Aut(G)：结论表 + 两段守卫（U47/U48）')
  {
    // ① 预算外的：不许卡，也不许只说"算不了" —— 要给出真答案
    const s6 = calcOf(['G = S_6', 'A = Aut(G)'])
    eq('|Aut(S_6)| = 1440 = 2 * 6!（S_6 是 n! 公式唯一的例外）', orderOf(s6.obj), 1440)
    ok('当场返回（< 2s；事故时是 240s 没完）', s6.ms < 2000, `${s6.ms}ms`)
    ok('S_6 给的是「已知群」（本地建不出 1440 阶的群，所以没有元素表）', knownOf(s6.obj))
    eq('已知群的元素表是空的（下游元素级运算会被挡下）', elemCount(s6.obj), 0)
    ok('不再说"搜不动/0 个自同构"这类话', !(s6.obj?.sub ?? '').includes('搜不动'))

    // S_5：600 x 120 超搜索线，但结论表给出 |Aut| = 120，本地建得出来 ⇒ 真群
    const s5 = calcOf(['G = S_5', 'A = Aut(G)'])
    eq('|Aut(S_5)| = 120 = |S_5|（n 不等于 6 时 Aut(S_n) 就是 S_n）', orderOf(s5.obj), 120)
    ok('S_5 当场返回', s5.ms < 2000, `${s5.ms}ms`)
    eq('S_5 那次给的是**真群**（同构于 S_5，元素表齐全）', elemCount(s5.obj), 120)

    // A_5：搜索过得去（280ms）、建群过不去（|Aut| = 120 > 48）⇒ 结论表接手
    const a5 = calcOf(['G = A_5', 'A = Aut(G)'])
    eq('|Aut(A_5)| = |S_5| = 120（手算值）', orderOf(a5.obj), 120)
    ok('A_5 当场返回（没硬算那 21s）', a5.ms < 2000, `${a5.ms}ms`)
    eq('A_5 的 Aut 也建成真群（S_5）', elemCount(a5.obj), 120)

    // 阶小 != 没事：C_2^3 只有 8 阶，|Aut| = |GL(3,2)| = 168
    const c23 = calcOf(['G = C_2^3', 'A = Aut(G)'])
    eq('|Aut(C_2^3)| = |GL(3,2)| = 168（8 阶群的 |Aut| 可以很大）', orderOf(c23.obj), 168)
    ok('C_2^3 给的是「已知群」（GL(3,2) 本地没有记号）', knownOf(c23.obj))

    // ② 表里**没有**那一族照旧走守卫拦住
    const c44 = failOf(['G = C_4 x C_4', 'A = Aut(G)'])
    ok('|Aut(C_4 x C_4)| = 96：不在结论表里，照旧在建群线外拦住', c44.err.includes('96'), c44.err)

    // ③ 误伤检查：线内的一律**真算**（元素是自同构本身，不是表里的同构品）
    const s4 = calcOf(['G = S_4', 'A = Aut(G)'])
    eq('|Aut(S_4)| = 24 照算（守卫不许误伤）', orderOf(s4.obj), 24)
    ok('S_4 那次是"真算出来"的，不是报错', s4.ms < 2000, `${s4.ms}ms`)
    ok('真算出来的 Aut 不是「已知群」（元素表齐全）', !knownOf(s4.obj) && (elemCount(s4.obj) ?? 0) > 0)

    const c33 = calcOf(['G = C_3 x C_3', 'A = Aut(G)'])
    eq('|Aut(C_3 x C_3)| = |GL(2,3)| = 48，正好踩在建群线上照算', orderOf(c33.obj), 48)

    const d8 = calcOf(['G = D_8', 'A = Aut(G)'])
    eq('|Aut(D_8)| = 32 照算', orderOf(d8.obj), 32)

    const d5 = calcOf(['G = D_5', 'A = Aut(G)'])
    eq('|Aut(D_5)| = 20（= 5 * phi(5)），本地算得动就照旧真算', orderOf(d5.obj), 20)
  }

  suite('budget \\cdot 已知结论层：常见族的闭式（U48）')
  {
    /*
     * 这一节守的是**表本身**：常见族的闭式结论（用户："起码得把常见结论硬编码吧"）。
     * 判据是「记号 + 阶」双重的，所以对**同族的任何实例**都成立。
     * 期望值全部来自课本 / 手算 —— 且已与引擎现算的 `createAutomorphismGroup`
     * 逐族对照过（阶 + 元素阶分布 + 交换性，见 `gal/known.ts` 顶部那张核对表）。
     */
    const grp = (sym: string): Group | null => {
      const n = parseGroupNotation(sym)
      return n.symbol ? createGroupFromSymbol(n.symbol) : null
    }
    const autOf = (sym: string): number | null => {
      const g = grp(sym)
      return g ? (knownFacts(g)?.aut?.order ?? null) : null
    }

    // 循环群：|Aut(C_n)| = phi(n)（含 (Z/8)^× ≅ C_2 x C_2 这种"群不是循环的"）
    for (const [sym, want] of [
      ['C_5', 4],
      ['C_8', 4],
      ['C_9', 6],
      ['C_12', 4],
    ] as [string, number][]) {
      eq(`|Aut(${sym})| = phi = ${want}`, autOf(sym), want)
    }

    // 初等交换：|Aut(C_p^k)| = |GL(k,p)|
    eq('|Aut(C_2^2)| = |GL(2,2)| = 6', autOf('C_2^2'), 6)
    eq('|Aut(C_3^2)| = |GL(2,3)| = 48', autOf('C_3^2'), 48)
    eq('|Aut(C_2^3)| = |GL(3,2)| = 168', autOf('C_2^3'), 168)

    // 二面体：|Aut(D_n)| = n * phi(n)
    eq('|Aut(D_4)| = 8（8 = 4 * phi(4)）', autOf('D_4'), 8)
    eq('|Aut(D_5)| = 20（20 = 5 * phi(5)）', autOf('D_5'), 20)
    eq('|Aut(D_6)| = 12', autOf('D_6'), 12)
    eq('|Aut(D_7)| = 42', autOf('D_7'), 42)
    eq('|Aut(D_8)| = 32', autOf('D_8'), 32)

    // 对称 / 交错：n != 6 时 Aut 就是 S_n 自己；n = 6 是唯一的例外
    eq('|Aut(S_4)| = 24 = 4!', autOf('S_4'), 24)
    eq('|Aut(S_5)| = 120 = 5!', autOf('S_5'), 120)
    eq('|Aut(S_6)| = 1440 = 2 * 6!（唯一例外）', autOf('S_6'), 1440)
    eq('|Aut(A_4)| = 24 = |S_4|', autOf('A_4'), 24)
    eq('|Aut(A_5)| = 120 = |S_5|', autOf('A_5'), 120)
    /*
     * A_6 这条**故意不查表**：`parseGroupNotation('A_6')` 给的是 `symbol: null`
     * （标着 `backend`）—— A_6 本地**建不出来**，所以根本没有可传进 `knownFacts` 的
     * 群对象，`alternatingFacts(6)` 那条结论进不去。这条边界要写出来，免得下次
     * 有人以为 `Aut(A_6)` 也会走表（真要覆盖它，得先让本地能构造 A_6）。
     */
    const na6 = parseGroupNotation('A_6')
    ok('A_6 本地建不出（symbol 为 null，标 backend）⇒ `|Aut(A_6)| = 1440` 当前无处触发', !na6.symbol && na6.order === 360, `symbol=${String(na6.symbol)} order=${na6.order}`)

    // 小群
    eq('|Aut(Q_8)| = 24 = |S_4|', autOf('Q_8'), 24)
    eq('|Aut(V_4)| = 6 = |S_3|', autOf('V_4'), 6)

    // 「不止 Aut」：同一条表也回答中心 / 内自同构 / 换位子群 / 单性 / 指数
    const f = (sym: string) => {
      const g = grp(sym)
      return g ? knownFacts(g) : null
    }
    eq('Z(S_6) 平凡（阶 1）', f('S_6')?.center?.order ?? null, 1)
    eq('Z(D_5) 平凡（n 奇）', f('D_5')?.center?.order ?? null, 1)
    eq('Z(D_4) = C_2（n 偶）', f('D_4')?.center?.order ?? null, 2)
    eq('Z(Q_8) = C_2', f('Q_8')?.center?.order ?? null, 2)
    eq('Z(D_4) 本地建得出来（真群，不是已知群）', f('D_4')?.center?.build ?? null, 'C_{2}')
    eq('Inn(S_6) 就是 S_6，阶 720', f('S_6')?.inn?.order ?? null, 720)
    eq('[S_6, S_6] = A_6，阶 360', f('S_6')?.commutator?.order ?? null, 360)
    eq('[A_4, A_4] = V_4，阶 4', f('A_4')?.commutator?.order ?? null, 4)
    eq('Out(S_6) = 2（那个著名例外）', f('S_6')?.outOrder ?? null, 2)
    eq('Out(S_4) = 1（n != 6 时 Aut = Inn）', f('S_4')?.outOrder ?? null, 1)
    eq('A_5 是单群', f('A_5')?.isSimple ?? null, true)
    eq('S_5 不是单群（有 A_5 这条正规子群）', f('S_5')?.isSimple ?? null, false)
    // 指数 = 元素阶的 lcm。D_8（阶 16）里有阶 8 的旋转元 ⇒ 指数是 8（引擎实测：
    // 阶直方图 1^1 2^9 4^2 8^4）。写成 4 会把"阶 8 的那个旋转元"漏掉。
    eq('D_8 的指数是 8（旋转元的阶就是 n）', f('D_8')?.exponent ?? null, 8)
    eq('D_5 的指数是 10（n 奇 ⇒ lcm(n,2) = 2n）', f('D_5')?.exponent ?? null, 10)
    eq('S_4 的指数是 12 = lcm(1..4)', f('S_4')?.exponent ?? null, 12)

    // 识别不出就不认（不猜）：非交换的同阶对照群不许蹭到别族的结论
    eq('C_4 x C_4 不是初等交换（底数 4 不是素数）⇒ 不认', f('C_4 x C_4'), null)
  }

  suite('budget \\cdot 已知群：能当结果、不能当输入（U48）')
  {
    const inn = calcOf(['G = S_6', 'A = Inn(G)'])
    eq('|Inn(S_6)| = 720 = |S_6| / |Z|', orderOf(inn.obj), 720)
    ok('Inn(S_6) 当场返回（走 core 要 1.3s 的商）', inn.ms < 2000, `${inn.ms}ms`)

    // 已知群有符号有阶，但没有元素表 ⇒ 元素级运算必须当场说清楚
    const z = failOf(['G = S_6', 'A = Aut(G)', 'B = Z(A)'])
    ok('已知群不能当输入（Z(Aut(S_6)) 被挡下）', z.err.includes('已知群'), z.err)
    ok('挡下的那句话说清"没有元素表"', z.err.includes('元素表') || z.err.includes('元素级'), z.err)

    // 手写的常见群**不是**已知群（别把整条路都改成查表）
    const s5 = calcOf(['G = S_5'])
    ok('手写的 S_5 仍然是普通群（元素表齐全）', !knownOf(s5.obj) && (elemCount(s5.obj) ?? 0) === 120)
  }

  suite('budget \\cdot Syl_p / pSub：p-元素压力（U47）')
  {
    // p-子群个数才是自变量（core 的 vi() 对每个 p-元素与每个已找到的子群合并一次闭包），
    // 而阶不是：C_2^6 只有 64 阶（在 core 的 144 线**之下**）却 60s 没完。
    const syl2 = failOf(['G = S_6', 'A = Syl(G, 2)'])
    ok('Syl_2(S_6) 说算不了（实测 45s 没完）', syl2.err.includes('算不动'), syl2.err)
    ok('报错带上 p-元素个数（255 是手算的：75 个对换 + 180 个 4-轮换）', syl2.err.includes('255'), syl2.err)
    ok('Syl_2(S_6) 当场返回', syl2.ms < 2000, `${syl2.ms}ms`)

    const psub2 = failOf(['G = S_6', 'A = pSub(G, 2)'])
    ok('pSub_2(S_6) 同样拦住', psub2.err.includes('算不动'), psub2.err)

    const c26 = failOf(['G = C_2^6', 'A = Syl(G, 2)'])
    ok(
      'C_2^6（64 阶，144 线之下）也拦得住 —— 阶这条线对 p-子群枚举根本不管用',
      c26.err.includes('算不动'),
      c26.err,
    )
    ok('C_2^6 当场返回（实测 60s 没完）', c26.ms < 2000, `${c26.ms}ms`)

    // 误伤检查
    const syl3 = calcOf(['G = S_6', 'A = Syl(G, 3)'])
    eq('n_3(S_6) = 10 照算（课本上的经典题，舍不得不算）', subCount(syl3.obj), 10)
    const syl5 = calcOf(['G = S_6', 'A = Syl(G, 5)'])
    eq('n_5(S_6) = 36 照算', subCount(syl5.obj), 36)
    const c25 = calcOf(['G = C_2^5', 'A = Syl(G, 2)'])
    eq('C_2^5（0.85s，放行最贵的一档）照算', subCount(c25.obj), 1)
    const s5syl = calcOf(['G = S_5', 'A = Syl(G, 2)'])
    eq('n_2(S_5) = 15 照算', subCount(s5syl.obj), 15)
    const c33 = calcOf(['G = C_3^3', 'A = pSub(G, 3)'])
    eq('C_3^3 的 3-子群 27 个照算', subCount(c33.obj), 27)
  }

  suite('budget \\cdot Sub / 正规子群：超限不许静默给假答案（U47）')
  {
    // core 是 `if (order > 144) return []` —— 直接照单全收就是"S_6 有 0 个子群"
    const sub = failOf(['G = S_6', 'A = Sub(G)'])
    ok('Sub(S_6) 说"超过子群枚举线"', sub.err.includes('超过子群枚举线'), sub.err)

    const norm = failOf(['G = S_6', 'A = 正规子群(G)'])
    ok('正规子群(S_6) 同样拦住', norm.err.includes('超过子群枚举线'), norm.err)

    // 误伤检查：S_5 的 155 个子群照算
    const s5 = calcOf(['G = S_5', 'A = Sub(G)'])
    eq('Sub(S_5) = 155 个子群照算', subCount(s5.obj), 155)
    const s4 = calcOf(['G = S_4', 'A = Sub(G)'])
    eq('Sub(S_4) = 29 个子群照算', subCount(s4.obj), 29)

    // 顺手钉住"结果不许为空还不报错"这件事：线内非平凡群必须给得出东西
    ok('线内群给的是**非空**子群集', (subCount(s4.obj) ?? 0) > 0, String(subCount(s4.obj)))
  }
}
