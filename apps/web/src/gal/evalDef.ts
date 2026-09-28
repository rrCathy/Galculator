import { createGroupFromSymbol, parseGroupNotation } from '@groupviz/core'
import { INFIX_SYMBOLS, INFIX_TABLE, OPS, opByCall, type OpArg, type OpDef } from './ops'
import { asciiClean, prettySymbol, scanNotAscii } from './pretty'
import type { GalValue } from './value'
import type { GalObject } from './types'

export interface EvalSuccess {
  value: GalValue
  /** 画布主行 */
  label: string
  /** 画布副行 */
  sub?: string
  note?: string
  /** input = 直接声明；derived = 用到了操作（或引用了别的对象） */
  origin: 'input' | 'derived'
  /** 来源线：参数链上所有具名对象 id 的并集，自动收集 */
  sources: string[]
  /** 命中的操作 id（指向 ops.ts 注册表） */
  opId?: string
  recipe?: string
}

export type EvalResult = ({ ok: true } & EvalSuccess) | { ok: false; error: string; hint?: string }

/* ── 输入规范化 ────────────────────────────────────────── */

/**
 * 输入别名表 —— **2026-09-27 起是空的**（用户要求：系统里只许出现键盘打得出的字符）。
 *
 * 从前这里把 `×` `⋊` `∩` `∪` `∖` `·` `⊆` 悄悄换成等价写法，于是"敲 `C_2 × C_3` 也能用"。
 * 但那些字符**复制出去就是怪字符**，而且它们的 Unicode 形态与 ASCII 形态混用会引出
 * "两个码位""打不回来"一整类麻烦（U23 的 φ、U24 的下标都在修这个）。
 *
 * 现在改成**明确报错**（见 `nonAsciiHint`）—— 静默转换会让"这个符号打不出来"
 * 一直藏着：用户以为系统支持，直到某次把结果复制进博客才发现是乱码。
 */
const UNICODE_ALIASES: [RegExp, string][] = []


/**
 * `⟨S⟩` → `闭包(S)`（记号包裹 → 函数调用，注册表的 call 名）。
 *
 * 两条边界：
 *   ① 只改写**不带逗号**的形态：带逗号的 `⟨(12),(34)⟩` 是「由置换生成群」的记号，
 *      母群未定，留给 `parseGroupNotation`。要按上下文群生成就写 `闭包(G, (12), (34))`。
 *   ② 只改写**括号外的**（depth 0）：`K = ⟨J⟩` 要变 `闭包(J)`，
 *      但 `稳定子(A, ⟨r⟩)` 里的 `⟨r⟩` 是 Ω 上**某个点的记号**
 *      （Sylow III 的 Ω 成员就长这样），改写掉就再也点不到那个点了。
 */
function normalizeAngle(s: string): string {
  let out = ''
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') {
      depth++
      out += c
      continue
    }
    if (c === ')') {
      depth = Math.max(0, depth - 1)
      out += c
      continue
    }
    if (depth === 0 && c === '<') {
      const end = s.indexOf('>', i + 1)
      if (end > i + 1) {
        const inner = s.slice(i + 1, end)
        if (!/[<>(),]/.test(inner)) {
          out += `闭包(${inner.trim()})`
          i = end
          continue
        }
      }
    }
    out += c
  }
  return out
}

/**
 * Unicode 运算符 → 规范化 ASCII 形态（`C_2 × C_3` → `C_2 x C_3`）。
 *
 * `angle: false` 时不改写 `⟨⟩` —— **实参位置上的 `⟨H⟩` 是 Ω 里那个点的记号**，
 * 不能解释成闭包：`稳定子(A, ⟨r⟩)` 里的 `⟨r⟩` 指 Ω 的成员，
 * 而 Sylow III 的 Ω = `Syl_p(G)` 成员正是这种写法。
 */
