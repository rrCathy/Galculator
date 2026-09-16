# 架构（ARCHITECTURE）

> 计算器内核的架构。与 [INTERACTION.md](INTERACTION.md)（交互模型）、[PROOF_SPEC.md](PROOF_SPEC.md)（证明层）、[ROADMAP.md](ROADMAP.md)（工程规划）并列。工程选型与依赖见 §11。

## 0. 一句话

内核 = **造对象** + **描述对象** 两个平面。60+ 条操作不是一张长清单，而是由 **10 个原语**（4 个造对象机制的最小集）生成的。

## 1. 两个平面

```
┌─ 造对象平面 ────────────────────────────────┐
│  原子构造 · 作用导出 · 枚举+筛 · 迭代          │
└─────────────────────────────────────────────┘
┌─ 属性平面 ──────────────────────────────────┐
│  不变量清单（按类型）                          │
│    ├→ 筛选（枚举 + 属性）                      │
│    ├→ 判定（查属性）                           │
│    └→ 识别（收集全部属性 + 匹配小群库）          │
└─────────────────────────────────────────────┘
   算术（独立库，与群结构无关）
```

关键在于：**筛选 / 判定 / 识别 本质是同一件事——"查属性"**。它们共用一个底座，所以不需要各设计一套。

## 2. 三个层次（先分清层级）

早先把「模式」和「原语」并列是错的——它们是不同层次的东西：

| 层次 | 回答 | 是什么 |
|---|---|---|
| **机制** | 操作**怎么**造出来 | 4 个造对象机制 + 2 个库 |
| **原语** | 每个机制里**互不可导出**的最小操作 | 共 10 个 |
| **实例** | 填参数得到的操作 | 60+ 条 |

原语是机制的最小实例集，**不是与机制并列的另一份清单**。（这曾导致"九原语"里出现重复、冗余与缺失。）

## 3. 四个造对象机制 + 两个库

| 机制 | 原语 | 数 | 生成的实例（部分）| 加一个的成本 |
|---|---|---|---|---|
| 原子构造 | 群(记号) · 积 · 商 · 映射 · 作用 | 5 | `S_4` `G×H` `G/N` `f:G→H` `G↷Ω` | 一个 core 调用 |
| 作用导出 | 轨道 · 稳定子 | 2 | `Z(G)` `C(g)` `N(H)` 共轭类 `ker` `im` | 一行 |
| 枚举 + 筛 | 枚举(类型) · 筛(集合, 属性) | 2 | 所有子群 · Sylow · 正规子群 · `{x : x²=e}` | 一行谓词 |
| 迭代 | 迭代(导出, 终止条件) | 1 | 闭包 ⟨S⟩ · 导列 · 中心列 · 合成列 | 声明终止条件 |
| **合计** | | **10** | | |
| 属性（库） | 不变量清单 | — | `ord(g)` · 是否交换 / 单 / 可解 | **要写/找算法** |
| 算术（库） | 数值函数 | — | `分解(n)` · `C(n,k)` · Burnside | **要写/找算法** |

**正交性**：10 个原语互不可导出——5 个原子构造彼此独立；轨道与稳定子不可互推（orbit–stabilizer 只给出乘积 = |G|）；枚举 / 筛 / 迭代彼此独立。

**降级为实例**（早先误列为原语）：

- `闭包 ⟨S⟩` = `迭代(乘法, 封闭)`
- `不动点` = `轨道` 的长度 1 特例

**覆盖率**：穷举的 60+ 条操作，除「识别」外全部落在四个机制内。

### 3.1 作用导出（最大的生成器）

同一个作用配两种取法，长出一整片。**已实测**（`apps/web/.tmp-verify/primitives.mjs`，群 D₄）：

| 操作 | 分解 | 与 core 封装对比 |
|---|---|---|
| `Z(G)` | 不动点(共轭作用) → {r0, r2} | 与 `getGroupCenter` 完全一致 ✓ |
| 共轭类 | 轨道(共轭作用) → 大小 [1,1,2,2,2] | 与 `getConjugacyClasses` 一致 ✓ |
| `C(g)` | 稳定子(共轭作用, g) | 8/8 元素与 `getCentralizer` 一致 ✓ |
| `ker(f)` | 稳定子(诱导作用(f), e) | 推论 |
| `im(f)` | 轨道(诱导作用(f), e) | 推论 |

