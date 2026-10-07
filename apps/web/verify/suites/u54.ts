/**
 * U54 回归线（2026-10-03）：**操作名统一成 ASCII 英文** + 纯文本面零 LaTeX。
 *
 * 起因是用户的两句话（U53 推上去之后）：
 *
 *   「还有中文函数……1，学学 groupviz 怎么导入常见群，怎么创建任意集合的
 *     2，中文函数都来了，那是不是还得限定 utf-8 字符？都改成英文 ascii 字符！」
 *
 * 第 1 点里"创建任意集合"U53 已经做了（`pointSet(5)` / `labeledSet(a, b, c)`，
 * 而且 GroupViz 那边**没有**这一层）；剩下的是**命名规约**这件事。
 *
 * ── 侦察出来的两笔真账（都不是"中文"本身的问题）───────────────
 *
 *  ① **`notation` 里的 LaTeX 会回显到纯文本面上**。用户敲英文名照样看到：
 *
 *     | 你敲 | 报错原文 |
 *     |---|---|
 *     | `conjOn(C_4, pointSet(4))` | `共轭作用在(\cdot) 要 Ω 是……` |
 *     | `directProduct(C_3)` | `A \times B 需要 2 个参数，收到 1 个` |
 *
 *     `OpDef.notation` 的**全部消费者都是纯文本面**（`title` / `.pending-what` /
 *     `evalDef` 的参数个数门 / 径向菜单那个 `<code>`），一个都不走 KaTeX ⇒
 *     那就是字面上的反斜杠。所以 `notation` 直接改成 ASCII 函数式写法。
 *
 *  ② **中缀记号（`\cap` `\rtimes` 这批）是输入语法，不是展示用 LaTeX**。
 *     它们出现在"照这个敲"的模板里（`opTemplate`）与关系声明的提示里 ——
 *     用户要**照着敲**，所以留着；但要和"展示面漏了 LaTeX"分开，别一起扫。
 *
 * ── 本套守的判据 ───────────────────────────────────────────────
 *   ① **一个 op 的三个名字都必须是 ASCII**：`call` 别名 / `notation` / `doc`；
 *   ② **`notation` 的前缀必须是某个 `call` 别名** —— 否则用户照抄 `notation` 敲不出来；
 *   ③ **`menuLabel` 是中文显示名**（2026-10-06 起，见 `gal/opLabels.ts`）——
 *      它**与 `notation` 分家**：`notation` 是输入语法（① 管它），`menuLabel` 是界面文案；
 *   ④ **纯文本面零 LaTeX**：跑一批真实表达式与失败分支，把 `error` / `hint` /
 *      `sub` / `note` 全收上来扫一遍；`recipe` / `PARAM_LABEL` 静态扫；
 *   ⑤ **老中文名要给指路**：`直积(C_3, C_2)` 得说"改叫 directProduct 了"，
 *      而不是甩一句"没有这个操作"（名字是**我们**改的）；
 *   ⑥ **`asciiSymbol` 手算锚点**（群记号掉进纯文本面时的唯一换算口）。
 *
 * ⚠️ 期望值手算，不从运行结果抄：
 *
 *   `asciiSymbol('C_{2}\times C_{2}')`：`prettySymbol` 先把 `_{2}` 省成 `_2`
 *     ⇒ `C_2\times C_2`；再把 `\times` 落成 ` x ` ⇒ `C_2 x C_2`（多空格收成一个）。
 *
 *   `asciiSymbol('S_{4}')` ⇒ `S_4`（本来就没命令，`_4` 原样）。
 *
 *   `asciiSymbol('\\operatorname{Aut}(C_{6})')`：`\operatorname{Aut}` 取花括号里那段
 *     ⇒ `Aut`；`_{6}` ⇒ `_6` ⇒ `Aut(C_6)`。
 *
 *   `menuLabel`：2026-10-06 起**返回中文显示名**（`OP_LABEL`），不再从 `notation` 切前缀。
 *     口径为什么翻，见下面那节 suite 的头注。
 */
