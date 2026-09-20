/**
 * M1：Proof Spec 的 Sylow I 模板与 step-through 执行器。
 *
 * 盯三件事：
 *   ① **每一步都必须可求值** —— "走一步 = 写一行"的底线；
 *   ② 走到底后的**数学**（`pᵏ = 4`、轨道传递、稳定子 = P、|G| = |O|·|Stab|）；
 *   ③ **面板文本里的数字 = 图上对象的阶** —— 模板文本的数字由 build() 真算，
 *      这里回过头把两者钉在一起：只要有一边被手改，这条立刻红。
 */
import { buildLines } from '../../src/gal/build'
import { deriveCanvas } from '../../src/gal/derive'
import { proofHighlight, proofLines, PROOF_TEMPLATES, SYLOW_I } from '../../src/gal/proof'
import { build, eq, ok, suite } from '../harness'

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
}
