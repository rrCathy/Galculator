import { createGroupFromSymbol, parseGroupNotation, type Group, type GroupElement } from '@groupviz/core'

/**
 * **已知结论层**（U48）—— 把课本上的闭式结论先查表，再谈计算。
 *
 * ## 为什么要这一层
 *
 * 2026-10-01 用户报：「我输入 `Aut(S6)`，敲完 6，网站直接卡死了」。U47 把死机换成了
 * 预算守卫（当场说"搜不动"），但用户不接受这个答案 —— **一个群论计算器，S₆ 这种
 * 课本第一课的群，不该"算不动"**。`Aut(S₆) = 1440` 在课本上是**背下来的**结论
 * （`2·6!`，`S₆` 是 `n!` 公式唯一的例外），不是拿来现场搜索的。
 *
 * ## 两级（用户 2026-10-01 拍板）
 *
 * - **能构造就构造**：结论给出一个本地建得出来的记号（`Aut(S_4) ≅ S_4`）→ 返回真群。
 * - **构造不了退成「已知群」**：只有阶与结构（`|Aut(S₆)| = 1440`）→ 返回一个
 *   **没有元素表**的群节点（`isKnownGroup` 为真），面板披露来源、下游元素级运算明说不能算。
 *
 * ## 判据从哪来（不是记忆，是核对过的）
 *
 * `.tmp-aut/verify-known.mjs` 逐族与引擎现算的 `createAutomorphismGroup` 对照过
 * **阶 + 元素阶分布 + 交换性**三项（20 个族全部一致）：
 *
 * | 族 | 公式 | 核对 |
 * |---|---|---|
 * | `C_n` | `\|Aut\| = φ(n)` | `C₁…C₁₂` 全对（含 `(Z/8)^× ≅ C₂×C₂` 这种非循环的）|
 * | `C_p^k` | `\|Aut\| = \|GL(k,p)\|` | `C₂²=6 · C₃²=48` |
 * | `D_n`(n≥3) | `\|Aut\| = n·φ(n)` | `D₃=6 · D₄=8 · D₅=20 · D₆=12` |
 * | `S_n`(n≠6) | `Aut ≅ S_n` | `S₃=6 · S₄=24` |
 * | `S_6` | `\|Aut\| = 2·6! = 1440` | 教科书（唯一例外，`Out(S₆) ≅ C₂`）|
 * | `A_n`(n≥4,n≠6) | `Aut ≅ S_n` | `A₃=2 · A₄=24` |
 * | `Q_8` / `V_4` | `24` / `6` | 实测 |
 *
 * ## 族识别是**双判据**：记号 + 阶
 *
 * 只看记号会串（`identity.ts` 里那条老账：`V_4` 与 `C_4` 的元素 id 都是 `e0 e1 e2 e3`）。
 * 所以每一族都拿 `G.order` 复核一遍：对不上就不认（返回 `null`，退回原来的计算路径）。
 * 复核通过的族，其结论对所有**同族同参**的群都成立 —— 包括从子群/商群摘出来的
 * （`ker f` 若真是 4 阶 Klein 群，符号会是 `C_{2}^{2}`、阶 4，照样命中）。
 *
 * ## 为什么每条结论有两份文案
 *
 * 项目铁律：**渲染面吃 LaTeX（`Tex`），纯文本面不吃**（状态行 / 列表副行 / `title`）。
 * 一条结论会同时出现在两处（结论区是 KaTeX、对象列表副行是纯文本），所以
 * `tex` 与 `plain` 都写、**不许只写一份**。`plain` 只放 ASCII + 中文
 * （`verify/e2e/no-unicode-leak.mjs` 会拦 `·` `×` `≅` 这些打不出来的字符）。
 */

/** 欧拉 φ */
function phi(n: number): number {
  if (n <= 0) return 0
  let r = n
  let m = n
  for (let p = 2; p * p <= m; p++) {
    if (m % p === 0) {
      while (m % p === 0) m /= p
      r -= r / p
    }
  }
  if (m > 1) r -= r / m
  return r
}

