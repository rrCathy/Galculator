/**
 * 第三同构定理的自动成图（缺口 **G4**）。
 *
 * `(G/N)/(K/N) \\cong G/K`（`N \\trianglelefteq K \\trianglelefteq G`）。算术判据用第三同构定理本身：
 * **结果群的阶必须等于 |G/K|** —— 期望值是手算的理论值，不是跑出来的数。
 *
 * 卡住它的根因不是"算不动"，而是**元素 id 的语义**：core 的商群元素 id 是
 * `qcoset-<i>`，`i` 是它**在自己母群里的陪集序**（按陪集内最小元素 id 的字典序）。
 * 于是 `K/N` 的第 i 个陪集与 `G/N` 的第 i 个陪集**通常不是同一个陪集**。
 * 拿 id 直接去母群里查，会**侥幸命中另一个陪集**（静默算错）或判定失败——
 * 所以本 suite 特意挑了一组"编号错位"的案例（C₁₂ 那两条）。
 */
import { deriveCanvas } from '../../src/gal/derive'
import { identifyGroup } from '../../src/gal/insights'
import { containment } from '../../src/gal/relations'
import { build, eq, ok, suite } from '../harness'

/** 容错比较同构符号（`C_{2}` / `C_2` / `C2` 一律等同）。 */
const flat = (s: string | null) => (s ?? '').replace(/[{}\s_\\]/g, '')

/** 商群元素（陪集）的语义键：成员标签排序。 */
function cosetKey(group: { elements: { id: string; cosetMemberLabels?: string[] }[] }, i: number): string {
  const e = group.elements.find((x) => x.id === `qcoset-${i}`)
  return e?.cosetMemberLabels ? [...e.cosetMemberLabels].sort().join(',') : '\\varnothing'
}

/** (G, N, K) \\to 第三同构 `(G/N)/(K/N) \\cong G/K`，`want` = |G/K|（手算）。 */
const CASES: { name: string; lines: string[]; want: number }[] = [
  {
    name: 'C_12, N=\\langle 6\\rangle, K=\\langle 2\\rangle（K/N 的陪集序与 G/N 错位）',
    lines: ['G = C_12', 'N = 闭包(G, 6)', 'K = 闭包(G, 2)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'],
    want: 2,
  },
  {
    name: 'C_12, N=\\langle 6\\rangle, K=\\langle 3\\rangle',
    lines: ['G = C_12', 'N = 闭包(G, 6)', 'K = 闭包(G, 3)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'],
    want: 3,
  },
  {
    name: 'D_4, N=\\langle r^2\\rangle, K=\\langle r\\rangle',
    lines: ['G = D_4', 'N = 闭包(G, r2)', 'K = 闭包(G, r)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'],
    want: 2,
  },
  {
    name: 'D_4, N=\\langle r^2\\rangle, K=\\langle r^2, s\\rangle',
    lines: ['G = D_4', 'N = 闭包(G, r2)', 'K = 闭包(G, r2, s)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'],
    want: 2,
  },
  {
    name: 'D_4, N=\\langle r^2\\rangle, K=\\langle r^2, sr_1\\rangle',
    lines: ['G = D_4', 'N = 闭包(G, r2)', 'K = 闭包(G, r2, sr1)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'],
    want: 2,
  },
  {
    name: 'D_6, N=\\langle r^2\\rangle, K=\\langle r\\rangle',
    lines: ['G = D_6', 'N = 闭包(G, r2)', 'K = 闭包(G, r)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'],
    want: 2,
  },
  {
    name: 'D_6, N=\\langle r^3\\rangle, K=\\langle r\\rangle',
    lines: ['G = D_6', 'N = 闭包(G, r3)', 'K = 闭包(G, r)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'],
    want: 2,
  },
  {
    name: 'S_4, N=V_4, K=A_4',
    lines: [
      'G = S_4',
      'N = 闭包(G, (12)(34), (13)(24))',
      'K = 闭包(G, (123), (12)(34), (13)(24))',
      'GN = 商(G, N)',
      'KN = 商(K, N)',
      'Q = 商(GN, KN)',
    ],
    want: 2,
  },
  {
    name: 'A_4, N=V_4, K=A_4（退化：商为平凡群）',
    lines: [
      'G = A_4',
      'N = 闭包(G, (12)(34), (13)(24))',
      'K = 闭包(G, (123), (12)(34), (13)(24))',
      'GN = 商(G, N)',
      'KN = 商(K, N)',
      'Q = 商(GN, KN)',
    ],
    want: 1,
  },
]

