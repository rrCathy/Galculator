/**
 * 断言小框架（零依赖）。
 *
 * 跑法见 `verify/README.md`：vite SSR 打包后 node 直跑。
 *
 * 为什么把断言放进仓库（而不是临时目录 `dot-tmp` 里）：
 * 2026-09-19 之前这套脚本一直住在 `.tmp-verify` 目录，被 `.gitignore` 忽略 ——
 * 一次临时目录清理就丢了 363 条断言（ROADMAP 里引用的 U0–U7 数字再无法复现）。
 * **回归线是资产，不是临时物。**
 *
 * 坑：块注释里**不能出现**"星号 + 斜杠"这个组合（哪怕是在行内代码里写通配路径）——
 * 它会提前终止注释，后面整段中文变成代码。本文件第一版就栽在这上面。
 */
import { buildLines, type LineState } from '../src/gal/build'
import type { GalObject } from '../src/gal/types'

type Ctx = { pass: number; fail: number; group: string; fails: string[] }

const ctx: Ctx = { pass: 0, fail: 0, group: '', fails: [] }

export function suite(name: string): void {
  ctx.group = name
  // 注意：输出装饰一律用 ASCII。rolldown 1.2.8 的 transform 对模板串里的
  // 换行转义 + 多字节字符、以及 U+2500（制表横线）都会报 "Invalid ..." 而构建失败
  //（连写在注释里也炸，因为它先做 transform）。纯工具链问题，不是源码问题。
  console.log('')
  console.log(`== ${name} ==`)
}

export function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    ctx.pass++
    console.log(`  PASS  ${name}`)
  } else {
    ctx.fail++
    const msg = `[${ctx.group}] ${name}${detail ? ` — ${detail}` : ''}`
    ctx.fails.push(msg)
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** 值比较。**只用于标量 / 字符串**——领域对象（Group）有循环引用，`JSON.stringify` 会抛。 */
export function eq(name: string, got: string | number | boolean | null | undefined, want: string | number | boolean | null | undefined): void {
  ok(name, String(got) === String(want), `got=${String(got)} want=${String(want)}`)
}

/**
 * 定义行 → 对象表 / 行状态 的便捷入口。
 *
 * `byId` 找对象（含工具补出来的隐式对象）；`line` 找行状态；`err` 取某行的错误。
 */
export function build(lines: string[]) {
  const r = buildLines(lines)
  return {
    objects: r.objects,
    lineStates: r.lineStates,
    byId: (id: string): GalObject | undefined => r.objects.find((o) => o.id === id),
    line: (name: string): LineState | undefined => r.lineStates.find((s) => s.name === name),
    err: (name: string): string | null => {
      const s = r.lineStates.find((x) => x.name === name)
      return s && !s.ok ? (s.error ?? '?') : null
    },
    /** 某一行的**阶**（结果必须是群值）。 */
    orderOf: (name: string): number | null => {
      const o = r.objects.find((x) => x.id === name)
      return o?.value.type === 'group' ? o.value.group.order : null
    },
  }
}

export function summary(): number {
  console.log('')
  console.log(`${ctx.pass} PASS / ${ctx.fail} FAIL`)
  if (ctx.fail > 0) {
    console.log('失败项：')
    for (const f of ctx.fails) console.log(`  · ${f}`)
  }
  return ctx.fail
}
