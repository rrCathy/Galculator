# 提案 · 代数结构层级（集 → 半群 → 幺半群 → 群）

> **状态：提案 → 路线已定（D1 = R1 升格式，2026-10-04 用户确认）。未改任何源码。**
> 定位：本文件说「**做什么 / 为什么**」，不等于现状。现状看 [ARCHITECTURE.md](ARCHITECTURE.md)；
> **「怎么落」见 [DEVPLAN-algebra-structures.md](DEVPLAN-algebra-structures.md)**（文件级改动、接口契约、批次步骤、验收）。
> 拍板并动工后，逐批叙述进 [HISTORY.md](HISTORY.md)，规范落回 ARCHITECTURE.md。
> 触发（2026-10-04，用户原话）：「重新审视这个项目……集、半群、幺半群、群，这些基础概念和常见运算能不能实现？」

---

## 0. 一句话

**把「群」泛化成「代数结构」**——一个「载体 + 二元运算 + 公理档案」；
群只是**公理满足最全**的那一档。够格成群时**升格**成 core 的 `Group`，
现有 40+ 条群论操作**零改动**继续可用。

集 → 半群 → 幺半群 → 群 不再是四个不相干的东西，而是**同一条"累积加结构"的链**：
载体（集）加一个二元运算就是 magma，再逐步满足结合 / 单位 / 逆，就一级级升上去。

> **生态调研结论（2026-10-04，详 §10）**：三层里只有「语义层」有近亲（`abstract-algebra`，MIT），
> 但它**不能作依赖**（装不上 + 0★停更）；「判级别验证器」与「可视化」**都没有现成的**。自研是必答题。

---

## 1. 现状证据（为什么现在只能建群）

| # | 事实 | 位置 |
|---|---|---|
| 1 | core 的 `Group` 把公理**写死**：`multiply` / `inverse`（必填）/ `identity`（必填）/ `isAbelian` | `@groupviz/core` `types/group.d.ts` |
| 2 | 全仓库（应用层 + core）grep `Semigroup \| Monoid \| Magma` = **0 命中** | —— |
| 3 | 45 条 op 全是群论运算 + 集合运算 + 数论标量，**没有**「任意二元运算」与「公理验证」 | `src/gal/ops.ts` |
| 4 | 值类型 8 种：`group / elements / set / subgroups / map / action / relation / number`——**没有**任何"结构"档 | `src/gal/value.ts:9` |
| 5 | 群从**记号**来：`parseGroupNotation → createGroupFromSymbol → buildLocally` | `src/gal/evalDef.ts:1`、`localBuild.ts:160` |
| 6 | 集合从**原子构造**来：`pointSet` / `labeledSet`（机制 `atomic`，`primitive:false`） | `src/gal/ops.ts:2337/2362`、`pointSet.ts` |

**两个关键的"已经在了"（是本提案的落脚点）**：

- **core 已有「乘法表 → 群」的通路**：`createGroupFromImport({order, table: number[][], gens, idents, structure})`
  （`groups/importGroup.d.ts`）。也就是"载体 + 运算表"这套数据 core 认得，**只是它假定那是一张合法的群表**。
- **core 已有 `GroupDescriptor v1`**：字段含 `symbol / order / elements / **multiply（乘法表）** / properties / construction`
  （[ARCHITECTURE.md](ARCHITECTURE.md) §12）。**一张表就是核心的数据形态**。

> **结论**：不是"架构装不下"，是"没抽象出来"。这跟「无限集 `Z/N/R/C` 装不下」性质不同 ——
> 后者是有限枚举引擎的硬边界，前者只是缺一层表示。

---

## 2. 设计目标 / 非目标

**目标**

1. 引擎能表示「载体 + 二元运算」，并**验证**它到哪一级（magma / 半群 / 幺半群 / 群 / 交换群）。
2. 够格成群的结构，**无缝接入现有全部群论功能**（子群 / 同态 / 商 / 作用 / Sylow / 性质 / 识别）。
3. 公理验证**可见**（逐条打勾）——这正是"证明可见化"，与项目理念同源。
4. 表示要留出**第二运算**的口（环 / 域 / 模是"加一个运算"，不是另一套东西）。

**非目标（本轮不做）**

