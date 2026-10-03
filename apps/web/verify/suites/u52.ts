/**
 * U52 回归线（2026-10-02）：**自定义作用** —— `ActionKind` 里那个空了很久的槽位。
 *
 * 起因是用户的问题：「自定义群作用呢？」。侦察下来：`value.ts` 里 `custom` 有标签、
 * 有分支，**全项目零个生产者**（`grep` 得到 0）；四个内置作用早就接线了。
 * 而代数上"一个作用" = "一个同态 `φ : G -> S_Ω`"，所以定义作用就是
 * "给每个生成元挑一个置换" —— 与「映射」同一件事，只是靶群不用建出来。
 *
 * ⚠️ **期望值全部手算**，不从运行结果抄。手算过程：
 *
 *   `C_4`（`a` 阶 4）：
 *     · `a -> (1 2 3 4)`：像的阶 4 = 生成元的阶 ⇒ φ 单射 ⇒ **忠实**（|im| = 4）；
 *       4-循环在 4 个点上只有一个轨道 ⇒ **传递**。
 *     · `a -> (12)(34)`：像的阶 2，2 | 4 ✓（像的阶必须整除生成元的阶）。
 *       但 φ(a²) = ((12)(34))² = id ⇒ **核 ⊇ {e, a²}**；φ(a) ≠ id ⇒ 核恰是 ⟨a²⟩（2 阶）。
 *       像 ≅ C₂（|G|/|ker| = 2 ✓）。轨道：1<->2、3<->4 ⇒ **2 个轨道，各 2 个点**。
 *     · `a -> e`（n = 3）：核 = G（4 阶）⇒ 3 个轨道（每点一个）。
 *     · `a -> (1 2 3)`：像的阶 3，而 3 ∤ 4 ⇒ **不可能是同态**（3-循环套不进 4 阶生成元的像）。
 *
 *   `S_4`（生成元 `s12` 阶 2、`c` = `\sigma_{1234}` 阶 4）：
 *     · `s12 -> (12)`、`c -> (1234)`：⟨传递换位, 4-循环⟩ = S_4（标准结论）⇒ **忠实**，
 *       而 (12) 与 (1234) 一起在 4 个点上传递 ⇒ **1 个轨道**。|im| = 24 ✓。
 *
 *   `V_4` = {e, a, b, ab}（生成元 `a`、`b`，都 2 阶）：
 *     · `a -> (12)(34)`、`b -> (13)(24)`：则 ab ↦ (12)(34)(13)(24) = (14)(23)
 *       （三个不同的对换之积 + 恒等 = Klein 四元群）⇒ **忠实**；
 *       1 ↦ 2 / 3 / 4 分别是 a / b / ab 的像 ⇒ **传递**。
 *
 *   `D_4`（`r` 阶 4、`s` 阶 2，关系 `srs = r^-1`）：
 *     · `r -> (1234)`、`s -> (12)(34)`：验证关系 ——
 *       (12)(34)·(1234)·(12)(34) = (τ(1)τ(2)τ(3)τ(4)) 起点取 1 → (1 4 3 2) = (1234)^-1 ✓
 *       ⇒ 是同态；这正是**正方形 4 个顶点上的自然作用** ⇒ 忠实、传递。
 *
 *   `Q_8`（`i`、`j` 都 4 阶，`i² = j²`，`ji = i³j`）：
 *     · `i -> (12)`、`j -> (12)`（n = 2）：像的阶 2 | 4 ✓；关系 ji = i³j ⇒
 *       φ(j)φ(i) = p·p = id、φ(i³j) = p^(3+1) = p⁴ = id ✓；j² = i² ⇒ p² = p² ✓
 *       ⇒ **是同态** Q_8 ↠ C₂（把所有生成元都扔给同一个对换）。
 *       核 = {x : 生成元指数和为偶} = {1, -1, k, -k} = **⟨k⟩（4 阶）** ⇒ 不忠实；
 *       2 个点上传递 ⇒ 1 个轨道。
 *     · `i -> (1234)`、`j -> (13)(24)`：必要性过（4|4、2|4），但 i² = j² 要求
 *       (1234)² = (13)(24) 等于 ((13)(24))² = id —— 矛盾 ⇒ **闭包检查抓住**。
 *
 *   `S_3`（生成元 `s12`、`s23`，都 2 阶）：
 *     · `s12 -> (12)`、`s23 -> (12)`：这就是**符号同态** S_3 → {±1}
 *       （两个对换 ↦ -1，3-循环 ↦ +1）⇒ 核 = A_3（3 阶）⇒ 不忠实；2 点上传递。
 *
 *   一条**不是**数学而是 core 的事实（实测 `.tmp-u52/probe7.mjs`）：
 *   `C_2^2` / `C_2^3` 的生成元在 core 里**重名重号**（都叫 `a`、记号都是 `1`），
 *   而 `extendAndVerifyPerms` 拿 `generator.symbol` 当 key ⇒ 它们只能共用同一个像。
 *   `V_4` 与 `C_2^2` 是**同一个群**，前者能做后者做不了 —— 这不是数学的区别。
 *
 * ── 本套守的四条判据 ──────────────────────────────────────────
 *   ① **不许静默补**：缺生成元的像必须报"还有 k 个没给"（core 会直接 THROW，
 *      而 `buildActionComputation` 不给 arrows 时**静默**返回平凡作用 —— 都不许学）；
 *   ② **忠实性必须披露**：核的大小进 `sub`，信息面板有「核」一行，结论层有一条；
 *   ③ **算不动说清卡在哪**：|G| x n 超线、n 超线、生成元分不开 —— 各自的报错语；
 *   ④ **纯文本面零泄漏**：`sub` / `note` / `error` / `hint` 逐字符比
 *      `e2e/no-unicode-leak.mjs` 的 `ALLOWED`，且 error / hint 里不许出现反斜杠。
 */
