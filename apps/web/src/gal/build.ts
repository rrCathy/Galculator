import { computeQuotientGroup, type Group, type Subgroup } from '@groupviz/core'
import { evalExpr } from './evalDef'
import { prettySymbol } from './pretty'
import type { GalObject } from './types'

export interface LineState {
  index: number
  raw: string
  name: string
  ok: boolean
  error?: string
  hint?: string
  object?: GalObject
}

/**
 * 把「已输入的定义行」重算成对象表。
 *
 * 对象表是 lines 的**纯函数**——改一行、删一行，整张画布自动重派生。
 * 每行按顺序求值，且只能引用**前面**已定义的名字（`byId` 逐步累积）。
 */
export function buildLines(lines: string[]): {
  lineStates: LineState[]
  objects: GalObject[]
} {
  const objects: GalObject[] = []
  const byId = new Map<string, GalObject>()
  const lineStates: LineState[] = []

  lines.forEach((raw, index) => {
    const eq = raw.indexOf('=')
    if (eq < 0) {
      lineStates.push({ index, raw, name: '', ok: false, error: '缺少「=」' })
      return
    }
    const name = raw.slice(0, eq).trim()
    const rhs = raw.slice(eq + 1).trim()
    if (!name) {
      lineStates.push({ index, raw, name: '', ok: false, error: '等号左侧缺少名字' })
      return
    }
    if (byId.has(name)) {
      lineStates.push({ index, raw, name, ok: false, error: `名字「${name}」重复定义` })
      return
    }

    const r = evalExpr(rhs, byId)
    if (!r.ok) {
      lineStates.push({ index, raw, name, ok: false, error: r.error, hint: r.hint })
      return
    }

    const object: GalObject = {
      id: name,
      origin: r.origin,
      label: r.label,
      sub: r.sub,
      def: rhs,
      sources: r.sources,
      value: r.value,
      opId: r.opId,
      recipe: r.recipe,
      note: r.note,
    }
    objects.push(object)
    byId.set(name, object)
    lineStates.push({ index, raw, name, ok: true, object })
  })

  const implicit = firstIsoObjects(objects)
  return { lineStates, objects: [...objects, ...implicit] }
}

/**
 * **第一同构定理的第三个顶点**：`G/ker φ`。
 *
 * 用户只画了一条 φ，但另外两条线（π 与 ≅）和它们的顶点是被 φ 决定的——
 * 由工具补出来。这正是"计算器"该做的事，用户的原话：
 * **"当我们给出 phi 这条线后，剩下两条能立马生成。"**
 *
 * 以**隐式对象**的形式追加：它上画布、能被选中看信息（含同构识别结论），
 * 但**不占定义行**、也不出现在对象/操作清单里——它是 φ 的伴生，
 * 想让它消失就删掉 φ。
 */
function firstIsoObjects(objects: GalObject[]): GalObject[] {
  const out: GalObject[] = []
  // 用户**自己建了 `K = ker(φ)`** 时不再自动补顶点：他正在手动走第一同构定理，
  // 再替他补一个商群顶点只会让画布上出现两个等价的群。
  const manualKernelMaps = new Set<string>()
  for (const o of objects) {
    if (o.opId === 'kernel') for (const src of o.sources) manualKernelMaps.add(src)
  }
  for (const o of objects) {
    if (o.value.type !== 'map') continue
    if (manualKernelMaps.has(o.id)) continue
    const m = o.value.map
    const ker = m.kernel
    // 平凡核（ker = 1 → 商群 ≅ G）或全群核（商群平凡）都不画：那是退化的情形
    if (!ker || ker.length === 0 || ker.length === m.domain.order) continue

    const sub: Subgroup = {
      elements: ker,
      order: ker.length,
      index: m.domain.order / ker.length,
      generators: [],
      isNormal: true,
    }
    let Q: Group | null = null
    try {
      Q = computeQuotientGroup(m.domain, sub) ?? null
    } catch {
      Q = null
    }
    if (!Q || Q.order === 1) continue

    out.push({
      id: `${o.id}/ker`,
      origin: 'derived',
      label: `${prettySymbol(m.domain.symbol)}/ker ${o.id}`,
      sub: `|G/ker| = ${Q.order}`,
      def: `${o.id}/ker`,
      sources: [o.id],
      value: { type: 'group', group: Q },
      opId: 'firstIso',
      recipe: '第一同构定理：G/ker φ ≅ im φ',
    })
  }
  return out
}
