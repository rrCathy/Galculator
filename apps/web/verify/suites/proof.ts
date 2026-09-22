/**
 * M1 / M2 / U15：Proof Spec 的 Sylow 三模板与 step-through 执行器。
 *
 * 盯四件事：
 *   ① **每一步都必须可求值** —— "走一步 = 写一行"的底线；
 *   ② 走到底后的**数学**（`pᵏ = 4`、轨道传递、稳定子 = P、|G| = |O|·|Stab|）；
 *   ③ **面板文本里的数字 = 图上对象的阶** —— 模板文本的数字由 build() 真算，
 *      这里回过头把两者钉在一起：只要有一边被手改，这条立刻红；
 *   ④ **换群不许换出两套答案**（U15）：同一份骨架在 A₄ / S₄ / S₃ / D₆ / D₄ / C₆ / C₁₂
 *      上逐步走完，n_p 与**手算的理论值**逐个核对。
 */
import { buildLines } from '../../src/gal/build'
import { deriveCanvas } from '../../src/gal/derive'
import {
  proofHighlight,
  proofLines,
  PROOF_TEMPLATES,
  stageInfo,
  SYLOW_I,
  SYLOW_II,
  SYLOW_III,
  templateReady,
  type ProofStep,
} from '../../src/gal/proof'
import { build, eq, ok, suite } from '../harness'

/** 通用骨架：逐步走一遍，每一步都不许出现失败行；返回走到底的对象表。 */
function walkAll(steps: ProofStep[], label: string) {
  let firstBad = ''
  for (let i = 0; i < steps.length; i++) {
    const b = buildLines(proofLines(steps, i))
    const bad = b.lineStates.find((s) => !s.ok)
    if (bad) {
      firstBad = `第 ${i + 1} 步 ${bad.name} → ${bad.error}`
      break
    }
  }
  ok(`${label}：逐步走到底，每一步都没有失败行`, firstBad === '', firstBad)
  return build(proofLines(steps, steps.length - 1))
}

/** 集合型值的成员数（不是集合就是 -1，用来把"值类型变了"也判成失败）。 */
const setSize = (b: ReturnType<typeof build>, id: string) => {
  const o = b.byId(id)
  return o?.value.type === 'set' ? o.value.set.members.length : -1
}