import { createCyclicGroup, type Group } from '@groupviz/core'
import { build, eq, ok, suite } from '../harness'
import { actionInsights } from '../../src/gal/insights'
import { menuLabel, multiOps } from '../../src/gal/interaction'
import { OPS, opById, opTemplate, opsFor, type OpDef } from '../../src/gal/ops'
import { composeMapLine } from '../../src/gal/compose'
import {
  CUSTOM_ACTION_CELL_CAP,
  CUSTOM_ACTION_POINT_CAP,
  IDENTITY_TOKEN,
  actionKernel,
  generatorCollisionReason,
  generatorsDistinct,
  planCustomAction,
} from '../../src/gal/customAction'
import type { GalAction } from '../../src/gal/value'

type Built = ReturnType<typeof build>

/** 取某行的作用值（不是作用就 null）。 */
function actionOf(b: Built, id: string): GalAction | null {
  const o = b.byId(id)
  return o?.value.type === 'action' ? o.value.action : null
}

/** 失败的最后一行的 error / hint（成对返回，避免各写一遍）。 */
function failOf(lines: string[]): { err: string; hint: string } {
  const b = build(lines)
  const name = lines[lines.length - 1].split('=')[0].trim()
  const st = b.line(name)
  const bad = !!st && !st.ok
  return { err: bad ? (st.error ?? '') : '', hint: bad ? (st.hint ?? '') : '' }
}

/** 一行的成功串（`sub` / `note`）—— 失败行给空串。 */
function showOf(lines: string[]): { sub: string; note: string } {
  const b = build(lines)
  const name = lines[lines.length - 1].split('=')[0].trim()
  const st = b.line(name)
  if (!st || !st.ok) return { sub: '', note: '' }
  return { sub: st.object?.sub ?? '', note: st.object?.note ?? '' }
}

/** 核的阶（披露用的那个数）。 */
function kernelOrder(A: GalAction): number {
  return actionKernel(A).length
}

/* ── 纯文本面判据（与 u51 逐字同一套）────────────────────── */

/**
 * 与 `e2e/no-unicode-leak.mjs` 的 `ALLOWED` **逐字相同**：放行 ASCII / 中文 /
 * 中文标点 / 中文引号 / 空白。破折号、⇒、希腊字母一律不放行。
 */
const PLAIN_OK = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const leakChars = (s: string) => [...new Set([...s].filter((c) => !PLAIN_OK.test(c)))]

/** 一次把多组串过一遍四条判据。 */
function audit(strings: { what: string; text: string }[]): void {
  for (const s of strings) {
    if (!s.text) continue
    ok(`${s.what}：没有键盘打不出的字符`, leakChars(s.text).length === 0, leakChars(s.text).join(' '))
  }
}

