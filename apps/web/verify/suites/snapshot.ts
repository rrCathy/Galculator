/**
 * 视图快照（缺口 ⑫）的语义层回归。
 *
 * 对应 `docs/USABILITY.md` §6 的 ⑫（用户实测反馈第 1 条）：
 * "可以把视图保存起来，下次打开网站还能导入视图"。
 *
 * 这里只验**序列化 / 解析**这一半 —— 它是纯函数，能被断言直接钉住：
 *   · 往返不丢东西（定义行 / 钉住 / 视口 / 开关）
 *   · 坏快照**说清坏在哪一项**，且不会拿一张残图糊弄过去
 *   · 文本形态仍守"键盘打得出来"那条纪律（快照会出现在输入框里，是文本流）
 * 真浏览器里"点一下导出、刷新、贴回来"那一半在 `verify/e2e/snapshot.mjs`。
 */
import {
  parseSnapshot,
  serializeSnapshot,
  SNAPSHOT_VERSION,
  type Snapshot,
} from '../../src/gal/snapshot'
import { build, eq, ok, suite } from '../harness'

/**
 * 与 `verify/e2e/no-unicode-leak.mjs` 同一份判据
 * （ASCII · 中文 · 中文标点 · 中文引号 · 空白）。
 *
 * 空白（尤其 `\n`）要放行 —— 快照是多行 JSON，它整段住在 textarea 里。
 * 判据只管"键盘上有没有这个键"，不管排版。
 */
const ALLOWED = /[\x20-\x7E\u3000-\u303F\u4E00-\u9FFF\uFF00-\uFFEF\u2018-\u201D\n\r\t]/
const badChars = (s: string) => [...new Set([...s].filter((c) => !ALLOWED.test(c)))]

const SAMPLE: Snapshot = {
  v: SNAPSHOT_VERSION,
  lines: ['G = S_4', 'Syl = Syl_p(G, 3)', 'Omega= asSet(Syl)', 'A = conjOn(G, Omega)'],
  pins: { A: { x: 120, y: -48 }, Omega: { x: 0, y: 0 } },
  view: { k: 1.25, tx: 12, ty: -30 },
  autoFirstIso: false,
}

