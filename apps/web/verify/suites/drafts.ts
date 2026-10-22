/**
 * 草稿区（三区 P2，2026-10-22）的语义层回归。
 *
 * 拍板十条里能被纯函数钉住的那几条：
 *   · 「存起来」（第 8 条）：往返不丢、空数组 ≠ 没存过、坏数据当没存过；
 *   · 快照也要带草稿（旧快照没有这一项 ⇒ 不报错、按空读）。
 *
 * 剩下的（拖出 / 拖入 / 台自动收）在 `verify/e2e/draft-zone.mjs`。
 */
import { DRAFTS_KEY, loadDrafts, saveDrafts } from '../../src/gal/drafts'
import { parseSnapshot, serializeSnapshot, SNAPSHOT_VERSION } from '../../src/gal/snapshot'
import { eq, ok, suite } from '../harness'

/** 内存版存储（语义层没有 localStorage） */
function memStore() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v)
    },
    removeItem: (k: string) => {
      m.delete(k)
    },
    raw: m,
  }
}

export function run(): void {
  suite('drafts \\cdot P2 草稿区（状态位与持久化）')

  const s = memStore()

  ok('没存过 ⇒ null（而不是空数组）', loadDrafts(s) === null)

  saveDrafts(['A', 'B'], s)
  eq('存两条 → 读回来还是两条', (loadDrafts(s) ?? []).join(','), 'A,B')
  ok('落在独立 key 上（不动 board 那份）', s.raw.has(DRAFTS_KEY))

  saveDrafts([], s)
  const empty = loadDrafts(s)
  ok('存空数组 ⇒ 读回 [] 而不是 null（"清空过" ≠ "没存过"）', Array.isArray(empty) && empty.length === 0)

  // ── 坏数据一律当"没存过" ──
  const bad = (payload: string) => {
    const t = memStore()
    t.setItem(DRAFTS_KEY, payload)
    return loadDrafts(t) === null
  }
  ok('版本不对 ⇒ null', bad(JSON.stringify({ v: 2, ids: ['A'] })))
  ok('ids 不是数组 ⇒ null', bad(JSON.stringify({ v: 1, ids: 'A' })))
  ok('混进非字符串 ⇒ null', bad(JSON.stringify({ v: 1, ids: ['A', 3] })))
  ok('含换行的 id ⇒ null', bad(JSON.stringify({ v: 1, ids: ['A\nB'] })))
  ok('空字符串 id ⇒ null', bad(JSON.stringify({ v: 1, ids: [''] })))
  ok('不是 JSON ⇒ null', bad('{oops'))

  // ── 快照带草稿（旧快照没有这一项 ⇒ 按空读，不报错） ──
  const withDrafts = serializeSnapshot({
    v: SNAPSHOT_VERSION,
    lines: ['G = D_4'],
    pins: {},
    view: null,
    drafts: ['G'],
  })
  const r1 = parseSnapshot(withDrafts)
  ok('带草稿的快照能解析', r1.ok === true, r1.ok ? '' : r1.error)
  eq('草稿原样回来', r1.ok ? (r1.snapshot.drafts ?? []).join(',') : '!', 'G')

  const legacy = serializeSnapshot({ v: SNAPSHOT_VERSION, lines: ['G = D_4'], pins: {}, view: null })
  const r2 = parseSnapshot(legacy)
  ok('旧快照（没有 drafts 这一项）照样解析', r2.ok === true, r2.ok ? '' : r2.error)
  ok('旧快照的草稿是 undefined（App 按空处理）', r2.ok && r2.snapshot.drafts === undefined)

  const broken = JSON.stringify({
    v: SNAPSHOT_VERSION,
    lines: [],
    pins: {},
    view: null,
    drafts: ['A', 7],
  })
  const r3 = parseSnapshot(broken)
  ok('drafts 里混进非字符串 ⇒ 说清坏在哪', r3.ok === false && r3.error.includes('drafts'), r3.ok ? '没报错' : r3.error)
}
