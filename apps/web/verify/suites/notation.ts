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
import { prettySymbol } from '../../src/gal/pretty'

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
}