- 无限载体（`Z / N / Q / R / C`）—— 硬边界，见 §1 注。要做另立项（符号集合）。
- 结构级深算法（子半群格 / 理想论 / 半群表示论）—— 先只要"验证 + 升格"。
- 改 `@groupviz/core`（npm 依赖，应用层改不了它的 `Group` 类型）—— 见 §5 边界。

---

## 3. 三条路线（含推荐）

| | 路线 | 做法 | 成本 | 风险 |
|---|---|---|---|---|
| **R1** | **升格式（推荐）** | 应用层新增 `structure` 值类型（载体 + 表 + 公理档案）；**够格成群 → 升格 core `Group`**，下游零改动 | 中 | 低（不碰 core、不碰现有群论路径） |
| R2 | 并行式 | 另加 `Semigroup` / `Monoid` 独立类型，各自独立实现子结构 / 同态 | 高 | 高（群论功能要重写一遍） |
| R3 | 验证器式 | 只做"判级别"的工具，不引入结构值 | 低 | 低但**回报小**（判完就没法继续算） |

**推荐 R1，理由三条**：

1. **core 不可改**——"统一在 core"（真正的 A 路线）物理上做不到。R1 是把统一做在应用层。
2. **复用最大**：升格成群后，`buildSubgroupGroup` / `computeQuotientGroup` / `findSylowSubgroups` … 一个不改地继续用。
3. **契合既有架构**：项目本来就有「原子构造」机制、「对象编辑器」输入形态、「值类型 × 存在层级」正交设计——R1 只是往里加一档。

> 生态调研（§10）支持自研：三层里没有一层能直接依赖。

---

## 4. 架构设计（R1）

### 4.1 表示层：新增值类型 `structure`

**值类型 `ValueType` 新增一档 `'structure'`**（中文「代数结构」）。

```ts
// src/gal/value.ts
export interface GalStructure {
  /** 载体：一批元素（复用集合的成员表示；它**就是** §1 那个「集」） */
  carrier: SetMember[]
  /** 载体来自哪个集合对象（`pointSet` / `labeledSet` / `asSet`）—— 来源线用 */
  carrierFrom?: string
  /** 二元运算：有限 ⇒ 乘法表。table[i][j] = 第 i 个元素 · 第 j 个元素 的下标 */
  op: { table: number[][] }
  /** 公理档案：验证结果（见 4.2）——**算出来的，不是声明的** */
  axioms: AxiomProfile
  /**
   * 够格成群时的 core `Group`（经 `createGroupFromImport` 升格）。
   * `undefined` = 不是群（只是 magma / 半群 / 幺半群）。
   */
  group?: Group
}
```

**关键点：载体不新造表示。** 载体就是既有「集合」——`pointSet(3)` / `labeledSet(a,b,c)` / `asSet(...)`。
于是「集 → 结构」是**同一个东西加了一层运算**，而不是新物种。

### 4.2 公理层：验证器（应用层纯函数）

新文件 `src/gal/structures.ts`：

```ts
export interface AxiomProfile {
  closed: boolean          // 表良定义（下标在界内）
  associative: boolean     // ∀a,b,c: (ab)c = a(bc)     —— O(n³)
  hasIdentity: boolean
  identityIndex?: number
  hasInverses: boolean     // ∀a ∃b: ab = ba = e
  commutative: boolean
  level: 'magma' | 'semigroup' | 'monoid' | 'group'
  /** 展示用：违反结合律的一对反例（a,b,c 下标）——"不结合"要给出**见证**，不空口说 */
  assocCounterexample?: [number, number, number]
}
export function verifyAxioms(carrier: SetMember[], table: number[][], cap: number): AxiomProfile | Blocked
export function structureToGroup(s: GalStructure): Group | null   // 升格
```

> **公理清单来源**：照 `abstract-algebra/test/laws.ts`（MIT，见 §10.3）——每条公理的精确表述都在那里；
> 差别只是它随机抽样（结构可能无限），我们载体有限 ⇒ **穷举**。

**纪律**（照抄项目既有教训）：

- **判据只写一份**：`verifyAxioms` 判出的 `level === 'group'` 与 `structureToGroup` 成功、与 `paramAccepts('group', structure)`、与菜单筛子**共用同一份判据**（`ops.ts#takesCanvasObject` 那条前车之鉴：判据散成五处就出事）。
- **不猜**：超上限（n 太大）→ 返回 `Blocked`（"算不动"，带上限），**不许给半截答案**。
- **不静默**：`level` 是**算出来的**；表里有下标越界/缺格 → `closed: false` 并指名，不是当成 0。

