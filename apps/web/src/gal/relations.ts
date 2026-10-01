import {
  findAllNormalSubgroups,
  subgroupFromElementIds,
  subgroupSetKey,
  type Group,
  type GroupElement,
} from '@groupviz/core'
import { prettySymbol } from './pretty'
import { groupFingerprint } from './identity'
import { elementSemanticKey } from './semantic'
import { ENUM_LIMIT, hasCosetElements, isomorphicSubgroupsIn } from './embedding'
import { toTex } from './tex'
import type { GalObject } from './types'
import type { GalValue } from './value'

/**
 * 关系层（U19）—— **"它在哪儿"**。
 *
 * 信息面板原来回答"这个对象长什么样"（分区）与"所以呢"（结论层），
 * 但**没有地方说关系**：`K ⊴ S₄`、`K ⊆ A₄`、`K = ker f`、`[G:K] = 6`
 * 这些"两个对象之间的事"全都无处安放（`docs/USABILITY.md` §2 的第 ② 条缺口）。
 *
 * ## 关系从哪来（只有两条路，都不猜）
 *
 * **① 来源决定的**（`node.sources` + `node.opId`）——系统自己记得这个对象是怎么造的：
 *   `ker f` 的核必是 `f` 的定义域的正规子群；`im f` 的像必落在靶群里；
 *   `Z(G)` / `N_G(H)` / `⟨S⟩` / `A ∩ B` 这些产物必是来源群的子群。
 *
 * **② 元素集包含**（严格判据，见 `containment`）——两个**各自独立建出来**的群之间，
 *   只要元素 id 空间一致且子集关系经 core 校验成立，就是真的包含。
 *   用户手打 `A_4` 与 `S_4` 两条独立定义，正是靠这条路发现 `A₄ ≤ S₄`。
 *
 * ## 顺手给的一层：派生（谁由我而来）
 *
 * 点画布上的箭头 `f` → 立刻看到 `K = ker f`、`im f` 在哪儿。这是"反向的来源"，
 * 对映射最有用（映射本身不占节点，只有一条边，看不到它长出了什么）。
 */

const ENUM_CAP = 144

/* ── 正规性：同群只算一次 ──────────────────────────────── */

const normalKeysCache = new Map<string, Set<string> | null>()

/**
 * 群 G 的全部正规子群的「集合键」。超枚举守卫 / 算不动 → `null`（= 不判定，不是"不正规"）。
 */
function normalKeys(G: Group): Set<string> | null {
  const key = groupFingerprint(G)
  const hit = normalKeysCache.get(key)
  if (hit !== undefined) return hit
  let out: Set<string> | null = null
  if (G.order > 1 && G.order <= ENUM_CAP) {
    try {
      out = new Set(findAllNormalSubgroups(G).map((n) => subgroupSetKey(n.elements.map((e) => e.id))))
    } catch {
      out = null
    }
  }
  normalKeysCache.set(key, out)
  return out
}

const containmentCache = new Map<string, Containment | null>()

export interface Containment {
  /** |H|（校验通过时它一定等于 H.order） */
  order: number
  /** 指数 [G:H] = |G| / |H| */
  index: number
  /** H ⊴ G？`null` = 判不了（超枚举守卫） */
  normal: boolean | null
}

