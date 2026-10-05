/**
 * U57 回归线（2026-10-03）：**造群作用的入口** —— 从"只有群节点那条路"补到四条。
 *
 * 起因是用户那句：「然后呢？我创建了群和点集，然后怎么创建群作用？
 * **到底在做什么……**」侦察（`.tmp-act/` 五轮真浏览器探针）结论：
 * **能造，但入口只有群节点那颗球一条**。而用户手上正好有「群 + 点集」时，
 * 最自然的手势是画布上方那颗 **⊕ 球**（"把两样凑一起"）—— 它偏偏没有
 * `customAction`（同族的 `conjOn` / `cosetAction` 都在里面）。
 *
 * ── 病根（一句话）─────────────────────────────────────────────
 * `customAction` 的第二参 Ω 是 `omegaOrInt`（U53 加的**半对象档**：既能吃画布上的
 * 集合，也能空着填一个点数）。而"多对象操作 / 拖拽候选"两处筛子只看 `isScalarParam`
 * —— 于是它被**两种筛子同时漏掉**。判据换成 `takesCanvasObject` 之后，
 * 那个真问题（"要不要从画布上点对象"）才被问对。
 *
 * ── 本套守的判据 ───────────────────────────────────────────────
 *   ① `takesCanvasObject` 与 `isScalarParam` 的差**恰好是 `omegaOrInt` 那一档**；
 *   ② ⊕ 球 15 → **16 条**，新进来的**只有** `customAction`（单对象 op 照旧一条不在）；
 *   ③ 拖拽连线同样收得下（两个方向都对，方向由判据定）；
 *   ④ **Ω 那一侧照旧列不出它** —— 这是"必须给点集一颗「被作用」"的**理由本身**，
 *      不是缺陷：`customAction` 的第一参是群 G，`singleOpsFor(点集)` 永远匹配不上；
 *   ⑤ 四条入口（群节点球 / ⊕ 球 / 拖拽连线 / 点集节点的「被作用」）落到**同一个 op**、
 *      同一份内核（`planCustomAction`）—— 不许长出四个不一致的入口。
 *
 * ⚠️ **期望值手算**：注册表 `OPS.length = 45`（U60 起；u55 记过 44），`multiOps` 的条数
 * 由"有几条 op 的**画布可填位** ≥ 2"推出，不抄运行结果。
 */
import { buildLines } from '../../src/gal/build'
import { maxObjectArity, objectArity } from '../../src/gal/compose'
import { multiOps, pairOps, singleOpsFor } from '../../src/gal/interaction'
import { isScalarParam, opById, takesCanvasObject, type ParamType } from '../../src/gal/ops'
import { eq, ok, suite } from '../harness'

/** 全部参数档（漏一个就意味着那一档没人守）。 */
const ALL_TYPES: ParamType[] = [
  'group',
  'carrier',
  'subset',
  'setlike',
  'omega',
  'omegaOrInt',
  'action',
  'map',
  'element',
  'prime',
  'int',
  'genImage',
]

