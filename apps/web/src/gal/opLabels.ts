import { OPS, type OpDef } from './ops'

/**
 * **操作的中文显示名**（2026-10-06，工作台 v2 / W1）。
 *
 * ## 为什么要有这张表
 *
 * 用户 2026-10-06 实测三条：
 *
 * > 「具体功能为什么不用中文？为什么中英文混杂？你想给谁用？」
 *
 * 病根在 **U54 把"输入语法"与"显示名"合并了**：`interaction#menuLabel` 从 `notation`
 * 派生（切 `(` 之前那段），于是**能敲的 ASCII 名字成了界面上唯一的名字** ——
 * 菜单、按钮、工作台条目全是 `directProduct(A, B)` 这种函数串。
 *
 * ⇒ 两件事本来就该分开：
 *
 * | | 是什么 | 长什么样 | 谁看 |
 * |---|---|---|---|
 * | `OpDef.notation` | **输入语法** | ASCII 函数式，照抄能敲 | 想敲命令的人 |
 * | `OP_LABEL[id]` | **显示名** | 中文 | 所有人 |
 *
 * ⚠️ **只做显示，不碰解析**：解析层仍只认 ASCII（U54 不动），中文不参与解析。
 *
 * ## 两条硬约束（不许破）
 *
 * ① **键盘打不出来的字符不许出现在文本流里**（用户 2026-09-27 立，走查
 *    `verify/e2e/no-unicode-leak.mjs` 守着）。所以这张表里**只准有**
 *    ASCII + 中文 + 中文标点 + 全角符号 —— `×` `⋊` `≤` `⊴` `φ` `↷` 这些
 *    **一个都不许进**。要显示这类符号只有一条路：**交给 KaTeX 排版**（见 `OP_KEY_TEX`）。
 *    这就是为什么 `eulerPhi` 叫「欧拉函数」而不是「欧拉 φ」。
 * ② **`assertEveryOpNamed()` 加载即断言**：45 条 op 一条不落地要有名字。
 *    加了新 op 却忘了写名字 ⇒ **模块加载就抛**，而不是"在界面上悄悄退回英文"。
 *    （与 `gal/workbench.ts#assertPartition` 同款纪律：宁可炸在加载期，不要烂在界面上。）
 */

/**
 * op 的中文显示名。
 *
 * 取名口径：
 *   · **短**（要进悬浮球按钮、工作台键位），歧义靠 `OpDef.doc` 的 tooltip 补；
 *   · 学界通用的专名保留原文（`Sylow`），其余一律中文；
 *   · **不带** `Z(G)` / `C_G(x)` 这类记号 —— 记号进 tooltip 与信息面板，
 *     按钮上要的是"一眼认得出这是什么功能"。
 */
export const OP_LABEL: Record<string, string> = {
  /* ── 造（表格类，必须逐项填）────────────── */
  structure: '造结构',
  map: '建同态',
  customAction: '自定义作用',

  /* ── 群与分解 ────────────────────────── */
  directProduct: '直积',
  semidirectProduct: '半直积',
  quotient: '商群',
  closure: '闭包',
  center: '中心',
  commutatorGroup: '换位子群',
  automorphismGroup: '自同构群',
  innerAutomorphismGroup: '内自同构群',
  elementOrder: '元素阶',

  /* ── 子群与正规性 ────────────────────── */
  subgroups: '所有子群',
  maximalSubgroups: '极大子群',
  normalSubgroups: '正规子群',
  sylow: 'Sylow 子群',
  pSubgroups: 'p-子群',
  centralizer: '中心化子',
  normalizer: '正规化子',

  /* ── 作用与轨道 ──────────────────────── */
  conjugationAction: '共轭作用',
  leftTranslationAction: '左平移作用',
  conjugationOnSet: '集合上的共轭',
  cosetAction: '陪集作用',
  orbits: '轨道',
  stabilizers: '稳定子',
  fixedPoints: '不动点',
  orbitCount: '轨道数',

  /* ── 映射的核与像 ────────────────────── */
  kernel: '核',
  image: '像',

  /* ── 集合运算 ────────────────────────── */
  intersection: '交',
  union: '并',
  difference: '差',
  productSet: '积集',
  underlyingSet: '底层集合',

  /* ── 凭空造 / 关系 / 算术（不在工作台，但也要有名字）── */
  pointSet: '造点集',
  labeledSet: '按标号造集合',
  smallGroup: '从群库导入',
  contains: '包含',
  isomorphism: '同构',
  factorize: '质因数分解',
  binomial: '二项式系数',
  binomialMod: '模二项式系数',
  gcd: '最大公约数',
  lcm: '最小公倍数',
  eulerPhi: '欧拉函数',
}

