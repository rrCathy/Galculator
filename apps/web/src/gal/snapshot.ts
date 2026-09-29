/**
 * 视图快照（缺口 ⑫）—— **把整套视图压成一段文本**，能复制出去、能贴回来。
 *
 * 用户的实测反馈原话："可以考虑把视图保存起来，下次打开网站还能导入视图"。
 *
 * 一段快照装三样东西：
 *   · `lines` —— 定义行。**对象表是 lines 的纯函数**（`build.ts`），
 *     装下它就等于装下了整张图；
 *   · `pins`  —— 钉住的位置（决策 ④ 那个持久化对象，世界坐标）；
 *   · `view`  —— 用户自己调过的视口（pan / zoom）；`null` = 跟随自动 fit。
 * 另外带上 `autoFirstIso`（缺口 ⑭ 的开关）—— 它决定画布上**多长出什么**，
 * 不带上就不是同一张图了。
 *
 * **为什么是文本而不是文件**：与全项目的文本哲学一致（定义行、证明参数槽都是文本），
 * 用户想把它贴进笔记 / 聊天 / issue 都行；也免得为一次导出引入下载与 File API。
 *
 * 文本形态取 JSON：纯 ASCII，而 `lines` 里本来就是 ASCII 的简化 LaTeX（U25 定案）。
 * 解析**逐项校验**并说清坏在哪一项 —— 静默吞下一张"残图"比报错更坏。
 */

export interface SnapshotPin {
  x: number
  y: number
}

export interface SnapshotView {
  k: number
  tx: number
  ty: number
}

export interface Snapshot {
  v: 1
  lines: string[]
  pins: Record<string, SnapshotPin>
  view: SnapshotView | null
  autoFirstIso?: boolean
}

export const SNAPSHOT_VERSION = 1

/** 快照 → 文本。缩进两格，便于贴进文件后直接读 / diff。 */
export function serializeSnapshot(s: Snapshot): string {
  return JSON.stringify(s, null, 2)
}

/** 能拿来做快照的"当前视图"—— 由画布上报（钉住 + 视口）。 */
export interface SnapshotViewState {
  pins: Record<string, SnapshotPin>
  view: SnapshotView | null
}

export type ParseResult = { ok: true; snapshot: Snapshot } | { ok: false; error: string }

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function normalizePins(v: unknown): { ok: true; pins: Record<string, SnapshotPin> } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, pins: {} }
  if (typeof v !== 'object' || Array.isArray(v)) return { ok: false }
  const out: Record<string, SnapshotPin> = {}
  for (const [id, p] of Object.entries(v as Record<string, unknown>)) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false }
    const q = p as { x?: unknown; y?: unknown }
    if (!isFiniteNumber(q.x) || !isFiniteNumber(q.y)) return { ok: false }
    out[id] = { x: q.x, y: q.y }
  }
  return { ok: true, pins: out }
}

/** `null` / 缺省 = 没有视口（跟随自动 fit）；`undefined` 表示这一项是坏的。 */
function normalizeView(v: unknown): SnapshotView | null | undefined {
  if (v === undefined || v === null) return null
  if (typeof v !== 'object' || Array.isArray(v)) return undefined
  const q = v as { k?: unknown; tx?: unknown; ty?: unknown }
  if (!isFiniteNumber(q.k) || !isFiniteNumber(q.tx) || !isFiniteNumber(q.ty)) return undefined
  return { k: q.k, tx: q.tx, ty: q.ty }
}

/**
 * 文本 → 快照。每一项都校验，失败时返回**一句能照做的中文**（不写 LaTeX 命令，
 * 它是报错语，走纯文本那面）。
 */
export function parseSnapshot(text: string): ParseResult {
  const raw = text.trim()
  if (!raw) return { ok: false, error: '框里是空的，先把快照文本粘进来' }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, error: '这不是合法的 JSON，复制的时候可能漏了一段' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: '快照的最外层应该是一个对象' }
  }
  const o = data as Record<string, unknown>

  if (o.v !== SNAPSHOT_VERSION) {
    return {
      ok: false,
      error: `版本对不上（快照上写的是 v = ${String(o.v)}，这个页面只认 v = ${SNAPSHOT_VERSION}）`,
    }
  }
  if (!Array.isArray(o.lines) || o.lines.some((l) => typeof l !== 'string')) {
    return { ok: false, error: 'lines 应该是字符串数组，一行一条定义' }
  }
  const pins = normalizePins(o.pins)
  if (!pins.ok) return { ok: false, error: 'pins 应该是「对象名: { x, y }」这样的表' }
  const view = normalizeView(o.view)
  if (view === undefined) return { ok: false, error: 'view 应该是 null，或者 { k, tx, ty } 三个数' }

  const snapshot: Snapshot = {
    v: SNAPSHOT_VERSION,
    lines: o.lines as string[],
    pins: pins.pins,
    view,
  }
  if (typeof o.autoFirstIso === 'boolean') snapshot.autoFirstIso = o.autoFirstIso
  return { ok: true, snapshot }
}
