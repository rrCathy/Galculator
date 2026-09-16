import { useMemo, useState } from 'react'
import {
  extendFromGenerators,
  extractGeneratorMapping,
  autoBuildMapping,
  getGeneratorElements,
  getHomomorphismProperties,
  trivialMapping,
  verifyHomomorphism,
  type Group,
} from '@groupviz/core'
import { composeMapLine } from '../gal/compose'
import { checkName, nextAutoName } from '../gal/naming'
import { prettySymbol } from '../gal/pretty'
import { TexOrText } from './Tex'
import type { OpDef } from '../gal/ops'
import type { CanvasNode, GalObject } from '../gal/types'

/** 校验结果（编辑器底部那条状态行）。 */
type Check =
  | { state: 'empty' }
  | { state: 'bad'; error: string; hint?: string }
  | { state: 'ok'; kind: string; kernel: number; image: number }

/**
 * 映射构建器（U3 的对象编辑器）：**填生成元的像**。
 *
 * 同态由生成元的像唯一决定（若良定义），所以这张表单问的就是那几件事：
 * 每个生成元映到哪。填的过程中实时走 `extendFromGenerators` +
 * `verifyHomomorphism`——**边填边知道行不行、不行是坏在哪两个元素上**，
 * 而不是等确认后才报错。
 */
export function MapBuilder({
  op,
  src,
  tgt,
  objects,
  onSubmit,
  onCancel,
}: {
  op: OpDef
  src: CanvasNode
  tgt: CanvasNode
  objects: GalObject[]
  onSubmit: (line: string) => void
  onCancel: () => void
}) {
  const G = src.value.type === 'group' ? src.value.group : null
  const H = tgt.value.type === 'group' ? tgt.value.group : null

  const gens = useMemo(() => (G ? getGeneratorElements(G) : []), [G])
  const [images, setImages] = useState<Record<string, string>>({})
  const usedNames = useMemo(() => objects.map((o) => o.id), [objects])
  const [nameDraft, setNameDraft] = useState('')
  const [autoNote, setAutoNote] = useState<string | null>(null)

  const autoName = useMemo(() => nextAutoName(usedNames), [usedNames])
  const nameCheck = useMemo(() => checkName(nameDraft, usedNames), [nameDraft, usedNames])

  /** 每个生成元都填了像 → 试延拓并校验。 */
  const check = useMemo<Check>(() => {
    if (!G || !H) return { state: 'bad', error: '映射的两端必须是群' }
    const filled = gens.filter((g) => images[g.gen.name])
    if (filled.length === 0) return { state: 'empty' }
    if (filled.length < gens.length) {
      return { state: 'bad', error: `还有 ${gens.length - filled.length} 个生成元没填像` }
    }
    const gm = new Map(gens.map((g) => [g.el.id, images[g.gen.name]]))
    const full = extendFromGenerators(G, H, gm)
    if (!full) {
      return {
        state: 'bad',
        error: '这组像无法唯一延拓成映射',
        hint: `${src.label} 里成立的关系，到 ${tgt.label} 里不成立`,
      }
    }
    const res = verifyHomomorphism(G, H, full)
    if (!res.isHomomorphism) {
      const v = res.violation
      const label = (group: Group, id: string) =>
        group.elements.find((e) => e.id === id)?.label ?? id
      return {
        state: 'bad',
        error: v
          ? `f(${label(G, v.a)}·${label(G, v.b)}) ≠ f(${label(G, v.a)})·f(${label(G, v.b)})`
          : '这组像不构成同态',
        hint: v ? `左 = ${label(H, v.lhs)}；右 = ${label(H, v.rhs)}` : undefined,
      }
    }
    const props = getHomomorphismProperties(G, H, res)
    const kind = props.isIsomorphism
      ? '同构 ≅'
      : props.isInjective
        ? '单射（嵌入）'
        : props.isSurjective
          ? '满射'
          : '同态'
    return { state: 'ok', kind, kernel: props.kernelOrder, image: props.imageOrder }
  }, [G, H, gens, images, src.label, tgt.label])

  const canSubmit = check.state === 'ok' && !nameCheck.error

  const submit = () => {
    if (!canSubmit || !G || !H) return
    const pairs = gens.map((g) => ({
      gen: g.gen.name,
      img: H.elements.find((e) => e.id === images[g.gen.name])?.label ?? images[g.gen.name],
    }))
    const expr = composeMapLine(op, [src.id, tgt.id], pairs)
    onSubmit(`${nameDraft.trim() || autoName} = ${expr}`)
  }

  /**
   * 自动填充：让 core 猜一个同态，反推生成元的像。
   *
   * `autoBuildMapping` 只认它认得出来的几种（平凡 / 投影 / 商…），认不出会返回 null——
   * 那就退回**平凡映射**（全映到单位元）。它必然良定义、必然同态，作为"起点"永远成立，
   * 用户在这个基础上改一两项比自己从空白开始快。
   */
  const autofill = () => {
    if (!G || !H) return
    const auto = autoBuildMapping(G, H)
    // 这两个 Map 的 key 都是**生成元元素 id**（core 的约定）
    const full = auto?.map ?? trivialMapping(G, H)
    const gm = extractGeneratorMapping(G, full)
    const next: Record<string, string> = {}
    for (const g of gens) {
      const id = gm.get(g.el.id)
      if (id) next[g.gen.name] = id
    }
    setImages(next)
    setAutoNote(auto ? `core 认出：${auto.type}` : '用了平凡映射（全映到单位元）')
  }

  if (!G || !H) return null

  return (
    <div className="map-builder" onClick={(e) => e.stopPropagation()}>
      <div className="mb-head">
        <span className="chip chip-map">映射</span>
        <strong>f :</strong>
        <TexOrText text={src.label} />
        <span className="mb-arrow">→</span>
        <TexOrText text={tgt.label} />
        <button className="mb-x" onClick={onCancel} title="取消（Esc）">
          ×
        </button>
      </div>

      <div className="mb-hint">同态由生成元的像唯一决定——填每个生成元映到哪</div>

      <div className="mb-rows">
        {gens.map((g) => (
          <label key={g.gen.name} className="mb-row">
            <span className="mb-gen">{g.gen.name}</span>
            <span className="mb-to">↦</span>
            <select
              value={images[g.gen.name] ?? ''}
              onChange={(e) => setImages((p) => ({ ...p, [g.gen.name]: e.target.value }))}
            >
              <option value="">—</option>
              {H.elements.map((el) => (
                <option key={el.id} value={el.id}>
                  {el.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button className="mb-auto" onClick={autofill} title="让 core 猜一个同态">
          自动填充
        </button>
      </div>

      <div className={`mb-check ${check.state}`}>
        {check.state === 'empty' && (
          <span>
            {prettySymbol(G.symbol)} → {prettySymbol(H.symbol)}：{gens.length} 个生成元待填
            {autoNote ? ` · ${autoNote}` : ''}
          </span>
        )}
        {check.state === 'bad' && (
          <>
            <span className="mb-bad-mark">✗</span>
            <span>
              {check.error}
              {check.hint ? ` · ${check.hint}` : ''}
            </span>
          </>
        )}
        {check.state === 'ok' && (
          <>
            <span className="mb-ok-mark">✓</span>
            <span>
              {check.kind} · |ker| = {check.kernel} · |im| = {check.image}
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