export function run(): void {
  /* ══ 1 · 唯一就建：C_4 上的 4-循环（传递 + 忠实）══════════ */

  suite('u52 \\cdot 自定义作用：给每个生成元一个置换')
  {
    const lines = ['G = C_4', 'A = customAction(G, 4, a -> (1 2 3 4))']
    const b = build(lines)
    eq('能建出来', b.err('A'), null)
    const A = actionOf(b, 'A')
    ok('产出的是作用值', !!A)
    if (A) {
      eq('kind = custom', A.kind, 'custom')
      eq('|Omega| = n', A.n, 4)
      eq('每个元素都有像（|G| = 4）', A.perms.size, 4)
      eq('核是平凡的（4-循环忠实）', kernelOrder(A), 1)
      ok('Omega 从 G 上独立出来（不是自环）', A.omegaBase === 'object')
      eq('点标签就是 1..n（与循环记号同一套点号）', (A.setLabels ?? []).join(','), '1,2,3,4')
      eq('Omega 成员数', A.omega?.members.length, 4)

      const ins = actionInsights(A)
      const orbit = ins[0]
      ok('结论层第①条还是轨道分解（没被挤走）', orbit.label === '轨道分解', orbit.label)
      eq('轨道分解报的是「4 = 4」', orbit.text, '|\\Omega| = 4 = 4')
      const kern = ins.find((x) => x.label === '同态的核')
      ok('结论层有「同态的核」一条', !!kern)
      eq('忠实时报 |ker| = 1', kern?.text, '|ker| = 1')
      eq('忠实那条是弱化语气（不是头条）', kern?.tone, 'note')
    }

    const { sub } = showOf(lines)
    ok('副行说了「忠实」', sub.includes('忠实'), sub)
    ok('副行说了「传递」', sub.includes('传递'), sub)
    audit([{ what: '成功路（4-循环）', text: sub }])

    /* C_4 的 4 个下游 */
    const d = build([...lines, 'O = orbits(A, 1)', 'S = stabilizer(A, 1)', 'F = fix(A)'])
    eq('orbits(A, 1) 能算', d.err('O'), null)
    const O = d.byId('O')
    eq('轨道是 4 个点（传递）', O?.value.type === 'set' ? O.value.set.members.length : -1, 4)
    eq('stabilizer(A, 1) 是平凡群（4-循环固定不住任何点）', d.byId('S')?.value.type === 'group' ? (d.byId('S')!.value as { group: Group }).group.order : -1, 1)
    eq('fix(A) 是空集', d.byId('F')?.value.type === 'set' ? d.byId('F')!.value.type === 'set' && (d.byId('F')!.value as { set: { members: unknown[] } }).set.members.length : -1, 0)
  }

  /* ══ 2 · 非忠实必须披露（核 = ⟨a²⟩）══════════════════════ */

  suite('u52 \\cdot 非忠实作用：核的大小要说出来')
  {
    const lines = ['G = C_4', 'A = customAction(G, 4, a -> (12)(34))']
    const b = build(lines)
    eq('能建出来（非忠实是合法作用，不是错误）', b.err('A'), null)
    const A = actionOf(b, 'A')
    eq('核 = 2 阶（{e, a^2}）', A ? kernelOrder(A) : -1, 2)

    const { sub, note } = showOf(lines)
    ok('副行明说「不忠实」', sub.includes('不忠实'), sub)
    ok('副行给了核阶 2', sub.includes('2'), sub)
    ok('note 补一句"像只有几阶"', note.includes('2 阶'), note)
    audit([
      { what: '非忠实副行', text: sub },
      { what: '非忠实 note', text: note },
    ])

    const ins = A ? actionInsights(A) : []
    const kern = ins.find((x) => x.label === '同态的核')
    eq('结论层报 |ker| = 2', kern?.text, '|ker| = 2')
    eq('不忠实那条是醒目语气（key）', kern?.tone, 'key')

    /* 非忠实作用上的轨道 / 稳定子照样要能算 */
    const d = build([...lines, 'O = orbits(A, 1)', 'S = stabilizer(A, 1)', 'F = fix(A)'])
    eq('orbits(A, 1) 能算', d.err('O'), null)
    eq('轨道大小 2（{1,2}）', d.byId('O')?.value.type === 'set' ? (d.byId('O')!.value as { set: { members: unknown[] } }).set.members.length : -1, 2)
    eq('stabilizer(A, 1) = 2 阶（⟨a^2⟩）', d.byId('S')?.value.type === 'group' ? (d.byId('S')!.value as { group: Group }).group.order : -1, 2)
    eq('fix(A) 空（(12)(34) 一个点都不固定）', d.byId('F')?.value.type === 'set' ? (d.byId('F')!.value as { set: { members: unknown[] } }).set.members.length : -1, 0)
  }

  /* ══ 3 · 平凡作用（`e` 是恒等的唯一写法）═════════════════ */

  suite('u52 \\cdot 恒等写 e（core 的循环记号解析器不认 (1)）')
  {
    const b = build(['G = C_4', 'A = customAction(G, 3, a -> e)'])
    eq('e 认作恒等', b.err('A'), null)
    const A = actionOf(b, 'A')
    eq('核 = G（全映成恒等）', A ? kernelOrder(A) : -1, 4)
    eq('3 个轨道（每个点一个）', A ? actionInsights(A)[0].text : '', '|\\Omega| = 3 = 1 + 1 + 1')

    // core 的 parseCycleNotation 对纯不动点一律回 null —— 报错语要把 e 这条出路说出来
    const f = failOf(['G = C_4', 'B = customAction(G, 4, a -> (1))'])
    ok('(1) 被判为不是循环记号', f.err.includes('不是 4 点上的循环记号'), f.err)
    ok('hint 给出恒等的写法', f.hint.includes(IDENTITY_TOKEN), f.hint)
    audit([
      { what: 'parse 失败 error', text: f.err },
      { what: 'parse 失败 hint', text: f.hint },
    ])
    ok('error / hint 里没有反斜杠（纯文本面不写 LaTeX 命令）', !f.err.includes('\\') && !f.hint.includes('\\'), `${f.err} | ${f.hint}`)

    // n = 1：Ω 只有一个点，恒等是唯一可能的像
    const one = build(['G = C_4', 'A = customAction(G, 1, a -> e)'])
    eq('n = 1 也能建', one.err('A'), null)
    eq('n = 1 时核 = G', actionOf(one, 'A') ? kernelOrder(actionOf(one, 'A')!) : -1, 4)
  }

  /* ══ 4 · 手算锚点：S_4 / V_4 / D_4 / Q_8 / S_3 ═══════════ */

  suite('u52 \\cdot 手算锚点：自然作用与符号同态')
  {
    // S_4：换位 + 4-循环生成整个 S_4 ⇒ 忠实
    const s4 = build(['G = S_4', 'A = customAction(G, 4, s12 -> (12), c -> (1234))'])
    eq('S_4 自然作用能建', s4.err('A'), null)
    const A4 = actionOf(s4, 'A')
    eq('|im| = 24（忠实）', A4 ? kernelOrder(A4) : -1, 1)
    eq('perms 覆盖 24 个元素', A4?.perms.size, 24)
    eq('传递（1 个轨道）', A4 ? actionInsights(A4)[0].text : '', '|\\Omega| = 4 = 4')

    // V_4：三个非平凡元素 ↦ 三个不同对换之积 —— Klein 四元群
    const v4 = build(['G = V_4', 'A = customAction(G, 4, a -> (12)(34), b -> (13)(24))'])
    eq('V_4 能建', v4.err('A'), null)
    eq('V_4 忠实', actionOf(v4, 'A') ? kernelOrder(actionOf(v4, 'A')!) : -1, 1)
    eq('V_4 上的作用传递', actionOf(v4, 'A') ? actionInsights(actionOf(v4, 'A')!)[0].text : '', '|\\Omega| = 4 = 4')

    // D_4：正方形 4 个顶点上的自然作用
    const d4 = build(['G = D_4', 'A = customAction(G, 4, r -> (1234), s -> (12)(34))'])
    eq('D_4 的正方形顶点作用能建（关系 srs = r^-1 被闭包检查认下）', d4.err('A'), null)
    eq('忠实', actionOf(d4, 'A') ? kernelOrder(actionOf(d4, 'A')!) : -1, 1)

    // Q_8：全体生成元 ↦ 同一个对换 = Q_8 到 C_2 的商映射
    const q8 = build(['G = Q_8', 'A = customAction(G, 2, i -> (12), j -> (12))'])
    eq('Q_8 的单像作用能建', q8.err('A'), null)
    eq('核 = ⟨k⟩（4 阶）', actionOf(q8, 'A') ? kernelOrder(actionOf(q8, 'A')!) : -1, 4)
    eq('2 个点上传递', actionOf(q8, 'A') ? actionInsights(actionOf(q8, 'A')!)[0].text : '', '|\\Omega| = 2 = 2')

    // S_3：两个对换 ↦ 同一个对换 = 符号同态
    const s3 = build(['G = S_3', 'A = customAction(G, 2, s12 -> (12), s23 -> (12))'])
    eq('符号同态能建', s3.err('A'), null)
    eq('核 = A_3（3 阶）', actionOf(s3, 'A') ? kernelOrder(actionOf(s3, 'A')!) : -1, 3)
  }

  /* ══ 5 · 报错：每一条都要说出「卡在哪」══════════════════ */

  suite('u52 \\cdot 报错语：阶不整除 / 缺像 / 记号不存在 / 闭包不自洽')
  {
    // 阶不整除：3 ∤ 4
    const od = failOf(['G = C_4', 'A = customAction(G, 4, a -> (1 2 3))'])
    ok('说的是"阶是 4 / 像的阶是 3"', od.err.includes('阶是 4') && od.err.includes('阶是 3'), od.err)
    ok('hint 讲清判据（像的阶必须整除生成元的阶）', od.hint.includes('不整除') && od.hint.includes('必须整除'), od.hint)
    audit([
      { what: '阶不整除 error', text: od.err },
      { what: '阶不整除 hint', text: od.hint },
    ])
    ok('阶不整除：error / hint 无反斜杠', !od.err.includes('\\') && !od.hint.includes('\\'), od.hint)

    // 缺像：S_4 有两个生成元
    const miss = failOf(['G = S_4', 'A = customAction(G, 4, s12 -> (12))'])
    ok('点名缺了哪个生成元', miss.err.includes('还有 1 个生成元没给像') && miss.err.includes('c'), miss.err)
    audit([{ what: '缺像 error', text: miss.err }, { what: '缺像 hint', text: miss.hint }])

    // 生成元记号不存在
    const noGen = failOf(['G = S_4', 'A = customAction(G, 4, q -> (12), c -> (1234))'])
    ok('说的是"G 里没有生成元 q"', noGen.err.includes('没有生成元 q'), noGen.err)
    ok('hint 列出真有的生成元', noGen.hint.includes('s12') && noGen.hint.includes('c'), noGen.hint)

    // 闭包不自洽（必要性过、关系不过）—— Q_8 的 i² = j² 对不上
    const closure = failOf(['G = Q_8', 'A = customAction(G, 4, i -> (1234), j -> (13)(24))'])
    ok('报"这组像不构成同态"', closure.err.includes('不构成同态'), closure.err)
    ok('hint 指出**在哪个点**上对不上', /第 [0-9]+ 个点/.test(closure.hint), closure.hint)
    ok('闭包失败 hint 里没有 LaTeX 的 \\sigma 原串', !closure.hint.includes('\\'), closure.hint)
    audit([
      { what: '闭包不自洽 error', text: closure.err },
      { what: '闭包不自洽 hint', text: closure.hint },
    ])

    // 一个像都没给
    const none = failOf(['G = C_4', 'A = customAction(G, 4)'])
    ok('一个像都不给要拦', none.err.includes('至少要给一个生成元的像'), none.err)

    // 像对写法不对（连箭头都没有）
    const bad = failOf(['G = C_4', 'A = customAction(G, 4, a(1 2 3 4))'])
    ok('像对写法不对要拦', bad.err.includes('像对的写法不对'), bad.err)
  }

  /* ══ 6 · 预算：说清卡在哪，且**不许静默** ═══════════════ */

  suite('u52 \\cdot 预算：点数与 |G| x n 各有上限')
  {
    // n 必须是正整数
    eq('n = 0 被拦', failOf(['G = C_4', 'A = customAction(G, 0, a -> e)']).err.includes('必须是正整数'), true)
    eq('n = 1.5 被拦', failOf(['G = C_4', 'A = customAction(G, 1.5, a -> e)']).err.includes('必须是正整数'), true)

    // 点数上限
    const bigN = failOf([`G = C_2`, `A = customAction(G, ${CUSTOM_ACTION_POINT_CAP + 1}, a -> e)`])
    ok(`n > ${CUSTOM_ACTION_POINT_CAP} 被拦`, bigN.err.includes(`超过上限 ${CUSTOM_ACTION_POINT_CAP}`), bigN.err)

    /*
     * `|G| x n` 上限：直接调内核（应用层造不出 300 阶以上的群 ——
     * `C_n` 的门比这窄，`S_8` 进不去）。判据本身与调用方无关。
     */
    const cell = planCustomAction(createCyclicGroup(300), 400, [{ genText: 'a', cycle: IDENTITY_TOKEN }])
    ok(
      `|G| x n = 120000 > ${CUSTOM_ACTION_CELL_CAP} 被拦`,
      !cell.ok && cell.error.includes('本地算不了') && cell.error.includes('120000'),
      cell.ok ? 'ok（不该）' : cell.error,
    )
    // 线上以内要放行（|G| x n = 500 x 200 = 100000 == 上限）
    const edge = planCustomAction(createCyclicGroup(500), 200, [{ genText: 'a', cycle: IDENTITY_TOKEN }])
    ok('恰好等于上限要放行（边界是闭的）', edge.ok, edge.ok ? '' : edge.error)
  }

  /* ══ 7 · core 的生成元重名：直积群上这件事表达不出来 ═════ */

  suite('u52 \\cdot 直积群的生成元在 core 里分不开（不许假装能做）')
  {
    const c22 = build(['G = C_2^2'])
    const g22 = c22.byId('G')?.value.type === 'group' ? (c22.byId('G')!.value as { group: Group }).group : null
    ok('C_2^2 能建出来', !!g22)
    eq('C_2^2 的生成元被判为不可分', g22 ? generatorsDistinct(g22) : true, false)
    const reason = g22 ? generatorCollisionReason(g22) : ''
    ok('理由里点了名字的重数', reason.includes('2 个生成元') && reason.includes('分不开'), reason)
    audit([{ what: '生成元不可分的理由', text: reason }])

    // 同一个群、另一种构造（V_4）的生成元是可分的 —— 区别在 core 的生成元表，不在数学
    const v4 = build(['G = V_4'])
    const gv4 = v4.byId('G')?.value.type === 'group' ? (v4.byId('G')!.value as { group: Group }).group : null
    eq('V_4（同一个群）的生成元可分', gv4 ? generatorsDistinct(gv4) : false, true)

    // 两条路都要拦：文本路与编辑器（编辑器走的是同一个 `planCustomAction`）
    const f = failOf(['G = C_2^2', 'A = customAction(G, 4, a -> (12)(34))'])
    ok('文本路拦下并说清理由', f.err.includes('分不开'), f.err)
    // U54：提示里点的那个名字必须是**用户敲得出来的 ASCII 名**（从前写的是「正则作用」）
    ok('hint 指向内置作用 leftAction', f.hint.includes('leftAction'), f.hint)
    audit([{ what: '生成元不可分 error', text: f.err }, { what: '生成元不可分 hint', text: f.hint }])

    /*
     * **菜单也不许列出它**（U52 把预检钩子收紧之后）。
     *
     * 判据与上面那道门共用 `generatorsDistinct`：列出来点下去只能得到一句"做不了"，
     * 那就是这一批最忌讳的「菜单撒谎」（U38/U51 立的规矩）。
     * `V_4` 与 `C_2^2` 是**同一个群**，一个列一个不列，区别在 core 的生成元表。
     */
    const list22 = c22.byId('G')?.value ? opsFor([c22.byId('G')!.value]).map((o) => o.id) : []
    ok('C_2^2 上**不列**「自定义作用」', !list22.includes('customAction'), list22.join(','))
    ok('  同一张菜单里「正则作用」照列（不是"一律不列"）', list22.includes('leftTranslationAction'), list22.join(','))
    const listV4 = v4.byId('G')?.value ? opsFor([v4.byId('G')!.value]).map((o) => o.id) : []
    ok('V_4（同一个群）上照列', listV4.includes('customAction'), listV4.join(','))

    const plan = planCustomAction(createCyclicGroup(2), 4, [])
    ok('内核那一层同样拦（不只 UI 拦）', !plan.ok, plan.ok ? 'ok（不该）' : '')
  }

  /* ══ 8 · 作用的核：四个内置作用各有姓名 ═════════════════ */

  suite('u52 \\cdot 核（actionKernel）：共轭作用的核就是 Z(G)')
  {
    // 手算：Z(S_3) = 1、Z(C_4) = C_4、Z(D_4) = {1, r^2}（2 阶）
    for (const [nm, src, want] of [
      ['S_3', 'S_3', 1],
      ['C_4', 'C_4', 4],
      ['D_4', 'D_4', 2],
    ] as const) {
      const b = build([`G = ${src}`, 'A = conjAction(G)'])
      const A = actionOf(b, 'A')
      eq(`共轭作用的核 = |Z(${nm})| = ${want}`, A ? kernelOrder(A) : -1, want)
    }
    // 左正则作用必然忠实（Cayley）
    const reg = build(['G = S_3', 'A = leftAction(G)'])
    eq('左正则作用的核 = 1（Cayley 定理）', actionOf(reg, 'A') ? kernelOrder(actionOf(reg, 'A')!) : -1, 1)

    const A = actionOf(build(['G = D_4', 'A = conjAction(G)']), 'A')
    const kern = A ? actionInsights(A).find((x) => x.label === '同态的核') : undefined
    eq('结论层把共轭作用的核点名为 Z(G)', kern?.detail.includes('中心 Z(G)'), true)
  }

  /* ══ 9 · 入口：opsFor / multiOps / 菜单标签 / 编辑器 ═════ */

  suite('u52 \\cdot 四个入口从注册表派生，自动就有')
  {
    const b = build(['G = C_4'])
    const g = b.byId('G')?.value
    const list = g ? opsFor([g]).map((o) => o.id) : []
    ok('选中一个群时列得出「自定义作用」', list.includes('customAction'), list.join(','))

    const op = opById('customAction')
    ok('注册表里有这个 op', !!op)
    eq('要编辑器（对象参数凑齐后弹）', op?.editor, true)
    eq('result 是 action', op?.result, 'action')
    eq('arity = 2（群 + 点数）', op?.arity, 2)
    eq('variadic 声明了像对', op?.variadic?.type, 'genImage')
    /*
     * ⚠️ **U57 翻案**。U52 时这里写的是「不进 multiOps（它只要一个对象）」——
     * 那时把 ⊕ 球理解成"缺第二个**纯**对象"的清单。
     *
     * 用户 2026-10-03 的原话（「我创建了群和点集，然后怎么创建群作用？」）证伪了那条理解：
     * 他手上正好有 `G` 与一个点集，点开 ⊕ 球想"把两样凑一起"，15 条全列出来偏偏
     * 没有 `customAction`（同族的 `conjOn` / `cosetAction` 都在），于是这条最自然的路断了。
     *
     * 真问题是"**要不要从画布上点对象**"，而 Ω 是 `omegaOrInt`（半对象档，U53）⇒ 要。
     * 判据换成了 `takesCanvasObject`（见 `interaction.ts` 的 `multiOps`）。
     */
    ok(
      'U57 翻案：**进** multiOps（Ω 是半对象档 —— 用户手上 G + 点集时这条路必须列得出来）',
      multiOps().some((o) => o.id === 'customAction'),
    )
    eq('菜单标签 = notation 前缀（U54 起不再靠手工表）', op ? menuLabel(op) : '', 'customAction')
    eq('模板给的是能照抄的一行', op ? opTemplate(op) : '', 'customAction(G, 4, a -> (1 2 3 4))')

    // 一行文字往返：编辑器编出来的行必须能被同一条求值路径吃回去。
    // 箭头用的是 `\to`（与 `映射` 同一条 `composeMapLine`）—— 定义行是**输入面**，
    // 反斜杠在这儿是"照抄就能跑"的形态，不是纯文本面的泄漏。
    const expr = composeMapLine(op as OpDef, ['G', '4'], [{ gen: 'a', img: '(1 2 3 4)' }])
    eq('编辑器编出的行', expr, 'customAction(G, 4, a\\to (1 2 3 4))')
    const rt = build(['G = C_4', `A = ${expr}`])
    eq('编出来的行能原样求值（一条路径）', rt.err('A'), null)
    eq('往返之后还是忠实 + 传递', actionOf(rt, 'A') ? kernelOrder(actionOf(rt, 'A')!) : -1, 1)

    /*
     * **预检钩子的契约**（U52 收紧 `opsFor` 之后守这一条）。
     *
     * 从前 `fits` 只在 `selection.length === op.params.length`（对象参数凑满）时才被调用，
     * 于是"参数里夹着标量"的单对象 op **永远等不到那一刻** —— 画布给不了 `n`。
     * 现在改成类型匹配就调，`fits` 必须自己容忍前缀。
     *
     * 半直积是这条改动的对照：它的第二个参数还是**对象**，`opsFor` 在只选了一个群时
     * 根本走不到 `fits`（"还差一个对象"的 op 不进菜单）—— 行为与 U51 逐字一致。
     */
    const a4 = build(['G = A_4']).byId('G')?.value
    const listA4 = a4 ? opsFor([a4]).map((o) => o.id) : []
    ok('只选一个群时，半直积**不**列（它还差一个对象，与 U51 一致）', !listA4.includes('semidirectProduct'), listA4.join(','))
    ok('  而「自定义作用」列得出（它的第二参是标量 n，由编辑器补）', listA4.includes('customAction'), listA4.join(','))
    // 半直积两参齐了就照旧（`fits` 这时才真的有东西判）
    const a4b = build(['G = A_4']).byId('G')?.value
    const s3 = build(['G = S_3']).byId('G')?.value
    const listPair = a4b && s3 ? opsFor([a4b, s3]).map((o) => o.id) : []
    ok('两个群凑齐时，半直积照列', listPair.includes('semidirectProduct'), listPair.join(','))
  }

  /* ══ 10 · 纯文本面：一趟全扫 ═════════════════════════════ */

  suite('u52 \\cdot 纯文本面零泄漏（与 e2e/no-unicode-leak 同一判据）')
  {
    const cases: { what: string; lines: string[] }[] = [
      { what: '唯一就建', lines: ['G = C_4', 'A = customAction(G, 4, a -> (1 2 3 4))'] },
      { what: '非忠实披露', lines: ['G = C_4', 'A = customAction(G, 4, a -> (12)(34))'] },
      { what: '平凡作用', lines: ['G = C_4', 'A = customAction(G, 3, a -> e)'] },
      { what: '缺像', lines: ['G = S_4', 'A = customAction(G, 4, s12 -> (12))'] },
      { what: '记号不存在', lines: ['G = S_4', 'A = customAction(G, 4, q -> (12), c -> (1234))'] },
      { what: '阶不整除', lines: ['G = C_4', 'A = customAction(G, 4, a -> (1 2 3))'] },
      { what: '分不开', lines: ['G = C_2^3', 'A = customAction(G, 8, a -> (12))'] },
      { what: 'n 非法', lines: ['G = C_4', 'A = customAction(G, 0, a -> e)'] },
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

    // 报错语一栏：不许出现反斜杠（u51 立的规矩，新增的 op 也要守）
    const errTexts = strings.filter((s) => s.what.includes('error') || s.what.includes('hint'))
    const withSlash = errTexts.filter((s) => s.text.includes('\\'))
    ok('error / hint 里没有反斜杠', withSlash.length === 0, withSlash.map((s) => `${s.what}: ${s.text}`).join(' | '))
  }

  /* ══ 11 · 注册表自洽（有人动过面就得有人知道）═══════════ */

  suite('u52 \\cdot 注册表')
  {
    // U51 的 40 条 + U52 的「自定义作用」= 41；U53 又加「点集」「集合」= 43；U55 的「小群表」= 44
    ok('注册表 44 条（U52 加自定义作用，U53 加点集/集合，U55 加小群表）', OPS.length === 44, String(OPS.length))
    const op = opById('customAction')
    eq('params 长度 == arity + optional', op?.params.length, (op?.arity ?? 0) + (op?.optional ?? 0))
    ok('别名里没有裸 `action`（那会遮住别的东西）', !(op?.call ?? []).includes('action'))
  }
}
