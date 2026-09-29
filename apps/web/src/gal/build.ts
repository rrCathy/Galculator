import {
  buildSubgroupGroup,
  computeQuotientGroup,
  subgroupStructureSymbol,
  type Group,
  type Subgroup,
} from '@groupviz/core'
import { evalExpr, looksLikeRelation } from './evalDef'
import { checkName, normalizeName } from './naming'
import { prettySymbol } from './pretty'
import { rememberParent } from './parents'
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
 *
 * `opts.autoFirstIso`（缺口 ⑭，**默认开**）：定义同态后要不要**自动补**
 * 第一同构定理的两个顶点（`G/ker φ` 与 `im φ`）。
 *   · 默认开，是因为**证明模板依赖它**：M2 的模板只写 `φ` 那一行，
 *     正方形剩下两个顶点与三条边都由它铺出来（见 proof.ts 顶部那段说明）；
 *   · 手工搭图的人**可以关掉** —— 用户实测的原话是"自动构图第一同构定理，
 *     其实没什么必要（或者说可以放开）"。开关在画布右下工具条上。
 */
export function buildLines(
  lines: string[],
  opts: { autoFirstIso?: boolean } = {},
): {
  lineStates: LineState[]
  objects: GalObject[]
} {
  const objects: GalObject[] = []
  const byId = new Map<string, GalObject>()
  const lineStates: LineState[] = []

  lines.forEach((raw, index) => {
    const eq = raw.indexOf('=')
    if (eq < 0) {
      /**
       * 这行**写的是一个关系**（`H ⊆ G` / `N ⊴ G` / `A ≅ B`）而不是定义。
       *
       * 光说"缺少「=」"会让人以为自己漏了符号。两者必须分开说。
       * 提示里要**说清哪几条关系现在能写**（`⊆` 从 U20 起可以），
       * 否则跟"没有对应操作"这句老话一样，把已经做出来的东西也说没了。
       */
      const rel = looksLikeRelation(raw)
      lineStates.push({
        index,
        raw,
        name: '',
        ok: false,
        error: rel ? '这行写的是一个关系，不是定义' : '缺少「=」',
        hint: rel
          ? '关系可以声明：包含写成 `R = A \\subseteq B`，同构写成 `R = A \\cong B`'
          : undefined,
      })
      return
    }
    /**
     * 名字在这一层过一道关：`normalizeName`（只 trim）+ `checkName`（体检）。
     *
     * **必须放在造对象的最窄关口**（而不是只在前端入口）：入口有三个
     *（输入框 / 映射编辑器 / `buildLines`），各自校验总会漏一个 —— 而"漏掉的
     * 那个"正是 U23 那类 bug 的产地（建得到、引不到）。放在这里，后面的 id、
     * 重复检查、引用查找就全链条一致。
     */
    const name = normalizeName(raw.slice(0, eq).trim())
    const rhs = raw.slice(eq + 1).trim()
    if (!name) {
      lineStates.push({ index, raw, name: '', ok: false, error: '等号左侧缺少名字' })
      return
    }
    if (byId.has(name)) {
      lineStates.push({ index, raw, name, ok: false, error: `名字「${name}」重复定义` })
      return
    }
    // 名字体检：键盘打不出来的字符在这里**也**要拦（与输入框同一套判据）。
    // 从前只在前端拦，于是 `buildLines(['φ = C_6'])` 能绕过去建出一个
    // 用户**敲不回来**的对象（名字是 φ，展示/复制的却是别的形态）。
    const chk = checkName(name, byId.keys())
    if (!chk.ok) {
      lineStates.push({ index, raw, name, ok: false, error: chk.error, hint: chk.hint })
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
      callKey: r.callKey,
    }
    objects.push(object)
    byId.set(name, object)
    lineStates.push({ index, raw, name, ok: true, object })
  })

  const implicit = opts.autoFirstIso === false ? [] : firstIsoObjects(objects)
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
          recipe: '第一同构定理：G/ker \\varphi \\cong im \\varphi',
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
          // 记母群指针（`im φ` 是靶群里的子群）——集合运算 / 上下文群推断靠它
          group: rememberParent(buildSubgroupGroup(m.codomain, im, symbol ?? `im ${o.id}`), m.codomain),
        },
        opId: 'firstIsoImage',
        recipe: '第一同构定理：G/ker \\varphi \\cong im \\varphi',
      })
    }
  }
  return out
}