export function normalizeExpr(s: string, angle = true): string {
  let t = s.trim()
  for (const [re, to] of UNICODE_ALIASES) t = t.replace(re, to)
  // 2026-09-27 起这里**不再**做"Unicode → 真字符"的归一（`\phi` → φ、`S₄` → `S_4`）：
  // 形态反过来统一到 ASCII 了，Unicode 输入一律由 `nonAsciiHint` 拦下并提示改法。
  /**
   * **希腊字母归一**（与名字那一侧共用 `normalizeGreek`）。
   *
   * 这是"输入与匹配"闭环的另一半，缺了它就是这条真漏洞：
   * 建对象时名字归一了（`ComposerOrb` 过 `normalizeName`），**引用时却没有** ——
   * 于是 `φ = 映射(…)` 建出来的对象，用 `ker(\phi)` 引不到（"需要一个映射对象"），
   * 而用 `ker(φ)` 就行；用户看到的只是"有时候好使有时候不好使"。
   *
   * 归一之后 `\phi` / `\varphi` / `φ` / `ϕ` 四种写法**处处等价**——对象名、引用、
   * 元素记号（`ord(G, α₂)` 与 `ord(G, \alpha_2)` 同值）。
   */
  if (angle) t = normalizeAngle(t)
  return t.replace(/\s+/g, ' ').trim()
}

/** 记号解析器认 TeX 形态，这里把规范化后的中缀还原回去。 */
export function toNotationForm(t: string): string {
  return t
    .replace(/(^|\s)x(\s|$)/g, '\\times')
    .replace(/(^|\s)rtimes(\s|$)/g, '\\rtimes')
    .trim()
}

/* ── 函数式调用：name(a, b, …) ─────────────────────────── */

/** 调用名允许中日韩字符（`共轭作用(G)`）与下划线（`C_G(G, S)`）。 */
const CALL_HEAD = /^([^\s(),]+)\s*\(/

function matchingParen(s: string, open: number): number {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const c of s) {
    if (c === '(') depth++
    else if (c === ')') depth--
    if (c === sep && depth === 0) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  if (cur.trim().length > 0 || out.length > 0) out.push(cur)
  return out.map((x) => x.trim())
}

/** 若整体形如 `name(args…)`（括号恰好包住整个参数表），拆出名字与参数。 */
function splitCall(t: string): { name: string; args: string[] } | null {
  const m = CALL_HEAD.exec(t)
  if (!m) return null
  const open = m[0].length - 1
  const close = matchingParen(t, open)
  if (close === -1 || close !== t.length - 1) return null
  return { name: m[1], args: splitTopLevel(t.slice(open + 1, close), ',') }
}

/* ── 中缀：A x B、G / N ───────────────────────────────── */

const IDENT_CHAR = /[A-Za-z0-9_]/

interface InfixHit {
  pos: number
  len: number
  sym: string
}

/**
 * 只在**顶层**（括号外）找中缀符号。
 * 字母类符号（`x`）必须被非标识符字符包夹，否则 `max` 会被切坏；
 * `/` 与 `·` 例外——`G/N`、`A·B` 这种紧贴写法很常见；`\` 反而**必须**有边界，
 * 因为它是 LaTeX 转义的起头（`\times`）。
 */
function findTopLevelInfix(t: string): InfixHit | null {
  let depth = 0
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (c === '(') {
      depth++
      continue
    }
    if (c === ')') {
      depth--
      continue
    }
    if (depth !== 0) continue
    for (const sym of INFIX_SYMBOLS) {
      if (!t.startsWith(sym, i)) continue
      const before = i === 0 ? '' : t[i - 1]
      const after = i + sym.length >= t.length ? '' : t[i + sym.length]
      // 紧贴可写的中缀：`/`（除法）与**以反斜杠开头的命令**。
      //
      // 为什么命令可以放宽：`A\subseteq G` 里 `\` 本身就是命令的开始符，
      // 它**不可能**与前一个记号粘连（`A\` 不构成任何东西）—— 所以左边是
      // `A` 也无妨。从前能紧贴写是靠 `UNICODE_ALIASES` 把 `⊆` 换成 ` ⊆ `（补空格），
      // 那条路随 Unicode 输入一起去掉了，于是宽容度必须在这里补回来。
      const tight = sym === '/' || sym.startsWith('\\')
      if (tight || (!IDENT_CHAR.test(before) && !IDENT_CHAR.test(after))) {
        // 命令形态仍然要求**右边**不是标识符字符（否则 `\subseteqX` 会被当成命令 `subseteqX`）
        if (sym.startsWith('\\') && IDENT_CHAR.test(after)) continue
        return { pos: i, len: sym.length, sym }
      }
    }
  }
  return null
}

