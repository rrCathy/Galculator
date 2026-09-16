import { evalExpr } from './evalDef'
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

  return { lineStates, objects }
}