/**
 * **键面符号**（W4 用）—— 工作台符号键盘上那个键画什么。
 *
 * ⚠️ 这里是 **KaTeX 源码**，不是可直接显示的文本：`×` `⋊` `≤` `⊴` 这些字符
 * **键盘打不出来**，直接进文本流会被 `no-unicode-leak` 判红。它们只准经
 * `<Tex>` 排版成字形（用户 2026-09-27 的方案：**显示是排版，文本流是 ASCII**）。
 *
 * `keyAscii` 是同一枚键的**纯文本替身**：给 `title` / 回归断言 / 无障碍用，
 * 必须全 ASCII。
 */
export interface OpKey {
  /** KaTeX 源（画出键面上的符号）*/
  tex: string
  /** 纯文本替身（全 ASCII，给 title 与断言用）*/
  ascii: string
}

export const OP_KEY: Record<string, OpKey> = {
  structure: { tex: '\\langle *, \\rangle', ascii: 'op-table' },
  map: { tex: '\\to', ascii: '->' },
  customAction: { tex: '\\curvearrowright', ascii: 'act' },

  directProduct: { tex: '\\times', ascii: 'x' },
  semidirectProduct: { tex: '\\rtimes', ascii: 'rtimes' },
  quotient: { tex: '/', ascii: '/' },
  closure: { tex: '\\langle\\;\\rangle', ascii: 'gen' },
  center: { tex: 'Z', ascii: 'Z' },
  commutatorGroup: { tex: '[G,\\,G]', ascii: '[G,G]' },
  automorphismGroup: { tex: '\\operatorname{Aut}', ascii: 'Aut' },
  innerAutomorphismGroup: { tex: '\\operatorname{Inn}', ascii: 'Inn' },
  elementOrder: { tex: '\\operatorname{ord}', ascii: 'ord' },

  subgroups: { tex: '\\le', ascii: '<=' },
  maximalSubgroups: { tex: '\\max', ascii: 'max' },
  normalSubgroups: { tex: '\\trianglelefteq', ascii: 'norm' },
  sylow: { tex: '\\operatorname{Syl}', ascii: 'Syl' },
  pSubgroups: { tex: 'p', ascii: 'p' },
  centralizer: { tex: 'C_G', ascii: 'C_G' },
  normalizer: { tex: 'N_G', ascii: 'N_G' },

  conjugationAction: { tex: '\\curvearrowright', ascii: 'conj' },
  leftTranslationAction: { tex: '\\circlearrowleft', ascii: 'left' },
  conjugationOnSet: { tex: '\\Omega\\!\\curvearrowright', ascii: 'conj-set' },
  cosetAction: { tex: 'G/H\\!\\curvearrowright', ascii: 'coset' },
  orbits: { tex: '\\operatorname{Orb}', ascii: 'Orb' },
  stabilizers: { tex: '\\operatorname{Stab}', ascii: 'Stab' },
  fixedPoints: { tex: '\\operatorname{Fix}', ascii: 'Fix' },
  orbitCount: { tex: '\\#\\operatorname{Orb}', ascii: '#Orb' },

  kernel: { tex: '\\ker', ascii: 'ker' },
  image: { tex: '\\operatorname{im}', ascii: 'im' },

  intersection: { tex: '\\cap', ascii: 'cap' },
  union: { tex: '\\cup', ascii: 'cup' },
  difference: { tex: '\\setminus', ascii: 'diff' },
  productSet: { tex: '\\times_{s}', ascii: 'prod' },
  underlyingSet: { tex: '\\operatorname{asSet}', ascii: 'asSet' },

  pointSet: { tex: '\\{1,\\dots,n\\}', ascii: 'n' },
  labeledSet: { tex: '\\{a,b,c\\}', ascii: 'a,b,c' },
  smallGroup: { tex: '\\operatorname{lib}', ascii: 'lib' },
  contains: { tex: '\\subseteq', ascii: 'sub' },
  isomorphism: { tex: '\\cong', ascii: 'iso' },
  factorize: { tex: '\\operatorname{fac}', ascii: 'fac' },
  binomial: { tex: '\\binom{n}{k}', ascii: 'C(n,k)' },
  binomialMod: { tex: '\\binom{n}{k}_{p}', ascii: 'Cmod' },
  gcd: { tex: '\\gcd', ascii: 'gcd' },
  lcm: { tex: '\\operatorname{lcm}', ascii: 'lcm' },
  eulerPhi: { tex: '\\varphi', ascii: 'phi' },
}

