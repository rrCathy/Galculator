/**
 * 记号：「展示 / 输入 / 回认」三侧统一到**同一个形态** —— 这一组的由来是一个真报上来的 bug。
 *
 * 现象（2026-09-21，用户截图）：`A = Aut(S_4)` 之后面板的「生成元」栏显示成
 * `alpha₂, alpha₈`（半截货），而"看得见"的 `\\alpha₂` 又**打不出来**。
 *
 * 随后两轮（U23 \\varphi、U24 下标）的修法都是"让 Unicode 形态能敲回去"。**2026-09-27 用户换了方向**：
 *
 * > 把键盘上打不出来的字符都处理了，不要显示出来，也不支持输入这些。
 *
 * 于是形态**反过来统一到 ASCII / LaTeX**：`S_4` \\cdot`\varphi` \\cdot`\times`。
 * 显示仍靠 KaTeX 渲染（视觉零退化），而文本流、复制、输入三者同源 ——
 * 转换链从两跳变一跳，"两个码位""打不回来"那一整类问题**从根上不存在了**。
 *
 * 判据（都可从契约手推，不从运行结果抄）：
 *   - `prettySymbol` 是**规范**变换：只动上下标的花括号，其余原样（幂等）；
 *   - 它的输出**不含任何非 ASCII 非中文字符** —— 这是用户要求最直接的检验；
 *   - 键盘打不出来的字符**一律拦**，并给出**可照抄**的改法（`scanNotAscii`）；
 *   - 折叠必须**保语义**：`C_2^2` \\to`C_2^2`，**不是** `C_22`（那是 22 阶的另一个群）；
 *   - 引擎给的 TeX 记号与用户敲的 ASCII 记号**是同一个形态**，不再互相翻译。
 */
import { build, eq, ok, suite } from '../harness'
import { elementNotation, resolveElementLoose } from '../../src/gal/ops'
import { checkName } from '../../src/gal/naming'
import { foldToAscii, prettySymbol, scanNotAscii } from '../../src/gal/pretty'

/** 键盘打不出来的字母 —— 作为**被拦的样本**用，不作为写法。 */
const PHI = '\u03c6' // \\varphi
const PHISYM = '\u03d5' // \\varphi（LaTeX 的 \phi 排出来是这个码位）
const SUB4 = '\u2084' // ₄
const SUP2 = '\u00b2' // ^2
const OMEGA = '\u03a9' // \\Omega
const CAP = '\u2229' // \\cap
const SUBSET = '\u2286' // \\subseteq

/** 串里有没有**键盘打不出来**的东西（中文与中文标点不算）。 */
const hasNonAscii = (s: string): boolean => scanNotAscii(s) !== null

