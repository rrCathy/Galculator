import { useMemo, useState } from 'react'
import {
  computeLeftTranslationPerms,
  elementOrder,
  getGeneratorElements,
  type Group,
} from '@groupviz/core'
import { composeMapLine } from '../gal/compose'
// 内核（U52）：编辑器与 op **共用同一个 `planCustomAction`**，
// 所以"边填边看到的"与"确认后算出来的"不可能不一致。
import {
  CUSTOM_ACTION_CELL_CAP,
  IDENTITY_TOKEN,
  generatorCollisionReason,
  generatorsDistinct,
  isOmegaCarrier,
  omegaSpecOfValue,
  planCustomAction,
  type GenImageDraft,
  type OmegaSpec,
} from '../gal/customAction'
// Ω 的读法（U53）：点集 / 元素集 / 群 → `OmegaSpec`；值的筛选与 op **共用同一份**
import { evalExpr } from '../gal/evalDef'
// 「已知群」（U48）：只有符号 + 阶、没有元素表与生成元表 —— 做不了「填生成元的像」
import { isKnownGroup } from '../gal/known'
import { checkName, nextAutoName, normalizeName } from '../gal/naming'
import { labelsHint, POINT_SET_MAX } from '../gal/pointSet'
import { asciiSymbol, prettySymbol } from '../gal/pretty'
import type { OpDef } from '../gal/ops'
import type { CanvasNode, GalObject } from '../gal/types'
import { CardEditor } from './CardEditor'
import { TexOrText } from './Tex'

/** 校验结果（编辑器底部那条状态行）。 */
type Check =
  | { state: 'empty'; message: string }
  | { state: 'bad'; error: string; hint?: string; genName?: string }
  | { state: 'ok'; faithful: boolean; orbitSizes: number[]; kernelSize: number }

interface ActionBuilderProps {
  op: OpDef
  src: CanvasNode
  objects: GalObject[]
  /**
   * Ω 的**预置值**（U57）：把这一格直接填成某个表达式（通常是画布上一个集合的名字）。
   *
   * 两种来路，语义都是"用户已经指明了 Ω"：
   *   · 点集合节点 → 球 → 「被作用」（`startActionOnSet`）；
   *   · 把 G 拖到那个集合上（`dispatchPairOp` 把两位都选好了，Ω 是第二位）。
   * 都没有时留空 —— 那时才回落到"|G| ≤ 12 就取 |G|，否则 4"的老初值。
   */
  presetOmega?: string
  onSubmit: (line: string) => void
  onCancel: () => void
}

/**
 * 作用编辑器（U52）：**填每个生成元在 Ω 上的置换**。
 *
 * 一个作用就是一个同态 `φ : G -> S_Ω`，而 `S_Ω` 的元素本身就是 Ω 上的置换。
 * 所以这张表单只问两件事：**Ω 是什么**、每个生成元映到哪个置换 ——
 * 与「映射构建器」（`MapBuilder`）是同一个形状，只是靶群不用建出来。
 *
 * 输入形态是**循环记号文本**（`(1 2 3 4)` / `(12)(34)`）。选它的理由：
 * ① 与显示形态一致 —— 屏幕上写着 `(1 2 3 4)`，用户就能照着敲回来；
 * ② 点集不受任何群的构造上限约束（换成"靶群取 S_n"就要 S_n 建得出来才行）；
 * ③ core 的 `parseCycleNotation` 现成，宽容接受 `(234)` / `(12)(34)` / `(1,2)(3,4)`。
 *
 * ⚠️ **core 没有恒等的写法**（`()` / `(1)` / `1` 全回 null）—— 恒等写 `e`，
 * 由内核那层认（见 `customAction.ts` 的 `IDENTITY_TOKEN`）。两个按钮
 * （平凡 / 左正则）就是把 `e` 与左乘的循环记号**写进输入框**给用户看见，
 * 不搞"留空就是恒等"那种静默默认。
 *
 * ## Ω 从哪来（U53）
 *
 * U52 时这一栏只能填**点数**，于是 Ω 永远是"1 到 n 这 n 个抽象点"——
 * 用户原话是「逗我吗，连任意阶集合都创建不了，怎么创建自定义群作用？」。
 * 现在这一栏是一格 **Ω 表达式**（与输入球同一个求值器）：
 *
 * | 填 | Ω |
 * |---|---|
 * | `4` | 4 个抽象点，点号 `1..4`（数就是点数，U52 的老行为）|
 * | `pointSet(5)` | 同上，点数由点集给 |
 * | `labeledSet(a, b, c)` | 3 个点，标号 `a b c` —— **循环记号里就能写 `(a b)`** |
 * | `asSet(Syl(S_4, 3))` | 现成的集合（标号是子群记号 ⇒ 数字按位置读）|
 * | 画布上一个集合的名字（下面那排按钮）| 就引用那个对象（作用线连到它）|
 */
