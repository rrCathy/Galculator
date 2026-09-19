/**
 * 第一同构定理的自动成图（缺口 **G8**）。
 *
 * 用户只给一条 φ，工具补出 `G/ker φ` 与 `im φ` 两个顶点和它们之间的边。
 * 判据是**图形**：
 *
 * ```
 *  满射（im φ = H）          非满射（im φ ⊊ H）
 *      G ──φ──▶ H              G ──φ──▶ H
 *      │         ▲              │         ▲
 *      π         ≅              π         ↪
 *      ▼         │              ▼         │
 *   G/ker ──────┘            G/ker ──≅──▶ im φ
 * ```
 */
import { computeLevels, deriveCanvas } from '../../src/gal/derive'
import type { GalObject } from '../../src/gal/types'
import { build, eq, ok, suite } from '../harness'

function edgesOf(objects: GalObject[]): string[] {
  return deriveCanvas(objects).edges
    .map((e) => `${e.from} -${e.label ?? '∅'}-> ${e.to} [${e.kind}${e.arrow ? ':' + e.arrow : ''}]`)
    .sort()
}

const ids = (objects: GalObject[]) => objects.map((o) => o.id).sort()

export function run(): void {
  suite('firstIso · 第一同构定理自动成图（G8）')

  // ── ① 非满射 → **正方形**（本轮新增的半个图）──
  {
    const b = build(['G = C_6', 'H = C_6', 'φ = 映射(G, H, a→2)'])
    eq('非满射时补出 im φ 顶点', ids(b.objects).join(' '), 'G H φ φ/im φ/ker')
    eq('|im φ| = 3', b.orderOf('φ/im'), 3)
    eq('|G/ker φ| = 3', b.orderOf('φ/ker'), 3)
    eq(
      '正方形四条边齐（π 满射 / ≅ 同构 / ↪ 单射 / φ 同态）',
      edgesOf(b.objects).join('\n'),
      [
        'G -π-> φ/ker [map:surjective]',
        'G -φ-> H [map]',
        'φ/im -↪-> H [map:injective]',
        'φ/ker -≅-> φ/im [map:iso]',
      ].join('\n'),
    )
    const lv = computeLevels(b.objects)
    eq('正方形只有两行：G 与 H 一层', lv.get('G'), lv.get('H'))
    eq('商群与像同层', lv.get('φ/ker'), lv.get('φ/im'))
    ok('像在下一行', (lv.get('φ/im') ?? 0) > (lv.get('H') ?? 0))
  }

  // ── ② 满射 → 三角形（`im φ = H`，不补重复顶点）──
  {
    const b = build(['G = C_6', 'H = C_3', 'φ = 映射(G, H, a→1)'])
    eq('满射时不补 im φ', ids(b.objects).join(' '), 'G H φ φ/ker')
    eq(
      '三角形三条边（≅ 直指靶群）',
      edgesOf(b.objects).join('\n'),
      ['G -π-> φ/ker [map:surjective]', 'G -φ-> H [map:surjective]', 'φ/ker -≅-> H [map:iso]'].join('\n'),
    )
  }

  // ── ③ 平凡映射（ker = G）：退化不画 ──
  {
    const b = build(['G = C_6', 'H = C_3', 'φ = 映射(G, H, a→0)'])
    eq('全群核时不补任何顶点', ids(b.objects).join(' '), 'G H φ')
    eq('画布上只剩用户画的那条 φ（满射不成立 → 普通箭头）', edgesOf(b.objects).join(' | '), 'G -φ-> H [map]')
  }

  // ── ④ 用户自己建了 ker → 整条线路交还给他，不再自动补 ──
  {
    const b = build(['G = C_6', 'H = C_6', 'φ = 映射(G, H, a→2)', 'K = ker(φ)'])
    eq('手建 ker 后不再补 φ/ker 与 φ/im', ids(b.objects).join(' '), 'G H K φ')
    eq('手建的 ker 阶正确', b.orderOf('K'), 2)
  }

  // ── ⑤ 单射（嵌入）：ker = ⟨e⟩，真正方形 ──
  {
    const b = build(['G = C_3', 'H = C_6', 'φ = 映射(G, H, a→2)'])
    eq('单射时两个顶点都补', ids(b.objects).join(' '), 'G H φ φ/im φ/ker')
    eq('|G/ker φ| = 3', b.orderOf('φ/ker'), 3)
    eq('|im φ| = 3', b.orderOf('φ/im'), 3)
    ok('≅ 边指向 im φ（不是靶群）', edgesOf(b.objects).some((e) => e.startsWith('φ/ker -≅-> φ/im')))
    ok('im φ ↪ H 是单射边', edgesOf(b.objects).some((e) => e === 'φ/im -↪-> H [map:injective]'))
  }
}