import { build, eq, ok, suite } from '../harness'
import { RENAMED_OPS } from '../../src/gal/evalDef'
import { actionInsights, groupInsights, mapInsights, type Insight } from '../../src/gal/insights'
import { menuLabel, PARAM_LABEL } from '../../src/gal/interaction'
import { OPS, opById, opTemplate, type ParamType } from '../../src/gal/ops'
import { asciiSymbol } from '../../src/gal/pretty'

type Built = ReturnType<typeof build>

/* ── 纯文本面判据（与 u51 / u52 / u53 及 e2e/no-unicode-leak 逐字同一套）── */

/**
 * 与 `e2e/no-unicode-leak.mjs` 的 `ALLOWED` **逐字相同**：放行 ASCII / 中文 /
 * 中文标点 / 中文引号 / 空白。破折号、⇒、希腊字母、`·`、`…` 一律不放行。
 */
const PLAIN_OK = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const leakChars = (s: string) => [...new Set([...s].filter((c) => !PLAIN_OK.test(c)))]

/**
 * **允许留在纯文本面上的 LaTeX 记号** —— 它们不是"展示用 LaTeX"，是**输入语法**：
 * 用户要照着敲（`A \cap B`、`N \rtimes H`、关系写成 `R = A \subseteq B`）。
 *
 * 把它们列成白名单而不是"干脆别扫反斜杠"：白名单之外**一个都不许有**，
 * 于是 `conjOn(\cdot)` / `|Omega| = 5 \cdot 点号` 这种漏网立刻现形。
 */
const INPUT_TEX = ['\\cap', '\\cup', '\\setminus', '\\cdot', '\\rtimes', '\\langle', '\\rangle', '\\subseteq', '\\cong']

/** 去掉"允许的输入记号"之后再找反斜杠 —— 剩下的都是漏出来的 LaTeX。 */
function strayLatex(s: string): string[] {
  let t = s
  for (const cmd of INPUT_TEX) t = t.split(cmd).join('')
  return [...new Set((t.match(/\\[A-Za-z]+/g) ?? []).map((x) => x))].sort()
}

function plainIssues(what: string, text: string): string[] {
  const out: string[] = []
  for (const c of leakChars(text)) out.push(`${what}: 不可打字字符 ${JSON.stringify(c)}`)
  for (const cmd of strayLatex(text)) out.push(`${what}: 漏出的 LaTeX ${cmd}`)
  return out
}

/** 收集一批定义行里**所有纯文本面**的串（成功与失败两侧都要）。 */
function plainStrings(b: Built): { what: string; text: string }[] {
  const out: { what: string; text: string }[] = []
  for (const st of b.lineStates) {
    if (st.ok) {
      if (st.object?.sub) out.push({ what: `${st.name}.sub`, text: st.object.sub })
      if (st.object?.note) out.push({ what: `${st.name}.note`, text: st.object.note })
    } else {
      if (st.error) out.push({ what: `${st.name}.error`, text: st.error })
      if (st.hint) out.push({ what: `${st.name}.hint`, text: st.hint })
    }
  }
  return out
}

/* ── 一组真实表达式：既要跑到成功面，也要撞到失败面 ───────────── */

/**
 * 前 30 行是**成功面**（覆盖 25 个 op 的 `sub` / `note`），
 * 后面是**失败面**（逐个撞 `fail(...)` 的每一条分支）。
 *
 * 期望值不重要 —— 本套只关心"这些串长什么样"。所以这里可以放心地
 * 把参数写歪，撞出报错反而更有价值（报错语是纯文本面里最长的那一截）。
 */
