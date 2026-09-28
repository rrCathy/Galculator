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
import { deriveCanvas } from '../../src/gal/derive'
import { evalExpr } from '../../src/gal/evalDef'
import { groupInsights } from '../../src/gal/insights'
import { isScalarParam, paramAccepts } from '../../src/gal/ops'
import { composeCall } from '../../src/gal/compose'
import { pairOps, singleOpsFor } from '../../src/gal/interaction'
import { checkName, normalizeName } from '../../src/gal/naming'
import { containment, relationsFor } from '../../src/gal/relations'
import { contextGroup, sortOf } from '../../src/gal/value'
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

/**
 * 值的一句话描述 —— **不许 `JSON.stringify(值)`**。
 *
 * `Group` 里有 `generators[].inverse` 指回生成元自己，是个环；
 * 直接 stringify 会抛 `Converting circular structure to JSON`，
 * 而且是在断言**失败**时才求值（第三参惰性？不——它总是求值），所以整份回归会崩在这里。
 * （verify/README 第 6 条记的就是这个坑。）
 */
const describeValue = (v: { type: string } | undefined): string => {
  if (!v) return 'undefined'
  if (v.type === 'group') {
    const g = (v as { group: { symbol: string; order: number } }).group
    return `group ${g.symbol} order=${g.order}`
  }
  if (v.type === 'relation') {
    const r = (v as { relation: { from: { order: number }; to: { order: number }; index: number; isNormal: boolean } }).relation
    return `relation index=${r.index} normal=${r.isNormal}`
  }
  return v.type
}

