/**
 * 本地预算的回归线（U47，2026-10-01）。
 *
 * 事故：用户在输入球里敲 `Aut(S6)`，页面直接卡死。查下去是**一族**问题：
 *
 *   · `Aut(G)`  —— core 的搜索守卫只看候选组合数（30000），`S_6` 的 18000 组从它下面钻过去，
 *                  实测 240s 没完；建群那一步又是随 `|Aut|` 陡涨的（`A_5` 的 120 个要 21s）；
 *   · `Syl_p` / `pSub` —— core 内部**没有**守卫，`Syl_2(S_6)` 45s 没完；
 *   · `Sub` / `正规子群` —— core 超限**静默回空数组**，于是 S_6 会说"有 0 个子群"（假答案）。
 *
 * 这套断言的判据分两半，两半都得守：
 *   ① **跑不动的必须当场说算不了**（带时间断言 —— 事故就是"不返回"）;
 *   ② **跑得动的一个都不许误伤**（`S_4` / `C_3 x C_3` / `Syl_3(S_6)` 这些必须照算）。
 */
import type { GalObject } from '../../src/gal/types'
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

export function run(): void {
  suite('budget \\cdot Aut(G)：两段守卫（U47）')
  {
    // ① 跑不动的当场说算不了 —— 而且必须**立刻**（事故就是 240s 不返回，这条断言在守时间）
    const s6 = failOf(['G = S_6', 'A = Aut(G)'])
    ok('S_6 的自同构不硬算，直接说"搜不动"', s6.err.includes('搜不动'), s6.err)
    ok(
      '报错说清是哪一段拦的（候选组合数 + 阶）',
      s6.err.includes('18000') && s6.err.includes('720'),
      s6.err,
    )
    ok('不许说"0 个自同构"这类假话', !s6.err.includes('0 个'), s6.err)
    ok('当场返回（< 2s，事故时是 240s 没完）', s6.ms < 2000, `${s6.ms}ms`)

    // `S_5` 的组合数 600 x 阶 120 超搜索线 —— 连搜都不许搜
    const s5 = failOf(['G = S_5', 'A = Aut(G)'])
    ok('S_5 也在搜索线外', s5.err.includes('搜不动'), s5.err)
    ok('S_5 当场返回', s5.ms < 2000, `${s5.ms}ms`)

    // ② 搜得出来、建不出来的：报错里要带上**已经算出来的** |Aut|（那是真答案）
    const a5 = failOf(['G = A_5', 'A = Aut(G)'])
    ok('A_5 说"有 120 个自同构"（|Aut(A_5)| = |S_5| = 120 是手算的）', a5.err.includes('120'), a5.err)
    ok('A_5 说的是"建不出"而不是"搜不动"', a5.err.includes('建不出'), a5.err)
    ok('A_5 当场返回（没硬算那 21s）', a5.ms < 2000, `${a5.ms}ms`)

    // 阶小 != 没事：C_2^3 只有 8 阶，|Aut| = |GL(3,2)| = 168
    const c23 = failOf(['G = C_2^3', 'A = Aut(G)'])
    ok('|Aut(C_2^3)| = 168（8 阶群的 |Aut| 可以很大）', c23.err.includes('168'), c23.err)

    const c44 = failOf(['G = C_4 x C_4', 'A = Aut(G)'])
    ok('|Aut(C_4 x C_4)| = 96，在建群线外', c44.err.includes('96'), c44.err)

    // ③ 误伤检查：线内的一律照算
    const s4 = calcOf(['G = S_4', 'A = Aut(G)'])
    eq('|Aut(S_4)| = 24 照算（守卫不许误伤）', orderOf(s4.obj), 24)
    ok('S_4 那次是"真算出来"的，不是报错', s4.ms < 2000, `${s4.ms}ms`)

    const c33 = calcOf(['G = C_3 x C_3', 'A = Aut(G)'])
    eq('|Aut(C_3 x C_3)| = |GL(2,3)| = 48，正好踩在建群线上照算', orderOf(c33.obj), 48)

    const d8 = calcOf(['G = D_8', 'A = Aut(G)'])
    eq('|Aut(D_8)| = 32 照算', orderOf(d8.obj), 32)
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