const LINES = [
  // ── 成功面 ──
  'G = C_6',
  'H = C_3',
  'S3 = S_3',
  'A4 = A_4',
  'V4 = C_2 x C_2',
  'K8 = C_2 x C_2 x C_2',
  'P3 = Syl(S3, 3)',
  'Q = quotient(G, H)',
  'Zg = Z(S3)',
  'Cg = C_G(S3, r)',
  'Ng = N_G(S3, r2)',
  'X = pointSet(4)',
  'Y = labeledSet(a, b, c)',
  'A1 = customAction(C_4, 4, a -> (1 2 3 4))',
  'A2 = customAction(S3, labeledSet(a, b, c), s12 -> (a b), s23 -> (b c))',
  'Ac = conjOn(S4, asSet(Syl(S4, 3)))',
  'Al = leftAction(C_3)',
  'O1 = orbits(A1, 1)',
  'St = stabilizer(A1, 1)',
  'Fx = fix(A1)',
  'Bu = burnside(A1)',
  'M = map(C_3, C_3, a -> a)',
  'Km = ker(M)',
  'Im = im(M)',
  'Subs = Sub(S3)',
  'Maxs = maximalSubgroups(S3)',
  'Psub = pSub(S3, 2)',
  'Ns = normalSubgroups(S3)',
  'Co = commutator(S3)',
  'Cl = closure(S3, r2)',
  'Ord = ord(S3, r2)',
  'Fa = factor(12)',
  'Bi = C(12, 4)',
  'Bm = Cmod(12, 4, 2)',
  'Gc = gcd(12, 18)',
  'Lc = lcm(4, 6)',
  'Ph = phi(12)',
  'Au = Aut(S3)',
  'Inn = Inn(S3)',
  'As1 = asSet(Sub(S3))',
  'Inc = include(C_3, S3)',
  'H3 = C_3',
  'Iso = isomorphism(C_3, H3)',
  'Syls = Syl(S3, 2)',
  'Prods = productSet(Sub(C_6), Sub(C_6))',
  // ── 失败面：逐个撞报错分支 ──
  'F01 = Syl(S3, 1)', // p 必须 >= 2
  'F02 = Syl(S3)', // 参数个数门（notation 会原样出现）
  'F03 = Sub()',
  'F04 = conjOn(C_4, pointSet(4))', // Ω 是一批抽象点
  'F05 = cosetAction(C_4)',
  'F06 = cosetAction(1, H)',
  'F07 = contains(S3)',
  'F08 = isomorphism(C_3)',
  'F09 = orbits(C_4, 1)',
  'F10 = stabilizer(C_4, 1)',
  'F11 = fix(C_4)',
  'F12 = burnside(C_4)',
  'F13 = ord(S3)',
  'F14 = factor(0)',
  'F15 = Cmod(12, 4, 1)',
  'F16 = gcd(-3, 2)',
  'F17 = lcm(4, -6)',
  'F18 = phi(0)',
  'F19 = asSet(1)',
  'F20 = closure(1)',
  'F21 = pSub(S3, 1)',
  'F22 = maximalSubgroups(1)',
  'F23 = normalSubgroups(1)',
  'F24 = commutator(1)',
  'F25 = Aut(1)',
  'F26 = Inn(1)',
  'F27 = Z(1)',
  'F28 = C_G(S3)',
  'F29 = N_G(S3)',
  'F30 = quotient(C_4, pointSet(2))',
  'F31 = customAction(S3, 0, s12 -> (1 2))',
  'F32 = customAction(S3, pointSet(9), s12 -> (1 9))',
  'F33 = labeledSet(5)',
  'F34 = labeledSet(a, a)',
  'F35 = pointSet(0)',
  'F36 = pointSet(401)',
  'F37 = pointSet(1.5)',
  'F38 = labeledSet()',
  'F39 = 没有这个操作(C_3)',
  'F40 = 直积(C_3, C_2)',
  'F41 = conjOn(C_4)',
  'F42 = image(M, 1)',
  'F43 = include(C_3, S3) x', // 语法错的尾巴
  'F44 = semidirectProduct(C_2, C_3)',
  'F45 = directProduct(C_3)',
  'F46 = map(S3, S3, s12 -> (1 2))',
]