### 4.3 升格层：结构 → 群

```ts
// structures.ts
function structureToGroup(s: GalStructure): Group | null {
  if (s.axioms.level !== 'group') return null
  return createGroupFromImport({
    gap_expr: '', order: s.carrier.length, table: s.op.table,
    gens: [], idents: s.carrier.map((m) => m.label),
    structure: '',           // 交给结论层识别（§5.8）
  })
}
```

**升格的语义**：结构**还是**那个结构（用户手上的对象不变），只是它现在**也是**一个群，
于是子群 / 同态 / 商 / Sylow / 识别全部可用。
`GalStructure.group` 是**缓存指针**，不是第二个对象——避免"同一数学对象在画布上长出两份"（对比 `build.ts` 里 `firstIsoObjects` 的处理）。

### 4.4 下游：能力门（风险控制的核心）

**这张表就是"哪里会静默给错答案"的清单**（引入非群结构时唯一的真风险）：

| 操作族 | 现在假定的 | 结构不是群时 |
|---|---|---|
| 子群 `Sub` / Sylow / 正规子群 / `Z(G)` / `C_G` / `N_G` | `identity` / `inverse` 存在 | **列不出来**（参数是 `group` 位，`paramAccepts` 拒） |
| 同态 `map(G,H)` / `ker` / `im` | `multiply` 结合 + `identity` | 同上 |
| 商 `G/N` / 作用 `G ↷ Ω` | 群公理 | 同上 |
| 性质 `是否可解 / 幂零 / 单` | core 群函数 | 同上 |
| **结构级**（新）：验证 / 幂 / 底集 | 只要"载体 + 运算" | ✅ **能用** |
| **集合级**（既有）：`∩ ∪ ∖ ·` / `asSet` | 只要"集合" | ✅ 能用（结构取底集后） |

**实现**：`paramAccepts('group', v)` 对 `structure` 值返回 `v.group != null`；
`level !== 'group'` 的结构在任何 `group` 位上都**被拒**——菜单因此不撒谎。

### 4.5 操作与输入

**新增 op（走既有「原子构造」机制，与 `pointSet` 同档，`primitive:false`）**：

| op | 记法（暂定） | 实现 |
|---|---|---|
| 造结构 | `structure(P, 表)` | `verifyAxioms` → `GalStructure` |
| 取底集 | `底集(M)` | **已有**（§5.1「忘记结构」）——对 `structure` 天然适用 |
| 结构属性 | `是否结合(M)` / `单位元(M)` / `是否交换(M)` | 读 `axioms` 档案（属性库） |

**输入形态**——**推荐「对象编辑器」**（ARCHITECTURE §6 的既有第二形态，与映射 / 作用同档）：

1. 选一个**载体集合**（画布上的 `pointSet` / `labeledSet` / `asSet` 节点）
2. 弹 **n×n 乘法表网格**，逐格填（或按"默认 = 单位元/零"预填）
3. **实时**显示公理档案（结合律逐条打勾 / 单位元在哪 / 谁没有逆）
4. 确认 → 落成一行定义 `M = structure(P, …)`（与"点出来的和手写的一致"同源）

**入口三处**（照 U57 的教训，**从第一批就规划，不许"零入口而回归全绿"**）：

- 左栏**目录**面板 → 「造结构」（像 `pointSet` 那两个框）
- **点集合节点** → 悬浮球加一颗「给它一个运算」（像 U57 给点集加「被作用」）
- 输入球/文本：`M = structure(P, [[…]])`

### 4.6 画布与信息面板

- **画布**：结构上画布当**节点**。形状建议**按 level 升级**（引出 §3.5 那句"类型改变是最强视觉信号"）：
  `magma → 半群 → 幺半群 → 群` 用**逐步收拢的形状**（点阵 → 环 → 带心 → 加框）。
  ⚠️ 待定：也可以偷懒复用 `group` 形状 + 副行标 level。见 §7 决策 D3。
- **信息面板**新增一节**「公理档案」**：`结合 ✓ · 单位 e ✓ · 逆 ✓ · 交换 ✗`，逐条**可展开看验证过程**
  （结合律展示"逐三元组打勾"，违反时给**反例三元组**）。

---

## 5. 边界（明确不碰的东西）