/* ── 参数解析 ─────────────────────────────────────────── */

function argFromResult(text: string, objects: Map<string, GalObject>, r: EvalResult): OpArg {
  if (!r.ok) return { kind: 'literal', text, sources: [] }
  return {
    kind: 'object',
    value: r.value,
    text: r.label,
    ref: objects.has(text) ? text : undefined,
    sources: r.sources,
  }
}

/**
 * 一个裸词（纯字母、无数字/下划线/括号）优先当**元素记号**，
 * 否则 `ord(G, r)` 里的 `r` 会先被当成群记号去解析。
 */
function looksLikeLiteral(s: string): boolean {
  return /^[A-Za-z]+$/.test(s)
}

export function resolveArg(raw: string, objects: Map<string, GalObject>): OpArg {
  // 实参里不改写 ⟨⟩（见 `normalizeExpr` 的注释）
  const s = normalizeExpr(raw, false)
  if (/^-?\d+$/.test(s)) return { kind: 'number', num: Number(s), text: s, sources: [] }
  if (objects.has(s)) return argFromResult(s, objects, evalExpr(s, objects))
  if (looksLikeLiteral(s)) return { kind: 'literal', text: s, sources: [] }
  const r = evalExpr(s, objects)
  if (r.ok) return { kind: 'object', value: r.value, text: r.label, sources: r.sources }
  return { kind: 'literal', text: s, sources: [] }
}

/* ── 分发 ─────────────────────────────────────────────── */

function runOp(op: OpDef, args: OpArg[]): EvalResult {
  // 可变参数（如映射的「生成元→像」对）不限个数，所以上界只在没有 variadic 时才管用
  const max = op.variadic ? Number.POSITIVE_INFINITY : op.arity + (op.optional ?? 0)
  if (args.length < op.arity || args.length > max) {
    const need = op.variadic ? `${op.arity}+` : op.optional ? `${op.arity}~${max}` : `${op.arity}`
    return {
      ok: false,
      error: `${op.notation} 需要 ${need} 个参数，收到 ${args.length} 个`,
      hint: op.doc,
    }
  }
  const out = op.run(args)
  if (!out.ok) return { ok: false, error: out.error, hint: out.hint ?? op.doc }
  return {
    ok: true,
    value: out.value,
    label: out.label,
    sub: out.sub,
    note: out.note,
    origin: 'derived',
    sources: [...new Set(args.flatMap((a) => a.sources))],
    opId: op.id,
    recipe: op.recipe,
  }
}

/**
 * 这行看起来是个**关系**（`H ⊆ G` / `N ⊴ G` / `A ≅ B`）而不是定义。
 *
 * 用户把关系当定义行写是很自然的——课本上就是这么写的。但系统没有"声明关系"这类操作
 *（`docs/USABILITY.md` 缺口 ④）。所以必须**明确说出来**，
 * 别让人以为是自己漏了符号或者群记号写错了。
 */
export function looksLikeRelation(s: string): boolean {
  // 关系记号现在只以 **LaTeX 命令**的形态出现（`\\subseteq` 这类字符键盘打不出来，
  // 用户敲的是命令名）。判据跟着形态走，别再用字符类。
  return /\\(subseteq|supseteq|subset|supset|trianglelefteq|trianglerighteq|cong|simeq|in|notin|le|ge)\b/.test(s)
}

