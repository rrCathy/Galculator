/**
 * 「结构接线」的回归线（U27）。
 *
 * 缺口清单（`docs/USABILITY.md` ⑪ / `docs/TASKS.md` ②–⑥）里一直挂着这一批，
 * 而 core 里其实**全是现成原语**（合成列 / 半直积分解 / 共轭类 / 子群格）——缺的只是接线。
 * 这一轮接上六条操作（gcd / lcm / phi / 轨道数 / 极大子群 / Inn）
 * 与「基本」tab 的「结构」节（完美 / 合成列 / 导来列 / 分解）。
 *
 * 期望值**全部手算**（verify/README 的纪律），几条关键的：
 *   · 极大子群 = 子群格上 G 的直接下层：
 *     S₄ 的 8 个 = A₄(12) + 3 个 D₄(8) + 4 个 S₃(6)；A₄ 的 5 个 = V₄ + 4 个 C₃；
 *     Cₚ 的 1 个 = {e}（素数阶群只有平凡真子群）
 *   · 共轭类（类方程）：D₄ = 1+1+2+2+2 -> 5 类；S₄ = 1+6+3+8+6 -> 5 类；
 *     A₄ = 1+3+4+4 -> 4 类；D₆ = 1+1+2+2+3+3 -> 6 类
 *   · 合成列因子（Jordan-Hölder）：S₄ = C₂·C₃·C₂·C₂（2·3·2·2 = 24）；
 *     A₅ = [A₅]（单群）；C₁₂ = C₂·C₂·C₃
 *   · Inn(G) ≅ G/Z(G)（第一同构定理）：D₄ -> V₄（8/2）；A₄ -> A₄（Z 平凡）；C₁₂ -> 平凡
 */
import { createGroupFromSymbol, getConjugacyClasses } from '@groupviz/core'
import { prettySymbol } from '../../src/gal/pretty'
import { structureFacts } from '../../src/gal/structure'
import { build, eq, ok, suite } from '../harness'

/**
 * 因子的**展示形态**。
 *
 * core 的因子 `label` 写法不统一（`C_{2}` 带花括号、A₅ 那个却是 `A_5`），
 * 断言比的是用户看见的样子 —— 过一遍 `prettySymbol` 再比，别把 core 的书写差异当成数学差异。
 */
function factorsOf(sym: string): string {
  const f = structureFacts(groupOf(sym))
  return (f?.composition?.factors ?? []).map((x) => prettySymbol(x)).join(',')
}

/** 最后一个对象的数值（`n = 轨道数(A)` 这类）。 */
function lastNumber(lines: string[]): number | null {
  const r = build(lines)
  const last = r.objects[r.objects.length - 1]
  return last?.value.type === 'number' ? last.value.value : null
}

/** 最后一个对象的群（`I = Inn(G)` 这类）。 */
function lastGroup(lines: string[]) {
  const r = build(lines)
  const last = r.objects[r.objects.length - 1]
  return last?.value.type === 'group' ? last.value.group : null
}

/** 最后一个对象的子群列表（`M = 极大子群(G)` 这类）。 */
function lastSubgroups(lines: string[]) {
  const r = build(lines)
  const last = r.objects[r.objects.length - 1]
  return last?.value.type === 'subgroups' ? last.value.subgroups : []
}

/** 最后一个对象（读 `sub` / `label` / `opId`）。 */
function lastObject(lines: string[]) {
  const r = build(lines)
  return r.objects[r.objects.length - 1]
}

/** 最后一个行状态（读报错）。 */
function lastLine(lines: string[]) {
  const r = build(lines)
  return r.lineStates[r.lineStates.length - 1]
}

/**
 * 直接建群（结构事实那几条不走"操作产出的对象"）。
 * 走**与用户同一条**记号解析路径（`G = D_4` 这种写法），省得两边对不上。
 */
function groupOf(symbol: string) {
  const v = build([`G = ${symbol}`]).byId('G')?.value
  if (v?.type !== 'group') throw new Error(`建不出 ${symbol}`)
  return v.group
}

