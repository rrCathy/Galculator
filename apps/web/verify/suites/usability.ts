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
import { relationsFor } from '../../src/gal/relations'
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

  /* ══ ④ 关系层（U19）══════════════════════════════════════ */

  /**
   * 用户的原话："我想拉个箭头表示 A₄ 和 K 的包含关系，但做不到"。
   *
   * 那件事的**数据**其实一直在手上（`isNormal` / 元素 id 空间 / 指数），
   * 只是没有任何地方往外说。这一套钉住关系层的两条来源与一条纪律：
   *   - 来源决定的（`ker f` 的核必是定义域的正规子群）
   *   - 元素集包含（两个**独立建出来**的群之间也能发现）
   *   - **假阳性必须为 0**（这是最要紧的：朴素写法会让 `V₄ ≤ D₄` 成立）
   */
  suite('usability · 关系层：它落在哪儿、它对谁正规（缺口 ②）')
  {
    const LINES = [
      'G = S_4',
      'H = S_3',
      'f = 映射(G, H, s12→23, c→13)',
      'K = ker(f)',
      'A = A_4',
      'B = 闭包(G, (12)(34), (13)(24))',
      'Q = 商(G, K)',
    ]
    const { objects } = buildLines(LINES)
    const rel = (id: string) => relationsFor(objects.find((o) => o.id === id)!, objects)
    const find = (id: string, kind: string, other: string) =>
      rel(id).find((r) => r.kind === kind && r.other === other)

    // ── 舞台本身要先站得住（这几个数是手算的） ──
    eq('|S₄| = 24', (objects.find((o) => o.id === 'G')!.value as { group: { order: number } }).group.order, 24)
    const kv = objects.find((o) => o.id === 'K')!.value
    eq('K = ker f 的阶 = 4（V₄）', kv.type === 'group' ? kv.group.order : -1, 4)

    // ── ① 来源决定：核必是定义域的正规子群，指数 = 24/4 = 6 ──
    const ker = find('K', 'kernel', 'f')
    ok('K 有一条「核」关系（K = ker f）', !!ker, JSON.stringify(rel('K').map((r) => r.kind)))
    ok('那条说了 ⊴ 定义域', (ker?.detail ?? '').includes('⊴ S₄'), ker?.detail ?? '')
    ok('指数手算对上了：24 / 4 = 6', (ker?.detail ?? '').includes('24 / 4 = 6'), ker?.detail ?? '')

    // ── ② 元素集包含：A₄ 与 K 都是**独立建出来**的，没有任何来源牵连 ──
    const kInA = find('K', 'subgroup', 'A')
    ok('K ≤ A₄ 被发现了（V₄ ≤ A₄，两者互不是对方的来源）', !!kInA, JSON.stringify(rel('K').map((r) => `${r.kind}:${r.other}`)))
    ok('指数手算对上了：12 / 4 = 3', (kInA?.detail ?? '').includes('12 / 4 = 3'), kInA?.detail ?? '')
    ok('并且判出 ⊴ 正规（V₄ ⊴ A₄）', (kInA?.detail ?? '').includes('⊴ 正规'), kInA?.detail ?? '')

    const aInG = find('A', 'subgroup', 'G')
    ok('A₄ ≤ S₄ 被发现了（用户手打的两行独立定义）', !!aInG, JSON.stringify(rel('A').map((r) => `${r.kind}:${r.other}`)))
    ok('指数手算对上了：24 / 12 = 2', (aInG?.detail ?? '').includes('24 / 12 = 2'), aInG?.detail ?? '')
    ok('A₄ ⊴ S₄（指数 2 的子群必正规）', (aInG?.detail ?? '').includes('⊴ 正规'), aInG?.detail ?? '')

    // 反向：G 的信息面板里"我包含谁"
    const gHoldsA = find('G', 'contains', 'A')
    ok('S₄ 的面板里列出"包含 A₄"', !!gHoldsA, JSON.stringify(rel('G').map((r) => `${r.kind}:${r.other}`)))

    // ── 指数 1 = 同一个群：`ker f` 与 `闭包(G, …)` 都是 V₄，元素 id 一模一样 ──
    const eq1 = find('K', 'equal', 'B')
    ok('K 与 B（都是 V₄）被认成「同一个群」', !!eq1, JSON.stringify(rel('K').map((r) => `${r.kind}:${r.other}`)))
    ok('那句话说的是"元素完全相同"', (eq1?.detail ?? '').includes('元素完全相同'), eq1?.detail ?? '')
    ok('并且没有反过来再报一条 `B ≤ K · 指数 1`', !find('K', 'contains', 'B'))

    // ── 商：Q = G/K 是定义式，且商群良定义（K ⊴ G） ──
    const quo = find('Q', 'quotient', 'G')
    ok('商群有「商」关系 Q = G / K', !!quo, JSON.stringify(rel('Q').map((r) => `${r.kind}:${r.other}`)))
    ok('并给出 |Q| = 24 / 4 = 6', (quo?.detail ?? '').includes('24 / 4 = 6'), quo?.detail ?? '')

    // ── 派生：点箭头 f 能看到它长出了核 ──
    const derived = find('f', 'derived', 'K')
    ok('映射 f 的面板里列出派生出的 K', !!derived, JSON.stringify(rel('f').map((r) => `${r.kind}:${r.other}`)))

    // ── 纪律：假阳性必须为 0 ──
    //  V₄ 的 id 是 `e a b c`、D₄ 的 id 是 `r0…s3`，两者本无关系。
    //  朴素的"id 子集 + core 校验"写法在 D₄ 上会返回**平凡子群**（core 静默丢掉认不得的引用），
    //  于是得出 `V₄ ≤ D₄`——这条断言就是钉死它的。
    const falsePos = buildLines(['V = V_4', 'D = D_4']).objects
    const bogus = relationsFor(falsePos.find((o) => o.id === 'V')!, falsePos).filter(
      (r) => r.kind === 'subgroup' || r.kind === 'contains' || r.kind === 'equal',
    )
    eq('V₄ 与 D₄ 之间不该有任何包含关系（假阳性）', bogus.length, 0)

    //  两个各自声明的 `C_6`：元素是同一批 `e0…e5` → 判成"同一个群"是**对的**；
    //  错的是把它说成包含（"互相包含"读起来像两个东西）
    const same = buildLines(['X = C_6', 'Y = C_6']).objects
    const sameRel = relationsFor(same.find((o) => o.id === 'X')!, same)
    ok('两个 `C_6` 判成「同一个群」而不是包含', !sameRel.some((r) => r.kind === 'subgroup' || r.kind === 'contains'), JSON.stringify(sameRel.map((r) => r.kind)))
    ok('那条写着"元素完全相同"', sameRel.some((r) => r.kind === 'equal' && (r.detail ?? '').includes('元素完全相同')), JSON.stringify(sameRel))

    //  C₂ 与 C₄ 的 id 都是 `e0 e1 …`（真子集！），但 C₂ 在 C₄ 里的"嵌入"不封闭 →
    //  core 校验必须挡住它。这比上面的 V₄/D₄ 更阴险：id 真的全部命中。
    const cyc = buildLines(['A = C_2', 'B = C_4']).objects
    const cycRel = relationsFor(cyc.find((o) => o.id === 'A')!, cyc).filter(
      (r) => r.kind === 'subgroup' || r.kind === 'equal',
    )
    eq('C₂ 不因 id 恰好是 C₄ 的前缀而被判成子群', cycRel.length, 0)
  }
}
