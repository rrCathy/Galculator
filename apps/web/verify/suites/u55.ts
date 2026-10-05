/**
 * U55 回归线（2026-10-03）：**小群表** —— 把引擎内嵌的 1–31 阶 93 个群接成可导入的对象。
 *
 * 起因是用户那句「学学 groupviz 怎么**导入常见群**」（与"中文函数全 ASCII"同一句里
 * 的第 1 点）。侦察下来：引擎里躺着 93 个群的完整乘法表，而 Galculator **一个也拿不到**
 * —— `S_4` / `D_4` / `C_2^2` 这类靠记号构造还行，`(C_4 x C_2):C_2`（16 阶）、
 * `C_3:Q_8`（24 阶）这些**没有惯用记号、也没写构造器**的群完全没有入口。
 * 更难看的是报错语**早就在承诺**出路了（`evalDef` / `ops.ts` 都写着
 * "改用 SmallGroup(n, i)"）—— 而那时 `SmallGroup(16, 3)` 在界面上根本不是能敲的东西。
 *
 * ── 本套守的判据 ───────────────────────────────────────────────
 *   ① **编号是 GAP 的（1 起）**：`SmallGroup(8,3) ≅ D_8`、`SmallGroup(24,12) ≅ S_4`
 *      —— 依据 GAP 的 `NAMES_OF_SMALL_GROUPS`（`grpnames.g`）；
 *   ② **引擎注册表的下标不是 GAP 编号**（1–15 阶顺序自定），必须过校正表；
 *      校正表是**手算**的，本套用**可执行**的方式给它背书（逐条比元素阶分布）；
 *   ③ **界面印的坐标 = 能敲的坐标**：结论层给的 `SmallGroup(阶, 编号)` 抄进输入球
 *      必须得到**同一个群**（这条是 U55 真正的收口 —— 从前印的是 0 起注册表下标）；
 *   ④ **建群走 core 那条路**，所以 `smallGroup(8, 3)` 与手写 `D_4` **同一 id 空间**；
 *   ⑤ **边界要看得见**：越界的阶 / 越界的编号，error 里得有**具体数字**，不猜；
 *   ⑥ **纯文本面零泄漏**（与 `e2e/no-unicode-leak.mjs` 的 `ALLOWED` 逐字同一套）。
 *
 * ⚠️ **期望值全部手算**，不从运行结果抄。手算依据：
 *
 *   GAP `NAMES_OF_SMALL_GROUPS`（`grpnames.g`，按 GAP 编号 1 起排）：
 *
 *   | 阶 | GAP 顺序 |
 *   |---|---|
 *   | 6 | `S3, C6` |
 *   | 8 | `C8, C4 x C2, D8, Q8, C2 x C2 x C2` |
 *   | 10 | `D10, C10` |
 *   | 12 | `C3 : C4, C12, A4, D12, C6 x C2` |
 *   | 14 | `D14, C14` |
 *   | 24 | …第 12 位是 `S4` |
 *
 *   而引擎注册表的顺序（实测 `getAllSmallGroups()`）：
 *   6 阶是 `C_6, S_3`；8 阶是 `C_8, C_4×C_2, C_2³, D_4, Q_8`；12 阶是
 *   `C_12, C_6×C_2, D_6, A_4, C_3:C_4`。⇒ 只有 6 / 8 / 10 / 12 / 14 阶需要校正。
 *
 *   `Aut(S_4) ≅ S_4` ⇒ 阶 24，GAP 编号 **12** ⇒ `SmallGroup(24, 12)`。
 *   `C_2³`（用 `directProduct` 造出来）⇒ GAP `(8, 5)`（不是注册表下标 2！）
 *   —— 这正是"印出来的坐标抄进去会拿到另一个群"的那类错误。
 */
import { computeElementOrderInGroup, getAllSmallGroups, type Group } from '@groupviz/core'
import { build, eq, ok, suite } from '../harness'
import { buildLines } from '../../src/gal/build'
import { gapNumberOf, planSmallGroup, smallGroupCatalog, smallGroupCount } from '../../src/gal/smallGroups'
import { opById, opTemplate, OPS } from '../../src/gal/ops'
import { objectArity } from '../../src/gal/compose'
import { menuLabel, multiOps } from '../../src/gal/interaction'
import { groupInsights } from '../../src/gal/insights'