/**
 * H 是不是 G 的子群 —— **两关**（第一关内部还分三步）：
 *
 *   **第一关 · 字面包含（元素集）** —— 两边元素 id 空间一致时走这条：
 *     ① H 的每个元素在 G 里都找得到（**对齐**：普通元素按 id、陪集元素按语义键）
 *     ② core 的 `subgroupFromElementIds(G, ids)` 认可（含单位元 + 乘法封闭）
 *     ③ 校验出来的子群阶 = |H|
 *
 *   **第二关 · 嵌入（U38）** —— 元素 id 根本对不上时走这条：G 里**有没有与 H
 *     同构的子群**（见 `embedding.ts`）。用户实测的标本：`S_4` 与 `V_4` 各自建造，
 *     前者元素是置换、后者是抽象记号 `e a b c`，第一关必然判不出来；但 S₄ 里确实
 *     有 4 个 Klein 子群 —— "V₄ 是 S₄ 的子群"这句话是**真的**，不该被说成"不是"。
 *
 * 为什么第一关必须这么严（实测）：`subgroupFromElementIds(D_4, ['e','a','b','c'])`
 * **不报错**——它把不认识的引用一丢了之，返回**平凡子群**。
 * 于是"id 子集 + core 校验"的朴素写法会得出 `V₄ ≤ D₄` 这种假结论
 * （V₄ 的 id 是 `e a b c`，D₄ 的 id 是 `r0…s3`，本不该有任何关系）。
 * 加第 ① ③ 两道关后，同一批测试群上只剩 `A₄ ≤ S₄` 一条——恰好是真的那条。
 *
 * 另一个理由：第一关只认元素、**不认符号**。符号相同的两个群（比如两处都写了 `S_4`）
 * 不会因为"名字一样"就被判成包含。
 *
 * 第 ① 关在 2026-09-29（第三同构那轮）升级成**语义对齐**：商群元素的 id 是
 * `qcoset-<i>`，**跨母群会撞号**（`(A₄/V₄)` 与 `(S₄/V₄)` 的第 i 个陪集不是同一个）——
 * 按 id 比会给出假的包含（"`S₄/A₄` 是 `S₄/V₄` 的子群：指数 3"这种），
 * 而真的包含（`A₄/V₄ ≤ S₄/V₄`）反而被判"不封闭"。对齐走 `semantic.ts` 的语义键：
 * **普通元素退化成 id 比对（行为与从前一致）**，陪集按成员集合比。
 *
 * ## 两条路的边界（U38 定的）
 *
 * 第二关**只认严格包含**（`|H| < |G|`）：两个各自造出来的同阶群互为同构，
 * 但它们是**两个对象**，说成"同一个群"是假话（`containment` 的指数 1 档在
 * 关系层被读成「同一」，那是第一关的语义，不能借第二关混进来）。
 */
export function containment(H: Group, G: Group): Containment | null {
  const key = `${groupFingerprint(H)}<-${groupFingerprint(G)}`
  const hit = containmentCache.get(key)
  if (hit !== undefined) return hit

  const out = literalContainment(H, G) ?? embeddingContainment(H, G)
  containmentCache.set(key, out)
  return out
}

/** 第一关：元素 id 空间对得上时的**字面包含**（行为与 U19 起完全一致）。 */
function literalContainment(H: Group, G: Group): Containment | null {
  if (H.order <= 0 || H.order > G.order) return null
  const byKey = new Map<string, GroupElement>()
  for (const e of G.elements) byKey.set(elementSemanticKey(e), e)
  const aligned = H.elements.map((e) => byKey.get(elementSemanticKey(e)))
  if (!aligned.every((x): x is GroupElement => !!x)) return null
  const sub = subgroupFromElementIds(
    G,
    aligned.map((e) => e.id),
  )
  if (!sub || sub.order !== H.order) return null
  const keys = normalKeys(G)
  return {
    order: sub.order,
    index: G.order / sub.order,
    normal: keys ? keys.has(subgroupSetKey(sub.elements.map((e) => e.id))) : null,
  }
}

/**
 * 第二关：**嵌入**（U38，2026-09-30）。
 *
 * 元素 id 对不上的两个独立群之间，问一句"G 里有没有与 H 同构的子群"。
 * 有，就是真的包含 —— 指数按阶算（`|G| / |H|`，与具体挑哪个嵌入无关）。
 *
 * 正规性要小心：H 是个**裸群对象**，没有指定嵌进 G 的哪个子群。所以
 *   · 候选**唯一** → 就用它的正规性；
 *   · 候选多个但**全同一态度** → 也照实说（S₄ 的 4 个 Klein 里只有 1 个正规 ⇒ 说不清）；
 *   · 态度不一致（`V_4` 在 `S_4` 里正是这种）→ **`null` = 未判定**。
 *     说"正规"或"非正规"都会是假话，`↪` 才是诚实的那条线。
 *
 * 三条守卫（任一不满足就**不搜**，退成 `null`）：
 *   · 非严格包含 / 阶不整除（拉格朗日）→ 数学上就没有，也不必搜；
 *   · **H 是陪集层的对象**（商群的元素）→ 跨"层级"不做嵌入判定（与 U30 的商运算边界同源）：
 *     陪集只有在**同一个陪集层**里谈包含才有意义（那走第一关的语义对齐）；
 *   · `|G| > ENUM_LIMIT` → 枚举不起（`embeddingSearchBlocked` 会让报错语改口说"未判定"）。
 *
 * **G 带陪集不挡路**（2026-09-30 修）：从前这里挡的是"**任一边**带陪集"，
 * 实测是**过宽** —— 用户报的 `C_3 ⊆ S_4/V_4`（G 是阶 6 的商群）被它拦下，
 * 还给出"阶 6 太大"的误导理由（阶 6 与"大"毫无关系）。实测商群完全算得动：
 * `subgroupStructureSymbol(S_4/V_4) = D_{3}`、`findAllSubgroups` 出 5 个子群、
 * `isomorphicSubgroupsIn` 真的找到那个 C₃ —— **G 是个真正的群，"找它的子群"天经地义**。
 */
