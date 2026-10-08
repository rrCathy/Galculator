/**
 * U53 回归线（2026-10-02）：**任意阶集合** —— 点集构造器 + Ω 当参数。
 *
 * 起因是用户的一句质问（U52 刚推上去之后）：
 *
 *   「逗我吗，连任意阶集合都创建不了，怎么创建自定义群作用？你做了半天做了什么？」
 *
 * 侦察下来**用户是对的**（`.tmp-u53/probe2.ts` 真跑）：
 *
 * | 写法 | 实测 |
 * |---|---|
 * | `{1,2,3}` | 「无法识别的群记号」 |
 * | `labeledSet(1,2,3)` / `pointSet(5)` | 「没有这个操作」 |
 * | `asSet(S)` | 要 `S` **已经存在**（子群集 / 元素集 / 群）|
 *
 * 也就是说能造 `set` 的只有 `底集`，而它要求**集合的点从某个已存在的群里借**。
 * 后果直接打在 U52 上：`自定义作用` 的第二参是个数字 `n`，
 * 于是 Ω 永远是内核 `omegaOf()` 硬造的 `{1..n}`，**"让 G 作用在你自己的集合上"
 * 根本表达不出来**（`customAction(S_4, asSet(Syl(S_4, 3)), s12 -> (12))`
 * 报「作用点集的基数 n 必须是正整数」）。
 *
 * 用户拍板范围 = **集合构造器 + Ω 当参数**，两条一起才闭环。
 *
 * ── 本套守的判据 ───────────────────────────────────────────────
 *   ① **凭空造点集**：`pointSet(5)` / `labeledSet(a, b, c)` 不借任何群；
 *      `GalSet.group` 从此可以是 **`null`**（别退化成"母群 = `C_1`"）；
 *   ② **歧义不许猜**：`labeledSet(5)` 两种读法都通 ⇒ 报错指路 `pointSet(5)`；
 *   ③ **标号优先，但数字段归 core**：`(a b c)` 按标号翻，`(12)(34)` **原样**
 *      （紧凑写法是 core 的主力形态，切成"记号 12"会把"点 1 和点 2"读错 —— 实测踩过）；
 *   ④ **同一个作用两条路定义必须得到同一个置换表**（手算锚点写在下面）；
 *   ⑤ **老写法不坏**：`customAction(C_4, 4, …)` 逐字照旧（U52 的契约）；
 *   ⑥ **纯文本面零泄漏**（与 `e2e/no-unicode-leak.mjs` 的 `ALLOWED` 逐字同一套）。
 *
 * ⚠️ **期望值全部手算**，不从运行结果抄。手算过程：
 *
 *   `pointSet(5)`：5 个抽象点，点号 `1..5`，`group = null`（不属于任何群）。
 *
 *   `labeledSet(a, b, c)`：3 个点，标号就是 `a b c`。
 *
 *   `customAction(C_4, 4, a -> (1 2 3 4))`（老写法）：
 *     `a` 阶 4、像也是 4 阶 ⇒ 单射 ⇒ 忠实；4-循环在 4 个点上只有一个轨道 ⇒ 传递。
 *
 *   `customAction(C_4, pointSet(8), a -> (1 2 3 4)(5 6 7 8))`：
 *     像的阶 = lcm(4, 4) = 4 = `a` 的阶 ⇒ 忠实；两个 4-循环 ⇒ **2 个轨道**（各 4 点）。
 *
 *   `customAction(S_3, labeledSet(a, b, c), s12 -> (a b), s23 -> (b c))`：
 *     标号 `a b c` 的位置号是 `1 2 3`，所以这就是 S_3 在 3 个点上的**自然作用**
 *     ——`s12` 与 `s23` 一起生成 S_3 ⇒ 忠实、传递（1 个轨道、3 个点）。
 *
 *   `customAction(C_4, 8, a -> (1 2 3 4)(5 6 7 8))` 上的下游（手算）：
 *     · `orbits(A, 1)` = `{1,2,3,4}`（4 个点）
 *     · `stabilizer(A, 1)` = 1 阶（`a` 把 1 送到 2、`a²` 送到 3、`a³` 送到 4，只有 `e` 不动它）
 *     · `fix(A)` = 空（8 个点全被 `a` 搬走）
 *     · `burnside(A)` —— Burnside：`(8 + 0 + 0 + 0) / 4 = 2`
 *
 *   `S_3` 在 `labeledSet(a, b, c)` 上（同上那个作用）：
 *     · `orbits(A, a)` = 全部 3 个点（传递）
 *     · `stabilizer(A, c)` = `{e, s12}`（`s12` 换 a/b 不动 c；`s23` 动 c）⇒ **2 阶**
 *
 *   **交叉核对**（本套最硬的一条）：`S_4` 上的共轭作用在它的 4 个 Sylow 3-子群上，
 *   用「现成的集合」（`asSet(Syl(S_4, 3))`）当 Ω 手给两个生成元的像，
 *   必须与内置的 `共轭作用在` 得到**同一张置换表**。手算锚点：
 *     Ω = `{H1=⟨(234)⟩, H2=⟨(123)⟩, H3=⟨(124)⟩, H4=⟨(134)⟩}`
 *     · `s12 = (12)`：`H1 ↦ H4`（`(12)(234)(12)` 生成 `(134)`）· `H2 ↦ H2` ·
 *       `H3 ↦ H3` · `H4 ↦ H1` ⇒ 1 起位置写成 **(1 4)**
 *     · `c = (1234)`（`σ: 1→2, 2→3, 3→4, 4→1`）：
 *       `H1 ↦ H4`（`σ(2)σ(3)σ(4) = (3 4 1)`）· `H2 ↦ H1`（`(2 3 4)`）·
 *       `H3 ↦ H2`（`(2 3 1) = (123)`）· `H4 ↦ H3`（`(2 4 1) = (124)`）
 *       ⇒ `1→4 2→1 3→2 4→3` = **(1 4 3 2)**
 *
 *   （两条路的置换**都要**对上手算值 —— 只比"两条路相同"是不够的：一起错也相同。）
 */
