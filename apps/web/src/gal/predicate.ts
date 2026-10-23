import { elementOrder, type Group, type GroupElement } from '@groupviz/core'

/**
 * **元素谓词求值器**（U9-a）—— `{x in A_4 : x^2 = e}` 里冒号右边那一半。
 *
 * ## 为什么是一个独立求值器，而不是给 `evalDef` 加语法
 *
 * `gal/evalDef.ts` 是**定义行**的求值器：它的产物是对象（群 / 集合 / 作用 / 映射），
 * 语法层里 `^` 已经被两件事占着 —— 群记号的阶（`C_2^4`）与元素标号的幂（`r^4`）。
 * 谓词里 `x^2` 的 `^` 是**第三个意思**（元素的幂运算）。把三个意思塞进同一个解析器，
 * 每加一条规则都要回头看另外两条的脸色。
 *
 * 谓词是另一种活：**一个布尔值，对一批元素各算一遍**。它自己就是一门小语言，
 * 所以自己一个文件、自己一套词法，与主求值器**只在两处相接**：
 *   - 元素记号怎么认 → 由调用方注入 `ElementResolver`（`ops.ts` 传 `resolveElementLoose`，
 *     免得本文件 import `ops.ts` 造成循环依赖）；
 *   - 元素的阶 → core 的 `elementOrder(group, el)`（这是 core 的公共入口，
 *     别自己数，见 `algebra/elementOrder.d.ts` 的注释）。
 *
 * ## 关键词裁定（2026-10-23，见 `docs/PROPOSAL-u8-u9.md` §3 关键词表）
 *
 * 现有语法已经占了不少字符，逐条按**上下文**区分，不是让用户自己小心：
 *
 * | 记号 | 这里的身份 | 外面谁占着 | 怎么不打架 |
 * |---|---|---|---|
 * | `e` | 单位元 | `ops.ts#UNIT_TOKENS`（`e`/`id`/`1`）| **复用**同一份判据，不加新词 |
 * | `ord` | 元素阶（一参）| 主求值器的 op `ord(G, elem)`（两参）| 按元数分派，两层各认各的 |
 * | `^` | 元素幂 | 群记号的阶、元素标号的幂 | 本文件只在谓词字符串内求值，不回流 |
 * | `:` | **不出现** | 半直积运算符（`C_2^2:C_3`）| `:` 只属于**糖**那一层：糖在 `normalizeBraces`
 *   里就把整个 `{…}` 换掉了，`:` 根本到不了半直积解析器 |
 * | 单字母 | **永远是变量** | `resolveElementLoose` 把单字母当生成元（循环群里 `r` 就是 `r`）|
 *   **变量遮蔽一切**：先查变量，查不到才落元素解析（`check` 里还要拦"第二个单字母"） |
 *
 * ## 四条刻意的"不做"（每条都是宁可报错也不静默算错）
 *
 * 1. **只许一个变量。** 出现第二个单字母（`{x in S : y^2 = e}`）直接报错 ——
 *    不猜"用户是不是想写另一个变量"，也不让 `y` 悄悄变成循环群的生成元。
 * 2. **不认循环记号元素**（`x = (12)`）。`(` `)` 在谓词里是**分组**；`(12)(34)`
 *    那种写法要靠"括号里是纯数字就当元素"，与分组的歧义无法在本层可靠消解。
 *    要比具体置换，写生成元记号（`x = r2`）。v2 再说。
 * 3. **根节点必须是判定**（`x^2` 单独一个不是谓词）。否则 `filter(G, x, x^2)` 到底是
 *    "筛符合条件的"还是"筛非单位的"，两种读法都通 —— 不许猜。
 * 4. **元素与数字不许互比**（`x = 2` 报错）。`ord(x) = 2` 是数字比数字，
 *    `x^2 = e` 是元素比元素，两条路各有各的写法，混着写没有数学含义。
 * 5. **不做 `x*y = y*x`**（交换性）。那个 `y` 要求在**全群**上遍历 —— 那是量词，
 *    不是对一个元素的筛选。硬塞进本层会让"谓词"与"验证断言"变成两种语义。
 *    交换性走工作台元素表的「in Z?」列（那是现成的属性，不用筛选）。
 *    `*` 保留在语法里，`x*x = e` 与 `x^2 = e` 等价（两条路自己会合流）。
 */