/**
 * 找不到操作时，猜几个"用户可能想用的"。
 *
 * 判据只有一条：别名与输入**互相包含**（`极大子群` 含 `子群`）。只给 3 个——
 * 这是**引导**不是补全，给多了反而像在瞎猜。
 */
function similarOps(name: string): string[] {
  const t = name.trim().toLowerCase()
  if (!t) return []
  const hits: string[] = []
  for (const op of OPS) {
    for (const alias of op.call ?? []) {
      const a = alias.toLowerCase()
      // 长度 ≥ 2 才参与：注册表里有 `c`（组合数）这种单字母别名，
      // 它会是 `gcd` 的子串 —— 于是"是不是想用 C(n,k)"这种驴唇不对马嘴的提示就冒出来了
      if (a === t || a.length < 2) continue
      if (a.includes(t) || t.includes(a)) {
        hits.push(op.notation)
        break
      }
    }
    if (hits.length >= 3) break
  }
  return [...new Set(hits)]
}

/**
 * "长得像操作调用，但注册表里没这个名字"的报错。
 *
 * 从前这一路会掉进**记号建群**的最后一级，于是 `极大子群(G)` 被当成**群记号**去解析，
 * 回一句"无法识别的群记号 …… 可用写法：C₁₂ · S₃ · D₄ ……"——**完全误导**：
 * 用户会以为是自己群记号写错了。未支持的功能与打错字必须能分开。
 */
function unknownOpError(name: string, objects: Map<string, GalObject>): EvalResult {
  // `f(K)`：`f` 是个**已定义的对象** —— 说清楚，别让用户以为自己打错了名字
  if (objects.has(name)) {
    return {
      ok: false,
      error: `「${name}」是一个已定义的对象，不能当函数调用`,
      hint: '形如 f(H) 的「把子群送进映射」目前还没有对应操作',
    }
  }
  const near = similarOps(name)
  return {
    ok: false,
    error: `没有名为「${name}」的操作`,
    hint: near.length
      ? `是不是想用：${near.join('、')}`
      : '选中对象后点节点旁的 `...` 球，或点左侧「操作」抽屉看全部操作',
  }
}

/**
 * 求一条定义（等号右侧）。
 *
 * 四级分发，全部查注册表：
 *   ① 已定义对象的引用（本地优先）
 *   ② 函数式调用 `name(args…)`
 *   ③ 顶层中缀 `A x B`、`G / N`（仅当两侧都能求值）
 *   ④ 记号建群（回退）
 */
