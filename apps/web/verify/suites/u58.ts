/**
 * U58 回归线（2026-10-03）：**群作用这件事本身** —— 选得动、吃得下、看得见。
 *
 * 起因还是用户，但这次他骂的不是"入口在哪"，而是**做完了到底能不能用**：
 *
 *   「你到底在开发什么？一个群作用开发的丢三落四的，多少次了？开发完不会起
 *    playwright 看看实际能不能用？…… 你现在开发的效果还是不行：**群作用作为多对象
 *    操作只能选择一个对象**？那如果不是任意阶集合，是一个**特殊构造的集合（比如子群集）**
 *    你怎么弄？还有群作用的信息显示了什么东西？**元素映射到哪去了**？」
 *
 * 三问逐条对应本批的三处改动（真浏览器探针 `.tmp-diag/probe2.mjs` 先复现、后验收）：
 *
 *  ① **"只能选一个对象"** —— `maxObjectArity` / `canPick` / `pendingHint` 三处还在用
 *     `isScalarParam` 口径，而 U57 已把"要不要从画布上点对象"这件事统一到
 *     `takesCanvasObject`。于是 Ω 明明能吃画布上的集合，pending 里却**点不动**、
 *     也不提示它还能选 —— 用户看到的就只有"第 1 / 1 个对象"。
 *  ② **"子群集这种特殊构造的集合"** —— `omegaSpecOfValue` / `paramAccepts` /
 *     编辑器那排 chip 三处都只认 `set` / `elements` / `group`。画布上摆着 `Syl(S_4,3)`
 *     时，编辑器**一个 chip 都不列**（零线索），而 Ω 那格填 `S3` 会报"它不是集合"——
 *     非要用户先 `asSet` 一步才肯收。
 *  ③ **"元素映射到哪去了"** —— 作用的信息面板只有 类型 / 群 / 核 / |Ω| / 点列表，
 *     `GalAction.perms`（"每个元素映成哪个置换"）从来没铺出来过。映射有
 *     `MapCorrespondence`，作用没有。
 *
 * 另修一处纯文本面泄漏：编辑器里 Ω 的读数原样打印 `\langle 234\rangle`（LaTeX）。
 *
 * ⚠️ **期望值全部手算**：`Syl(S_4, 3)` 有 4 个成员（n_3 = 4），`S_4` 的两个生成元是
 * `s12` / `c`；4 个点的平凡作用必然是同态（核 = G）。不抄运行结果。
 */
import { buildLines } from '../../src/gal/build'
import { maxObjectArity, objectArity } from '../../src/gal/compose'
import { canPick, pendingHint } from '../../src/gal/interaction'
import { opById } from '../../src/gal/ops'
import {
  IDENTITY_TOKEN,
  isOmegaCarrier,
  omegaSpecOfValue,
  planCustomAction,
} from '../../src/gal/customAction'
import { labelsHint } from '../../src/gal/pointSet'
import { asciiSymbol } from '../../src/gal/pretty'
import type { GalValue } from '../../src/gal/value'
import { eq, ok, suite } from '../harness'

/** `GalValue` 的全部档（漏一个就意味着那一档没人守）。 */
const ALL_VALUE_TYPES = [
  'group',
  'elements',
  'set',
  'subgroups',
  'map',
  'action',
  'relation',
  'number',
  'structure',
] as const