import { computeOrbits, getGeneratorElements, type Group, type GroupElement } from '@groupviz/core'
import { build, eq, ok, suite } from '../harness'
import {
  CUSTOM_ACTION_POINT_CAP,
  IDENTITY_TOKEN,
  omegaSpecOfValue,
  planCustomAction,
} from '../../src/gal/customAction'
import { menuLabel, multiOps } from '../../src/gal/interaction'
import { OPS, opById, opTemplate, opsFor } from '../../src/gal/ops'
import {
  POINT_SET_MAX,
  labelCycleToNumeric,
  labelWritable,
  labelsHint,
  planCountPointSet,
  planLabeledPointSet,
  resolvePointToken,
} from '../../src/gal/pointSet'
import type { GalAction, GalSet, GalValue } from '../../src/gal/value'

type Built = ReturnType<typeof build>

/** 取某行的集合值（不是集合就 null）。 */
function setOf(b: Built, id: string): GalSet | null {
  const o = b.byId(id)
  return o?.value.type === 'set' ? o.value.set : null
}

/** 取某行的群（不是群就 null）。 */
function groupOf(b: Built, id: string): Group | null {
  const o = b.byId(id)
  return o?.value.type === 'group' ? o.value.group : null
}

/** 取某行的作用值（不是作用就 null）。 */
function actionOf(b: Built, id: string): GalAction | null {
  const o = b.byId(id)
  return o?.value.type === 'action' ? o.value.action : null
}

/** 取某行的数值（不是数值就 null）。 */
function numOf(b: Built, id: string): number | null {
  const o = b.byId(id)
  return o?.value.type === 'number' ? o.value.value : null
}

/** 一行字符串的「成功串 / 失败串」（成对返回，免得各写一遍）。 */
function shownOf(lines: string[]): { sub: string; note: string; err: string; hint: string } {
  const b = build(lines)
  const name = lines[lines.length - 1].split('=')[0].trim()
  const st = b.line(name)
  if (st?.ok) return { sub: st.object?.sub ?? '', note: st.object?.note ?? '', err: '', hint: '' }
  return { sub: '', note: '', err: st?.error ?? '', hint: st?.hint ?? '' }
}

/** `labelCycleToNumeric` 的成功串（失败给空串）。 */
function rewrite(labels: readonly string[], cycle: string): string {
  const r = labelCycleToNumeric(labels, cycle)
  return r.ok ? r.numeric : ''
}

/** 一个 0 起的置换 → 串（比较用；置换短，用不着指纹）。 */
const permKey = (p: readonly number[] | undefined) => (p ?? []).join(',')

/* ── 纯文本面判据（与 u51 / u52 逐字同一套）───────────────── */

/**
 * 与 `e2e/no-unicode-leak.mjs` 的 `ALLOWED` **逐字相同**：放行 ASCII / 中文 /
 * 中文标点 / 中文引号 / 空白。破折号、⇒、希腊字母一律不放行。
 */
const PLAIN_OK = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const leakChars = (s: string) => [...new Set([...s].filter((c) => !PLAIN_OK.test(c)))]

function audit(strings: { what: string; text: string }[]): void {
  for (const s of strings) {
    if (!s.text) continue
    ok(`${s.what}：没有键盘打不出的字符`, leakChars(s.text).length === 0, leakChars(s.text).join(' '))
  }
}

