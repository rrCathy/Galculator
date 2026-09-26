/**
 * 展示形态与记号回认 —— 这一组的由来是一个**真报上来的 bug**。
 *
 * 现象（2026-09-21，用户截图）：`A = Aut(S_4)` 之后，信息面板的「生成元」栏
 * 显示成 `\alpha_2, \alpha_8`，`ord(A, )` 的提示显示成一屏
 * `\mathrm{id}, \alpha_1, …, \alpha_{23}`。
 *
 * 根因不是"某个面板忘了渲染"，而是**两道程序都缺了**：
 *   ① 展示层（`prettySymbol`）不认希腊字母与 `\mathrm`——`\alpha_{2}` 掉进
 *      "去反斜杠"兜底，变成 `alpha₂` 这种半截货；
 *   ② 回认层（`resolveElementLoose`）只认引擎记号，于是"看得见"的 `α₂`
 *      **打不出来**——面板给你的记号你照着敲，系统说"没有这个元素"。
 *
 * 判据（都可从数学/契约手推，不从运行结果抄）：
 *   - `prettySymbol` 是**展示**变换：幂等可预期、对纯 ASCII 恒等；
 *   - 三种写法（`α₂` / `\alpha_2` / `\alpha_{2}`）必须落到**同一个**元素；
 *   - `|⟨g⟩| = ord(g)`——这条恒等式顺带把"解析到的到底是不是同一个元素"钉死；
 *   - 系统生成的提示串（`元素：…`）**不许出现反斜杠**（那是引擎记号漏到展示层）。
 */
import { build, eq, ok, suite } from '../harness'
import { elementNotation, resolveElementLoose } from '../../src/gal/ops'
import { normalizeGreek, prettySymbol } from '../../src/gal/pretty'