export function run(): void {
  /* ══ 1 · 一个 op 的三个名字都必须是 ASCII ══════════════════ */

  suite('u54 - 操作名规约：alias / notation / doc 全 ASCII')

  const notAscii = (s: string) => [...s].filter((c) => c.charCodeAt(0) > 127)

  {
    const badAlias = OPS.flatMap((op) =>
      (op.call ?? []).filter((c) => notAscii(c).length > 0).map((c) => `${op.id}:${c}`),
    )
    eq('42 个 op 的别名里没有中文 / 非 ASCII', badAlias.join(' '), '')

    const noAlias = OPS.filter((op) => !op.call || op.call.length === 0)
    eq('每个 op 都至少有一个调用名', noAlias.length, 0)

    const badNota = OPS.filter((op) => notAscii(op.notation).length > 0)
    eq('notation 全是 ASCII', badNota.map((o) => o.id).join(' '), '')

    const strayNota = OPS.filter((op) => strayLatex(op.notation).length > 0)
    eq('notation 里没有 LaTeX 命令', strayNota.map((o) => `${o.id}/${o.notation}`).join(' '), '')
  }

  // 前缀必须在 call 里 —— 否则用户照抄 notation 敲不出来
  {
    const offenders = OPS.filter((op) => {
      const head = op.notation.split('(')[0].trim()
      return !(op.call ?? []).includes(head)
    })
    eq(
      'notation 的前缀是某个调用名（照抄能敲）',
      offenders.map((o) => `${o.id}/${o.notation}`).join(' '),
      '',
    )
  }

  {
    const badDoc = OPS.filter((op) => (op.doc ?? '').includes('\\'))
    eq('doc 里没有反斜杠（doc 走 title，是纯文本面）', badDoc.map((o) => o.id).join(' '), '')

    // opTemplate 是"照这个敲"的模板 ⇒ 只许出现白名单里的输入记号
    const badTpl = OPS.filter((op) => strayLatex(opTemplate(op)).length > 0)
    eq(
      'opTemplate 只出现白名单输入记号',
      badTpl.map((o) => `${o.id}:${opTemplate(o)}`).join(' '),
      '',
    )
  }

  /* ══ 2 · menuLabel = 中文显示名（2026-10-06 翻口径）═══════════ */

  suite('u54 / W1 - menuLabel：中文显示名，与 notation 分家')

  /*
   * ⚠️ **翻账声明**（2026-10-06，工作台 v2 / W1）。
   *
   * U54 时这里断言的是「标签 = `notation` 切 `(` 之前」（即英文名），
   * 理由是"派生不会漂移、不用手工同步"。那条理由**没错**，但它漏了一件事：
   * 派生出来的东西是**英文** —— 用户实测原话：
   *
   *   > 「具体功能为什么不用中文？为什么中英文混杂？你想给谁用？」
   *
   * ⇒ 口径改成**显示名与输入语法分家**：`notation` 是输入语法（能敲，①管它），
   *   `menuLabel` 是**界面文案**（中文，由 `gal/opLabels.ts#OP_LABEL` 给）。
   * 下面这些期望值**逐条从英文翻成中文** —— 翻的是判据，不是让实现迁就断言。
   *
   * U54 担心的"手工表会漂移"改由 `opLabels.ts#assertEveryOpNamed()` 在**加载期**守：
   * 漏写不是"悄悄退回英文"，而是加载就抛。
   */
  {
    eq('直积', menuLabel(opById('directProduct')!), '直积')
    eq('集合上的共轭', menuLabel(opById('conjugationOnSet')!), '集合上的共轭')
    eq('半直积', menuLabel(opById('semidirectProduct')!), '半直积')
    eq('造点集', menuLabel(opById('pointSet')!), '造点集')
    eq('按标号造集合', menuLabel(opById('labeledSet')!), '按标号造集合')

    // 新口径的第一条守卫：**标签不许再是英文 id**（不然这次改动等于没做）。
    const englishy = OPS.filter((op) => /^[A-Za-z][A-Za-z0-9_]*$/.test(menuLabel(op)))
    eq('没有一个标签是纯英文 id', englishy.map((o) => o.id).join(' '), '')

    const leaky = OPS.filter((op) => strayLatex(menuLabel(op)).length > 0)
    eq('没有哪个菜单标签带 LaTeX', leaky.map((o) => o.id).join(' '), '')

    // 显示侧同样受"键盘打不出来的字符不许出现"约束（用户 2026-09-27 立）。
    const untypable = OPS.filter((op) => leakChars(menuLabel(op)).length > 0)
    eq(
      '没有哪个标签带键盘打不出来的字符',
      untypable.map((o) => `${o.id}:${menuLabel(op)}`).join(' '),
      '',
    )

    const blank = OPS.filter((op) => menuLabel(op).trim().length === 0)
    eq('没有哪个标签是空的（球上不许有看不见的按钮）', blank.length, 0)
  }

  /* ══ 3 · PARAM_LABEL：说明文字保持中文，但不许有 LaTeX ═══════ */

  suite('u54 - PARAM_LABEL：说明文字也不写 LaTeX')

  {
    const keys = Object.keys(PARAM_LABEL) as ParamType[]
    const leaky = keys.filter((k) => strayLatex(PARAM_LABEL[k]).length > 0)
    eq('每个参数类型标签都没有 LaTeX', leaky.join(' '), '')
    eq('Omega 写成 ASCII', PARAM_LABEL.omega, '集合 Omega')
    eq('Omega 或点数', PARAM_LABEL.omegaOrInt, '点集 Omega 或点数')
    eq('生成元 -> 像', PARAM_LABEL.genImage, '生成元 -> 像')
  }

  /* ══ 4 · 纯文本面零 LaTeX / 零不可打字字符（跑真实表达式）══ */

  suite('u54 - 纯文本面：error / hint / sub / note 零泄漏')

  const b = build(LINES)
  const strings = plainStrings(b)

  {
    // 别让这套"空跑" —— 扫到的串太少说明 LINES 整批没求值
    ok('这一趟真的扫到了串（不是空跑）', strings.length >= 40, `got=${strings.length}`)

    const errCount = strings.filter((s) => s.what.endsWith('.error')).length
    ok('失败面真的撞到了（≥ 20 条 error）', errCount >= 20, `got=${errCount}`)
  }

  {
    const issues = strings.flatMap((s) => plainIssues(s.what, s.text))
    eq('error / hint / sub / note 全干净', issues.slice(0, 6).join(' | '), '')
  }

  {
    // 静态那一半：recipe 不经过运行时也能扫
    const badRecipe = OPS.filter((op) => strayLatex(op.recipe ?? '').length > 0)
    eq('recipe 里没有 LaTeX', badRecipe.map((o) => o.id).join(' '), '')

    const leakyRecipe = OPS.filter((op) => leakChars(op.recipe ?? '').length > 0)
    eq('recipe 里没有不可打字字符', leakyRecipe.map((o) => o.id).join(' '), '')
  }

  /* ══ 5 · 老中文名要给指路 ═══════════════════════════════════ */

  suite('u54 - 老中文名：指路到英文名，不是「没有这个操作」')

  {
    const keys = Object.keys(RENAMED_OPS)
    ok('改名表覆盖了 50 条老别名', keys.length === 50, `got=${keys.length}`)
    eq('表里没有 ASCII 键（那说明它就不是"中文别名"）', keys.filter((k) => notAscii(k).length === 0).join(' '), '')

    // 每个目标都得是**真实存在**的调用名 —— 指错路比不指更糟
    const known = new Set(OPS.flatMap((op) => op.call ?? []))
    const badTarget = keys.filter((k) => !known.has(RENAMED_OPS[k]))
    eq('每个目标都是现有的调用名', badTarget.map((k) => `${k}->${RENAMED_OPS[k]}`).join(' '), '')
  }

  {
    const r1 = b.err('F40') ?? ''
    ok('直积 -> 说改叫 directProduct', r1.includes('directProduct'), r1)
    ok('顺带给出照抄的写法', (b.line('F40')?.hint ?? '').includes('directProduct'), b.line('F40')?.hint ?? '')
  }

  {
    // 逐条过一遍：50 条老名字里**每一条**都必须走到"改名指路"这条分支
    const missing: string[] = []
    for (const old of Object.keys(RENAMED_OPS)) {
      const one = build([`Z9 = ${old}(C_2)`])
      const e = one.err('Z9') ?? ''
      if (!e.includes(RENAMED_OPS[old]) || !e.includes('改叫')) missing.push(old)
    }
    eq('50 条老别名全都指路成功', missing.join(' '), '')
  }

  {
    // 对照：真正没见过的名字仍走原来那条（别把改名表当成万能兜底）
    const e2 = b.err('F39') ?? ''
    ok('没见过的名字：仍旧是「没有这个操作」', e2.includes('没有名为'), e2)
    ok('而且不带"改叫"', !e2.includes('改叫'), e2)
  }

  /* ══ 6 · asciiSymbol：手算锚点 ═══════════════════════════ */

  suite('u54 - asciiSymbol：群记号掉进纯文本面时的唯一换算口')

  {
    eq('C_2 x C_2', asciiSymbol('C_{2}\\times C_{2}'), 'C_2 x C_2')
    eq('S_4', asciiSymbol('S_{4}'), 'S_4')
    eq('Aut(C_6)', asciiSymbol('\\operatorname{Aut}(C_{6})'), 'Aut(C_6)')
    eq('半直积', asciiSymbol('C_{4} \\rtimes_{\\varphi} C_{2}'), 'C_4 : _phi C_2')
    eq('空的进去还是空的', asciiSymbol(''), '')

    // 手算过的那三个都必须是纯 ASCII（这是这个函数存在的**全部理由**）
    const samples = ['C_{2}\\times C_{2}', 'S_{4}', '\\operatorname{Aut}(C_{6})', 'D_{8} \\times C_{3}']
    const dirty = samples.filter((x) => notAscii(asciiSymbol(x)).length > 0)
    eq('产出全是 ASCII', dirty.join(' '), '')
  }

  {
    // 运行时锚点：`V4` 识别出来是 `C_{2}\times C_{2}`，它的 sub 必须落到 `C_2 x C_2`
    // 注意：`isomorphism(G, G)` 会被拦（「两边是同一个对象」）⇒ 必须两个独立建的同构群
    const r = build(['V4 = C_2 x C_2', 'W4 = C_2 x C_2', 'K = isomorphism(V4, W4)'])
    const sub = r.line('K')?.object?.sub ?? ''
    eq('同构的副行用的是 ASCII 记号（手算：identify 给 C_{2}\\times C_{2}）', sub, '都同构于 C_2 x C_2')
  }

  /* ══ 7 · 结论层的 detail / label（纯文本面）═══════════════ */

  suite('u54 - 结论层 detail / label：纯文本面')

  {
    const ins: Insight[] = []
    const V4g = build(['V4 = C_2 x C_2']).byId('V4')
    const K8g = build(['K8 = C_2 x C_2 x C_2']).byId('K8')
    if (V4g?.value.type === 'group') ins.push(...groupInsights(V4g.value.group))
    if (K8g?.value.type === 'group') ins.push(...groupInsights(K8g.value.group))

    const S3b = build(['S3 = S_3'])
    const S3g = S3b.byId('S3')
    if (S3g?.value.type === 'group') ins.push(...groupInsights(S3g.value.group, S3g))

    const ab = build(['G = C_6', 'H = C_2', 'M = map(G, H, a -> b)'])
    const M = ab.byId('M')
    if (M?.value.type === 'map') ins.push(...mapInsights(M.value.map))
    const ac = build(['A = customAction(S3, 3, s12 -> (1 2))'])
    const A = ac.byId('A')
    if (A?.value.type === 'action') ins.push(...actionInsights(A.value.action))

    ok('结论层真的产出了条目', ins.length >= 4, `got=${ins.length}`)

    const issues = ins.flatMap((x) => [
      ...plainIssues(`insight.label(${x.label})`, x.label),
      ...(x.detail ? plainIssues(`insight.detail(${x.label})`, x.detail) : []),
    ])
    eq('label / detail 全干净', issues.slice(0, 6).join(' | '), '')
  }
}