- **不改 `@groupviz/core`**（npm 依赖）。需要 core 级半群算法时，另提 upstream 需求单（`C:/newproject/GroupViz/feedback/`）。
- **不动现有群论路径**：`group` 值类型、45 条 op、Sylow 证明链，一行不改；结构只是"多一条进群的路"。
- **不碰无限集**：`Z/Q/R/C` 仍拒（有限枚举引擎的硬边界）。
- **第二运算只留口、不铺开**：表示上 `op` 可扩成 `ops: [...]`，本轮只做单运算。

---

## 6. 开发批次（每批：出口 + 影响面 + 验证）

> **验收纪律**（`fe-batch-acceptance` skill）：每批**整套三验** + **起真浏览器点进去看**；
> 新入口必须**有真机走查**，不接受"零入口而回归全绿"。

### S1 · 语义层：结构值 + 公理验证 + 升格（无 UI 表单）

- **做**：`value.ts` 加 `structure` 值类型（+ `sortOf` / `canvasShape` / `contextGroup` 三个 switch）；
  `src/gal/structures.ts` 全新（`verifyAxioms` / `structureToGroup` / `AxiomProfile`）；
  `ops.ts` 加 `structure` 原子构造 op（文本形态）；`paramAccepts` 收 `structure` 当 `group`（判据只一份）。
- **出口**：`buildLines(['P = labeledSet(a,b,c)', 'M = structure(P, …)'])` 真跑出
  `level='group'`（且 `M` 可用于 `Sub(M)` / `Z(M)`），以及一个**非群**（如 `a·b=b·a=a` 的带零半群）判成 `semigroup` / `monoid`。
- **影响面**：`value.ts` / `ops.ts` / `evalDef.ts` / `InfoDock`（新类型的分支）；**加 ValueType 会让所有 switch 报错，tsc 抓**。
- **验证**：`verify/suites/u60.ts`（公理验证逐条 + 升格 + 边界 + 见证反例）；三验。

### S2 · 表格编辑器 + 入口 + 画布（真机能用）

- **做**：`ui/StructureBuilder.tsx`（选载体 → n×n 网格 → 实时公理档案）；
  目录面板加「造结构」；集合节点球加「给它一个运算」；画布节点 + 信息面板「公理档案」节。
- **出口**：**用户不写一行文本**，点几下造出一个群（如 `{e,a,b,c}` + 一张表 → 判成 `V₄`），
  在画布上看得见、在信息面板看得见公理逐条打勾。
- **验证**：`verify/e2e/structure.mjs`（入口 → 填表 → 产物可见 → **产物上能看到什么**）；三验 + 真机截图。

### S3 · 结构级运算（子结构 + 提升）

- **做**：子半群 / 子幺半群 / 理想（枚举 + 筛）；幂表；"够格 → 升格"显式化；
  非群结构的**性质报告**（不结合 / 无单位 / 谁没逆）。
- **出口**：造一个非群半群，能列出它的子半群；造一个群，能一键"当作群用"接上全部群论操作。
- **验证**：语义层 + 走查。

### S4（可选）· 第二运算 → 环 / 域 / 模

- 表示留口；先只出"报告"（`(R, +, ·)` 是不是环），不铺开算法。

---

## 7. 待你拍板的决策点

| # | 决策 | 选项 | 我的倾向 |
|---|---|---|---|
| **D1** | 路线 | R1 升格式 / R2 并行 / R3 验证器 | **R1** |
| **D2** | 输入形态 | 乘法表编辑器 / 生成元+关系 / 公式 | **乘法表编辑器**（最贴教材、复用"对象编辑器"形态） |
| **D3** | 画布视觉 | 按 level 升级形状 / 复用群形状加副行 | 倾向**按 level 升级**（视觉信号最强），但成本高，可先复用 |
| **D4** | 范围 | 只做 集→群 这条链 / 同时留环域的口 | **只做链，留口** |
| **D5** | 结构级算法 | 先"验证+升格"/ 连子半群一起做 | 先**验证+升格**（S1/S2），S3 再看 |
| **D6** | 类型名 | `structure` / `algebra` / 中文「结构」 | `structure`「结构」 |
| **D7** | 上游边界 | 确认 core 不动（应用层自研） | 是 |

---

## 8. 风险与"回归会骗人"的盲区

