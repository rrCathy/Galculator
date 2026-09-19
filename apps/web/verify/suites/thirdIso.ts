/**
 * 第三同构定理的自动成图（缺口 **G4**）。
 *
 * `(G/N)/(K/N) ≅ G/K`（`N ⊴ K ⊴ G`）。算术判据用第三同构定理本身：
 * **结果群的阶必须等于 |G/K|** —— 期望值是手算的理论值，不是跑出来的数。
 *
 * 卡住它的根因不是"算不动"，而是**元素 id 的语义**：core 的商群元素 id 是
 * `qcoset-<i>`，`i` 是它**在自己母群里的陪集序**（按陪集内最小元素 id 的字典序）。
 * 于是 `K/N` 的第 i 个陪集与 `G/N` 的第 i 个陪集**通常不是同一个陪集**。
 * 拿 id 直接去母群里查，会**侥幸命中另一个陪集**（静默算错）或判定失败——
 * 所以本 suite 特意挑了一组"编号错位"的案例（C₁₂ 那两条）。
 */
import { deriveCanvas } from '../../src/gal/derive'
import { build, eq, ok, suite } from '../harness'

/** 商群元素（陪集）的语义键：成员标签排序。 */
function cosetKey(group: { elements: { id: string; cosetMemberLabels?: string[] }[] }, i: number): string {
  const e = group.elements.find((x) => x.id === `qcoset-${i}`)
  return e?.cosetMemberLabels ? [...e.cosetMemberLabels].sort().join(',') : '∅'
}

/** (G, N, K) → 第三同构 `(G/N)/(K/N) ≅ G/K`，`want` = |G/K|（手算）。 */
const CASES: { name: string; lines: string[]; want: number }[] = [
  {
    name: 'C₁₂, N=⟨6⟩, K=⟨2⟩（K/N 的陪集序与 G/N 错位）',
    lines: ['G = C_12', 'N = 闭包(G, 6)', 'K = 闭包(G, 2)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'],
    want: 2,
  },
  {
    name: 'C₁₂, N=⟨6⟩, K=⟨3⟩',
    lines: ['G = C_12', 'N = 闭包(G, 6)', 'K = 闭包(G, 3)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'],
    want: 3,
  },
  {
    name: 'D₄, N=⟨r²⟩, K=⟨r⟩',
    lines: ['G = D_4', 'N = 闭包(G, r2)', 'K = 闭包(G, r)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'],
    want: 2,
  },
  {
    name: 'D₄, N=⟨r²⟩, K=⟨r², s⟩',
    lines: ['G = D_4', 'N = 闭包(G, r2)', 'K = 闭包(G, r2, s)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'],
    want: 2,
  },
  {
    name: 'D₄, N=⟨r²⟩, K=⟨r², sr₁⟩',
    lines: ['G = D_4', 'N = 闭包(G, r2)', 'K = 闭包(G, r2, sr1)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'],
    want: 2,
  },
  {
    name: 'D₆, N=⟨r²⟩, K=⟨r⟩',
    lines: ['G = D_6', 'N = 闭包(G, r2)', 'K = 闭包(G, r)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'],
    want: 2,
  },
  {
    name: 'D₆, N=⟨r³⟩, K=⟨r⟩',
    lines: ['G = D_6', 'N = 闭包(G, r3)', 'K = 闭包(G, r)', 'GN = 商(G, N)', 'KN = 商(K, N)', 'Q = 商(GN, KN)'],
    want: 2,
  },
  {
    name: 'S₄, N=V₄, K=A₄',
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
    name: 'A₄, N=V₄, K=A₄（退化：商为平凡群）',
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
  suite('thirdIso · 第三同构定理 (G/N)/(K/N)（G4）')

  for (const c of CASES) {
    const b = build(c.lines)
    const firstErr = b.lineStates.find((s) => !s.ok)
    ok(`可求值：${c.name}`, !firstErr, firstErr ? `${firstErr.name} → ${firstErr.error}` : '')
    eq(`|(G/N)/(K/N)| = |G/K|：${c.name}`, b.orderOf('Q'), c.want)
  }

  // ── 根因证据：同名 `qcoset-i` 在两个商群里是**不同陪集** ──
  {
    const b = build(['G = C_12', 'N = 闭包(G, 6)', 'K = 闭包(G, 2)', 'GN = 商(G, N)', 'KN = 商(K, N)'])
    const gn = b.byId('GN')
    const kn = b.byId('KN')
    if (gn?.value.type === 'group' && kn?.value.type === 'group') {
      ok('同上：编号错位（GN.qcoset-1 ≠ KN.qcoset-1）', cosetKey(gn.value.group, 1) !== cosetKey(kn.value.group, 1), `gn=${cosetKey(gn.value.group, 1)} kn=${cosetKey(kn.value.group, 1)}`)
      ok(
        '对齐按语义：KN 的 1 号陪集在 GN 里是 2 号',
        cosetKey(gn.value.group, 2) === cosetKey(kn.value.group, 1),
        `gn[2]=${cosetKey(gn.value.group, 2)} kn[1]=${cosetKey(kn.value.group, 1)}`,
      )
    } else {
      ok('GN / KN 是群值', false)
    }
  }

  // ── 图：第三同构的骨架（`K/N ↪ G/N` 是那个梯形缺失的一条腰）──
  {
    const b = build([
      'G = C_12',
      'N = 闭包(G, 6)',
      'K = 闭包(G, 2)',
      'GN = 商(G, N)',
      'KN = 商(K, N)',
      'Q = 商(GN, KN)',
    ])
    const edges = deriveCanvas(b.objects).edges.map((e) => `${e.from} -${e.label ?? '∅'}-> ${e.to} [${e.kind}:${e.arrow}]`)
    ok('KN ↪ GN（K/N 是 G/N 的子群）', edges.includes('KN -↪-> GN [map:injective]'))
    ok('G →π→ GN', edges.includes('G -π-> GN [map:surjective]'))
    ok('GN →π→ (G/N)/(K/N)', edges.includes('GN -π-> Q [map:surjective]'))
    ok('K →π→ K/N', edges.includes('K -π-> KN [map:surjective]'))
  }

  // ── 反例：**不是**子群就仍然要拦（对齐不等于放宽判定）──
  {
    const b = build(['G = C_12', 'N = 闭包(G, 6)', 'K = 闭包(G, 2)', 'GN = 商(G, N)', 'Q = 商(GN, K)'])
    ok('拿 G 的子群去商 G/N → 报错', b.err('Q') !== null, `err=${b.err('Q')}`)
    ok('错误信息说明了原因', (b.err('Q') ?? '').includes('不是'), `err=${b.err('Q')}`)
  }
}
