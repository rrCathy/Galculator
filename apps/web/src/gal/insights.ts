import {
  computeQuotientGroup,
  detectIsomorphicGroup,
  factorizeOrder,
  type Group,
  type GroupElement,
  type Subgroup,
} from '@groupviz/core'
import { prettySymbol, superscript } from './pretty'
import type { GalMap } from './value'

/**
 * 结论层（U4）—— **"计算器"该说的话**。
 *
 * 这一层回答的不是"这个对象长什么样"（那是信息面板的分区干的），而是
 * **"所以呢？"**：
 *
 *   - 这个群**同构于**什么？（`S₄/V₄ ≅ S₃`——用户自己看不出来，工具能看出来）
 *   - 第一同构定理在这里**具体是什么**？（`S₄/ker f ≅ S₃`，两边阶都算出来对上）
 *
 * 用户的原话："我在信息面板翻来覆去没看到什么『同构于……』字样，
 * 那用户看什么呢，看记号吗"——这条就是为那句话做的。
 */

/* ── 同构识别 ─────────────────────────────────────────── */

/** 识别是枚举类的重活；同一个群（同符号同阶）只算一次 */
const isoCache = new Map<string, string | null>()

/**
 * 同构类的**别名**：core 用 `D_{3}` 表示三阶对称群，而教学语境里 `S_{3}` 更常见。
 * 两者是同一个群（D₃ ≅ S₃），识别结果按这个表归一。
 */
const ISO_ALIAS: Record<string, string> = {
  'D_{3}': 'S_{3}',
}

function normalizeSymbol(s: string): string {
  return s.replace(/\s+/g, '')
}

/**
 * 群的同构类标准符号（识别不出来返回 `null`）。
 *
 * 走 core 的 `detectIsomorphicGroup`：它按不变量匹配小群库，
 * 认出 `S_4/V_4 → D_{3}`（即 S₃）、`Q_8/Z → C_{2}^{2}` 这类，
 * 但对**超出识别范围**的群（阶太大 / 库外结构）会返回 null——不猜。
 */
export function identifyGroup(group: Group): string | null {
  const key = `${group.symbol}#${group.order}`
  const hit = isoCache.get(key)
  if (hit !== undefined) return hit
  let out: string | null = null
  try {
    const r = detectIsomorphicGroup(group) as unknown
    out = typeof r === 'string' && r.length > 0 ? (ISO_ALIAS[r] ?? r) : null
  } catch {
    out = null
  }
  isoCache.set(key, out)
  return out
}

/** 识别符号的纯文本形态（Unicode 近似，用于混排文本）。 */
export function isoText(iso: string): string {
  return prettySymbol(iso)
}

/* ── 结论 ─────────────────────────────────────────────── */

export interface Insight {
  /** 短标签：「同构」「第一同构定理」「阶」… */
  label: string
  /** TeX 主体（面板里用 KaTeX 渲染） */
  tex: string
  /** 纯文本主体（无障碍 / 降级用） */
  text: string
  /** 补充说明（纯文本，一行） */
  detail?: string
  /** `key` = 主要结论（醒目）；`note` = 附注（弱化） */
  tone: 'key' | 'note'
}

/** 群对象的结论：同构识别 + 阶的分解。 */
export function groupInsights(group: Group): Insight[] {
  const out: Insight[] = []

  // ① 同构于什么——**只在识别结果与它自己的符号不同时**说
  //（`G = S_4` 说"同构于 S₄"是废话；`S₄/V₄` 说"同构于 S₃"才是结论）
  const iso = identifyGroup(group)
  if (iso && normalizeSymbol(iso) !== normalizeSymbol(group.symbol)) {
    out.push({
      label: '同构',
      tone: 'key',
      tex: `${group.symbol} \\;\\cong\\; ${iso}`,
      text: `${prettySymbol(group.symbol)} ≅ ${prettySymbol(iso)}`,
      detail: '结构与它完全一样——只是产生方式不同',
    })
  }

  // ② 阶的分解：计算器该顺手给出的数论信息
  if (group.order > 1) {
    const fs = factorizeOrder(group.order)
    const tex = fs
      .map((f) => (f.exponent === 1 ? `${f.prime}` : `${f.prime}^{${f.exponent}}`))
      .join(' \\cdot ')
    const text = fs
      .map((f) => (f.exponent === 1 ? `${f.prime}` : `${f.prime}${superscript(f.exponent)}`))
      .join('·')
    out.push({
      label: '阶',
      tone: 'note',
      tex: `\\lvert G\\rvert = ${group.order} = ${tex}`,
      text: `|G| = ${group.order} = ${text}`,
      detail: fs.length > 1 ? '素因子分解（Sylow 分析的入口）' : '素数阶 → 循环群',
    })
  }

  return out
}

/** 映射对象的结论：**第一同构定理**。 */
export function mapInsights(map: GalMap): Insight[] {
  const out: Insight[] = []
  const G = map.domain
  const H = map.codomain
  const k = map.kernel?.length
  const im = map.image?.length
  if (k === undefined || im === undefined) return out

  // ① 第一同构定理本身（带数字核对）
  out.push({
    label: '第一同构定理',
    tone: 'key',
    tex: `${G.symbol}/\\ker f \\;\\cong\\; \\operatorname{im} f`,
    text: `${prettySymbol(G.symbol)}/ker f ≅ im f`,
    detail:
      `|G| / |ker| = ${G.order} / ${k} = ${G.order / k}` +
      `，|im| = ${im} —— 两边 ${G.order / k === im ? '相等 ✓' : '不等 ✗'}`,
  })

  // ② 具体到这个映射：商群同构于什么
  //    满射时最漂亮：G/ker f ≅ H（靶群），这正是用户自己看不出、工具该说出来的那句
  const Q = quotientByKernel(G, map.kernel ?? [])
  const qIso = Q ? identifyGroup(Q) : null
  if (map.isSurjective) {
    out.push({
      label: '具体结论',
      tone: 'key',
      tex: `${G.symbol}/\\ker f \\;\\cong\\; ${H.symbol}`,
      text: `${prettySymbol(G.symbol)}/ker f ≅ ${prettySymbol(H.symbol)}`,
      detail: `满射 → 商群与靶群同构${qIso ? `（识别为 ${prettySymbol(qIso)}）` : ''}`,
    })
  } else if (qIso) {
    out.push({
      label: '具体结论',
      tone: 'key',
      tex: `${G.symbol}/\\ker f \\;\\cong\\; ${qIso}`,
      text: `${prettySymbol(G.symbol)}/ker f ≅ ${prettySymbol(qIso)}`,
      detail: '商群被识别出来了（非满射，靶群更大）',
    })
  } else if (im > 0 && map.image) {
    out.push({
      label: '具体结论',
      tone: 'note',
      tex: `\\operatorname{im} f \\le ${H.symbol},\\quad \\lvert \\operatorname{im} f \\rvert = ${im}`,
      text: `im f ⊆ ${prettySymbol(H.symbol)}，|im f| = ${im}`,
      detail: '像落在靶群里；商群的同构类未识别出（超出本地识别范围）',
    })
  }

  return out
}

/** 商群 G/ker（核必正规，直接构造 `Subgroup`，不必去枚举正规子群比对）。 */
function quotientByKernel(G: Group, kernel: GroupElement[]): Group | null {
  if (kernel.length === 0) return null
  const sub: Subgroup = {
    elements: kernel,
    order: kernel.length,
    index: G.order / kernel.length,
    generators: [],
    isNormal: true,
  }
  try {
    return computeQuotientGroup(G, sub) ?? null
  } catch {
    return null
  }
}
