/**
 * 群的「表示」`<S | R>`（2026-10-19）。
 *
 * 用户原话：「为什么没看见群展示 `<S|R>`」。core 一直有 `presentationOf` /
 * `formatPresentation` / `discoverPresentation`，应用层零调用；这一批把它们接进工作台
 * 的「表示」节（`gal/presentation.ts` + `ui/PresentationTab.tsx`）。
 *
 * 期望值全是**手写的教科书表示**：
 *   · C₄ = ⟨a | a⁴⟩
 *   · V₄ = ⟨a, b | a², b², abab⟩（Klein 四元群）
 *   · D₄ = ⟨r, s | r⁴, s², srsr⟩
 *   · S₄ = Coxeter 表示：3 个生成元，6 条关系（3 条 σ²、2 条 3 次、1 条 2 次）
 *   · A₄ = ⟨x, y | x², y³, (xy)³⟩
 *
 * 两条边界：
 *   · 表示**不是身份**（同一群有无数种表示）——身份判据在 `suites/identity.ts`；
 *   · 反推（Todd-Coxeter）是重活，只在标准表示没有时才用；本套件只用 4 阶群验它能跑通。
 */
import { createGroupFromImport } from '@groupviz/core'
import { build, eq, ok, suite } from '../harness'
import {
  canDiscoverPresentation,
  discoverGroupPresentation,
  presentationBlockedReason,
  standardPresentation,
} from '../../src/gal/presentation'

const V4_TABLE = [
  [1, 2, 3, 4],
  [2, 1, 4, 3],
  [3, 4, 1, 2],
  [4, 3, 2, 1],
]

export function run(): void {
  suite('群的表示 <S|R>（2026-10-19）')

  const b = build(['C4 = C_4', 'V4 = V_4', 'D4 = D_4', 'S4 = S_4', 'A4 = A_4', 'GL23 = GL(2,3)'])
  const g = (n: string) => {
    const v = b.byId(n)?.value
    return v?.type === 'group' ? v.group : null
  }

  const c4 = g('C4')
  if (c4) {
    const p = standardPresentation(c4)
    ok('C_4 有标准表示', p !== null)
    eq('  C_4 的关系条数 = 1', p?.relators.length ?? -1, 1)
    ok('  C_4 的写法是 ⟨a | a^4⟩', (p?.tex ?? '').includes('a^{4}'), p?.tex)
  } else {
    ok('C_4 造不出来（后续断言跳过）', false, b.line('C4')?.error)
  }

  const v4 = g('V4')
  if (v4) {
    const p = standardPresentation(v4)
    eq('V_4 的关系条数 = 3（a², b², abab）', p?.relators.length ?? -1, 3)
    ok('  V_4 的两个生成元都出现了', (p?.generators ?? []).length === 2, JSON.stringify(p?.generators))
  }

  const d4 = g('D4')
  if (d4) {
    const p = standardPresentation(d4)
    eq('D_4 的关系条数 = 3（r⁴, s², srsr）', p?.relators.length ?? -1, 3)
    ok('  D_4 的写法里有 r 与 s', (p?.tex ?? '').includes('r') && (p?.tex ?? '').includes('s'), p?.tex)
  }

  const s4 = g('S4')
  if (s4) {
    const p = standardPresentation(s4)
    eq('S_4 的生成元 = 3 个（σ₁ σ₂ σ₃）', (p?.generators ?? []).length, 3)
    eq('S_4 的关系条数 = 6（Coxeter 表示）', p?.relators.length ?? -1, 6)
    ok('  关系里有 3 次关系 (σ₁σ₂)³', (p?.tex ?? '').includes('(\\sigma_{1}\\sigma_{2})^{3}'), p?.tex)
  }

  const a4 = g('A4')
  if (a4) {
    const p = standardPresentation(a4)
    eq('A_4 的关系条数 = 3（x², y³, (xy)³）', p?.relators.length ?? -1, 3)
  }

  // ── 「给不了」的那一档必须说清，不是静默空白：GL(2,3) 没有现成表示
  const gl = g('GL23')
  if (gl) {
    ok('GL(2,3) 没有现成表示（presentationOf 返回 null）', standardPresentation(gl) === null)
    ok('  GL(2,3) 允许反推（阶 48 ≤ 上限）', canDiscoverPresentation(gl))
    ok('  守卫不挡它（给不出表示 ≠ 被守卫拦下）', presentationBlockedReason(gl) === null)
  } else {
    ok('GL(2,3) 造不出来（后续断言跳过）', false, b.line('GL23')?.error)
  }

  // ── 反推：4 阶群，成本可忽略
  const imported = createGroupFromImport({
    gap_expr: '',
    order: 4,
    table: V4_TABLE,
    gens: [2, 3],
    idents: ['1', '2', '3', '4'],
    structure: '',
  } as any)
  ok(
    'Import 群也能拿到标准表示（presentationOf 按结构推，不看符号）',
    standardPresentation(imported) !== null,
  )
  ok('4 阶 Import 群允许反推', canDiscoverPresentation(imported))
  const d = discoverGroupPresentation(imported)
  ok('反推能给出表示（不空手）', d !== null)
  ok('  反推结果标记为 discovered', d?.source === 'discovered', d?.source)
  ok('  反推结果有生成元与关系', (d?.generators.length ?? 0) > 0 && (d?.relators.length ?? 0) > 0)

  // ── 守卫文案
  const blocked = presentationBlockedReason(imported)
  ok('4 阶群不该被守卫挡下', blocked === null, blocked ?? '')
}
