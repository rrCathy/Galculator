/**
 * 代数结构 —— 「集合 + 二元运算 → 它到哪一级」的**唯一判据**。
 *
 * ## 为什么单开一个模块
 *
 * 从前的 `src/gal/structure.ts` 是「**一个群内部**的结构分解」（合成列 / 导来列 /
 * 半直积 / 完美，U27）；本模块是「**代数结构的层级**」（原群 / 半群 / 幺半群 / 群）。
 * 两者只差一个字母的模块名会诱人写错 `import` —— 所以这里定名 `algebra.ts`，
 * 与 `structure.ts` 划清界限。
 *
 * ## 契约纪律（照抄项目教训，DEVPLAN §3）
 *
 * `isGroupStructure(s)` **是**下面四件事的**同一个出口**：
 *   `axioms.level === 'group'` ⇔ `structureToGroup(s) !== null`
 *   ⇔ `paramAccepts('group', 结构)` ⇔ 菜单里列得出群操作。
 * 判据分家 = 菜单撒谎，所以"够不够格当群"只写一次。
 */
import type { Group } from '@groupviz/core'
import { createGroupFromImport } from '@groupviz/core'
import type { GalStructure, GalValue, SetMember } from './value'

/** 层级：从最低的"只有一个运算"往上爬。 */
export type StructureLevel = 'magma' | 'semigroup' | 'monoid' | 'group'

export const STRUCTURE_LEVEL_LABEL: Record<StructureLevel, string> = {
  magma: '原群',
  semigroup: '半群',
  monoid: '幺半群',
  group: '群',
}

/** 离上一级差哪条公理（`failsAt`）的中文名。 */
export const AXIOM_FAIL_LABEL: Record<NonNullable<AxiomProfile['failsAt']>, string> = {
  closure: '封闭性',
  associativity: '结合律',
  identity: '单位元',
  inverse: '逆元',
}

/** 载体的硬上限。结合律 O(n³)，64³ = 26 万次比较（毫秒级）；真正的瓶颈是填表。 */
export const STRUCTURE_MAX = 64

export interface AxiomProfile {
  /* ── 线 A「运算本身的性质」—— 教材第一章最先讲的那批读数 ── */
  /** 表良定义：每个表项 ∈ [1, n]（1-based，见 DEVPLAN §1） */
  closed: boolean
  /** 违反闭合的首个格（展示用），形如 [行, 列, 读到的值]（0-based 行列） */
  closedAt?: [number, number, number]
  /** ∀a,b,c: (ab)c = a(bc) —— O(n³) */
  associative: boolean
  /** 不结合的见证三元组（0-based 下标）——"不结合"要给出反例，不空口说 */
  assocCounterexample?: [number, number, number]
  hasIdentity: boolean
  /** 单位元的 0-based 下标 */
  identityIndex?: number
  hasInverses: boolean
  /** 没有逆的元素下标（最多列 8 个，展示用） */
  notInvertible?: number[]
  commutative: boolean
  /**
   * 消去律 —— 群的核心推论，也是"**有限半群 + 消去律 ⇒ 群**"这把钥匙的钥匙孔。
   * 反例三元组 (a,b,c)：b≠c 而 ab=ac（左）／ba=ca（右）。
   */
  cancellation: {
    left: boolean
    right: boolean
    cexLeft?: [number, number, number]
    cexRight?: [number, number, number]
  }
  /** 幂等元下标（a²=a）。群里只有 e；带（band）里全是；左零带全幂等。 */
  idempotents: number[]
  /** 零元下标（0 或 1 个）。零半群、环的前身；也是"消去律为何破"的元凶。 */
  zeroElements: number[]
  /* ── 群的必要条件与"回群的桥" ── */
  /** 表是不是拉丁方（每行每列都是置换）—— 群的必要**非充分**条件 */
  isLatin: boolean
  /** 首个坏行 / 坏列下标（0-based；展示"哪一行重复了"） */
  latinBadRow?: number
  latinBadCol?: number
  /** 全体可逆元下标 = 单位群 U(M) 的载体 */
  units: number[]
  /* ── 派生 ── */
  /** 爬到的层级（由上面几条**算出来**，不是声明的） */
  level: StructureLevel
  /** 离上一级差哪一条公理（"就差一步"用）；已群为 null。 */
  failsAt: 'closure' | 'associativity' | 'identity' | 'inverse' | null
}

