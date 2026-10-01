/**
 * 跨群「元素表示」的分诊与翻译（2026-09-29，用户四条实测反馈里的 ①②；
 * 同日第二批：求商 / 陪集作用在「唯一同构」时直接翻译）。
 *
 * 用户原话：
 *   - "A4 和 V4 的积集，你识别出和 C1 同构，这有点荒谬了"
 *   - "我输入 Q = K/M 显示『M 不是 K 的子群，要求含单位元且乘法封闭』"
 *   - "商群功能问题好多……S4里有几个V4？还需要选？"
 *
 * 根因是同一个：`A_4` 与 `V_4` 是**各自独立构造**的群 —— 前者元素 id 是置换
 * （`1,2,3,4`…），后者是抽象记号（`e a b c`），两个 id 空间不通。core 的置换表
 * 里查不到就把乘数**当成单位元**（静默回退），于是 48 次相乘去重后只剩 `{e}`、
 * 再被识别成 `C_1`。商群那条更糟：报的是"不是子群"——**这句话数学上是错的**
 * （A₄ 里确实有一个 Klein 子群，而且正规）。
 *
 * 期望值全部是**手算的理论值**：
 *   - A₄ 恰有一个 Klein 子群（`V₄ ⊴ A₄`，指数 3）⇒ `A₄/V₄ ≅ C₃`
 *   - S₄ 有 4 个 Klein 子群，但**正规的只有一个** ⇒ `S₄/V₄ ≅ S₃`
 *     （另外 3 个不正规、压根当不了分母 —— 所以没有"选一个"这回事）
 *   - S₄ 的 9 个 C₂ 子群（6 对换 + 3 双对换）全不正规 ⇒ `S₄/C₂` 做不出商
 *   - `S₄/A₄ ≅ C₂`（|S₄|/|A₄| = 2）
 *   - `A₄/⟨(123)⟩` 停下，但理由得是"不正规"，不是"元素表示不通"
 */
import {
  buildSubgroupGroup,
  createGroupFromSymbol,
  findAllSubgroups,
  parseGroupNotation,
  subgroupStructureSymbol,
} from '@groupviz/core'

/** `createGroupFromSymbol` 只认**规范化**后的记号，得先过一遍解析。 */
function mk(s: string) {
  const n = parseGroupNotation(s)
  return n.ok ? createGroupFromSymbol(n.symbol) : null
}
import { groupFingerprint } from '../../src/gal/identity'
import { identifyGroup } from '../../src/gal/insights'
import { build, eq, ok, suite } from '../harness'

/** 容错比较同构符号（`S_{3}` / `S_3` / `S3` 一律等同）。 */
const flat = (s: string | null) => (s ?? '').replace(/[{}\s_\\]/g, '')