export function ActionBuilder(props: ActionBuilderProps) {
  const g = props.src.value.type === 'group' ? props.src.value.group : null
  /*
   * 「已知群」没有元素表与生成元表（U48）：作用靠"填生成元的像"来定，它两样都拿不到。
   * 挡在**包装层**（不是把守卫塞进编辑器里）—— 编辑器那一堆 hooks 的顺序不能被
   * 条件提前 return 打乱（rules-of-hooks），与 `MapBuilder` 同一处理由。
   */
  if (isKnownGroup(g)) {
    return (
      <div className="insp-line dim">
        作用群不能是「已知群」：它只有符号与阶（来自结论表），本地没有生成元与元素表，
        填不了生成元的像。
      </div>
    )
  }
  /*
   * 直积群的生成元在 core 里重名重号（`C_2^3` 是三个 `a`、记号都是 `1`）——
   * 那种群上"给每个生成元分别指定像"表达不出来（详见 `generatorsDistinct` 的注释）。
   * 挡在**包装层**：硬撑着开一个三行同名的表单只会让人以为能分别填。
   */
  if (g && !generatorsDistinct(g)) {
    return (
      <div className="insp-line dim">
        {generatorCollisionReason(g)}，没法给它们分别指定像。想让 G 作用在自己身上用 leftAction，
        其余三种内置作用也各有现成的路。
      </div>
    )
  }
  return <ActionBuilderEditor {...props} />
}

/** 0 起的置换 → 循环记号（点号 1 起）。恒等回 `e`（core 不认 `(1)`，见模块头注释）。 */
function cycleNotation(perm: readonly number[]): string {
  const n = perm.length
  const seen = new Array<boolean>(n).fill(false)
  const parts: string[] = []
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue
    seen[i] = true
    if (perm[i] === i) continue
    const cyc = [i + 1]
    let j = perm[i]
    while (j !== i) {
      seen[j] = true
      cyc.push(j + 1)
      j = perm[j]
    }
    parts.push(`(${cyc.join(' ')})`)
  }
  return parts.length > 0 ? parts.join('') : IDENTITY_TOKEN
}

/**
 * 状态行里的示例循环记号：点集有**写得进记号**的标号时就用它的标号。
 * `labeledSet(a, b, c)` 的示例因此是 `(a b)` 而不是 `(1 2)` —— 屏幕上写着 `a`，示例就该写 `a`。
 */
function sampleCycle(labels: readonly string[]): string {
  const usable = labels.filter((l) => l.trim() !== '' && !/[\s(),]/.test(l))
  if (usable.length >= 2) return `(${usable[0]} ${usable[1]})`
  if (labels.length >= 2) return '(1 2)'
  return IDENTITY_TOKEN
}

