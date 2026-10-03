import { createGroupFromSymbol, parseGroupNotation, type Group } from '@groupviz/core'
// 本地补的记号（U49）：core 有人为上限、但本地机器建得出的那几种（`A_n`）
import { buildLocally } from './localBuild'
// 半直积 `N : H` 的三态分诊（U51）：唯一就建、多解列出、算不动说清
import { humanFingerprint, planSemidirect } from './semidirect'
import {
  INFIX_SYMBOLS,
  INFIX_TABLE,
  OPS,
  opByCall,
  type OpArg,
  type OpContext,
  type OpDef,
} from './ops'
import { asciiClean, asciiSymbol, prettySymbol, scanNotAscii } from './pretty'
// 「已知群」不能当输入（U48）：结论表给的群只有符号 + 阶，没有元素表
import { isKnownGroup } from './known'
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
  /** **同一次推导**的指纹（缺口 ⑯）——操作 id + 规范化实参，见 types.ts 的 `callKey` */
  callKey?: string
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
 * `⟨S⟩` → `closure(S)`（记号包裹 → 函数调用，注册表的 call 名）。
 *
 * 两条边界：
 *   ① 只改写**不带逗号**的形态：带逗号的 `⟨(12),(34)⟩` 是「由置换生成群」的记号，
 *      母群未定，留给 `parseGroupNotation`。要按上下文群生成就写 `closure(G, (12), (34))`。
 *   ② 只改写**括号外的**（depth 0）：`K = ⟨J⟩` 要变 `closure(J)`，
 *      但 `stabilizer(A, ⟨r⟩)` 里的 `⟨r⟩` 是 Ω 上**某个点的记号**
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
          out += `closure(${inner.trim()})`
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
 * 不能解释成闭包：`stabilizer(A, ⟨r⟩)` 里的 `⟨r⟩` 指 Ω 的成员，
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
   * 于是 `φ = map(…)` 建出来的对象，用 `ker(\phi)` 引不到（"需要一个映射对象"），
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

/** 调用名允许中日韩字符（`conjAction(G)`）与下划线（`C_G(G, S)`）。 */
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

/**
 * **同一次推导的指纹**（缺口 ⑯）：操作 id + 规范化实参。
 *
 * 规范化做两件事，正好对上用户撞上的那两个岔路：
 *   · **对象参数取"引用名"**（`a.ref`）而不是它当时写出来的文本 ——
 *     于是 `image(\phi)` 与 `im(\phi)`、`quotient(A, K)` 与 `A / K` 归一成同一个指纹；
 *   · 标量参数取原文并 trim（`pSub(G, 2)` 与 `pSub(G, 3)` 必须是两个对象）。
 *
 * 无引用的实参（内联表达式，如 `Z(G)` 当参数）退回它的展示标签 ——
 * 同一个表达式编出来的标签相同，仍然归得掉；不同表达式恰好标签相同的概率极低。
 */
function callKeyOf(op: OpDef, args: OpArg[]): string {
  const parts = args.map((a) => (a.kind === 'object' ? `@${a.ref ?? a.text}` : a.text.trim()))
  return `${op.id}::${parts.join('::')}`
}

/**
 * 画布上下文（U34）：把**已有对象里的群**整理成候选母群，交给 `op.run` 的第二参。
 *
 * 只放群值（按定义顺序、去重）—— 目前只有集合运算用它：找不到共同母群时，
 * 画布上摆着的那个大群就是最可能的"家"（`intersection(C_3, C_7)` 在 F₂₁ 旁边不该失败）。
 */
function opContextOf(objects: Map<string, GalObject>): OpContext {
  const groups: { ref: string; group: Group }[] = []
  const seen = new Set<Group>()
  for (const o of objects.values()) {
    if (o.value.type !== 'group') continue
    const g = o.value.group
    if (seen.has(g)) continue
    seen.add(g)
    groups.push({ ref: o.id, group: g })
  }
  return { groups }
}

