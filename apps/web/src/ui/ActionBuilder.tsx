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
  planCustomAction,
  type GenImageDraft,
} from '../gal/customAction'
// 「已知群」（U48）：只有符号 + 阶、没有元素表与生成元表 —— 做不了「填生成元的像」
import { isKnownGroup } from '../gal/known'
import { checkName, nextAutoName, normalizeName } from '../gal/naming'
import { prettySymbol } from '../gal/pretty'
import type { OpDef } from '../gal/ops'
import type { CanvasNode, GalObject } from '../gal/types'
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
  onSubmit: (line: string) => void
  onCancel: () => void
}

/**
 * 作用编辑器（U52）：**填每个生成元在 Ω 上的置换**。
 *
 * 一个作用就是一个同态 `φ : G -> S_Ω`，而 `S_Ω` 的元素本身就是 Ω 上的置换。
 * 所以这张表单只问两件事：Ω 有几个点、每个生成元映到哪个置换 ——
 * 与「映射构建器」（`MapBuilder`）是同一个形状，只是靶群不用建出来。
 *
 * 输入形态是**循环记号文本**（`(1 2 3 4)` / `(12)(34)`）。选它的理由：
 * ① 与显示形态一致 —— 屏幕上写着 `(1 2 3 4)`，用户就能照着敲回来；
 * ② `n` 不受任何群的构造上限约束（换成"靶群取 S_n"就要 S_n 建得出来才行）；
 * ③ core 的 `parseCycleNotation` 现成，宽容接受 `(234)` / `(12)(34)` / `(1,2)(3,4)`。
 *
 * ⚠️ **core 没有恒等的写法**（`()` / `(1)` / `1` 全回 null）—— 恒等写 `e`，
 * 由内核那层认（见 `customAction.ts` 的 `IDENTITY_TOKEN`）。两个按钮
 * （平凡 / 左正则）就是把 `e` 与左乘的循环记号**写进输入框**给用户看见，
 * 不搞"留空就是恒等"那种静默默认。
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
        {generatorCollisionReason(g)}，没法给它们分别指定像。想让 G 作用在自己身上用「正则作用」，
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

function ActionBuilderEditor({ op, src, objects, onSubmit, onCancel }: ActionBuilderProps) {
  const G = src.value.type === 'group' ? src.value.group : null
  const gens = useMemo(() => (G ? getGeneratorElements(G) : []), [G])

  /*
   * n 的初值：小群按**正则作用**（G 作用在自己的 |G| 个元素上）起步最自然，
   * 那也正是「G ↷ G」这个记号最常指的东西；大群给小舞台（4 个点），
   * 免得一打开就顶到预算线（|G| x n）。
   */
  const [nDraft, setNDraft] = useState(() => (G && G.order <= 12 ? String(G.order) : '4'))
  const [images, setImages] = useState<Record<string, string>>({})
  const [nameDraft, setNameDraft] = useState('')
  const [autoNote, setAutoNote] = useState<string | null>(null)

  const usedNames = useMemo(() => objects.map((o) => o.id), [objects])
  /** 作用的默认名：**优先希腊字母**（α / β）—— `\alpha : G \to S_\Omega` 是课本写法 */
  const autoName = useMemo(() => {
    const used = new Set(usedNames.map((n) => n.toLowerCase()))
    if (!used.has('\\alpha')) return '\\alpha'
    if (!used.has('\\beta')) return '\\beta'
    return nextAutoName(usedNames)
  }, [usedNames])
  const nameCheck = useMemo(() => checkName(nameDraft, usedNames), [nameDraft, usedNames])

  const n = Number(nDraft.trim())

  const check = useMemo<Check>(() => {
    if (!G) return { state: 'bad', error: '作用的作用群必须是群' }
    if (!nDraft.trim() || !Number.isInteger(n) || n < 1) {
      return { state: 'empty', message: '先填点数 n（正整数）' }
    }
    const filled = gens.filter((g) => (images[g.gen.name] ?? '').trim())
    if (filled.length === 0) {
      return {
        state: 'empty',
        message: `${gens.length} 个生成元待填，写循环记号如 (1 2 3 4)；恒等写 ${IDENTITY_TOKEN}`,
      }
    }
    const plan = planCustomAction(
      G,
      n,
      gens.map((g) => ({ genText: g.gen.name, cycle: images[g.gen.name] ?? '' })),
    )
    if (!plan.ok) return { state: 'bad', error: plan.error, hint: plan.hint, genName: plan.genName }
    return {
      state: 'ok',
      faithful: plan.faithful,
      orbitSizes: plan.orbitSizes,
      kernelSize: plan.kernelIds.length,
    }
  }, [G, gens, images, n, nDraft])

  const canSubmit = check.state === 'ok' && !nameCheck.error

  /** 把一组「生成元 → 循环记号」写进输入框（两个按钮共用）。 */
  const fill = (next: Record<string, string>, note: string, nextN?: number) => {
    if (nextN !== undefined) setNDraft(String(nextN))
    setImages(next)
    setAutoNote(note)
  }

  /** 平凡作用：每个生成元都映成恒等。必然是同态 —— 与 `MapBuilder` 的平凡映射同款"起点"。 */
  const fillTrivial = () => {
    fill(Object.fromEntries(gens.map((g) => [g.gen.name, IDENTITY_TOKEN])), '平凡作用（全映成恒等）')
  }

  /**
   * 左正则作用：`n` 设成 `|G|`，每个生成元按**左乘**给出的置换填。
   * 这是对每个群都有定义、且**必然忠实**（Cayley 定理）的起点 ——
   * 用户在这个基础上改一两项，比自己从空白开始想一个合法置换快。
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
    const expr = composeMapLine(op, [src.id, String(n)], pairs)
    onSubmit(`${normalizeName(nameDraft.trim()) || autoName} = ${expr}`)
  }

  if (!G) return null

  const regularTooBig = G.order > 400 || G.order * G.order > CUSTOM_ACTION_CELL_CAP

  return (
    <div className="map-builder action-builder" onClick={(e) => e.stopPropagation()}>
      <div className="mb-head">
        <span className="chip chip-action">作用</span>
        <TexOrText text={src.label} />
        <span className="mb-arrow">作用在</span>
        <span>{n >= 1 ? `${n} 个点` : 'n 个点'}</span>
        <button className="mb-x" onClick={onCancel} title="取消（Esc）">
          x
        </button>
      </div>

      {/*
        这块是**纯文本面**（按钮、title、状态行都在这儿）：不许出现
        希腊字母这类键盘打不出的字符（回归 `e2e/no-unicode-leak.mjs`）。
        所以这里一律用「点」说话：数学上就是 Ω，字面上不写它。
      */}
      <div className="mb-hint">
        一个作用就是一个同态 G 到置换群：填每个生成元把点映到哪。点号就是 1 到 n。
      </div>

      <label className="ab-n">
        <span className="mb-gen">n</span>
        <input
          className={nDraft.trim() && (!Number.isInteger(n) || n < 1) ? 'bad' : undefined}
          value={nDraft}
          onChange={(e) => setNDraft(e.target.value)}
          placeholder="4"
          title="作用在几个点上（点数）"
          spellCheck={false}
          autoComplete="off"
        />
        <span className="mb-to">个点</span>
        <span className="ab-ord">{prettySymbol(G.symbol)} 的阶是 {G.order}</span>
      </label>

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
                : '把 n 设成 G 的阶，并按左乘填像（忠实，这就是 Cayley 定理）'
            }
          >
            左正则作用
          </button>
        </div>
      </div>

      <div className={`mb-check ${check.state}`}>
        {check.state === 'empty' && (
          <span>
            {prettySymbol(G.symbol)} 在 {n >= 1 ? n : 'n'} 个点上：{check.message}
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

      <div className="mb-foot">
        <input
          className="mb-name"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          placeholder={autoName}
          title={`留空则命名为「${autoName}」`}
          spellCheck={false}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <button className="mb-btn" onClick={onCancel}>
          取消
        </button>
        <button className="mb-btn primary" onClick={submit} disabled={!canSubmit}>
          确认
        </button>
      </div>
    </div>
  )
}