### 3.2 枚举 + 筛

```
所有正规子群 = 筛( 枚举(G, 子群), 属性「正规」 )
所有 Sylow   = 筛( 枚举(G, 子群), 是 p-群 ∧ 极大 )
{x : x² = e} = 筛( 枚举(G, 元素), 属性「阶 | 2」 )
```

**推论：「所有 X-子群」不是一族操作**，而是「枚举」+「属性筛选」的组合——对外给个名字（配方）即可。

### 3.3 迭代

把其他机制的导出反复应用直到终止：

- 闭包 ⟨S⟩ = 迭代(乘法, 直到封闭)
- 导列 `G ⊇ G' ⊇ G'' ⊇ …` = 迭代(`[·,·]`, 直到平凡)
- 上／下中心列 = 迭代(`Z(·)` / `[·,G]`, 直到稳定)
- 合成列 = 迭代(取极大正规子群, 直到单)

它是**高阶**的：参数是"一个导出 + 一个终止条件"。

### 3.4 原语 → core 落点

| 机制 | 原语 | core 对应 |
|---|---|---|
| 原子构造 | `群(记号)` | `parseGroupNotation` → `createGroupFromSymbol` |
| 原子构造 | `积(A,B)` | `createDirectProduct` / `createSemidirectProduct` |
| 原子构造 | `商(G,N)` | `computeQuotientGroup` |
| 原子构造 | `映射(G→H)` | `verifyHomomorphism`（对象编辑器输入）|
| 原子构造 | `作用(G↷Ω)` | `computeConjugationPerms` / `computeLeftTranslationPerms` / `computeCosetActionPerms` |
| 作用导出 | `轨道(A,x)` | `computeOrbits` |
| 作用导出 | `稳定子(A,x)` | `computeStabilizers` |
| 枚举 + 筛 | `枚举(G, 类型)` | `findAllSubgroups` / `findAllPSubgroups` |
| 枚举 + 筛 | `筛(集合, 属性)` | 谓词求值（消费属性库）|
| 迭代 | `迭代(导出, 终止)` | 各序列自身实现（如 `commutatorClosure` 迭代）|

> `不动点` 仍走 core 的 `computeFixedPoints`（快路径），但它的**语义**是"轨道长度 1 的特例"。

## 4. 类型 × 属性（= 筛的谓词库）

| 类型 | 属性（不变量） |
|---|---|
| 群 | 阶 · 是否交换 / 循环 / 单 / 可解 / 幂零 · 中心 · 换位子群 · 生成元 |
| 元素 | 阶 · 是否∈中心 · 共轭类 · 中心化子 |
| 子群 | 阶 · 指数 · 是否正规 / 极大 / Sylow · 正规化子 |
| 映射 | 是否同态 / 单 / 满 · 核 · 像 |
| 作用 | 是否传递 / 忠实 · 轨道数 · 不动点数 |

**取舍：属性清单写死 + 少量组合。** 每条属性保证有实现；筛选谓词允许 `∧ ∨` 组合（如"所有可解的非交换群"），但不开放任意表达式。

## 5. 操作清单（60+ 条，各标机制）

> 记法为建议语法；「机制」列指明它与 §3 的哪个机制对应（原子构造 / 作用导出 / 枚举+筛 / 迭代），或属哪个库（属性 / 算术 / 识别）。

### 5.1 建对象

| 操作 | 记法 | 模式 | 实现 |
|---|---|---|---|
| 记号构造 | `S_4` `GL(2,3)` `SmallGroup(16,13)` | 原子构造 | `parseGroupNotation` |
| 生成子群 / 闭包 | `⟨(123),(12)⟩` | 迭代 | `closeUnderMultiply` |
| 直积 | `G × H` | 原子构造 | `createDirectProduct` |
| 半直积 | `G ⋊_φ H` | 原子构造 | `createSemidirectProduct` |
| 商群 | `G / N` | 原子构造 | `computeQuotientGroup` |

### 5.2 集合运算

| 操作 | 记法 | 模式 | 实现 |
|---|---|---|---|
| 交 / 并 / 差 | `A ∩ B` `A ∪ B` `A \ B` | 原子构造 | 元素集运算 |
| 积集 | `A · B` | 原子构造 | |
| 描述式 | `{x ∈ G : φ(x)}` | 枚举 + 筛 | 谓词求值（消费属性库）|
| 陪集 | `gH` `Hg` | 原子构造 | `computeCosets` |
| 共轭子群 | `gHg⁻¹` | 原子构造 | `conjugateSubgroup` |

