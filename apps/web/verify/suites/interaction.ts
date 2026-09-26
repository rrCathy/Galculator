/**
 * 回归：**交互状态机与三个入口的声明**（`gal/interaction.ts`）。
 *
 * 这一份补的是第五批的第二个缺口：`interaction.ts` 从前只被用了两个导出
 * （`pairOps` / `singleOpsFor`），而它写着**三个操作入口共用的那套规则**——
 * 状态怎么转、哪些操作该出现在哪个菜单里、能不能点这个节点。
 * 这些都是"用户看不见但一错就全错"的地方：
 * 菜单里少一条或多一条，用户只会觉得"这工具怪怪的"，不会报错。
 *
 * 期望值来自**设计契约**（各函数的 doc 注释与 `PAIR_PRIORITY` 的主张），
 * 不是从某次运行的输出抄的。
 */
import { buildLines } from '../../src/gal/build'
import { objectArity } from '../../src/gal/compose'
import {
  activeOpId,
  canPick,
  focusId,
  IDLE,
  menuLabel,
  multiOps,
  needsEditor,
  pairOps,
  PARAM_LABEL,
  pendingHint,
  pickedIds,
  singleOpsFor,
  type Interaction,
} from '../../src/gal/interaction'
import { OPS, opsFor, paramAccepts } from '../../src/gal/ops'
import { eq, ok, suite } from '../harness'

/** 手边的一台小舞台：S₄ ↠ S₃（带核）+ 手打的 A₄。 */
const STAGE = buildLines(['G = S_4', 'H = S_3', 'A = A_4', 'f = 映射(G, H, s12→23, c→13)'])
const val = (id: string) => STAGE.objects.find((o) => o.id === id)!.value
const G = val('G')
const H = val('H')
const A = val('A')
const F = val('f')

const opOf = (id: string) => OPS.find((o) => o.id === id)!