export function evalExpr(raw: string, objects: Map<string, GalObject>): EvalResult {
  // **先拦"键盘打不出来的字符"**：这类输入从前是被静默转换的，于是用户永远
  // 不知道"系统给的记号"和"他能敲的记号"其实不是同一个字符集。
  // 报错要给**可照抄的写法**（`suggestion` 是把这一行真折了一遍的结果），
  // 而不是"你自己体会该敲什么"—— 做法借自 GroupViz 的 canonical.ts。
  const bad = scanNotAscii(raw)
  if (bad) {
    const what =
      bad.kind === 'subscript' ? '下标字符'
      : bad.kind === 'superscript' ? '上标字符'
      : bad.kind === 'greek' ? '希腊字母'
      : '数学符号'
    return {
      ok: false,
      error: `${what}「${bad.char}」键盘打不出来`,
      hint: `改用：${bad.suggestion}`,
    }
  }
  const t = normalizeExpr(raw)
  if (!t) return { ok: false, error: '定义为空' }

  // ① 对象引用 / 别名
  const obj = objects.get(t)
  if (obj) {
    return {
      ok: true,
      value: obj.value,
      label: obj.label,
      sub: obj.sub,
      note: `引用 ${obj.id}`,
      origin: 'derived',
      sources: [obj.id],
    }
  }

  // ② 函数式调用
  const call = splitCall(t)
  /** 长得像调用、但注册表里没有这个名字 —— 报错时说"没有这个操作"，不要说"群记号认不出" */
  let unknownOp: string | null = null
  if (call) {
    const op = opByCall(call.name)
    if (op) {
      const args = call.args.map((a) => resolveArg(a, objects))
      return runOp(op, args)
    }
    unknownOp = call.name
  }

  // ③ 顶层中缀
  const hit = findTopLevelInfix(t)
  if (hit) {
    const entry = INFIX_TABLE.find((x) => x.sym === hit.sym)
    const left = t.slice(0, hit.pos).trim()
    const right = t.slice(hit.pos + hit.len).trim()
    if (entry && left && right) {
      const a = evalExpr(left, objects)
      const b = evalExpr(right, objects)
      // 只有两侧都求得出值才当中缀运算；否则整体交给记号解析
      // （`C_2 x C_2` 是直积记号，不是"两个不存在的对象做积"）
      if (a.ok && b.ok) {
        return runOp(entry.op, [argFromResult(left, objects, a), argFromResult(right, objects, b)])
      }
      /**
       * `⊆` 绝不会出现在任何群记号里 —— 所以它这一支**可以放心报"是谁算不出来"**。
       *
       * 不特判的话，`R = A ⊆ K`（K 打错）会一路掉到记号解析、最后报
       * "这行写的是一个关系，不是定义" —— 用户明明写了等号，提示却答非所问。
       * 直积的 `x` 就不能这么干：`C_2 x C_2` 的某一侧"不成立"是常态，得安静地
       * 交给记号解析。
       */
      if (hit.sym === '\\subseteq') {
        const bad = !a.ok ? { side: left, err: a } : { side: right, err: b }
        if (!bad.err.ok) {
          return {
            ok: false,
            error: `「${bad.side}」算不出来：${bad.err.error}`,
            hint: '包含要写成 `R = A \\subseteq B`，两侧都得是已定义的对象',
          }
        }
      }
    }
  }

  // ④ 记号建群
  const n = parseGroupNotation(toNotationForm(t))
  if (!n.ok) {
    // 打的是个"操作调用"却找不到 → 那是**没有这个操作**，不是群记号写错了
    if (unknownOp) return unknownOpError(unknownOp, objects)
    // 写的是个关系（`H ⊆ G`）→ 说清"哪几条能用"，别甩一句"群记号认不出"。
    // ⚠️ 这条提示是**纯文本**面（`.composer-status` 不走 KaTeX），所以正文里
    // 不写 LaTeX 命令 —— 只把「要照着敲的东西」用反引号括起来。
    if (looksLikeRelation(t)) {
      return {
        ok: false,
        error: '这行写的是一个关系，不是定义',
        hint:
          '包含可以声明：写成 `R = A \\subseteq B`。' +
          '「正规」不用声明，那是工具算出来的（声明了包含，面板会告诉你正不正规）；' +
          '「同构」这类还没对应操作。',
      }
    }
    // core 的报错文案里带 `·`（列表分隔点）与 `\times`，`·` 键盘打不出来 → 过一道
    return { ok: false, error: `无法识别：${t}`, hint: n.hint ? asciiClean(n.hint) : undefined }
  }
  if (!n.symbol) {
    return {
      ok: false,
      error: `该记号本地建不了：${t}`,
      hint: n.gapExpr ? `需要后端 GAP：${n.gapExpr}（后端通道尚未接入）` : n.hint,
    }
  }
  const g = createGroupFromSymbol(n.symbol)
  if (!g) return { ok: false, error: `本地建群失败：${n.symbol}`, hint: n.hint }
  return {
    ok: true,
    value: { type: 'group', group: g },
    label: prettySymbol(n.symbol),
    sub: `|G| = ${g.order}`,
    note: n.via,
    origin: 'input',
    sources: [],
  }
}