function embeddingContainment(H: Group, G: Group): Containment | null {
  if (H.order < 1 || H.order >= G.order) return null
  if (G.order % H.order !== 0) return null
  if (hasCosetElements(H)) return null
  if (G.order > ENUM_LIMIT) return null
  const subs = isomorphicSubgroupsIn(G, { group: H, elements: H.elements })
  if (!subs || subs.length === 0) return null
  const all = subs.every((s) => s.isNormal)
  const any = subs.some((s) => s.isNormal)
  return {
    order: H.order,
    index: G.order / H.order,
    normal: all ? true : any ? null : false,
  }
}

/**
 * 「第二关**没搜成**」—— 守卫挡下了，所以 `containment` 返回 `null` 在这时
 * 只表示"**不知道**"，不能读成"不是子群"。
 *
 * 报错语用它改口：`包含(C_11, C_2^7)`（|G| = 128 超枚举上限）该说"群太大，没枚举"，
 * 而不是"不是子群"——后者是假话。判据**只在守卫真的挡下时才为真**：
 * 阶不整除是**证明**了没有（拉格朗日），不算"未判定"。
 */
export function embeddingSearchBlocked(H: Group, G: Group): boolean {
  if (H.order < 1 || H.order >= G.order) return false
  if (G.order % H.order !== 0) return false
  if (hasCosetElements(H)) return true
  return G.order > ENUM_LIMIT
}

/* ── 关系 ──────────────────────────────────────────────── */

export type RelationKind =
  /** K ≤ G */
  | 'subgroup'
  /** K ⊇ H（我包含谁） */
  | 'contains'
  /** K = H（元素完全相同——同一个子群，只是两种造法） */
  | 'equal'
  /** K = ker f */
  | 'kernel'
  /** K = im f */
  | 'image'
  /** Q = G/N */
  | 'quotient'
  /** 表里哪些对象以我为源 */
  | 'derived'

export const RELATION_LABEL: Record<RelationKind, string> = {
  subgroup: '子群',
  contains: '包含',
  equal: '同一',
  kernel: '核',
  image: '像',
  quotient: '商',
  derived: '派生',
}

export interface Relation {
  kind: RelationKind
  /** 对方对象的 id（`derived` 的溢出行为空串） */
  other: string
  /** 一句话（TeX） */
  tex: string
  /** 一句话（纯文本） */
  text: string
  /** 附注：正规 / 指数 / 记号对照 */
  detail?: string
}

/** 关系行的排序权重（越靠前越"是重点"）。 */
const KIND_ORDER: Record<RelationKind, number> = {
  kernel: 0,
  image: 1,
  quotient: 2,
  equal: 3,
  subgroup: 4,
  contains: 5,
  derived: 6,
}

/** 每一类最多列几条（面板高度有限，多了就不是"一眼看出"了）。 */
const CAPS: Record<RelationKind, number> = {
  kernel: 2,
  image: 2,
  quotient: 2,
  equal: 4,
  subgroup: 5,
  contains: 5,
  derived: 6,
}

const indexText = (hi: string, lo: string, h: number, g: number, i: number) =>
  `指数 [${hi}:${lo}] = ${g} / ${h} = ${i}`

/**
 * 焦点对象的全部关系。`table` 是当前对象表（画布上所有对象）。
 */