### 5.3 子结构导出

| 操作 | 记法 | 模式 | 实现 |
|---|---|---|---|
| 中心 | `Z(G)` | 作用导出 | `getGroupCenter` |
| 中心化子 | `C_G(S)` | 作用导出 | `getCentralizer` |
| 正规化子 | `N_G(H)` | 作用导出 | `getNormalizer` |
| 换位子群 | `[G,G]` | 迭代（闭包） | `commutatorClosure` |
| 换位子 | `[g,h]` | 迭代 | |
| 自同构群 | `Aut(G)` | 枚举 + 筛 → 原子构造 | `createAutomorphismGroup` |
| 内自同构群 | `Inn(G)` | 原子构造（商） | `G / Z(G)` |
| 外自同构群 | `Out(G)` | 原子构造（商） | `Aut(G) / Inn(G)` |

### 5.4 映射与作用

| 操作 | 记法 | 模式 | 实现 |
|---|---|---|---|
| 同态 | `f : G → H` | 原子构造（**对象编辑器**）| `verifyHomomorphism` |
| 核 | `ker f` | 作用导出 | 稳定子(诱导作用) |
| 像 | `im f` | 作用导出 | 轨道(诱导作用) |
| 共轭 / 正则 / 陪集作用 | `G ↷ Ω` | 原子构造 | `compute*Perms` |
| 轨道 | `Orb(x)` | 作用导出 | `computeOrbits` |
| 稳定子 | `Stab(x)` | 作用导出 | `computeStabilizers` |
| 不动点 | `Fix(A)` | 作用导出（轨道特例）| `computeFixedPoints` |

### 5.5 枚举与搜索

| 操作 | 记法 | 模式 | 实现 |
|---|---|---|---|
| 所有子群 | `Sub(G)` | 枚举 + 筛（谓词 ⊤）| `findAllSubgroups` |
| 所有 p-子群 | `pSub(G, p)` | 枚举 + 筛（p-群）| `findAllPSubgroups` |
| Sylow p-子群 | `Syl_p(G)` | 枚举 + 筛（p-群 ∧ 极大）| `findSylowSubgroups` |
| 所有正规子群 | | 枚举 + 筛（正规）| `findAllNormalSubgroups` |
| 所有极大子群 | | 枚举 + 筛（极大）| |
| 共轭类 | | 作用导出（轨道）| `getConjugacyClasses` |
| 元素阶分布 | | 枚举 + 筛（分组）| `elementOrderDistribution` |

### 5.6 结构序列

| 操作 | 记法 | 机制 | 实现 |
|---|---|---|---|
| 导列 | `G ⊇ G' ⊇ G'' ⊇ …` | 迭代 | `commutatorClosure` 迭代 |
| 上／下中心列 | | 迭代 | `computeSeries` |
| 合成列 | | 迭代 | |
| 主列 | | 迭代 | |

### 5.7 判定

| 操作 | 机制 | 实现 |
|---|---|---|
| 是否交换 / 循环 / 单 / 可解 / 幂零 / p-群 | 属性库 | `properties` |
| `H ≤ G` | 属性库 | `isSubgroupElementSet` |
| `H ⊴ G` | 属性库 | |
| `G ≅ H` | 识别 | `detectIsomorphicGroup` |

### 5.8 识别

| 操作 | 机制 | 实现 |
|---|---|---|
| 小群编号 `IdGroup(G)` | 识别 | `getSmallGroup(order, index?)` |
| 结构描述 | 识别 | `SmallGroupRecord.structure`（直出）|
| 同构的已知群 | 识别 | `getSmallGroupBySymbol(symbol)` |

> 识别 = 收集对象的**全部属性** + 匹配小群库。它不是新的操作类，是属性平面的一个视图。
> 库里每条记录含 `(n, i, structure, abelian, exponent, gens, table)`，命中即得"这个群是什么"。见 §10。

### 5.9 数值与计数

| 操作 | 记法 | 机制 | 实现 |
|---|---|---|---|
| 阶 / 指数 | `\|G\|` `[G:H]` | 属性库 | |
| 元素阶 | `ord(g)` | 属性库 | `elementOrder` |
| 阶分解 | `n = ∏pᵉ` | 算术库 | `factorizeOrder` |
| 组合数 | `C(n,k)` | 算术库 | `binomialMod` |
| 轨道数 / 共轭类数 / 子群数 | | 枚举 + 筛（计数）| |
| Burnside 计数 | | 算术库 | `computeBurnsideCount` |

