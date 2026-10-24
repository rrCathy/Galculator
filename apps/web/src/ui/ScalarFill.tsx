import { useMemo, useState } from 'react'
import { elementOrder, factorizeOrder, type Group } from '@groupviz/core'
import { elementNotation, type OpDef } from '../gal/ops'

/**
 * **补参条的标量位**（U8-b，2026-10-23）—— 把"裸 input"换成"能点着选"。
 *
 * ## 为什么这是 U8 里最该做的一件事
 *
 * 「点着就能做，不用记语法」这条目标，卡壳的地方一直不是菜单（菜单列得挺全），
 * 而是**标量参数**：`ord(G, ▢)` 那个 ▢ 从前是个空 input，用户得知道
 * 「`S_3` 的对换叫 `12`」才填得进去 —— 而这个名字**界面上从来没写过**。
 * 元素表里写着、报错里提示过，但选 op 的那一刻看不到。
 *
 * ## 三档各给什么
 *
 * | 参数档 | 候选从哪来 | 为什么不给下拉框 |
 * |---|---|---|
 * | `element` | 上下文群的元素，**按阶升序**排（单位元与低阶元素先出现，常用的就在眼前）| 144 个元素的群给全量下拉等于没筛；所以"前 N + 搜索" |
 * | `prime` | ≤ \|G\| 的素数 | 素数本来就少（≤144 只有 34 个，实际常用 2/3/5/7），全列 |
 * | `int` | 不列候选，给 **− / +** 步进 | 整数是自由的，给几个固定值反而窄 |
 *
 * ## 上下文群从哪来（这条判据不能在 UI 里瞎猜）
 *
 * 由 App 从**已选参数**推出来（`gal/value.ts#contextGroup`：群给自己、元素集给母群、
 * 作用给作用群）。推不出来（比如 `factorize(n)` 这种纯算术）就 `group === null`，
 * 于是只给 input —— **不猜**。
 *
 * ## 为什么点 chip 就直接执行
 *
 * 只有一个标量位时（`ord` / `Syl` / `pSub` / `pointSet` 全是这种），
 * 点一下就是"这件事做完了"，再逼用户去点「执行」是多一步。
 * 多个标量位（`smallGroup(阶, 编号)`）时只填值，不替他执行 —— 另一半还没填呢。
 */

/** 元素 chips 的显示上限。超了靠搜索（144 个全铺开会把补参条顶出屏幕） */
const CHIP_CAP = 40

export function ScalarFill({
  op,
  index,
  value,
  group,
  onChange,
  onPickCommit,
  commitOnPick,
  onSubmit,
}: {
  op: OpDef
  /** 参数下标（`op.params[index]`） */
  index: number
  value: string
  /** 上下文群 —— 推不出来就是 null（只给 input，不猜） */
  group: Group | null
  onChange: (v: string) => void
  /** 点候选后**立即执行**（调用方负责判断能不能立即执行） */
  onPickCommit: (v: string) => void
  /** 这一位点候选是不是就该立即执行（单标量位才 true） */
  commitOnPick: boolean
  /**
   * 在**值输入框**里按回车的动作。
   *
   * ⚠️ 这条必须留着：补参条从第一批起就支持"敲完直接回车"（`radial-menu.mjs`
   * 有一条守着）。U8-b 换掉裸 input 时漏了它，走查当场红 —— 别以为点了 chip
   * 就够了，打字的那条路是另一条。
   *
   * **搜索框不绑**（那个回车没有"提交"的意思，只是在筛候选）。
   */
  onSubmit: () => void
}) {
  const param = op.params[index]
  const [query, setQuery] = useState('')
  const pick = (v: string) => {
    onChange(v)
    if (commitOnPick) onPickCommit(v)
  }

  if (param.type === 'element') {
    return (
      <ElementPicks
        {...{ value, group, query, setQuery, onChange, pick, onSubmit }}
        name={param.name}
      />
    )
  }
  if (param.type === 'prime') {
    return <PrimePicks {...{ value, group, onChange, pick, onSubmit }} name={param.name} />
  }
  /* 其余（`int` / `omegaOrInt` / `genImage`）：input + 步进（genImage 是"生成元的像"，不步进） */
  const steppable = param.type === 'int' || param.type === 'omegaOrInt'
  return (
    <label className="fill-field">
      <span>{param.name}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit()
        }}
        spellCheck={false}
        autoComplete="off"
      />
      {steppable && (
        <span className="fill-step">
          <button
            type="button"
            title="减 1"
            onClick={() => onChange(String(Math.max(0, (Number(value) || 0) - 1)))}
          >
            -
          </button>
          <button
            type="button"
            title="加 1"
            onClick={() => onChange(String((Number(value) || 0) + 1))}
          >
            +
          </button>
        </span>
      )}
    </label>
  )
}

