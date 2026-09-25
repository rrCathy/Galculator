/**
 * 可用性修复的回归线（2026-09-25）。
 *
 * 这一批改的全是"用户撞上的那几句话"：结论区该不该说话、名字能不能敲出来、
 * 报错有没有说清是"没这功能"还是"打错了"。都很小，但都很显眼——
 * 没有断言守着的话，下次谁顺手改一行文案就又回去了。
 *
 * 对应的审计见 `docs/USABILITY.md`（缺口 ① / ③ / ⑥ / ⑨）。
 */
import { buildLines } from '../../src/gal/build'
import { groupInsights } from '../../src/gal/insights'
import { checkName, normalizeName } from '../../src/gal/naming'
import { build, eq, ok, suite } from '../harness'

/** 跑一行定义，拿最后一行的行状态（报错文案就在这里）。 */
function lastLine(lines: string[]) {
  const r = buildLines(lines)
  return r.lineStates[r.lineStates.length - 1]
}

/** 跑一行定义，拿最后一个**群对象**的结论。 */
function groupInsOf(lines: string[]) {
  const r = buildLines(lines)
  const last = r.objects[r.objects.length - 1]
  if (last?.value.type !== 'group') return { labels: [] as string[], node: last, insights: [] as ReturnType<typeof groupInsights> }
  const ins = groupInsights(last.value.group, last)
  return { labels: ins.map((i) => i.label), node: last, insights: ins }
}