export function run(): void {
  /* ══ ① 状态机：六个状态各自"焦点是谁 / 谁被选中 / 在跑什么" ═ */

  suite('interaction · 状态机的取值（六个状态）')
  {
    const states: [Interaction, string | null, string[], string | null][] = [
      [IDLE, null, [], null],
      [{ kind: 'selected', target: 'G' }, 'G', [], null],
      [{ kind: 'menu', target: 'A' }, 'A', [], null],
      [{ kind: 'pending', opId: 'quotient', picked: ['G', 'A'] }, 'G', ['G', 'A'], 'quotient'],
      [{ kind: 'fill', opId: 'sylow', picked: ['G'], scalars: ['3'] }, 'G', ['G'], 'sylow'],
      [{ kind: 'editor', opId: 'map', picked: ['G', 'H'] }, 'G', ['G', 'H'], 'map'],
    ]
    for (const [st, focus, picked, opId] of states) {
      const name = st.kind
      eq(`${name}：焦点`, focusId(st), focus)
      eq(`${name}：高亮的节点数`, pickedIds(st).length, picked.length)
      eq(`${name}：在跑的操作`, activeOpId(st), opId)
    }

    // 两条容易写反的细则
    ok(
      'pending / fill / editor 的焦点停在**第一个**参数（它是"源"）',
      focusId({ kind: 'pending', opId: 'quotient', picked: ['G', 'A'] }) === 'G',
    )
    eq('idle 时没有任何高亮', pickedIds(IDLE).length, 0)
    ok('空 picked 不炸（取不到就给 null）', focusId({ kind: 'pending', opId: 'x', picked: [] }) === null)
  }

  /* ══ ② 单对象入口：它比 opsFor 少一样东西 —— 产数值的 ═══ */

  suite('interaction · singleOpsFor（悬浮球第 4 个按钮）')
  {
    const singles = singleOpsFor(G)
    ok('群上给出了一批候选', singles.length > 0, `${singles.length}`)

    // 契约的两条判据
    ok(
      '每一条都"只需这一个对象"（objectArity ≤ 1）',
      singles.every((op) => objectArity(op) <= 1),
      singles.map((o) => `${o.id}:${objectArity(o)}`).join(','),
    )
    ok(
      '每一条都不产数值（用户定了"计算先不弄"）',
      singles.every((op) => op.result !== 'number'),
      singles.map((o) => `${o.id}:${o.result}`).join(','),
    )

    // 与 opsFor 对照 —— 差别恰恰就是那一条被挡掉的
    const raw = opsFor([G]).map((o) => o.id)
    ok('opsFor 里确实有「元素阶 ord」（它产数值）', raw.includes('elementOrder'), raw.join(','))
    ok('而 singleOpsFor 把它挡掉了', !singles.map((o) => o.id).includes('elementOrder'))

    // 多对象操作不该混进来（那是 ⊕ 球 / 左栏「操作」的事）
    ok(
      '多对象操作（直积 / 包含…）不在单对象入口里',
      !singles.some((o) => ['directProduct', 'contains', 'quotient', 'map'].includes(o.id)),
      singles.map((o) => o.id).join(','),
    )

    // 映射对象：箭头上的球给出 ker / im（U3.1 的原话"点箭头、点 ker，完事"）
    const onMap = singleOpsFor(F).map((o) => o.id)
    ok('映射上给出「核」', onMap.includes('kernel'), onMap.join(','))
    ok('映射上给出「像」', onMap.includes('image'), onMap.join(','))
    ok('映射上不给群的那些操作（中心 / Sylow 之类）', !onMap.includes('center') && !onMap.includes('sylow'))

    // 带标量的操作仍然算"单对象"（素数由补参条填）
    ok('`Syl_p(G, p)` 算单对象（p 由补参条补）', singles.some((o) => o.id === 'sylow'))
  }

  /* ══ ③ 多对象入口：**不能用 opsFor 筛**（U2 的坑）══════════ */

  suite('interaction · multiOps（⊕ 球 —— 回归"用 opsFor 筛必然为空"那个坑）')
  {
    const multi = multiOps()
    ok('多对象操作非空', multi.length > 0, `${multi.length}`)
    ok(
      '每一条都需要不止一个对象',
      multi.every((op) => objectArity(op) > 1),
      multi.map((o) => `${o.id}:${objectArity(o)}`).join(','),
    )
    ok(
      '两条主力的都在（直积 / 包含）',
      multi.some((o) => o.id === 'directProduct') && multi.some((o) => o.id === 'contains'),
    )
    ok(
      '单对象操作没混进来（中心 / 核 不该在这里）',
      !multi.some((o) => ['center', 'kernel', 'subgroups'].includes(o.id)),
      multi.map((o) => o.id).join(','),
    )

    // **这条就是那个坑本身**：opsFor 的语义是"选中的值能把参数填满"，
    // 而多对象操作恰恰是"还没填满"的 —— 拿它去筛，永远筛不出东西来。
    const viaOpsFor = opsFor([G]).filter((op) => objectArity(op) > 1)
    eq('拿 opsFor 筛多对象操作 → 恒空（这就是 U2 栽的地方）', viaOpsFor.length, 0)
    ok('而 multiOps 给得出', multi.length > 0)

    ok('注册表就是这 32 条（多了少了都说明有人动过菜单的面）', OPS.length === 32, `${OPS.length}`)
  }

  /* ══ ④ canPick：pending 时哪些节点点得动 ════════════════ */

  suite('interaction · canPick（pending 态的可点判据）')
  {
    // 合法：商要求 (群, 数集)
    ok('`商(G, N)` 第 1 位收得下 G', canPick(opOf('quotient'), 0, [], G))
    ok('第 2 位收得下 G 自己（非真子群也算子群）', canPick(opOf('quotient'), 1, [G], G))

    // 标量位：画布上**选不出来**（这正是它要返回 false 的原因）
    eq('`Syl_p(G, p)` 的 p 是标量位 → 点不动', canPick(opOf('sylow'), 1, [G], G), false)
    eq('`ord(G, g)` 的 g 是标量位 → 点不动', canPick(opOf('elementOrder'), 1, [G], G), false)
    eq('`闭包(S, g₁…)` 的生成元位也是标量', canPick(opOf('closure'), 1, [G], G), false)

    // 类型不匹配
    eq('`ker(f)` 的 f 位填不上一个群', canPick(opOf('kernel'), 0, [], G), false)
    eq('`映射(G, H)` 的第 2 位填不上一个映射', canPick(opOf('map'), 1, [G], F), false)

    // 越界
    eq('没有第 3 位（map 只有 2 个参数）', canPick(opOf('map'), 2, [G, H], G), false)

    // **与 opsFor 同源**：canPick 的判据就是 paramAccepts，
    // 所以"菜单里能点出来的"与"这里能点的"永远一致 —— 这是那张注释的承诺。
    ok(
      'canPick 与 paramAccepts 同源（同一个函数说了算）',
      canPick(opOf('quotient'), 0, [], G) === paramAccepts('group', G, []),
    )
  }

  /* ══ ⑤ pendingHint：提示条要说清"还差哪一位" ═══════════ */

  suite('interaction · pendingHint（提示条文案）')
  {
    eq(
      '第 1 位：报参数名 + 类型 + 进度',
      pendingHint(opOf('quotient'), 0),
      '选择「G」（群）· 第 1 / 2 个对象',
    )
    eq(
      '第 2 位：进度跟着走',
      pendingHint(opOf('quotient'), 1),
      '选择「N」（元素集 / 子群）· 第 2 / 2 个对象',
    )
    eq('选满了就不再报"第 N 位"', pendingHint(opOf('quotient'), 2), '选择参数')

    // 类型标签是用户读的那一句，U21 刚拆过（一型两用那笔账）
    eq('群', PARAM_LABEL.group, '群')
    eq('单个数集（含"恰好一个成员"的列表）', PARAM_LABEL.subset, '元素集 / 子群')
    eq('整个子群集列表', PARAM_LABEL.setlike, '集合 / 子群集')
    eq('作用对象 Ω', PARAM_LABEL.omega, '集合 Ω')
    eq('生成元 → 像（编辑器专用）', PARAM_LABEL.genImage, '生成元 → 像')
  }

  /* ══ ⑥ menuLabel：一圈放不下全记法，得给短标签 ═══════════ */

  suite('interaction · menuLabel（悬浮球上的短标签）')
  {
    eq('映射：手写的短标签（不是截 notation）', menuLabel(opOf('map')), '映射 f: G → H')
    eq('包含：手写的', menuLabel(opOf('contains')), '包含 ⊆')
    eq('像：手写的', menuLabel(opOf('image')), '像 f(H)')

    // 没手写标签的 → 截「(」之前
    eq('共轭作用在(G, Ω) → 共轭作用在', menuLabel(opOf('conjugationOnSet')), '共轭作用在')
    eq('陪集作用(G, H) → 陪集作用', menuLabel(opOf('cosetAction')), '陪集作用')
    eq('底集(S) → 底集', menuLabel(opOf('underlyingSet')), '底集')

    // 一定要每个 op 都拿得到标签（空标签 = 球上一个看不见的按钮）
    const blank = OPS.filter((op) => menuLabel(op).trim().length === 0)
    eq('没有哪个操作的标签是空的', blank.length, 0)
  }

  /* ══ ⑦ pairOps：拖拽连线的候选与顺序 ═══════════════════ */

  suite('interaction · pairOps（拖拽连线的候选）')
  {
    const ids = (cs: { op: { id: string } }[]) => cs.map((c) => c.op.id)
    const ag = ids(pairOps(A, G))
    const ga = ids(pairOps(G, A))

    // **排序按数学意图**，不按注册表：说清关系（包含 / 商）在最前
    eq('拖 A₄ 到 S₄：第一条是「包含」', ag[0], 'contains')
    eq('紧接着是「商」', ag[1], 'quotient')
    ok(
      '「直积」排在集合运算（交 / 并 / 差）之前',
      ag.indexOf('directProduct') < ag.indexOf('intersection'),
      ag.join(','),
    )
    ok(
      '要进编辑器的「映射」垫在集合运算后面',
      ag.indexOf('map') > ag.indexOf('difference'),
      ag.join(','),
    )
    ok(
      '没列进优先级表的关系类 op 排在最后',
      ag.indexOf('conjugationOnSet') > ag.indexOf('map'),
      ag.join(','),
    )

    // 参数顺序：拖拽不表达顺序，由判据 / 类型定
    const containsFwd = pairOps(A, G).find((c) => c.op.id === 'contains')
    const containsBwd = pairOps(G, A).find((c) => c.op.id === 'contains')
    eq('从 A₄ 起拖：不用反（A₄ 就是 H）', containsFwd?.swapped, false)
    eq('从 S₄ 起拖：标 swapped（参数要摆成 (A₄, S₄)）', containsBwd?.swapped, true)
    ok(
      '两个方向都列得出「包含」（方向由判据定，不由拖的方向定）',
      !!containsFwd && !!containsBwd,
    )

    // 数学判据挡住了胡说：S₄ 与 S₃ 之间没有包含
    const gh = ids(pairOps(G, H))
    ok('不相干的两个群（S₄ 与 S₃）之间没有「包含」', !gh.includes('contains'), gh.join(','))
    ok('但直积 / 映射照给（它们对任意两个群都成立）', gh.includes('directProduct') && gh.includes('map'))

    // 映射是**边不是节点**，照样能当拖拽的端点（U21 的核心诉求）
    const af = pairOps(A, F)
    eq('拖 A₄ 到 f 上：只有「像」这一个候选', ids(af).join(','), 'image')
    eq('而且标了 swapped（f 必须在前）', af[0]?.swapped, true)
    eq('反过来从 f 起拖：同一个 op，不用反', pairOps(F, A)[0]?.swapped, false)

    // 两个子群集 / 数与群这种组合不该凑出"用得到两个"的操作
    eq('群 + 群 之外的组合不给空壳候选', ids(pairOps(A, A)).includes('contains'), false)
    ok(
      '每个候选都真的用到这两个对象（没有单对象操作混进来）',
      ids(pairOps(A, G)).every((id) => objectArity(opOf(id)) > 1),
      ag.join(','),
    )
  }

  /* ══ ⑧ needsEditor：哪些操作凑齐对象后还要进编辑器 ═══════ */

  suite('interaction · needsEditor')
  {
    ok('映射要进编辑器（生成元的像得用户选）', needsEditor(opOf('map')))
    ok('商不用（两个对象就够了）', !needsEditor(opOf('quotient')))
    ok('包含不用（一个判据就定得下来）', !needsEditor(opOf('contains')))
    ok('核不用（挂在一根箭头上，点一下就出来）', !needsEditor(opOf('kernel')))
  }
}