export type VerifyOutcome =
  | { ok: true; profile: AxiomProfile }
  | { ok: false; error: string; hint?: string }

/* ── 表读数：每个判据一个纯函数，互不干扰 ─────────────────────── */

/** 表良定义检查：每项 ∈ [1, n]。返回首个坏格（0-based 行列 + 读到的值）。 */
function findBadCell(table: number[][], n: number): [number, number, number] | null {
  for (let i = 0; i < n; i++) {
    const row = table[i]
    if (!row || row.length !== n) return [i, -1, NaN]
    for (let j = 0; j < n; j++) {
      const v = row[j]
      if (!Number.isInteger(v) || v < 1 || v > n) return [i, j, v]
    }
  }
  return null
}

/** 结合律：返回是否结合 + 首个不结合的三元组（0-based）。 */
function checkAssociative(
  table: number[][],
  n: number,
): { ok: boolean; cex?: [number, number, number] } {
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++)
      for (let c = 0; c < n; c++) {
        const ab = table[a][b] - 1
        const bc = table[b][c] - 1
        if (table[ab][c] - 1 !== table[a][bc] - 1) return { ok: false, cex: [a, b, c] }
      }
  return { ok: true }
}

/** 单位元：第一个 e 使 ∀x: e·x = x·e = x；没有返回 -1。 */
function findIdentity(table: number[][], n: number): number {
  for (let e = 0; e < n; e++) {
    let ok = true
    for (let x = 0; x < n; x++) {
      if (table[e][x] - 1 !== x || table[x][e] - 1 !== x) {
        ok = false
        break
      }
    }
    if (ok) return e
  }
  return -1
}

/** 逆元：相对单位元 ei，列出没有逆的元素下标。ei < 0 时无逆可言。 */
function findNonInvertible(table: number[][], n: number, ei: number): number[] {
  if (ei < 0) return []
  const missing: number[] = []
  for (let a = 0; a < n; a++) {
    let found = false
    for (let b = 0; b < n; b++) {
      if (table[a][b] - 1 === ei && table[b][a] - 1 === ei) {
        found = true
        break
      }
    }
    if (!found) missing.push(a)
  }
  return missing
}

/** 交换律。 */
function checkCommutative(table: number[][], n: number): boolean {
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (table[i][j] !== table[j][i]) return false
  return true
}

/** 消去律：左 / 右各自是否成立，附反例 (a,b,c)。 */
function checkCancellation(
  table: number[][],
  n: number,
): AxiomProfile['cancellation'] {
  let left = true
  let right = true
  let cexLeft: [number, number, number] | undefined
  let cexRight: [number, number, number] | undefined
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        if (left && table[a][b] === table[a][c]) {
          left = false
          cexLeft = [a, b, c]
        }
        if (right && table[b][a] === table[c][a]) {
          right = false
          cexRight = [a, b, c]
        }
      }
    }
  }
  return { left, right, cexLeft, cexRight }
}

/** 幂等元下标（a·a = a）。 */
function findIdempotents(table: number[][], n: number): number[] {
  const out: number[] = []
  for (let a = 0; a < n; a++) if (table[a][a] - 1 === a) out.push(a)
  return out
}

/** 零元下标（∀x: a·x = x·a = a）。 */
function findZeroElements(table: number[][], n: number): number[] {
  const out: number[] = []
  for (let a = 0; a < n; a++) {
    let ok = true
    for (let x = 0; x < n; x++) {
      if (table[a][x] !== a + 1 || table[x][a] !== a + 1) {
        ok = false
        break
      }
    }
    if (ok) out.push(a)
  }
  return out
}

