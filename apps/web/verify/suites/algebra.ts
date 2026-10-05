/**
 * 代数与结论层的核心契约 —— 这一组是"没坏"的证明。
 *
 * 覆盖：同构识别（U4）\\cdot 第一同构定理的结论（U4）\\cdot 第二同构定理（体检 G3）\\cdot
 * Sylow III 的三条等式与轨道-稳定子（U7）。
 */
import { identifyGroup, actionInsights, groupInsights, mapInsights } from '../../src/gal/insights'
import { build, eq, ok, suite } from '../harness'

/** 容错比较同构符号（`S_{3}` / `S_3` / `S3` 一律等同）。 */
const flat = (s: string | null) => (s ?? '').replace(/[{}\s_\\]/g, '')

export function run(): void {
  suite('algebra \\cdot 同构识别与结论层')

  // ── 同构识别 ──
  {
    const b = build(['G = S_4', 'N = closure(G, (12)(34), (13)(24))', 'Q = quotient(G, N)'])
    const q = b.byId('Q')
    ok('S_4/V_4 是群值', q?.value.type === 'group')
    if (q?.value.type === 'group') eq('S_4/V_4 \\cong S_3', flat(identifyGroup(q.value.group)), 'S3')
  }
  {
    // 直接建的群不该被说"同构于它自己"
    const b = build(['G = S_4'])
    const g = b.byId('G')
    if (g?.value.type === 'group') {
      const ins = groupInsights(g.value.group)
      ok('直接建的 S_4 不报"同构于 S_4"', !ins.some((i) => i.label === '同构'))
      // ⚠️ 读 `tex` 而不是 `text`：`Insight.text` 已于 2026-10-05 删（零消费者且内容就是 LaTeX）
      ok('给出阶的素因子分解', ins.some((i) => i.tex.includes('2^4') || i.tex.includes('24 = 2')))
    }
  }

  // ── 第一同构定理的结论（mapInsights）──
  {
    const b = build(['G = C_6', 'H = C_3', '\\varphi = map(G, H, a->1)'])
    const m = b.byId('\\varphi')
    if (m?.value.type === 'map') {
      const ins = mapInsights(m.value.map)
      ok('说出第一同构定理', ins.some((i) => i.label === '第一同构定理'))
      const concrete = ins.find((i) => i.label === '具体结论')
      ok('满射时给出 G/ker f \\cong H', !!concrete && concrete.tex.includes('C_{3}'), concrete?.tex)
      const main = ins.find((i) => i.label === '第一同构定理')
      ok('数字核对：|G|/|ker| = |im|', !!main && main.detail?.includes('相等 v'), main?.detail)
    } else {
      ok('\\varphi 是映射值', false)
    }
  }

  suite('algebra \\cdot 第二同构定理')

  // ── 第二同构定理：|H/(H\\cap N)| = |HN/N|（体检 G3 的回归防线）──
  {
    const b = build([
      'G = D_4',
      'H = closure(G, r)',
      'N = closure(G, r2, s)',
      'HN = closure(G, r, s)',
      'I = H \\cap N',
      'Q1 = H / I',
      'Q2 = HN / N',
    ])
    const err = b.lineStates.find((s) => !s.ok)
    ok('第二同构的全部行可求值', !err, err ? `${err.name} -> ${err.error}` : '')
    eq('|H| = 4', b.orderOf('H'), 4)
    eq('|N| = 4', b.orderOf('N'), 4)
    eq('|HN| = 8 = |G|', b.orderOf('HN'), 8)
    eq('|H \\cap N| = 2', b.orderOf('I'), 2)
    eq('|H/(H\\cap N)| = 2', b.orderOf('Q1'), 2)
    eq('|HN/N| = 2', b.orderOf('Q2'), 2)
    ok('H \\cap N 升级为群对象（画布上才是方形 + 包含箭头）', b.byId('I')?.value.type === 'group')
  }

  suite('algebra \\cdot Sylow III 与轨道-稳定子')

  /**
   * `G \\curvearrowright Syl_p(G)` \\to 唯一轨道的大小 = n_p。
   * 期望值是**群论表里的值**（手算），不是跑出来的数。
   */
  const SYLOW: { g: string; p: number; n: number }[] = [
    { g: 'D_4', p: 2, n: 1 }, // 阶 8 = 2^3 -> Sylow 2-子群就是 G 自己（8 阶）
    { g: 'D_6', p: 2, n: 3 }, // 阶 12 = 2^2\\cdot 3，三个阶 4 子群
    { g: 'D_6', p: 3, n: 1 }, // \\langle r^2\\rangle 唯一 -> 正规
    { g: 'A_4', p: 2, n: 1 }, // V_4 唯一 -> 正规
    { g: 'A_4', p: 3, n: 4 },
    { g: 'S_4', p: 2, n: 3 },
    { g: 'S_4', p: 3, n: 4 },
    { g: 'C_6', p: 2, n: 1 },
    { g: 'C_6', p: 3, n: 1 },
  ]

  for (const c of SYLOW) {
    // \\Omega 上的点用**纯数字下标**寻址（1 起）：\\Omega 的成员是子群，标签里含逗号
    //（`\\langle r^2, s\\rangle`），用标签寻址会与参数分隔符混淆。
    const b = build([
      `G = ${c.g}`,
      `S = Syl(G, ${c.p})`,
      '\\Omega = asSet(S)',
      'A = conjOn(G, \\Omega)',
      'O = orbits(A, 1)',
      'St = stabilizer(A, 1)',
    ])
    const err = b.lineStates.find((s) => !s.ok)
    if (err) {
      ok(`${c.g} p=${c.p}：链可求值`, false, `${err.name} -> ${err.error}`)
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
    ok(`n_${c.p} \\equiv 1 (mod ${c.p})：${c.g}`, n % c.p === 1, `${n} mod ${c.p} = ${n % c.p}`)
    ok(`n_${c.p} | m：${c.g}`, m > 0 && m % n === 0, `m=${m}, n=${n}`)
    ok(`轨道-稳定子 |Orb|\\cdot|Stab| = |G|：${c.g}`, n * stab === order, `${n}\\cdot${stab} vs ${order}`)

    // 结论层要能把这些话说出来
    const ins = actionInsights(A.value.action)
    ok(`结论层给出 Sylow III：${c.g} p=${c.p}`, ins.some((i) => i.label === 'Sylow III'))
    if (c.n === 1) ok(`唯一 -> 正规：${c.g} p=${c.p}`, ins.some((i) => i.label === '正规 iff 唯一'))
  }
}