export function run(): void {
  suite('snapshot \\cdot ⑫ 视图快照（导出 / 导入的文本形态）')

  {
    const text = serializeSnapshot(SAMPLE)
    const r = parseSnapshot(text)
    ok('往返：解析成功', r.ok, r.ok ? '' : r.error)
    if (r.ok) {
      const s = r.snapshot
      eq('往返：版本', s.v, SNAPSHOT_VERSION)
      eq('往返：定义行逐字不变', s.lines.join(' | '), SAMPLE.lines.join(' | '))
      eq('往返：钉住的个数', Object.keys(s.pins).length, 2)
      eq('往返：钉住的位置不变', `${s.pins.A.x},${s.pins.A.y}`, '120,-48')
      eq('往返：视口 k', s.view?.k, 1.25)
      eq('往返：视口 ty', s.view?.ty, -30)
      eq('往返：开关跟着走', s.autoFirstIso, false)
    }
    eq('快照文本里没有键盘打不出的字符', badChars(text).join(''), '')
  }

  {
    // 缺省项：pins / view 可以不给 → 退成"没有钉住 / 跟随自动 fit"，
    // 但 `autoFirstIso` 不给就是**不给**（不是 false）——否则关开关的语义会被悄悄翻转。
    const r = parseSnapshot(JSON.stringify({ v: 1, lines: ['G = C_6'] }))
    ok('缺省项：只给 lines 也能解析', r.ok, r.ok ? '' : r.error)
    if (r.ok) {
      eq('缺省项：钉住退成空表', Object.keys(r.snapshot.pins).length, 0)
      eq('缺省项：视口退成 null（跟随自动 fit）', r.snapshot.view, null)
      eq('缺省项：开关不给就是 undefined', String(r.snapshot.autoFirstIso), 'undefined')
    }
  }

  {
    // 空定义行也是合法视图（空画布），不该被当成坏快照
    const r = parseSnapshot(serializeSnapshot({ v: 1, lines: [], pins: {}, view: null }))
    eq('空画布快照合法', r.ok, true)
  }

  /* ── 坏快照：每一项都要报出**坏在哪** ─────────────────────── */

  const errOf = (raw: string) => {
    const r = parseSnapshot(raw)
    return r.ok ? '' : r.error
  }

  ok('空文本框：报「把快照文本粘进来」', errOf('   ').includes('粘进来'), errOf('   '))
  ok('不是 JSON：报「不是合法的 JSON」', errOf('{ 这不是 json').includes('合法的 JSON'), errOf('{ 这不是 json'))
  ok('最外层是数组：报「最外层应该是对象」', errOf('[1,2,3]').includes('最外层'), errOf('[1,2,3]'))
  ok('版本不认识：报出两边版本号', errOf('{"v":9,"lines":[]}').includes('v = 9'), errOf('{"v":9,"lines":[]}'))
  ok('lines 不是数组：报 lines', errOf('{"v":1,"lines":"G = C_6"}').includes('lines'), errOf('{"v":1,"lines":"G = C_6"}'))
  ok('lines 里混了非字符串：报 lines', errOf('{"v":1,"lines":["G = C_6",7]}').includes('lines'), errOf('{"v":1,"lines":["G = C_6",7]}'))
  ok('pins 里混了非对象：报 pins', errOf('{"v":1,"lines":[],"pins":{"A":5}}').includes('pins'), errOf('{"v":1,"lines":[],"pins":{"A":5}}'))
  ok('pins 的坐标不是数：报 pins', errOf('{"v":1,"lines":[],"pins":{"A":{"x":"1","y":2}}}').includes('pins'), errOf('{"v":1,"lines":[],"pins":{"A":{"x":"1","y":2}}}'))
  ok('pins 的坐标是 NaN：报 pins', errOf('{"v":1,"lines":[],"pins":{"A":{"x":null,"y":2}}}').includes('pins'), errOf('{"v":1,"lines":[],"pins":{"A":{"x":null,"y":2}}}'))
  ok('view 缺字段：报 view', errOf('{"v":1,"lines":[],"view":{"k":1}}').includes('view'), errOf('{"v":1,"lines":[],"view":{"k":1}}'))
  ok('view 是数字：报 view', errOf('{"v":1,"lines":[],"view":1}').includes('view'), errOf('{"v":1,"lines":[],"view":1}'))

  {
    // 报错语本身也得守那条纪律（它是要显示给用户看的）
    const msgs = [
      errOf(''),
      errOf('{ 这不是 json'),
      errOf('[1,2,3]'),
      errOf('{"v":9,"lines":[]}'),
      errOf('{"v":1,"lines":"x"}'),
      errOf('{"v":1,"lines":[],"pins":{"A":5}}'),
      errOf('{"v":1,"lines":[],"view":{"k":1}}'),
    ]
    eq('每一条报错语都没有键盘打不出的字符', msgs.map((m) => badChars(m).join('')).join(''), '')
  }

  {
    // 钉住的 id 就是**画布节点 id**（对象名）—— 换一套定义行，id 也跟着换。
    // 这条钉住的是"快照与图靠同一个名字对齐"，导错了名字就是导错了图。
    const b = build(['G = S_4', 'Syl = Syl_p(G, 3)', 'Omega= asSet(Syl)', 'A = conjOn(G, Omega)'])
    const snap: Snapshot = { v: 1, lines: b.lineStates.map((s) => s.raw), pins: { A: { x: 0, y: 60 } }, view: null }
    const r = parseSnapshot(serializeSnapshot(snap))
    ok('真实定义行也能量进快照', r.ok, r.ok ? '' : r.error)
    if (r.ok) {
      const b2 = build(r.snapshot.lines)
      ok('导入后画布上仍有这个名字的节点', b2.objects.some((o) => o.id === 'A'))
      eq('导入后定义行逐字一致', r.snapshot.lines.join(' | '), b.lineStates.map((s) => s.raw).join(' | '))
    }
  }
}