export function run(): void {
  /* ══ ① 结论区：构造出来的群不许沉默 ══════════════════════ */

  suite('usability · 结论区的判据（缺口 ①）')
  {
    // 手写的群记号 = 符号即答案，不重复说"同构于 S₄"
    eq('手写 `G = S_4` 只说 1 条（阶）', groupInsOf(['G = S_4']).labels.length, 1)
    eq('那一条是「阶」', groupInsOf(['G = S_4']).labels[0], '阶')

    // 由操作构造出来的群：即使符号与识别结果**归一后相同**，也要说
    //（`ker f` 的符号本来就是 `C_{2}`，不说的话信息面板里只剩一个"阶"）
    const ker = groupInsOf(['G = C_6', 'H = C_6', 'f = 映射(G, H, a→2)', 'K = ker(f)'])
    ok('`K = ker(f)` 有「识别」条（不再沉默）', ker.labels.includes('识别'), ker.labels.join(','))
    ok(
      '「识别」条给出了 SmallGroup 坐标',
      ker.insights.some((i) => (i.detail ?? '').includes('SmallGroup')),
      ker.insights.map((i) => i.detail).join(' | '),
    )

    // 归一：`C_{2}^{2}`（幂写法）与 `C_{2}\times C_{2}`（乘法写法）是同一个群，
    // 不能说"它同构于自己"——label 是「识别」而不是「同构」就是归一成功的证据
    const klein = groupInsOf(['G = C_2 x C_2'])
    ok('`C_2 x C_2` 不说「同构」（同群异写）', !klein.labels.includes('同构'), klein.labels.join(','))
    ok('但会给「识别」+ V₄ 的惯用名', klein.labels.includes('识别') && klein.insights.some((i) => (i.detail ?? '').includes('V₄')), JSON.stringify(klein.insights.map((i) => i.detail)))

    // 符号与识别结果真的不同 → 是「同构」（真结论）
    const q = groupInsOf(['G = S_4', 'N = 闭包(G, (12)(34), (13)(24))', 'Q = 商(G, N)'])
    ok('`商(G,N)`（符号 S₄/N）说「同构」', q.labels.includes('同构'), q.labels.join(','))
    ok(
      '那条写着 ≅ S₃',
      q.insights.some((i) => i.text.includes('S₃')),
      q.insights.map((i) => i.text).join(' | '),
    )

    // 闭包 / 自同构群也一样（它们都是"构造出来的"）
    ok('`闭包(G,r)` 有识别条', groupInsOf(['G = D_4', 'H = 闭包(G, r)']).labels.includes('识别'))
    const aut = groupInsOf(['G = S_4', 'A = Aut(G)'])
    ok('`Aut(S₄)` 说「同构」（Aut(S₄) ≅ S₄）', aut.labels.includes('同构'), aut.labels.join(','))
    ok('Aut 的识别带 SmallGroup(24, 11)', aut.insights.some((i) => (i.detail ?? '').includes('SmallGroup(24, 11)')), aut.insights.map((i) => i.detail).join(' | '))
  }

  /* ══ ⑤ 名字：LaTeX 希腊字母能敲进来了 ═══════════════════ */

  suite('usability · 名字里的 LaTeX 希腊字母（缺口 ⑥）')
  {
    eq('`\\phi` → φ', normalizeName('\\phi'), 'φ')
    eq('`\\varphi` → φ（与 \\phi 归一，否则显示/回认会来回变形）', normalizeName('\\varphi'), 'φ')
    eq('`\\alpha` → α', normalizeName('\\alpha'), 'α')
    eq('`\\Gamma` → Γ（大写也认）', normalizeName('\\Gamma'), 'Γ')
    eq('真字符 φ 原样', normalizeName('φ'), 'φ')
    eq('普通名字原样', normalizeName('  f  '), 'f')
    eq('不认识的宏**不**动它（留给别处报错）', normalizeName('\\foo'), '\\foo')

    ok('`\\phi` 现在是合法名字', checkName('\\phi', []).ok, checkName('\\phi', []).error ?? '')
    ok('`\\varphi` 也是', checkName('\\varphi', []).ok)
    ok('`\\foo` 仍然不合法', !checkName('\\foo', []).ok)
    ok('名字非法时给出希腊字母的写法提示', (checkName('\\foo', []).hint ?? '').includes('\\phi'), checkName('\\foo', []).hint ?? '')
    // 归一之后的重名判定必须生效（`\phi` 与已有的 `φ` 是同一个名字）
    ok('`\\phi` 与已占用的 `φ` 判重名', !checkName('\\phi', ['φ']).ok, JSON.stringify(checkName('\\phi', ['φ'])))
  }

  /* ══ ⑨ 报错：分清「没这功能」与「打错了」 ══════════════ */

  suite('usability · 报错文案（缺口 ⑨）')
  {
    const tm = lastLine(['G = S_4', 'M = 极大子群(G)'])
    ok('未支持的操作报「没有名为…的操作」', (tm.error ?? '').includes('没有名为'), tm.error)
    ok('并猜一个相近的（极大子群 → Sub(G)）', (tm.hint ?? '').includes('Sub(G)'), tm.hint ?? '')

    const burn = lastLine(['G = D_4', 'A = 共轭作用(G)', 'n = Burnside(A)'])
    ok('Burnside 报「没有这个操作」而不是「群记号认不出」', (burn.error ?? '').includes('没有名为'), burn.error)
    ok('不再把操作名当群记号（提示里没有"可用的群记号"）', !(burn.hint ?? '').includes('群记号'), burn.hint ?? '')

    // 单字母别名 `c`（组合数）曾让 `gcd` 匹配出"是不是想用 C(n,k)"这种驴唇不对马嘴的提示
    const gcd = lastLine(['n = gcd(12, 18)'])
    ok('gcd 不再误推荐 C(n,k)', !(gcd.hint ?? '').includes('C(n, k)'), gcd.hint ?? '')
    ok('gcd 仍报「没有这个操作」', (gcd.error ?? '').includes('没有名为'), gcd.error)

    // `f(K)`：`f` 是个已定义的对象 —— 说清楚，别让用户以为打错了名字
    const fk = lastLine(['G = C_6', 'H = C_6', 'f = 映射(G, H, a→2)', 'K = 闭包(G, 1)', 'I = f(K)'])
    ok('`f(K)` 报「f 是已定义的对象，不能当函数调用」', (fk.error ?? '').includes('已定义的对象'), fk.error)
    ok('并点明这个功能还没有', (fk.hint ?? '').includes('还没有'), fk.hint ?? '')

    // 真·打错字：保留原来的"无法识别"
    const typo = lastLine(['G = S_42x'])
    ok('乱写的记号仍是「无法识别」', (typo.error ?? '').includes('无法识别'), typo.error)
  }

  /* ══ ④ 关系行 vs 漏等号 ═════════════════════════════════ */

  suite('usability · 关系行与漏等号（缺口 ④ 的提示）')
  {
    for (const rel of ['H ⊆ G', 'N ⊴ G', 'A ≅ B']) {
      const s = lastLine(['G = S_4', 'H = 闭包(G, r)', 'N = 正规子群(G)', 'A = C_6', 'B = C_6', rel])
      ok(`「${rel}」报「这是一个关系，不是定义」`, (s.error ?? '').includes('关系'), s.error)
      ok(`「${rel}」点明声明关系还没有操作`, (s.hint ?? '').includes('还没有对应操作'), s.hint ?? '')
    }
    // 真的只是漏了等号 → 保持原话
    const noEq = lastLine(['G = S_4', 'G S_4'])
    eq('真漏等号仍是「缺少「=」」', noEq.error, '缺少「=」')
  }

  /* ══ ③ 子群列表的语义（信息面板那行说明的数据依据） ══════ */

  suite('usability · 子群列表是「共轭类代表」（缺口 ③）')
  {
    // 那个 tab 走 core 的 listCosetStripSubgroups：S₄ 只列 9 条，而真子群有 29 个（不含 G 自身）
    const r = buildLines(['G = S_4'])
    const g = r.objects[0].value
    ok('S₄ 建出来了', g.type === 'group')
    if (g.type === 'group') {
      eq('|S₄| = 24', g.group.order, 24)
    }
    // 用 `Sub(G)` 的条数作为"全部"的参照（它不含 G 自身）
    const sub = build(['G = S_4', 'S = Sub(G)']).byId('S')
    const total = sub?.value.type === 'subgroups' ? sub.value.subgroups.length : -1
    eq('`Sub(G)` 给 29 条（不含 G 自身）', total, 29)
    const norm = build(['G = S_4', 'N = 正规子群(G)']).byId('N')
    const normals = norm?.value.type === 'subgroups' ? norm.value.subgroups.length : -1
    eq('`正规子群(G)` 给 4 个（含平凡与自身）', normals, 4)
    // 两个操作的定义域不同：这正是"列表会骗人"的根源
    ok('两个操作的定义域确实不同（29 vs 4）', total !== normals)
  }
}
