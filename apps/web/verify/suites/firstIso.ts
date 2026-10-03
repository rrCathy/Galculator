/**
 * 第一同构定理的自动成图（缺口 **G8**）。
 *
 * 用户只给一条 \\varphi，工具补出 `G/ker \\varphi` 与 `im \\varphi` 两个顶点和它们之间的边。
 * 判据是**图形**：
 *
 * ```
 *  满射（im \\varphi = H）          非满射（im \\varphi \\subset neq H）
 *      G ──\\varphi──▶ H              G ──\\varphi──▶ H
 *      │         ▲              │         ▲
 *      \\pi \\cong \\pi \\hookrightarrow
 *      ▼         │              ▼         │
 *   G/ker ──────┘            G/ker ──\\cong──▶ im \\varphi
 * ```
 */
import { computeLevels, deriveCanvas } from '../../src/gal/derive'
import type { GalObject } from '../../src/gal/types'
import { build, eq, ok, suite } from '../harness'

function edgesOf(objects: GalObject[]): string[] {
  return deriveCanvas(objects).edges
    .map((e) => `${e.from} -${e.label ?? '\\varnothing'}-> ${e.to} [${e.kind}${e.arrow ? ':' + e.arrow : ''}]`)
    .sort()
}

const ids = (objects: GalObject[]) => objects.map((o) => o.id).sort()

export function run(): void {
  suite('firstIso \\cdot 第一同构定理自动成图（G8）')

  // ── ① 非满射 \\to **正方形**（本轮新增的半个图）──
  {
    const b = build(['G = C_6', 'H = C_6', '\\varphi = map(G, H, a->2)'])
    eq('非满射时补出 im \\varphi 顶点', ids(b.objects).join(' '), 'G H \\varphi \\varphi/im \\varphi/ker')
    eq('|im \\varphi| = 3', b.orderOf('\\varphi/im'), 3)
    eq('|G/ker \\varphi| = 3', b.orderOf('\\varphi/ker'), 3)
    eq(
      '正方形四条边齐（\\pi 满射 / \\cong 同构 / \\trianglelefteq 单射 / \\varphi 同态）',
      edgesOf(b.objects).join('\n'),
      [
        'G -\\pi-> \\varphi/ker [map:surjective]',
        'G -\\varphi-> H [map]',
        // C_6 是**交换群** \to 它的子群一律正规 \to 包含边画 `\trianglelefteq`
        '\\varphi/im -\\trianglelefteq-> H [map:injective]',
        '\\varphi/ker -\\cong-> \\varphi/im [map:iso]',
      ].join('\n'),
    )
    const lv = computeLevels(b.objects)
    eq('正方形只有两行：G 与 H 一层', lv.get('G'), lv.get('H'))
    eq('商群与像同层', lv.get('\\varphi/ker'), lv.get('\\varphi/im'))
    ok('像在下一行', (lv.get('\\varphi/im') ?? 0) > (lv.get('H') ?? 0))
  }

  // ── ② 满射 \\to 三角形（`im \\varphi = H`，不补重复顶点）──
  {
    const b = build(['G = C_6', 'H = C_3', '\\varphi = map(G, H, a->1)'])
    eq('满射时不补 im \\varphi', ids(b.objects).join(' '), 'G H \\varphi \\varphi/ker')
    eq(
      '三角形三条边（\\cong 直指靶群）',
      edgesOf(b.objects).join('\n'),
      ['G -\\pi-> \\varphi/ker [map:surjective]', 'G -\\varphi-> H [map:surjective]', '\\varphi/ker -\\cong-> H [map:iso]'].join('\n'),
    )
  }

  // ── ③ 平凡映射（ker = G）：退化不画 ──
  {
    const b = build(['G = C_6', 'H = C_3', '\\varphi = map(G, H, a->0)'])
    eq('全群核时不补任何顶点', ids(b.objects).join(' '), 'G H \\varphi')
    eq('画布上只剩用户画的那条 \\varphi（满射不成立 -> 普通箭头）', edgesOf(b.objects).join(' | '), 'G -\\varphi-> H [map]')
  }

  // ── ④ 用户自己建了 ker \\to 整条线路交还给他，不再自动补 ──
  {
    const b = build(['G = C_6', 'H = C_6', '\\varphi = map(G, H, a->2)', 'K = ker(\\varphi)'])
    eq('手建 ker 后不再补 \\varphi/ker 与 \\varphi/im', ids(b.objects).join(' '), 'G H K \\varphi')
    eq('手建的 ker 阶正确', b.orderOf('K'), 2)
  }

  // ── ⑤ 单射（嵌入）：ker = \\langle e\\rangle，真正方形 ──
  {
    const b = build(['G = C_3', 'H = C_6', '\\varphi = map(G, H, a->2)'])
    eq('单射时两个顶点都补', ids(b.objects).join(' '), 'G H \\varphi \\varphi/im \\varphi/ker')
    eq('|G/ker \\varphi| = 3', b.orderOf('\\varphi/ker'), 3)
    eq('|im \\varphi| = 3', b.orderOf('\\varphi/im'), 3)
    ok('\\cong 边指向 im \\varphi（不是靶群）', edgesOf(b.objects).some((e) => e.startsWith('\\varphi/ker -\\cong-> \\varphi/im')))
    ok('im \\varphi -> H 是单射边（H = C_6 交换 \to 画 \\trianglelefteq）', edgesOf(b.objects).some((e) => e === '\\varphi/im -\\trianglelefteq-> H [map:injective]'))
  }
}