export function run(): void {
  /* ══ ① 结论区：构造出来的群不许沉默 ══════════════════════ */

  suite('usability \\cdot 结论区的判据（缺口 ①）')
  {
    // 手写的群记号 = 符号即答案，不重复说"同构于 S₄"
    eq('手写 `G = S_4` 只说 1 条（阶）', groupInsOf(['G = S_4']).labels.length, 1)
    eq('那一条是「阶」', groupInsOf(['G = S_4']).labels[0], '阶')

    // 由操作构造出来的群：即使符号与识别结果**归一后相同**，也要说
    //（`ker f` 的符号本来就是 `C_{2}`，不说的话信息面板里只剩一个"阶"）
    const ker = groupInsOf(['G = C_6', 'H = C_6', 'f = 映射(G, H, a\\to 2)', 'K = ker(f)'])
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
    ok('但会给「识别」+ V_4 的惯用名', klein.labels.includes('识别') && klein.insights.some((i) => (i.detail ?? '').includes('V_4')), JSON.stringify(klein.insights.map((i) => i.detail)))

    // 符号与识别结果真的不同 \\to 是「同构」（真结论）
    const q = groupInsOf(['G = S_4', 'N = 闭包(G, (12)(34), (13)(24))', 'Q = 商(G, N)'])
    ok('`商(G,N)`（符号 S_4/N）说「同构」', q.labels.includes('同构'), q.labels.join(','))
    ok(
      '那条写着 \\cong S_3',
      q.insights.some((i) => i.text.includes('S_3')),
      q.insights.map((i) => i.text).join(' | '),
    )

    // 闭包 / 自同构群也一样（它们都是"构造出来的"）
    ok('`闭包(G,r)` 有识别条', groupInsOf(['G = D_4', 'H = 闭包(G, r)']).labels.includes('识别'))
    const aut = groupInsOf(['G = S_4', 'A = Aut(G)'])
    ok('`Aut(S_4)` 说「同构」（Aut(S_4) \\cong S_4）', aut.labels.includes('同构'), aut.labels.join(','))
    ok('Aut 的识别带 SmallGroup(24, 11)', aut.insights.some((i) => (i.detail ?? '').includes('SmallGroup(24, 11)')), aut.insights.map((i) => i.detail).join(' | '))
  }

  /* ══ ⑤ 名字：只有一种形态（缺口 ⑥，方向随形态统一而变）═══════ */

  suite('usability \\cdot 名字里的 LaTeX 命令（缺口 ⑥）')
  {
    // 2026-09-27 之后的约定：名字只有**一种**形态 —— ASCII 或 LaTeX 命令。
    // 于是 `normalizeName` 只 trim，`\phi` 与 `\varphi` 是**两个**名字
    //（LaTeX 里它们排出来就不是同一个字符），不再归一。
    eq('`\\varphi` 就是名字本身（不再折成 \\varphi）', normalizeName('\\varphi'), '\\varphi')
    eq('`\\phi` 同理', normalizeName('\\phi'), '\\phi')
    eq('`\\Gamma` 也原样', normalizeName('\\Gamma'), '\\Gamma')
    eq('普通名字原样', normalizeName('  f  '), 'f')

    ok('`\\varphi` 是合法名字（全是 ASCII）', checkName('\\varphi', []).ok, checkName('\\varphi', []).error ?? '')
    ok('`\\phi` 也是', checkName('\\phi', []).ok)
    ok('`\\Omega` 也是', checkName('\\Omega', []).ok)
    ok('带空格的不行', !checkName('a b', []).ok)
    // 真字符 \\varphi 现在**不能**当名字了 —— 键盘打不出来
    // 样本用 `\u03c6` 转义写：它**正是**要被拦的那个字符，别被批量替换换掉
    ok('真字符 φ 不再是合法名字', !checkName('\u03c6', []).ok)
    ok('而且提示里给可照抄的改法', (checkName('\u03c6', []).hint ?? '').includes('\\varphi'), checkName('\u03c6', []).hint ?? '')
    // 两个别名是两个名字（不再归一）\\to 彼此不冲突
    ok('`\\phi` 与 `\\varphi` 互不重名', checkName('\\phi', ['\\varphi']).ok)
    ok('但同名还是拦', !checkName('\\phi', ['\\phi']).ok)
  }

  /* ══ ⑨ 报错：分清「没这功能」与「打错了」 ══════════════ */

  suite('usability \\cdot 报错文案（缺口 ⑨）')
  {
    // 2026-09-28（U27）起 `极大子群(G)` / `Burnside(A)` 都已接线 —— 换 `Hall子群(G)` 当
    // "没这功能"的样本（它仍在 `TASKS.md` 的缺口清单里）
    const tm = lastLine(['G = S_4', 'M = Hall子群(G)'])
    ok('未支持的操作报「没有名为…的操作」', (tm.error ?? '').includes('没有名为'), tm.error)
    ok('并猜一个相近的（Hall子群 -> Sub(G)）', (tm.hint ?? '').includes('Sub(G)'), tm.hint ?? '')

    const comp = lastLine(['G = D_4', 'A = 共轭作用(G)', 'n = 着色数(A)'])
    ok('着色数 报「没有这个操作」而不是「群记号认不出」', (comp.error ?? '').includes('没有名为'), comp.error)
    ok('不再把操作名当群记号（提示里没有"可用的群记号"）', !(comp.hint ?? '').includes('群记号'), comp.hint ?? '')

    // 单字母别名 `c`（组合数）曾让含 c 的未知名字匹配出"是不是想用 C(n,k)"这种驴唇不对马嘴的提示
    const hcf = lastLine(['n = hcf(12, 18)'])
    ok('hcf 不再误推荐 C(n,k)', !(hcf.hint ?? '').includes('C(n, k)'), hcf.hint ?? '')
    ok('hcf 仍报「没有这个操作」', (hcf.error ?? '').includes('没有名为'), hcf.error)

    // U27 接线之后的正面判据：`gcd` 真能算（在 suites/structure.ts 里逐值核对）
    const gcd = lastLine(['n = gcd(12, 18)'])
    ok('gcd 现在跑得通', gcd.ok === true, gcd.error ?? '')

    // `f(K)`：`f` 是个已定义的对象 —— 说清楚，别让用户以为打错了名字
    const fk = lastLine(['G = C_6', 'H = C_6', 'f = 映射(G, H, a\\to 2)', 'K = 闭包(G, 1)', 'I = f(K)'])
    ok('`f(K)` 报「f 是已定义的对象，不能当函数调用」', (fk.error ?? '').includes('已定义的对象'), fk.error)
    ok('并点明这个功能还没有', (fk.hint ?? '').includes('还没有'), fk.hint ?? '')

    // 真\\cdot打错字：保留原来的"无法识别"
    const typo = lastLine(['G = S_42x'])
    ok('乱写的记号仍是「无法识别」', (typo.error ?? '').includes('无法识别'), typo.error)
  }

  /* ══ ④ 关系行 vs 漏等号 ═════════════════════════════════ */

  suite('usability \\cdot 关系行与漏等号（缺口 ④ 的提示）')
  {
    for (const rel of ['H \\subseteq G', 'N \\trianglelefteq G', 'A \\cong B']) {
      const s = lastLine(['G = S_4', 'H = 闭包(G, r)', 'N = 正规子群(G)', 'A = C_6', 'B = C_6', rel])
      ok(`「${rel}」报「这是一个关系，不是定义」`, (s.error ?? '').includes('关系'), s.error)
      // 提示**必须跟着功能走**：U20 之后 `\\subseteq` 已经能写了，老话"还没有对应操作"就成了假话
      ok(`「${rel}」的提示里说清哪条能写`, (s.hint ?? '').includes('\\subseteq'), s.hint ?? '')
      ok(`「${rel}」不再说"还没有对应操作"`, !(s.hint ?? '').includes('没有对应操作'), s.hint ?? '')
    }
    // 真的只是漏了等号 \\to 保持原话
    const noEq = lastLine(['G = S_4', 'G S_4'])
    eq('真漏等号仍是「缺少「=」」', noEq.error, '缺少「=」')
  }

  /* ══ ③ 子群列表的语义（信息面板那行说明的数据依据） ══════ */

  suite('usability \\cdot 子群列表是「共轭类代表」（缺口 ③）')
  {
    // 那个 tab 走 core 的 listCosetStripSubgroups：S₄ 只列 9 条，而真子群有 29 个（不含 G 自身）
    const r = buildLines(['G = S_4'])
    const g = r.objects[0].value
    ok('S_4 建出来了', g.type === 'group')
    if (g.type === 'group') {
      eq('|S_4| = 24', g.group.order, 24)
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
   *   - **假阳性必须为 0**（这是最要紧的：朴素写法会让 `V₄ \\le D₄` 成立）
   */
  suite('usability \\cdot 关系层：它落在哪儿、它对谁正规（缺口 ②）')
  {
    const LINES = [
      'G = S_4',
      'H = S_3',
      'f = 映射(G, H, s12->23, c->13)',
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
    eq('|S_4| = 24', (objects.find((o) => o.id === 'G')!.value as { group: { order: number } }).group.order, 24)
    const kv = objects.find((o) => o.id === 'K')!.value
    eq('K = ker f 的阶 = 4（V_4）', kv.type === 'group' ? kv.group.order : -1, 4)

    // ── ① 来源决定：核必是定义域的正规子群，指数 = 24/4 = 6 ──
    const ker = find('K', 'kernel', 'f')
    ok('K 有一条「核」关系（K = ker f）', !!ker, JSON.stringify(rel('K').map((r) => r.kind)))
    ok('那条说了 \\trianglelefteq 定义域', (ker?.detail ?? '').includes('\\trianglelefteq S_4'), ker?.detail ?? '')
    ok('指数手算对上了：24 / 4 = 6', (ker?.detail ?? '').includes('24 / 4 = 6'), ker?.detail ?? '')

    // ── ② 元素集包含：A₄ 与 K 都是**独立建出来**的，没有任何来源牵连 ──
    const kInA = find('K', 'subgroup', 'A')
    ok('K \\le A_4 被发现了（V_4 \\le A_4，两者互不是对方的来源）', !!kInA, JSON.stringify(rel('K').map((r) => `${r.kind}:${r.other}`)))
    ok('指数手算对上了：12 / 4 = 3', (kInA?.detail ?? '').includes('12 / 4 = 3'), kInA?.detail ?? '')
    ok('并且判出 \\trianglelefteq 正规（V_4 \\trianglelefteq A_4）', (kInA?.detail ?? '').includes('\\trianglelefteq 正规'), kInA?.detail ?? '')

    const aInG = find('A', 'subgroup', 'G')
    ok('A_4 \\le S_4 被发现了（用户手打的两行独立定义）', !!aInG, JSON.stringify(rel('A').map((r) => `${r.kind}:${r.other}`)))
    ok('指数手算对上了：24 / 12 = 2', (aInG?.detail ?? '').includes('24 / 12 = 2'), aInG?.detail ?? '')
    ok('A_4 \\trianglelefteq S_4（指数 2 的子群必正规）', (aInG?.detail ?? '').includes('\\trianglelefteq 正规'), aInG?.detail ?? '')

    // 反向：G 的信息面板里"我包含谁"
    const gHoldsA = find('G', 'contains', 'A')
    ok('S_4 的面板里列出"包含 A_4"', !!gHoldsA, JSON.stringify(rel('G').map((r) => `${r.kind}:${r.other}`)))

    // ── 指数 1 = 同一个群：`ker f` 与 `闭包(G, …)` 都是 V₄，元素 id 一模一样 ──
    const eq1 = find('K', 'equal', 'B')
    ok('K 与 B（都是 V_4）被认成「同一个群」', !!eq1, JSON.stringify(rel('K').map((r) => `${r.kind}:${r.other}`)))
    ok('那句话说的是"元素完全相同"', (eq1?.detail ?? '').includes('元素完全相同'), eq1?.detail ?? '')
    ok('并且没有反过来再报一条 `B \\le K \\cdot 指数 1`', !find('K', 'contains', 'B'))

    // ── 商：Q = G/K 是定义式，且商群良定义（K \\trianglelefteq G） ──
    const quo = find('Q', 'quotient', 'G')
    ok('商群有「商」关系 Q = G / K', !!quo, JSON.stringify(rel('Q').map((r) => `${r.kind}:${r.other}`)))
    ok('并给出 |Q| = 24 / 4 = 6', (quo?.detail ?? '').includes('24 / 4 = 6'), quo?.detail ?? '')

    // ── 派生：点箭头 f 能看到它长出了核 ──
    const derived = find('f', 'derived', 'K')
    ok('映射 f 的面板里列出派生出的 K', !!derived, JSON.stringify(rel('f').map((r) => `${r.kind}:${r.other}`)))

    // ── 纪律：假阳性必须为 0 ──
    //  V₄ 的 id 是 `e a b c`、D₄ 的 id 是 `r0…s3`，两者本无关系。
    //  朴素的"id 子集 + core 校验"写法在 D₄ 上会返回**平凡子群**（core 静默丢掉认不得的引用），
    //  于是得出 `V₄ \\le D₄`——这条断言就是钉死它的。
    const falsePos = buildLines(['V = V_4', 'D = D_4']).objects
    const bogus = relationsFor(falsePos.find((o) => o.id === 'V')!, falsePos).filter(
      (r) => r.kind === 'subgroup' || r.kind === 'contains' || r.kind === 'equal',
    )
    eq('V_4 与 D_4 之间不该有任何包含关系（假阳性）', bogus.length, 0)

    //  两个各自声明的 `C_6`：元素是同一批 `e0…e5` \\to 判成"同一个群"是**对的**；
    //  错的是把它说成包含（"互相包含"读起来像两个东西）
    const same = buildLines(['X = C_6', 'Y = C_6']).objects
    const sameRel = relationsFor(same.find((o) => o.id === 'X')!, same)
    ok('两个 `C_6` 判成「同一个群」而不是包含', !sameRel.some((r) => r.kind === 'subgroup' || r.kind === 'contains'), JSON.stringify(sameRel.map((r) => r.kind)))
    ok('那条写着"元素完全相同"', sameRel.some((r) => r.kind === 'equal' && (r.detail ?? '').includes('元素完全相同')), JSON.stringify(sameRel))

    //  C₂ 与 C₄ 的 id 都是 `e0 e1 …`（真子集！），但 C₂ 在 C₄ 里的"嵌入"不封闭 \\to
    //  core 校验必须挡住它。这比上面的 V₄/D₄ 更阴险：id 真的全部命中。
    const cyc = buildLines(['A = C_2', 'B = C_4']).objects
    const cycRel = relationsFor(cyc.find((o) => o.id === 'A')!, cyc).filter(
      (r) => r.kind === 'subgroup' || r.kind === 'equal',
    )
    eq('C_2 不因 id 恰好是 C_4 的前缀而被判成子群', cycRel.length, 0)
  }

  /* ══ ⑤ 第三批：子群像 + 声明包含（U20）═══════════════════ */

  /**
   * 用户原始投诉的 ③ 与 ④：
   *   "我想拉个箭头表示 A₄ 和 K 的包含关系，但做不到，没这个功能"
   *   "f(A₄) 怎么创建？直接拖到 f 上？没这个功能"
   *
   * 这一套钉住两个新操作，以及一条**判据同源**纪律：
   * `包含(H, G)` 用的一定是 U19 那份 `containment()` —— 声明的和算出来的不许有两种说法。
   */
  suite('usability \\cdot 子群像 f(H) 与声明包含 H \\subseteq G（缺口 ③④）')
  {
    const STAGE = ['G = S_4', 'H = S_3', 'f = 映射(G, H, s12->23, c->13)', 'K = ker(f)', 'A = A_4']

    /* ── ① 子群像 ── */

    // f: S₄ \\twoheadrightarrow S₃（ker = V₄），A₄ \\subseteq S₄。A₄ 的像 = S₃ 里唯一的 3 阶子群 = C₃
    //（课本说法：A₄/V₄ \\cong C₃ —— 而 A₄ 的像就是 A₄V₄/V₄ = S₃ 的那个 C₃）
    const fa = build([...STAGE, 'FA = 像(f, A)'])
    const faV = fa.byId('FA')?.value
    ok('`像(f, A_4)` 建出来了', faV?.type === 'group', faV?.type)
    eq('f(A_4) 的阶 = 3（手算：A_4 的像 \\cong C_3）', faV?.type === 'group' ? faV.group.order : -1, 3)
    eq('f(A_4) 的符号是 C_3', faV?.type === 'group' ? faV.group.symbol : '', 'C_{3}')
    eq('来源记了 (f, A_4) 两个', fa.byId('FA')?.sources.join(','), 'f,A')
    eq('命中 op 是 image', fa.byId('FA')?.opId, 'image')

    // 单参形态没被破坏（U14 就有：`im f` 是整个像）
    const whole = build([...STAGE, 'I = 像(f)'])
    const iv = whole.byId('I')?.value
    eq('`像(f)` 仍是整个像（S_4->>S_3 满射 -> 6 阶）', iv?.type === 'group' ? iv.group.order : -1, 6)

    // 两种像的**叙述**不能混：`f(A)` 不是 `im f`
    {
      const two = relationsFor(fa.byId('FA')!, fa.objects).find((r) => r.kind === 'image')
      ok('两参形态叙述成「f(A)」，不叫 im f', (two?.text ?? '').includes('f(A)'), two?.text)
      ok('并且点出是 A 的像', (two?.detail ?? '').includes('A 在 f 下的像'), two?.detail)

      const one = relationsFor(whole.byId('I')!, whole.objects).find((r) => r.kind === 'image')
      ok('单参形态仍叙述成「im f」', (one?.text ?? '').includes('im f'), one?.text)
    }

    // 不是定义域的子群 \\to 拦住
    const notSub = build([...STAGE, 'H2 = 像(f, H)'])
    ok(
      '`像(f, S_3)` 被拦（S_3 不是 S_4 的子群）',
      notSub.byId('H2') === undefined,
      describeValue(notSub.byId('H2')?.value),
    )
    const tooBig = build([...STAGE, 'C = C_24', 'X = 像(f, C)'])
    ok(
      '`像(f, C_24)`（比定义域还大）被拦',
      tooBig.byId('X') === undefined,
      describeValue(tooBig.byId('X')?.value),
    )

    /* ── ② 声明包含：三种写法等价 ── */

    const forms = ['R = A \\subseteq G', 'R = A\\subseteq G', 'R = 包含(A, G)']
    for (const line of forms) {
      const b = build([...STAGE, line])
      const r = b.byId('R')?.value
      ok(`「${line}」建出关系`, r?.type === 'relation', describeValue(r))
      eq(`「${line}」指数 = 24/12 = 2`, r?.type === 'relation' ? r.relation.index : -1, 2)
      eq(`「${line}」判出正规（A_4 \\trianglelefteq S_4）`, r?.type === 'relation' ? r.relation.isNormal : null, true)
      eq(`「${line}」来源 = (A_4, S_4)`, b.byId('R')?.sources.join(','), 'A,G')
    }

    /* ── ③ 判据同源：操作的结果与关系层的判定必须一致 ── */

    {
      const b = build([...STAGE, 'R = A \\subseteq G'])
      const r = b.byId('R')?.value
      const av = b.byId('A')?.value
      const gv = b.byId('G')?.value
      if (r?.type === 'relation' && av?.type === 'group' && gv?.type === 'group') {
        const c = containment(av.group, gv.group)
        eq('关系里的指数 = containment() 的指数', r.relation.index, c?.index ?? -1)
        eq('关系里的正规 = containment() 的正规', r.relation.isNormal, c?.normal === true)
      } else {
        ok('关系 / 两个群都在', false)
      }
    }

    /* ── ④ 假声明全被拦（每一条都给了可读的理由） ── */

    const bad: [string, string[]][] = [
      ['D_4 不是 S_4 的子群（id 空间不同）', [...STAGE, 'D = D_4', 'R = D \\subseteq G']],
      ['C_2 不是 C_4 的子群（id 是真前缀，但乘法不封闭）', ['X = C_2', 'Y = C_4', 'R = X \\subseteq Y']],
      ['阶更大的不能当子群', ['X = C_4', 'Y = C_2', 'R = X \\subseteq Y']],
      ['同一个对象', ['G = S_4', 'R = G \\subseteq G']],
      ['元素完全相同（两个 C_6）', ['X = C_6', 'Y = C_6', 'R = X \\subseteq Y']],
    ]
    for (const [name, lines] of bad) {
      const b = build(lines)
      const last = b.lineStates[b.lineStates.length - 1]
      ok(`${name} -> 报错`, !last.ok && b.byId('R') === undefined, JSON.stringify(last.error))
      ok(`${name} -> 报错里说清了理由`, (last.error ?? '').length > 6, last.error)
    }

    /* ── ⑤ 正规性由工具判定：非正规的画 `\\hookrightarrow` 而不是 `\\trianglelefteq` ── */

    {
      const b = build(['G = S_3', 'P = 闭包(G, (12))', 'R = P \\subseteq G'])
      const r = b.byId('R')?.value
      eq('S_3 里 2 阶子群判为非正规', r?.type === 'relation' ? r.relation.isNormal : null, false)
      eq('指数 = 6/2 = 3', r?.type === 'relation' ? r.relation.index : -1, 3)
      const g = deriveCanvas(b.objects)
      const e = g.edges.find((x) => x.kind === 'relation')
      ok('画布上有关系边', !!e, JSON.stringify(g.edges.map((x) => x.kind)))
      eq('非正规 -> 标签是 \\hookrightarrow', e?.label, '\\hookrightarrow')
      ok('关系边可点选（带 objectId）', e?.objectId === 'R', e?.objectId)
    }

    /* ── ⑥ 声明的包含压过自动生成的同向 \\hookrightarrow（不叠两条箭头） ── */

    {
      const b = build(['G = S_3', 'P = 闭包(G, (12))', 'R = P \\subseteq G'])
      const g = deriveCanvas(b.objects)
      const between = g.edges.filter((e) => e.from === 'P' && e.to === 'G')
      eq('P->G 上只剩一条边', between.length, 1)
      eq('留下的是声明的那条', between[0]?.kind, 'relation')
    }

    /* ── ⑦ 关系不上画布：它是边不是顶点 ── */

    {
      const b = build([...STAGE, 'R = A \\subseteq G'])
      const g = deriveCanvas(b.objects)
      ok('关系不占节点', !g.nodes.some((n) => n.id === 'R'), JSON.stringify(g.nodes.map((n) => n.id)))
      const r = b.byId('R')?.value
      ok('存在层级是 edge', r ? sortOf(r) === 'edge' : false, r ? sortOf(r) : 'n/a')
      ok('上下文群取母群', r?.type === 'relation' ? contextGroup(r)?.symbol === 'S_{4}' : false)
    }

    /* ── ⑧ 报错与提示跟着更新（老文案会说"还没有对应操作"） ── */

    {
      // 无等号的关系行（定义表那条路）
      const s = lastLine(['G = S_4', 'H = S_3', 'H \\subseteq G'])
      ok('`H \\subseteq G` 仍是「写的是一个关系」', (s.error ?? '').includes('关系'), s.error)
      ok('但提示改口了：说清 \\subseteq 能写', (s.hint ?? '').includes('\\subseteq'), s.hint ?? '')
      ok('不再说"还没有对应操作"', !(s.hint ?? '').includes('没有对应操作'), s.hint ?? '')

      // `R = A \\subseteq K`（K 打错）\\to 报"是谁算不出来"，而不是答非所问的关系提示
      const t = lastLine([...STAGE, 'R = A \\subseteq K9'])
      ok('`A \\subseteq K9` 报「K9」算不出来', (t.error ?? '').includes('K9'), t.error)
    }
  }

  /* ══ ⑥ 第四批：拖拽连线的候选 + 面板「可做」（缺口 ⑩⑤）═════ */

  /**
   * 拖拽连线的**候选**（`pairOps`）是这一批的核心：它是"这两个能凑出什么"的唯一判据。
   *
   * 最要紧的一条纪律：**菜单不撒谎** —— 列出来的候选点下去必须真的能跑
   * （或至少是"要弹编辑器 / 补参条"），不许出现点了必然报错的项。
   * 这条纪律逼出了 `ParamType` 的一次拆分（U21）：从前 `subset` 一型两用，
   * 对**子群集列表**一律回 true，而多数 op 其实吃不下它。
   */
  suite('usability \\cdot 拖拽连线的候选与「可做」（缺口 ⑩⑤）')
  {
    const STAGE = [
      'G = S_4',
      'H = S_3',
      'f = 映射(G, H, s12->23, c->13)',
      'K = ker(f)',
      'A = A_4',
      'Syl = Syl_p(G, 3)',
    ]
    const bs = buildLines(STAGE)
    const objects = bs.objects
    const obj = (id: string) => objects.find((o) => o.id === id)!
    const table = new Map(objects.map((o) => [o.id, o]))
    const pair = (x: string, y: string) => pairOps(obj(x).value, obj(y).value)

    /* ── ① 用户的剧本：拖 A₄ 到 f 上 \\to **唯一候选**（于是直接执行，不弹菜单） ── */

    const fa = pair('A', 'f')
    eq('拖 A_4 到 f 上：只有 1 个候选', fa.length, 1)
    eq('那个候选是「像」', fa[0]?.op.id, 'image')
    // 拖拽不表达顺序：从 A₄ 起拖，而 `像(f, H)` 的 f 必须在前面 \\to
    // 候选要自己标出"参数得反过来摆"，否则会拼出 `像(A₄, f)` 而报错
    eq('标了 swapped（参数要反过来摆）', fa[0]?.swapped, true)
    eq('从 f 起拖就不用反（同一个 op，两个方向都认）', pair('f', 'A')[0]?.swapped, false)

    /* ── ② 单对象操作不许混进来 ── */

    ok(
      '拖 A_4 到 f 上不会冒出「核」（它只用 f 一个对象）',
      !fa.some((c) => c.op.id === 'kernel'),
      fa.map((c) => c.op.id).join(','),
    )

    /* ── ③ 排序：声明包含在最前 ── */

    const ag = pair('A', 'G')
    eq('拖 A_4 到 S_4 上：第一条是「包含」', ag[0]?.op.id, 'contains')
    // 反着拖也列「包含」——**方向由判据定**（A₄ 才是子群），所以标 swapped
    const ga = pair('G', 'A').find((c) => c.op.id === 'contains')
    ok('反着拖（S_4 -> A_4）也列「包含」', !!ga, pair('G', 'A').map((c) => c.op.id).join(','))
    eq('而且标了 swapped（参数会摆成 (A_4, S_4)）', ga?.swapped, true)
    ok(
      '两个不相干的群之间（S_4 与 S_3）没有「包含」',
      !pair('G', 'H').some((c) => c.op.id === 'contains'),
      pair('G', 'H').map((c) => c.op.id).join(','),
    )
    ok('而且候选不止一个（所以会弹菜单让用户挑）', ag.length > 1, ag.map((c) => c.op.id).join(','))

    /* ── ④ 拆分的直接成果：吃不下子群集的 op 不再出现 ── */

    const sylG = pair('Syl', 'G').map((c) => c.op.id)
    for (const id of ['conjugationOnSet', 'cosetAction', 'centralizer', 'normalizer']) {
      ok(`子群集 + 群：不再列出「${id}」（它吃不下一个列表）`, !sylG.includes(id), sylG.join(','))
    }
    eq('子群集 + 群：一个候选都不剩（列表跟群凑不出"用到两个"的操作）', sylG.length, 0)

    /* ── ⑤ **菜单不撒谎**：逐个候选 dry-run ── */

    {
      const combos: [string, string][] = [
        ['A', 'f'],
        ['f', 'A'],
        ['A', 'G'],
        ['G', 'A'],
        ['K', 'G'],
        ['K', 'A'],
        ['G', 'H'],
        ['Syl', 'G'],
        ['f', 'G'],
        ['G', 'f'],
      ]
      const lies: string[] = []
      for (const [x, y] of combos) {
        for (const c of pair(x, y)) {
          const picked = c.swapped ? [y, x] : [x, y]
          const mk = (order: string[]) => {
            const args: (string | null)[] = c.op.params.map((_, i) => order[i] ?? null)
            const expr = composeCall(c.op, args)
            return expr ? evalExpr(expr, table) : null
          }
          const r = mk(picked)
          // 三种"点下去也没错"的例外：正序通 \\cdot 反序通（App 的 dispatchPairOp 会翻过去）\\cdot
          // 要进编辑器（映射）或要补标量（补参条）
          const needsMore = c.op.editor === true || c.op.params.some((p) => isScalarParam(p.type))
          const revOk = !!mk([y, x])?.ok
          if (!r?.ok && !needsMore && !revOk) {
            const why = r && !r.ok ? r.error : 'composeCall 拼不出调用'
            lies.push(`${x}->${y} ${c.op.id}${c.swapped ? '(反)' : ''} :: ${why}`)
          }
        }
      }
      eq('候选点下去都跑得通（没有"点了必错"的项）', lies.length, 0)
      if (lies.length > 0) ok('  ↳ 撒谎的候选', false, lies.join(' | '))
    }

    /* ── ⑥ 面板「可做」：子群集能一键 底集，之后整条 Sylow 链就通了 ── */

    {
      const one = singleOpsFor(obj('Syl').value).map((o) => o.id)
      ok('子群集的「可做」里有 底集', one.includes('underlyingSet'), one.join(','))

      // 缺口 ⑤ 的判据：那一步**点得出来**，而且点出来之后下一环真的接得上
      const chain = build([...STAGE, '\\Omega = 底集(Syl)', 'Act = 共轭作用在(G, \\Omega)'])
      const omega = chain.byId('\\Omega')?.value
      eq('`底集(Syl)` 产出集合', omega?.type, 'set')
      eq('集合基数 = n_3 = 4（手算）', omega?.type === 'set' ? omega.set.members.length : -1, 4)
      ok('接着 `共轭作用在(G, \\Omega)` 能建出来', chain.byId('Act')?.value.type === 'action')
      eq(
        '作用点集的基数就是 n_3（Sylow III 的主角动作据此算出来）',
        chain.byId('Act')?.value.type === 'action' ? chain.byId('Act')!.value.action.n : -1,
        4,
      )
    }

    /* ── ⑦ ParamType 拆分的判据本身（subset / setlike / omega） ── */

    {
      const lst = obj('Syl').value
      eq('子群集列表的成员数 = 4', lst.type === 'subgroups' ? lst.subgroups.length : -1, 4)
      ok('`setlike` 收整个子群集列表', paramAccepts('setlike', lst, []))
      ok('`subset` **不收** 4 个成员的子群集', !paramAccepts('subset', lst, []))
      ok('`omega` 也不收（\\Omega 走 omegaArgOf，只要单个数集）', !paramAccepts('omega', lst, []))

      // A₄ 的 n₂ = 1（V₄ 是唯一的 Sylow 2-子群）\\to 这个列表恰好一个成员
      const single = buildLines(['G = A_4', 'P = Syl_p(G, 2)']).objects.find((o) => o.id === 'P')
      const sv = single?.value
      eq('`Syl_2(A_4)` 恰好一个成员（n_2 = 1）', sv?.type === 'subgroups' ? sv.subgroups.length : -1, 1)
      ok(
        '而"恰好一个成员"的子群集当单个数集读（`商(G,N)` 就靠这条）',
        !!sv && paramAccepts('subset', sv, []),
        sv?.type,
      )
      ok('`底集` 那个类型（`setlike`）两种都收', !!sv && paramAccepts('setlike', sv, []))

      const gv = obj('A').value
      ok('`omega` 收群对象（当集合读）', paramAccepts('omega', gv, []))
      ok('`subset` 也收群对象', paramAccepts('subset', gv, []))
    }
  }
}