function runOp(op: OpDef, args: OpArg[], objects: Map<string, GalObject>): EvalResult {
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
  /**
   * 「已知群」**只能当结果看，不能当输入算**（U48）。
   *
   * 它是结论表给的（`Aut(S_6)` 只有符号与阶 1440，本地建不出那个群），
   * `elements` 是空数组 —— 放它进操作会**静默算在空集上**（`closure(它)` 会得到一个
   * 看不出错的平凡结果），这比报错难查得多。所以在**唯一的分发口**拦下，
   * 而不是赌每个 op 都记得自己查一遍。
   */
  const knownArg = args.find(
    (a) => a.kind === 'object' && a.value?.type === 'group' && isKnownGroup(a.value.group),
  )
  if (knownArg) {
    return {
      ok: false,
      error: '这是结论表给出的「已知群」，没有元素表',
      hint:
        '它来自课本的闭式结论（例如 |Aut(S_6)| = 2*6! = 1440，本地建不出这个群），' +
        '只有符号与阶，不能再参与元素级运算。',
    }
  }
  const out = op.run(args, opContextOf(objects))
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
    callKey: callKeyOf(op, args),
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
 * **老写法 → 现在的名字**（U54）。表里全是 U53 之前的中文操作名。
 *
 * U54 把 42 个 op 的中文别名删掉了（操作名统一成 ASCII 英文）。删掉是**我们**改的，
 * 于是老笔记 / 老截图 / 肌肉记忆一定会撞上「没有名为「直积」的操作」——
 * 只回一句"没有这个操作"就是把用户甩在原地。
 *
 * 所以这里**给指路**：命中就直接说"改叫 X 了"。这也是 `similarOps` 的**前置**：
 * 模糊匹配在中文名上必然零命中（别名已经全 ASCII），兜不住这一类。
 *
 * ⚠️ 表只增不减地放着，等哪天确认没人再写中文名了再删 —— 它不是兼容层
 * （解析器**不认**这些名字），只是一句人话的提示。
 */
export const RENAMED_OPS: Record<string, string> = {
  直积: 'directProduct',
  半直积: 'semidirectProduct',
  商: 'quotient',
  商群: 'quotient',
  映射: 'map',
  同态: 'map',
  共轭作用: 'conjAction',
  正则作用: 'leftAction',
  左正则作用: 'leftAction',
  共轭作用在: 'conjOn',
  陪集作用: 'cosetAction',
  自定义作用: 'customAction',
  自同构群: 'Aut',
  交: 'intersection',
  交集: 'intersection',
  并: 'union',
  并集: 'union',
  差: 'difference',
  差集: 'difference',
  积集: 'productSet',
  底集: 'asSet',
  点集: 'pointSet',
  集合: 'labeledSet',
  中心: 'Z',
  内自同构群: 'Inn',
  中心化子: 'C_G',
  正规化子: 'N_G',
  轨道: 'orbits',
  稳定子: 'stabilizer',
  不动点: 'fix',
  轨道数: 'burnside',
  核: 'ker',
  像: 'im',
  包含: 'include',
  同构: 'isomorphic',
  子群: 'Sub',
  极大子群: 'maximalSubgroups',
  p子群: 'pSub',
  正规子群: 'normalSubgroups',
  换位子群: 'commutator',
  闭包: 'closure',
  生成子群: 'closure',
  元素阶: 'ord',
  分解: 'factor',
  组合数: 'C',
  组合数模: 'Cmod',
  最大公因数: 'gcd',
  最大公约数: 'gcd',
  最小公倍数: 'lcm',
  欧拉函数: 'phi',
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
 * 从前这一路会掉进**记号建群**的最后一级，于是 `maximalSubgroups(G)` 被当成**群记号**去解析，
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
  // U54：老中文名先查改名表 —— 用户抄的是自己的旧笔记，得被告知"改叫 X 了"
  const renamed = RENAMED_OPS[name]
  if (renamed) {
    return {
      ok: false,
      error: `「${name}」改叫「${renamed}」了`,
      hint: `操作名从 U54 起统一成 ASCII 英文，照这个写：${renamed}(...)`,
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
  return evalExprGuarded(raw, objects)
}

/**
 * 求值的**异常兜底**（2026-09-30）。
 *
 * 引擎（`@groupviz/core`）在"元素表示对不上"的边角会**直接抛**，而不是返回空值 ——
 * 实测 `N_G(V_4, S_4)` 抛 `Cannot read properties of undefined (reading 'map')`
 * （core 的 `findPermIndex` 回退后拿到了 undefined）。从前这一抛会**穿过整个求值层
 * 漏进事件处理器**，用户看到的是控制台报错 / 界面没反应，而不知道自己做错了什么。
 *
 * 兜底不去猜"是哪一步崩的"（那要改 core），只保证：**再崩也要变成一句人话**，
 * 并把原始信息留在 hint 里（用户能原样贴给我，比截图强）。
 *
 * ⚠️ 上游那些**已知**的越界情形都该在各自 op 里判掉（`N_G` / `C_G` 已经补上）；
 * 这一层是**最后一道网**，不是替它们兜底的手段。
 */
function evalExprGuarded(raw: string, objects: Map<string, GalObject>): EvalResult {
  try {
    return evalExprInner(raw, objects)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: '这一步把引擎算崩了（是工具的 bug，不是你写错了）',
      hint: `算式：${asciiClean(raw)}；原始信息：${asciiClean(detail).slice(0, 120)}`,
    }
  }
}

function evalExprInner(raw: string, objects: Map<string, GalObject>): EvalResult {
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
      return runOp(op, args, objects)
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
        return runOp(entry.op, [argFromResult(left, objects, a), argFromResult(right, objects, b)], objects)
      }
      /**
       * `⊆` / `≅` 绝不会出现在任何群记号里 —— 所以这两支**可以放心报"是谁算不出来"**。
       *
       * 不特判的话，`R = A ⊆ K`（K 打错）会一路掉到记号解析、最后报
       * "这行写的是一个关系，不是定义" —— 用户明明写了等号，提示却答非所问。
       * 直积的 `x` 就不能这么干：`C_2 x C_2` 的某一侧"不成立"是常态，得安静地
       * 交给记号解析。
       */
      if (hit.sym === '\\subseteq' || hit.sym === '\\cong') {
        const bad = !a.ok ? { side: left, err: a } : { side: right, err: b }
        if (!bad.err.ok) {
          return {
            ok: false,
            error: `「${bad.side}」算不出来：${bad.err.error}`,
            hint:
              hit.sym === '\\cong'
                ? '同构要写成 `R = A \\cong B`，两侧都得是已定义的对象'
                : '包含要写成 `R = A \\subseteq B`，两侧都得是已定义的对象',
          }
        }
      }
    }
  }

  // ④ 记号建群
  const n = parseGroupNotation(toNotationForm(t))
  if (!n.ok) {
    // ★ U51：半直积记号。core 认得 `N:H` 的**语法**，但定不了 φ —— 它回
    //   `error === 'semidirect'` 并说「找不到满足条件的非平凡作用 φ」。那句话是错的
    //   （实测 `C_2^2:C_3` 的非平凡作用**唯一**，`C_2^4:S_3` 有一大把）。
    //   分诊三态：唯一 ⇒ 直接建；多解 ⇒ 报"不是一个群"并列候选；算不动 ⇒ 说清卡在哪。
    if (n.error === 'semidirect') return evalSemidirectNotation(t, n.canonical)
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
          '关系可以声明：包含写成 `R = A \\subseteq B`，同构写成 `R = A \\cong B`。' +
          '「正规」不用声明，那是工具算出来的（声明了包含，面板会告诉你正不正规）。',
      }
    }
    // core 的报错文案里带 `·`（列表分隔点）与 `\times`，`·` 键盘打不出来 → 过一道
    // core 的文案里带 `\times` / `C_{2}` 这类 **LaTeX 源**（纯文本面上就是反斜杠），
    // 先过 `asciiClean`（外部 Unicode 装饰）再 `asciiSymbol`（LaTeX → ASCII 词）。
    // ⚠️ 顺序不能反：`asciiClean` 管 `·` / `—`，`asciiSymbol` 管命令，两者不相交但
    // 都要过 —— 只过一道就是 U54 之前的样子（hint 里明晃晃一个 `\\times`）。
    return {
      ok: false,
      error: `无法识别：${t}`,
      hint: n.hint ? asciiSymbol(asciiClean(n.hint)) : undefined,
    }
  }
  if (!n.symbol) {
    /*
     * core 报 `symbol: null` 不等于"算不动"——它也可能是**只在那儿的人为上限**
     * （`A_6`：core 的 `createAlternatingGroup` 卡在 n ≤ 5，而族门写的是 6）。
     * 这一层按 `canonical` 补（U49），补得上就当普通群走。
     */
    const local = buildLocally(n.canonical)
    if (local) {
      return {
        ok: true,
        value: { type: 'group', group: local },
        label: prettySymbol(local.symbol),
        sub: `|G| = ${local.order}`,
        note: n.via,
        origin: 'input',
        sources: [],
      }
    }
    return {
      ok: false,
      error: `该记号本地建不了：${t}`,
      /*
       * core 的 `gapExpr` 是它替"有 GAP 后端的宿主"准备的表达式 —— 本项目没有后端，
       * 所以这里只能诚实说"本地构造器没覆盖到"，不拿"待接入"当理由（那是用户看不见的承诺）。
       * 也别把 `gapExpr` 摆到界面上：`DihedralGroup(2000)` 这种串对用户是噪音。
       */
      hint: `本地构造器只覆盖到常见小规模族 ---- 这个记号要么规模超出本地能画的线，要么族还没写`,
    }
  }
  const g = createGroupFromSymbol(n.symbol)
  if (!g) {
    /*
     * core 有时**给了 `symbol` 却建不出来**（`C_4:C_2` 真跑就是这样：`n.ok = true`、
     * `symbol = 'C_{4} \\rtimes_{\\phi} C_{2}'`，但 `createGroupFromSymbol` 返回 null）。
     * 这种"半直积形状的记号"正好是分诊能接的活，别把它甩给用户当"建群失败"。
     */
    if (splitTopLevel(n.canonical ?? '', ':').length === 2) return evalSemidirectNotation(t, n.canonical)
    return { ok: false, error: `本地建群失败：${asciiSymbol(n.symbol)}`, hint: n.hint }
  }
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