| 风险 | 说明 | 对策 |
|---|---|---|
| **判据分家**（项目最痛病根） | `paramAccepts('group')` 与"升格真成功"两处口径若不一致 ⇒ 又成"菜单撒谎" | 一份判据（§4.2 纪律） |
| **ValueType 加档的静默 fallback** | tsc 抓穷尽 switch，但 `?.`/default 分支会静默吞 | 改完 grep 所有 `switch (v.type)` |
| **缓存 key 撞号** | 结构指纹要含载体 + 表（同 U26/U58：key 必须决定"是谁") | 指纹 = 载体 id 表 + 表内容 |
| **升格对象"身份"** | 同一载体+表两次造 → 是不是同一个群？ | 走 `callKey` / 指纹；不许画布两份 |
| **上限** | 结合律 O(n³)；表 n×n 的 UI 成本 | 定三条线（交互 / 枚举 / 硬上限），照 §10 的多条线口径 |
| **零入口而回归全绿** | U53/U55/U57 反复栽的坑 | 入口与走查**从 S1 就规划** |
| **走查环境** | 跑走查前**重启 dev server**（HMR 状态会坏） | 既有纪律 |

---

## 9. 一页纸总结（给忙人）

1. **现状**：引擎只有「群」，群以下一级没有；「集」只是 Ω 舞台。——**不是装不下，是没抽象。**
2. **设计**：新增值类型「结构」= **载体（就是集合）+ 二元运算（乘法表）+ 公理档案（算出来的）**；
   够格成群 → **升格** core `Group` → **现有 45 条 op 零改动**。
3. **路线**：R1 升格式（推荐）；输入用**乘法表编辑器**；入口三处（目录 / 集合球 / 文本）。
4. **批次**：S1 语义层（验证+升格）→ S2 表格编辑器+入口+画布 → S3 子结构 → S4 环/域（可选）。
5. **边界**：不改 core、不动现有群论、不碰无限集。
6. **先拍 D1–D7**（尤其 D1 路线、D2 输入形态），再动工。

---

## 10. 附录 · 生态调研（2026-10-04）：有没有能直接用的

> 触发：用户「赶紧查查有没有类似项目/包，别造轮子」。
> **结论：三层里只有一层有近亲，且没有一层能直接依赖。**
> 证据脚本 `.tmp-research/test-aa.mjs`（真跑读数）；安装行为真机实测。

### 10.1 一句话

| 层 | 现成度 | 结论 |
|---|---|---|
| **语义层**（结构层级 + 公理 + 常见集合） | 🟡 有近亲 `abstract-algebra`（MIT / dist 18KB / 零依赖） | **借它的 API 与公理清单，不作依赖**（装不上 + 停更） |
| **「判级别」验证器**（给载体 + 表 → 它是哪一级） | 🔴 **没有** | **自研**（公理清单可照抄，见 10.3） |
| **可视化**（画布 / Cayley / 作用） | 🔴 **没有可复用库** | **自研 —— 这本就是本项目的位置**（见 10.4） |

### 10.2 `abstract-algebra`（npm v1.0.0，2026-05，MIT，单作者）

**它有的**（逐条真跑，数字与手算全对）：

| 能力 | 记号 | 实跑读数 |
|---|---|---|
| 完整群层级 | `Magma / Semigroup / Monoid / Group / Quasigroup / Loop / InverseSemigroup` | —— |
| 完整环层级 | `Rng → Ring → CommutativeRing → IntegralDomain → EuclideanDomain / Field` | —— |
| Z/nZ **加法群** | `zn(n)` | `3+5=1`（Z₇）· `-3=4` · `order=7` ✓ |
| Z/nZ **环**（**合数模也行**） | `znRing(zn(n))` | `3*5=3`（Z₆）· `add 3+5=2` ✓ |
| GF(p) 域 | `zpField(znRing(zn(7)))` | `mulInverse(3)=5` ✓ |
| 置换群 | `symmetricGroup(n)` / `fromCycles` | `S₄.order=24` · `(012)(23)` ✓ |
| 子群 / 陪集 / 指数 / 中心 / 元素阶 | `generateSubgroup` / `leftCosets` / `index` / `center` / `elementOrder` | `⟨2⟩ ≤ Z₆`：阶 3 · 陪集 `{0,2,4}/{1,3,5}` · 指数 2 ✓ |
| 同态 / 理想 / 矩阵环 / 多项式环 / 四元数 / 有理数域 | `groupHomomorphism` / `idealSum` / `matrixRing` / `quaternionRing` / `rationalField` | —— |

