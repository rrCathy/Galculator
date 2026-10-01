/**
 * 第十八批（U38，2026-09-30）：**独立构造的群之间的包含**。
 *
 * 用户实测：「A₄ 能拉包含箭头到 S₄ 上，V₄ 却做不到……C₃ 也拉不了……能不能把 V₄ 修完？」
 *
 * 根因：`relations.containment` 从前**只认"元素 id 逐个对得上"**。`S_4`/`A_4` 的元素 id
 * 是**置换本身**（自证式，跨群可比），所以 A₄ ⊆ S₄ 直接命中；而 `V_4` 的元素是抽象记号
 * `e a b c`、`C_3` 是 `e0 e1 e2`，与 S₄ 的置换对不上 —— 于是被判"不是子群"。
 *
 * 修法：给 `containment` 加**第二关：嵌入** —— id 对不上时，问一句
 * "G 里有没有与 H 同构的子群"（`G` 的全部子群按阶 + 结构符号筛）。
 * 这条判据是数学上**真的**（Cayley/嵌入定理的初等形态），不是特例化。
 *
 * 期望值全部**手算**给出，不从运行结果抄。
 */
import { buildLines } from '../../src/gal/build'
import { containment, embeddingSearchBlocked } from '../../src/gal/relations'
import { pairMissHint, pairOps } from '../../src/gal/interaction'
import { eq, ok, suite } from '../harness'
import { computeQuotientGroup, findAllSubgroups, type Group } from '@groupviz/core'

/** 建两行定义，取回两个群对象（拿不到就返回 null，让断言自己失败）。 */
function two(h: string, g: string): [Group | null, Group | null] {
  const objs = buildLines([`H = ${h}`, `G = ${g}`]).objects
  const hv = objs.find((o) => o.id === 'H')?.value
  const gv = objs.find((o) => o.id === 'G')?.value
  return [hv?.type === 'group' ? hv.group : null, gv?.type === 'group' ? gv.group : null]
}

