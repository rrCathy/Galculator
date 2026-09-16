const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  n: 'ₙ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', p: 'ₚ', m: 'ₘ', r: 'ᵣ', s: 'ₛ',
}

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ',
}

function mapChars(s: string, table: Record<string, string>): string {
  return [...s].map((c) => table[c] ?? c).join('')
}

/** 整数 → 上标形态（`2` → `²`，`12` → `¹²`）。用于阶分解这类展示。 */
export function superscript(n: number): string {
  return mapChars(String(n), SUP)
}

/** 字符串 → 下标形态（`p` → `ₚ`，`12` → `₁₂`）。用于 n_p 这类记号。 */
export function subscript(s: string): string {
  return mapChars(s, SUB)
}

/**
 * 引擎的 TeX 形态群符号 → 近 Unicode 展示形态。
 * 例：`S_{4}` → `S₄`、`C_{2}\times C_{2}` → `C₂×C₂`、`\mathbb{Z}_{6}` → `ℤ₆`。
 * 只做展示，解析仍走引擎原始符号。
 */
export function prettySymbol(raw: string): string {
  let s = raw.replace(/\s+/g, '').replace(/\\left|\\right/g, '')

  // 常见宏先展开
  s = s.replace(/\\mathbb\{Z\}/g, 'Z').replace(/\\mathbb\{C\}/g, 'C')
  s = s.replace(/\\operatorname\{([^{}]*)\}/g, '$1')

  // 多字符上下标 → Unicode
  s = s.replace(/_\{([^{}]*)\}/g, (_, x: string) => mapChars(x, SUB))
  s = s.replace(/\^\{([^{}]*)\}/g, (_, x: string) => mapChars(x, SUP))

  // 单字符上下标
  s = s.replace(/_([0-9a-zA-Z])/g, (_, c: string) => SUB[c] ?? `_${c}`)
  s = s.replace(/\^([0-9a-zA-Z+-])/g, (_, c: string) => SUP[c] ?? `^${c}`)

  // 运算符
  s = s.replace(/\\rtimes/g, '⋊').replace(/\\times/g, '×').replace(/\\cdot/g, '·')
  s = s.replace(/\\oplus/g, '⊕').replace(/\\cong/g, '≅').replace(/\\le/g, '≤')

  // 兜底：去掉残余花括号与反斜杠
  s = s.replace(/\{([^{}]*)\}/g, '$1').replace(/\\/g, '')
  return s
}