/* ── 对外协议 ──────────────────────────────────────────── */

/**
 * 元素记号怎么认 —— 由调用方注入，避免本文件 import `ops.ts` 形成循环依赖。
 *
 * 必须回两个字段，因为"**精确命中**"与"**宽松回退**"在这个语言里是两件事：
 *
 * | 情形 | 例子 | `exact` | 本层怎么对待 |
 * |---|---|---|---|
 * | 群里的 label / id 直接对上 | `V_4` 的 `a`、`S_3` 的 `12` | `true` | 照用，哪怕是单字母 |
 * | 靠"单生成元群里的单字母"回退 | `C_6` 里写 `y` | `false` | **单字母就拦**（多半是用户想写变量） |
 * | 靠"生成元的幂"回退 | `r2` / `r^4` | `false` | 照用（多字母，没有歧义） |
 *
 * 判据一句话：**单字母只有在它真是这个群的元素时才放行**。这样 `V_4` 的元素
 * `a/b/c` 能写，而 `{x in C_6 : y^2 = e}` 里的 `y` 不会被悄悄当成生成元。
 */
export type ElementResolver = (text: string) => { el: GroupElement; exact: boolean } | null

export type CheckResult = { ok: true } | { ok: false; error: string; hint?: string }

export type CompileResult =
  | { ok: true; pred: CompiledPredicate }
  | { ok: false; error: string; hint?: string }

export interface CompiledPredicate {
  /** 绑定的变量名（`{x in S : …}` 里那个 `x`）—— 与 `in` 左边的字母必须同名 */
  readonly variable: string
  /** 用户敲的原文，报错与展示都用它说话 */
  readonly source: string
  /**
   * 这条谓词能不能在**这个群**上跑。
   *
   * 语法之外还有两件与群有关的事：① 谓词里的元素记号在这个群存不存在
   * （`r2` 只对认 `r2` 的群成立）；② 有没有"第二个单字母"（会被元素解析悄悄吃掉）。
   *
   * 单独一步而不是塞进 `test`：`test` 要对每个元素调一次（最多 144 次），
   * 校验只该做一次。
   */
  check(group: Group, resolve: ElementResolver): CheckResult
  /** 前置条件：`check` 过了。对单个元素求值。 */
  test(group: Group, el: GroupElement, resolve: ElementResolver): boolean
}

/* ── 词法与语法树的错 ──────────────────────────────────── */

class PredicateError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message)
  }
}

/* ── 词法 ──────────────────────────────────────────────── */

type Tok =
  | { k: 'id'; v: string; at: number }
  | { k: 'num'; v: number; at: number }
  | { k: 'sym'; v: '(' | ')' | '^' | '*' | '=' | '!=' | '-'; at: number }

/** 谓词里的保留字。`and` / `or` 是连接词，`ord` 是属性函数。 */
const KEYWORDS = new Set(['and', 'or', 'ord'])

/**
 * 可以当**元素记号**用的单字母 —— 目前只有单位元 `e`。
 *
 * 为什么必须有这一条：下面的"单字母拦截"是为了防 `y` 被 `resolveElementLoose`
 * 当成循环群的生成元，而 `e` 恰好也是单字母、也是最常用的记号。
 * 两件事不能共用一个判据。
 *
 * ⚠️ 只收 `e`，**不收 `1` / `id`**：`1` 在谓词里还要当幂次（`x^1`），
 * 两种读法都通时不许猜（`labeledSet(5)` 那条教训）—— 单位元请写 `e`。
 */