## 6. 输入层规格

**三种输入形态**（不是一种）：

| 输入形态 | 适用对象 | 例子 |
|---|---|---|
| **文本定义** | 群、集合、数值 | `G = S_4`、`P = pSub(G, 2)` |
| **对象编辑器** | 映射、作用 | 列出 G 的生成元，逐个填像 |
| **搭积木** | 集合构造 | 把"枚举"块和"属性筛"块接起来 |

### 6.1 对象编辑器（映射 / 作用）

`f : G → H` 无法用一行文本表达——同态由**生成元的像**唯一决定（数学上也是唯一正确的做法）。所以：

1. 选源群 G、目标群 H
2. 列出 G 的生成元 —— `getGeneratorElements(group)` → `{gen, el}[]`
3. 逐个填 H 中的像 —— 引用走 `resolveElement`（接受 id / label / value / 循环记号）
4. `extendFromGenerators(source, target, Map<生成元名, 像引用>)` 补全成完整映射
5. `verifyHomomorphism(source, target, mapping)` 校验；不满足关系时返回 `violation{a, b, lhs, rhs}`，据此给**定向提示**（"f(a)f(b) ≠ f(ab)"）

作用的自定义箭头同理（源作用由生成元的置换决定）。

> **引擎侧已完整，缺的只是一张表单。** 落地后画布上才有第一条**实线映射边**（见 INTERACTION §7.2）。

### 6.2 搭积木（集合构造）

模式 ②（枚举 + 筛）的可视化形态：**带分面的表格**上就地筛选，而非向导。
两条前端（点击流 / 文本流）编译成同一个 `FilterSpec` AST：

```ts
FilterSpec { domain, from: 'elements' | 'subgroups', pred: AttrPred | WordPred, combine? }
AttrPred   { kind: 'attr', attr, op: '=' | '|' | '∈', value }        // 阶 = 2
WordPred   { kind: 'word', lhs, rhs, vars }                          // x^2 = e
```

`{x : 阶=2}` 与 `{H : 正规}` 是同一机制的两个实例；快捷名只是**配方别名**。
**完整交互规格见 [INTERACTION.md](INTERACTION.md) §6。**

## 7. 求值层

- **统一 async**：core 同步 → `Promise.resolve`；GAP 异步 → `fetch`。接口统一，后接后端不改架构。
- **依赖 DAG + 缓存**：对象表是声明式，按引用拓扑求值；**不做统一缓存层**（见 §10）。
- **local / backend 数据驱动分发**：照 `parseGroupNotation` 返回的 `source: 'local' | 'named' | 'backend'` 走，**不用硬编码阶阈值**。
- **后端推迟到需要时**：`@groupviz/core` 已含 Sylow I 的全部原语，A₄ 这类小群无需后端。将来复用 / 扩展 GroupViz 的 GAP 后端（`gap_service.py` + import-group），补大群、大组合数、未本地化的记号。
  分工原则：**local 原语优先，backend 补大群。**

## 8. 与证明引擎的关系

**操作注册表 = 证明引擎的指令集。** Proof Spec 的 `compute.op` 引用注册表中的操作 id，于是**证明模板与用户输入共享同一套操作**——Sylow I 那 13 步用的原语，用户在左栏也能写。

## 9. 配方（元数据）

任何操作都可声明"我等价于哪些原语的复合"。**配方是元数据，不是操作类别。**

- **只用于解释**：求值走 core 最优路径（`getGroupCenter` 比"算共轭置换再取不动点"快）
- **保留逐步求值能力**：用户想"看为什么"时，按配方逐步算并展示——这正是"证明可见化"
- 枚举类操作**不必有配方**（它归约为"枚举 + 筛"是另一个层级的展开）

## 10. 已定的取舍（参考 GroupViz）

> 五条原本的开放问题，直接对齐 GroupViz 已有做法，不另起炉灶。