export function run(): void {
  suite('idspace 跨群元素表示的分诊与翻译')

  // ── ① 积集：A_4 · V_4 —— 从"静默 C_1"到"硬报错"再到**算对**（2026-09-29 第三轮）──
  {
    const b = build(['A = A_4', 'V = V_4', 'P = 积集(A, V)'])
    const p = b.byId('P')
    ok('A_4 积集独立构造的 V_4 现在能算出来', p?.value.type === 'group', b.line('P')?.error)
    if (p?.value.type === 'group') {
      eq('|A_4 · V_4| = 12（V_4 翻译成 A_4 里唯一的 Klein 后相乘，就是 A_4）', p.value.group.order, 12)
      const a = b.byId('A')!.value
      const ids = (g: { elements: { id: string }[] }) => [...g.elements.map((e) => e.id)].sort().join(',')
      ok(
        '结果的元素与 A_4 完全相同（就是 A_4 —— 子群与它的积还是它）',
        a.type === 'group' && ids(a.group) === ids(p.value.group),
      )
      ok('不再是那个荒谬的 C_1', identifyGroup(p.value.group) !== 'C_{1}', identifyGroup(p.value.group))
    }
    ok('状态行写清"翻译过"（不是猜的）', (p?.sub ?? '').includes('自动取'), p?.sub)
    ok(
      '并给出可核对的配方 闭包(A, (12)(34), (13)(24))',
      (p?.sub ?? '').includes('闭包(A, (12)(34), (13)(24))'),
      p?.sub,
    )
  }

  // ── ② 商：A_4 / V_4 —— 唯一同构的正规子群，直接拿它当分母 ──
  {
    const b = build(['A = A_4', 'V = V_4', 'Q = 商(A, V)'])
    const q = b.byId('Q')
    ok('A_4 商独立构造的 V_4 直接算出来（不再要求照抄）', q?.value.type === 'group', b.line('Q')?.error)
    if (q?.value.type === 'group') {
      eq('|A_4 / V_4| = 3（手算 12 / 4）', q.value.group.order, 3)
      eq('A_4 / V_4 识别为 C_3', flat(identifyGroup(q.value.group)), 'C3')
    }
    ok('状态行明说分母是自动翻译来的', (q?.sub ?? '').includes('自动取'), q?.sub)
    ok(
      '翻译给出可核对的配方 闭包(A, (12)(34), (13)(24))',
      (q?.sub ?? '').includes('闭包(A, (12)(34), (13)(24))'),
      q?.sub,
    )
  }

  // ── ③ 手工路径仍在：从 A_4 里造出来的那个 V_4 ──
  {
    const b = build(['A = A_4', 'K = 闭包(A, (12)(34), (13)(24))', 'Q = 商(A, K)'])
    const q = b.byId('Q')
    ok('从 A_4 里造出来的 V_4 能商', q?.value.type === 'group', b.line('Q')?.error)
    if (q?.value.type === 'group') {
      eq('|A_4 / V_4| = 3（手算 12 / 4）', q.value.group.order, 3)
      eq('A_4 / V_4 识别为 C_3', identifyGroup(q.value.group), 'C_{3}')
    }
  }

  // ── ④ 不误伤：同一 id 空间里的子群照常 ──
  {
    const b = build(['G = S_4', 'A = A_4', 'Q = 商(G, A)'])
    const q = b.byId('Q')
    ok('S_4 / A_4 照常成立', q?.value.type === 'group', b.line('Q')?.error)
    if (q?.value.type === 'group') eq('|S_4 / A_4| = 2（手算 24 / 12）', q.value.group.order, 2)
  }

  // ── ⑤ 不误伤：真的不是正规子群时，说的还是"不正规" ──
  {
    const b = build(['A = A_4', 'C = 闭包(A, (123))', 'Q = 商(A, C)'])
    const s = b.line('Q')
    ok('非正规子群仍然停下', s?.ok === false, `ok=${s?.ok}`)
    ok('理由仍是"不正规"，没被分诊抢走', (s?.error ?? '').includes('正规'), s?.error)
  }

  // ── ⑥ 群身份指纹：同符号同阶、元素不同的两个群必须分得开 ──
  // 构造"符号撒谎"的一对：手工给两个群同一个记号 `Kp`，阶都是 4，
  // 但一个 ≅ C₄、一个 ≅ C₂×C₂。旧缓存键 `Kp#4` 只认符号与阶，第二个会命中
  // 第一个的结果 —— 所以这一条在改之前必 FAIL。
  {
    const c8 = mk('C_8')
    const s4 = mk('S_4')
    ok('两个母群都建出来了', !!c8 && !!s4)
    if (!c8 || !s4) return
    // C_8 的 ⟨x²⟩ = {e, x², x⁴, x⁶} ≅ C₄
    const sub1 = buildSubgroupGroup(
      c8,
      [c8.elements[0], c8.elements[2], c8.elements[4], c8.elements[6]],
      'Kp',
    )
    // S_4 里的某个 Klein 子群 ≅ C₂×C₂
    const klein = findAllSubgroups(s4).find(
      (h) =>
        h.order === 4 &&
        subgroupStructureSymbol(
          s4,
          h.elements.map((e) => e.id),
        ) === 'C_{2}\\times C_{2}',
    )
    ok('在 S_4 里找到了 Klein 子群', !!klein)
    if (klein) {
      const sub2 = buildSubgroupGroup(s4, klein.elements, 'Kp')
      eq('两边符号相同、阶相同（故意撞键）', `${sub1.symbol}#${sub1.order}`, `${sub2.symbol}#${sub2.order}`)
      ok('指纹不同（含元素 id）', groupFingerprint(sub1) !== groupFingerprint(sub2))
      eq('识别不串：第一个 ≅ C_4', identifyGroup(sub1), 'C_{4}')
      eq('识别不串：第二个 ≅ C_2×C_2', identifyGroup(sub2), 'C_{2}\\times C_{2}')
    }
  }

  // ── ⑦ 用户实测那句「S_4 里有几个 V_4？还需要选？」──
  // S₄ 的 4 个 Klein 子群里只有 1 个正规 —— 求商只认正规的，所以**没有第二个选项**，
  // 系统自己取那一个（另外 3 个即使让用户点，也不该被当分母）。
  {
    const b = build(['A = S_4', 'D = V_4', 'Q = 商(A, D)'])
    const q = b.byId('Q')
    ok('S_4 商独立构造的 V_4 直接算出来（不弹"请指明一个"）', q?.value.type === 'group', b.line('Q')?.error)
    if (q?.value.type === 'group') {
      eq('|S_4 / V_4| = 6（手算 24 / 4）', q.value.group.order, 6)
      eq('S_4 / V_4 识别为 S_3', flat(identifyGroup(q.value.group)), 'S3')
    }
    ok(
      '取的是那唯一的正规 Klein 子群 闭包(A, (12)(34), (13)(24))',
      (q?.note ?? '').includes('闭包(A, (12)(34), (13)(24))'),
      q?.note,
    )
  }

  // ── ⑧ 没有正规的候选时照实说（S_4 的 9 个 C_2 全不正规）──
  {
    const b = build(['A = S_4', 'C = C_2', 'Q = 商(A, C)'])
    const s = b.line('Q')
    ok('停下（不正规的子群不能做商）', s?.ok === false, `ok=${s?.ok}`)
    ok('说清"有同构的，但没有一个是正规子群"', (s?.hint ?? '').includes('没有一个是正规子群'), s?.hint)
    ok('个数也对（6 对换 + 3 双对换 = 9）', (s?.hint ?? '').includes('9 个'), s?.hint)
  }

  // ── ⑨ 真有多个正规候选时：列配方，且配方必须**真能跑**（候选不撒谎）──
  {
    const b = build(['G = C_2 x C_2', 'H = C_2', 'Q = 商(G, H)'])
    const s = b.line('Q')
    ok('停下（3 个候选都是正规的，替谁挑都不对）', s?.ok === false, `ok=${s?.ok}`)
    // 配方用**惰性 + 前瞻**切：生成元标签自带括号/逗号（`(0,1)`），
    // 不能拿"第一个右括号"当结尾（第一版正则就栽在这里）
    const recipes = (s?.hint ?? '').match(/闭包\(G,[^、]*?\)(?=、|$)/g) ?? []
    eq('照出来 3 个候选配方', recipes.length, 3)
    if (recipes.length === 3) {
      const b2 = build(['G = C_2 x C_2', `K = ${recipes[0]}`, 'Q = 商(G, K)'])
      const q = b2.byId('Q')
      ok(
        '照抄第一个配方：真建出子群、真能商',
        q?.value.type === 'group',
        b2.line('K')?.error ?? b2.line('Q')?.error,
      )
      if (q?.value.type === 'group') eq('|G / K| = 2（手算 4 / 2）', q.value.group.order, 2)
    }
  }

  // ── ⑩ 陪集作用走同一条翻译（它**不要求正规性**，唯一即可）──
  {
    const b = build(['A = A_4', 'V = V_4', 'X = 陪集作用(A, V)'])
    const x = b.byId('X')
    ok('陪集作用(A_4, 独立构造的 V_4) 直接算出来', x?.value.type === 'action', b.line('X')?.error)
    if (x?.value.type === 'action') eq('|Ω| = 3（[A_4 : V_4] = 12 / 4）', x.value.action.n, 3)
    ok('同样写清分母是自动翻译来的', (x?.sub ?? '').includes('自动取'), x?.sub)
  }

  // ── ⑪ 集合运算（∩ ∪ ∖ ·）的对齐：独立构造的 V_4 不再静默给空集 / 怪结果 ──
  // 用户实测（2026-09-29 第三轮）：「A=S4, B=A4, D=V4，创建不了 B 和 D 的积集，
  // 我连子群的积集都创建不了，怎么做同构第二定理？」——这一节把四种运算全钉住。
  {
    // ① 交：A_4 ∩ 独立 V_4 —— 从前**静默给空集**，现在是 A_4 里那个 Klein
    const b = build(['A = A_4', 'D = V_4', 'I = 交(A, D)'])
    const iv = b.byId('I')?.value
    ok('A_4 ∩ 独立 V_4 是群对象（不再是空集）', iv?.type === 'group', b.line('I')?.error)
    if (iv?.type === 'group') {
      eq('|A_4 ∩ V_4| = 4（手算：A_4 里唯一的 4 阶子群）', iv.group.order, 4)
      eq('就是 Klein 四元群', identifyGroup(iv.group), 'C_{2}\\times C_{2}')
    }
    ok('写明翻译 + 配方', (b.byId('I')?.sub ?? '').includes('自动取') && (b.byId('I')?.sub ?? '').includes('闭包(A, (12)(34), (13)(24))'), b.byId('I')?.sub)

    // ② 并 / 差：对齐后再算（从前按 id 各算各的：并给 16、差给 12 —— 都是"看着像真的"）
    const b2 = build(['A = A_4', 'D = V_4', 'U = 并(A, D)', 'X = 差(A, D)'])
    eq('|A_4 ∪ V_4| = 12（V_4 就是 A_4 里的子集，并回去还是 A_4）', b2.byId('U')?.value.type === 'elements' ? b2.byId('U')!.value.elements.length : -1, 12)
    eq('|A_4 \\ V_4| = 8（12 - 4）', b2.byId('X')?.value.type === 'elements' ? b2.byId('X')!.value.elements.length : -1, 8)

    // ③ 反序也要通：积集(V_4, A_4) —— V_4 那个家装不下 A_4，换 A_4 当家
    const b3 = build(['A = A_4', 'D = V_4', 'P = 积集(D, A)'])
    eq('|V_4 · A_4| = 12（反序同样算得出来）', b3.byId('P')?.value.type === 'group' ? b3.byId('P')!.value.group.order : -1, 12)

    // ④ 母群指针：同母群的两个子群相乘 —— 从前误报"不是同一个群"（还给了假提示）
    const b4 = build(['G = S_4', 'K1 = 闭包(G, (12))', 'K2 = 闭包(G, (34))', 'P = 积集(K1, K2)'])
    const p4 = b4.byId('P')?.value
    ok('两个子群的积集现在能算（根 = S_4）', p4?.type === 'group', b4.line('P')?.error)
    if (p4?.type === 'group') {
      eq('|K1 · K2| = 4（{e,(12),(34),(12)(34)}）', p4.group.order, 4)
      eq('它是那个**非正规**的 Klein 四元群', identifyGroup(p4.group), 'C_{2}\\times C_{2}')
    }

    // ⑤ 多个候选、但**结果全同** → 直接算（"结果与选哪个无关"= 没有选择这回事，U34）
    const b5 = build(['G = S_4', 'D = V_4', 'P = 积集(G, D)'])
    const p5 = b5.byId('P')?.value
    ok(
      'S_4 · 独立 V_4 直接算出来（4 个候选结果相同）',
      p5?.type === 'group' && p5.group.order === 24,
      b5.line('P')?.error,
    )
    ok(
      '披露写明"4 个候选，结果相同"',
      (b5.byId('P')?.sub ?? '').includes('4 个候选，结果相同'),
      b5.byId('P')?.sub,
    )

    // ⑤2 真歧义（**结果不一样**）才停：S₃ 与独立 V₄ 的交随 V₄ 选哪个而变（{e} 或 2 阶）
    const b5b = build(['G = S_4', 'H = S_3', 'D = V_4', 'I = 交(H, D)'])
    const s5b = b5b.line('I')
    ok('`交(S_3, 独立 V_4)` 停下（4 个候选结果不同）', s5b?.ok === false, `ok=${s5b?.ok}`)
    ok('说清"结果不一样，得指明一个"', (s5b?.error ?? '').includes('结果不一样'), s5b?.error)
    ok('并列候选配方', (s5b?.hint ?? '').includes('指明一个即可'), s5b?.hint)
    ok('不再静默算错', b5b.byId('I') === undefined)

    // ⑥ 提示里给的配方**照抄能跑**（S₄ 那条 `闭包(S_4, 34, 12)` —— 内联记号也是合法写法）
    {
      const b6 = build([
        'G = S_4',
        'H = 闭包(G, (123), (12))',
        'N = V_4',
        'HN = 积集(H, N)',
        'K = 闭包(S_4, 34, 12)',
        'HK = 积集(H, K)',
        'K0 = 闭包(G, (12)(34), (13)(24))',
        'HN0 = 积集(H, K0)',
      ])
      ok('`积集(H, 独立 N)` 停下（歧义）', b6.line('HN')?.ok === false, b6.line('HN')?.error)
      ok('照抄提示的 `闭包(S_4, 34, 12)` 能建出来', b6.byId('K')?.value.type === 'group', b6.line('K')?.error)
      const hk = b6.byId('HK')?.value
      ok(
        '照抄之后：H·K 算得出来（12 个元素**但不是子群** —— HK 未必封闭，这才是正解）',
        hk?.type === 'elements' && hk.elements.length === 12,
        b6.line('HK')?.error ?? (hk?.type === 'elements' ? `${hk.elements.length} 个元素` : hk?.type),
      )
      // 第二同构的舞台：N ⊴ G 时 HN 才是子群（这里 N 取**正规**的那个 Klein）
      const hn0 = b6.byId('HN0')?.value
      ok('H·（正规 Klein）= 群对象（N ⊴ G ⇒ HN ≤ G）', hn0?.type === 'group', b6.line('HN0')?.error)
      if (hn0?.type === 'group') eq('|HN| = 24 = |G|（H∩N = {e}）', hn0.group.order, 24)
    }

    // ⑦ 声明包含 / 子群像：**两条路在 U38 之后分了家**（2026-09-30）
    //    · `包含` 走**第二关（嵌入）**：独立构造的 V₄ 真的判得出 `V₄ <= A₄`
    //      （A₄ 唯一的 4 阶子群就是那个正规的 Klein）；
    //    · `像(f, H)` **仍然**只认"元素取自定义域"—— 因为 `f(H)` 是个**具体的子群**，
    //      而 H 在定义域里有多个嵌入时"取哪个的像"说不准（`V₄ ⊆ S₄` 有 4 个嵌入），
    //      更何况不同的嵌入可以给出**不同构的像**。所以这条路照旧停下，
    //      且措辞得说清"表示不通"、把可照抄的出路给上（U29 的老账）。
    {
      const b7 = build(['A = A_4', 'D = V_4', 'R = 包含(D, A)'])
      const r7 = b7.byId('R')?.value
      ok('`包含(独立 V_4, A_4)` **建出来了**（U38 第二关：嵌入）', r7?.type === 'relation', b7.line('R')?.error)
      eq('指数 = 12 / 4 = 3', r7?.type === 'relation' ? r7.relation.index : -1, 3)
      eq('A₄ 唯一的 4 阶子群是正规的 Klein ⇒ 判正规', r7?.type === 'relation' ? r7.relation.isNormal : null, true)

      const b8 = build(['G = S_4', 'H = S_3', 'f = 映射(G, H, s12->23, c->13)', 'D = V_4', 'X = 像(f, D)'])
      const s8 = b8.line('X')
      ok('`像(f, 独立 V_4)` 停下（像得取一个**具体的**子群，独立 V₄ 说不准取哪个）', s8?.ok === false, `ok=${s8?.ok}`)
      ok('说清"元素不在定义域里"', (s8?.error ?? '').includes('不在'), s8?.error)
      ok('S₄ 语境：提示列出 4 个候选与配方', (s8?.hint ?? '').includes('4 个') && (s8?.hint ?? '').includes('闭包'), s8?.hint)
    }

    // ⑧ **记号串号**（2026-09-29 第三轮用户实测：F₂₁ 上测第二同构，`C_3 ∩ C_7` 得到"元素集"）——
    //    记号群的元素 id 是**群内编号**（`e0 e1 …`），跨群会撞号：`C_3` 的 `e0 e1 e2` 在 `C_7` 里"也有"。
    //    从前只按 id 判，给出 **3 个元素的"交集"**（既不是子群、也不是真交集）。
    {
      const b9 = build(['K = C_3', 'M = C_7', 'I = 交(K, M)'])
      const s9 = b9.line('I')
      ok('`交(C_3, C_7)` 停下（不再静默给 3 个元素的假交集）', s9?.ok === false, `ok=${s9?.ok} :: ${b9.byId('I')?.value.type}`)
      ok('并说明是"没有共同的母群"', (s9?.error ?? '').includes('共同的母群'), s9?.error)
      ok('给出路：先放进共同的大群', (s9?.hint ?? '').includes('闭包'), s9?.hint)

      // 正确的做法：在母群里取子群再交（F₂₁ 的 C₃ ∩ C₇ = {e}，且**是子群** C₁）
      const b10 = build([
        'F = F_21',
        'K = 闭包(F, a)',
        'M = 闭包(F, b)',
        'I = 交(K, M)',
        'Q = 商(K, I)',
      ])
      const i10 = b10.byId('I')?.value
      ok('F₂₁ 里取子群再交：是**群对象**（C₁），不是元素集', i10?.type === 'group', b10.line('I')?.error)
      if (i10?.type === 'group') {
        eq('|C_3 ∩ C_7| = 1（{e}）', i10.group.order, 1)
        eq('识别为平凡群 C_1', identifyGroup(i10.group), 'C_{1}')
      }
      ok('交集能直接接着做商（第二同构那一步）', b10.byId('Q')?.value.type === 'group', b10.line('Q')?.error)

      // 置换群是例外：id 是**自证式**的（`1,2,3,4` 就是那个置换），跨群对得上就是同一个元素
      const b11 = build(['A = A_4', 'G = S_4', 'I2 = 交(A, G)'])
      const i11 = b11.byId('I2')?.value
      ok('`交(A_4, S_4)`（两张各自造的置换群）照旧按 id 对得上', i11?.type === 'group', b11.line('I2')?.error)
      if (i11?.type === 'group') eq('|A_4 ∩ S_4| = 12', i11.group.order, 12)

      /**
       * ⚠️ U38（2026-09-30）起 `包含(C_3, C_6)` **不再报错** —— C₆ 真有唯一的 3 阶子群
       * （`{e0, e2, e4}`，指数 2 ⇒ 正规），第二关（嵌入）判得出来。
       *
       * 从前它报"记号碰巧重合"，那是**旧判据**只按 id 判的产物：`C_3` 的 `e0 e1 e2`
       * 与 `C_6` 的 `e0…e5` 撞号，而 `{e0,e1,e2}` 在 C₆ 里又不封闭。
       *
       * 真正的"串号误报"仍由**交 / 并 / 差**那一族钉着（⑧ 上半段）：那几个操作要的是
       * "取到同一批元素"，跟"G 里有没有同构的子群"是两回事 —— 同构不能替代相等。
       */
      const b12 = build(['X = C_3', 'Y = C_6', 'R = 包含(X, Y)'])
      const r12 = b12.byId('R')?.value
      ok('`包含(C_3, C_6)` 建出来了（C₆ 唯一的 3 阶子群）', r12?.type === 'relation', b12.line('R')?.error)
      eq('指数 = 6 / 3 = 2', r12?.type === 'relation' ? r12.relation.index : -1, 2)
      eq('指数 2 ⇒ 正规', r12?.type === 'relation' ? r12.relation.isNormal : null, true)

      /**
       * 但**记号陷阱本身**还得有人点破（U38 把提示挪到了 hint 里）：
       * `包含(C_3, C_7)` —— 3 不整除 7（拉格朗日先否），而 `C_3` 的 `e0 e1 e2`
       * 在 `C_7` 里"也找得到"这件事必须点出来，否则用户会以为"名字对得上就该是子群"。
       */
      const b12b = build(['X = C_3', 'Y = C_7', 'R = 包含(X, Y)'])
      const s12b = b12b.line('R')
      ok('`包含(C_3, C_7)` 停下', s12b?.ok === false, `ok=${s12b?.ok}`)
      ok('先给数学上的硬理由（拉格朗日）', (s12b?.error ?? '').includes('拉格朗日'), s12b?.error)
      ok('再点破"记号碰巧重合"这个陷阱', (s12b?.hint ?? '').includes('碰巧重合'), s12b?.hint)

      // ⑨ 用户的**目标本身**：第二同构在 F₂₁ 上整条走通 —— `HN/N ≅ H/(H∩N)`（两边都是 C₃）
      const b13 = build([
        'F = F_21',
        'H = 闭包(F, a)',
        'N = 闭包(F, b)',
        'HN = 积集(H, N)',
        'C = 交(H, N)',
        'L = 商(HN, N)',
        'R = 商(H, C)',
      ])
      const g13 = (id: string) => {
        const v = b13.byId(id)?.value
        return v?.type === 'group' ? v.group : null
      }
      eq('|HN| = 21（= |F₂₁|：H ∩ N = {e}）', g13('HN')?.order ?? -1, 21)
      eq('HN/N ≅ C_3（手算 21 / 7）', g13('L') ? identifyGroup(g13('L')!) : '-', 'C_{3}')
      eq('H/(H∩N) ≅ C_3（手算 3 / 1）', g13('R') ? identifyGroup(g13('R')!) : '-', 'C_{3}')
      ok('第二同构在 F₂₁ 上整条跑通（两边同阶同构）', !!g13('L') && !!g13('R'))

      // ⑩ 画布上下文（U34）：**F₂₁ 摆着的时候**，直接造的 C_3 / C_7 也该做得了
      //    （用户原话："我直接生成C3和C7居然不能做积集，还得弄闭包……只要拉两个子群箭头就应该能猜对"）
      const b14 = build(['F = F_21', 'K = C_3', 'M = C_7', 'P = 积集(K, M)', 'I = 交(K, M)'])
      const p14 = b14.byId('P')?.value
      ok('F₂₁ 在旁边：`积集(C_3, C_7)` 直接算出来', p14?.type === 'group', b14.line('P')?.error)
      if (p14?.type === 'group') eq('|C_3 · C_7| = 21（在 F 里相乘）', p14.group.order, 21)
      ok(
        '披露写明取的是 F 里同构的子群（7 个候选结果相同）',
        (b14.byId('P')?.sub ?? '').includes('7 个候选，结果相同'),
        b14.byId('P')?.sub,
      )
      const i14 = b14.byId('I')?.value
      ok('`交(C_3, C_7)` 也直接算出来', i14?.type === 'group', b14.line('I')?.error)
      if (i14?.type === 'group') eq('交出来是 C_1（{e}）', i14.group.order, 1)

      // 没有共同的家时**仍然**诚实报错（不是随便找个群就塞）
      const b15 = build(['K = C_3', 'M = C_7', 'P = 积集(K, M)'])
      ok('空画布：`积集(C_3, C_7)` 照旧停下', b15.line('P')?.ok === false, b15.line('P')?.error)
      ok('理由仍是"没有共同的母群"', (b15.line('P')?.error ?? '').includes('共同的母群'), b15.line('P')?.error)
    }
  }
}