/** 拉丁方：每行每列都是 1..n 的置换。返回首个坏行 / 坏列（0-based）。 */
function checkLatin(
  table: number[][],
  n: number,
): { latin: boolean; badRow?: number; badCol?: number } {
  for (let i = 0; i < n; i++) {
    const seen = new Set<number>()
    for (let j = 0; j < n; j++) {
      const v = table[i][j]
      if (seen.has(v)) return { latin: false, badRow: i }
      seen.add(v)
    }
  }
  for (let j = 0; j < n; j++) {
    const seen = new Set<number>()
    for (let i = 0; i < n; i++) {
      const v = table[i][j]
      if (seen.has(v)) return { latin: false, badCol: j }
      seen.add(v)
    }
  }
  return { latin: true }
}

/** 可逆元下标（相对单位元 ei 有双边逆）。 */
function findUnits(table: number[][], n: number, ei: number): number[] {
  if (ei < 0) return []
  const out: number[] = []
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (table[a][b] - 1 === ei && table[b][a] - 1 === ei) {
        out.push(a)
        break
      }
    }
  }
  return out
}

/**
 * 公理验证器 —— **纯函数**，判据只此一份。
 *
 * 约定：**不猜**（n 超上限 / 表维度不对 ⇒ ok:false，不给半截答案）；
 *      **不静默**（表里有 0 / 越界 ⇒ closed:false 并指名，不当成 0 用）。
 */
export function verifyAxioms(
  labels: string[],
  table: number[][],
  cap: number = STRUCTURE_MAX,
): VerifyOutcome {
  const n = labels.length
  if (n === 0) return { ok: false, error: '载体是空的', hint: '先给它一个至少 1 个点的集合' }
  if (n > cap)
    return {
      ok: false,
      error: `载体有 ${n} 个点，超过上限 ${cap}`,
      hint: `结合律是 O(n³)，${cap} 已是我愿意替你算的极限；把载体缩到 ${cap} 个点以内`,
    }
  if (table.length !== n)
    return {
      ok: false,
      error: `运算表有 ${table.length} 行，应为一个 ${n}×${n} 的表`,
      hint: `n = |载体| = ${n}，表要有 ${n} 行 ${n} 列`,
    }
  for (const row of table)
    if (row.length !== n)
      return { ok: false, error: `运算表每行要有 ${n} 个表项，某行只有 ${row.length} 个`, hint: undefined }

  const bad = findBadCell(table, n)
  if (bad) {
    // 表不良定义：其余读数都无从谈起，如实说"表有坏格"而不是硬算
    return {
      ok: true,
      profile: {
        closed: false,
        closedAt: bad,
        associative: false,
        hasIdentity: false,
        hasInverses: false,
        commutative: false,
        cancellation: { left: false, right: false },
        idempotents: [],
        zeroElements: [],
        isLatin: false,
        units: [],
        level: 'magma',
        failsAt: 'closure',
      },
    }
  }

  const assoc = checkAssociative(table, n)
  const ei = findIdentity(table, n)
  const nonInv = findNonInvertible(table, n, ei)
  const commutative = checkCommutative(table, n)
  const cancellation = checkCancellation(table, n)
  const idempotents = findIdempotents(table, n)
  const zeroElements = findZeroElements(table, n)
  const latin = checkLatin(table, n)
  const units = findUnits(table, n, ei)

  const hasIdentity = ei >= 0
  const hasInverses = hasIdentity && nonInv.length === 0

  let level: StructureLevel
  let failsAt: AxiomProfile['failsAt']
  if (!assoc.ok) {
    level = 'magma'
    failsAt = 'associativity'
  } else if (!hasIdentity) {
    level = 'semigroup'
    failsAt = 'identity'
  } else if (!hasInverses) {
    level = 'monoid'
    failsAt = 'inverse'
  } else {
    level = 'group'
    failsAt = null
  }

  const profile: AxiomProfile = {
    closed: true,
    associative: assoc.ok,
    assocCounterexample: assoc.cex,
    hasIdentity,
    identityIndex: hasIdentity ? ei : undefined,
    hasInverses,
    notInvertible: nonInv.length > 0 ? nonInv.slice(0, 8) : undefined,
    commutative,
    cancellation,
    idempotents,
    zeroElements,
    isLatin: latin.latin,
    latinBadRow: latin.badRow,
    latinBadCol: latin.badCol,
    units,
    level,
    failsAt,
  }
  return { ok: true, profile }
}