function ActionBuilderEditor({
  op,
  src,
  objects,
  presetOmega,
  onSubmit,
  onCancel,
}: ActionBuilderProps) {
  const G = src.value.type === 'group' ? src.value.group : null
  const gens = useMemo(() => (G ? getGeneratorElements(G) : []), [G])

  /*
   * Ω 的初值。**三种来路，优先级从上到下**：
   *
   *   ① `presetOmega`（U57）—— 用户已经指明了 Ω（点了集合节点的「被作用」，
   *      或把 G 拖到了那个集合上）。这时**不该**拿 |G| 去覆盖他指的东西。
   *   ② |G| ≤ 12 —— 小群按**正则作用**（G 作用在自己的 |G| 个元素上）起步最自然，
   *      那也正是「G ↷ G」这个记号最常指的东西。
   *   ③ 4 —— 大群给小舞台，免得一打开就顶到预算线（|G| x n）。
   */
  const [omegaDraft, setOmegaDraft] = useState(
    () => presetOmega ?? (G && G.order <= 12 ? String(G.order) : '4'),
  )
  const [images, setImages] = useState<Record<string, string>>({})
  const [nameDraft, setNameDraft] = useState('')
  const [autoNote, setAutoNote] = useState<string | null>(null)

  /*
   * Ω 的一格表达式（U53）——与输入球**同一个求值器**，所以
   * "编辑器里能填的"与"手打能吃的"不可能分家（值的筛选还共用 `omegaSpecOfValue`）。
   *
   * 三条支路：空的 / 一个纯整数（= 点数，老行为）/ 一句点集表达式。
   */
  const objectMap = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects])
  /**
   * 画布上已经有的、能当 Ω 的对象（下面那排一键按钮用）。
   *
   * 判据 = **内核那一份**（`isOmegaCarrier`，U58），只排掉作用群自己：
   *   · `set` / `elements` / `subgroups` —— `pointSet(5)` / `Z(S_4)` / **`Syl(G,3)`**
   *   · 别的**群** —— 当"它的底集"读（`customAction(G, H, …)` = G 作用在 H 的元素上）
   *
   * 从前这里写的是 `set || elements`：画布上只有 `Syl(S_4,3)`（子群集）的时侯
   * **一个 chip 都不显示**，用户既不知道该填什么、也不知道能填什么
   *（他 2026-10-03 问的正是"子群集这种特殊构造的集合你怎么弄"）。
   *
   * 类名用 `ab-set-chip` 而不是 `mb-auto` —— 后者是「一键起点」那一排的类名，
   * 回归套件按它数按钮，混进来会让"两个按钮都在"那条断言读错。
   */
  const canvasSets = useMemo(
    () => objects.filter((o) => o.id !== src.id && isOmegaCarrier(o.value)),
    [objects, src.id],
  )
  const omega = useMemo<
    | { kind: 'empty' }
    | { kind: 'count'; n: number }
    | { kind: 'set'; spec: OmegaSpec; n: number; labels: string[] }
    | { kind: 'bad'; error: string; hint?: string }
  >(() => {
    const t = omegaDraft.trim()
    if (!t) return { kind: 'empty' }
    if (/^[0-9]+$/.test(t)) return { kind: 'count', n: Number(t) }
    const r = evalExpr(t, objectMap)
    if (!r.ok) {
      return { kind: 'bad', error: `点集「${t}」认不出来`, hint: r.error }
    }
    const spec = omegaSpecOfValue(r.value, t, objectMap.has(t) ? t : undefined)
    if (!spec || spec.kind !== 'set') {
      return {
        kind: 'bad',
        error: `点集「${t}」认不出来：它${r.value.type === 'number' ? '只是一个数' : '不是集合'}`,
        hint: '点集如 pointSet(5) / labeledSet(a, b, c) / Syl(G, 3) / asSet(Syl(G, 3))；只要点数就直接填一个数字（如 4）',
      }
    }
    return {
      kind: 'set',
      spec,
      n: spec.set.members.length,
      labels: spec.set.members.map((m) => m.label),
    }
  }, [omegaDraft, objectMap])

  const usedNames = useMemo(() => objects.map((o) => o.id), [objects])
  /** 作用的默认名：**优先希腊字母**（α / β）—— `\alpha : G \to S_\Omega` 是课本写法 */
  const autoName = useMemo(() => {
    const used = new Set(usedNames.map((n) => n.toLowerCase()))
    if (!used.has('\\alpha')) return '\\alpha'
    if (!used.has('\\beta')) return '\\beta'
    return nextAutoName(usedNames)
  }, [usedNames])
  const nameCheck = useMemo(() => checkName(nameDraft, usedNames), [nameDraft, usedNames])

  const n = omega.kind === 'count' ? omega.n : omega.kind === 'set' ? omega.n : 0

  const check = useMemo<Check>(() => {
    if (!G) return { state: 'bad', error: '作用的作用群必须是群' }
    if (omega.kind === 'empty') return { state: 'empty', message: '先填作用点集：一个点数（如 4），或一个点集表达式（如 pointSet(5) / Syl(G, 3) / labeledSet(a, b, c)）' }
    if (omega.kind === 'bad') return { state: 'bad', error: omega.error, hint: omega.hint }
    if (omega.n < 1) return { state: 'empty', message: '点数得是正整数' }
    const filled = gens.filter((g) => (images[g.gen.name] ?? '').trim())
    if (filled.length === 0) {
      // 点集有名字的点时，示例就用**它的标号**（写 `(a b)` 比写 `(1 2)` 更贴屏幕）
      const sample = omega.kind === 'set' ? sampleCycle(omega.labels) : '(1 2 3 4)'
      return {
        state: 'empty',
        message: `${gens.length} 个生成元待填，写循环记号如 ${sample}；恒等写 ${IDENTITY_TOKEN}`,
      }
    }
    const plan = planCustomAction(
      G,
      omega.kind === 'set' ? omega.spec : omega.n,
      gens.map((g) => ({ genText: g.gen.name, cycle: images[g.gen.name] ?? '' })),
    )
    if (!plan.ok) return { state: 'bad', error: plan.error, hint: plan.hint, genName: plan.genName }
    return {
      state: 'ok',
      faithful: plan.faithful,
      orbitSizes: plan.orbitSizes,
      kernelSize: plan.kernelIds.length,
    }
  }, [G, gens, images, omega])

  const canSubmit = check.state === 'ok' && !nameCheck.error

  /** 把一组「生成元 → 循环记号」写进输入框（两个按钮共用）。 */
  const fill = (next: Record<string, string>, note: string, nextOmega?: number) => {
    if (nextOmega !== undefined) setOmegaDraft(String(nextOmega))
    setImages(next)
    setAutoNote(note)
  }

  /** 平凡作用：每个生成元都映成恒等。必然是同态 —— 与 `MapBuilder` 的平凡映射同款"起点"。 */
  const fillTrivial = () => {
    fill(Object.fromEntries(gens.map((g) => [g.gen.name, IDENTITY_TOKEN])), '平凡作用（全映成恒等）')
  }

  /**
   * 左正则作用：Ω 设成 `|G|` 个点，每个生成元按**左乘**给出的置换填。
   * 这是对每个群都有定义、且**必然忠实**（Cayley 定理）的起点 ——
   * 用户在这个基础上改一两项，比自己从空白开始想一个合法置换快。
   *
   * Ω 会被**改回点数形态**（左乘的置换是按 |G| 个位置的编号给的，
   * 挂到别的点集上只会对不上号）。
   */
  const fillRegular = () => {
    if (!G) return
    const perms = computeLeftTranslationPerms(G)
    const next: Record<string, string> = {}
    for (const g of gens) {
      const p = perms.get(g.el.id)
      if (p) next[g.gen.name] = cycleNotation(p)
    }
    fill(next, '左正则作用（G 左乘在自己身上）', G.order)
  }

  const submit = () => {
    if (!canSubmit || !G) return
    const pairs = gens.map((g) => ({
      gen: g.gen.name,
      img: (images[g.gen.name] ?? '').trim(),
    }))
    // 第二参原样写回用户填的那一格：`4` / `pointSet(5)` / `labeledSet(a, b, c)` / 画布上某个集合的名字
    const expr = composeMapLine(op, [src.id, omegaDraft.trim()], pairs)
    onSubmit(`${normalizeName(nameDraft.trim()) || autoName} = ${expr}`)
  }

  if (!G) return null

  const regularTooBig = G.order > POINT_SET_MAX || G.order * G.order > CUSTOM_ACTION_CELL_CAP

  /**
   * Ω 那一格的读数（**纯文本面**：不写 LaTeX 命令，说"点"）。
   *
   * 带**点号**（U58）：Ω 的标号不是数字时（子群集正是这种），用户填像只能写
   * 位置号 `(1 3)` —— 那他必须能一眼看出"第 3 个点是谁"。从前这里只把标号排一列
   * 且不带编号，还把 `\langle 234\rangle` **原样贴进纯文本面**（LaTeX 泄漏）。
   * 现在是 `4 个点：1 <234> , 2 <123> , ...`（与 `labelsHint` 同款）。
   *
   * 标号恰好**就是点号**时（`pointSet(8)` 的标号是 `1..8`）只写一个 —— 写成
   * `1 1 , 2 2` 是纯噪音，那一档本来也不需要"对照"。
   */
  const omegaSummary =
    omega.kind === 'empty'
      ? '点数，或点集'
      : omega.kind === 'bad'
        ? '认不出来'
        : omega.kind === 'count'
          ? `${omega.n} 个点`
          : `${omega.n} 个点：${omega.labels
              .slice(0, 6)
              .map((l, i) => (l === String(i + 1) ? `${i + 1}` : `${i + 1} ${asciiSymbol(l)}`))
              .join(' , ')}${omega.labels.length > 6 ? ' ...' : ''}`

  return (
    <CardEditor
      variant="action"
      head={{
        chip: 'action',
        chipLabel: '作用',
        children: (
          <>
            <TexOrText text={src.label} />
            <span className="mb-arrow">作用在</span>
            <span>{n >= 1 ? `${n} 个点` : '点集'}</span>
          </>
        ),
      }}
      /*
       * hint 是**纯文本面**（按钮、title、状态行都在这儿）：不许出现
       * 希腊字母这类键盘打不出的字符（回归 `e2e/no-unicode-leak.mjs`）。
       * 所以这里一律用「点」说话：数学上就是 Ω，字面上不写它。
       */
      hint="一个作用就是一个同态 G 到置换群：先定作用点集，再填每个生成元把点映到哪。点集填一个点数，或一个点集表达式（点集 / 集合 / 子群集 / 底集）。"
      name={nameDraft}
      onNameChange={setNameDraft}
      namePlaceholder={autoName}
      onSubmit={submit}
      canSubmit={canSubmit}
      onCancel={onCancel}
      check={
        <div className={`mb-check ${check.state}`}>
          {check.state === 'empty' && (
            <span>
              {prettySymbol(G.symbol)} 作用在 {n >= 1 ? `${n} 个点上` : '点集上'}：{check.message}
              {autoNote ? ` -${autoNote}` : ''}
            </span>
          )}
          {check.state === 'bad' && (
            <>
              <span className="mb-bad-mark">x</span>
              <span>
                {check.error}
                {check.hint ? ` -${check.hint}` : ''}
              </span>
            </>
          )}
          {check.state === 'ok' && (
            <>
              <span className="mb-ok-mark">v</span>
              <span>
                是同态 - {check.orbitSizes.length === 1 && check.orbitSizes[0] === n ? '传递' : `${check.orbitSizes.length} 个轨道`} -
                {check.faithful ? ' 忠实' : ` 不忠实（核阶 ${check.kernelSize}）`}
                {autoNote ? `（${autoNote}）` : ''}
              </span>
            </>
          )}
        </div>
      }
    >
      <label className="ab-n">
        <span className="mb-gen">作用点集</span>
        <input
          className={omega.kind === 'bad' ? 'bad' : undefined}
          value={omegaDraft}
          onChange={(e) => setOmegaDraft(e.target.value)}
          placeholder="4"
          title="点数（如 4），或一个点集（pointSet(5) / labeledSet(a, b, c) / Syl(G, 3) / asSet(Syl(G, 3))）"
          spellCheck={false}
          autoComplete="off"
        />
        <span className="mb-to">{omegaSummary}</span>
        <span className="ab-ord">{prettySymbol(G.symbol)} 的阶是 {G.order}</span>
      </label>

      {/*
        画布上已有的集合做成**一键按钮**（U53）：不想打字就从这儿挑 ——
        `asSet(Syl_p(G))` 这种名字本来就长，而且挑过来的还自带对象引用
        （作用线直接连到那个集合节点，而不是再造一个）。
        只列 `set` / `elements`：**作用群 G 自己不列**（那是作用的起点不是舞台）。
        类名用 `ab-set-chip` 而不是 `mb-auto` —— 后者是「一键起点」那一排的类名，
        回归套件按它数按钮，混进来会让"两个按钮都在"那条断言读错。
      */}
      {canvasSets.length > 0 && (
        <div className="ab-sets">
          <span className="ab-sets-label">画布上的集合</span>
          {canvasSets.map((o) => (
            <button
              key={o.id}
              className={`ab-set-chip${omegaDraft.trim() === o.id ? ' on' : ''}`}
              onClick={() => setOmegaDraft(o.id)}
              title={`用 ${o.id} 当作用点集`}
            >
              {o.id}
            </button>
          ))}
        </div>
      )}

      <div className="mb-rows">
        {gens.map((g) => {
          const genOrder = elementOrder(G, g.el)
          const value = images[g.gen.name] ?? ''
          // 标红靠**结构化的 genName**（内核给的），不靠 `error.includes(名字)`：
          // `a` 这种单字母在中文句子里到处撞得上
          const bad = check.state === 'bad' && check.genName === g.gen.name
          return (
            <label key={g.gen.name} className="mb-row">
              <span className="mb-gen" data-gen={g.gen.name}>
                {prettySymbol(g.gen.name)}
              </span>
              <span className="mb-to">到</span>
              <input
                className={`cycle-input${bad ? ' bad' : ''}`}
                value={value}
                onChange={(e) => setImages((p) => ({ ...p, [g.gen.name]: e.target.value }))}
                placeholder="(1 2 3 4)"
                title={`循环记号；恒等写 ${IDENTITY_TOKEN}`}
                spellCheck={false}
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                }}
              />
              <span className="ab-ord" title="像的阶必须整除这个数">
                阶 {genOrder}
              </span>
            </label>
          )
        })}
        <div className="mb-row">
          <button className="mb-auto" onClick={fillTrivial} title="每个生成元都映成恒等（必然是同态）">
            平凡作用
          </button>
          <button
            className="mb-auto"
            onClick={fillRegular}
            disabled={regularTooBig}
            title={
              regularTooBig
                ? `${prettySymbol(G.symbol)} 是 ${G.order} 阶，左正则作用要 ${G.order} 个点，超出本地上限`
                : `把作用点集的点数设成 G 的阶，并按左乘填像（忠实，这就是 Cayley 定理）`
            }
          >
            左正则作用
          </button>
        </div>
      </div>
    </CardEditor>
  )
}