/* ── 半直积记号的三态分诊（U51）──────────────────────────── */

/** `canonical` 记号 → 真群：core 建得出就走 core，建不出才落到本地补丁层。 */
function groupFromCanonical(canonical: string): Group | null {
  const inner = parseGroupNotation(canonical)
  if (inner.ok && inner.symbol) {
    const g = createGroupFromSymbol(inner.symbol)
    if (g) return g
  }
  return buildLocally(canonical)
}

/**
 * `N : H` → 真群，或"这不是一个群"。
 *
 * 三种结局（`docs/USABILITY.md` §6.35）：
 *   · **唯一作用** ⇒ 直接建（`C_2^2 : C_3` → `A_4`）—— 记号欠定≠无解，唯一时没有歧义；
 *   · **多解** ⇒ `ok: false` 并列出各候选 —— 选哪个是**数学问题**，不替用户挑；
 *   · **只有平凡作用** ⇒ 这个记号指的其实是直积（说清楚，而不是让用户以为算不出来）。
 *
 * 措辞三条底线：不写"后端"（本项目没有）· 不写 core 那句错话（"找不到非平凡作用"）·
 * 抽样得出的结论要标出"至少"。
 */
function evalSemidirectNotation(text: string, canonical: string): EvalResult {
  const parts = splitTopLevel(canonical, ':')
  if (parts.length !== 2) {
    return {
      ok: false,
      error: `无法识别：${text}`,
      hint: '半直积要写成 `N : H` 两半（如 `C_2^2 : C_3`）',
    }
  }
  /*
   * 报错 / 提示**只用用户自己敲的那串**说话：`canonical` 是 core 归一后的形态
   * （`C_{2}^{4}` 这种带花括号的），摆到 `.composer-status` 这个**纯文本面**上
   * 就是花括号乱飞。用户敲的是 `C_2^4`，就还他 `C_2^4`。
   */
  const typed = splitTopLevel(text, ':')
  const [nRef, hRef] = (typed.length === 2 ? typed : parts).map((p) => p.trim())
  const [N, H] = [groupFromCanonical(parts[0].trim()), groupFromCanonical(parts[1].trim())]
  if (!N) return { ok: false, error: `半直积左边的「${nRef}」本地建不出来`, hint: '先把两半各自写成能建出来的记号' }
  if (!H) return { ok: false, error: `半直积右边的「${hRef}」本地建不出来`, hint: '先把两半各自写成能建出来的记号' }

  const plan = planSemidirect(N, H)
  if (plan.kind === 'ok') {
    return {
      ok: true,
      value: { type: 'group', group: plan.group },
      label: prettySymbol(plan.group.symbol),
      sub: `|G| = ${plan.group.order}`,
      note: plan.sampled
        ? `作用唯一（候选较多，本地做了分层抽样；共 ${plan.actionCount} 个同态）`
        : `作用唯一，这个记号就是一个群`,
      origin: 'input',
      sources: [],
    }
  }
  if (plan.kind === 'trivial') {
    return {
      ok: true,
      value: { type: 'group', group: plan.group },
      label: prettySymbol(plan.group.symbol),
      sub: `|G| = ${plan.group.order}，只有平凡作用，就指直积`,
      note: `${nRef} 上没有 ${hRef} 的非平凡作用，这个记号指的就是直积`,
      origin: 'input',
      sources: [],
    }
  }
  if (plan.kind === 'multi') {
    const kindWord = plan.faithfulOnly ? '忠实作用' : '非平凡作用'
    /*
     * 候选列表**只能列不变量**：同一个记号下不同作用的群，符号长得一模一样
     * （`C_{2}^{4} \rtimes_{\phi} S_{3}`），列符号等于没列；而符号本身带反斜杠，
     * 落在这个纯文本面上也不合适。
     */
    const list = plan.options.map((o) => humanFingerprint(o.fingerprint)).join('；')
    return {
      ok: false,
      error: `${text} 不是一个群：${nRef} 与 ${hRef} 的${kindWord}有 ${plan.options.length} 个本质不同的选法，各自给出不同构的群`,
      hint:
        `候选（按不变量区分）：${list}` +
        (plan.sampled ? `（候选较多，本地做了分层抽样，"${plan.options.length}" 是下界）` : '') +
        `。要指定作用：改用 smallGroup(n, i) 从表里挑一个，或从同一个母群里挑两个子群，走 semidirectProduct（内半直积）`,
    }
  }
  return { ok: false, error: `${text} 本地算不了`, hint: plan.why }
}
