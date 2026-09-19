/**
 * 画布图的基础契约：什么上画布、边从哪来、箭头什么形状、层级怎么算。
 *
 * 这些是 DIAGRAM_SPEC §1（六条硬规范）与 §3（对象准入准则）在**语义层**的投影；
 * 几何层（对齐 / 格点 / 摆位）由浏览器走查负责，这里只管"该不该有"。
 */
import { arrowOf, computeLevels, deriveCanvas } from '../../src/gal/derive'
import type { GalObject } from '../../src/gal/types'
import { build, eq, ok, suite } from '../harness'

/** 边 → 可读字符串，便于整组比对。 */
function edgesOf(objects: GalObject[]): string[] {
  return deriveCanvas(objects).edges
    .map((e) => `${e.from} -${e.label ?? '∅'}-> ${e.to} [${e.kind}${e.arrow ? ':' + e.arrow : ''}]`)
    .sort()
}

function nodesOf(objects: GalObject[]): string[] {
  return deriveCanvas(objects).nodes.map((n) => n.id).sort()
}

export function run(): void {
  suite('diagram · 对象准入与边')

  // ── 商群：π 是满射，且第二个参数（子群）带包含箭头 ──
  {
    const b = build(['G = D_4', 'N = 闭包(G, r2)', 'Q = 商(G, N)'])
    eq('商群 π 边与 N ↪ G 包含边', edgesOf(b.objects).join(' | '), 'G -π-> Q [map:surjective] | N -↪-> G [map:injective]')
    eq('|D₄ / ⟨r²⟩| = 8 / 2 = 4', b.orderOf('Q'), 4)
    ok('N 升级为真群对象（不是集合）', b.byId('N')?.value.type === 'group')
  }

  // ── 直积：两条满射投影 ──
  {
    const b = build(['A = C_2', 'B = C_3', 'P = A x B'])
    eq('积投影 π₁ / π₂', edgesOf(b.objects).join(' | '), 'P -π₁-> A [map:surjective] | P -π₂-> B [map:surjective]')
    eq('直积的阶', b.orderOf('P'), 6)
  }

  // ── 箭头形状编码（DIAGRAM_SPEC §1.6）──
  ok('arrowOf：满射 → 双箭头', arrowOf({ isInjective: false, isSurjective: true }) === 'surjective')
  ok('arrowOf：单射 → 尾钩', arrowOf({ isInjective: true, isSurjective: false }) === 'injective')
  ok('arrowOf：双射 → 同构', arrowOf({ isInjective: true, isSurjective: true }) === 'iso')
  ok('arrowOf：判不出 → 不给形状（不猜）', arrowOf({ isInjective: null, isSurjective: null }) === undefined)

  // ── 子群集是"列表"不是"对象"：不上画布 ──
  {
    const b = build(['G = D_4', 'S = 正规子群(G)'])
    ok('子群集值类型是 subgroups', b.byId('S')?.value.type === 'subgroups')
    ok('子群集不上画布', !nodesOf(b.objects).includes('S'), `nodes=${nodesOf(b.objects).join(',')}`)
  }

  // ── 层级：不上画布的对象（映射）不占行 ──
  {
    const b = build(['G = C_6', 'H = C_3', 'φ = 映射(G, H, a→1)'])
    const lv = computeLevels(b.objects)
    eq('映射自身层级为 0（不占行）', lv.get('φ'), 0)
    eq('商群顶点紧随源群一层', lv.get('φ/ker'), 1)
    eq('靶群与源群同行', lv.get('H'), 0)
  }

  // ── 集合运算：结果确是子群时升级为真群对象 ──
  //    ⟨r⟩ ∩ ⟨r², s⟩ = ⟨r²⟩ —— 取这个形状是因为第二同构定理要它（H ∩ N）。
  {
    const b = build(['G = D_4', 'A = 闭包(G, r)', 'B = 闭包(G, r2, s)', 'I = A ∩ B'])
    ok('A ∩ B 升级为群对象', b.byId('I')?.value.type === 'group')
    eq('|⟨r⟩ ∩ ⟨r²,s⟩| = 2（= ⟨r²⟩）', b.orderOf('I'), 2)
    ok('A ∩ B 带包含箭头', edgesOf(b.objects).some((e) => e.startsWith('I -↪-> A')))
  }
  {
    // 反方向：两个子群只交于单位元时，交是平凡群（阶 1）
    const b = build(['G = D_4', 'A = 闭包(G, r)', 'B = 闭包(G, s)', 'I = A ∩ B'])
    eq('|⟨r⟩ ∩ ⟨s⟩| = 1', b.orderOf('I'), 1)
  }

  // ── 子群的子群：Z(Z(G)) ──
  {
    const b = build(['G = D_4', 'Z1 = Z(G)', 'Z2 = Z(Z1)'])
    eq('|Z(D₄)| = 2', b.orderOf('Z1'), 2)
    eq('Z(Z(D₄)) 合法且为群', b.byId('Z2')?.value.type, 'group')
  }

  // ── 闭包的三形态（G1 / G3b 的回归防线）──
  {
    const b = build(['G = C_12', 'A = 闭包(G, r4)', 'B = 闭包(G, r6, r4)', 'C = 闭包(A)'])
    eq('闭包(G, r4)：生成元的幂（C_n 是加法群，课本写乘法 r^k）', b.orderOf('A'), 3)
    eq('闭包(G, r6, r4)：两者生成的子群 = ⟨gcd(6,4)⟩ = ⟨2⟩', b.orderOf('B'), 6)
    eq('闭包(A)：单群参数取它的元素当种子（G3b 防线）', b.orderOf('C'), 3)
    ok('闭包(G, r4) 不报错', b.err('A') === null)
  }
}