/* ── 升格：结构 → core `Group` ─────────────────────────────── */

/**
 * 够格当群吗？—— **唯一判据**（`level` / `structureToGroup` / `paramAccepts` 共用）。
 */
export function isGroupStructure(s: GalStructure): boolean {
  return s.axioms.closed && s.axioms.level === 'group'
}

/** 求逆：已知单位元是 0 号位，找 b 使 a·b = e。 */
function inverseOf(table: number[][], n: number, a: number): number {
  for (let b = 0; b < n; b++) if (table[a][b] - 1 === 0) return b
  return 0
}

/** 由生成元集合取乘法闭包（0-based 下标；含左乘与右乘，单位元恒在）。 */
function closureOf(gens: number[], table: number[][], n: number): Set<number> {
  const S = new Set<number>([0])
  let changed = true
  while (changed) {
    changed = false
    for (const a of [...S]) {
      for (const g of gens) {
        const r = table[a][g] - 1
        if (!S.has(r)) {
          S.add(r)
          changed = true
        }
        const l = table[g][a] - 1
        if (!S.has(l)) {
          S.add(l)
          changed = true
        }
      }
    }
  }
  return S
}

/** 贪心求最小生成集（0-based 下标；首元素视为单位元）。 */
function findGenerators(table: number[][], n: number): number[] {
  const gens: number[] = []
  let S = new Set<number>([0])
  for (let x = 1; x < n && S.size < n; x++) {
    if (S.has(x)) continue
    const S2 = closureOf([...gens, x], table, n)
    if (S2.size > S.size) {
      gens.push(x)
      S = S2
    }
  }
  return gens
}

/**
 * 结构 → core `Group`（**升格**）。非群结构返回 null。
 *
 * ⚠️ **唯一的易错点**（DEVPLAN §1 头号陷阱）：core 要求**单位元在首位**
 * （`identity: n[0]`，逆元靠"行里找值为 1 的列"）。所以这里做**一次置换**：
 * 把 `identityIndex` 换到 0 号，行与列同步置换，生成元下标随之重编。
 * 结构 → 群的元素顺序**不保证一致**（core 的硬约束），面板要注明。
 */
export function structureToGroup(s: GalStructure): Group | null {
  if (!isGroupStructure(s)) return null
  const n = s.carrier.length
  const ei = s.axioms.identityIndex ?? 0
  // perm[k] = 新位置 k 上放的原下标；pos[原下标] = 新位置
  const perm = [ei, ...Array.from({ length: n }, (_, i) => i).filter((i) => i !== ei)]
  const pos = new Array<number>(n)
  perm.forEach((orig, k) => (pos[orig] = k))

  const table = Array.from({ length: n }, (_, k) =>
    Array.from({ length: n }, (_, l) => {
      const orig = s.op.table[perm[k]][perm[l]] - 1 // 原下标
      return pos[orig] + 1 // 新位置，1-based
    }),
  )
  const idents = perm.map((orig) => s.carrier[orig].label)
  const gens = findGenerators(table, n).map((g) => g + 1) // core 的 gens 是 1-based

  return createGroupFromImport({
    gap_expr: '',
    order: n,
    table,
    gens,
    idents,
    structure: '', // 空串 ⇒ core 落到 `Import(n)`；不给 D_n 之类的假记号
  })
}

/**
 * 单位群 U(M) —— 全体可逆元构成的群（**把"非群"接回群论**）。
 *
 * - 已经是群 ⇒ 自身（即 `group`）。
 * - 否则：若 `units` 在乘法下封闭（结合时才可能），把它作载体升格成一个群。
 * - 不封闭 / 空 ⇒ null（**不猜**）。
 */
