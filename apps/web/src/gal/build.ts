import {
  buildSubgroupGroup,
  computeQuotientGroup,
  subgroupStructureSymbol,
  type Group,
  type Subgroup,
} from '@groupviz/core'
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
 * **第一同构定理补出来的两个顶点**：`G/ker φ` 与 `im φ`。
 *
 * 用户只画了一条 φ，但其余顶点和边都被 φ 决定了——由工具补出来。
 * 这正是"计算器"该做的事，用户的原话：
 * **"当我们给出 phi 这条线后，剩下两条能立马生成。"**
 *
 * 以**隐式对象**的形式追加：它上画布、能被选中看信息（含同构识别结论），
 * 但**不占定义行**、也不出现在对象/操作清单里——它是 φ 的伴生，
 * 想让它消失就删掉 φ。
 *
 * | 情形 | 补 `G/ker φ` | 补 `im φ` | 图长什么样 |
 * |---|---|---|---|
 * | 满射 | ✓ | ✗（`im φ = H`，靶群顶点已在）| 三角形 |
 * | 非满射 | ✓ | ✓（像真落在靶群内部）| **正方形** |
 */
function firstIsoObjects(objects: GalObject[]): GalObject[] {
  const out: GalObject[] = []
  // 用户**自己建了** `K = ker(φ)` / `I = im(φ)` 时不再自动补该顶点：
  // 他正在手动走第一同构定理，再替他补一个等价的对象只会让画布上出现两份。
  const manualKernelMaps = new Set<string>()
  const manualImageMaps = new Set<string>()
  for (const o of objects) {
    if (o.opId === 'kernel') for (const src of o.sources) manualKernelMaps.add(src)
    if (o.opId === 'image') for (const src of o.sources) manualImageMaps.add(src)
  }
  for (const o of objects) {
    if (o.value.type !== 'map') continue
    const m = o.value.map
    // 用户**自己建了** `K = ker(φ)` 或 `I = im(φ)` 时，整条故事线交还给他 ——
    // 两个顶点都不补。理由：他正在手动走第一同构定理，替他补另一个顶点
    // 只会得到"半边自动、半边手动"的拼图（画布上两份等价对象 / 悬空的像）。
    const manual = manualKernelMaps.has(o.id) || manualImageMaps.has(o.id)

    // ── 顶点 ②：商群 `G/ker φ` ─────────────────────────────
    //
    // 全群核（商群平凡）不画：那是退化的情形。**平凡核（单射）照画**——
    // `G/{e} ≅ im φ` 也是真结论，嵌入正是这种情形。
    const ker = m.kernel
    if (!manual && ker && ker.length > 0 && ker.length < m.domain.order) {
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
      if (Q && Q.order > 1) {
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
    }

    // ── 顶点 ③：像 `im φ` ─────────────────────────────────
    //
    // 满射时 `im φ = H` —— 靶群节点本来就在画布上，再补一个只是重复。
    // **非满射**时像真落在 H 内部，它是个独立的顶点：不补出来，
    // 正方形的右下角就是空的（第一同构定理只能画成三角形）。
    // `im.length > 1` 顺带排掉"像平凡"（那等价于全群核，商群也平凡，整条退化）。
    const im = m.image ?? []
    if (!manual && im.length > 1 && im.length < m.codomain.order) {
      const symbol = subgroupStructureSymbol(
        m.codomain,
        im.map((e) => e.id),
      )
      out.push({
        id: `${o.id}/im`,
        origin: 'derived',
        label: `im ${o.id}`,
        sub: `|im| = ${im.length}`,
        def: `im(${o.id})`,
        sources: [o.id],
        value: {
          type: 'group',
          group: buildSubgroupGroup(m.codomain, im, symbol ?? `im ${o.id}`),
        },
        opId: 'firstIsoImage',
        recipe: '第一同构定理：G/ker φ ≅ im φ',
      })
    }
  }
  return out
}