const UNIT_NAMES = new Set(['e'])

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t') {
      i++
      continue
    }
    // `!=` 必须比 `=` 先试，否则永远匹配不到
    if (c === '!' && src[i + 1] === '=') {
      out.push({ k: 'sym', v: '!=', at: i })
      i += 2
      continue
    }
    if (c === '(' || c === ')' || c === '^' || c === '*' || c === '=' || c === '-') {
      out.push({ k: 'sym', v: c, at: i })
      i++
      continue
    }
    if (c >= '0' && c <= '9') {
      let j = i
      while (j < src.length && src[j] >= '0' && src[j] <= '9') j++
      out.push({ k: 'num', v: Number(src.slice(i, j)), at: i })
      i = j
      continue
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i
      while (j < src.length && /[A-Za-z0-9]/.test(src[j])) j++
      out.push({ k: 'id', v: src.slice(i, j), at: i })
      i = j
      continue
    }
    /**
     * 剩下的字符一律拒绝，并且**指路**。
     *
     * 这一档最容易撞三类：中文（`阶(x) = 2`）、比较记号（`≠` `<` `>`）、
     * 反斜杠命令（`\alpha`）。前两类键盘打得出但语法不认，第三类撞的是本项目的
     * "Unicode 不进文本流"铁律（`no-unicode-leak` 走查守着）。
     */
    const why = /[\u4e00-\u9fa5]/.test(c)
      ? '谓词里只能用 ASCII：变量、元素记号、and / or / ord'
      : c === '≠'
        ? '不等号写 !=（键盘能敲的那个）'
        : c === '<' || c === '>'
          ? '谓词只支持 = 与 !=，没有大小比较'
          : `谓词里不认识字符「${c}」`
    throw new PredicateError(why, '可用写法：x^2 = e · ord(x) = 2 · x*y = y*x · x and y')
  }
  return out
}

/* ── 语法树（带静态类型，编译期就把类型错拦住）─────────── */

type ElNode =
  | { k: 'var' }
  | { k: 'elem'; name: string }
  | { k: 'pow'; base: ElNode; exp: number }
  | { k: 'mul'; l: ElNode; r: ElNode }

/** 数字型表达式：`ord(…)` 算出来的阶，或一个整数字面量（`ord(x) = 2` 右边那个）。 */
type NumNode = { k: 'ord'; arg: ElNode } | { k: 'lit'; n: number }

const isNumNode = (n: ScalarNode): boolean => n.k === 'ord' || n.k === 'lit'

type ScalarNode = ElNode | NumNode

type BoolNode =
  | { k: 'cmp'; op: '=' | '!='; l: ScalarNode; r: ScalarNode }
  | { k: 'and'; l: BoolNode; r: BoolNode }
  | { k: 'or'; l: BoolNode; r: BoolNode }

/** 元素表达式里出现的全部 `elem` 记号（`check` 要逐个验） */
function collectElemNames(n: ScalarNode | BoolNode, out: Set<string>): Set<string> {
  switch (n.k) {
    case 'elem':
      out.add(n.name)
      break
    case 'var':
      break
    case 'pow':
      collectElemNames(n.base, out)
      break
    case 'mul':
      collectElemNames(n.l, out)
      collectElemNames(n.r, out)
      break
    case 'ord':
      collectElemNames(n.arg, out)
      break
    case 'lit':
      break
    case 'cmp':
      collectElemNames(n.l, out)
      collectElemNames(n.r, out)
      break
    case 'and':
    case 'or':
      collectElemNames(n.l, out)
      collectElemNames(n.r, out)
      break
  }
  return out
}

/* ── 语法分析（递归下降）──────────────────────────────── */

class Parser {
  private i = 0

  constructor(
    private readonly toks: Tok[],
    private readonly src: string,
    private readonly variable: string,
  ) {}

  parse(): BoolNode {
    const node = this.parseOr()
    if (this.i < this.toks.length) {
      const t = this.toks[this.i]
      throw new PredicateError(
        `谓词里多出一段「${this.src.slice(t.at)}」`,
        '整个条件要能读成一个判断（如 `x^2 = e`）；多个条件用 and / or 连，别用逗号',
      )
    }
    return node
  }

  private peek(): Tok | undefined {
    return this.toks[this.i]
  }

  /** 当前是不是某个符号 —— 窄化成字面量联合，调用处不再写类型断言 */
  private atSym(): Tok & { k: 'sym' } | null {
    const t = this.peek()
    return t && t.k === 'sym' ? t : null
  }

  private isSym(v: '(' | ')' | '^' | '*' | '=' | '!=' | '-'): boolean {
    const t = this.atSym()
    return !!t && t.v === v
  }

  private eatSym(v: '(' | ')' | '^' | '*' | '=' | '!=' | '-'): boolean {
    if (!this.isSym(v)) return false
    this.i++
    return true
  }