/** n!（n ≤ 18 之内安全） */
function factorial(n: number): number {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

function gcd(a: number, b: number): number {
  while (b) {
    const t = b
    b = a % b
    a = t
  }
  return a
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b
}

/** lcm(1..n) —— 对称群的指数 */
function expSymmetric(n: number): number {
  let r = 1
  for (let i = 2; i <= n; i++) r = lcm(r, i)
  return r
}

function isPrime(n: number): boolean {
  if (n < 2) return false
  for (let p = 2; p * p <= n; p++) if (n % p === 0) return false
  return true
}

/** |GL(k, p)| = ∏_{i<k} (p^k − p^i) */
function glOrder(k: number, p: number): number {
  let r = 1
  for (let i = 0; i < k; i++) r *= Math.pow(p, k) - Math.pow(p, i)
  return r
}

/* ── 结论的形状 ───────────────────────────────────────── */

/**
 * 一条"群类"结论。
 *
 * - `display`：符号（简化 LaTeX）
 * - `order`：阶
 * - `build`：**能本地构造**时的记号（过 `parseGroupNotation` → `createGroupFromSymbol`）；
 *   `null` = 只有结论、没有元素表 → 走「已知群」节点
 * - `tex`：一句结论（LaTeX，KaTeX 面用）
 * - `plain`：同一句的纯文本形态（ASCII + 中文）
 */
export interface KnownGroupSpec {
  display: string
  order: number
  build: string | null
  tex: string
  plain: string
}

export type KnownFamily =
  | 'cyclic'
  | 'elementaryAbelian'
  | 'dihedral'
  | 'symmetric'
  | 'alternating'
  | 'quaternion'
  | 'klein'

export interface KnownFacts {
  family: KnownFamily
  /** 族参数（`n` / `p` / `k`），供面板显示 */
  params: Record<string, number>
  /** 这个族凭什么能用闭式（一句话，含"哪个例外"） */
  source: string
  aut?: KnownGroupSpec
  center?: KnownGroupSpec
  inn?: KnownGroupSpec
  commutator?: KnownGroupSpec
  /** |Out(G)| = |Aut| / |Inn|；只有数值，没有群 */
  outOrder?: number
  isSimple?: boolean
  exponent?: number
}

const spec = (
  display: string,
  order: number,
  build: string | null,
  tex: string,
  plain: string,
): KnownGroupSpec => ({ display, order, build, tex, plain })

/* ── 已知群（没有元素表的群）──────────────────────────── */

const KNOWN = new WeakSet<Group>()
const KNOWN_INFO = new WeakMap<Group, KnownGroupSpec>()

/**
 * 造一个**没有元素表**的群对象（只带符号 + 阶）。
 *
 * 为什么敢造：`Group` 的 `elements` 允许为空数组，而 `order` / `symbol` 是真的。
 * 凡"会遍历元素"的路径都得先问 `isKnownGroup`（在 `evalDef.runOp` 一处拦下，
 * 信息面板的各节也各自拦），所以这个 stub 的 `multiply` 永远不该被调用 ——
 * 真被调用说明有漏网的入口，所以它**抛错而不是静默返回假值**。
 */
export function knownGroupOf(s: KnownGroupSpec): Group {
  const id: GroupElement = { id: '__known__', label: 'e', value: [] }
  const boom = (): never => {
    throw new Error('已知群没有元素表：这条结论只给了符号与阶')
  }
  const g: Group = {
    name: s.display,
    symbol: s.display,
    order: s.order,
    elements: [],
    generators: [],
    multiply: boom,
    inverse: boom,
    identity: id,
    isAbelian: false,
  }
  KNOWN.add(g)
  KNOWN_INFO.set(g, s)
  return g
}

/** 这个群是不是"只有结论、没有元素表"的已知群。 */
export function isKnownGroup(g: Group | null | undefined): boolean {
  return !!g && KNOWN.has(g)
}

/** 已知群的结论说明（不是已知群则为 null）。 */
export function knownGroupInfo(g: Group): KnownGroupSpec | null {
  return KNOWN_INFO.get(g) ?? null
}

/**
 * 把一条结论落成**真群或已知群**。
 *
 * `build` 能构造时优先真群（用户还能接着对它做运算）；构造失败（记号本地不支持 /
 * 建不出来）也退化成已知群 —— **永远不返回 null**：结论明明知道，却什么都不给，
 * 才是最难看的结果。
 *
 * 两条纪律：
 *
 *   ① **换名字**：构造出来的群叫 `Aut(S_5)`，不叫 `S_5` —— 它俩同构，但"是谁算出来的"
 *      要留着（否则结论区的 `Aut(S_5) ≅ S_5` 会退化成废话 `S_5 = S_5`）。
 *      `createGroupFromSymbol` 每次返回**新对象**（实测），所以改名字不会串到别处去。
 *   ② **两种都记 `KNOWN_INFO`**：真群也记 —— 面板据此说出「这条结论是什么、凭什么」，
 *      而 `KNOWN`（弱集）只收**没有元素表**的那种，那才是"不能当输入"的判据。
 */
export function realizeKnownGroup(s: KnownGroupSpec): Group {
  if (s.build) {
    const n = parseGroupNotation(s.build)
    const built = n.symbol ? createGroupFromSymbol(n.symbol) : null
    if (built) {
      const named: Group = { ...built, symbol: s.display }
      KNOWN_INFO.set(named, s)
      return named
    }
  }
  return knownGroupOf(s)
}

/* ── 族识别 ───────────────────────────────────────────── */

const norm = (s: string): string => s.replace(/\s+/g, '')

interface Rep {
  family: KnownFamily
  n: number
  p: number
  k: number
}

function classify(group: Group): Rep | null {
  const s = norm(group.symbol)
  const o = group.order
  let m: RegExpExecArray | null

  if ((m = /^C_\{(\d+)\}\^\{(\d+)\}$/.exec(s))) {
    const p = Number(m[1])
    const k = Number(m[2])
    // 只有**初等交换**才有 |Aut| = |GL(k,p)| —— 底数必须是素数
    if (isPrime(p) && Math.pow(p, k) === o) return { family: 'elementaryAbelian', n: 0, p, k }
    return null
  }
  if ((m = /^C_\{(\d+)\}$/.exec(s))) {
    const n = Number(m[1])
    return n === o ? { family: 'cyclic', n, p: 0, k: 0 } : null
  }
  if ((m = /^D_\{(\d+)\}$/.exec(s))) {
    const n = Number(m[1])
    return 2 * n === o && n >= 3 ? { family: 'dihedral', n, p: 0, k: 0 } : null
  }
  if ((m = /^S_\{(\d+)\}$/.exec(s))) {
    const n = Number(m[1])
    return n >= 3 && n <= 18 && factorial(n) === o ? { family: 'symmetric', n, p: 0, k: 0 } : null
  }
  if ((m = /^A_\{(\d+)\}$/.exec(s))) {
    const n = Number(m[1])
    return n >= 3 && n <= 18 && factorial(n) / 2 === o
      ? { family: 'alternating', n, p: 0, k: 0 }
      : null
  }
  if (s === 'Q_{8}' && o === 8) return { family: 'quaternion', n: 8, p: 2, k: 3 }
  if (s === 'V_{4}' && o === 4) return { family: 'klein', n: 4, p: 2, k: 2 }
  return null
}

/* ── 各族结论 ─────────────────────────────────────────── */

/**
 * `(Z/n)^×` 的记号（`Aut(C_n)` 就是这个群）。
 *
 * 中国剩余定理：`(Z/n)^× ≅ ∏ (Z/p^a)^×`，而
 *   - `p` 奇：`(Z/p^a)^× ≅ C_{p^{a-1}(p-1)}`
 *   - `p = 2`：`a=1` 平凡 · `a=2` `≅ C_2` · `a≥3` `≅ C_2 × C_{2^{a-2}}`
 *
 * 全是循环群的直积 → 一定写得成 `C_{m1}×C_{m2}×…`。太大就不构造（返回 null）。
 */
function unitGroupSymbol(n: number): string | null {
  if (n <= 2) return 'C_{1}'
  const parts: number[] = []
  let m = n
  for (let p = 2; p * p <= m; p++) {
    if (m % p !== 0) continue
    let a = 0
    while (m % p === 0) {
      m /= p
      a++
    }
    if (p === 2) {
      if (a === 2) parts.push(2)
      else if (a >= 3) {
        parts.push(2)
        parts.push(Math.pow(2, a - 2))
      }
    } else {
      parts.push(Math.pow(p, a - 1) * (p - 1))
    }
  }
  if (m > 1) parts.push(m - 1)
  const total = parts.reduce((x, y) => x * y, 1)
  if (total > 2000) return null
  if (parts.length === 0) return 'C_{1}'
  const byOrder = new Map<number, number>()
  for (const q of parts) byOrder.set(q, (byOrder.get(q) ?? 0) + 1)
  const terms: string[] = []
  for (const [q, cnt] of byOrder) terms.push(cnt === 1 ? `C_{${q}}` : `C_{${q}}^{${cnt}}`)
  return terms.join('\\times')
}

function cyclicFacts(n: number): KnownFacts {
  const order = phi(n)
  return {
    family: 'cyclic',
    params: { n },
    source: `循环群：Aut(C_n) 就是 (Z/n) 的单位群，阶为 phi(n) = ${order}`,
    aut: spec(
      `\\operatorname{Aut}(C_{${n}})`,
      order,
      unitGroupSymbol(n),
      `\\lvert \\operatorname{Aut}(C_{${n}}) \\rvert = \\varphi(${n}) = ${order}`,
      `|Aut(C_${n})| = phi(${n}) = ${order}`,
    ),
    center: spec(`C_{${n}}`, n, `C_{${n}}`, `Z(C_{${n}}) = C_{${n}}`, `可换群：Z 就是它自己，阶 ${n}`),
    inn: spec('C_{1}', 1, 'C_{1}', `\\operatorname{Inn}(C_{${n}}) = 1`, '可换群：内自同构只有恒等'),
    commutator: spec('C_{1}', 1, 'C_{1}', `[C_{${n}}, C_{${n}}] = 1`, '可换群：换位子群平凡'),
    outOrder: order,
    isSimple: isPrime(n),
    exponent: n,
  }
}

function elementaryAbelianFacts(p: number, k: number): KnownFacts {
  const order = Math.pow(p, k)
  const gl = glOrder(k, p)
  const autBuild = k === 2 && p <= 3 ? `GL(2,${p})` : null
  return {
    family: 'elementaryAbelian',
    params: { p, k },
    source: `初等交换 p-群：Aut(C_p^k) 同构于 GL(k,p)，阶 |GL(${k},${p})| = ${gl}`,
    aut: spec(
      `\\operatorname{Aut}(C_{${p}}^{${k}})`,
      gl,
      autBuild,
      `\\operatorname{Aut}(C_{${p}}^{${k}}) \\cong \\mathrm{GL}(${k},${p}),\\quad \\lvert \\cdot \\rvert = ${gl}`,
      `Aut(C_${p}^${k}) 同构于 GL(${k},${p})，阶 = ${gl}`,
    ),
    center: spec(`C_{${p}}^{${k}}`, order, `C_{${p}}^{${k}}`, `Z(G) = G`, `可换群：Z 就是它自己，阶 ${order}`),
    inn: spec('C_{1}', 1, 'C_{1}', `\\operatorname{Inn}(G) = 1`, '可换群：内自同构只有恒等'),
    commutator: spec('C_{1}', 1, 'C_{1}', `[G, G] = 1`, '可换群：换位子群平凡'),
    outOrder: gl,
    isSimple: false,
    exponent: p,
  }
}

function dihedralFacts(n: number): KnownFacts {
  const zen = n % 2 === 0 ? 2 : 1
  const innOrder = (2 * n) / zen
  const commOrder = n % 2 === 0 ? n / 2 : n
  const autOrder = n * phi(n)
  /*
   * `Aut(D_n) ≅ Hol(C_n)`（n 奇数时就是 `C_n ⋊ (Z/n)^×`）。这个群**本地没有记号**，
   * 所以默认退成已知群；只有 n = 3 / 4 / 6 恰好撞上能构造的常见群
   * （`S₃` / `D₄` / `D₆` —— 已与引擎现算结果核对同构）。
   */
  const autBuild = n === 3 ? 'S_{3}' : n === 4 ? 'D_{4}' : n === 6 ? 'D_{6}' : null
  const innBuild = n % 2 === 1 ? `D_{${n}}` : n / 2 >= 3 ? `D_{${n / 2}}` : n / 2 === 2 ? 'V_{4}' : null
  const innName = n % 2 === 1 ? `D_{${n}}` : n / 2 >= 3 ? `D_{${n / 2}}` : 'V_{4}'
  return {
    family: 'dihedral',
    params: { n },
    source: `二面体群：|Aut(D_n)| = n * phi(n) = ${autOrder}，Aut(D_n) 就是全形 Hol(C_n)`,
    aut: spec(
      `\\operatorname{Aut}(D_{${n}})`,
      autOrder,
      autBuild,
      `\\lvert \\operatorname{Aut}(D_{${n}}) \\rvert = ${n} \\cdot \\varphi(${n}) = ${autOrder}`,
      `|Aut(D_${n})| = ${n} * phi(${n}) = ${autOrder}（就是全形 Hol(C_${n})）`,
    ),
    center: spec(
      zen === 2 ? 'C_{2}' : 'C_{1}',
      zen,
      zen === 2 ? 'C_{2}' : 'C_{1}',
      zen === 2 ? `Z(D_{${n}}) \\cong C_{2}` : `Z(D_{${n}}) = 1`,
      n % 2 === 0 ? `n 为偶数：中心是阶 2 的那个正规子群` : `n 为奇数：中心平凡`,
    ),
    inn: spec(
      innName,
      innOrder,
      innBuild,
      `\\operatorname{Inn}(D_{${n}}) \\cong ${innName},\\quad \\lvert \\cdot \\rvert = ${innOrder}`,
      `Inn(D_${n}) 就是 ${innName}，阶 ${innOrder}`,
    ),
    commutator: spec(
      `C_{${commOrder}}`,
      commOrder,
      `C_{${commOrder}}`,
      `[D_{${n}}, D_{${n}}] \\cong C_{${commOrder}}`,
      `换位子群是旋转里的平方部分，阶 ${commOrder}`,
    ),
    outOrder: autOrder / innOrder,
    isSimple: false,
    exponent: lcm(n, 2),
  }
}

function symmetricFacts(n: number): KnownFacts {
  const ord = factorial(n)
  const exceptional = n === 6
  const autOrder = exceptional ? 2 * ord : ord
  const autBuild = exceptional ? null : n <= 5 ? `S_{${n}}` : null
  const buildable = n <= 6
  return {
    family: 'symmetric',
    params: { n },
    source: exceptional
      ? `S_6 是 n! 公式的唯一例外：|Aut(S_6)| = 2 * 6! = 1440`
      : `n 不等于 6 时 Aut(S_n) 就是 S_n 自己，阶 n!`,
    aut: spec(
      `\\operatorname{Aut}(S_{${n}})`,
      autOrder,
      autBuild,
      exceptional
        ? `\\lvert \\operatorname{Aut}(S_{6}) \\rvert = 2 \\cdot 6! = 1440 > \\lvert S_{6} \\rvert`
        : `\\operatorname{Aut}(S_{${n}}) \\cong S_{${n}},\\quad \\lvert \\cdot \\rvert = ${n}! = ${autOrder}`,
      exceptional
        ? `S_6 是唯一例外：|Aut(S_6)| = 2 * 6! = 1440，比 S_6 大一倍`
        : `Aut(S_${n}) 同构于 S_${n} 自己，阶 = ${n}! = ${autOrder}`,
    ),
    center: spec('C_{1}', 1, 'C_{1}', `Z(S_{${n}}) = 1`, `中心平凡（n >= 3）`),
    inn: spec(
      `S_{${n}}`,
      ord,
      buildable ? `S_{${n}}` : null,
      `\\operatorname{Inn}(S_{${n}}) \\cong S_{${n}},\\quad \\lvert \\cdot \\rvert = ${ord}`,
      `Inn(S_${n}) 就是 S_${n}，阶 ${ord}`,
    ),
    commutator: spec(
      `A_{${n}}`,
      ord / 2,
      buildable ? `A_{${n}}` : null,
      `[S_{${n}}, S_{${n}}] = A_{${n}},\\quad \\lvert \\cdot \\rvert = ${ord / 2}`,
      `换位子群就是 A_${n}，阶 ${ord / 2}`,
    ),
    outOrder: exceptional ? 2 : 1,
    isSimple: n === 2,
    exponent: expSymmetric(n),
  }
}

function alternatingFacts(n: number): KnownFacts {
  const ord = factorial(n) / 2
  let autOrder: number
  let autBuild: string | null
  if (n === 3) {
    autOrder = 2
    autBuild = 'C_{2}'
  } else if (n === 6) {
    // A_6 与 S_6 共享那个例外，但**大一倍**：Out(A_6) ≅ V_4（4 阶），
    // 不是 S_6 的 Out ≅ C_2（2 阶）⇒ |Aut(A_6)| = 4 · |A_6| = 4 · 360 = 1440。
    // （写成 2·ord 会得到 720，与它自己 source 文案里的 1440 打架。）
    autOrder = 4 * ord
    autBuild = null
  } else {
    autOrder = factorial(n)
    autBuild = n <= 5 ? `S_{${n}}` : null
  }
  /**
   * `Inn(A_n) ≅ A_n`（n ≥ 4 时中心平凡）；`n = 3` 是唯一的例外 —— `A_3 ≅ C_3` 可换，
   * **内自同构只有恒等**，于是 `Out(A_3) = Aut(A_3) ≅ C_2`（阶 2）。
   * 把 `n = 3` 也照 `ord` 报 Inn 会让 `outOrder = 2/3`（不是整数）。
   */
  const innOrder = n === 3 ? 1 : ord
  const buildable = n <= 6
  const commOrder = n === 3 ? 1 : n === 4 ? 4 : ord
  const commBuild = n === 3 ? 'C_{1}' : n === 4 ? 'V_{4}' : buildable ? `A_{${n}}` : null
  const commName = n === 3 ? 'C_{1}' : n === 4 ? 'V_{4}' : `A_{${n}}`
  return {
    family: 'alternating',
    params: { n },
    source:
      n === 6
        ? 'A_6 与 S_6 共享那个例外：|Aut(A_6)| = 1440，Out 是 C_2 * C_2'
        : `n >= 4 且 n 不等于 6 时 Aut(A_n) 就是 S_n，阶 n!`,
    aut: spec(
      `\\operatorname{Aut}(A_{${n}})`,
      autOrder,
      autBuild,
      n === 6
        ? `\\lvert \\operatorname{Aut}(A_{6}) \\rvert = 1440,\\quad \\operatorname{Out} \\cong C_{2} \\times C_{2}`
        : n === 3
          ? `A_{3} \\cong C_{3},\\quad \\lvert \\operatorname{Aut}(A_{3}) \\rvert = 2`
          : `\\operatorname{Aut}(A_{${n}}) \\cong S_{${n}},\\quad \\lvert \\cdot \\rvert = ${autOrder}`,
      n === 6
        ? `A_6 与 S_6 共享那个例外：|Aut(A_6)| = 1440，Out 是 C_2 * C_2`
        : n === 3
          ? `A_3 就是 C_3，|Aut| = 2`
          : `Aut(A_${n}) 同构于 S_${n}，阶 = ${n}! = ${autOrder}`,
    ),
    center: spec(
      n === 3 ? 'C_{3}' : 'C_{1}',
      n === 3 ? 3 : 1,
      n === 3 ? 'C_{3}' : 'C_{1}',
      n === 3 ? `A_{3} \\cong C_{3}` : `Z(A_{${n}}) = 1`,
      n === 3 ? 'A_3 就是 C_3，可换' : `中心平凡（n >= 4）`,
    ),
    inn: spec(
      n === 3 ? 'C_{1}' : `A_{${n}}`,
      innOrder,
      n === 3 ? 'C_{1}' : buildable ? `A_{${n}}` : null,
      n === 3
        ? `A_{3} \\cong C_{3} \\text{ 可换，}\\operatorname{Inn}(A_{3}) = 1`
        : `\\operatorname{Inn}(A_{${n}}) \\cong A_{${n}},\\quad \\lvert \\cdot \\rvert = ${ord}`,
      n === 3 ? 'A_3 就是 C_3，可换，内自同构只有恒等' : `Inn(A_${n}) 就是 A_${n}，阶 ${ord}`,
    ),
    commutator: spec(
      commName,
      commOrder,
      commBuild,
      n === 3
        ? `[A_{3}, A_{3}] = 1`
        : n === 4
          ? `[A_{4}, A_{4}] \\cong V_{4}`
          : `[A_{${n}}, A_{${n}}] = A_{${n}}`,
      n === 3
        ? 'A_3 可换，换位子群平凡'
        : n === 4
          ? 'A_4 的换位子群是 V_4，阶 4'
          : `A_${n} 是完美群：换位子群就是它自己，阶 ${commOrder}`,
    ),
    outOrder: autOrder / innOrder,
    isSimple: n === 3 || n >= 5,
  }
}

function quaternionFacts(): KnownFacts {
  return {
    family: 'quaternion',
    params: {},
    source: '四元数群：Aut(Q_8) 就是 S_4',
    aut: spec(
      '\\operatorname{Aut}(Q_{8})',
      24,
      'S_{4}',
      `\\operatorname{Aut}(Q_{8}) \\cong S_{4},\\quad \\lvert \\cdot \\rvert = 24`,
      'Aut(Q_8) 同构于 S_4，阶 24',
    ),
    center: spec('C_{2}', 2, 'C_{2}', `Z(Q_{8}) = \\{\\pm 1\\}`, '中心是 {1, -1}，阶 2'),
    inn: spec('V_{4}', 4, 'V_{4}', `Q_{8}/Z \\cong V_{4}`, 'Q_8 商掉中心就是 V_4，阶 4'),
    commutator: spec('C_{2}', 2, 'C_{2}', `[Q_{8}, Q_{8}] = Z(Q_{8})`, '换位子群就是中心，阶 2'),
    outOrder: 6,
    isSimple: false,
    exponent: 4,
  }
}

function kleinFacts(): KnownFacts {
  return {
    family: 'klein',
    params: {},
    source: 'Klein 四元群：Aut(V_4) 就是 S_3',
    aut: spec(
      '\\operatorname{Aut}(V_{4})',
      6,
      'S_{3}',
      `\\operatorname{Aut}(V_{4}) \\cong S_{3},\\quad \\lvert \\cdot \\rvert = 6`,
      'Aut(V_4) 同构于 S_3，阶 6',
    ),
    center: spec('V_{4}', 4, 'V_{4}', `Z(V_{4}) = V_{4}`, '可换群：Z 就是它自己，阶 4'),
    inn: spec('C_{1}', 1, 'C_{1}', `\\operatorname{Inn}(V_{4}) = 1`, '可换群：内自同构只有恒等'),
    commutator: spec('C_{1}', 1, 'C_{1}', `[V_{4}, V_{4}] = 1`, '可换群：换位子群平凡'),
    outOrder: 6,
    isSimple: false,
    exponent: 2,
  }
}

/* ── 入口 ─────────────────────────────────────────────── */

/**
 * 查表：这个群属于哪个常见族、结论是什么。**识别不出返回 `null`**（不猜）。
 *
 * 判据是「记号 + 阶」双重的，所以对**同一个族的任何一个实例**都成立 ——
 * 手写的 `S_4`、以及符号恰好落在同一族上的子群 / 商群，都会命中各自那一族。
 */
export function knownFacts(group: Group): KnownFacts | null {
  const rep = classify(group)
  if (!rep) return null
  switch (rep.family) {
    case 'cyclic':
      return cyclicFacts(rep.n)
    case 'elementaryAbelian':
      return elementaryAbelianFacts(rep.p, rep.k)
    case 'dihedral':
      return dihedralFacts(rep.n)
    case 'symmetric':
      return symmetricFacts(rep.n)
    case 'alternating':
      return alternatingFacts(rep.n)
    case 'quaternion':
      return quaternionFacts()
    case 'klein':
      return kleinFacts()
  }
}