export function relationsFor(node: GalObject, table: GalObject[]): Relation[] {
  const out: Relation[] = []
  const seen = new Set<string>()
  /** 每类已放几条 + 被截掉几条 */
  const used: Record<string, number> = {}
  const dropped: Record<string, number> = {}

  const push = (r: Relation) => {
    const key = `${r.kind}#${r.other}`
    if (seen.has(key)) return
    const cap = CAPS[r.kind] ?? 99
    if ((used[r.kind] ?? 0) >= cap) {
      dropped[r.kind] = (dropped[r.kind] ?? 0) + 1
      return
    }
    seen.add(key)
    used[r.kind] = (used[r.kind] ?? 0) + 1
    out.push(r)
  }

  /** 已经被"核 / 像"行说过的群（避免再报一条平淡的 `≤`） */
  const superseded = new Set<string>()
  const byId = new Map(table.map((o) => [o.id, o]))

  if (node.value.type === 'group') {
    const K = node.value.group

    // ── ① 来源决定的关系 ──
    for (const sid of node.sources) {
      const src = byId.get(sid)
      if (!src) continue
      const sv: GalValue = src.value

      if (node.opId === 'kernel' && sv.type === 'map') {
        const G = sv.map.domain
        superseded.add(`${G.symbol}#${G.order}`)
        const c = containment(K, G)
        push({
          kind: 'kernel',
          other: src.id,
          tex: `${toTex(node.id)} = \\ker ${toTex(src.id)}`,
          text: `${node.id} = ker ${src.id}`,
          detail:
            `核必是定义域的正规子群：\\trianglelefteq ${prettySymbol(G.symbol)}` +
            (c ? ` \\cdot ${indexText(prettySymbol(G.symbol), node.id, K.order, G.order, c.index)}` : ''),
        })
        continue
      }

      if (node.opId === 'image' && sv.type === 'map') {
        const H = sv.map.codomain
        superseded.add(`${H.symbol}#${H.order}`)
        const c = containment(K, H)
        /**
         * `像` 现在有**两个形态**（U20）：`像(f)` 是整个像、`像(f, H)` 是子群的像。
         * 从前这里一律写 `= im f`，于是 `f(A₄)` 的面板会自称 `FA = im f` —— 名称对不上。
         * 判据：来源里有没有**群对象**（`像(f, H)` 的第二参）。
         */
        const hArg = node.sources.map((s) => byId.get(s)).find((o) => o?.value.type === 'group')
        push({
          kind: 'image',
          other: src.id,
          tex: hArg
            ? `${toTex(node.id)} = ${toTex(src.id)}(${toTex(hArg.id)})`
            : `${toTex(node.id)} = \\operatorname{im} ${toTex(src.id)}`,
          text: hArg ? `${node.id} = ${src.id}(${hArg.id})` : `${node.id} = im ${src.id}`,
          detail: hArg
            ? `${hArg.id} 在 ${src.id} 下的像，落在靶群 ${prettySymbol(H.symbol)} 里` +
              (c ? ` \\cdot ${indexText(prettySymbol(H.symbol), node.id, K.order, H.order, c.index)}` : '')
            : c
              ? `像落在靶群里 \\cdot ${indexText(prettySymbol(H.symbol), node.id, K.order, H.order, c.index)}`
              : `像落在靶群 ${prettySymbol(H.symbol)} 里`,
        })
        continue
      }

      // 来源是群 / 作用是群 → 提名一条"子群"，**判定仍走严格判据**
      const g: Group | null =
        sv.type === 'group' ? sv.group : sv.type === 'action' ? sv.action.group : null
      if (!g) continue
      const c = containment(K, g)
      if (!c) continue
      push(subgroupRow(node.id, K, src, g, c))
    }

    // ── ② 元素集包含（两个独立建出来的群之间也能发现）──
    for (const o of table) {
      if (o.id === node.id || o.value.type !== 'group') continue
      const G = o.value.group

      if (!superseded.has(`${G.symbol}#${G.order}`)) {
        const c = containment(K, G)
        if (c) push(subgroupRow(node.id, K, o, G, c))
      }

      // 反向：我包含谁。指数 1 是"同一个子群"，正向已经说成 `=` 了，别再说一遍
      const cBack = containment(G, K)
      if (cBack && cBack.index !== 1) {
        push({
          kind: 'contains',
          other: o.id,
          tex: `${toTex(o.id)} \\le ${toTex(node.id)}`,
          text: `${o.id} \\le ${node.id}`,
          detail:
            `${prettySymbol(G.symbol)} \\le ${prettySymbol(K.symbol)}` +
            ` \\cdot ${cBack.normal === true ? '\\trianglelefteq 正规' : cBack.normal === false ? '非正规' : '正规性未判定'}` +
            ` \\cdot ${indexText(node.id, o.id, G.order, K.order, cBack.index)}`,
        })
      }
    }
  }

  // ── ③ 派生：表里以我为源的对象 ──
  derivedRelations(node, table, push)

  const sorted = out.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
  for (const [kind, n] of Object.entries(dropped)) {
    sorted.push({
      kind: kind as RelationKind,
      other: '',
      tex: '',
      text: `...还有 ${n} 个同类关系`,
    })
  }
  return sorted
}