  private isId(v: string): boolean {
    const t = this.peek()
    return !!t && t.k === 'id' && t.v === v
  }

  private parseOr(): BoolNode {
    let l = this.parseAnd()
    while (this.isId('or')) {
      this.i++
      l = { k: 'or', l, r: this.parseAnd() }
    }
    return l
  }

  private parseAnd(): BoolNode {
    let l = this.parseCmp()
    while (this.isId('and')) {
      this.i++
      l = { k: 'and', l, r: this.parseCmp() }
    }
    return l
  }

  private parseCmp(): BoolNode {
    const l = this.parseScalar()
    const t = this.atSym()
    if (!t || (t.v !== '=' && t.v !== '!=')) {
      /**
       * 没比较记号就是"裸表达式"当条件 —— **明确拒绝**（模块头"不做"第 3 条）。
       * 报错给两条出口，因为这两种意图都完全可能：
       * `x^2` → 想筛"平方是单位元"的 ⇒ 补 `= e`；想筛"非单位元"的 ⇒ 写 `x != e`。
       */
      throw new PredicateError(
        `条件「${this.src}」没有给出判断（缺 = 或 !=）`,
        `要比的是不是平方等于单位元？写 \`${this.src} = e\`；要排除单位元？写 \`${this.variable} != e\``,
      )
    }
    this.i++
    /**
     * **右边按左边定类型**（这条是纯数字标号的唯一出路）。
     *
     * 左边是 `ord(…)` ⇒ 右边是数字；左边是元素 ⇒ 右边也是元素，
     * 而"元素"可以是**纯数字标号**：`S_3` 的元素就叫 `12` / `23`，`C_6` 叫 `0..5`。
     * 若不分派，`x = 12` 的 `12` 会被词法当成数字、再被当成"元素与数字混比"报错 ——
     * 而它在 `S_3` 里是个正经元素。
     *
     * 反过来的好处：`x^2 = 2` 在 `C_6` 里合法（"平方等于元素 2"），在 `S_3` 里
     * 会报"这个群里没有元素「2」" —— 与真实情况一致，不用猜。
     */
    const r = isNumNode(l) ? this.parseNumRhs() : this.parseElRhs()
    const lNum = isNumNode(l)
    const rNum = isNumNode(r)
    if (lNum !== rNum) {
      throw new PredicateError(
        '元素与数字不能直接比大小相等',
        lNum
          ? `左边是数字（ord 算出来的是阶），右边要给一个数字，如 \`ord(${this.variable}) = 2\``
          : `右边是数字，左边是元素 —— 要比元素请写元素的记号（如 \`${this.variable}^2 = e\`）`,
      )
    }
    return { k: 'cmp', op: t.v, l, r }
  }

  /** 标量（**只能当比较的左边**）：元素表达式，或 `ord(…)` 这种数字 */
  private parseScalar(): ScalarNode {
    if (this.isId('ord')) return this.parseOrd()
    return this.parseEl()
  }

  /** `ord( 元素 )` —— 阶，算出来是数字 */
  private parseOrd(): NumNode {
    this.i++
    if (!this.eatSym('(')) {
      throw new PredicateError('ord 后面要跟括号', '如 `ord(x) = 2`（这个元素的阶是 2）')
    }
    const arg = this.parseEl()
    if (!this.eatSym(')')) throw new PredicateError('ord 的括号没关上', '如 `ord(x) = 2`')
    return { k: 'ord', arg }
  }

  /** 比较的右边，左边是数字时用：只收整数与 `ord(…)` */
  private parseNumRhs(): ScalarNode {
    if (this.isId('ord')) return this.parseOrd()
    const t = this.peek()
    if (t && t.k === 'num') {
      this.i++
      return { k: 'lit', n: t.v }
    }
    throw new PredicateError(
      '等号右边要给一个数字（左边 ord(...) 算出来是阶）',
      `如 \`ord(${this.variable}) = 2\`；要比元素请把元素写在左边：\`${this.variable} = e\``,
    )
  }

  /** 比较的右边，左边是元素时用：纯数字串当**元素标号**（`S_3` 的元素就叫 `12`） */
  private parseElRhs(): ElNode {
    const t = this.peek()
    if (t && t.k === 'num') {
      this.i++
      return { k: 'elem', name: String(t.v) }
    }
    return this.parseEl()
  }

