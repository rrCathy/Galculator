/**
 * M1 / M2 / U15：Proof Spec 的 Sylow 三模板与 step-through 执行器。
 *
 * 盯四件事：
 *   ① **每一步都必须可求值** —— "走一步 = 写一行"的底线；
 *   ② 走到底后的**数学**（`pᵏ = 4`、轨道传递、稳定子 = P、|G| = |O|\\cdot|Stab|）；
 *   ③ **面板文本里的数字 = 图上对象的阶** —— 模板文本的数字由 build() 真算，
 *      这里回过头把两者钉在一起：只要有一边被手改，这条立刻红；
 *   ④ **换群不许换出两套答案**（U15）：同一份骨架在 A₄ / S₄ / S₃ / D₆ / D₄ / C₆ / C₁₂
 *      上逐步走完，n_p 与**手算的理论值**逐个核对。
 */
import { buildLines } from '../../src/gal/build'
import { deriveCanvas } from '../../src/gal/derive'
import {
  FIRST_ISO,
  instanceLabel,
  ORBIT_STABILIZER,
  proofHighlight,
  proofLines,
  PROOF_TEMPLATES,
  stageInfo,
  suggestImages,
  suggestPoint,
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
      firstBad = `第 ${i + 1} 步 ${bad.name} -> ${bad.error}`
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

/**
 * 「一个点的轨道有多大」——轨道在 \\Omega = G 自身时是 `elements`（成员是群元素）、
 * 在 \\Omega 是集合时是 `set`（成员是子群），两种都要能读，所以单独一个口子。
 */
const orbSize = (b: ReturnType<typeof build>, id: string) => {
  const o = b.byId(id)
  if (o?.value.type === 'elements') return o.value.elements.length
  if (o?.value.type === 'set') return o.value.set.members.length
  return -1
}

export function run(): void {
  suite('proof \\cdot Sylow I（Wielandt）模板')

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
      firstBad = `第 ${i + 1} 步 ${bad.name} -> ${bad.error}`
      break
    }
  }
  ok('逐步走到第 13 步，每一步都没有失败行', allOk, firstBad)

  // ── ② 走到底的数学 ──
  const b = build(proofLines(steps, steps.length - 1))
  eq('|P| = 4 = p^k', b.orderOf('P'), 4)
  eq('|Stab(P)| = 4', b.orderOf('S'), 4)
  const O = b.byId('O')
  const orbCount = O?.value.type === 'set' ? O.value.set.members.length : -1
  eq('|Orb(P)| = 3 = [G : P]', orbCount, 3)

  const G = b.byId('G')
  ok('|G| = 12', G?.value.type === 'group' && G.value.group.order === 12)
  eq('orbit–stabilizer：|O| \\cdot|Stab| = |G|', orbCount * (b.orderOf('S') ?? 0), 12)

  // 陪集作用的图断言：轨道与 \\Omega 之间那条边是 `=`（传递），不是 `\\hookrightarrow`
  const g = deriveCanvas(b.objects)
  ok(
    '画布上 `O = \\Omega` 那条边是 `=`（传递）',
    g.edges.some((e) => e.label === '=' && (e.from === 'O' || e.to === 'O')),
    g.edges.map((e) => `${e.from}-${e.label}->${e.to}`).join(' '),
  )
  ok(
    '陪集作用的 \\Omega 是一个独立的集合节点',
    g.nodes.some((n) => n.id.includes('/Omega') && n.shape === 'set'),
    g.nodes.map((n) => n.id).join(','),
  )
  ok(
    '画布上有 `G ~> \\Omega` 的作用线',
    g.edges.some((e) => e.kind === 'action' && e.label === '\\curvearrowright'),
  )

  // ── ③ 面板文本的数字 = 图上对象的阶 ──
  const textOf = (line: string) => steps.find((s) => s.line === line)?.text ?? ''
  const pText = textOf('P = 闭包(G, (12)(34), (13)(24))')
  const orbText = textOf('O = 轨道(A, 1)')
  const stabText = textOf('S = 稳定子(A, 1)')
  const ostText = steps.find((s) => s.text.includes('orbit-stabilizer'))?.text ?? ''
  const concludeText = steps[steps.length - 1].text

  ok('P 那步的文本说「4 阶子群」', pText.includes(`${b.orderOf('P')} 阶子群`), pText)
  ok('轨道那步的文本说 |O| = 3', orbText.includes(`|O| = ${orbCount}`), orbText)
  ok('稳定子那步的文本说 |Stab| = 4', stabText.includes(`|Stab| = ${b.orderOf('S')}`), stabText)
  ok(
    'orbit–stabilizer 那步的两个因数与图上一致',
    ostText.includes(`3 \\times ${b.orderOf('S')} = 12`),
    ostText,
  )
  ok('结论说 |Stab(A)| = 4 = p^k', concludeText.includes(`= ${b.orderOf('S')} = p^k`), concludeText)

  // ── ④ 计数那两步的数论 ──
  const binomText = textOf('c = Cmod(12, 4, 2)')
  ok('|X| = C(12,4) = 495 且 495 mod 2 = 1', binomText.includes('495') && binomText.includes('mod 2 = 1'), binomText)
  const factorText = textOf('n = 分解(12)')
  ok('阶分解说 12 = 2^2\\cdot 3', factorText.includes('12 = 2^2\\cdot 3'), factorText)

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

  suite('proof \\cdot Sylow II / III 模板（M2）')

  eq('五条模板都注册了（Sylow 三条 + M3 两条）', PROOF_TEMPLATES.length, 5)
  eq(
    '模板 id 互不相同',
    new Set(PROOF_TEMPLATES.map((t) => t.id)).size,
    PROOF_TEMPLATES.length,
  )
  eq('Sylow II 默认实例是 A_4 / p=3', `${SYLOW_II.defaults.group}/${SYLOW_II.defaults.p}`, 'A_4/3')
  eq('Sylow III 默认实例是 A_4 / p=3', `${SYLOW_III.defaults.group}/${SYLOW_III.defaults.p}`, 'A_4/3')

  // ── Sylow II：共轭性 ──
  {
    const s2 = SYLOW_II.build()
    eq('Sylow II 共 10 步', s2.length, 10)
    eq('产出行的是 7 步', s2.filter((s) => s.line).length, 7)

    const b = walkAll(s2, 'Sylow II')

    // 期望值全部手算：A₄ 的 Sylow 3-子群有 4 个（n₃ \\equiv 1 mod 3 且 n₃ | 4）
    const S = b.byId('S')
    const subs = S?.value.type === 'subgroups' ? S.value.subgroups.length : -1
    eq('n_3(A_4) = 4', subs, 4)
    eq('\\Omega 有 4 个点', setSize(b, 'Omega'), 4)
    eq('G 的作用有 4 个点', b.byId('A')?.value.type === 'action' ? b.byId('A')!.value.action.n : -1, 4)
    eq('轨道吃下整个 \\Omega（传递 \\Rightarrow 共轭）', setSize(b, 'O'), 4)
    // N_G(P) 的阶 = |G| / n_p = 12 / 4 = 3，且 Sylow 3-子群正规化子就是它自己
    eq('|N_G(P)| = 3', b.orderOf('N'), 3)
    eq('|P| = 3 = p^k', b.orderOf('P'), 3)

    const g = deriveCanvas(b.objects)
    ok(
      '画布上有 G ~> \\Omega 的作用线',
      g.edges.some((e) => e.kind === 'action' && e.label === '\\curvearrowright'),
      g.edges.map((e) => `${e.from}-${e.label}->${e.to}`).join(' '),
    )
    ok(
      '画布上 `O = \\Omega` 那条边是 `=`（传递）',
      g.edges.some((e) => e.label === '=' && (e.from === 'O' || e.to === 'O')),
      g.edges.map((e) => `${e.from}-${e.label}->${e.to}`).join(' '),
    )

    // 文本的数字 = 图上对象的数
    const t = (line: string) => s2.find((s) => s.line === line)?.text ?? ''
    ok('枚举那步说 n_3 = 4', t('S = Syl_p(G, 3)').includes(`n_3 = ${subs}`), t('S = Syl_p(G, 3)'))
    ok('轨道那步说 |O| = |\\Omega|', t('O = 轨道(A, 1)').includes(`|O| = ${subs} = |\\Omega|`))
    ok('稳定子那步说 |N_G(P)| = 3', t('N = 稳定子(A, 1)').includes(`|N_G(P)| = ${b.orderOf('N')}`))
    ok('结论明说「两两共轭」', s2[s2.length - 1].text.includes('两两共轭'))
  }

  // ── Sylow III：n_p \\equiv 1 (mod p) 且 n_p | m ──
  {
    const s3 = SYLOW_III.build()
    eq('Sylow III 共 14 步', s3.length, 14)
    eq('产出行的是 10 步', s3.filter((s) => s.line).length, 10)

    const b = walkAll(s3, 'Sylow III')

    const S = b.byId('S')
    const n3 = S?.value.type === 'subgroups' ? S.value.subgroups.length : -1
    eq('n_3(A_4) = 4', n3, 4)
    ok('n_3 \\equiv 1 (mod 3)', n3 % 3 === 1, `${n3} mod 3 = ${n3 % 3}`)
    ok('n_3 | m = 4', 4 % n3 === 0, `m=4, n_3=${n3}`)

    // P 自己作用：不动点只有一个（P 自身被 P 正规化），其余轨道长是 p 的幂且 > 1
    const fix = setSize(b, 'F')
    eq('P 在 \\Omega 上的不动点只有 1 个', fix, 1)
    const ob = setSize(b, 'OB')
    eq('其余那个轨道长 3', ob, 3)
    ok('非不动点轨道长被 p 整除', ob > 1 && ob % 3 === 0, `|OB|=${ob}`)
    ok('|Fix| + \\Sigma其余轨道 = n_3', fix + ob === n3, `${fix} + ${ob} vs ${n3}`)
    eq('P 是 3 阶（真 Sylow）', b.orderOf('P'), 3)
    eq('P ~> \\Omega 的作用点是 4 个', b.byId('B')?.value.type === 'action' ? b.byId('B')!.value.action.n : -1, 4)
    eq('|N_G(P)| = 3', b.orderOf('N'), 3)

    // 文本里的数字 = 图上对象的数
    const t = (line: string) => s3.find((s) => s.line === line)?.text ?? ''
    ok('不动点那步说 |Fix| = 1', t('F = 不动点(B)').includes(`|Fix| = ${fix}`), t('F = 不动点(B)'))
    // 序号由 build() 按 P 在 \\Omega 里的位置算出来，所以按前缀找那一步，不写死下标
    const obStep = s3.find((s) => s.line?.startsWith('OB = 轨道(')) ?? s3[0]
    ok('其余轨道那步说长 3', obStep.text.includes(`长 ${ob}`), obStep.text)
    const last = s3[s3.length - 1].text
    ok('结论同时说 n_3 \\equiv 1 (mod 3) 与 n_3 | m', last.includes('\\equiv 1 (mod 3)') && last.includes('| m'), last)
    ok(
      '「换主角」那步用的是子群 P 的作用',
      s3.some((s) => s.line === 'B = 共轭作用在(P, Omega)'),
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

    // 不动点必须**挂在 \\Omega 上**：它是一个"作用的下层产物"（\\Omega 的子集）。
    // 从前只有轨道走伴生边那一支，不动点落到来源线一支——而它的来源是**作用**
    //（作用不是节点）\\to 一条边都生不出来，画布上飘着一个孤零零的圆。
    const g3 = deriveCanvas(b.objects)
    const edgeOf = (x: string) =>
      g3.edges.filter((e) => e.from === x || e.to === x).map((e) => `${e.from}-${e.label}->${e.to}`)
    ok(
      '不动点有到 \\Omega 的包含边（不是飘着的孤点）',
      g3.edges.some(
        (e) => (e.from === 'F' && e.to === 'Omega') || (e.to === 'F' && e.from === 'Omega'),
      ),
      edgeOf('F').join(' '),
    )
    ok(
      '两个轨道各自有到 \\Omega 的边',
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
    eq('两条模板算出的 n_3 相同', nOf(a), nOf(c))
  }

  /* ══ U15：模板 \\times 群 \\times p（群与 p 是入参，不再写死 A₄） ══════ */

  suite('proof \\cdot 参数体检（U15）')
  {
    const a4 = stageInfo('A_4')
    eq('A_4 认得出来', a4.ok, true)
    eq('|A_4| = 12', a4.order, 12)
    eq('12 = 2^2\\cdot 3', a4.orderUni, '2^2\\cdot 3')
    eq('素因子是 2 与 3', a4.primes.join(','), '2,3')
    eq('A_4 的 n_2 = 1', a4.counts[2], 1)
    eq('A_4 的 n_3 = 4', a4.counts[3], 4)
    ok('展示形态不含反斜杠', !a4.sym.includes('\\'), a4.sym)
    eq('S_4 的 n_2 = 3', stageInfo('S_4').counts[2], 3)
    eq('前后空白会被吃掉', stageInfo('  S_4 ').order, 24)
  }
  {
    const bad = stageInfo('这不是群记号')
    eq('乱写的记号判不 ok', bad.ok, false)
    ok('给得出理由（不是一句空白错）', (bad.error ?? '').length > 2, bad.error)
    eq('空串也判不 ok', stageInfo('').ok, false)

    // 上限之下 findSylowSubgroups 才跑得动——所以面板必须先拦，而不是点了卡死
    const big = stageInfo('S_6')
    eq('|S_6| = 720 超过上限', big.ok, false)
    ok('理由是"超过上限"而不是"认不出"', (big.error ?? '').includes('144'), big.error)
    eq('被拦的记号也给得出展示名', big.sym, 'S_6')
  }

  suite('proof \\cdot 「开始」按钮的判据（U15）')
  {
    ok('Sylow III + n_p = 1 被拦', !!templateReady(SYLOW_III, 'A_4', 2))
    ok('Sylow III + n_p = 4 放行', templateReady(SYLOW_III, 'A_4', 3) === null)
    ok('Sylow II 不拦 n_p = 1（共轭性仍成立）', templateReady(SYLOW_II, 'A_4', 2) === null)
    ok('Sylow I 不拦 n_p = 1', templateReady(SYLOW_I, 'A_4', 2) === null)
    ok('p 不整除 |G| 被拦', !!templateReady(SYLOW_I, 'A_4', 5))
    ok('认不出的群被拦', !!templateReady(SYLOW_I, '这不是群', 2))
    ok('p = 1 被拦', !!templateReady(SYLOW_I, 'A_4', 1))
  }

  suite('proof \\cdot 多群多 p：同一份骨架，数字全部真算（U15）')

  /**
   * 手算的理论值（群论表里的数，不是跑出来的）：
   * `n_p` = Sylow p-子群的个数。
   * 循环群里 n_p 恒为 1；p-群里 Sylow p-子群就是 G 自己。
   */
  const N_P: { g: string; p: number; n: number }[] = [
    { g: 'A_4', p: 2, n: 1 }, //  V_4 唯一 -> 正规
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
    eq(`Sylow I ${c.g}/p=${c.p}：|P| = p^k = ${c.p ** k}`, b1.orderOf('P'), c.p ** k)
    eq(`Sylow I ${c.g}/p=${c.p}：|Stab| = p^k`, b1.orderOf('S'), c.p ** k)

    // ── Sylow II：任何 p | |G| 都有内容（n_p = 1 时退化成一句废话，但成立） ──
    const s2 = SYLOW_II.build(c.g, c.p)
    const b2 = walkAll(s2, `Sylow II ${c.g}/p=${c.p}`)
    const S = b2.byId('S')
    const n = S?.value.type === 'subgroups' ? S.value.subgroups.length : -1
    eq(`Sylow II ${c.g}/p=${c.p}：n_p = ${c.n}`, n, c.n)
    eq(`Sylow II ${c.g}/p=${c.p}：轨道吃下整个 \\Omega`, setSize(b2, 'O'), c.n)
    eq(`Sylow II ${c.g}/p=${c.p}：|N_G(P)| = |G|/n_p`, b2.orderOf('N'), info.order / c.n)
    eq(`Sylow II ${c.g}/p=${c.p}：|P| = p^k`, b2.orderOf('P'), c.p ** k)

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
    //（否则画布上会飘一个 `\\langle 234\\rangle`——看着像个整数）
    if (/^[SA]_/.test(c.g)) {
      ok(
        `Sylow II ${c.g}/p=${c.p}：生成元写成课本循环记号`,
        /^P = 闭包\(G, \([0-9]+\)/.test(pLine),
        pLine,
      )
    }
  }

  suite('proof \\cdot Sylow III 换群：n_p \\ge 2 才有内容，n_p = 1 必须明说（U15）')

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
    ok(`Sylow III ${c.g}/p=${c.p}：n_p \\equiv 1 (mod p)`, n % c.p === 1, `${n} mod ${c.p}`)
    // m = |G| / pᵏ（不是 |G| / n_p —— 这两个数是 Sylow III 里最容易抄反的一对）
    const m3 = info.order / c.p ** k3
    ok(
      `Sylow III ${c.g}/p=${c.p}：n_p | m = ${m3}`,
      m3 % n === 0,
      `m=${m3}, n_p=${n}`,
    )

    // P 自己作用在 \\Omega 上：不动点只有 P（自己的轨道长度 1），其余轨道长被 p 整除
    const fix = setSize(b3, 'F')
    const ob = setSize(b3, 'OB')
    eq(`Sylow III ${c.g}/p=${c.p}：不动点只有 P 自己`, fix, 1)
    ok(`Sylow III ${c.g}/p=${c.p}：非不动点轨道被 p 整除`, ob > 1 && ob % c.p === 0, `|OB|=${ob}`)
    ok(
      `Sylow III ${c.g}/p=${c.p}：非不动点部分（n_p - 1）被 p 整除`,
      (n - fix) % c.p === 0,
      `${n} - ${fix} = ${n - fix}`,
    )
    eq(`Sylow III ${c.g}/p=${c.p}：|P| = p^k = ${c.p ** k3}`, b3.orderOf('P'), c.p ** k3)
    eq(`Sylow III ${c.g}/p=${c.p}：|N_G(P)| = |G|/n_p`, b3.orderOf('N'), info.order / c.n)
    const last = s3[s3.length - 1].text
    ok(
      `Sylow III ${c.g}/p=${c.p}：结论同时说 n_p \\equiv 1 与 n_p | m`,
      last.includes(`\\equiv 1 (mod ${c.p})`) && last.includes('| m'),
      last,
    )
  }

  /* ══ M3：轨道–稳定子 ═════════════════════════════════════ */

  suite('proof \\cdot 轨道–稳定子（M3）')
  {
    const t = ORBIT_STABILIZER
    eq('模板注册了', PROOF_TEMPLATES.some((x) => x.id === 'orbit-stabilizer'), true)
    eq('默认实例是 S_4（非交换群，共轭作用才有内容）', t.defaults.group, 'S_4')
    eq('参数槽只有一个「点」', t.slots.length, 1)
    eq('那个槽是 element', t.slots[0].kind, 'element')
    ok('没有 p 槽（这条定理与素数无关）', !t.slots.some((s) => s.kind === 'prime'))

    // ── 建议值：共轭类最大的那个元素 ──
    eq('S_4 的建议点是 3-轮换 (234)', suggestPoint('S_4'), '(234)')
    eq('S_3 的建议点是对换 (23)', suggestPoint('S_3'), '(23)')
    eq('D_4 的建议点是旋转 r', suggestPoint('D_4'), 'r')
    eq('Q_8 的建议点是 i', suggestPoint('Q_8'), 'i')
    ok('建议点跳过单位元（S_4）', suggestPoint('S_4') !== 'e', suggestPoint('S_4'))
    ok('交换群上也跳过单位元（C_6）', suggestPoint('C_6') !== '0', suggestPoint('C_6'))
    eq('认不出的群给不出建议', suggestPoint('这不是群'), '')

    /**
     * 手算理论值（共轭类表，不是跑出来的）：
     *   |共轭类 x^G| \\times|中心化子 C_G(x)| = |G|。
     * 这里同时钉三件事：图上 O 的成员数、图上 S 的阶、以及两者的乘积。
     */
    const CASES: { g: string; x: string; orbit: number; stab: number; order: number }[] = [
      { g: 'S_4', x: '(234)', orbit: 8, stab: 3, order: 24 },
      { g: 'S_4', x: '(12)', orbit: 6, stab: 4, order: 24 },
      { g: 'S_4', x: '(12)(34)', orbit: 3, stab: 8, order: 24 },
      // A₄ 里 3-轮换分成两个共轭类、各 4 个（在 A₄ 里共轭，不在 S₄ 里）——最容易抄错的一格
      { g: 'A_4', x: '(123)', orbit: 4, stab: 3, order: 12 },
      { g: 'S_3', x: '(12)', orbit: 3, stab: 2, order: 6 },
      { g: 'D_4', x: 's', orbit: 2, stab: 4, order: 8 },
      { g: 'Q_8', x: 'i', orbit: 2, stab: 4, order: 8 },
      // 交换群：每个共轭类都是单点（退化，但定理照样成立）
      { g: 'C_6', x: '1', orbit: 1, stab: 6, order: 6 },
    ]

    for (const c of CASES) {
      const steps = t.build(c.g, undefined, { x: c.x })
      const b = walkAll(steps, `OST ${c.g} \\cdot x = ${c.x}`)

      eq(`OST ${c.g}/${c.x}：|G| = ${c.order}`, b.orderOf('G'), c.order)
      eq(`OST ${c.g}/${c.x}：|O| = ${c.orbit}`, orbSize(b, 'O'), c.orbit)
      eq(`OST ${c.g}/${c.x}：|Stab| = ${c.stab}`, b.orderOf('S'), c.stab)
      ok(
        `OST ${c.g}/${c.x}：|O|\\cdot|Stab| = ${c.orbit}\\times${c.stab} = |G|`,
        c.orbit * c.stab === c.order,
        `${c.orbit * c.stab} vs ${c.order}`,
      )

      // ── 文本里的数字 = 图上对象的数 ──
      const txt = (line: string) => steps.find((s) => s.line === line)?.text ?? ''
      const orbText = txt(`O = 轨道(A, ${c.x})`)
      const stabText = txt(`S = 稳定子(A, ${c.x})`)
      ok(`OST ${c.g}/${c.x}：轨道那步写的 |O| 与图上一致`, orbText.includes(`|O| = ${c.orbit}`), orbText)
      ok(
        `OST ${c.g}/${c.x}：稳定子那步写的 |Stab| 与图上一致`,
        stabText.includes(`|Stab| = ${c.stab}`),
        stabText,
      )
      ok(
        `OST ${c.g}/${c.x}：结论那步的乘积等于图上算的数`,
        steps[steps.length - 1].text.includes(`${c.orbit} \\times ${c.stab} = ${c.orbit * c.stab}`),
        steps[steps.length - 1].text,
      )
      // 稳定子 = 中心化子：两条不同的 core 路径给同一个数（这里只要求文本里说清了）
      ok(
        `OST ${c.g}/${c.x}：文本点明「稳定子 = 中心化子」`,
        stabText.includes('中心化子'),
        stabText,
      )

      // ── 画布：G 上的自环 + O/S 挂在 G 上，没有孤点 ──
      const g = deriveCanvas(b.objects)
      ok(
        `OST ${c.g}/${c.x}：画布上有 G ~> G 的自环`,
        g.edges.some((e) => e.kind === 'action' && e.from === 'G' && e.to === 'G'),
        g.edges.map((e) => `${e.from}-${e.label}->${e.to}`).join(' '),
      )
      ok(
        `OST ${c.g}/${c.x}：每个上画布的节点都有边（没有孤点）`,
        g.nodes.every((n) =>
          g.edges.some((e) => e.from === n.id || e.to === n.id),
        ),
        g.nodes
          .filter((n) => !g.edges.some((e) => e.from === n.id || e.to === n.id))
          .map((n) => n.id)
          .join(','),
      )
      ok(
        `OST ${c.g}/${c.x}：O 与 S 都在 G 这一张图上`,
        g.nodes.some((n) => n.id === 'O') && g.nodes.some((n) => n.id === 'S'),
        g.nodes.map((n) => n.id).join(','),
      )
    }

    // 退化情形必须**当场说出来**，而不是让用户看着 |O| = 1 发呆
    {
      const steps = t.build('C_6', undefined, { x: '1' })
      ok(
        '交换群上，轨道那步明说「退化成 |G| = 1\\cdot|G|」',
        steps.some((s) => s.text.includes('退化')),
        steps.map((s) => s.text).join(' | '),
      )
    }

    // ── 「开始」按钮的判据 ──
    ok('点写对了就放行', templateReady(t, 'S_4', 2, { x: '(12)' }) === null)
    ok('点不在群里被拦', !!templateReady(t, 'S_4', 2, { x: '不存在' }))
    ok('没填点被拦', !!templateReady(t, 'S_4', 2, {}))
    ok('认不出的群被拦', !!templateReady(t, '这不是群', 2, { x: 'e' }))
    // 这条定理没有 p 这一档 —— 即使 p 不整除 |G| 也不该拦
    ok(
      'p 与这条定理无关（p = 5 不整除 12 也放行）',
      templateReady(t, 'A_4', 5, { x: '(123)' }) === null,
    )

    // ── 实例标签 ──
    eq(
      '运行头写的是「S_4，x = (12)」',
      instanceLabel(t, { group: 'S_4' }, { x: '(12)' }),
      'S_4，x = (12)',
    )
  }

  /* ══ M3：第一同构定理 ═══════════════════════════════════ */

  suite('proof \\cdot 第一同构定理（M3）')
  {
    const t = FIRST_ISO
    eq('模板注册了', PROOF_TEMPLATES.some((x) => x.id === 'first-isomorphism'), true)
    eq('默认实例是 C_6', t.defaults.group, 'C_6')
    eq('两个参数槽', t.slots.length, 2)
    eq('槽 1 是靶群', t.slots[0].kind, 'group')
    eq('槽 2 是生成元的像', t.slots[1].kind, 'gens')

    // ── 建议的像：挑「像真落在靶群内部」的那一个（图上才是正方形）──
    eq('C_6 -> C_6 建议 a->2', suggestImages('C_6', 'C_6'), 'a\\to 2')
    // C₁₂：候选 y 里 \\langle y\\rangle 最大又不满的是 6 阶（y = 2 或 10），取元素表里靠前的
    eq('C_12 -> C_12 建议 a->2', suggestImages('C_12', 'C_12'), 'a\\to 2')
    // C₆ \\to C₃ 只有满射（三角形），兜底给满射而不是空手
    eq('C_6 -> C_3 兜底给满射 a->1', suggestImages('C_6', 'C_3'), 'a\\to 1')
    // 非循环源 + 靶群 = 源群 \\to 恒等映射（核平凡，图是三角形）；换靶群就给不出了
    ok('非循环源 + 同靶群：给恒等映射', /\\to/.test(suggestImages('S_4', 'S_4')), suggestImages('S_4', 'S_4'))
    eq('非循环源 + 别的靶群：给不出建议（交给用户手填）', suggestImages('S_4', 'C_2'), '')
    eq('认不出的源给不出建议', suggestImages('不是群', 'C_6'), '')
    // 面板的默认群是 A₄ —— 第一同构卡不能一进来就是红的
    ok(
      '面板默认群 A_4 上第一同构卡可直接起跑（恒等映射兜底）',
      templateReady(t, 'A_4', 2, { target: 'A_4', images: suggestImages('A_4', 'A_4') }) === null,
      String(templateReady(t, 'A_4', 2, { target: 'A_4', images: suggestImages('A_4', 'A_4') })),
    )

    /**
     * 手算理论值：|ker \\varphi| 与 |im \\varphi|，`|G/ker \\varphi|` 由图上那个自动补出来的商群顶点给。
     * 每一条都配一个满射 / 非满射，覆盖三角形与正方形两种图。
     */
    const ISO: {
      g: string
      h: string
      images: string
      ker: number
      im: number
      quotient: number
      surj: boolean
    }[] = [
      { g: 'C_6', h: 'C_6', images: 'a->2', ker: 2, im: 3, quotient: 3, surj: false },
      { g: 'C_12', h: 'C_12', images: 'a->3', ker: 3, im: 4, quotient: 4, surj: false },
      { g: 'C_6', h: 'C_3', images: 'a->1', ker: 2, im: 3, quotient: 3, surj: true },
      { g: 'S_3', h: 'C_2', images: 's12->a, s23->a', ker: 3, im: 2, quotient: 2, surj: true },
    ]

    for (const c of ISO) {
      const label = `${c.g} -> ${c.h}（${c.images}）`
      const steps = t.build(c.g, undefined, { target: c.h, images: c.images })
      const b = walkAll(steps, `FirstIso ${label}`)

      // 商群顶点：**工具自动补出来的**（用户只写了三行）
      const ker = b.byId('\\varphi/ker')
      eq(
        `FirstIso ${label}：自动补出的商群阶 = ${c.quotient}`,
        ker?.value.type === 'group' ? ker.value.group.order : -1,
        c.quotient,
      )

      // 像顶点：非满射时才补（满射时 im \\varphi = H，靶群顶点已在画布上）
      const im = b.byId('\\varphi/im')
      eq(`FirstIso ${label}：像顶点${c.surj ? '不该' : '该'}补出来`, !!im, !c.surj)
      if (im?.value.type === 'group') {
        eq(`FirstIso ${label}：|im \\varphi| = ${c.im}`, im.value.group.order, c.im)
      }

      // ── 文本里的数字 = 真值 ──
      const txt = (needle: string) => steps.find((s) => s.text.includes(needle))?.text ?? ''
      ok(
        `FirstIso ${label}：核那步写的 |ker| 与真算一致`,
        txt('是 G 的正规子群').includes(`|ker \\varphi| = ${c.ker}`),
        txt('是 G 的正规子群'),
      )
      ok(
        `FirstIso ${label}：像那步写的 |im| 与真算一致`,
        txt('它的阶是 |im \\varphi|').includes(`|im \\varphi| = ${c.im}`),
        txt('它的阶是 |im \\varphi|'),
      )
      ok(
        `FirstIso ${label}：商群那步写的阶与图上顶点一致`,
        txt('自动补出').includes(`= ${c.quotient} 个元素`),
        txt('自动补出'),
      )
      ok(
        `FirstIso ${label}：结论用阶核对两个数相等`,
        steps[steps.length - 1].text.includes(`${c.quotient} = |im \\varphi| = ${c.im}`),
        steps[steps.length - 1].text,
      )

      // ── 画布：\\pi / \\cong 自动补出来，非满射还多一条包含边（正方形） ──
      const g = deriveCanvas(b.objects)
      const labels = g.edges.map((e) => e.label).join(',')
      ok(`FirstIso ${label}：画布上有 \\pi 与 \\cong 两条自动补的边`, !!labels.match(/\\pi/) && !!labels.match(/\\cong/), labels)
      eq(
        // 标签是 `\trianglelefteq` 还是 `\hookrightarrow` 由**正规性**定（像在靶群里
        // 正不正规）。这里只钉"非满射才多出那条腰"，不绑死标签 ——
        // 换到非交换的靶群上，同一条边就会画成 `\hookrightarrow`。
        `FirstIso ${label}：非满射才有那条包含边（正方形多一条腰）`,
        g.edges.some((e) => e.label === '\\trianglelefteq' || e.label === '\\hookrightarrow'),
        !c.surj,
      )
      ok(
        `FirstIso ${label}：每个顶点都有边（没有孤点）`,
        g.nodes.every((n) => g.edges.some((e) => e.from === n.id || e.to === n.id)),
        g.nodes
          .filter((n) => !g.edges.some((e) => e.from === n.id || e.to === n.id))
          .map((n) => n.id)
          .join(','),
      )
      // 第一同构的正方形：G/ker 与 im 同高、G 与 H 同高（几何由 e2e 管，这里只要"四个顶点齐"）
      ok(
        `FirstIso ${label}：顶点数 = ${c.surj ? 3 : 4}`,
        g.nodes.length === (c.surj ? 3 : 4),
        g.nodes.map((n) => n.id).join(','),
      )
    }

    // ── 模板**绝不**产出 ker / im 的定义行 ──
    //
    // 一旦写出来，`build.ts` 的 firstIsoObjects 就把"自动补点"交还给用户 ——
    // 那份演示恰恰被自己写没了。这条断言守着它。
    {
      const steps = t.build('C_6', undefined, { target: 'C_6', images: 'a->2' })
      const lines = proofLines(steps, steps.length - 1)
      ok(
        '产出的定义行只有 3 行（两群 + 一条 \\varphi）',
        lines.length === 3,
        lines.join(' | '),
      )
      ok(
        '不产出 ker / im 的定义行',
        !lines.some((l) => /ker|im/.test(l)),
        lines.join(' | '),
      )
      eq('\\varphi 那一行原样可回认', lines[2], '\\varphi = 映射(G, H, a\\to 2)')
    }

    // ── 「开始」按钮的判据 ──
    ok('正常参数放行', templateReady(t, 'C_6', 2, { target: 'C_6', images: 'a->2' }) === null)
    ok('没给像被拦', !!templateReady(t, 'C_6', 2, { target: 'C_6' }))
    ok('像写成不存在的生成元被拦', !!templateReady(t, 'C_6', 2, { target: 'C_6', images: 'b->2' }))
    // 注意别拿 `a\\to x` 当反例：循环群里**单字母一律视作那个生成元**
    //（`resolveElementLoose` 的第 ③ 级），`x` 等价于 `a`
    ok('像不在靶群里被拦', !!templateReady(t, 'C_6', 2, { target: 'C_6', images: 'a->9' }))
    // 核 = G \\iff 像平凡：整张图会退化成一条线，必须明说
    ok('平凡映射（a->0）被拦', !!templateReady(t, 'C_6', 2, { target: 'C_6', images: 'a->0' }))
    ok('靶群认不出被拦', !!templateReady(t, 'C_6', 2, { target: '不是群', images: 'a->2' }))
    // 这条也没有 p 这一档
    ok('p 与这条定理无关', templateReady(t, 'C_6', 5, { target: 'C_6', images: 'a->2' }) === null)

    // ── 实例标签 ──
    eq(
      '运行头写的是「C_6，H = C_6，a->2」',
      instanceLabel(t, { group: 'C_6' }, { target: 'C_6', images: 'a->2' }),
      'C_6，H = C_6，a->2',
    )
  }

  /* ══ M3：参数槽与旧模板的兼容 ═══════════════════════════ */

  suite('proof \\cdot 参数槽（M3）')
  {
    for (const t of PROOF_TEMPLATES) {
      ok(`${t.id}：模板 id 唯一且非空`, !!t.id)
      ok(`${t.id}：每个槽都有 key 与非空 label`, t.slots.every((s) => !!s.key && (s.kind === 'prime' || !!s.label)))
    }
    // Sylow 三条仍是「一个 p 槽」，一字未改 —— 旧的面板口径（p 按钮上带 n_p）继续成立
    for (const t of [SYLOW_I, SYLOW_II, SYLOW_III]) {
      eq(`${t.id}：只有一个 p 槽`, t.slots.length, 1)
      eq(`${t.id}：那个槽是 prime`, t.slots[0].kind, 'prime')
    }
    eq(
      '模板 id 互不相同',
      new Set(PROOF_TEMPLATES.map((t) => t.id)).size,
      PROOF_TEMPLATES.length,
    )
    // 旧的调用口径（只看群与 p）必须继续能跑：不加 extra 也不炸
    ok('Sylow I 不给 extra 照样 build 得出来', SYLOW_I.build('S_4', 3).length > 1)
    ok(
      'Sylow I 的 templateReady 不因缺 extra 而拦',
      templateReady(SYLOW_I, 'S_4', 3) === null,
    )
    // 新模板缺 extra 时**给得出理由**，而不是抛
    eq('轨道–稳定子缺 x：只给一步说明', ORBIT_STABILIZER.build('S_4', 2).length, 1)
    eq('第一同构缺像：只给一步说明', FIRST_ISO.build('C_6', 2).length, 1)
  }
}