| 问题 | 结论 | 依据 |
|---|---|---|
| **规模上限怎么呈现** | **不是一条线，是分场景的多条线**：交互 120 / 枚举 144 / 静态 240 / 3D 720 | GroupViz `guards.ts`。其原文口径：「交互会卡」与「静态可看」是**两条独立的线**，不要混用；阈值全部对齐 `docs/PERF.md` 的实测 |
| **超限时的行为** | 不静默失败，而是"降级 + 提示 + 可强制"：返回"未计算 / 已截断" + 当前上限 + 一个「强制计算」 | `isTooLarge(order, view, limitOverride?)` 第三参逐次覆盖；`sizeLimitFor(view)` 读默认值（`viewBox.ts`）|
| **上限的落地口径** | 画布上的节点是**交互**的 → 默认走 `INTERACTIVE_LIMIT`；导出 / 出图时放开到 `STATIC_LIMIT`；枚举类走 `ENUMERATION_LIMIT` | 同上 |
| **小群库形态** | `SmallGroupRecord { n, i, structure, abelian, exponent, gens, table }`；入口 `getSmallGroup(order, index?)` / `getSmallGroupBySymbol(symbol)` / `getAllSmallGroups()` | GroupViz `groups/smallGroupData` + `SmallGroups/registry` |
| **识别怎么落地** | 命中条目即得 `(n, i)` + `structure` —— **`structure` 字段就是"这个群是什么"的答案**，不必自己写结构描述生成 | 同上 |
| **缓存粒度** | **不做统一缓存层**。小群条目**自带预计算数据**（`subgroups` / `normalSubgroups` / `conjugacyClasses` / `center` / `isSimple`），经 `getPrecomputed(group)` 取用；非库群靠 core 内部 memo + 我方按群引用做 `WeakMap` | GroupViz `SmallGroups/registry.ts` |
| **一个证明步骤 = 几次调用** | **一个语义步骤可含多次原语调用**。参照 `computeSylowAnalysis` 一次返回完整结构化分析；而 Sylow I 的"轨道分解"语义上就是 `computeCosetActionPerms` + `computeOrbits` 两步 | GroupViz `sylow.ts` |

**仍未定**（留到开发调试时）：

- 配方的展示粒度（展开到第几层）

## 11. 引擎依赖（已是 npm 包）

| 包 | 版本 | 内容 |
|---|---|---|
| `@groupviz/core` | 2.3.0 | 纯算法层：群构造 / 布局 / 序列化；零 React/DOM 依赖，仅依赖 zod |
| `@groupviz/react` | 2.3.0 | 10 个受控 Scene + `useSceneState` + `SceneWindow` + i18n；peer: react 19 / three / r3f / katex |

**已发包，直接装依赖，不再 alias 源码**（原"先用 GroupViz `src/core` 源码过渡、等包再切"的方案作废）。

关键事实（v2.3.0 实测）：

- `@groupviz/react` 收录 **10 个 Scene**：`SetView` / `CycleView` / `CayleyView` / `TableView` / `CosetStripScene` / **`ActionScene`** / **`HomomorphismScene`** / `SymmetryViewScene` / `Cayley3DScene` / **`SublatticeScene`**。
- **`sylow` / `tree` / `prestable` 未 props 化、不入包** → Sylow 可视化需自绘（或用 Set / Coset 组合表达）。这是"渲染层自研"方针的直接依据。
- 官方 `API.md` 随包分发（`node_modules/@groupviz/core/API.md`），是消费端的权威 props 表。
- 注意：`@groupviz/react` 的 `index.js` 是单一 bundle，**顶层就 import three / r3f / drei** —— 只要 import 它的 JS 就得装这三个（peer 要求 react `>=19 <19.3`）。

## 12. 契约索引

| 契约 | 定义处 | 说明 |
|---|---|---|
| **GroupDescriptor v1** | `@groupviz/core` 的 `descriptor` | `GroupDescriptorSchemaV1` / `serializeDescriptor` / `deserializeDescriptor` / `descriptorToSymbol`；字段 `schemaVersion` / `symbol` / `order` / `elements` / `multiply`（乘法表）/ `properties` / `construction` / `source`。**计算器不重造，直接对齐** |
| **Proof Spec** | 自研，[PROOF_SPEC.md](PROOF_SPEC.md) | 证明模板 = 步骤序列（`claim` / `compute` / `conclude`）；`compute` 双 target `local` / `backend`；`op` 引用**注册表 id** |
| **FilterSpec** | 自研，[INTERACTION.md](INTERACTION.md) §6 | 集合构造的 AST；点击流与文本流两个前端 |