export function run(): void {
  /* ══ ① 第二关（嵌入）：手算期望 ═══════════════════════════ */

  /**
   * 记号约定：`[H, G, 指数, 正规性]`，正规性 `'T'` / `'F'` / `'?'`（未判定）。
   *
   * 每一条的**理由**都在注释里（手算，不是跑出来的）：
   */
  const EMBED: [string, string, number, 'T' | 'F' | '?'][] = [
    // S₄ 的 4 个 Klein 子群：1 个正规（`{e,(12)(34),(13)(24),(14)(23)}`）、3 个不正规
    // ⇒ "V₄ ≤ S₄"要挑一个嵌入才谈得上正规性 ⇒ **说不清**
    ['V_4', 'S_4', 6, '?'],
    // S₄ 的 4 个 C₃（Sylow 3-子群）全不正规，且**互为共轭**
    ['C_3', 'S_4', 8, 'F'],
    // A₄ 里 4 阶子群只有那一个 Klein，而且正规（指数 3）
    ['V_4', 'A_4', 3, 'T'],
    // C₄ 唯一的 2 阶子群；循环群的子群全正规
    ['C_2', 'C_4', 2, 'T'],
    // D₄ 的 4 阶子群：⟨r⟩ ≅ C₄、⟨r²,s⟩ 与 ⟨r²,rs⟩ ≅ V₄；两个 Klein 都指数 2 ⇒ 都正规
    ['V_4', 'D_4', 2, 'T'],
    // S₄ 的 Sylow 2-子群（3 个，互为共轭）都 ≅ D₄，指数 3 ⇒ 都非正规
    ['D_4', 'S_4', 3, 'F'],
    // S₄ 的 4 个 6 阶子群都 ≅ S₃（点稳定子），指数 4 ⇒ 都非正规
    ['S_3', 'S_4', 4, 'F'],
    // 平凡群处处是子群，且处处正规
    ['C_1', 'S_4', 24, 'T'],
    // F₂₁ = C₇ ⋊ C₃ 里的 C₇ 正规（Sylow 的唯一性）；C₃ 不正规
    ['C_7', 'F_21', 3, 'T'],
    ['C_3', 'F_21', 7, 'F'],
  ]

  suite('batch10 \\cdot U38 第二关（嵌入）：G 里有没有与 H 同构的子群')
  {
    for (const [h, g, idx, norm] of EMBED) {
      const [H, G] = two(h, g)
      if (!H || !G) {
        ok(`${h} ⊆ ${g}：两个群都建得出来`, false, `${h}=${!!H} ${g}=${!!G}`)
        continue
      }
      const c = containment(H, G)
      eq(`${h} ⊆ ${g} 的指数（手算 ${idx}）`, c?.index ?? -1, idx)
      const got = c ? (c.normal === true ? 'T' : c.normal === false ? 'F' : '?') : '-'
      eq(`${h} ⊆ ${g} 的正规性（手算 ${norm}）`, got, norm)
    }
  }

  /* ══ ② 反例：**真没有**的必须还是 `null` ═══════════════════ */

  suite('batch10 \\cdot U38 反例：搜索结果为空 ⇒ 仍然不是子群')
  {
    const NEG: [string, string, string][] = [
      ['Q_8', 'S_4', 'S₄ 的 8 阶子群只有 D₄，没有 Q₈'],
      ['C_4', 'V_4', 'V₄ 里全是 2 阶元'],
      ['C_6', 'A_4', 'A₄ 没有 6 阶元'],
      ['C_6', 'S_4', 'S₄ 也没有 6 阶元（3-轮换与对换不能同时出现）'],
      ['C_4', 'D_4', 'D₄ 有 C₄ 子群 ⟨r⟩ —— 这条**应该成立**，见 ①'], // 反向钉子：别把正例误伤
      ['A_4', 'D_6', 'D₆（12 阶）没有 4 阶非循环子群'],
    ]
    for (const [h, g, why] of NEG) {
      const [H, G] = two(h, g)
      if (!H || !G) continue
      const c = containment(H, G)
      if (h === 'C_4' && g === 'D_4') {
        eq(`${h} ⊆ ${g}（对照组：这条是**真的**）`, c?.index ?? -1, 2)
      } else {
        eq(`${h} ⊆ ${g} 真的是 null（${why}）`, c, null)
      }
    }
  }

  /* ══ ③ 边界：严格性、陪集、超限 ═══════════════════════════ */

  suite('batch10 \\cdot U38 边界：严格包含 / 陪集 / 枚举上限')
  {
    // 两个各自造的同阶群互为同构，但它们是**两个对象** —— 说"同一个群"是假话，
    // 所以第二关**只认严格包含**（|H| < |G|）
    {
      const [H, G] = two('V_4', 'V_4')
      // 元素 id 一模一样 ⇒ 第一关（字面包含）命中，指数 1（关系层读作「同一」）
      eq('两个独立 V₄：第一关命中，指数 1（= 同一个群，U19 的既有语义）', containment(H!, G!)?.index, 1)
    }
    // 同阶但**不同构**：两个方向都判不出来
    for (const [a, b] of [
      ['C_4', 'V_4'],
      ['V_4', 'C_4'],
      ['C_6', 'S_3'],
    ] as const) {
      const [A, B] = two(a, b)
      eq(`${a} 与 ${b}（同阶不同构）没有包含`, containment(A!, B!), null)
    }
    // 带陪集元素（商群）：**不做嵌入判定**（与 U30 同款边界）——
    // `S₄/A₄` 与 `S₄` 的元素根本不在一个"层级"上
    {
      const objs = buildLines(['G = S_4', 'N = A_4', 'Q = G/N']).objects
      const qv = objs.find((o) => o.id === 'Q')?.value
      const gv = objs.find((o) => o.id === 'G')?.value
      const Q = qv?.type === 'group' ? qv.group : null
      const G = gv?.type === 'group' ? gv.group : null
      ok('商群建出来了', !!Q, `type=${qv?.type}`)
      if (Q && G) {
        eq('带陪集元素 ⇒ 不做嵌入判定（containment = null）', containment(Q, G), null)
        eq('而且报"未能判定"（blocked = true）而不是"不是子群"', embeddingSearchBlocked(Q, G), true)
      }
    }
    // 超枚举上限：C₂ ≤ C₂⁷（|G| = 128 > 120）⇒ 不搜、明说"不知道"
    {
      const [H, G] = two('C_2', 'C_2xC_2xC_2xC_2xC_2xC_2xC_2')
      ok('C₂⁷ 建出来了（阶 128）', G?.order === 128, `|G|=${G?.order}`)
      if (H && G) {
        eq('超上限 ⇒ 不搜，containment = null', containment(H, G), null)
        eq('报"未能判定"（blocked = true）', embeddingSearchBlocked(H, G), true)
      }
    }
    // 阶不整除是**证明**了没有（拉格朗日），不算"未判定"
    {
      const [H, G] = two('C_3', 'V_4')
      eq('3 ∤ 4 ⇒ 不是"未判定"（blocked = false）', embeddingSearchBlocked(H!, G!), false)
      eq('而且确实判成 null', containment(H!, G!), null)
    }
  }

  /* ══ ④ `包含` 操作：三种"没有"的措辞各就各位 ═══════════════ */

  suite('batch10 \\cdot U38 声明包含：三种"没有"分得开')
  {
    // ① 阶不整除 → 点名拉格朗日
    {
      const b = buildLines(['X = C_3', 'Y = V_4', 'R = X \\subseteq Y'])
      ok('`包含(C_3, V_4)` 停下', !b.lineStates[2]?.ok, b.lineStates[2]?.error)
      ok('理由点明拉格朗日', (b.lineStates[2]?.error ?? '').includes('拉格朗日'), b.lineStates[2]?.error)
    }
    // ② 搜过确实没有 → 说明"已枚举"
    {
      const b = buildLines(['X = Q_8', 'Y = S_4', 'R = X \\subseteq Y'])
      ok('`包含(Q_8, S_4)` 停下', !b.lineStates[2]?.ok, b.lineStates[2]?.error)
      ok('说明"S₄ 里没有与 Q₈ 同构的子群（已枚举全部子群）"', (b.lineStates[2]?.hint ?? '').includes('已枚举'), b.lineStates[2]?.hint)
    }
    // ③ 群太大 → 说"没能判定"，**不许**说"不是子群"
    {
      const b = buildLines(['X = C_2', 'Y = C_2xC_2xC_2xC_2xC_2xC_2xC_2', 'R = X \\subseteq Y'])
      ok('`包含(C_2, C_2^7)` 停下', !b.lineStates[2]?.ok, b.lineStates[2]?.error)
      ok('措辞是"没能判定"', (b.lineStates[2]?.error ?? '').includes('没能判定'), b.lineStates[2]?.error)
      ok('并说清"没做嵌入枚举"', (b.lineStates[2]?.hint ?? '').includes('没做嵌入枚举'), b.lineStates[2]?.hint)
    }
    // ④ 判据同源：操作报的指数 = `containment` 的指数
    {
      const b = buildLines(['X = V_4', 'Y = S_4', 'R = X \\subseteq Y'])
      const rv = b.objects.find((o) => o.id === 'R')?.value
      const [H, G] = two('V_4', 'S_4')
      ok('`包含(V_4, S_4)` 建出关系', rv?.type === 'relation', b.lineStates[2]?.error)
      eq('操作里的指数 = containment 的指数（判据同源）', rv?.type === 'relation' ? rv.relation.index : -1, containment(H!, G!)?.index ?? -1)
      // 正规性说不清时**不许**假装正规（`⊴` 是有断言力的符号）
      eq('正规性未判定 ⇒ isNormal = false（画 `⊆` 而不是 `⊴`）', rv?.type === 'relation' ? rv.relation.isNormal : null, false)
      ok('而且关系对象标了 normalUnknown', rv?.type === 'relation' ? rv.relation.normalUnknown : null)
    }
  }

  /* ══ ⑤ `pairOps`：拖拽那条路（用户报的就是它）═════════════ */

  suite('batch10 \\cdot U38 拖拽候选：V₄ 终于能拉到 S₄ 上')
  {
    const val = (lines: string[], id: string) =>
      buildLines(lines).objects.find((o) => o.id === id)!.value

    const V4 = val(['H = V_4', 'G = S_4'], 'H')
    const S4 = val(['H = V_4', 'G = S_4'], 'G')
    const C3 = val(['H = C_3', 'G = V_4'], 'H')
    const V4b = val(['H = C_3', 'G = V_4'], 'G')

    const fwd = pairOps(V4, S4).find((c) => c.op.id === 'contains')
    ok('拖 V₄ → S₄：列出「包含」（用户报的那条，U38 修好）', !!fwd, pairOps(V4, S4).map((c) => c.op.id).join(','))
    eq('方向：V₄ 是 H ⇒ 不用反序', fwd?.swapped, false)

    const bwd = pairOps(S4, V4).find((c) => c.op.id === 'contains')
    ok('拖 S₄ → V₄：也列出（方向由判据定，不由拖的方向定）', !!bwd, pairOps(S4, V4).map((c) => c.op.id).join(','))
    eq('而且标 swapped（参数会摆成 (V₄, S₄)）', bwd?.swapped, true)

    ok('拖 C₃ → S₄ 也列出「包含」', pairOps(C3, val(['H = C_3', 'G = S_4'], 'G')).some((c) => c.op.id === 'contains'))
    ok('拖 C₃ → V₄ **不列**（3 ∤ 4，菜单不撒谎）', !pairOps(C3, V4b).some((c) => c.op.id === 'contains'))

    // 真不相干（同阶不同构）
    const C4 = val(['H = C_4', 'G = V_4'], 'H')
    ok('拖 C₄ → V₄ **不列**（同阶不同构）', !pairOps(C4, V4b).some((c) => c.op.id === 'contains'))
  }

  /* ══ ⑥ `pairMissHint`：没列出来时也得说一句为什么 ═══════════ */

  suite('batch10 \\cdot U38 拖不出包含时给一句解释')
  {
    const val = (lines: string[], id: string) =>
      buildLines(lines).objects.find((o) => o.id === id)!.value
    const C3 = val(['H = C_3', 'G = V_4'], 'H')
    const V4 = val(['H = C_3', 'G = V_4'], 'G')

    // ① 阶不整除 —— 拉格朗日
    const h1 = pairMissHint(C3, V4)
    ok('阶不整除时说"不整除 + 拉格朗日"', !!h1 && h1.includes('不整除') && h1.includes('拉格朗日'), String(h1))

    // ② 搜过确实没有
    const q8 = val(['H = Q_8', 'G = S_4'], 'H')
    const s4 = val(['H = Q_8', 'G = S_4'], 'G')
    const h2 = pairMissHint(q8, s4)
    ok('搜过没有时说"没有与 X 同构的子群（已枚举）"', !!h2 && h2.includes('同构的子群'), String(h2))

    // ③ 没算（群太大）
    const c2 = val(['H = C_2', 'G = C_2xC_2xC_2xC_2xC_2xC_2xC_2'], 'H')
    const big = val(['H = C_2', 'G = C_2xC_2xC_2xC_2xC_2xC_2xC_2'], 'G')
    const h3 = pairMissHint(c2, big)
    ok('群太大时说"没做嵌入枚举"', !!h3 && h3.includes('没做嵌入枚举'), String(h3))

    // 非"两个群"不给答案（别硬凑一句话误导）
    const f = val(['G = S_4', 'H = S_3', 'f = 映射(G, H, s12->23, c->13)'], 'f')
    eq('映射 + 群：不给解释（原因太杂）', pairMissHint(f, s4), null)
  }

  /* ══ ⑦ 商群的子群（对应定理）：陪集层不是禁区 ═══════════════ */

  /**
   * **第四同构定理（对应定理）**：`N ⊴ G` 时，`{H : N ≤ H ≤ G}` 与 `{S : S ≤ G/N}`
   * 之间有一条保包含的双射 `H ↦ H/N`（正规性也一一对应）。所以"商群的子群"
   * 是**有定理保证**的判定对象，根本不是"跨层级不敢碰"的东西。
   *
   * 用户报的标本：`C_3 ⊆ S_4/V_4`。手算 —— `|S_4/V_4| = 24/4 = 6`，而 `S_4/V_4 ≅ S_3`；
   * `S_3` 的 3 阶子群**唯一**（Sylow 3-子群必正规）⇒ `C_3 ⊴ S_4/V_4`，指数 `6/3 = 2`。
   *
   * 2026-09-30 修的 bug：`containment` 的嵌入搜索从前有一条过宽的守卫
   * "任一边带陪集元素就跳过" ⇒ 这条被判"没能判定"，还谎称"阶 6 太大"。
   * 收窄成"只挡 **H** 是陪集层对象"后，G 是商群照常搜。
   */
  suite('batch10 \\cdot U38 商群的子群（对应定理）：C₃ ⊴ S₄/V₄')
  {
    const gv = buildLines(['G = S_4']).objects.find((o) => o.id === 'G')?.value
    const G = gv?.type === 'group' ? gv.group : null
    const cv = buildLines(['C = C_3']).objects.find((o) => o.id === 'C')?.value
    const C3 = cv?.type === 'group' ? cv.group : null

    if (!G || !C3) {
      ok('S₄ 与 C₃ 都建得出来', false, `G=${!!G} C3=${!!C3}`)
    } else {
      const klein = findAllSubgroups(G).find((h) => h.order === 4 && h.isNormal)
      ok('S₄ 里有正规的 Klein 子群（`S₄/V₄` 那个分母）', !!klein)
      if (klein) {
        const Q = computeQuotientGroup(G, klein)
        eq('商群的阶（手算 24/4 = 6）', Q.order, 6)

        const c = containment(C3, Q)
        eq('C₃ ⊆ S₄/V₄ 的指数（手算 6/3 = 2）', c?.index ?? -1, 2)
        eq('判得出正规（S₃ 的 3 阶子群唯一 ⇒ 正规）', c?.normal, true)
        eq('不再被"带陪集"守卫挡下（用户报的那条）', embeddingSearchBlocked(C3, Q), false)

        // 反向边界**保留**：H 自己就是陪集层对象时，仍不跨层判定（与 U30 的商运算边界同源）
        eq('H 是陪集层对象（S₄/V₄）⇒ 仍不跨层判定', embeddingSearchBlocked(Q, G), true)
        eq('⇒ containment 仍是 null', containment(Q, G), null)

        // 拖拽那条路（用户报的就是它）：菜单里真的会列出「包含」
        const c3val = buildLines(['C = C_3']).objects.find((o) => o.id === 'C')!.value
        const qval = { type: 'group' as const, group: Q }
        ok('拖 C₃ → S₄/V₄：菜单里列出「包含」', pairOps(c3val, qval).some((c) => c.op.id === 'contains'))
      }
    }
  }
}
