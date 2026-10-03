import {
  findAllNormalSubgroups,
  subgroupFromElementIds,
  subgroupSetKey,
  type Group,
  type GroupElement,
} from '@groupviz/core'
import { groupFingerprint } from './identity'
import { elementSemanticKey } from './semantic'
import { ENUM_LIMIT, hasCosetElements, isomorphicSubgroupsIn } from './embedding'

/**
 * 包含判定（U19 起）—— **"H 是不是 G 的子群"**，以及它在 G 里正不正规。
 *
 * 这个文件从前还带一个"关系层"（把 `H ≤ G`、`K = ker f`、`Q = G/N` 这些
 * **两个对象之间的话**罗列到信息面板上）。那段在 U44（2026-10-01）整块删掉了：
 * 用户原话「至于目前面板上的什么关系……说实话，我都不看」——
 * 关系在画布上已经画成箭头，面板里再抄一遍只是 wiki。留下的只有**计算**：
 * 判定逻辑被画布（`derive`）、拖拽连线（`interaction`）、集合运算（`ops`）
 * 共用，一条都不能少。
 *
 * ## 判定从哪来（两关，都不猜）
 *
 * **第一关 · 字面包含（元素集）** —— 元素 id 空间一致时走这条。
 * **第二关 · 嵌入** —— 元素 id 根本对不上时走这条：G 里**有没有与 H 同构的子群**。
 *   用户手打 `A_4` 与 `S_4` 两条独立定义，靠第二关发现 `A₄ ≤ S₄`。
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
 * 但它们是**两个对象**，说成"同一个群"是假话（指数 1 那一档属于第一关的语义，
 * 不能借第二关混进来）。
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
 * 报错语用它改口：`contains(C_11, C_2^7)`（|G| = 128 超枚举上限）该说"群太大，没枚举"，
 * 而不是"不是子群"——后者是假话。判据**只在守卫真的挡下时才为真**：
 * 阶不整除是**证明**了没有（拉格朗日），不算"未判定"。
 */
export function embeddingSearchBlocked(H: Group, G: Group): boolean {
  if (H.order < 1 || H.order >= G.order) return false
  if (G.order % H.order !== 0) return false
  if (hasCosetElements(H)) return true
  return G.order > ENUM_LIMIT
}