export function run(): void {
  suite('proof · Sylow I（Wielandt）模板')

  eq('模板已注册', PROOF_TEMPLATES.length >= 1, true)
  eq('模板 id', SYLOW_I.id, 'sylow-1-wielandt')

  const steps = SYLOW_I.build()
  eq('13 步', steps.length, 13)
  eq('产出行的是 7 步（其余是陈述与推理）', steps.filter((s) => s.line).length, 7)
  eq('第 1 步就建群', steps[0].line, 'G = A_4')

  // ── ① 逐步走：每加一行都必须求值成功 ──
  let allOk = true
  let firstBad = ''
  for (let i = 0; i < steps.length; i++) {
    const b = buildLines(proofLines(steps, i))
    const bad = b.lineStates.find((s) => !s.ok)
    if (bad) {
      allOk = false
      firstBad = `第 ${i + 1} 步 ${bad.name} → ${bad.error}`
      break
    }
  }
  ok('逐步走到第 13 步，每一步都没有失败行', allOk, firstBad)

  // ── ② 走到底的数学 ──
  const b = build(proofLines(steps, steps.length - 1))
  eq('|P| = 4 = pᵏ', b.orderOf('P'), 4)
  eq('|Stab(P)| = 4', b.orderOf('S'), 4)
  const O = b.byId('O')
  const orbCount = O?.value.type === 'set' ? O.value.set.members.length : -1
  eq('|Orb(P)| = 3 = [G : P]', orbCount, 3)

  const G = b.byId('G')
  ok('|G| = 12', G?.value.type === 'group' && G.value.group.order === 12)
  eq('orbit–stabilizer：|O| · |Stab| = |G|', orbCount * (b.orderOf('S') ?? 0), 12)

  // 陪集作用的图断言：轨道与 Ω 之间那条边是 `=`（传递），不是 `↪`
  const g = deriveCanvas(b.objects)
  ok(
    '画布上 `O = Ω` 那条边是 `=`（传递）',
    g.edges.some((e) => e.label === '=' && (e.from === 'O' || e.to === 'O')),
    g.edges.map((e) => `${e.from}-${e.label}->${e.to}`).join(' '),
  )
  ok(
    '陪集作用的 Ω 是一个独立的集合节点',
    g.nodes.some((n) => n.id.includes('/Ω') && n.shape === 'set'),
    g.nodes.map((n) => n.id).join(','),
  )
  ok(
    '画布上有 `G ↷ Ω` 的作用线',
    g.edges.some((e) => e.kind === 'action' && e.label === '↷'),
  )

  // ── ③ 面板文本的数字 = 图上对象的阶 ──
  const textOf = (line: string) => steps.find((s) => s.line === line)?.text ?? ''
  const pText = textOf('P = 闭包(G, (12)(34), (13)(24))')
  const orbText = textOf('O = 轨道(A, 1)')
  const stabText = textOf('S = 稳定子(A, 1)')
  const ostText = steps.find((s) => s.text.includes('orbit–stabilizer'))?.text ?? ''
  const concludeText = steps[steps.length - 1].text

  ok('P 那步的文本说「4 阶子群」', pText.includes(`${b.orderOf('P')} 阶子群`), pText)
  ok('轨道那步的文本说 |O| = 3', orbText.includes(`|O| = ${orbCount}`), orbText)
  ok('稳定子那步的文本说 |Stab| = 4', stabText.includes(`|Stab| = ${b.orderOf('S')}`), stabText)
  ok(
    'orbit–stabilizer 那步的两个因数与图上一致',
    ostText.includes(`3 × ${b.orderOf('S')} = 12`),
    ostText,
  )
  ok('结论说 |Stab(A)| = 4 = pᵏ', concludeText.includes(`= ${b.orderOf('S')} = pᵏ`), concludeText)

  // ── ④ 计数那两步的数论 ──
  const binomText = textOf('c = Cmod(12, 4, 2)')
  ok('|X| = C(12,4) = 495 且 495 mod 2 = 1', binomText.includes('495') && binomText.includes('mod 2 = 1'), binomText)
  const factorText = textOf('n = 分解(12)')
  ok('阶分解说 12 = 2²·3', factorText.includes('12 = 2²·3'), factorText)

  // ── ⑤ 高亮：走到的每一步都知道该看谁 ──
  const hi = (line: string) => {
    const i = steps.findIndex((s) => s.line === line)
    return proofHighlight(steps, i)
  }
  eq('建群那步高亮 G', hi('G = A_4').join(','), 'G')
  eq('闭包那步高亮 P', hi('P = 闭包(G, (12)(34), (13)(24))').join(','), 'P')
  eq('结论步仍高亮 S', proofHighlight(steps, steps.length - 1).join(','), 'S')
  eq('没有行的步不给高亮', proofHighlight(steps, 2).length, 0)

  /* ══ M2：Sylow II / III ══════════════════════════════════ */

  suite('proof · Sylow II / III 模板（M2）')

  eq('三条模板都注册了', PROOF_TEMPLATES.length, 3)
  eq(
    '模板 id 互不相同',
    new Set(PROOF_TEMPLATES.map((t) => t.id)).size,
    PROOF_TEMPLATES.length,
  )
  eq('Sylow II 默认实例是 A₄ / p=3', `${SYLOW_II.defaults.group}/${SYLOW_II.defaults.p}`, 'A_4/3')
  eq('Sylow III 默认实例是 A₄ / p=3', `${SYLOW_III.defaults.group}/${SYLOW_III.defaults.p}`, 'A_4/3')

  // ── Sylow II：共轭性 ──
  {
    const s2 = SYLOW_II.build()
    eq('Sylow II 共 10 步', s2.length, 10)
    eq('产出行的是 7 步', s2.filter((s) => s.line).length, 7)

    const b = walkAll(s2, 'Sylow II')

    // 期望值全部手算：A₄ 的 Sylow 3-子群有 4 个（n₃ ≡ 1 mod 3 且 n₃ | 4）
    const S = b.byId('S')
    const subs = S?.value.type === 'subgroups' ? S.value.subgroups.length : -1
    eq('n₃(A₄) = 4', subs, 4)
    eq('Ω 有 4 个点', setSize(b, 'Ω'), 4)
    eq('G 的作用有 4 个点', b.byId('A')?.value.type === 'action' ? b.byId('A')!.value.action.n : -1, 4)
    eq('轨道吃下整个 Ω（传递 ⇒ 共轭）', setSize(b, 'O'), 4)
    // N_G(P) 的阶 = |G| / n_p = 12 / 4 = 3，且 Sylow 3-子群正规化子就是它自己
    eq('|N_G(P)| = 3', b.orderOf('N'), 3)
    eq('|P| = 3 = pᵏ', b.orderOf('P'), 3)

    const g = deriveCanvas(b.objects)
    ok(
      '画布上有 G ↷ Ω 的作用线',
      g.edges.some((e) => e.kind === 'action' && e.label === '↷'),
      g.edges.map((e) => `${e.from}-${e.label}->${e.to}`).join(' '),
    )
    ok(
      '画布上 `O = Ω` 那条边是 `=`（传递）',
      g.edges.some((e) => e.label === '=' && (e.from === 'O' || e.to === 'O')),
      g.edges.map((e) => `${e.from}-${e.label}->${e.to}`).join(' '),
    )

    // 文本的数字 = 图上对象的数
    const t = (line: string) => s2.find((s) => s.line === line)?.text ?? ''
    ok('枚举那步说 n₃ = 4', t('S = Syl_p(G, 3)').includes(`n₃ = ${subs}`), t('S = Syl_p(G, 3)'))
    ok('轨道那步说 |O| = |Ω|', t('O = 轨道(A, 1)').includes(`|O| = ${subs} = |Ω|`))
    ok('稳定子那步说 |N_G(P)| = 3', t('N = 稳定子(A, 1)').includes(`|N_G(P)| = ${b.orderOf('N')}`))
    ok('结论明说「两两共轭」', s2[s2.length - 1].text.includes('两两共轭'))
  }

  // ── Sylow III：n_p ≡ 1 (mod p) 且 n_p | m ──
  {
    const s3 = SYLOW_III.build()
    eq('Sylow III 共 14 步', s3.length, 14)
    eq('产出行的是 10 步', s3.filter((s) => s.line).length, 10)

    const b = walkAll(s3, 'Sylow III')

    const S = b.byId('S')
    const n3 = S?.value.type === 'subgroups' ? S.value.subgroups.length : -1
    eq('n₃(A₄) = 4', n3, 4)
    ok('n₃ ≡ 1 (mod 3)', n3 % 3 === 1, `${n3} mod 3 = ${n3 % 3}`)
    ok('n₃ | m = 4', 4 % n3 === 0, `m=4, n₃=${n3}`)

    // P 自己作用：不动点只有一个（P 自身被 P 正规化），其余轨道长是 p 的幂且 > 1
    const fix = setSize(b, 'F')
    eq('P 在 Ω 上的不动点只有 1 个', fix, 1)
    const ob = setSize(b, 'OB')
    eq('其余那个轨道长 3', ob, 3)
    ok('非不动点轨道长被 p 整除', ob > 1 && ob % 3 === 0, `|OB|=${ob}`)
    ok('|Fix| + Σ其余轨道 = n₃', fix + ob === n3, `${fix} + ${ob} vs ${n3}`)
    eq('P 是 3 阶（真 Sylow）', b.orderOf('P'), 3)
    eq('P ↷ Ω 的作用点是 4 个', b.byId('B')?.value.type === 'action' ? b.byId('B')!.value.action.n : -1, 4)
    eq('|N_G(P)| = 3', b.orderOf('N'), 3)

    // 文本里的数字 = 图上对象的数
    const t = (line: string) => s3.find((s) => s.line === line)?.text ?? ''
    ok('不动点那步说 |Fix| = 1', t('F = 不动点(B)').includes(`|Fix| = ${fix}`), t('F = 不动点(B)'))
    // 序号由 build() 按 P 在 Ω 里的位置算出来，所以按前缀找那一步，不写死下标
    const obStep = s3.find((s) => s.line?.startsWith('OB = 轨道(')) ?? s3[0]
    ok('其余轨道那步说长 3', obStep.text.includes(`长 ${ob}`), obStep.text)
    const last = s3[s3.length - 1].text
    ok('结论同时说 n₃ ≡ 1 (mod 3) 与 n₃ | m', last.includes('≡ 1 (mod 3)') && last.includes('| m'), last)
    ok(
      '「换主角」那步用的是子群 P 的作用',
      s3.some((s) => s.line === 'B = 共轭作用在(P, Ω)'),
    )

    /**
     * 一张图上有**两个作用**，各自的轨道 / 不动点必须分得开。
     *
     * 从前标签是写死的 `Orb(1)` / `Fix(A)`：两个轨道节点同名，不动点更是
     * 无论作用叫什么都标成 `Fix(A)`（真截图抓到的）。标签要带**作用的名字**。
     */
    const lbl = (id: string) => b.byId(id)?.label ?? ''
    ok('G 的轨道标签带作用名 A', lbl('O').includes('A'), lbl('O'))
    ok('P 的轨道标签带作用名 B', lbl('OB').includes('B'), lbl('OB'))
    ok('两个轨道节点不再同名', lbl('O') !== lbl('OB'), `${lbl('O')} vs ${lbl('OB')}`)
    ok('不动点的标签带作用名（不是写死的 A）', lbl('F').includes('B'), lbl('F'))
    ok('稳定子标签带作用名', lbl('N').includes('A'), lbl('N'))

    // 不动点必须**挂在 Ω 上**：它是一个"作用的下层产物"（Ω 的子集）。
    // 从前只有轨道走伴生边那一支，不动点落到来源线一支——而它的来源是**作用**
    //（作用不是节点）→ 一条边都生不出来，画布上飘着一个孤零零的圆。
    const g3 = deriveCanvas(b.objects)
    const edgeOf = (x: string) =>
      g3.edges.filter((e) => e.from === x || e.to === x).map((e) => `${e.from}-${e.label}->${e.to}`)
    ok(
      '不动点有到 Ω 的包含边（不是飘着的孤点）',
      g3.edges.some(
        (e) => (e.from === 'F' && e.to === 'Ω') || (e.to === 'F' && e.from === 'Ω'),
      ),
      edgeOf('F').join(' '),
    )
    ok(
      '两个轨道各自有到 Ω 的边',
      edgeOf('O').length > 0 && edgeOf('OB').length > 0,
      `${edgeOf('O').join(' ')} | ${edgeOf('OB').join(' ')}`,
    )
    ok(
      '每个上画布的节点都至少有一条边（没有孤立点）',
      g3.nodes.every((n) => edgeOf(n.id).length > 0),
      g3.nodes
        .filter((n) => edgeOf(n.id).length === 0)
        .map((n) => n.id)
        .join(','),
    )
  }

  // ── 两条模板必须一致：同一个数学量 n₃ ──
  {
    const a = walkAll(SYLOW_II.build(), 'Sylow II（一致性）')
    const c = walkAll(SYLOW_III.build(), 'Sylow III（一致性）')
    const nOf = (b: ReturnType<typeof build>) => {
      const o = b.byId('S')
      return o?.value.type === 'subgroups' ? o.value.subgroups.length : -1
    }
    eq('两条模板算出的 n₃ 相同', nOf(a), nOf(c))
  }

  /* ══ U15：模板 × 群 × p（群与 p 是入参，不再写死 A₄） ══════ */

  suite('proof · 参数体检（U15）')
  {
    const a4 = stageInfo('A_4')
    eq('A₄ 认得出来', a4.ok, true)
    eq('|A₄| = 12', a4.order, 12)
    eq('12 = 2²·3', a4.orderUni, '2²·3')
    eq('素因子是 2 与 3', a4.primes.join(','), '2,3')
    eq('A₄ 的 n₂ = 1', a4.counts[2], 1)
    eq('A₄ 的 n₃ = 4', a4.counts[3], 4)
    ok('展示形态不含反斜杠', !a4.sym.includes('\\'), a4.sym)
    eq('S₄ 的 n₂ = 3', stageInfo('S_4').counts[2], 3)
    eq('前后空白会被吃掉', stageInfo('  S_4 ').order, 24)
  }
  {
    const bad = stageInfo('这不是群记号')
    eq('乱写的记号判不 ok', bad.ok, false)
    ok('给得出理由（不是一句空白错）', (bad.error ?? '').length > 2, bad.error)
    eq('空串也判不 ok', stageInfo('').ok, false)

    // 上限之下 findSylowSubgroups 才跑得动——所以面板必须先拦，而不是点了卡死
    const big = stageInfo('S_6')
    eq('|S₆| = 720 超过上限', big.ok, false)
    ok('理由是"超过上限"而不是"认不出"', (big.error ?? '').includes('144'), big.error)
    eq('被拦的记号也给得出展示名', big.sym, 'S₆')
  }

  suite('proof · 「开始」按钮的判据（U15）')
  {
    ok('Sylow III + n_p = 1 被拦', !!templateReady(SYLOW_III, 'A_4', 2))
    ok('Sylow III + n_p = 4 放行', templateReady(SYLOW_III, 'A_4', 3) === null)
    ok('Sylow II 不拦 n_p = 1（共轭性仍成立）', templateReady(SYLOW_II, 'A_4', 2) === null)
    ok('Sylow I 不拦 n_p = 1', templateReady(SYLOW_I, 'A_4', 2) === null)
    ok('p 不整除 |G| 被拦', !!templateReady(SYLOW_I, 'A_4', 5))
    ok('认不出的群被拦', !!templateReady(SYLOW_I, '这不是群', 2))
    ok('p = 1 被拦', !!templateReady(SYLOW_I, 'A_4', 1))
  }

  suite('proof · 多群多 p：同一份骨架，数字全部真算（U15）')

  /**
   * 手算的理论值（群论表里的数，不是跑出来的）：
   * `n_p` = Sylow p-子群的个数。
   * 循环群里 n_p 恒为 1；p-群里 Sylow p-子群就是 G 自己。
   */
  const N_P: { g: string; p: number; n: number }[] = [
    { g: 'A_4', p: 2, n: 1 }, //  V₄ 唯一 → 正规
    { g: 'A_4', p: 3, n: 4 },
    { g: 'S_4', p: 2, n: 3 },
    { g: 'S_4', p: 3, n: 4 },
    { g: 'S_3', p: 2, n: 3 },
    { g: 'S_3', p: 3, n: 1 },
    { g: 'D_6', p: 2, n: 3 }, //  阶 12 的二面体群
    { g: 'D_6', p: 3, n: 1 },
    { g: 'D_4', p: 2, n: 1 }, //  阶 8 的二面体群自己是 2-群
    { g: 'C_6', p: 2, n: 1 },
    { g: 'C_6', p: 3, n: 1 },
    { g: 'C_12', p: 2, n: 1 },
    { g: 'C_12', p: 3, n: 1 },
  ]

  for (const c of N_P) {
    const info = stageInfo(c.g)
    const k = info.factors.find((f) => f.prime === c.p)?.exponent ?? 0
    eq(`体检 n_${c.p}(${c.g}) = ${c.n}`, info.counts[c.p], c.n)

    // ── Sylow I：只要 p | |G| 就该跑得通 ──
    const s1 = SYLOW_I.build(c.g, c.p)
    const b1 = walkAll(s1, `Sylow I ${c.g}/p=${c.p}`)
    eq(`Sylow I ${c.g}/p=${c.p}：|P| = pᵏ = ${c.p ** k}`, b1.orderOf('P'), c.p ** k)
    eq(`Sylow I ${c.g}/p=${c.p}：|Stab| = pᵏ`, b1.orderOf('S'), c.p ** k)

    // ── Sylow II：任何 p | |G| 都有内容（n_p = 1 时退化成一句废话，但成立） ──
    const s2 = SYLOW_II.build(c.g, c.p)
    const b2 = walkAll(s2, `Sylow II ${c.g}/p=${c.p}`)
    const S = b2.byId('S')
    const n = S?.value.type === 'subgroups' ? S.value.subgroups.length : -1
    eq(`Sylow II ${c.g}/p=${c.p}：n_p = ${c.n}`, n, c.n)
    eq(`Sylow II ${c.g}/p=${c.p}：轨道吃下整个 Ω`, setSize(b2, 'O'), c.n)
    eq(`Sylow II ${c.g}/p=${c.p}：|N_G(P)| = |G|/n_p`, b2.orderOf('N'), info.order / c.n)
    eq(`Sylow II ${c.g}/p=${c.p}：|P| = pᵏ`, b2.orderOf('P'), c.p ** k)

    // 文本数字 = 图上对象的数
    const t2 = (line: string) => s2.find((s) => s.line === line)?.text ?? ''
    ok(
      `Sylow II ${c.g}/p=${c.p}：枚举那步写的个数与图上一致`,
      t2(`S = Syl_p(G, ${c.p})`).includes(`= ${c.n} 个`),
      t2(`S = Syl_p(G, ${c.p})`),
    )
    ok(
      `Sylow II ${c.g}/p=${c.p}：结论那步写的个数与图上一致`,
      s2[s2.length - 1].text.includes(`${c.n} 个 Sylow ${c.p}-子群`),
      s2[s2.length - 1].text,
    )

    // 生成元记号：`P = 闭包(G, …)` 的实参必须真的写进去了
    // （这一环断得最晚——tsc 与"数字都对"都拦不住，只有求值器会拒）
    const pLine = s2.find((s) => s.line?.startsWith('P = 闭包('))?.line ?? ''
    ok(`Sylow II ${c.g}/p=${c.p}：闭包行带上了生成元`, /^P = 闭包\(G, \S/.test(pLine), pLine)

    // 置换群：core 把单循环写成 `234`，定义行里必须是课本记号 `(234)`
    //（否则画布上会飘一个 `⟨234⟩`——看着像个整数）
    if (/^[SA]_/.test(c.g)) {
      ok(
        `Sylow II ${c.g}/p=${c.p}：生成元写成课本循环记号`,
        /^P = 闭包\(G, \([0-9]+\)/.test(pLine),
        pLine,
      )
    }
  }

  suite('proof · Sylow III 换群：n_p ≥ 2 才有内容，n_p = 1 必须明说（U15）')

  for (const c of N_P) {
    const s3 = SYLOW_III.build(c.g, c.p)
    const info = stageInfo(c.g)

    if (c.n === 1) {
      // n_p = 1 时"其余轨道"根本不存在。**宁可只给一步说清理由**，
      // 也不要走出一份看起来完整、其实在讲废话的证明。
      eq(`Sylow III ${c.g}/p=${c.p}：n_p = 1 只给一步`, s3.length, 1)
      ok(
        `Sylow III ${c.g}/p=${c.p}：理由点明了 n_p = 1`,
        s3[0].text.includes('= 1'),
        s3[0].text,
      )
      ok(`Sylow III ${c.g}/p=${c.p}：一步定义行都不产出`, !s3.some((s) => s.line))
      continue
    }

    const b3 = walkAll(s3, `Sylow III ${c.g}/p=${c.p}`)
    const S = b3.byId('S')
    const n = S?.value.type === 'subgroups' ? S.value.subgroups.length : -1
    const k3 = info.factors.find((f) => f.prime === c.p)?.exponent ?? 0
    eq(`Sylow III ${c.g}/p=${c.p}：n_p = ${c.n}`, n, c.n)
    ok(`Sylow III ${c.g}/p=${c.p}：n_p ≡ 1 (mod p)`, n % c.p === 1, `${n} mod ${c.p}`)
    // m = |G| / pᵏ（不是 |G| / n_p —— 这两个数是 Sylow III 里最容易抄反的一对）
    const m3 = info.order / c.p ** k3
    ok(
      `Sylow III ${c.g}/p=${c.p}：n_p | m = ${m3}`,
      m3 % n === 0,
      `m=${m3}, n_p=${n}`,
    )

    // P 自己作用在 Ω 上：不动点只有 P（自己的轨道长度 1），其余轨道长被 p 整除
    const fix = setSize(b3, 'F')
    const ob = setSize(b3, 'OB')
    eq(`Sylow III ${c.g}/p=${c.p}：不动点只有 P 自己`, fix, 1)
    ok(`Sylow III ${c.g}/p=${c.p}：非不动点轨道被 p 整除`, ob > 1 && ob % c.p === 0, `|OB|=${ob}`)
    ok(
      `Sylow III ${c.g}/p=${c.p}：非不动点部分（n_p − 1）被 p 整除`,
      (n - fix) % c.p === 0,
      `${n} - ${fix} = ${n - fix}`,
    )
    eq(`Sylow III ${c.g}/p=${c.p}：|P| = pᵏ = ${c.p ** k3}`, b3.orderOf('P'), c.p ** k3)
    eq(`Sylow III ${c.g}/p=${c.p}：|N_G(P)| = |G|/n_p`, b3.orderOf('N'), info.order / c.n)
    const last = s3[s3.length - 1].text
    ok(
      `Sylow III ${c.g}/p=${c.p}：结论同时说 n_p ≡ 1 与 n_p | m`,
      last.includes(`≡ 1 (mod ${c.p})`) && last.includes('| m'),
      last,
    )
  }
}