  /** 元素表达式：乘法优先级最低，`*` 或**并列**都算乘 */
  private parseEl(): ElNode {
    let l = this.parsePower()
    for (;;) {
      const t = this.peek()
      if (!t) break
      if (t.k === 'sym' && t.v === '*') {
        this.i++
        l = { k: 'mul', l, r: this.parsePower() }
        continue
      }
      /**
       * **并列即乘**：`x y` 与 `x*y` 同义（数学写法）。
       *
       * 只在下一位**确实能起一个元素表达式**时才吃：`id`（但不是 `and`/`or`/`ord`
       * —— 那三个不是元素，`and`/`or` 由上层截住、`ord` 由 `parseScalar` 截住，
       * 这里再防一次是因为 `x ord(y)` 一旦被读成乘法，报错会指向莫名其妙的地方）
       * 或 `(`。
       */
      if (t.k === 'id' && !KEYWORDS.has(t.v)) {
        l = { k: 'mul', l, r: this.parsePower() }
        continue
      }
      if (t.k === 'sym' && t.v === '(') {
        l = { k: 'mul', l, r: this.parsePower() }
        continue
      }
      break
    }
    return l
  }

  private parsePower(): ElNode {
    const base = this.parseAtom()
    if (this.eatSym('^')) {
      const neg = this.eatSym('-')
      const t = this.peek()
      if (!t || t.k !== 'num') {
        throw new PredicateError(
          '幂次必须是一个整数',
          '如 `x^2`（平方）、`x^-1`（逆）、`x^0`（单位元）；幂次不能是变量或括号',
        )
      }
      this.i++
      return { k: 'pow', base, exp: neg ? -t.v : t.v }
    }
    return base
  }

  private parseAtom(): ElNode {
    const t = this.peek()
    if (!t) throw new PredicateError('谓词不完整', '如 `x^2 = e`')
    if (t.k === 'sym' && t.v === '(') {
      this.i++
      const inner = this.parseEl()
      if (!this.eatSym(')')) throw new PredicateError('括号没关上', '检查左右括号是否配对')
      return inner
    }
    if (t.k === 'id') {
      if (t.v === 'and' || t.v === 'or') {
        throw new PredicateError(
          `「${t.v}」前面缺一个条件`,
          '连接词两边都要有判断，如 `x^2 = e and ord(x) = 2`',
        )
      }
      if (t.v === 'ord') {
        throw new PredicateError(
          'ord 不能当元素用',
          `ord(x) 算出来的是一个数（阶），只能出现在比较里：\`ord(${this.variable}) = 2\``,
        )
      }
      this.i++
      return t.v === this.variable ? { k: 'var' } : { k: 'elem', name: t.v }
    }
    if (t.k === 'num') {
      throw new PredicateError(
        `谓词里不认识数字「${t.v}」`,
        '数字只能当幂次（`x^2`）或阶（`ord(x) = 2`）；元素请用记号（`e` / `r2`）',
      )
    }
    if (t.k === 'sym' && t.v === '-') {
      throw new PredicateError('负号只能写在幂次上', '如 `x^-1`（逆元素）')
    }
    throw new PredicateError(`谓词里不认识「${this.src.slice(t.at)}」`, '如 `x^2 = e`')
  }
}

/* ── 求值 ──────────────────────────────────────────────── */

/** 元素幂：快幂；负次幂先取逆。`x^0` 恒为单位元。 */
function power(group: Group, el: GroupElement, exp: number): GroupElement {
  let base = el
  let n = exp
  if (n < 0) {
    base = group.inverse(base)
    n = -n
  }
  let acc = group.identity
  while (n > 0) {
    if (n & 1) acc = group.multiply(acc, base)
    base = group.multiply(base, base)
    n >>= 1
  }
  return acc
}