export function run(): void {
  suite('notation \\cdot 展示形态：简化 LaTeX（全 ASCII）')

  // ── prettySymbol：只做"上下标花括号"的规范化，别的原样 ──
  {
    eq('S_{4} -> S_4（单字符省花括号）', prettySymbol('S_{4}'), 'S_4')
    eq('C_{12} -> C_{12}（多字符保留）', prettySymbol('C_{12}'), 'C_{12}')
    eq('A_10 -> A_{10}（裸的多字符**补上**花括号）', prettySymbol('A_10'), 'A_{10}')
    eq('\\alpha_{2} -> \\alpha_2', prettySymbol('\\alpha_{2}'), '\\alpha_2')
    eq('\\operatorname{Aut}(S_{4}) 只简化下标', prettySymbol('\\operatorname{Aut}(S_{4})'), '\\operatorname{Aut}(S_4)')
    eq('C_{2}\\times C_{2} -> C_2\\times C_2', prettySymbol('C_{2}\\times C_{2}'), 'C_2\\times C_2')
    eq('\\mathrm{id} 原样（KaTeX 自己会排成正体）', prettySymbol('\\mathrm{id}'), '\\mathrm{id}')
    eq('\\left/ \\right去掉（KaTeX 不需要）', prettySymbol('\\left(S_{4}\\right)'), '(S_4)')
    // 纯 ASCII 记号必须**恒等** —— 否则 S_4 的元素名（`12` / `34`）会被改坏
    eq('12 不变', prettySymbol('12'), '12')
    eq('幂等：再跑一遍没有变化', prettySymbol(prettySymbol('S_{4}')), 'S_4')
  }

  // ── 最核心的一条：展示形态里**不许有键盘打不出来的字符** ──
  {
    const b = build(['A = Aut(S_4)'])
    const a = b.byId('A')
    ok('Aut(S_4) 建出群', a?.value.type === 'group')
    if (a?.value.type !== 'group') return
    // 数学：Aut(Sₙ) \\cong Sₙ（n \\ne 2, 6）\\Rightarrow|Aut(S₄)| = 24
    eq('|Aut(S_4)| = 24', a.value.group.order, 24)

    const labels = a.value.group.elements.map((e) => e.label)
    ok('引擎给的元素记号本身就是 TeX（含反斜杠）', labels.every((l) => l.includes('\\')), labels[0])
    ok(
      '**展示形态全是 ASCII**（这是用户的直接要求）',
      labels.every((l) => !hasNonAscii(prettySymbol(l))),
      labels.map(prettySymbol).find(hasNonAscii) ?? '(none)',
    )
    ok('单位元的展示形态是 \\mathrm{id}（渲染出来就是 id）', prettySymbol(a.value.group.identity.label) === '\\mathrm{id}')
    ok(
      '生成元的展示形态也是 ASCII',
      a.value.group.generators.every((g) => !hasNonAscii(prettySymbol(g.symbol))),
    )
  }

  // ── 引擎形态与用户敲的形态**是同一个**：`\alpha_2` 与 `\alpha_{2}` 落同一元素 ──
  {
    const three = build([
      'A = Aut(S_4)',
      'n1 = ord(A, \\alpha_2)',
      'n2 = ord(A, \\alpha_{2})',
    ])
    const vals = ['n1', 'n2'].map((n) => {
      const o = three.byId(n)
      return o?.value.type === 'number' ? o.value.value : null
    })
    ok('两种花括号写法都能求值', vals.every((v) => v !== null), JSON.stringify(vals))
    ok('两种写法给出同一个值', vals[0] !== null && vals[0] === vals[1], JSON.stringify(vals))

    // 数学：\\langle\\alpha₂\\rangle 的阶就是 \\alpha₂ 的阶
    const B = build(['A = Aut(S_4)', 'n = ord(A, \\alpha_2)', 'B = 闭包(A, \\alpha_2)'])
    eq('|\\langle\\alpha_2\\rangle| = ord(\\alpha_2)', B.orderOf('B'), vals[0])
  }

  // ── 提示串：给用户抄的那条必须**全是 ASCII**（否则抄不回去） ──
  {
    const bad = build(['A = Aut(S_4)', 'n = ord(A, zzz)'])
    const s = bad.line('n')
    ok('解析失败有错误', !!s && !s.ok)
    const hint = s?.hint ?? ''
    ok('元素提示里没有键盘打不出的字符', !hasNonAscii(hint), hint.slice(0, 70))
    ok('提示里列的是引擎形态的记号', hint.includes('\\alpha_1') || hint.includes('\\mathrm{id}'), hint.slice(0, 70))
    ok('错误串也是 ASCII', !hasNonAscii(s?.error ?? ''), s?.error ?? '')
  }

  /* ══ 置换群元素：core 的单循环不带括号，展示层要补回来（U15）═══ */

  {
    const b = build(['G = S_4'])
    const g = b.byId('G')
    if (g?.value.type === 'group') {
      const grp = g.value.group
      const three = grp.elements.find((e) => e.label === '234')
      ok('core 的 S_4 单循环标签确实不带括号', !!three, grp.elements.map((e) => e.label).join(' '))
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

      const hint = build(['G = S_4', 'n = ord(G, zzz)']).line('n')?.hint ?? ''
      ok('元素提示里用 (234) 而不是 234', hint.includes('(234)'), hint.slice(0, 80))
      ok('提示里没有键盘打不出的字符', !hasNonAscii(hint), hint.slice(0, 80))
    }
  }
  {
    // C_12 里有元素标签 `10`——**它不是置换，不许加括号**。
    // 加括号那一关靠 resolveElementLoose 的回认挡住（`(10)` 解析不了）。
    const c = build(['H = C_12'])
    const h = c.byId('H')
    if (h?.value.type === 'group') {
      const grp = h.value.group
      const ten = grp.elements.find((e) => e.label === '10')
      ok('C_12 里确有标签 10 的元素', !!ten, grp.elements.map((e) => e.label).join(' '))
      if (ten) eq('但它不是置换，保持原样', elementNotation(grp, ten), '10')
    }
  }

  /* ══ 「键盘打不出来的字符」：一律拦，并给可照抄的改法 ═══════════════ */

  suite('notation \\cdot 键盘打不出来的字符：拦下来 + 给改法')
  {
    // ① 分四类（调用方据此说不同的话）
    eq('下标字符', scanNotAscii(SUB4)?.kind, 'subscript')
    eq('上标字符', scanNotAscii(SUP2)?.kind, 'superscript')
    eq('希腊字母', scanNotAscii(PHI)?.kind, 'greek')
    eq('数学符号', scanNotAscii(CAP)?.kind, 'symbol')
    eq('纯 ASCII 不报', scanNotAscii('S_4'), null)
    eq('中文放行（那是用户写的内容）', scanNotAscii('闭包(G)'), null)
    eq('中文标点也放行（—— … 是输入法的标准标点）', scanNotAscii('A —— B …'), null)

    // ② 建议是**整串真折过**的结果，不是模板 —— 做法借自 GroupViz 的 canonical.ts
    eq('S₄ -> S_4（整串折，不是只折那个字符）', scanNotAscii(`S${SUB4}`)?.suggestion, 'S_4')
    eq('\\varphi -> \\varphi', scanNotAscii(PHI)?.suggestion, '\\varphi')
    eq('\\Omega -> \\Omega', scanNotAscii(OMEGA)?.suggestion, '\\Omega')
    eq('嵌在表达式里也折整串：ker(\\varphi)', scanNotAscii(`ker(${PHI})`)?.suggestion, 'ker(\\varphi)')
    eq('A \\cap B -> A \\cap B', scanNotAscii(`A ${CAP} B`)?.suggestion, 'A \\cap B')

    // ③ **折叠必须保语义**（GroupViz 那边实测栽过的坑）
    //    `C_2^2` 若折成 `C_22`，建议用户改写成 `C_{22}` —— 静默给出**另一个群**。
    eq('C_2^2 -> C_2^2（不是 C_22！）', scanNotAscii(`C_2${SUP2}`)?.suggestion, 'C_2^2')
    eq('C₁₂ -> C_12（连续同类合并成一个）', scanNotAscii('C\u2081\u2082')?.suggestion, 'C_12')
    eq('C₂\\times C₂ -> C_2\\times C_2（下标与乘号一起折）', scanNotAscii('C\u2082\u00d7C\u2082')?.suggestion, 'C_2\\times C_2')
    eq('\\varphi（U+03D5，论文里复制来的是这个码位）也给同一条建议', scanNotAscii(PHISYM)?.suggestion, '\\varphi')

    // ④ 真的建不出来，而且报错里**有改法**
    {
      const bad = build([`${PHI} = C_6`])
      eq('用 \\varphi 当名字建不出对象', bad.objects.length, 0)
      const st = bad.lineStates[0]
      ok('报错说"键盘打不出来"', (st?.error ?? '').includes('键盘打不出来'), st?.error)
      ok('并给出可照抄的改法', (st?.hint ?? '').includes('\\varphi'), st?.hint ?? '')
    }
    {
      const bad = build(['G = S_4', `X = C_2${SUP2}`])
      eq('表达式里用 ^2 也建不出来', bad.orderOf('X'), null)
      const st = bad.lineStates.find((s) => s.raw.includes('X'))
      ok('报错说"上标字符"', (st?.error ?? '').includes('上标字符'), st?.error)
      ok('改法是 C_2^2', (st?.hint ?? '').includes('C_2^2'), st?.hint ?? '')
    }
    {
      const bad = build([`N = C_6`, `R = N ${SUBSET} G`])
      ok('关系行里的 \\subseteq 也被拦', (bad.lineStates.at(-1)?.error ?? '').includes('键盘打不出来'), bad.lineStates.at(-1)?.error)
    }

    // ⑤ 名字那一侧同一套判据（`checkName`）
    ok('\\varphi 不能当名字', !checkName(PHI, []).ok)
    ok('提示给的是 \\varphi', (checkName(PHI, []).hint ?? '').includes('\\varphi'), checkName(PHI, []).hint ?? '')
    ok('\\varphi可以当名字（全是 ASCII）', checkName('\\varphi', []).ok, checkName('\\varphi', []).error ?? '')
    ok('\\Omega也可以', checkName('\\Omega', []).ok)
    // 名字层只要求"是命令形态"（\ + 字母）—— 是不是真实命令交给画布：
    // KaTeX 认不出的会画成红字，比在这里维护一张 LaTeX 命令全集便宜得多
    ok('\\foo也合法（形态对即可，渲染时会红字提醒）', checkName('\\foo', []).ok)
    ok('带空格的不行', !checkName('a b', []).ok)

    // ⑥ 折叠函数本身：纯 ASCII 恒等
    eq('foldToAscii 对纯 ASCII 恒等', foldToAscii('S_4'), 'S_4')
    eq('foldToAscii 不动中文', foldToAscii('闭包(G)'), '闭包(G)')
  }

  /* ══ 群记号：ASCII 形态建得出、Unicode 形态被拦 ═══════════════ */

  suite('notation \\cdot 群记号：ASCII 形态能敲、Unicode 形态被拦')
  {
    const good = ['S_4', 'S_3', 'A_4', 'A_5', 'D_4', 'C_6', 'C_12', 'Q_8', 'S_6', 'Z_6', 'C_2 x C_2']
    for (const g of good) {
      const r = build([`X = ${g}`])
      ok(`「${g}」建得出群`, !!r.orderOf('X'), r.line('X')?.error ?? '（没给出阶）')
    }

    // 旧的 Unicode 写法：一律拦，且报错带改法
    const bads: [string, string][] = [
      ['S\u2084', 'S_4'],
      ['C\u2082\u00d7C\u2082', 'C_2\\times C_2'],
      ['Z\u2086', 'Z_6'],
      ['A\u2084', 'A_4'],
    ]
    for (const [bad, fixed] of bads) {
      const r = build([`X = ${bad}`])
      eq(`「${bad}」建不出来`, r.orderOf('X'), null)
      const st = r.lineStates.find((s) => s.raw.includes('X'))
      ok(`「${bad}」的改法是「${fixed}」`, (st?.hint ?? '').includes(fixed), st?.hint ?? '')
    }

    // 重名检查按**字面名字**算（不再有归一，所以 `\phi` 与 `\varphi` 是两个名字）
    const dup = build(['X = C_6', 'X = C_3'])
    eq('同名会被拦住', dup.lineStates[1]?.error, '名字「X」重复定义')
  }
}