export function run(): void {
  const opOf = (id: string) => opById(id)!

  suite('u57 \cdot takesCanvasObject（这一档能不能从画布上拿对象）')
  {
    const objectish: ParamType[] = ['group', 'carrier', 'subset', 'setlike', 'omega', 'action', 'map']
    ok(
      '对象档全为 true',
      objectish.every((t) => takesCanvasObject(t)),
      objectish.filter((t) => !takesCanvasObject(t)).join(','),
    )
    const scalar: ParamType[] = ['element', 'prime', 'int', 'genImage']
    ok(
      '纯标量档全为 false',
      scalar.every((t) => !takesCanvasObject(t)),
      scalar.filter((t) => takesCanvasObject(t)).join(','),
    )

    // 正题：这两个函数的差**只有一档**。判据就在这一行上，多一档少一档都得改这里。
    eq(
      '与 isScalarParam 的差集恰好是 omegaOrInt',
      ALL_TYPES.filter((t) => takesCanvasObject(t) !== !isScalarParam(t)).join(','),
      'omegaOrInt',
    )
    ok('  omegaOrInt 两件属性都要（既是标量档、又能吃画布上的集合）', takesCanvasObject('omegaOrInt') && isScalarParam('omegaOrInt'))
  }

  suite('u57 \cdot \oplus 球（multiOps）现在收得下 customAction')
  {
    const multi = multiOps()
    eq('16 条（U57 前是 15）', multi.length, 16)
    ok(
      '含 customAction（用户找不到的那一条）',
      multi.some((o) => o.id === 'customAction'),
      multi.map((o) => o.id).join(','),
    )
    /*
     * U58 翻案。这条原判据是「U57 换了筛子之后，新混进 multiOps 的恰好是
     * `customAction` 一条」—— 判据写成"`maxObjectArity ≤ 1` 却进得来"的差集。
     *
     * U58 把 `maxObjectArity` 也统一到 `takesCanvasObject`（Ω 那一档算一个
     * "能在画布上点的位"）⇒ 两处口径一致，差集**理应**为空。
     * 为什么要统一：`customAction` 停在 pending 时，Ω 明明能点却点不动
     * （`canPick` 是同一条口径），用户 2026-10-03 的原话正是
     * 「群作用作为多对象操作**只能选择一个对象**？」。
     */
    eq(
      'maxObjectArity 与 multiOps 口径一致（U58 起：差集为空）',
      multi.filter((o) => maxObjectArity(o) <= 1).map((o) => o.id).join(','),
      '',
    )
    eq(
      '  customAction 的 maxObjectArity = 2（G 与 Ω 都能在画布上点）',
      maxObjectArity(multi.find((o) => o.id === 'customAction')!),
      2,
    )
    ok(
      '新不变量：每条都至少两个"能从画布上拿对象"的位',
      multi.every((op) => op.params.filter((p) => takesCanvasObject(p.type)).length > 1),
      multi.map((o) => `${o.id}:${o.params.filter((p) => takesCanvasObject(p.type)).length}`).join(','),
    )
    // 回归：这几条**不该**因为换判据混进来（它们是纯单对象操作）
    ok(
      '单对象 op 照旧一条都不在（Z / Inn / Sub / Aut）',
      !multi.some((o) => ['center', 'innerAutomorphismGroup', 'subgroups', 'automorphismGroup'].includes(o.id)),
      multi.map((o) => o.id).join(','),
    )
    ok(
      '同族的两个内置作用照旧在（没被这次改动挤掉）',
      multi.some((o) => o.id === 'conjugationOnSet') && multi.some((o) => o.id === 'cosetAction'),
      multi.map((o) => o.id).join(','),
    )
    ok(
      '面板顺序是注册表序（customAction 排在 cosetAction 之后）',
      multi.findIndex((o) => o.id === 'customAction') > multi.findIndex((o) => o.id === 'cosetAction'),
      multi.map((o) => o.id).join(','),
    )
  }

  suite('u57 \cdot pairOps（拖拽连线）也收得下 customAction')
  {
    const objs = buildLines(['G = D_4', 'P = pointSet(5)']).objects
    const g = objs.find((o) => o.id === 'G')!.value
    const p = objs.find((o) => o.id === 'P')!.value

    const fwd = pairOps(g, p)
    ok(
      '拖「群」到「点集」上：列得出 customAction',
      fwd.some((c) => c.op.id === 'customAction'),
      fwd.map((c) => c.op.id).join(','),
    )
    eq(
      '  方向不用反（G 就是第一参）',
      fwd.find((c) => c.op.id === 'customAction')?.swapped,
      false,
    )
    /*
     * ⚠️ **2026-10-04 翻（F1 修复）**：从前这里要的是"∩ ∪ ∖ 与 customAction 同批"。
     * 那时 `paramAccepts#subset` **无条件**收 `set`，于是 `pointSet(5)` 被当成元素集，
     * ∩ ∪ ∖（还有 quotient / cosetAction / C_G / N_G）一起列了出来 —— 而内核一条都不收，
     * 点下去全是「\cap 需要两个集合」。拖 G→P 列 **10 条、9 条必报错**。
     *
     * 修法是**判据只写一份**（`ops.ts#setElementSetOf`：`set` 当元素集读，当且仅当
     * ① 有母群 ② 成员都能在母群里解析回元素）。点集两条都不满足 ⇒ **本来就不该列**。
     * 这条断言守的东西没变（"拖群到点集列出来的都得能跑"），变的是"点集算不算元素集"
     * 这个数学事实 —— 它不算（它是 Ω）。
     */
    ok(
      '  点集不是元素集：∩ ∪ ∖ 不再并列（修复前它们列出来必报错）',
      !['intersection', 'union', 'difference'].some((id) => fwd.some((c) => c.op.id === id)),
      fwd.map((c) => c.op.id).join(','),
    )
    eq(
      '  剩下来的每一条都真能跑 —— 拖 G→P 只留 customAction',
      fwd.map((c) => c.op.id).join(','),
      'customAction',
    )

    const rev = pairOps(p, g)
    eq(
      '反过来拖（点集 -> 群）：同一个 op，标 swapped',
      rev.find((c) => c.op.id === 'customAction')?.swapped,
      true,
    )

    // 子群关系也成立：A_4 作用在 S_4 的 24 个元素上完全合法（conjOn 一直是这么列的）
    const objs2 = buildLines(['A = A_4', 'S = S_4']).objects
    const a = objs2.find((o) => o.id === 'A')!.value
    const s = objs2.find((o) => o.id === 'S')!.value
    ok(
      '拖 A_4 到 S_4 上也列得出（群当集合读：Ω = 它那 24 个元素）',
      pairOps(a, s).some((c) => c.op.id === 'customAction'),
      pairOps(a, s).map((c) => c.op.id).join(','),
    )
  }

  suite('u57 \cdot Ω 那一侧：单对象菜单照旧列不出它（这正是要给点集一颗「被作用」的理由）')
  {
    const objs = buildLines(['P = pointSet(5)']).objects
    const p = objs.find((o) => o.id === 'P')!.value

    const singles = singleOpsFor(p)
    ok(
      'singleOpsFor(点集) 不含 customAction —— 它的第一参是群 G，永远匹配不上',
      !singles.some((o) => o.id === 'customAction'),
      singles.map((o) => o.id).join(','),
    )
    /*
     * ⚠️ **2026-10-04 翻（F1 修复）**：从前这里写着"点集确实有单对象操作（底集 / 生成子群）"。
     * 那两条是 `paramAccepts` **单方面**收 `set` 收进来的 —— 内核的 `asSet.run` 说
     * 「没有底集可取」、`closure` 的 `subgroupArgOf` 说「需要一个集合」。这正是本套
     * 头号判据最忌讳的**菜单撒谎**（U57 自己就是被这条咬出来的）。
     *
     * ⚠️ **2026-10-04 再翻（U60 代数结构）**：F1 之后这里是"空"。U60 给点集补了一条
     * **真能跑**的单对象 op ——「给它一个运算」（`structure`，参数位是 `carrier`，
     * 内核 `planStructure` 真吃 `pointSet`）—— 于是判据从"为空"收紧成"恰好这一条"。
     * 这不是撒谎回归：`paramAccepts('carrier', set)` 收的正是抽象点集，且 run 真造得出结构。
     */
    eq(
      'singleOpsFor(点集) 恰好一条：structure（给它一个运算，U60 补的真入口）',
      singles.map((o) => o.id).join(','),
      'structure',
    )
    {
      const o2 = buildLines(['P = pointSet(5)', 'G = D_4']).objects
      const g2 = o2.find((o) => o.id === 'G')!.value
      const p2 = o2.find((o) => o.id === 'P')!.value
      ok(
        '  它不是死路：拖一个群到它身上，菜单里必须有一条真能跑的（customAction）',
        pairOps(g2, p2).some((c) => c.op.id === 'customAction'),
        pairOps(g2, p2).map((c) => c.op.id).join(',') || '(空菜单)',
      )
    }

    /*
     * 两个计数的差就是这次改动的全部内容：
     *   · `objectArity` 只数**纯**对象位 ⇒ customAction 是 1（G），Ω 不算；
     *   · 而"能从画布上拿对象"的位有 2 个（G 与 Ω）—— 判据换掉的就是这一处。
     */
    eq('customAction 的 objectArity（只数纯对象位）', objectArity(opOf('customAction')), 1)
    eq(
      '  但"能从画布上拿对象"的位有 2 个（G 与 Ω）—— 差就在这里',
      opOf('customAction').params.filter((x) => takesCanvasObject(x.type)).length,
      2,
    )
  }

  suite('u57 \cdot 四条入口落到同一个 op（同一份内核）')
  {
    const objs = buildLines(['G = D_4', 'P = pointSet(5)']).objects
    const g = objs.find((o) => o.id === 'G')!.value
    const p = objs.find((o) => o.id === 'P')!.value

    // ① 群节点的球 ② ⊕ 球 ③ 拖拽连线 —— 三条都指向 registry 里那**一个** id
    const onGroup = singleOpsFor(g).filter((o) => o.id === 'customAction')
    eq('① 群节点球里那一条', onGroup.map((o) => o.id).join(','), 'customAction')
    eq('② ⊕ 球里那一条', multiOps().filter((o) => o.id === 'customAction').map((o) => o.id).join(','), 'customAction')
    eq(
      '③ 拖拽候选里那一条',
      pairOps(g, p).filter((c) => c.op.id === 'customAction').map((c) => c.op.id).join(','),
      'customAction',
    )
    // ④ 点集节点的「被作用」由 UI 起头（`ObjectOrb` 的 `act` 项 + App 的 `startActionOnSet`），
    //    但落到的是同一个 op —— 那一条在 e2e/action-entries.mjs 第 ④ 节真浏览器上验。
    eq('四条入口共用的 op 名（也是用户手敲的那个词）', opOf('customAction').call?.[0], 'customAction')
  }
}