/** 求值环境：缓存"名字 → 元素"，免得同一条谓词对 144 个元素重复解析同一个记号。 */
function makeEval(group: Group, el: GroupElement, resolve: ElementResolver) {
  const cache = new Map<string, GroupElement>()
  const elementOf = (name: string): GroupElement => {
    const hit = cache.get(name)
    if (hit) return hit
    const found = resolve(name)
    if (!found) throw new PredicateError(`这个群里没有元素「${name}」`)
    cache.set(name, found.el)
    return found.el
  }

  /** 用函数声明而不是 `const` 箭头：两者互相引用，声明提升省掉 TDZ 的麻烦 */
  function evalEl(n: ElNode): GroupElement {
    const v = evalScalar(n)
    if (typeof v === 'number') throw new PredicateError('这里要一个元素，算出来却是数字')
    return v
  }

  function evalScalar(n: ScalarNode): GroupElement | number {
    switch (n.k) {
      case 'ord':
        return elementOrder(group, evalEl(n.arg))
      case 'lit':
        return n.n
      case 'var':
        return el
      case 'elem':
        return elementOf(n.name)
      case 'pow':
        return power(group, evalEl(n.base), n.exp)
      case 'mul':
        return group.multiply(evalEl(n.l), evalEl(n.r))
    }
  }

  function evalBool(n: BoolNode): boolean {
    switch (n.k) {
      case 'and':
        return evalBool(n.l) && evalBool(n.r)
      case 'or':
        return evalBool(n.l) || evalBool(n.r)
      case 'cmp': {
        const l = evalScalar(n.l)
        const r = evalScalar(n.r)
        if (typeof l === 'number' && typeof r === 'number') {
          return n.op === '=' ? l === r : l !== r
        }
        if (typeof l !== 'number' && typeof r !== 'number') {
          /**
           * 元素相等**比 id**，不比 label。
           *
           * `S_3` 的元素标号是 `12` / `23` / `13`，而 `C_6` 是 `0..5` ——
           * 两个群里的 `0` 不是同一个东西。id 才是"同一个元素"的判据
           * （`CRITERIA` 第 1 条：认元素用 id）。这里两个元素都来自同一个 `group`，
           * 所以 id 可直接比。
           */
          return n.op === '=' ? l.id === r.id : l.id !== r.id
        }
        // 编译期已经拦过（`parseCmp` 的 lNum !== rNum），走到这儿说明两边类型搞混了
        throw new PredicateError('元素与数字不能比')
      }
    }
  }

  return { evalBool }
}

/* ── 入口 ──────────────────────────────────────────────── */

/**
 * 编译一条谓词。**只做语法分析**，与具体群无关（所以同一个变量名不同群可复用）。
 *
 * `variable` 是绑定的变量名（`filter(S, x, …)` 的第二参）。谓词里出现的
 * `variable` 当变量，其余标识符一律当**元素记号**（`e` / `r2` / …）。
 */