export function run(): void {
  const { objects } = buildLines(['G = S_4', 'S3 = Syl(S_4, 3)', 'O = asSet(S3)'])
  const G = objects.find((o) => o.id === 'G')!.value
  const S3 = objects.find((o) => o.id === 'S3')!.value
  const O = objects.find((o) => o.id === 'O')!.value

  suite('u58 \cdot isOmegaCarrier（哪些值能当 Omega —— 判据只有一份）')
  {
    // 四种载体：群 / 元素集 / 集合 / **子群集**（顺序 = `ALL_VALUE_TYPES` 的过滤序）
    eq(
      '收的恰好是 group / elements / set / subgroups',
      ALL_VALUE_TYPES.filter((t) => isOmegaCarrier({ type: t } as unknown as GalValue)).join(','),
      'group,elements,set,subgroups',
    )
    ok('  子群集在列（U58 补的那一档）', isOmegaCarrier(S3), `${S3.type}`)
    ok(
      '  映射 / 作用 / 关系 / 数 都不在列',
      !(['map', 'action', 'relation', 'number'] as const).some((t) =>
        isOmegaCarrier({ type: t } as unknown as GalValue),
      ),
    )

    // 判据一份：`isOmegaCarrier` 说能的，`omegaSpecOfValue` 必须读得出来
    ok(
      '  判据一致：说能的四种，omegaSpecOfValue 全读得出',
      [G, S3, O].every((v) => omegaSpecOfValue(v, 'X') !== null),
      [G, S3, O].map((v) => `${v.type}:${!!omegaSpecOfValue(v, 'X')}`).join(','),
    )
  }

  suite('u58 \cdot 子群集直接当 Omega（不必先 asSet 一步）')
  {
    const spec = omegaSpecOfValue(S3, 'S3', 'S3')
    ok('读得出一个 OmegaSpec', !!spec && spec.kind === 'set', JSON.stringify(spec?.kind))
    if (spec && spec.kind === 'set') {
      // n_3 = 4（S_4 的 Sylow 3-子群个数，手算：Sylow III 给 n_3 | 8 且 n_3 ≡ 1 (mod 3) ⇒ 4）
      eq('  4 个点（S_4 的 Sylow 3-子群有 4 个）', spec.set.members.length, 4)
      ok(
        '  每个成员都带着自己的元素集（面板「取出为对象」要用）',
        spec.set.members.every((m) => (m.subgroupElements?.length ?? 0) > 0),
        spec.set.members.map((m) => `${m.label}:${m.subgroupElements?.length ?? 0}`).join(','),
      )
      ok('  成员引用的是同一个对象（`from`）', spec.set.from === 'S3', String(spec.set.from))

      // 与 `asSet(S3)` 的产物**逐个成员一致** —— 两条路不能给出两个不同的点集
      const viaAsSet = omegaSpecOfValue(O, 'O')
      eq(
        '  与 asSet(S3) 的成员逐个相同（两条路一个答案）',
        spec.set.members.map((m) => m.label).join(','),
        viaAsSet && viaAsSet.kind === 'set' ? viaAsSet.set.members.map((m) => m.label).join(',') : '?',
      )
    }

    // 内核：拿子群集当 Ω 跑一遍（4 个点的平凡作用 —— 必然同态，核 = G）
    if (G.type !== 'group') {
      ok('  G 是群（前置条件）', false, G.type)
    } else {
      const plan = planCustomAction(G.group, omegaSpecOfValue(S3, 'S3', 'S3')!, [
        { genText: 's12', cycle: IDENTITY_TOKEN },
        { genText: 'c', cycle: IDENTITY_TOKEN },
      ])
      ok('  内核能吃下子群集当 Omega', plan.ok, plan.ok ? '' : plan.error)
      if (plan.ok) {
        eq('    4 个作用点', plan.action.n, 4)
        eq('    平凡作用 ⇒ 核是整个 G（|S_4| = 24）', plan.kernelIds.length, 24)
        ok('    不忠实（平凡作用的核就是 G）', !plan.faithful)
      }
    }
  }

  suite('u58 \cdot Omega 那一格也能在画布上点（口径统一）')
  {
    const op = opById('customAction')!
    eq('objectArity 只数纯对象位 ⇒ 1（Ω 不算）', objectArity(op), 1)
    eq('maxObjectArity 含半对象档 ⇒ 2（G 与 Ω 都能点）', maxObjectArity(op), 2)

    ok('第 2 位（Ω）能收一个集合', canPick(op, 1, [G], O), '')
    ok('第 2 位（Ω）能收一个**子群集**', canPick(op, 1, [G], S3), '')
    ok('第 1 位（G）不收集合（它要的是群）', !canPick(op, 0, [], O), '')
    ok('第 1 位（G）收群', canPick(op, 0, [], G), '')

    // 提示条：两位的对象 vs 一位 + 编辑器 —— 收尾方式不同，措辞必须跟着变
    eq('没选任何对象时：第 1 / 2 个对象', pendingHint(op, 0), '选择「G」（群），第 1 / 2 个对象')
    ok(
      '选完 G 之后：说清是"可选"，且**不选就进编辑器**（不是"直接执行"）',
      pendingHint(op, 1).includes('可选') && pendingHint(op, 1).includes('编辑器'),
      pendingHint(op, 1),
    )
    // 对照组：`像(f, ·)` 那条可选位收尾是"直接执行"—— 两者不许串
    const imageOp = opById('image')!
    ok(
      '对照组 image 的可选位仍说"直接执行"',
      pendingHint(imageOp, objectArity(imageOp)).includes('直接执行'),
      pendingHint(imageOp, objectArity(imageOp)),
    )
  }

  suite('u58 \cdot 纯文本面：子群标号不许泄漏 LaTeX')
  {
    eq('asciiSymbol：\\langle 234\\rangle -> <234>', asciiSymbol('\\langle 234\\rangle'), '<234>')
    eq('  细空格 \\, 去掉', asciiSymbol('\\langle 1\\,2\\,3\\rangle'), '<123>')
    eq('  回归：乘号照旧', asciiSymbol('C_{2}\\times C_{2}'), 'C_2 x C_2')
    ok(
      '  产物全是键盘打得出的字符',
      [...asciiSymbol('\\langle 234\\rangle')].every((c) => c.charCodeAt(0) < 128),
      asciiSymbol('\\langle 234\\rangle'),
    )

    const hint = labelsHint(['\\langle 234\\rangle', '\\langle 123\\rangle', '\\langle 124\\rangle', '\\langle 134\\rangle'])
    ok('labelsHint 里没有反斜杠（LaTeX 泄漏）', !hint.includes('\\'), hint)
    ok('  但仍带点号（用户照着写像要用）', hint.includes('1 <234>') && hint.includes('4 <134>'), hint)
  }
}