export function run(): void {
  suite('thirdIso \\cdot 第三同构定理 (G/N)/(K/N)（G4）')

  for (const c of CASES) {
    const b = build(c.lines)
    const firstErr = b.lineStates.find((s) => !s.ok)
    ok(`可求值：${c.name}`, !firstErr, firstErr ? `${firstErr.name} -> ${firstErr.error}` : '')
    eq(`|(G/N)/(K/N)| = |G/K|：${c.name}`, b.orderOf('Q'), c.want)
  }

  // ── 根因证据：同名 `qcoset-i` 在两个商群里是**不同陪集** ──
  {
    const b = build(['G = C_12', 'N = 闭包(G, 6)', 'K = 闭包(G, 2)', 'GN = 商(G, N)', 'KN = 商(K, N)'])
    const gn = b.byId('GN')
    const kn = b.byId('KN')
    if (gn?.value.type === 'group' && kn?.value.type === 'group') {
      ok('同上：编号错位（GN.qcoset-1 \\ne KN.qcoset-1）', cosetKey(gn.value.group, 1) !== cosetKey(kn.value.group, 1), `gn=${cosetKey(gn.value.group, 1)} kn=${cosetKey(kn.value.group, 1)}`)
      ok(
        '对齐按语义：KN 的 1 号陪集在 GN 里是 2 号',
        cosetKey(gn.value.group, 2) === cosetKey(kn.value.group, 1),
        `gn[2]=${cosetKey(gn.value.group, 2)} kn[1]=${cosetKey(kn.value.group, 1)}`,
      )
    } else {
      ok('GN / KN 是群值', false)
    }
  }

  // ── 图：第三同构的骨架（`K/N \\hookrightarrow G/N` 是那个梯形缺失的一条腰）──
  {
    const b = build([
      'G = C_12',
      'N = 闭包(G, 6)',
      'K = 闭包(G, 2)',
      'GN = 商(G, N)',
      'KN = 商(K, N)',
      'Q = 商(GN, KN)',
    ])
    const edges = deriveCanvas(b.objects).edges.map((e) => `${e.from} -${e.label ?? '\\varnothing'}-> ${e.to} [${e.kind}:${e.arrow}]`)
    // 标签是**现场判定**的：这组里 K ⊴ G（指数 2）⇒ K/N ⊴ G/N —— 所以是 `\\trianglelefteq`
    // （从前按 id 判包含判不动，一律退成 `\\hookrightarrow`；2026-09-29 语义对齐后判得出来了）
    ok('KN -> GN（K/N 是 G/N 的正规子群，这里指数 2）', edges.includes('KN -\\trianglelefteq-> GN [map:injective]'), edges.join(' | '))
    ok('G ->\\pi-> GN', edges.includes('G -\\pi-> GN [map:surjective]'))
    ok('GN ->\\pi-> (G/N)/(K/N)', edges.includes('GN -\\pi-> Q [map:surjective]'))
    ok('K ->\\pi-> K/N', edges.includes('K -\\pi-> KN [map:surjective]'))
  }

  // ── 反例：**不是**子群就仍然要拦（对齐不等于放宽判定）──
  {
    const b = build(['G = C_12', 'N = 闭包(G, 6)', 'K = 闭包(G, 2)', 'GN = 商(G, N)', 'Q = 商(GN, K)'])
    ok('拿 G 的子群去商 G/N -> 报错', b.err('Q') !== null, `err=${b.err('Q')}`)
    ok('错误信息说明了原因', (b.err('Q') ?? '').includes('不是'), `err=${b.err('Q')}`)
  }

  // ── 用户实测的第三同构（2026-09-29）：分母 N 用**独立构造**的 V₄ ──
  //    "同构第三定理做不了，不能做商群的商群" —— 三个点：
  //    ① `H/N`、`G/N` 各自自动翻译（U30）；② `B/A`（商群的商）要对得上陪集；
  //    ③ `A ≤ B` 这条包含也要判得出来（`K/N ⊴ G/N`）。
  {
    const b = build(['G = S_4', 'H = A_4', 'N = V_4', 'A = H/N', 'B = G/N', 'D = G/H', 'F = B/A'])
    const gv = (id: string) => {
      const v = b.byId(id)?.value
      return v?.type === 'group' ? v.group : null
    }
    ok('`H/N`（N 独立构造）建出来了', !!gv('A'), b.line('A')?.error)
    ok('`G/N` 建出来了', !!gv('B'), b.line('B')?.error)
    const f = gv('F')
    ok('**商群的商** `B/A` 算得出来（用户报的那条）', !!f, b.line('F')?.error)
    if (f) {
      eq('|(G/N)/(H/N)| = 2（手算 6 / 3）', f.order, 2)
      eq('它就是 C_2', flat(identifyGroup(f)), 'C2')
    }
    eq('`G/H` 也是 C_2（第三同构：两边同构）', gv('D') ? flat(identifyGroup(gv('D')!)) : '-', 'C2')

    // `A ≤ B`（K/N 是 G/N 的子群）—— 从前按 id 比会判错，现在按陪集语义对齐
    const c = A_B_containment(b)
    ok('`A ≤ B` 判得出来（K/N ⊴ G/N）', !!c, JSON.stringify(c))
    if (c) {
      eq('指数 [B:A] = 2', c.index, 2)
      eq('而且是正规子群', c.normal, true)
    }

    // ── 第三同构的**结论**要自己画出来（U36）──
    //    定理说的是同构，所以图上该有一条自动的 `≅`（从前得用户自己声明 `R = F ≅ D`）。
    const edges = deriveCanvas(b.objects).edges.map((e) => `${e.from} -${e.label ?? '\\varnothing'}-> ${e.to} [${e.kind}:${e.arrow}]`)
    ok('图上自动长出 `F ≅ D` 那条边', edges.includes('F -\\cong-> D [map:iso]'), edges.join(' | '))
  }

  // ── 边界：**没有 `G/K` 这个顶点就不凭空画** ──
  //    `(G/N)/(K/N)` 算得出来，但画布上没有 `G/K`，就无从连那条 `≅`（不替用户造顶点）。
  {
    const b = build(['G = D_4', 'N = 闭包(G, r2)', 'K = 闭包(G, r)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'])
    const iso = deriveCanvas(b.objects).edges.filter((e) => e.label === '\\cong')
    ok('`G/K` 不在画布上 → 不画那条 `≅`', iso.length === 0, iso.map((e) => `${e.from}->${e.to}`).join(' | '))
  }
}

/** 借 `relations.containment` 判一把（与画布上的伴生边同源）。 */
function A_B_containment(b: ReturnType<typeof build>) {
  const A = b.byId('A')?.value
  const B = b.byId('B')?.value
  if (A?.type !== 'group' || B?.type !== 'group') return null
  return containment(A.group, B.group)
}