/** 纯文本面判据 —— 与 `e2e/no-unicode-leak.mjs` 的 `ALLOWED` **逐字相同**（改边界几处一起改）。 */
const PLAIN_OK = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const leakChars = (s: string) => [...new Set([...s].filter((c) => !PLAIN_OK.test(c)))]
function audit(strings: { what: string; text: string }[]): void {
  for (const s of strings) {
    if (!s.text) continue
    ok(`${s.what}：没有键盘打不出的字符`, leakChars(s.text).length === 0, leakChars(s.text).join(' '))
  }
}

/** 元素阶分布（排序后的阶多重集）—— 不变量里最结实的一项，用来给手算的编号表背书。 */
function orderProfile(g: Group): string {
  return g.elements
    .map((e) => computeElementOrderInGroup(e, g))
    .sort((a, b) => a - b)
    .join(',')
}

/** 跑一行定义，拿最后一个**群对象**的结论。 */
function groupInsOf(lines: string[]) {
  const r = buildLines(lines)
  const last = r.objects[r.objects.length - 1]
  if (last?.value.type !== 'group') {
    return { labels: [] as string[], insights: [] as ReturnType<typeof groupInsights> }
  }
  const ins = groupInsights(last.value.group, last)
  return { labels: ins.map((i) => i.label), insights: ins }
}