export function run(): void {
  suite('notation · 展示形态与记号回认')

  // ── prettySymbol：展示变换 ──
  {
    eq('\\mathrm{id} → id', prettySymbol('\\mathrm{id}'), 'id')
    eq('\\alpha_2 → α₂', prettySymbol('\\alpha_2'), 'α₂')
    eq('\\alpha_{2} → α₂', prettySymbol('\\alpha_{2}'), 'α₂')
    eq('\\alpha_{12} → α₁₂', prettySymbol('\\alpha_{12}'), 'α₁₂')
    eq('\\sigma_{12} → σ₁₂', prettySymbol('\\sigma_{12}'), 'σ₁₂')
    // 回归：群符号的既有行为不能被希腊字母表撞坏
    eq('S_{4} → S₄', prettySymbol('S_{4}'), 'S₄')
    eq('\\operatorname{Aut}(S_{4}) → Aut(S₄)', prettySymbol('\\operatorname{Aut}(S_{4})'), 'Aut(S₄)')
    eq('\\times → ×', prettySymbol('C_{2}\\times C_{2}'), 'C₂×C₂')
    // 纯 ASCII 记号必须**恒等**——否则 S₄ 的元素名（`12` / `34`）会被改坏
    eq('12 不变', prettySymbol('12'), '12')
  }

  // ── Aut(S₄)：引擎记号真的长得像 LaTeX ──
  const b = build(['A = Aut(S_4)'])
  const a = b.byId('A')
  ok('Aut(S_4) 建出群', a?.value.type === 'group')
  if (a?.value.type !== 'group') return

  // 数学：Aut(Sₙ) ≅ Sₙ（n ≠ 2, 6）⇒ |Aut(S₄)| = 24
  eq('|Aut(S₄)| = 24', a.value.group.order, 24)

  const ids = a.value.group.elements.map((e) => e.label)
  ok('元素记号确实是引擎 TeX（含反斜杠）', ids.every((l) => l.includes('\\')), ids[0])
  ok('展示形态里不再有反斜杠', ids.every((l) => !prettySymbol(l).includes('\\')))
  ok('单位元展示成 id', prettySymbol(a.value.group.identity.label) === 'id')
  ok(
    '生成元展示形态无反斜杠',
    a.value.group.generators.every((g) => !prettySymbol(g.symbol).includes('\\')),
  )

  // ── 三种写法落到同一个元素 ──
  {
    const three = build([
      'A = Aut(S_4)',
      'n1 = ord(A, α₂)',
      'n2 = ord(A, \\alpha_2)',
      'n3 = ord(A, \\alpha_{2})',
    ])
    const vals = ['n1', 'n2', 'n3'].map((n) => {
      const o = three.byId(n)
      return o?.value.type === 'number' ? o.value.value : null
    })
    ok('三种写法都能求值', vals.every((v) => v !== null), JSON.stringify(vals))
    ok('三种写法给出同一个值', vals[0] !== null && vals[0] === vals[1] && vals[1] === vals[2])
    // 数学：⟨α₂⟩ 的阶就是 α₂ 的阶
    const B = build(['A = Aut(S_4)', 'n = ord(A, α₂)', 'B = 闭包(A, α₂)'])
    eq('|⟨α₂⟩| = ord(α₂)', B.orderOf('B'), vals[0])
    const C = build(['A = Aut(S_4)', 'C = 闭包(A, \\alpha_2)'])
    eq('TeX 写法闭包同阶', C.orderOf('C'), B.orderOf('B'))
  }

  // ── 提示串：给用户抄的那条不许漏引擎记号 ──
  {
    const bad = build(['A = Aut(S_4)', 'n = ord(A, zzz)'])
    const s = bad.line('n')
    ok('解析失败有错误', !!s && !s.ok)
    const hint = s?.hint ?? ''
    ok('提示里没有反斜杠', !hint.includes('\\'), hint.slice(0, 60))
    ok('提示里列出展示形态的元素', hint.includes('id') && hint.includes('α₁'), hint.slice(0, 60))
    ok('错误串里的群名也是展示形态', !(s?.error ?? '').includes('\\'), s?.error ?? '')
  }

  // ── 置换群元素：core 的单循环不带括号，展示层要补回来（U15）──
  {
    const b = build(['G = S_4'])
    const g = b.byId('G')
    if (g?.value.type === 'group') {
      const grp = g.value.group
      const three = grp.elements.find((e) => e.label === '234')
      ok('core 的 S₄ 单循环标签确实不带括号', !!three, grp.elements.map((e) => e.label).join(' '))
      if (three) {
        eq('展示层把 234 补成 (234)', elementNotation(grp, three), '(234)')
        // 补完必须还能敲回去——"展示成什么样，就得能照着敲回去"
        eq(
          '补完的记号会认回同一个元素',
          resolveElementLoose(grp, elementNotation(grp, three))?.id,
          three.id,
        )
      }
      const dbl = grp.elements.find((e) => e.label === '(12)(34)')
      ok('带括号的双对换原样不动', !!dbl && elementNotation(grp, dbl) === '(12)(34)')

      // 提示串也跟着走课本记号（用户照着它抄）
      const hint = build(['G = S_4', 'n = ord(G, zzz)']).line('n')?.hint ?? ''
      ok('元素提示里用 (234) 而不是 234', hint.includes('(234)'), hint.slice(0, 80))
      ok('提示里没有反斜杠', !hint.includes('\\'), hint.slice(0, 80))
    }
  }
  {
    // C₁₂ 里有元素标签 `10`——**它不是置换，不许加括号**。
    // 加括号那一关靠 resolveElementLoose 的回认挡住（`(10)` 解析不了）。
    const c = build(['H = C_12'])
    const h = c.byId('H')
    if (h?.value.type === 'group') {
      const grp = h.value.group
      const ten = grp.elements.find((e) => e.label === '10')
      ok('C₁₂ 里确有标签 10 的元素', !!ten, grp.elements.map((e) => e.label).join(' '))
      if (ten) eq('但它不是置换，保持原样', elementNotation(grp, ten), '10')
    }
  }

  // ── 多对一不猜：展示形态撞车时不许静默命中 ──
  {
    // `\alpha_{2}` 与 `\alpha_2` 都展示成 `α₂`；同一群里不该同时出现两者。
    // 构造不出来就只验 prettySymbol 的多对一性质（这是 ⓪ 层加唯一性判据的理由）。
    eq('两种 TeX 折叠成同一展示形态', prettySymbol('\\alpha_{2}'), prettySymbol('\\alpha_2'))
  }

  /* ══ 希腊字母：输入与匹配的闭环 ═══════════════════════════ */

  /**
   * 这一节的由来（2026-09-26，用户："关于 φ 这个希腊字符，你还没修啊"）。
   *
   * 现象：`\phi = 映射(…)` **建得出来**（输入框那侧过 `normalizeName`），
   * 但 `ker(\phi)` **引不到**（求值那侧没归一）—— 而 `ker(φ)` 引得到。
   * 用户看到的只是"有时候好使、有时候不好使"。
   *
   * 根因是**归一只做了一半**：建对象时归一、引用时不归一。
   * 修法两道：两侧共用 `normalizeGreek`（`pretty.ts`），且把归一放到
   * **造对象的最窄关口**（`build.ts` 拆名字处）——三个入口各自归一总会漏一个。
   */
  suite('notation · 希腊字母：输入与匹配（四种写法等价）')
  {
    const PHI = '\u03c6' // φ GREEK SMALL LETTER PHI（本项目的标准写法）
    const PHISYM = '\u03d5' // ϕ GREEK PHI SYMBOL —— LaTeX 的 \phi 排出来是这个

    // ① 归一本身：两个方向
    eq('LaTeX 别名 \\phi → φ', normalizeGreek('\\phi'), PHI)
    eq('\\varphi → φ', normalizeGreek('\\varphi'), PHI)
    eq('符号变体 ϕ(U+03D5) → φ（从论文里复制来的是这个码位）', normalizeGreek(PHISYM), PHI)
    eq('大写也有：\\Phi → Φ', normalizeGreek('\\Phi'), 'Φ')
    eq('内嵌也认：ker(\\phi)', normalizeGreek('ker(\\phi)'), `ker(${PHI})`)
    eq('变体与标准写法在句子中间同归一', normalizeGreek(`ord(A, ${PHISYM})`), `ord(A, ${PHI})`)

    // ② 不能误伤：表里没有的命令、单反斜杠（集合差）、拉丁名字
    eq('不认识的命令原样留着', normalizeGreek('A \\ B'), 'A \\ B')
    eq('单反斜杠不动', normalizeGreek('\\'), '\\')
    eq('拉丁对象名不受影响', normalizeGreek('G \\ H'), 'G \\ H')

    // ③ 建对象：四种写法给**同一个 id**
    const built = ['φ', '\\phi', '\\varphi', PHISYM].map((n) => {
      const r = build([`${n} = 映射(C_6, C_3, a→2)`])
      return r.objects[0]?.id ?? '（没建出来）'
    })
    ok('四种写法建出的 id 完全相同', new Set(built).size === 1, built.join(' | '))
    eq('而且就是标准字符 φ', built[0], PHI)

    // ④ 引用：四种写法**互相**引用都通（这条就是当初漏掉的半边）
    const written = ['φ', '\\phi', '\\varphi', PHISYM]
    written.forEach((n, i) => {
      const r = build([`φ = 映射(C_6, C_3, a→2)`, `K = ker(${n})`])
      eq(`用第 ${i + 1} 种写法引用 φ 建出的映射`, r.orderOf('K'), 2)
    })

    // ④' 反过来也要通：建的时候用 LaTeX 写法
    const rev = build(['\\phi = 映射(C_6, C_3, a→2)', 'K = ker(φ)'])
    eq('建时用 \\phi、引用时用 φ', rev.orderOf('K'), 2)

    // ⑤ 元素级：展示形态与 LaTeX 写法落到同一个元素
    const aut = build(['G = S_4', 'A = Aut(G)'])
    const A = aut.byId('A')
    if (A?.value.type === 'group') {
      const g = A.value.group
      const a1 = g.elements.find((e) => e.label === '\\alpha_1')
      ok('自同构群里确有 \\alpha_1', !!a1, g.elements.slice(0, 4).map((e) => e.label).join(' '))
      ok('敲展示形态 α₁ 认得出', !!a1 && resolveElementLoose(g, 'α₁')?.id === a1.id)
      ok('敲 LaTeX 写法 \\alpha_1 也认得出', !!a1 && resolveElementLoose(g, '\\alpha_1')?.id === a1.id)
    }

    // ⑥ 重名检查也按归一后的名字算（否则 `φ` 与 `\phi` 能各建一个）
    // 注意别用 `err('φ')` —— 它取的是**第一个**叫这名字的行（那是成功的第一行）。
    const dup = build(['φ = C_6', '\\phi = C_3'])
    eq('两行的名字归一后是同一个', dup.lineStates[1]?.name, 'φ')
    eq('于是第二行被拦下', dup.lineStates[1]?.ok, false)
    eq('理由就是重名', dup.lineStates[1]?.error, '名字「φ」重复定义')
  }
}
