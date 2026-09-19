/**
 * 代数与结论层的核心契约 —— 这一组是"没坏"的证明。
 *
 * 覆盖：同构识别（U4）· 第一同构定理的结论（U4）· 第二同构定理（体检 G3）·
 * Sylow III 的三条等式与轨道-稳定子（U7）。
 */
import { identifyGroup, actionInsights, groupInsights, mapInsights } from '../../src/gal/insights'
import { build, eq, ok, suite } from '../harness'

/** 容错比较同构符号（`S_{3}` / `S_3` / `S3` 一律等同）。 */
const flat = (s: string | null) => (s ?? '').replace(/[{}\s_\\]/g, '')

export function run(): void {
  suite('algebra · 同构识别与结论层')

  // ── 同构识别 ──
  {
    const b = build(['G = S_4', 'N = 闭包(G, (12)(34), (13)(24))', 'Q = 商(G, N)'])
    const q = b.byId('Q')
    ok('S₄/V₄ 是群值', q?.value.type === 'group')
    if (q?.value.type === 'group') eq('S₄/V₄ ≅ S₃', flat(identifyGroup(q.value.group)), 'S3')
  }
  {
    // 直接建的群不该被说"同构于它自己"
    const b = build(['G = S_4'])
    const g = b.byId('G')
    if (g?.value.type === 'group') {
      const ins = groupInsights(g.value.group)
      ok('直接建的 S₄ 不报"同构于 S₄"', !ins.some((i) => i.label === '同构'))
      ok('给出阶的素因子分解', ins.some((i) => i.text.includes('2⁴') || i.text.includes('24 = 2')))
    }
  }

  // ── 第一同构定理的结论（mapInsights）──
  {
    const b = build(['G = C_6', 'H = C_3', 'φ = 映射(G, H, a→1)'])
    const m = b.byId('φ')
    if (m?.value.type === 'map') {
      const ins = mapInsights(m.value.map)
      ok('说出第一同构定理', ins.some((i) => i.label === '第一同构定理'))
      const concrete = ins.find((i) => i.label === '具体结论')
      ok('满射时给出 G/ker f ≅ H', !!concrete && concrete.text.includes('≅ C₃'), concrete?.text)
      const main = ins.find((i) => i.label === '第一同构定理')
      ok('数字核对：|G|/|ker| = |im|', !!main && main.detail?.includes('相等 ✓'), main?.detail)
    } else {
      ok('φ 是映射值', false)
    }
  }

  suite('algebra · 第二同构定理')

  // ── 第二同构定理：|H/(H∩N)| = |HN/N|（体检 G3 的回归防线）──
  {
    const b = build([
      'G = D_4',
      'H = 闭包(G, r)',
      'N = 闭包(G, r2, s)',
      'HN = 闭包(G, r, s)',
      'I = H ∩ N',
      'Q1 = H / I',
      'Q2 = HN / N',
    ])
    const err = b.lineStates.find((s) => !s.ok)
    ok('第二同构的全部行可求值', !err, err ? `${err.name} → ${err.error}` : '')
    eq('|H| = 4', b.orderOf('H'), 4)
    eq('|N| = 4', b.orderOf('N'), 4)
    eq('|HN| = 8 = |G|', b.orderOf('HN'), 8)
    eq('|H ∩ N| = 2', b.orderOf('I'), 2)
    eq('|H/(H∩N)| = 2', b.orderOf('Q1'), 2)
    eq('|HN/N| = 2', b.orderOf('Q2'), 2)
    ok('H ∩ N 升级为群对象（画布上才是方形 + 包含箭头）', b.byId('I')?.value.type === 'group')
  }

  suite('algebra · Sylow III 与轨道-稳定子')

  /**
   * `G ↷ Syl_p(G)` → 唯一轨道的大小 = n_p。
   * 期望值是**群论表里的值**（手算），不是跑出来的数。
   */
  const SYLOW: { g: string; p: number; n: number }[] = [
    { g: 'D_4', p: 2, n: 1 }, // 阶 8 = 2³ → Sylow 2-子群就是 G 自己（8 阶）
    { g: 'D_6', p: 2, n: 3 }, // 阶 12 = 2²·3，三个阶 4 子群
    { g: 'D_6', p: 3, n: 1 }, // ⟨r²⟩ 唯一 → 正规
    { g: 'A_4', p: 2, n: 1 }, // V₄ 唯一 → 正规
    { g: 'A_4', p: 3, n: 4 },
    { g: 'S_4', p: 2, n: 3 },
    { g: 'S_4', p: 3, n: 4 },
    { g: 'C_6', p: 2, n: 1 },
    { g: 'C_6', p: 3, n: 1 },
  ]

  for (const c of SYLOW) {
    // Ω 上的点用**纯数字下标**寻址（1 起）：Ω 的成员是子群，标签里含逗号
    //（`⟨r², s⟩`），用标签寻址会与参数分隔符混淆。
    const b = build([
      `G = ${c.g}`,
      `S = Syl(G, ${c.p})`,
      'Ω = 底集(S)',
      'A = 共轭作用在(G, Ω)',
      'O = 轨道(A, 1)',
      'St = 稳定子(A, 1)',
    ])
    const err = b.lineStates.find((s) => !s.ok)
    if (err) {
      ok(`${c.g} p=${c.p}：链可求值`, false, `${err.name} → ${err.error}`)
      continue
    }
    const O = b.byId('O')
    const St = b.byId('St')
    const G = b.byId('G')
    const A = b.byId('A')
    if (
      O?.value.type !== 'set' ||
      St?.value.type !== 'group' ||
      G?.value.type !== 'group' ||
      A?.value.type !== 'action'
    ) {
      ok(`${c.g} p=${c.p}：O / St / G / A 值类型正确`, false)
      continue
    }
    const n = O.value.set.members.length
    const stab = St.value.group.order
    const order = G.value.group.order
    const pk = O.value.set.members[0]?.subgroupElements?.length ?? 0
    const m = pk > 0 ? order / pk : 0

    eq(`n_${c.p}(${c.g}) = ${c.n}`, n, c.n)
    ok(`n_${c.p} ≡ 1 (mod ${c.p})：${c.g}`, n % c.p === 1, `${n} mod ${c.p} = ${n % c.p}`)
    ok(`n_${c.p} | m：${c.g}`, m > 0 && m % n === 0, `m=${m}, n=${n}`)
    ok(`轨道-稳定子 |Orb|·|Stab| = |G|：${c.g}`, n * stab === order, `${n}·${stab} vs ${order}`)

    // 结论层要能把这些话说出来
    const ins = actionInsights(A.value.action)
    ok(`结论层给出 Sylow III：${c.g} p=${c.p}`, ins.some((i) => i.label === 'Sylow III'))
    if (c.n === 1) ok(`唯一 → 正规：${c.g} p=${c.p}`, ins.some((i) => i.label === '正规 ⟺ 唯一'))
  }
}