/**
 * 这条 op 在界面上叫什么（**中文**）。
 *
 * 兜底返回 `op.id` —— 但正常情况下**走不到兜底**：`assertEveryOpNamed()` 已在
 * 加载期拦过。留兜底只是不让一个漏网的名字把整块 UI 崩掉。
 */
export function opName(op: OpDef): string {
  return OP_LABEL[op.id] ?? op.id
}

/** 这枚键画什么（KaTeX 源 + ASCII 替身）。 */
export function opKey(op: OpDef): OpKey {
  return OP_KEY[op.id] ?? { tex: op.id, ascii: op.id }
}

/**
 * 加载即断言：**45 条 op 一条不落地要有中文名**（`OP_LABEL`）。
 *
 * 与 `gal/workbench.ts#assertPartition` 同款：加了新 op 忘了写名字 ⇒ 模块加载就抛。
 * 不这么做的话，新 op 会在界面上**悄悄退回英文 id** —— 正是用户这次骂的那件事。
 */
function assertEveryOpNamed(): void {
  const missing = OPS.filter((o) => !(o.id in OP_LABEL)).map((o) => o.id)
  if (missing.length > 0) {
    throw new Error(
      `opLabels：${missing.length} 条 op 没有中文显示名：${missing.join(', ')}\n` +
        `在 OP_LABEL 里补上名字。这是纪律，不是可选 —— 否则界面上会退回英文函数名。`,
    )
  }
  const extra = Object.keys(OP_LABEL).filter((id) => !OPS.some((o) => o.id === id))
  if (extra.length > 0) {
    throw new Error(`opLabels：${extra.join(', ')} 不在 OPS 里（名字表有僵尸条目）`)
  }
}
assertEveryOpNamed()

/**
 * 加载即断言：名字里不许有**键盘打不出来的字符**（用户 2026-09-27 立的规矩）。
 *
 * 放行集与 `verify/e2e/no-unicode-leak.mjs` 的 `ALLOWED` **同一口径**：
 * ASCII + 中文 + 中文标点 + 全角符号 + 弯引号。
 *
 * ⚠️ 这条断言是 2026-10-06 差点栽的坑：键面符号那套（`×` `⋊` `≤` `⊴`）**不能**
 * 直接写进名字 —— 它们只能经 `<Tex>` 排版。名字表里出现一个 `φ` 都是红的
 * （所以 `eulerPhi` 叫「欧拉函数」）。
 */
function assertNamesAreTypable(): void {
  const ALLOWED = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D]/
  const bad = Object.entries(OP_LABEL)
    .map(([id, name]) => ({ id, bad: [...new Set([...name].filter((c) => !ALLOWED.test(c)))] }))
    .filter((r) => r.bad.length > 0)
  if (bad.length > 0) {
    throw new Error(
      `opLabels：中文名里有键盘打不出来的字符（用户 2026-09-27 立的规矩）：\n` +
        bad.map((b) => `  ${b.id}: ${b.bad.join('')}`).join('\n') +
        `\n符号要显示只能走 KaTeX（见 OP_KEY.tex）。`,
    )
  }
}
assertNamesAreTypable()