**它没有的（正是本提案的核心）**：

- **92 个导出里没有任何「判级别」函数**。`verify*` 只有 4 个
  （`verifyGroupHomomorphism / verifySubgroup / verifyIdeal / verifyRingHomomorphism`）——
  全是「**结构已声明之后**验证子群/理想/同态」，**不是**「给一个集合 + 一个二元运算，判它是 magma 还是群」。
- **没有可视化**。

**不能作依赖的三条实测理由**：

1. **装不上**（真机）：包里挂着 `"postinstall": "syncpack format"`，而 syncpack 不在依赖里。
   - `npm install` → **整体失败回滚**（`npm error command failed ... 'syncpack' 不是内部或外部命令`，exit 1，`node_modules` 不留）
   - `pnpm add` → 包**落在 `node_modules` 了**，但命令报 `ELIFECYCLE ... exit code 1`
   - 绕过：`--ignore-scripts`（或 `.npmrc` 里 `ignore-scripts=true`）
2. **成熟度**：GitHub **0 star**；2026-05-17 建库、**05-18 之后没再推**；单作者；v1.0.0。
3. **模型不同**：它的 `Magma` 只有 `op / has / equals`（**不枚举元素**），元素是 brand `bigint`；
   core 是「**元素数组 + multiply 函数**」（`types/group.d.ts`）。要用得先写适配层。

### 10.3 能直接借的：公理清单（`abstract-algebra/test/laws.ts`，MIT）

它把每条公理的**精确表述**列全了，可直接当我们验证器的规格：

```text
closure → associativity → left/rightIdentity → left/rightInverse → commutativity
环：左右 distributivity · zeroAnnihilation · divisionAlgorithm · normDecreasing …
```

**唯一差别**：它用 `fast-check` **随机抽样**（结构可能无限）；我们的载体**有限**（乘法表），
改成**三重穷举**（O(n³)），顺带能给出**反例见证**（§4.2 的 `assocCounterexample`）。

### 10.4 排除掉的（别回头再查）

| 候选 | 是什么 | 为什么不 |
|---|---|---|
| `algebra.laws` / `fantasy-laws` / `laws` | Fantasy Land 那套 law（Functor / Monad / Applicative） | **同名不同物**：范畴论 typeclass，**不是群论代数** |
| **Group Explorer**（nathancarter） | 群论可视化，**2019 已重写为纯 JS web app**（LGPL-3.0，200★） | **是完整应用不是库**；LGPL 传染；依赖 jquery；群数据从 GAP 硬编码导出。**只作视觉参考** |
| **GAP**（含 WASM 版 `wangyenshu/gap-wasm`） | 计算群论标杆 | 60MB+ wasm、GPL-2.0、界面原始。**可当 oracle，不能当依赖** |
| **SymPy via Pyodide** | Python 符号计算（有 `combinatorics`） | 15MB 起步 + Python 桥；体积/模型都不合 |
| Rust `abstalg`（停产 2 年）/ `un_algebra`（自标非生产）/ `harness-algebra`（AGPL）/ `finitelib` | Rust 代数结构 crate | 全要 WASM 桥；全单人 / 停产 / 许可不合 |
| `mathjs` / `@danielsimonjr/mathjs` | 通用数学库 | **没有抽象代数**（有矩阵/符号计算，无群/环结构） |
| Theory.js（fonte.me） | 老式 JS 抽象代数（`isFiniteGroup(set, op, id)`） | **概念最接近「判级别」**，但无 npm 包、无维护，不可用 |

### 10.5 对提案的影响

- **§3 路线 R1 不变** —— 三层里没有一层能直接依赖，自研是必答题。
- **§4.2 验证器**：公理清单照 §10.3（MIT 可抄）；判据仍只写一份。
- **§4.1 命名**：可借它的层级名（magma / semigroup / monoid / group）。
- **若将来真要用它**：走 `--ignore-scripts`，或按 MIT **vendoring**（抽需要的文件进 `src/`），不引 npm 依赖。
- **可视化**：坐实必须自研 —— 这也正是本工具与 Group Explorer（应用）的分野。

---

*本文件为提案；未改任何源码。拍板后开第一批。*