/**
 * 一条"K 与 G 的包含关系"。
 *
 * **指数 1 单列**：`[G:K] = 1` 意味着两边元素完全相同——那是**同一个群**，
 * 只是两种造法（实测：`ker f` 与 `闭包(G, (12)(34), (13)(24))` 都是 V₄，
 * 元素 id 一模一样；两个各自声明的 `C_6` 也一样，元素是同一批 `e0…e5`）。
 * 写成 `K ≤ B · 指数 1` 加 `B ≤ K · 指数 1` 会让人以为
 * 是两个互相包含的群；写成 `K = B · 元素完全相同` 才是用户想知道的。
 */
function subgroupRow(name: string, K: Group, src: GalObject, G: Group, c: Containment): Relation {
  const same = c.index === 1
  return {
    kind: same ? 'equal' : 'subgroup',
    other: src.id,
    tex: same
      ? `${toTex(name)} = ${toTex(src.id)}`
      : `${toTex(name)} \\le ${toTex(src.id)}`,
    text: same ? `${name} = ${src.id}` : `${name} \\le ${src.id}`,
    detail: same
      ? `${prettySymbol(K.symbol)} ---- 元素完全相同，就是同一个群（两种造法）`
      : `${prettySymbol(K.symbol)} \\le ${prettySymbol(G.symbol)}` +
        ` \\cdot ${c.normal === true ? '\\trianglelefteq 正规' : c.normal === false ? '非正规' : '正规性未判定'}` +
        ` \\cdot ${indexText(src.id, name, K.order, G.order, c.index)}`,
  }
}

/** 最多列几条派生（多了面板塞不下，剩下的只说个数）。 */
const DERIVED_CAP = 6

function derivedRelations(node: GalObject, table: GalObject[], push: (r: Relation) => void): void {
  // 商群：`Q = G/N` 是它的定义式，也是它唯一说得清的关系（元素是陪集，落不进任何群）
  if (node.value.type === 'group' && node.opId === 'quotient') {
    const [gn, nn] = node.sources
    if (gn && nn) {
      const G = table.find((o) => o.id === gn)
      const N = table.find((o) => o.id === nn)
      const g = G?.value.type === 'group' ? G.value.group : null
      const k = N?.value.type === 'group' ? N.value.group : null
      if (g && k) {
        // 分母是**自动翻译**来的（`D` 与 `G` 的元素表对不上，见 ops 的 `autoTranslatedSubgroup`）
        // 时，第一句换成分诊的说明 —— 不能再声称「D 自己 ⊴ G」，那句话在这里是不成立的。
        push({
          kind: 'quotient',
          other: gn,
          tex: `${toTex(node.id)} = ${toTex(gn)} / ${toTex(nn)}`,
          text: `${node.id} = ${gn} / ${nn}`,
          detail:
            (node.note ?? `N = ${nn} \\trianglelefteq ${gn}（商群良定义）`) +
            ` \\cdot|Q| = |G| / |N| = ${g.order} / ${k.order} = ${g.order / k.order}`,
        })
      }
    }
  }

  const kids = table.filter((o) => o.id !== node.id && o.sources.includes(node.id))
  for (const k of kids.slice(0, DERIVED_CAP)) {
    push({
      kind: 'derived',
      other: k.id,
      tex: `${toTex(k.id)} = ${toTex(k.def)}`,
      text: `${k.id} = ${k.def}`,
      detail: k.opId ? `由它算出（${k.opId}）` : undefined,
    })
  }
  if (kids.length > DERIVED_CAP) {
    push({
      kind: 'derived',
      other: '',
      tex: '',
      text: `...还有 ${kids.length - DERIVED_CAP} 个以它为源的对象`,
    })
  }
}
