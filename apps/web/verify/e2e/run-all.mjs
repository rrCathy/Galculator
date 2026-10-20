/**
 * 走查并发跑器（2026-10-20）。
 *
 * ## 为什么要有它
 * 36 套走查从前是 `node a.mjs && node b.mjs && …` 的**串行链**：一圈 7 分 03 秒，
 * 而机器有 32 核 —— 只用了 1 个。套件之间本来就是独立的（各自 `chromium.launch()`、
 * 各自一个 page、应用无后端、状态全在内存），没有任何共享，天然可以并发。
 *
 * ## 用法
 *   node verify/e2e/run-all.mjs                  # 全部并行（默认 6 路；本机 32 核，实测 140s）
 *   node verify/e2e/run-all.mjs --jobs=6         # 开更多路（内核多就开）
 *   node verify/e2e/run-all.mjs --fast           # 只跑高频面（7 套，约 1 分钟）
 *   node verify/e2e/run-all.mjs --only=workbench,dock-layout
 *   node verify/e2e/run-all.mjs --jobs=1         # 串行（排障用，顺序才有意义）
 *   node verify/e2e/run-all.mjs --list           # 只列套件名
 *
 * `GAL_BASE` 照旧透传（默认由各套件自己取 `http://127.0.0.1:5273`）。
 *
 * ## 并发安全
 * 各套件只写自己的 `docs/assets/*.png`（60 个产物里只有
 * `u11-first-iso-square.png` 被两套写，最后一次写入胜出 —— 只是截图产物，
 * 没有断言读它）。
 */

import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 高频面的「快跑」集合：改 UI / 工作台 / 栏目时先跑这一组。 */
const FAST = [
  'workbench',
  'dock-layout',
  'narrow-docks',
  'radial-menu',
  'layout-spec',
  'dark-contrast',
  'no-unicode-leak',
]

const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const has = (name) => argv.includes(`--${name}`)

const all = readdirSync(HERE)
  .filter((f) => f.endsWith('.mjs') && f !== 'run-all.mjs' && !f.startsWith('_'))
  .map((f) => f.replace(/\.mjs$/, ''))
  .sort()

if (has('list')) {
  console.log(all.join('\n'))
  process.exit(0)
}

const only = arg('only', '')
const picked = only
  ? only
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : has('fast')
    ? FAST
    : all

const unknown = picked.filter((p) => !all.includes(p))
if (unknown.length) {
  console.error(`没有这些套件：${unknown.join(', ')}`)
  process.exit(2)
}

const jobs = Math.max(1, Number(arg('jobs', '6')) || 6)
const t0 = Date.now()

console.log(`== e2e：${picked.length} 套 · ${jobs} 路并发 · ${process.env.GAL_BASE ?? '默认 5273'}`)

/** 跑一套，返回 { name, ok, pass, fail, ms, out } */
function runOne(name) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(process.execPath, [join(HERE, `${name}.mjs`)], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('close', (code) => {
      const m = [...out.matchAll(/(\d+)\s+PASS\s*\/\s*(\d+)\s+FAIL/g)].pop()
      const pass = m ? Number(m[1]) : 0
      const fail = m ? Number(m[2]) : -1
      resolve({
        name,
        ok: code === 0 && fail === 0,
        pass,
        fail,
        ms: Date.now() - started,
        out,
      })
    })
  })
}

const queue = [...picked]
const results = []
let running = 0

await new Promise((done) => {
  const pump = () => {
    if (queue.length === 0 && running === 0) return done()
    while (running < jobs && queue.length > 0) {
      const name = queue.shift()
      running++
      runOne(name).then((r) => {
        running--
        results.push(r)
        const tag = r.ok ? 'PASS' : 'FAIL'
        const secs = (r.ms / 1000).toFixed(1)
        console.log(`  ${tag}  ${name.padEnd(20)} ${String(r.pass).padStart(3)} 通过  ${secs}s`)
        pump()
      })
    }
  }
  pump()
})

const bad = results.filter((r) => !r.ok)
const totalPass = results.reduce((s, r) => s + r.pass, 0)
const totalFail = results.reduce((s, r) => s + Math.max(0, r.fail), 0)
const secs = ((Date.now() - t0) / 1000).toFixed(1)

console.log('')
if (bad.length) {
  for (const b of bad) {
    console.log(`── ${b.name} 失败（${b.pass} PASS / ${b.fail} FAIL）`)
    const lines = b.out.split(/\r?\n/).filter((l) => /FAIL|Error|error:/.test(l))
    console.log(lines.slice(0, 12).map((l) => '   ' + l.trim()).join('\n'))
    console.log('')
  }
}
console.log(
  `合计 ${results.length} 套 · ${totalPass} 通过 · ${totalFail} 失败 · 墙钟 ${secs}s（${jobs} 路）`,
)
process.exit(bad.length ? 1 : 0)
