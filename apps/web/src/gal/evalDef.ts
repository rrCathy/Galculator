import { createGroupFromSymbol, parseGroupNotation } from '@groupviz/core'
import { INFIX_SYMBOLS, INFIX_TABLE, opByCall, type OpArg, type OpDef } from './ops'
import { prettySymbol } from './pretty'
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

const UNICODE_ALIASES: [RegExp, string][] = [
  [/×/g, ' x '],
  [/⋊/g, ' rtimes '],
  [/∩/g, ' ∩ '],
  [/∪/g, ' ∪ '],
  [/∖/g, ' \\ '],
  [/·/g, ' · '],
  [/\\cdot\b/g, ' · '],
]

/**
 * `⟨S⟩` → `闭包(S)`（记号包裹 → 函数调用，注册表的 call 名）。
 *
 * 只改写**不带逗号**的形态：带逗号的 `⟨(12),(34)⟩` 是「由置换生成群」的记号，
 * 母群未定，留给 `parseGroupNotation`——别在这里抢先解释成"某个上下文群里的闭包"。
 * 要按上下文群生成，写 `闭包(G, (12), (34))`。
 */
function normalizeAngle(s: string): string {
  return s.replace(/⟨([^⟨⟩,]+)⟩/g, (_, inner: string) => `闭包(${inner.trim()})`)
}

/** Unicode 运算符 → 规范化 ASCII 形态（`C_2 × C_3` → `C_2 x C_3`）。 */
export function normalizeExpr(s: string): string {
  let t = s.trim()
  for (const [re, to] of UNICODE_ALIASES) t = t.replace(re, to)
  t = normalizeAngle(t)
  return t.replace(/\s+/g, ' ').trim()
}

/** 记号解析器认 TeX 形态，这里把规范化后的中缀还原回去。 */
export function toNotationForm(t: string): string {
  return t
    .replace(/(^|\s)x(\s|$)/g, '\\times ')
    .replace(/(^|\s)rtimes(\s|$)/g, '\\rtimes ')
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
      const tight = sym === '/' || sym === '·'
      if (tight || (!IDENT_CHAR.test(before) && !IDENT_CHAR.test(after))) {
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
  const s = normalizeExpr(raw)
  if (/^-?\d+$/.test(s)) return { kind: 'number', num: Number(s), text: s, sources: [] }
  if (objects.has(s)) return argFromResult(s, objects, evalExpr(s, objects))
  if (looksLikeLiteral(s)) return { kind: 'literal', text: s, sources: [] }
  const r = evalExpr(s, objects)
  if (r.ok) return { kind: 'object', value: r.value, text: r.label, sources: r.sources }
  return { kind: 'literal', text: s, sources: [] }
}

/* ── 分发 ─────────────────────────────────────────────── */

function runOp(op: OpDef, args: OpArg[]): EvalResult {
  const max = op.arity + (op.optional ?? 0)
  if (args.length < op.arity || args.length > max) {
    const need = op.optional ? `${op.arity}~${max}` : `${op.arity}`
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
 * 求一条定义（等号右侧）。
 *
 * 四级分发，全部查注册表：
 *   ① 已定义对象的引用（本地优先）
 *   ② 函数式调用 `name(args…)`
 *   ③ 顶层中缀 `A x B`、`G / N`（仅当两侧都能求值）
 *   ④ 记号建群（回退）
 */
export function evalExpr(raw: string, objects: Map<string, GalObject>): EvalResult {
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
  if (call) {
    const op = opByCall(call.name)
    if (op) {
      const args = call.args.map((a) => resolveArg(a, objects))
      return runOp(op, args)
    }
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
    }
  }

  // ④ 记号建群
  const n = parseGroupNotation(toNotationForm(t))
  if (!n.ok) return { ok: false, error: `无法识别：${t}`, hint: n.hint }
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