export function compilePredicate(text: string, variable: string): CompileResult {
  const src = text.trim()
  if (!src) {
    return { ok: false, error: '条件为空', hint: '如 `x^2 = e`（平方等于单位元）' }
  }
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(variable)) {
    return {
      ok: false,
      error: `变量名「${variable}」不能用`,
      hint: '变量只能是字母开头的 ASCII 名字，如 `x` 或 `g`',
    }
  }
  if (KEYWORDS.has(variable)) {
    return {
      ok: false,
      error: `变量名不能用保留字「${variable}」`,
      hint: `保留字：${[...KEYWORDS].join(' · ')}`,
    }
  }
  if (UNIT_NAMES.has(variable)) {
    return {
      ok: false,
      error: `变量名不能用「${variable}」，它是单位元的记号`,
      hint: `换个字母（如 \`x\`）：\`filter(G, x, ${variable}^2 = ${variable})\` 里 ${variable} 到底是变量还是单位元，两种读法都通 —— 不许猜`,
    }
  }

  let ast: BoolNode
  try {
    ast = new Parser(tokenize(src), src, variable).parse()
  } catch (err) {
    if (err instanceof PredicateError) return { ok: false, error: err.message, hint: err.hint }
    throw err
  }

  const names = [...collectElemNames(ast, new Set())]

  return {
    ok: true,
    pred: {
      variable,
      source: src,
      check(group, resolve) {
        for (const name of names) {
          const hit = resolve(name)
          /**
           * **单字母拦截**（模块头"不做"第 1 条）—— 顺序上必须在"元素存不存在"之前。
           *
           * 两种情形都归它：
           *   · `V_4` 里写 `y` —— 解析不出来。若先报"没有这个元素"，用户会以为是自己
           *     元素记号写错，而真实意图通常是"想要第二个变量"（`x*y = y*x`）；
           *   · `C_6` 里写 `y` —— 靠"单生成元规则"**能**回退成生成元。若放行，
           *     用户以为写了变量、工具当成元素，筛出一堆看不出错的结果。
           *
           * 唯一的例外是**精确命中**：`V_4` 的元素真的叫 `a`、`Q_8` 真的叫 `i` / `j` / `k`，
           * 一刀切会把它们也封了。所以判据是"单字母只在精确命中时放行"。
           */
          /**
           * 判的是**单字母**（`/^[A-Za-z]$/`），不是"单字符" —— 纯数字标号 `2` / `3`
           * 也是单字符，但它是 `C_6` / `S_3` 里正经的元素名，不该被这条规则扫到。
           */
          if (/^[A-Za-z]$/.test(name) && !UNIT_NAMES.has(name) && !(hit && hit.exact)) {
            return {
              ok: false as const,
              /*
               * 文案同时覆盖两种真实意图，所以不写"单字母"这个实现视角的词：
               *   · `{z in S : x^2 = e}` —— 左边写了 z、条件里写 x（笔误）；
               *   · `x*y = y*x` —— 想要第二个变量（交换性）。
               * 两种都是"这个字母不是本谓词的变量"。
               */
              error: `条件里的「${name}」不是变量（这条谓词绑定的变量是「${variable}」）`,
              hint:
                `单字母只认两种：变量名「${variable}」与单位元 \`e\`。` +
                `要用元素请写这个群里真有的记号（如 \`r2\`）；` +
                `要表达"与所有元素交换"（\`x*y = y*x\`）这一类，工作台元素表的「in Z?」列能直接勾`,
            }
          }
          if (!hit) {
            return {
              ok: false as const,
              error: `${group.symbol} 里没有元素「${name}」`,
              hint: '条件里的元素记号必须是这个群里真有的（单位元写 `e`）',
            }
          }
        }
        return { ok: true as const }
      },
      test(group, el, resolve) {
        return makeEval(group, el, resolve).evalBool(ast)
      },
    },
  }
}

/**
 * 从一批元素里筛出满足条件的 —— `filter` op 与分面表格共用的**唯一**入口。
 *
 * 三件事一起做：编译 → 用这个群校验 → 逐个求值。任一步失败就整条失败
 * （**不做部分结果**：少筛几个元素而界面不说，比报错难查得多）。
 */
export function filterElements(
  group: Group,
  elements: readonly GroupElement[],
  variable: string,
  condition: string,
  resolve: ElementResolver,
): { ok: true; kept: GroupElement[] } | { ok: false; error: string; hint?: string } {
  const compiled = compilePredicate(condition, variable)
  if (!compiled.ok) return compiled

  const pred = compiled.pred

  /**
   * **解析记忆化**：`test` 每个元素都会建一份自己的小缓存（它是对外公开的单点接口），
   * 但一次筛 144 个元素时，同一个记号要被解析 144 次。这一层把结果记下来，
   * 于是 `r2` 只解析一次。`null` 也记 —— 否则"这个群里没有 x"会被反复重算。
   */
  const memo = new Map<string, { el: GroupElement; exact: boolean } | null>()
  const memoResolve: ElementResolver = (text) => {
    const hit = memo.get(text)
    if (hit !== undefined) return hit
    const found = resolve(text)
    memo.set(text, found)
    return found
  }

  const checked = pred.check(group, memoResolve)
  if (!checked.ok) return checked

  const kept: GroupElement[] = []
  for (const el of elements) {
    try {
      if (pred.test(group, el, memoResolve)) kept.push(el)
    } catch (err) {
      /**
       * 兜底：core 在"元素表示对不上"的边角会**直接抛**（`N_G` 那次的教训，
       * 见 `evalDef#evalExprGuarded` 的头注）。谓词层不许把异常漏进渲染层，
       * 但也不猜是哪一步 —— 把元素与原始信息一起报出来。
       */
      const detail = err instanceof Error ? err.message : String(err)
      return {
        ok: false,
        error: `条件在元素「${el.label}」上算不了`,
        hint: `原始信息：${detail.slice(0, 120)}`,
      }
    }
  }
  return { ok: true, kept }
}