export function unitGroupOf(s: GalStructure): Group | null {
  if (isGroupStructure(s)) return s.group ?? null
  const units = s.axioms.units
  if (units.length === 0) return null

  const posOf = new Map(units.map((orig, k) => [orig, k]))
  const sub: number[][] = []
  for (const a of units) {
    const row: number[] = []
    for (const b of units) {
      const prod = s.op.table[a][b] - 1
      const k = posOf.get(prod)
      if (k === undefined) return null // 不封闭 ⇒ 不成群
      row.push(k + 1)
    }
    sub.push(row)
  }
  const labels = units.map((orig) => s.carrier[orig].label)
  const outcome = verifyAxioms(labels, sub)
  if (!outcome.ok || outcome.profile.level !== 'group') return null
  const carrier: SetMember[] = labels.map((l) => ({ label: l }))
  return structureToGroup({ carrier, op: { table: sub }, axioms: outcome.profile })
}

/* ── 取群 / 指纹 ───────────────────────────────────────────── */

/**
 * 从值里取群 —— **全项目唯一一份**。
 *
 * 替代散落的 `v.type === 'group' ? v.group : null`：结构够格成群时它也是"一个群"，
 * 非群结构则没有群（**返回 null，不许拿 `C_1` 兜底**）。
 */
export function asGroupOf(v: GalValue): Group | null {
  switch (v.type) {
    case 'group':
      return v.group
    case 'structure':
      return v.structure.group ?? null
    default:
      return null
  }
}

/** 结构指纹：缓存 key 必须含**载体 + 表**（U26/U58 的 key 撞号教训）。 */
export function structureFingerprint(s: GalStructure): string {
  const carrier = s.carrier.map((m) => m.label).join('\u0001')
  const table = s.op.table.map((r) => r.join(',')).join('|')
  return `${carrier}\u0002${table}`
}

/* ── 文本形态：扁平整数 → 结构 ─────────────────────────────── */

/**
 * 文本形态的解析：把扁平整数序列还原成 n×n 表，长度 / 边界校验在此。
 *
 * 表项 **1-based**、按**行优先**展平；`1` 就是单位元位（与 core 契约、与 GAP 同构）。
 */
export function planStructure(
  carrierLabels: string[],
  entries: number[],
): { ok: true; structure: GalStructure } | { ok: false; error: string; hint?: string } {
  const n = carrierLabels.length
  if (n === 0) return { ok: false, error: '载体是空的', hint: '先给它一个至少 1 个点的集合' }
  if (n > STRUCTURE_MAX)
    return {
      ok: false,
      error: `载体有 ${n} 个点，超过上限 ${STRUCTURE_MAX}`,
      hint: `把载体缩到 ${STRUCTURE_MAX} 个点以内`,
    }
  const dup = carrierLabels.find((l, i) => carrierLabels.indexOf(l) !== i)
  if (dup !== undefined)
    return {
      ok: false,
      error: `载体标号重复：${dup}`,
      hint: 'core 用标号当元素名，同一个名字出现两次会静默算错；改掉重复的标号',
    }
  if (entries.length !== n * n)
    return {
      ok: false,
      error: `运算表要 ${n * n} 个数（${n}×${n}），收到 ${entries.length} 个`,
      hint:
        n === 3
          ? '三阶要 9 个表项，如 structure(P, 1,2,3, 2,3,1, 3,1,2)'
          : `按行优先给 ${n}×${n} = ${n * n} 个 1..${n} 的整数`,
    }

  const table: number[][] = []
  for (let i = 0; i < n; i++) table.push(entries.slice(i * n, (i + 1) * n))

  const outcome = verifyAxioms(carrierLabels, table)
  if (!outcome.ok) return { ok: false, error: outcome.error, hint: outcome.hint }

  const carrier: SetMember[] = carrierLabels.map((label) => ({ label }))
  const structure: GalStructure = { carrier, op: { table }, axioms: outcome.profile }
  const g = structureToGroup(structure)
  if (g) structure.group = g
  const ug = unitGroupOf(structure)
  if (ug) structure.unitGroup = ug
  return { ok: true, structure }
}