export function run(): void {
  /* ══ ① 编号表：引擎注册表下标 → GAP 编号 ══════════════════════════ */

  suite('u55 \\cdot 小群表：编号是 GAP 的（1 起），不是注册表下标')

  {
    // 8 阶：注册表 `C_8, C_4×C_2, C_2³, D_4, Q_8` → GAP `(1,2,5,3,4)`
    eq('8 阶 index 0 → GAP 1（C_8）', gapNumberOf(8, 0), 1)
    eq('8 阶 index 1 → GAP 2（C_4×C_2）', gapNumberOf(8, 1), 2)
    eq('8 阶 index 2 → GAP 5（C_2³ —— 不是 3！）', gapNumberOf(8, 2), 5)
    eq('8 阶 index 3 → GAP 3（D_8）', gapNumberOf(8, 3), 3)
    eq('8 阶 index 4 → GAP 4（Q_8）', gapNumberOf(8, 4), 4)

    // 6 / 10 / 14 阶是简单对调
    eq('6 阶 index 0（C_6）→ GAP 2', gapNumberOf(6, 0), 2)
    eq('6 阶 index 1（S_3）→ GAP 1', gapNumberOf(6, 1), 1)
    eq('10 阶 index 0（C_10）→ GAP 2', gapNumberOf(10, 0), 2)
    eq('14 阶 index 1（D_7）→ GAP 1', gapNumberOf(14, 1), 1)

    // 12 阶：`C_12, C_6×C_2, D_6, A_4, C_3:C_4` → `(2, 5, 4, 3, 1)`
    eq('12 阶 index 4（C_3:C_4）→ GAP 1', gapNumberOf(12, 4), 1)
    eq('12 阶 index 3（A_4）→ GAP 3', gapNumberOf(12, 3), 3)
    eq('12 阶 index 0（C_12）→ GAP 2', gapNumberOf(12, 0), 2)

    // 16 阶以上引擎直接照抄 GAP 数据 ⇒ 恒等于 index + 1
    eq('16 阶 index 2 → GAP 3（恒等段）', gapNumberOf(16, 2), 3)
    eq('24 阶 index 11（S_4）→ GAP 12', gapNumberOf(24, 11), 12)
    eq('31 阶 index 0 → GAP 1', gapNumberOf(31, 0), 1)

    // 越界 / 非法一律 null（不猜）
    eq('0 阶 → null', gapNumberOf(0, 0), null)
    eq('32 阶 → null（表只到 31）', gapNumberOf(32, 0), null)
    eq('负下标 → null', gapNumberOf(8, -1), null)
    eq('非整数下标 → null', gapNumberOf(8, 1.5), null)

    /*
     * ── 手算表的**可执行背书**（本套最硬的一条）────────────────────
     * 逐阶、逐条：注册表条目 `e` 与 `SmallGroup(e.order, 校正后编号)` 重建的群，
     * **元素阶分布必须相等**；并且这个映射在每个阶上是**双射**。
     * 表里写错一个数（或漏一个需要校正的阶），这里立刻红。
     */
    const all = getAllSmallGroups()
    const orders = [...new Set(all.map((e) => e.order))].sort((a, b) => a - b)
    const badProfile: string[] = []
    const badBijection: string[] = []
    const unbuildable: string[] = []
    let checked = 0
    for (const order of orders) {
      const entries = all.filter((e) => e.order === order)
      const seen = new Set<number>()
      for (const e of entries) {
        const gap = gapNumberOf(order, e.index)
        if (gap === null || gap < 1 || gap > entries.length) {
          badBijection.push(`${order} 阶 index ${e.index} → ${String(gap)}`)
          continue
        }
        if (seen.has(gap)) badBijection.push(`${order} 阶 GAP ${gap} 撞号`)
        seen.add(gap)
        const plan = planSmallGroup(order, gap)
        if (!plan.ok) {
          unbuildable.push(`${order}#${gap}`)
          continue
        }
        checked++
        if (orderProfile(plan.group) !== orderProfile(e.group)) {
          badProfile.push(`${order}#${gap}（${e.group.symbol}）：重建 ${orderProfile(plan.group)} vs 注册表 ${orderProfile(e.group)}`)
        }
      }
    }
    ok('93 条全部建得出来', unbuildable.length === 0, unbuildable.join(', '))
    ok('编号映射在每一阶都是双射（1..count 无空洞无撞号）', badBijection.length === 0, badBijection.join('; '))
    ok('校正后每条的元素阶分布与注册表条目一致', badProfile.length === 0, badProfile.join('; '))
    eq('核对条数就是全表 93 条', checked, 93)

    /*
     * 手选**锚点**：这几条的 `structure` 是照 GAP 的 `grpnames.g` 抄的，
     * 光靠"阶分布相同"还分不出某些同分布的群，所以再钉几条**符号**。
     */
    const anchors: [number, number, string][] = [
      [6, 1, 'S_{3}'],
      [8, 1, 'C_{8}'],
      [8, 3, 'D_{4}'],
      [8, 4, 'Q_{8}'],
      [8, 5, 'C_{2}^{3}'],
      [12, 1, 'C_{3}:C_{4}'],
      [12, 3, 'A_{4}'],
      [16, 3, '(C_{4}\\times C_{2}):C_{2}'],
      [24, 12, 'S_{4}'],
    ]
    for (const [n, i, sym] of anchors) {
      const plan = planSmallGroup(n, i)
      eq(`锚点 SmallGroup(${n}, ${i}) 的结构符号`, plan.ok ? plan.group.symbol : '<建不出>', sym)
    }
  }

  /* ══ ② 目录（93 条，按阶分组）════════════════════════════════════ */

  suite('u55 \\cdot 小群表：目录')

  {
    const cat = smallGroupCatalog()
    eq('目录覆盖 31 个阶', cat.length, 31)
    eq('目录总共 93 条', cat.reduce((s, g) => s + g.count, 0), 93)
    eq('首阶是 1 阶', cat[0].order, 1)
    eq('末阶是 31 阶', cat[cat.length - 1].order, 31)

    const o8 = cat.find((g) => g.order === 8)!
    eq('8 阶 5 条', o8.count, 5)
    eq('8 阶编号是 1..5', o8.entries.map((e) => e.i).join(','), '1,2,3,4,5')
    ok('8 阶目录第 3 条是 D_4（GAP (8,3)）', o8.entries[2].structure.includes('D_4'), o8.entries.map((e) => `${e.i}:${e.structure}`).join(' '))
    // `asciiSymbol` 把 `C_{2}^{3}` 折成 `C_2^3`（幂写法保留），所以照这个形态判
    eq('8 阶最后一条是 C_2^3（GAP (8,5)）', o8.entries[4].structure, 'C_2^3')

    eq('16 阶 14 条', cat.find((g) => g.order === 16)!.count, 14)
    eq('24 阶 15 条', cat.find((g) => g.order === 24)!.count, 15)
    eq('27 阶 5 条', cat.find((g) => g.order === 27)!.count, 5)
    eq('29 阶 1 条（素数阶只有循环群）', cat.find((g) => g.order === 29)!.count, 1)

    eq('smallGroupCount(8)', smallGroupCount(8), 5)
    eq('smallGroupCount(32)（表外）', smallGroupCount(32), 0)

    /*
     * 分组的三条**不变量**（U56 目录面板直接吃这张表，排错了用户在界面上就挑不到）：
     * 组间按阶升序 · 组内按 GAP 编号升序且不重号 · `count` 与条目数一致。
     */
    ok(
      '组按阶升序',
      cat.every((g, k) => k === 0 || cat[k - 1].order < g.order),
      cat.map((g) => g.order).join(','),
    )
    ok(
      '组内编号严格升序（含不重号）',
      cat.every((g) => g.entries.every((e, k) => k === 0 || g.entries[k - 1].i < e.i)),
      cat
        .filter((g) => !g.entries.every((e, k) => k === 0 || g.entries[k - 1].i < e.i))
        .map((g) => `${g.order}: ${g.entries.map((e) => e.i).join(',')}`)
        .join(' | '),
    )
    ok(
      '每组 count 与条目数一致',
      cat.every((g) => g.count === g.entries.length),
      cat
        .filter((g) => g.count !== g.entries.length)
        .map((g) => `${g.order}: ${g.count}/${g.entries.length}`)
        .join(' '),
    )

    // 93 条**合并成一条断言**（逐条 audit 会把回归台账冲成 93 行噪音，不划算）
    const catLeaks = cat.flatMap((g) => g.entries.flatMap((e) => leakChars(e.structure).map((c) => `${g.order}#${e.i}:${c}`)))
    ok('目录里 93 条结构串都没有键盘打不出的字符', catLeaks.length === 0, catLeaks.join(' '))
  }

  /* ══ ③ planSmallGroup：能建 / 边界要看得见 ═══════════════════════ */

  suite('u55 \\cdot 小群表：建群与边界')

  {
    const d8 = planSmallGroup(8, 3)
    ok('planSmallGroup(8, 3) 建得出来', d8.ok, d8.ok ? '' : `${d8.error} / ${d8.hint ?? ''}`)
    eq('它的阶是 8', d8.ok ? d8.group.order : -1, 8)
    eq('它的符号是 D_{4}', d8.ok ? d8.group.symbol : '<建不出>', 'D_{4}')

    const triv = planSmallGroup(1, 1)
    ok('planSmallGroup(1, 1)（平凡群）建得出来', triv.ok, triv.ok ? '' : String(triv.error))
    eq('它的阶是 1', triv.ok ? triv.group.order : -1, 1)

    const renamed = planSmallGroup(16, 13)
    ok('planSmallGroup(16, 13)（结构重名被改号的那条）也建得出来', renamed.ok, renamed.ok ? '' : String(renamed.error))
    eq('它的阶是 16', renamed.ok ? renamed.group.order : -1, 16)

    const overI = planSmallGroup(8, 6)
    ok('编号越界被拦', !overI.ok, '')
    ok('越界时说得出"8 阶只有 5 个群"', !overI.ok && overI.error.includes('5 个群'), !overI.ok ? overI.error : '')
    ok('越界时 hint 给出可照抄的编号区间', !overI.ok && !!overI.hint && overI.hint.includes('SmallGroup(8, 1)'), !overI.ok ? overI.hint ?? '' : '')

    const overN = planSmallGroup(32, 1)
    ok('32 阶（表外）被拦', !overN.ok, '')
    ok('表外时说得出表的上界 31', !overN.ok && overN.error.includes('31'), !overN.ok ? overN.error : '')

    ok('编号 0 被拦（编号从 1 数起）', !planSmallGroup(8, 0).ok)
    ok('负编号被拦', !planSmallGroup(8, -1).ok)
    ok('非整数阶被拦', !planSmallGroup(8.5, 1).ok)
    ok('非整数编号被拦', !planSmallGroup(8, 1.5).ok)
    ok('0 阶被拦', !planSmallGroup(0, 1).ok)

    /*
     * 报告文字是**纯文本面**（`.row-err` 不走 KaTeX）—— 逐条扫一遍。
     */
    audit([
      { what: '越界编号 error', text: overI.ok ? '' : overI.error },
      { what: '越界编号 hint', text: overI.ok ? '' : overI.hint ?? '' },
      { what: '表外阶 error', text: overN.ok ? '' : overN.error },
      { what: '表外阶 hint', text: overN.ok ? '' : overN.hint ?? '' },
    ])
  }

  /* ══ ④ op 接线：名字 / 参数 / 入口 ═══════════════════════════════ */

  suite('u55 \\cdot 小群表：op 接线')

  {
    const op = opById('smallGroup')
    ok('注册表里有 smallGroup', !!op, '')
    eq('notation 是 ASCII 函数式', op?.notation, 'smallGroup(n, i)')
    eq('菜单标签从 notation 派生', op ? menuLabel(op) : '<无>', 'smallGroup')
    eq('arity 是 2', op?.arity, 2)
    eq('params 长度 2', op?.params.length, 2)
    eq('第一参是整数', op?.params[0].type, 'int')
    eq('第二参是整数', op?.params[1].type, 'int')
    eq('结果是群', op?.result, 'group')
    eq('它不是 §3 的原语（与 pointSet 同档）', op?.primitive, false)

    // 两个参数都是标量 ⇒ 画布给不了 ⇒ 不进 ⊕ 球（诚实记录：只能打字）
    ok('objectArity 是 0（画布上点不出参数）', objectArity(op!) === 0, String(objectArity(op!)))
    ok('因此它**不在** ⊕ 球的多对象操作里', !multiOps().map((o) => o.id).includes('smallGroup'))

    const tpl = op ? opTemplate(op) : ''
    ok('opTemplate 里含 smallGroup(', tpl.includes('smallGroup('), tpl)
    ok('opTemplate 照抄能跑（纯 ASCII）', leakChars(tpl).length === 0, leakChars(tpl).join(' '))
    eq('注册表 45 条（U55 加小群表，U60 加代数结构）', OPS.length, 45)
  }

  /* ══ ⑤ 跑真表达式：能敲出来、错得明白、与手写共享 id 空间 ════════ */

  suite('u55 \\cdot 小群表：跑真表达式')

  {
    const g16 = build(['G = smallGroup(16, 3)'])
    ok('`G = smallGroup(16, 3)` 跑得动', g16.line('G')?.ok === true, g16.err('G') ?? '')
    eq('G 的阶是 16', g16.orderOf('G'), 16)
    const sub16 = g16.line('G')?.object?.sub ?? ''
    ok('副行写出出处 SmallGroup(16, 3)', sub16.includes('SmallGroup(16, 3)'), sub16)
    ok('副行没有泄漏字符', leakChars(sub16).length === 0, leakChars(sub16).join(' '))

    const g8 = build(['G = smallGroup(8, 3)'])
    eq('`smallGroup(8, 3)` 的阶是 8', g8.orderOf('G'), 8)

    const g1 = build(['G = smallGroup(1, 1)'])
    eq('`smallGroup(1, 1)` 的阶是 1', g1.orderOf('G'), 1)

    /*
     * **同一 id 空间**：`smallGroup(8, 3)` 与手写 `D_4` 的建群路是同一条
     * （core 的记号解析），所以元素 id 列表必须逐字相同 ——
     * 这是"两个入口同一结果"的可执行版本，也是它们**能直接互相比**的前提。
     */
    const both = build(['A = D_4', 'B = smallGroup(8, 3)'])
    const idsA = both.byId('A')?.value.type === 'group' ? both.byId('A')!.value.group.elements.map((e) => e.id).join(',') : '<A 不是群>'
    const idsB = both.byId('B')?.value.type === 'group' ? both.byId('B')!.value.group.elements.map((e) => e.id).join(',') : '<B 不是群>'
    ok('`smallGroup(8, 3)` 与手写 `D_4` 的元素 id 完全一致', idsA === idsB && !idsA.startsWith('<'), `D_4: ${idsA} | smallGroup: ${idsB}`)

    // 错误面：边界要在界面上看得见（而且指路可照抄）
    const bad1 = build(['X = smallGroup(8, 9)'])
    ok('`smallGroup(8, 9)` 报错', bad1.line('X')?.ok === false, '')
    ok('报错里带上了"8 阶只有 5 个群"', (bad1.err('X') ?? '').includes('5 个群'), bad1.err('X') ?? '')
    const bad2 = build(['X = smallGroup(40, 1)'])
    ok('`smallGroup(40, 1)`（表外阶）报错', bad2.line('X')?.ok === false, '')
    ok('报错里带上了表的上界 31', (bad2.err('X') ?? '').includes('31'), bad2.err('X') ?? '')

    const strings = [bad1, bad2].flatMap((b, k) => [
      { what: `错误 ${k} error`, text: b.line('X')?.error ?? '' },
      { what: `错误 ${k} hint`, text: b.line('X')?.hint ?? '' },
    ])
    audit(strings)
  }

  /* ══ ⑥ 收口：结论层印的坐标 = 能敲进输入球的坐标 ═════════════════ */

  suite('u55 \\cdot 小群表：结论层的坐标就是能敲的坐标')

  {
    // `Aut(S_4) ≅ S_4`，阶 24 ⇒ GAP (24, 12)
    const aut = groupInsOf(['G = S_4', 'A = Aut(G)'])
    ok(
      'Aut(S_4) 的识别坐标是 SmallGroup(24, 12)',
      aut.insights.some((i) => (i.detail ?? '').includes('SmallGroup(24, 12)')),
      aut.insights.map((i) => i.detail).join(' | '),
    )
    ok('那个坐标真能建出群（阶 24）', planSmallGroup(24, 12).ok && (planSmallGroup(24, 12) as { ok: true; group: Group }).group.order === 24)

    /*
     * **低阶校正的直接证据**：`C_2³` 是 8 阶。
     *   · GAP `(8,5)` = `C_2 x C_2 x C_2` ✓
     *   · 而注册表下标 2 → 从前印的是 `SmallGroup(8, 2)`（那是 GAP 的 `D_8`）——会指到别的群上。
     */
    const c2cube = groupInsOf(['K = directProduct(directProduct(C_2, C_2), C_2)'])
    const detail = c2cube.insights.map((i) => i.detail ?? '').join(' | ')
    ok('构造出来的 C_2^3 给出坐标 SmallGroup(8, 5)', detail.includes('SmallGroup(8, 5)'), detail)
    ok('**不**给出错的 SmallGroup(8, 2)', !detail.includes('SmallGroup(8, 2)'), detail)

    // 坐标 ↔ 对象：两条路得到的群阶相同（同一件事的两个入口）
    const p85 = planSmallGroup(8, 5)
    const built = build(['K = directProduct(directProduct(C_2, C_2), C_2)'])
    eq('坐标 SmallGroup(8, 5) 建出的阶 == 那个 C_2^3 的阶', p85.ok ? p85.group.order : -1, built.orderOf('K') ?? -2)
    eq('两边都是 8', p85.ok ? p85.group.order : -1, 8)

    audit(aut.insights.map((i) => ({ what: `Aut detail`, text: i.detail ?? '' })))
  }

  /* ══ ⑦ 顺带修掉的真账：素数幂 ≠ 素数阶 ═══════════════════════════ */

  suite('u55 \\cdot 阶的分解：素数幂不等于素数阶（走查抓到的真账）')

  {
    /*
     * 走查里点 `smallGroup(8, 3)` 时看到结论区写着「阶 |G| = 8 = 2^3，**素数阶 -> 循环群**」
     * —— 而 `D_8` 与 `(C_4 x C_2):C_2` 都是 8 阶，**既不素也不循环**。
     * 病根在 `factorizeOrder` 回的是**互异素因子**表（`2^4` 只有一条），
     * 于是 `fs.length > 1` 这个判据把"素数幂"错判成了"素数阶"。
     */
    const c7 = groupInsOf(['G = C_7'])
    ok('C_7（真素数阶）说「素数阶 -> 循环群」', c7.insights.some((i) => (i.detail ?? '').includes('素数阶 -> 循环群')), c7.insights.map((i) => i.detail).join(' | '))

    const c8 = groupInsOf(['K = directProduct(directProduct(C_2, C_2), C_2)'])
    ok('8 阶（2^3）**不**冒充素数阶', !c8.insights.some((i) => (i.detail ?? '').includes('素数阶')), c8.insights.map((i) => i.detail).join(' | '))
    ok('8 阶说的是「素数幂阶 -> 幂零」', c8.insights.some((i) => (i.detail ?? '').includes('素数幂阶')), c8.insights.map((i) => i.detail).join(' | '))

    const c12 = groupInsOf(['G = C_12'])
    ok('12 阶（2^2·3）说「素因子分解」', c12.insights.some((i) => (i.detail ?? '').includes('素因子分解')), c12.insights.map((i) => i.detail).join(' | '))

    audit([
      ...c7.insights.map((i) => ({ what: 'C_7 阶 detail', text: i.detail ?? '' })),
      ...c8.insights.map((i) => ({ what: '8 阶 detail', text: i.detail ?? '' })),
      ...c12.insights.map((i) => ({ what: '12 阶 detail', text: i.detail ?? '' })),
    ])
  }
}