export function run(): void {
  /* ══ 1 · 凭空造点集：`pointSet(n)` ═══════════════════════════ */

  suite('u53 \\cdot pointSet(n)：凭空造 n 个抽象点')

  {
    const b = build(['P = pointSet(5)'])
    eq('能建出来', b.err('P'), null)
    const S = setOf(b, 'P')
    ok('产出的是集合值', !!S)
    if (S) {
      eq('点数 = 5', S.members.length, 5)
      eq('点号就是 1..5', S.members.map((m) => m.label).join(','), '1,2,3,4,5')
      /*
       * **`group = null` 是本批最要紧的一个字**（U53）：一批抽象点不属于任何群。
       * 别退化成"取 `C_1` 当母群" —— 那是两件事，而且会把
       * `G 与 Ω 来自不同的群` 那道关也一起骗过。
       */
      ok('没有母群（不是取 C_1 糊过去）', S.group === null, S.group ? '有母群' : 'null')
      eq('展示名', S.label, 'pointSet(5)')
    }
    eq('副行说清点号范围', shownOf(['P = pointSet(5)']).sub, '|Omega| = 5, 点号 1 到 5')

    const one = build(['P = pointSet(1)'])
    eq('pointSet(1) 也建得出（单点舞台）', one.err('P'), null)
    eq('  点数 1', setOf(one, 'P')?.members.length, 1)
  }

  /* ══ 2 · 凭空造点集：`labeledSet(a, b, c)` ═════════════════════ */

  suite('u53 \\cdot labeledSet(·)：标号由你定，标号能写进循环记号')

  {
    const b = build(['X = labeledSet(a, b, c)'])
    eq('能建出来', b.err('X'), null)
    const S = setOf(b, 'X')
    eq('3 个点', S?.members.length, 3)
    eq('标号就是写的那串', S?.members.map((m) => m.label).join(','), 'a,b,c')
    ok('同样没有母群', S?.group === null)
    eq('展示名是花括号形态（\\{…\\} 是 KaTeX 的字面花括号，2026-10-07）', S?.label, '\\{a, b, c\\}')
    eq('副行列出点号', shownOf(['X = labeledSet(a, b, c)']).sub, '|Omega| = 3, 点号 a b c')

    // 中文标号也认（`no-unicode-leak` 放行中文，所以这不是泄漏面）
    const cn = build(['X = labeledSet(红, 绿)'])
    eq('中文标号能建', cn.err('X'), null)
    eq('  2 个点', setOf(cn, 'X')?.members.length, 2)
    eq('  标号保真', setOf(cn, 'X')?.members.map((m) => m.label).join(','), '红,绿')
  }

  /* ══ 2b · 花括号糖：`{a, b, c}` 直接写（2026-10-07 用户点名）══════════════ */

  suite('u53 \\cdot 花括号糖：{a, b, c} 直接写，不必学函数名')

  {
    const b = build(['X = {a, b, c}'])
    eq('{a, b, c} 能建出来', b.err('X'), null)
    const S = setOf(b, 'X')
    eq('3 个点', S?.members.length, 3)
    eq('标号就是写的那串', S?.members.map((m) => m.label).join(','), 'a,b,c')
    ok('没有母群', S?.group === null)
    eq('展示名与 labeledSet 同一形态', S?.label, '\\{a, b, c\\}')

    // 与手写 labeledSet 一个答案：糖只是输入层的改写，不另造一套构造
    const lb = build(['Y = labeledSet(a, b, c)'])
    eq('与 labeledSet(a, b, c) 逐点相同',
      JSON.stringify(S?.members.map((m) => m.label)),
      JSON.stringify(setOf(lb, 'Y')?.members.map((m) => m.label)))

    // 带空格的写法照样归一（规范化层顺手 trim）
    const sp = build(['X = { a , b , c }'])
    eq('{ a , b , c }（带空格）同样能建', setOf(sp, 'X')?.members.length, 3)

    // 歧义关照旧：{5} 不许猜（单整数两种读法），报错沿 labeledSet 的口径指路
    const amb = shownOf(['X = {5}'])
    ok('{5} 拦下（两种读法，不许猜）', amb.err.includes('读不出来'), amb.err)
    ok('  hint 指路 pointSet(5)', amb.hint.includes('pointSet(5)'), amb.hint)

    // 空集合照旧拦
    const empty = shownOf(['X = {}'])
    ok('{} 拦下（至少要给一个点）', empty.err.includes('至少要给一个点'), empty.err)
  }

  /* ══ 3 · 报错：每一条都要指路，不许猜 ═════════════════════ */

  suite('u53 \\cdot 点集的报错语：歧义与非法标号都指路')

  {
    // `labeledSet(5)`：两种读法都通 ⇒ 不许猜，指路 `pointSet(5)`
    const amb = shownOf(['X = labeledSet(5)'])
    ok('labeledSet(5) 拦下', amb.err.includes('读不出来'), amb.err)
    ok('  说清两种读法', amb.err.includes('5 个点') && amb.err.includes('一个叫 5 的点'), amb.err)
    ok('  hint 指路 pointSet(5)', amb.hint.includes('pointSet(5)'), amb.hint)

    // 重复标号
    const dup = shownOf(['X = labeledSet(a, a)'])
    ok('标号重复拦下', dup.err.includes('出现了两次'), dup.err)
    ok('  hint 说清规则', dup.hint.includes('互不相同'), dup.hint)

    // 标号写不进循环记号（空格 / 圆括号 / 逗号是记号自己的语法）
    const bad = shownOf(['X = labeledSet(a b)'])
    ok('带空格的标号拦下', bad.err.includes('写不进循环记号'), bad.err)
    ok('  hint 点名三个禁用字符', bad.hint.includes('空格') && bad.hint.includes('逗号'), bad.hint)

    // 空集合
    const empty = shownOf(['X = labeledSet()'])
    ok('labeledSet() 拦下', empty.err.includes('至少要给一个点'), empty.err)

    // 点数：0 / 小数各说同一句"必须是正整数"；超线单独一句
    const zero = shownOf(['P = pointSet(0)'])
    ok('pointSet(0) 拦下', zero.err.includes('必须是正整数'), zero.err)
    ok('  hint 给出照抄就能跑的写法', zero.hint.includes('pointSet(5)'), zero.hint)
    const frac = shownOf(['P = pointSet(2.5)'])
    ok('pointSet(2.5) 同样拦下（小数不是点数）', frac.err.includes('必须是正整数'), frac.err)
    ok('  报错里带上收到的那个数', frac.err.includes('2.5'), frac.err)
    const neg = shownOf(['P = pointSet(0 - 3)'])
    ok('负数同样拦下', neg.err.includes('必须是正整数'), neg.err)
    const big = shownOf([`P = pointSet(${POINT_SET_MAX + 1})`])
    ok(`pointSet(${POINT_SET_MAX + 1}) 超过上限`, big.err.includes(`超过上限 ${POINT_SET_MAX}`), big.err)
    ok('  上限理由说清是"手写记号"而不是"算不动"', big.hint.includes('敲'), big.hint)

    // 报错语全是纯文本面
    const all = [amb, dup, bad, empty, zero, frac, neg, big]
    audit(all.flatMap((x, i) => [
      { what: `报错 ${i + 1} error`, text: x.err },
      { what: `报错 ${i + 1} hint`, text: x.hint },
    ]))
    const slashy = all.filter((x) => `${x.err}${x.hint}`.includes('\\'))
    ok('error / hint 里没有反斜杠', slashy.length === 0, slashy.map((x) => x.err || x.hint).join(' | '))
  }

  /* ══ 4 · Ω 当参数：老写法不坏 + 四种新写法 ═══════════════ */

  suite('u53 \\cdot 自定义作用吃 Omega：数字照旧，集合新收')

  {
    // 老写法（U52 契约）：数字 = 点数
    const old = build(['G = C_4', 'A = customAction(G, 4, a -> (1 2 3 4))'])
    eq('数字当点数照样能建（U52 契约不改）', old.err('A'), null)
    const Ao = actionOf(old, 'A')
    eq('  Omega 的点号仍是 1..4', (Ao?.setLabels ?? []).join(','), '1,2,3,4')
    eq('  点集展示名', Ao?.omega?.label, 'pointSet(4)')
    ok('  忠实（4-循环单射）', (Ao?.perms.size ?? 0) === 4, String(Ao?.perms.size))
    eq('  生成元 4 个元素全都算出来了', Ao?.perms.size, 4)

    // `pointSet(n)` 当 Ω
    const ps = build(['G = C_4', 'A = customAction(G, pointSet(8), a -> (1 2 3 4)(5 6 7 8))'])
    eq('pointSet(8) 能当 Omega', ps.err('A'), null)
    const Ap = actionOf(ps, 'A')
    eq('  点数跟点集走 = 8', Ap?.n, 8)
    eq('  标号 = 1..8', (Ap?.setLabels ?? []).join(','), '1,2,3,4,5,6,7,8')
    eq('  Omega 本体就是那个点集（有母群指针为 null）', Ap?.omega?.group, null)
    eq('  2 个轨道（两个 4-循环）', Ap ? computeOrbits(Ap.perms, Ap.n).orbits.length : -1, 2)
    eq('  每条轨道 4 个点', Ap ? computeOrbits(Ap.perms, Ap.n).orbits.map((o) => o.elements.length).join(',') : '', '4,4')

    // 标号点集 + 记号里写标号
    const lb = build(['G = S_3', 'A = customAction(G, labeledSet(a, b, c), s12 -> (a b), s23 -> (b c))'])
    eq('带标号的点集能当 Omega，记号里写标号', lb.err('A'), null)
    const Al = actionOf(lb, 'A')
    eq('  标号传给作用', (Al?.setLabels ?? []).join(','), 'a,b,c')
    eq('  自然作用 ⇒ 1 个轨道（传递）', Al ? computeOrbits(Al.perms, Al.n).orbits.length : -1, 1)
    eq('  轨道覆盖 3 个点', Al ? computeOrbits(Al.perms, Al.n).orbits[0]?.elements.length : -1, 3)

    // 现成的集合（标号是子群记号 ⇒ 数字按位置读）
    const viaSet = build([
      'G = S_4',
      'S = Syl(G, 3)',
      'Om = asSet(S)',
      'A = customAction(G, Om, s12 -> (1 4), c -> (1 4 3 2))',
    ])
    eq('现成的集合能当 Omega', viaSet.err('A'), null)
    eq('  Omega 是 4 个点（S_4 的 Sylow 3-子群数）', actionOf(viaSet, 'A')?.n, 4)

    // 第三个参数既不是数字也不是集合 -> 点名报错，**不静默当点数 1**
    const na = shownOf(['G = C_4', 'A = customAction(G, abc, a -> e)'])
    ok('"abc" 两者都不是 -> 拦下', na.err.includes('两者都不是'), na.err)
    ok('  hint 给出两条照抄就能跑的写法', na.hint.includes('pointSet(5)') && na.hint.includes('4'), na.hint)
    const missing = shownOf(['G = C_4', 'A = customAction(G)'])
    // 一个 Omega 都不给 = 通用参数个数门拦下（`arity = 2` 不变，只是第二个槽变宽了）
    ok('一个 Omega 都不给 -> 拦下（参数个数不够）', !!missing.err && missing.err.includes('需要 2+ 个参数'), missing.err)

    // 空集合与超线集合：分别在 omegaOf 与点数门上报错（内核算，不靠 UI）
    const G4 = groupOf(build(['G = C_4']), 'G')
    ok('拿到 C_4 用于内核直调', !!G4)
    if (G4) {
      const emptySet: GalSet = { group: null, label: '空集', members: [] }
      const e1 = planCustomAction(G4, { kind: 'set', set: emptySet }, [{ genText: 'a', cycle: IDENTITY_TOKEN }])
      ok('空集合要拦（说清是空集，不是"算不动"）', !e1.ok && e1.error.includes('空集'), e1.ok ? 'ok（不该）' : e1.error)
      const tooBig: GalSet = {
        group: null,
        label: `pointSet(${POINT_SET_MAX + 1})`,
        members: Array.from({ length: POINT_SET_MAX + 1 }, (_, i) => ({ label: String(i + 1) })),
      }
      const e2 = planCustomAction(G4, { kind: 'set', set: tooBig }, [{ genText: 'a', cycle: IDENTITY_TOKEN }])
      ok(
        `现成集合超过 ${POINT_SET_MAX} 点也要拦（点数门对集合照样生效）`,
        !e2.ok && e2.error.includes(`超过上限 ${POINT_SET_MAX}`),
        e2.ok ? 'ok（不该）' : e2.error,
      )
      eq('CUSTOM_ACTION_POINT_CAP 就是 POINT_SET_MAX（一处数）', CUSTOM_ACTION_POINT_CAP, POINT_SET_MAX)
    }
  }

  /* ══ 5 · 交叉核对：与内置共轭作用得到同一张置换表 ═════════ */

  suite('u53 \\cdot 两条路定义同一个作用，置换表必须逐项相同')

  {
    const P = build([
      'G = S_4',
      'builtin = conjOn(G, asSet(Syl(G, 3)))',
      'mine = customAction(G, asSet(Syl(G, 3)), s12 -> (1 4), c -> (1 4 3 2))',
    ])
    eq('内置路能建', P.err('builtin'), null)
    eq('手给路能建', P.err('mine'), null)
    const builtin = actionOf(P, 'builtin')
    const mine = actionOf(P, 'mine')
    ok('两条路都拿到作用值', !!builtin && !!mine)

    if (builtin && mine) {
      eq('两条路的置换条数相同（|S_4| = 24）', mine.perms.size, builtin.perms.size)
      eq('  两侧都是 24', builtin.perms.size, 24)
      let differ = 0
      let firstDiff = ''
      for (const [id, p] of builtin.perms) {
        if (permKey(p) !== permKey(mine.perms.get(id))) {
          differ++
          if (!firstDiff) firstDiff = `${id}: ${permKey(p)} vs ${permKey(mine.perms.get(id))}`
        }
      }
      ok('每条置换逐项相同（不是"看着差不多"）', differ === 0, firstDiff)

      /*
       * 手算锚点（写在文件头）：`s12 -> (1 4)`、`c -> (1 4 3 2)`。
       * 1 起转 0 起：`(1 4)` = `[3,1,2,0]`、`(1 4 3 2)` = `[3,0,1,2]`。
       */
      const G = groupOf(P, 'G')
      const gens: { gen: { name: string }; el: GroupElement }[] = G ? getGeneratorElements(G) : []
      const s12 = gens.find((x) => x.gen.name === 's12')
      const c = gens.find((x) => x.gen.name === 'c')
      ok('找得到 S_4 的生成元 s12 与 c', !!s12 && !!c, gens.map((x) => x.gen.name).join(','))
      if (s12) {
        eq('  内置路：s12 的像是 (1 4)', permKey(builtin.perms.get(s12.el.id)), '3,1,2,0')
        eq('  手给路：s12 的像是 (1 4)', permKey(mine.perms.get(s12.el.id)), '3,1,2,0')
      }
      if (c) {
        eq('  内置路：c 的像是 (1 4 3 2)', permKey(builtin.perms.get(c.el.id)), '3,0,1,2')
        eq('  手给路：c 的像是 (1 4 3 2)', permKey(mine.perms.get(c.el.id)), '3,0,1,2')
      }
    }

    // 同一件事用「pointSet(4)」写也行（数字与点集两条路等价）
    const num = build(['G = S_4', 'A = customAction(G, pointSet(4), s12 -> (1 4), c -> (1 4 3 2))'])
    eq('pointSet(4) 与asSet(Syl) 都能当 Omega', num.err('A'), null)
    eq('  点数 4', actionOf(num, 'A')?.n, 4)
  }

  /* ══ 6 · 记号解析：标签优先，但数字段归 core ═════════════ */

  suite('u53 \\cdot 点记号 -> 位置号：标签优先，数字段原样')

  {
    const L = ['a', 'b', 'c', '红']
    // 标号命中 -> 位置号（1 起）
    eq('(a b c) -> (1 2 3)', rewrite(L, '(a b c)'), '(1 2 3)')
    eq('(c a) -> (3 1)', rewrite(L, '(c a)'), '(3 1)')
    eq('(红) -> (4)', rewrite(L, '(红)'), '(4)')
    eq('逗号分隔照收 (a,b) -> (1,2)', rewrite(L, '(a,b)'), '(1,2)')

    /*
     * **数字段一律原样** —— 这条是拿 46 条红断言换来的。
     * `(12)(34)` 是 core 的紧凑写法（点 1 与点 2），拆成"记号 `12`"再查表就是错的。
     */
    eq('(12)(34) 原样过', rewrite(L, '(12)(34)'), '(12)(34)')
    eq('(1 2 3 4) 原样过', rewrite(L, '(1 2 3 4)'), '(1 2 3 4)')
    eq('混写 (12 a) -> (12 1)', rewrite(L, '(12 a)'), '(12 1)')

    // 认不出的记号：**点名是哪一个**
    const nope = labelCycleToNumeric(L, '(a z)')
    ok('认不出的记号 -> 报错并点名', !nope.ok && nope.token === 'z', nope.ok ? 'ok（不该）' : nope.token)

    // 单点解析只按标签（数字走不到这里）
    eq('标号命中', resolvePointToken(L, 'b'), 1)
    eq('数字不命中标签', resolvePointToken(L, '12'), null)

    // 标号能不能写进记号
    ok('a 能写进记号', labelWritable('a'))
    ok('"a b" 不能', !labelWritable('a b'))
    ok('"a(b" 不能', !labelWritable('a(b'))
    ok('"a,b" 不能', !labelWritable('a,b'))

    // 一行提示（报错与编辑器状态行共用同一份措辞）
    ok('空点集有话说', labelsHint([]).includes('空'))
    eq('小点集逐个列', labelsHint(['a', 'b', 'c']), '点集有 3 个点：1 a，2 b，3 c')
    ok('大点集截断并报总数', labelsHint(Array.from({ length: 20 }, (_, i) => `v${i}`)).includes('共 20 个'))

    // 内核实跑：`pointSet(5)` 的标号与 `labelCycleToNumeric` 接得上
    const plan = planCountPointSet(5)
    ok('内核 planCountPointSet(5) ok', plan.ok)
    if (plan.ok) {
      eq('  标号 1..5', plan.labels.join(','), '1,2,3,4,5')
      eq('  点集没有母群', plan.set.group, null)
      eq('  5 个点上的示例记号能翻', rewrite(plan.labels, '(1 2)'), '(1 2)')
    }
    const dupPlan = planLabeledPointSet(['a', 'a'])
    ok('内核拦住重复标号', !dupPlan.ok && dupPlan.error.includes('出现了两次'), dupPlan.ok ? 'ok（不该）' : dupPlan.error)
    ok('内核报错也守纯文本面', !dupPlan.ok && leakChars(dupPlan.error).length === 0)

    // 记号里的点不在 Ω 里 -> 报错语点出**是哪个记号**
    const outsider = shownOf(['G = S_3', 'A = customAction(G, labeledSet(a, b, c), s12 -> (a z), s23 -> (b c))'])
    ok('记号里有点集外的点 -> 拦下', outsider.err.includes('不是点集里的点'), outsider.err)
    ok('  报错里点名那个记号 z', outsider.err.includes('z'), outsider.err)
    ok('  hint 列出 Ω 的点', outsider.hint.includes('点集有 3 个点'), outsider.hint)
  }

  /* ══ 7 · 下游四个 op 在自由点集上照样可用 ═══════════════ */

  suite('u53 \\cdot 自由点集上的轨道 / 稳定子 / 不动点 / 轨道数')

  {
    const b = build([
      'A = customAction(C_4, 8, a -> (1 2 3 4)(5 6 7 8))',
      'O = orbits(A, 1)',
      'S = stabilizer(A, 1)',
      'F = fix(A)',
      'N = burnside(A)',
    ])
    eq('orbits(A, 1) 能算', b.err('O'), null)
    eq('stabilizer(A, 1) 能算', b.err('S'), null)
    eq('fix(A) 能算', b.err('F'), null)
    eq('burnside(A) 能算', b.err('N'), null)

    const O = setOf(b, 'O')
    eq('轨道是 4 个点（{1,2,3,4}）', O?.members.length, 4)
    eq('  轨道成员就是 1,2,3,4', O?.members.map((m) => m.label).join(','), '1,2,3,4')
    /*
     * **母群跟着 Ω 走**（U53 改的那一行）：自由点集的轨道也是自由点集。
     * 硬填 `A.group` 会把"Ω 的成员是 G 的元素"变成谎话。
     */
    ok('  轨道的母群跟着 Omega 走（也是 null）', O?.group === null, O?.group ? '有母群' : 'null')
    eq('稳定子是平凡的（4-循环固定不住任何点）', b.orderOf('S'), 1)
    eq('不动点是空集（8 个点全被 a 搬走）', setOf(b, 'F')?.members.length, 0)
    eq('轨道数 = 2（Burnside：(8+0+0+0)/4）', numOf(b, 'N'), 2)

    // 标号点集：按**标号**引用点（不是按位置号）
    const lb = build([
      'A = customAction(S_3, labeledSet(a, b, c), s12 -> (a b), s23 -> (b c))',
      'O = orbits(A, a)',
      'S = stabilizer(A, c)',
    ])
    eq('按标号引用点能算轨道', lb.err('O'), null)
    const Ol = setOf(lb, 'O')
    eq('  轨道是全部 3 个点（自然作用传递）', Ol?.members.length, 3)
    eq('  轨道成员就是标号', Ol?.members.map((m) => m.label).join(','), 'a,b,c')
    eq('按标号引用点能算稳定子', lb.err('S'), null)
    // 手算：S_3 在 3 个点上自然作用，`c` 的稳定子 = {e, s12}（2 阶）
    eq('  Stab(c) = 2 阶（{e, s12}）', lb.orderOf('S'), 2)

    // 引用不存在的点 -> 报错（不许静默取第 1 个点）
    const noPoint = build(['A = customAction(C_4, 8, a -> (1 2 3 4)(5 6 7 8))', 'O = orbits(A, 99)'])
    ok('引用 Omega 里没有的点要拦', !!noPoint.err('O'), String(noPoint.err('O')))
  }

  /* ══ 8 · 入口与注册表 ═══════════════════════════════════ */

  suite('u53 \\cdot 入口从注册表派生，自动就有')

  {
    // U51 的 40 + U52 的「自定义作用」= 41；U53 再加「点集」「集合」= 43
    eq('注册表 45 条（U60 加代数结构）', OPS.length, 45)

    const ps = opById('pointSet')
    const ls = opById('labeledSet')
    ok('注册表里有「点集」', !!ps)
    ok('注册表里有「集合」', !!ls)
    eq('点集是 set 结果', ps?.result, 'set')
    eq('集合是 set 结果', ls?.result, 'set')
    // 架构账：不是 §3 的 10 个原语，而是「原子构造」机制下的实例（与 `底集` 同一待遇）
    eq('点集 primitive = false（别为它动架构账）', ps?.primitive, false)
    eq('集合 primitive = false', ls?.primitive, false)
    eq('点集走 atomic', ps?.mechanism, 'atomic')
    eq('集合走 atomic', ls?.mechanism, 'atomic')
    eq('params 长度 == arity + optional（点集）', ps?.params.length, (ps?.arity ?? 0) + (ps?.optional ?? 0))
    eq('params 长度 == arity + optional（集合）', ls?.params.length, (ls?.arity ?? 0) + (ls?.optional ?? 0))
    eq('集合靠 variadic 收点', ls?.variadic?.name, 'point')
    eq('集合的 arity = 0（点全在 variadic 里）', ls?.arity, 0)
    // 翻账（工作台 v2 / W1，2026-10-06）：标签改成中文显示名。
    eq('菜单标签 = 中文显示名（点集）', ps ? menuLabel(ps) : '', '造点集')
    eq('菜单标签 = 中文显示名（集合）', ls ? menuLabel(ls) : '', '按标号造集合')
    eq('模板照抄就能跑（点集）', ps ? opTemplate(ps) : '', 'pointSet(5)')
    eq('模板照抄就能跑（集合）', ls ? opTemplate(ls) : '', 'labeledSet(a, b, c)')
    ok(
      '两个都不进 multiOps（它们不是"两个对象之间的操作"）',
      !multiOps().some((o) => o.id === 'pointSet' || o.id === 'labeledSet'),
    )

    // Ω 参数的类型：`omegaOrInt` 必须**同时**满足"能空着"与"能吃画布上的集合"
    const b = build(['G = C_4', 'X = labeledSet(a, b)'])
    const g = b.byId('G')?.value
    const x = b.byId('X')?.value
    const onlyG = g ? opsFor([g]).map((o) => o.id) : []
    ok('只选一个群时列得出「自定义作用」（Omega 是标量位，编辑器补）', onlyG.includes('customAction'), onlyG.join(','))
    const withSet = g && x ? opsFor([g, x]).map((o) => o.id) : []
    ok('选中 G 与一个集合时同样列得出（Omega 吃对象）', withSet.includes('customAction'), withSet.join(','))
    const onlySet = x ? opsFor([x]).map((o) => o.id) : []
    ok('只选集合时不列（作用群必须是群）', !onlySet.includes('customAction'), onlySet.join(','))

    // 内核那一层的类型筛选与 op 是同一份（`omegaSpecOfValue` 一处供两处）
    const asNumber: GalValue = { type: 'number', label: '5', value: 5 }
    eq('数字不是 Omega 对象（数字走"点数"那条路）', omegaSpecOfValue(asNumber, '5'), null)
    const G3 = groupOf(build(['H = C_3']), 'H')
    if (G3) {
      const spec = omegaSpecOfValue({ type: 'group', group: G3 }, 'H')
      eq('群对象能当 Omega（按底集读）', spec?.kind, 'set')
      eq('  底集成员数 = 群的阶', spec?.kind === 'set' ? spec.set.members.length : -1, 3)
      eq('  展示名按底集命名', spec?.kind === 'set' ? spec.set.label : '', 'asSet(H)')
    }
  }

  /* ══ 9 · 纯文本面：一趟全扫 ═════════════════════════════ */

  suite('u53 \\cdot 纯文本面零泄漏（与 e2e/no-unicode-leak 同一判据）')

  {
    const cases: { what: string; lines: string[] }[] = [
      { what: 'pointSet(5)', lines: ['P = pointSet(5)'] },
      { what: 'labeledSet(a, b, c)', lines: ['X = labeledSet(a, b, c)'] },
      { what: 'labeledSet(5) 歧义', lines: ['X = labeledSet(5)'] },
      { what: '标号重复', lines: ['X = labeledSet(a, a)'] },
      { what: 'pointSet(0)', lines: ['P = pointSet(0)'] },
      { what: '点数超线', lines: [`P = pointSet(${POINT_SET_MAX + 1})`] },
      { what: '数字当 Omega', lines: ['G = C_4', 'A = customAction(G, 4, a -> (1 2 3 4))'] },
      { what: '点集当 Omega', lines: ['G = C_4', 'A = customAction(G, pointSet(8), a -> (1 2 3 4)(5 6 7 8))'] },
      { what: '标号当 Omega', lines: ['G = S_3', 'A = customAction(G, labeledSet(a, b, c), s12 -> (a b), s23 -> (b c))'] },
      { what: 'Omega 两者都不是', lines: ['G = C_4', 'A = customAction(G, abc, a -> e)'] },
      { what: '记号里有点集外的点', lines: ['G = S_3', 'A = customAction(G, labeledSet(a, b, c), s12 -> (a z), s23 -> (b c))'] },
      { what: '轨道按标号引用', lines: ['A = customAction(S_3, labeledSet(a, b, c), s12 -> (a b), s23 -> (b c))', 'O = orbits(A, a)'] },
    ]
    const strings: { what: string; text: string }[] = []
    for (const c of cases) {
      const b = build(c.lines)
      const name = c.lines[c.lines.length - 1].split('=')[0].trim()
      const st = b.line(name)
      if (st?.ok) {
        strings.push({ what: `${c.what} sub`, text: st.object?.sub ?? '' })
        strings.push({ what: `${c.what} note`, text: st.object?.note ?? '' })
      } else {
        strings.push({ what: `${c.what} error`, text: st?.error ?? '' })
        strings.push({ what: `${c.what} hint`, text: st?.hint ?? '' })
      }
    }
    audit(strings)
    ok('这一趟真的扫到了显示串（不是空跑）', strings.filter((s) => s.text).length >= 10, `${strings.length}`)

    const errTexts = strings.filter((s) => s.what.includes('error') || s.what.includes('hint'))
    const withSlash = errTexts.filter((s) => s.text.includes('\\'))
    ok('error / hint 里没有反斜杠', withSlash.length === 0, withSlash.map((s) => `${s.what}: ${s.text}`).join(' | '))
  }
}