/* ── 元素候选 ──────────────────────────────────────────── */

function ElementPicks({
  name,
  value,
  group,
  query,
  setQuery,
  onChange,
  pick,
  onSubmit,
}: {
  name: string
  value: string
  group: Group | null
  query: string
  setQuery: (v: string) => void
  onChange: (v: string) => void
  pick: (v: string) => void
  onSubmit: () => void
}) {
  /**
   * 按**阶升序**排，同阶按标号。
   *
   * 为什么不按 `group.elements` 的原序：那是 core 的构造顺序（`S_n` 里是字典序），
   * 用户找 `(12)` 要在 24 个里翻。按阶排的话"单位元 → 3 个对换 → …"是数学上的
   * 自然分层，也正好对上元素表那套读法。
   */
  const items = useMemo(() => {
    if (!group) return []
    return group.elements
      .map((el) => ({ el, label: elementNotation(group, el), order: elementOrder(group, el) }))
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  }, [group])

  if (!group) {
    /* 没有上下文群 ⇒ 不猜，只给输入框 */
    return (
      <label className="fill-field">
        <span>{name}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit()
          }}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
    )
  }

  const q = query.trim().toLowerCase()
  const matched = q
    ? items.filter(
        (x) =>
          x.label.toLowerCase().includes(q) ||
          x.el.label.toLowerCase().includes(q) ||
          x.el.id.toLowerCase().includes(q),
      )
    : items
  const shown = q ? matched.slice(0, 200) : matched.slice(0, CHIP_CAP)

  return (
    <div className="fill-field fill-elem">
      <span className="fill-elem-head">
        <span>{name}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit()
          }}
          placeholder="元素记号"
          spellCheck={false}
          autoComplete="off"
        />
        <input
          className="fill-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜"
          spellCheck={false}
          autoComplete="off"
          title="按标号搜元素（如 12 或 (12)）"
        />
      </span>
      {items.length > 0 && (
        <span className="fill-chips" data-count={items.length}>
          {shown.map((x) => (
            <button
              key={x.el.id}
              type="button"
              className={`fill-chip${x.label === value ? ' on' : ''}`}
              title={`${x.label}（阶 ${x.order}）`}
              onClick={() => pick(x.label)}
            >
              {x.label}
            </button>
          ))}
          {!q && items.length > CHIP_CAP && (
            <span className="fill-more">还有 {items.length - CHIP_CAP} 个，用搜索</span>
          )}
          {q && matched.length === 0 && <span className="fill-more">没有匹配的元素</span>}
        </span>
      )}
    </div>
  )
}

/* ── 素数候选 ──────────────────────────────────────────── */

function PrimePicks({
  name,
  value,
  group,
  onChange,
  pick,
  onSubmit,
}: {
  name: string
  value: string
  group: Group | null
  onChange: (v: string) => void
  pick: (v: string) => void
  onSubmit: () => void
}) {
  /**
   * 候选 = **|G| 的素因子**，不是"≤ |G| 的素数"。
   *
   * 第一版按"≤ |G| 的素数"列，`C_6` 会给出 `2 3 5` —— 而 `Syl(C_6, 5)` 是个
   * **数学上没有意义**的请求（5 不整除 6，Sylow p-子群根本不存在）。列它
   * 等于诱导用户点下去再吃一句报错。走查 `scalar-pick.mjs` 当场抓到的。
   *
   * **没有上下文群就不列候选**（纯算术 op 的 p 无上限，`phi(p)` 里的 p 可以是 101）。
   * 判据用 core 的 `factorizeOrder`（与 `Syl_p` / `pSub` 的守卫同一份因数分解）。
   */
  const primes = useMemo(() => {
    if (!group) return []
    return factorizeOrder(group.order).map((f) => f.prime)
  }, [group])

  return (
    <div className="fill-field fill-prime">
      <span className="fill-elem-head">
        <span>{name}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit()
          }}
          spellCheck={false}
          autoComplete="off"
        />
      </span>
      {primes.length > 0 && (
        <span className="fill-chips">
          {primes.map((p) => (
            <button
              key={p}
              type="button"
              className={`fill-chip${String(p) === value ? ' on' : ''}`}
              title={`${p} 整除 |${group?.symbol ?? 'G'}| = ${group?.order ?? '?'}（Sylow ${p}-子群要有意义，p 必须整除阶）`}
              onClick={() => pick(String(p))}
            >
              {p}
            </button>
          ))}
        </span>
      )}
    </div>
  )
}