export function run(): void {
  /* ══ ① 数论三件套（缺口 ⑤） ══════════════════════════ */

  suite('structure \\cdot 数论：gcd / lcm / phi')
  {
    eq('gcd(12, 18) = 6', lastNumber(['n = gcd(12, 18)']), 6)
    eq('gcd(0, 5) = 5（0 与谁的最大公因数是对方）', lastNumber(['n = gcd(0, 5)']), 5)
    eq('gcd(0, 0) = 0', lastNumber(['n = gcd(0, 0)']), 0)
    eq('gcd(17, 5) = 1（互素）', lastNumber(['n = gcd(17, 5)']), 1)
    eq('gcd 是注册表里的 gcd 操作', lastObject(['n = gcd(12, 18)']).opId, 'gcd')

    eq('lcm(4, 6) = 12', lastNumber(['n = lcm(4, 6)']), 12)
    eq('lcm(21, 6) = 42', lastNumber(['n = lcm(21, 6)']), 42)
    eq('lcm(0, 5) = 0（0 是唯一的"任何数的倍数"）', lastNumber(['n = lcm(0, 5)']), 0)
    eq('lcm(12, 18) = 36', lastNumber(['n = lcm(12, 18)']), 36)
    // a·b = gcd·lcm 这条恒等式当场核：12·18 = 216 = 6·36
    eq(
      'a \\cdot b = gcd \\cdot lcm（12 \\cdot 18 = 6 \\cdot 36 = 216）',
      (lastNumber(['n = gcd(12, 18)']) ?? 0) * (lastNumber(['n = lcm(12, 18)']) ?? 0),
      12 * 18,
    )

    eq('\\varphi(12) = 4', lastNumber(['n = phi(12)']), 4)
    eq('\\varphi(1) = 1', lastNumber(['n = phi(1)']), 1)
    eq('\\varphi(97) = 96（素数）', lastNumber(['n = phi(97)']), 96)
    eq('\\varphi(60) = 60 \\cdot (1/2) \\cdot (2/3) \\cdot (4/5) = 16', lastNumber(['n = phi(60)']), 16)
    eq('欧拉函数是注册表里的 eulerPhi', lastObject(['n = phi(12)']).opId, 'eulerPhi')
    eq(
      '展示记法是 \\varphi(12)（TeX 命令，键盘打得出来）',
      lastObject(['n = phi(12)']).label,
      '\\varphi(12)',
    )
    eq('中文调用名也对（欧拉函数）', lastNumber(['n = 欧拉函数(12)']), 4)

    // 参数守卫：负数 / 0 各有专门的说法（不许静默算个错的）
    ok(
      'gcd 拒收负数',
      (lastLine(['n = gcd(-1, 2)']).error ?? '').includes('非负'),
      lastLine(['n = gcd(-1, 2)']).error,
    )
    ok('phi 拒收 0', (lastLine(['n = phi(0)']).error ?? '').includes('正整数'), lastLine(['n = phi(0)']).error)
  }

  /* ══ ② 轨道数 = Burnside 平均（缺口 ②） ════════════ */

  suite('structure \\cdot 轨道数（Burnside 引理）')
  {
    // 共轭作用的轨道 = 共轭类。手算（类方程）：
    // D₄ = 1+1+2+2+2；S₄ = 1+6+3+8+6；A₄ = 1+3+4+4；D₆ = 1+1+2+2+3+3
    const CONJ: [string, number][] = [
      ['D_4', 5],
      ['S_4', 5],
      ['A_4', 4],
      ['D_6', 6],
    ]
    for (const [sym, want] of CONJ) {
      const lines = [`G = ${sym}`, 'A = 共轭作用(G)', 'k = 轨道数(A)']
      eq(`${sym} 的共轭类数 = ${want}`, lastNumber(lines), want)
      // 交叉核对：core 自己的共轭类实现（两条独立的路径给出同一个数）
      eq(
        `  ${sym}：与 core 的 getConjugacyClasses 逐条对上`,
        lastNumber(lines),
        getConjugacyClasses(groupOf(sym)).length,
      )
    }

    // Burnside 的"核对"标记：两条路（直接数 / 平均）必须打勾。
    // D₄ 共轭作用手算 Σ|Fix(g)|：|Fix(g)| = |C_G(g)| ——
    //   e: 8；r, r³: 4, 4；r²（中心）: 8；四个反射 sr^k: 各 4
    //   -> 8 + 4 + 4 + 8 + 4·4 = 40；40 / 8 = 5 ✓（与直接数的 5 对上）
    const sub = lastObject(['G = D_4', 'A = 共轭作用(G)', 'k = 轨道数(A)']).sub ?? ''
    ok('副行给出 Burnside 的平均式', sub.includes('Burnside'), sub)
    ok('  且两条路对上了（v）', sub.includes('v'), sub)
    ok('  40 / 8 = 5（上面注释里逐步手算过）', sub.includes('40 / 8 = 5'), sub)

    // 传递作用（正则作用）只有 1 条轨道
    eq('正则作用(S_3) 的轨道数 = 1（传递）', lastNumber(['G = S_3', 'A = 正则作用(G)', 'k = 轨道数(A)']), 1)
    // 嵌套写法也得对（TASKS.md 里的那一行就是 `轨道数(共轭作用(G))`）
    eq('嵌套：轨道数(共轭作用(G)) 也对', lastNumber(['G = D_4', 'k = 轨道数(共轭作用(G))']), 5)
    // 陪集作用也传递：S₄ 对 ⟨(12)⟩ 的 12 个左陪集
    eq(
      '陪集作用(S_4, H) 的轨道数 = 1（传递）',
      lastNumber(['G = S_4', 'H = 闭包(G, (12))', 'A = 陪集作用(G, H)', 'k = 轨道数(A)']),
      1,
    )
    {
      const r = build(['G = S_4', 'H = 闭包(G, (12))', 'A = 陪集作用(G, H)'])
      const a = r.byId('A')?.value
      eq('  Ω 的基数 = [S₄:H] = 12', a?.type === 'action' ? a.action.n : -1, 12)
    }
  }

  /* ══ ③ 极大子群（缺口 ④） ══════════════════════════ */

  suite('structure \\cdot 极大子群（子群格的直接下层）')
  {
    {
      const subs = lastSubgroups(['G = S_4', 'M = 极大子群(G)'])
      eq('S_4 的极大子群 8 个', subs.length, 8)
      eq(
        '  阶的多重集 = A₄(12) + 三个 D₄(8) + 四个 S₃(6)',
        subs.map((s) => s.order).sort((a, b) => b - a).join(','),
        '12,8,8,8,6,6,6,6',
      )
      eq('  其中只有 A₄ 正规（指数 2）', subs.filter((s) => s.isNormal).map((s) => s.order).join(','), '12')
    }
    {
      const subs = lastSubgroups(['G = D_4', 'M = 极大子群(G)'])
      eq('D₄ 的极大子群 3 个', subs.length, 3)
      eq('  全是阶 4（指数 2 -> 全正规）', subs.map((s) => s.order).join(','), '4,4,4')
      eq('  且全正规', subs.filter((s) => s.isNormal).length, 3)
    }
    {
      const subs = lastSubgroups(['G = A_4', 'M = 极大子群(G)'])
      eq('A₄ 的极大子群 5 个 = V₄ + 四个 C₃', subs.length, 5)
      eq('  阶的多重集', subs.map((s) => s.order).sort((a, b) => b - a).join(','), '4,3,3,3,3')
      eq('  只有 V₄ 正规', subs.filter((s) => s.isNormal).map((s) => s.order).join(','), '4')
    }
    {
      const subs = lastSubgroups(['G = C_12', 'M = 极大子群(G)'])
      eq('C₁₂ 的极大子群 2 个 = C₆ + C₄', subs.map((s) => s.order).sort((a, b) => b - a).join(','), '6,4')
    }
    {
      const subs = lastSubgroups(['G = C_7', 'M = 极大子群(G)'])
      eq('C₇ 的极大子群只有 {e}（素数阶）', subs.map((s) => s.order).join(','), '1')
    }

    // 半份判据：挡住"把 G 自己也列进来"这类错
    {
      const r = build(['G = S_4', 'M = 极大子群(G)'])
      const g = r.byId('G')?.value
      const v = r.byId('M')?.value
      const order = g?.type === 'group' ? g.group.order : 0
      const subs = v?.type === 'subgroups' ? v.subgroups : []
      ok('每个极大子群都真小于 G', subs.every((s) => s.order < order))
      ok('每个的指数 = |G| / |M|', subs.every((s) => s.index === order / s.order))
    }

    // 超限守卫：core 的格超限时会**静默退化成 {e} 与 G 两点**（实测 216 阶），
    // 照单全收会把平凡子群当成极大子群 —— 所以这条守卫必须自己判，且要**说出来**
    {
      const over = lastLine(['G = S_3', 'H = S_3', 'P = G x H', 'Q = P x S_3', 'M = 极大子群(Q)'])
      ok('> 枚举线时明说算不了（不静默给出错的答案）', (over.error ?? '').includes('超过子群枚举线'), over.error)
    }
  }

  /* ══ ④ Inn(G) ≅ G / Z(G)（缺口 ③） ═══════════════════ */

  suite('structure \\cdot 内自同构群 Inn(G)')
  {
    // 手算：Inn(G) ≅ G/Z(G)
    //   D₄：|Z| = 2（{e, r²}）-> |Inn| = 4；V₄ 交换
    //   S₃：|Z| = 1 -> |Inn| = 6；S₃ 非交换（Aut(S₃) = Inn(S₃) ≅ S₃）
    //   A₄：|Z| = 1 -> |Inn| = 12（经典结论 Inn(A₄) ≅ A₄，Aut(A₄) ≅ S₄）
    //   S₄：|Z| = 1 -> |Inn| = 24（Aut(S₄) = Inn(S₄) ≅ S₄）
    //   Q₈：|Z| = 2 -> |Inn| = 4（Q₈/Z ≅ V₄）
    //   C₁₂：交换 -> Inn 平凡（|Inn| = 1）
    const CASES: [string, number, number][] = [
      ['D_4', 2, 4],
      ['S_3', 1, 6],
      ['A_4', 1, 12],
      ['S_4', 1, 24],
      ['Q_8', 2, 4],
      ['C_12', 12, 1],
    ]
    for (const [sym, zOrder, innOrder] of CASES) {
      const lines = [`G = ${sym}`, 'I = Inn(G)']
      eq(`Inn(${sym})：|Inn| = |G| / |Z| = ${innOrder}`, lastGroup(lines)?.order, innOrder)
      ok(
        `  副行写的就是 |G| / |Z| = ... / ${zOrder}`,
        (lastObject(lines).sub ?? '').includes(`/ ${zOrder}`),
        lastObject(lines).sub ?? '',
      )
    }
    eq('Inn(D₄) ≅ V₄（4 阶交换）', lastGroup(['G = D_4', 'I = Inn(G)'])?.isAbelian, true)
    eq('Inn(S₃) ≅ S₃（6 阶非交换）', lastGroup(['G = S_3', 'I = Inn(G)'])?.isAbelian, false)
    eq('交换群 -> Inn 平凡', lastGroup(['G = C_12', 'I = Inn(G)'])?.order, 1)
    eq('Inn 是注册表里的 innerAutomorphismGroup', lastObject(['G = D_4', 'I = Inn(G)']).opId, 'innerAutomorphismGroup')
  }

  /* ══ ⑤ 结构事实：完美 / 合成列 / 导来列 / 分解 ═════════ */

  suite('structure \\cdot 结构事实（基本 tab 的「结构」节）')
  {
    const S4 = structureFacts(groupOf('S_4'))
    ok('S₄ 的结构事实算得出来', !!S4)
    eq('  S₄ 不完美', S4?.perfect, false)
    eq('  合成列因子 = C₂ · C₃ · C₂ · C₂', factorsOf('S_4'), 'C_2,C_3,C_2,C_2')
    eq('  合成列共 3 条（因子多重集相同）', S4?.composition?.alternativeCount, 3)
    eq('  导来列阶链 = 24 > 12 > 4 > 1（S₄ > A₄ > V₄ > {e}）', S4?.derived?.orders.join(','), '24,12,4,1')
    eq('  导来列降到底（可解）', S4?.derived?.reachesTrivial, true)
    eq('  分解是半直积（S₄ ≅ A₄ ⋊ C₂）', S4?.decomposition?.kind, 'semidirect')
    eq('  正规子群是 A₄（12 阶）', S4?.decomposition?.normalOrder, 12)
    eq('  作用群是 C₂（2 阶）', S4?.decomposition?.actingOrder, 2)
    eq('  两个阶乘起来 = |G|', (S4?.decomposition?.normalOrder ?? 0) * (S4?.decomposition?.actingOrder ?? 0), 24)
    eq('  重建验证的结果与 G 同构类一致（S₄）', S4?.decomposition?.rebuilt, 'S_{4}')

    const A5 = structureFacts(groupOf('A_5'))
    eq('A₅ 完美（G = [G, G]）', A5?.perfect, true)
    eq('  A₅ 的合成列只有一项（单群）', factorsOf('A_5'), 'A_5')
    eq('  且合成列唯一', A5?.composition?.alternativeCount, 1)
    eq('  导来列没有降到底（不可解）', A5?.derived?.reachesTrivial, false)
    eq('  没有分解', A5?.decomposition, null)
    ok('  理由点名"单群"', (A5?.indecomposableReason ?? '').includes('单群'), A5?.indecomposableReason ?? '')

    const D6 = structureFacts(groupOf('D_6'))
    eq('D₆ 是直积（D₆ ≅ D₃ × C₂）', D6?.decomposition?.kind, 'direct')
    eq('  作用平凡', D6?.decomposition?.trivialAction, true)
    eq('  |N| \\cdot |H| = 12', (D6?.decomposition?.normalOrder ?? 0) * (D6?.decomposition?.actingOrder ?? 0), 12)
    eq(
      '  两个因子是 6 与 2',
      [D6?.decomposition?.normalOrder, D6?.decomposition?.actingOrder].sort((a, b) => (b ?? 0) - (a ?? 0)).join(','),
      '6,2',
    )

    const D4 = structureFacts(groupOf('D_4'))
    eq('D₄ ≅ C₄ ⋊ C₂（非平凡作用）', D4?.decomposition?.kind, 'semidirect')
    eq('  |N| \\cdot |H| = 8', (D4?.decomposition?.normalOrder ?? 0) * (D4?.decomposition?.actingOrder ?? 0), 8)

    const Q8 = structureFacts(groupOf('Q_8'))
    eq('Q₈ 没有非平凡分解（每个 4 阶子群都含 -1，补子群凑不出来）', Q8?.decomposition, null)
    ok('  理由**不是**"单群"（Q₈ 不单）', !(Q8?.indecomposableReason ?? '').includes('单群'), Q8?.indecomposableReason ?? '')

    const C12 = structureFacts(groupOf('C_12'))
    eq('C₁₂ 是直积（C₄ × C₃）', C12?.decomposition?.kind, 'direct')
    eq('  合成列因子 = C₂ · C₂ · C₃', factorsOf('C_12'), 'C_2,C_2,C_3')

    // 交叉核对（对每个测试群）：合成列阶链首项 = |G|；导来列到底 ⟺ 可解
    const FACTS: [string, number][] = [
      ['S_4', 24],
      ['D_4', 8],
      ['D_6', 12],
      ['A_5', 60],
      ['C_12', 12],
      ['Q_8', 8],
      ['A_4', 12],
    ]
    for (const [sym, order] of FACTS) {
      const f = structureFacts(groupOf(sym))
      eq(`${sym}：合成列阶链首项 = |G|`, f?.composition?.termOrders[0], order)
      eq(`${sym}：导来列到底 ⟺ 可解`, f?.derived?.reachesTrivial, sym !== 'A_5')
    }

    // 上限与缓存
    eq('S₅（120 阶）超上限，结构节明说没算', structureFacts(groupOf('S_5')), null)
    {
      const g = groupOf('S_4')
      ok('同一个群第二次调用命中缓存（同一个对象引用）', structureFacts(g) === structureFacts(g))
    }
  }
}
