# Galculator 项目长期笔记

> **本文件只放"跨会话必须记住"的东西**（决策、契约、坑、API）。进度与细节在 `docs/`（ROADMAP / INTERACTION / ARCHITECTURE / DIAGRAM_SPEC），别往这里抄。
> 每日流水在 `.workbuddy/memory/YYYY-MM-DD.md`。

## 项目定位
群论计算器——交互式"计算 + 证明可见化"工具，对标 Desmos/GeoGebra，市面空白。
- 与 Desmos 的根本区别：**Desmos 的画布是输出，Galculator 的画布是操作台**。参照三档：Desmos/GeoGebra（交互即时反馈）· Group Explorer（群论可视化约定）· Lean/Coq（**明确不碰**）。
- **理念（用户原话）**：**用户应该在对象旁边完成他想要的操作。**
- 风格：交换图简约风。部署 web 优先，成熟后做 app。
- **MVP**：通过群作用证明 Sylow 定理（演示性证明，非形式化）。群作用是一级对象。

## 仓库与文档
- **git 已初始化**（`main`）；**远端** `git@github.com:rrCathy/Galculator.git`（public，用户手建的空库——MCP 的 GitHub token 无建仓权限）。
- **`git push` 必须 `dangerouslyDisableSandbox`**（默认沙箱拦 `~/.ssh`）；推完用 `curl https://api.github.com/repos/rrCathy/Galculator/commits/main` 核对远端 HEAD。
- `.gitattributes`：`* text=auto eol=lf` + 二进制例外（仓库存 LF，否则 Windows 检出翻 CRLF 产生整文件 diff 噪音）。
- 忽略：`node_modules/` `dist/` `.tmp-*`。纳入 `pnpm-lock.yaml`、`docs/assets/*.png`、`.workbuddy/memory/*`。
- **活文档 5 份**：`README.md`（门面）· `docs/ARCHITECTURE.md`（内核：值类型/10 原语/操作清单/引擎依赖）· `docs/INTERACTION.md`（UI 规范）· `docs/DIAGRAM_SPEC.md`（**交换图排版规范 + 定理复现体检报告**）· `docs/ROADMAP.md`。`docs/archive/` 收完成使命的旧文档（只移动不删除，`archive/README.md` 登记去向）。

## 已定决策
- 计算栈：Sage/GAP 后端（SymPy 不做主力），但 **M0/M1 前端即够**，后端推迟。
- 依赖：**直接装 `@groupviz/core` + `@groupviz/react` v2.3.0**（非源码 alias）。
- 渲染层**自研交换图画布**（core 的 `computeLatticeLayout` + 自写 SVG）——`@groupviz/react` 虽已发包，但 `sylow` 视图未入包，且证明可见化本就要自绘。
- **核心契约两条**：①群描述 = GroupViz 的 **GroupDescriptor v1**（不重造）②**Proof Spec**（计算器独有）：证明模板 = 步骤序列（声明|计算调用）+ 展示方式。Sylow I/II/III = 三份模板。
- GroupViz 侧：已有 GAP 4.16 后端（六端点）；对接待办已完成（门面导出 `descriptor` / `src/core` 越界引用清零 / 新增 `binomialMod`）。

## 核心概念（最容易搞混的三条）
1. **存在层级 `ValueSort`**（`value.ts`）：`vertex`（group/elements/set → 画布节点）· `edge`（map/action → 画布边）· `list`（subgroups → 信息面板，**可"取出为对象"**）· `scalar`（number → 数值区）。与 `ValueType` **正交**；`sortOf()` 一处定义、三处消费。**判据：能作为某个映射的源或靶的，才配当顶点**（DIAGRAM_SPEC §3）。
2. **交换图的三条硬规范**（DIAGRAM_SPEC §1）：**对象落在格点上**（箭头只是注解）· **水平箭头同高、垂直箭头同列**（第一判据）· 箭头方向只有水平/垂直/对角。布局是**硬约束**不是"尽量对齐"（软约束得到 nearly-but-not-quite aligned，比明显不对齐更难看）。
3. **图的两种"层"**：**对象级**（顶点=群/集合/子群，Sylow 证明用的）vs **元素级**（顶点=Ω 的点，轨道=连通分量，只在讲解举例时画）。**画布画"对象之间的关系"，面板画"元素之间的关系"**（DIAGRAM_SPEC §6）。一种语法 + 三层密度（对象级默认 / 集合内部展开 / 元素级去面板）。

## 操作架构（ARCHITECTURE §2–§5）
- **两个平面**：①造对象平面（原子构造 / 作用导出 / 枚举+筛 / 迭代）②**属性平面**（不变量清单，喂给 筛选/判定/识别——三者本质都是"查属性"）。
- **三个层次**：机制 → **原语**（互不可导出的最小操作，共 **10** 个：原子构造 5 = 群记号·积·商·映射·作用；作用导出 2 = 轨道·稳定子；枚举筛 2；迭代 1）→ 实例（60+ 条）。
- 降级为实例：`闭包 ⟨S⟩` = 迭代(乘法,封闭)；`不动点` = 轨道长度 1 特例；`所有 X-子群` = `筛(枚举(G,子群), 属性)`。
- **配方是元数据**（声明等价于哪些原语复合）：只用于解释与逐步演示，**求值走 core 最优路径**。

## core API 速查（v2.3.0）
> 包在 `node_modules/.pnpm/@groupviz+core@2.3.0/node_modules/@groupviz/core`，类型声明 `index.d.ts` + 分模块 `.d.ts`。

- 记号：`parseGroupNotation`（统一入口，本地优先）
- 布局：`computeLatticeLayout`、`mergeLatticeByConjugacy`
- Sylow：`factorizeOrder`、`binomialMod`、`findSylowSubgroups`、`computeSylowAnalysis`、`sylowConjugationPerms`
- **共轭（Sylow III 的正题）**：**`conjugateSubgroup(group, elements, g)`** = `gHg⁻¹`（返回**排序**后的元素数组 → 可按 id 排序做键）· **`sylowConjugationPerms(group, subgroups)`** = G 在 Syl_p(G) 全体的共轭作用（`Map<元素id, 置换>`）
- 作用：`computeCosetActionPerms`、`computeOrbits`、`computeStabilizers`、`verifyOrbitStabilizer`、`computeConjugationPerms`、`computeLeftTranslationPerms`、`computeFixedPoints`
- **子群 → 真群对象**：`buildSubgroupGroup(parent, elements, symbol, generators?)`（元素沿用母群对象，id 一致）
- **元素引用**：`resolveElement(group, ref)` 认 id / label / value / **循环记号**（`(123)`）；`resolveElementRefs` 返回 `{elements, ids, unresolved}`
- **结构伴生映射**：`naturalProjectionMapping` · `subgroupInclusionMapping` · `directProductProjectionMapping` · `trivialMapping`
- **映射（同态）**：类型 `Homomorphism{id,source,target,mapping,result?,name?}`（不要另立结构）· `getGeneratorElements` → `{gen, el}[]` · `extendFromGenerators` · `verifyHomomorphism`（返回 `violation{a,b,lhs,rhs}`，**全是元素 id**，展示前要翻 label）· `computeKernelFromMapping` · `computeImageFromMapping` · `getHomomorphismProperties` · `autoBuildMapping`（`{type,map}|null`）· `extractGeneratorMapping`
- **子群命名与候选**：`subgroupStructureSymbol(group, elementIds)`（O(|H|²) 惰性）· `listCosetStripSubgroups(group)`（按共轭轨道合并）· `subgroupFromElementIds` · `isSubgroupElementSet` · `buildCosetViewData` · `closeUnderMultiply`
- **小群库**：`getAllSmallGroups()` · `getSmallGroup(order,index?)` · `getSmallGroupBySymbol` · `getPrecomputed(group)` → `{subgroups,normalSubgroups,conjugacyClasses,center,isSimple}`（**库群零计算**）
- **识别**：`detectIsomorphicGroup(group)` → 同构符号（如 `S_4/V_4 → "D_{3}"`，**core 的 D₃ 就是 S₃**，UI 要归一）；超限返回 null
- **守卫阈值**（`guards.ts`）：`INTERACTIVE_LIMIT` 120 · `ENUMERATION_LIMIT` 144 · `STATIC_LIMIT` 240/480 · `SYLOW_MAX_ORDER` 144

### core 的坑（都是静默失败，最贵）
- **`extendFromGenerators` / `extractGeneratorMapping` 的 Map key 是「生成元元素的 id」**，不是 `gen.name`——传名字一律得 `null`，**无任何报错**。生成元记号要同时认 `gen.name`（`r`/`s12`/`a`）与 `el.label`（`s`/`(12)`/`1`）。
- **`createGroupFromSymbol` 不吃裸符号**——要先过 `parseGroupNotation`。
- **core 的 `C_n` 是加法群**（生成元名 `a`、元素 `0..n-1`），课本写乘法循环群 `r^k` → 本地加 `resolveElementLoose` 三级回退（精确 → 生成元的幂 `r4`/`r^4` → 单生成元群单字母别名 `r`/`a`/`g` 互通）。
- **`subgroupStructureSymbol` 返回 TeX**，展示前必须过 `prettySymbol`，否则漏出 `C_{2}\times C_{2}`。
- **写「core 没有 X」之前先 `grep` 一遍 `.d.ts`**。踩过：凭印象说「共轭作用在子群集上 core 无现成函数，要自己实现」，翻 `algebra/sylow.d.ts` 才发现 `conjugateSubgroup` / `sylowConjugationPerms` 都在。

## 代码落点（apps/web/src/）
- `gal/`：`value.ts`（值类型 + `ValueSort` + 归一化）· `ops.ts`（**操作注册表 30 条**：`OpDef` = mechanism/primitive/recipe/impl/call/infix/`params`(命名参数+类型)/arity/`variadic`/`editor`/result/run + `opsFor` + `paramAccepts`）· `naming.ts`（自动命名，保留名从注册表导出，**必须避开所有 `call` 名**）· `compose.ts`（操作+实参 → 定义行）· `interaction.ts`（状态机 `idle→selected→menu→pending/fill/editor` + `singleOpsFor`/`multiOps`/`canPick`）· `evalDef.ts`（五级分发：对象引用→调用→顶层中缀→记号→报错）· `build.ts`（行→对象表，含 `firstIsoObjects` 隐式顶点）· `derive.ts`（对象表→画布图 + `alongsideEdges`）· `insights.ts`（结论层）· `tex.ts`（Unicode→LaTeX）· `numeric.ts` · `summary.ts`
- `ui/`：`CanvasView`（SVG 自绘 + **硬约束网格布局** + 上报锚点）· `DockPanel` · `ObjectDock`/`OpDock`/`InfoDock`/`NumericDock` · `ComposerOrb`（正下方输入球）· `ObjectOrb`/`MultiOrb` · `MapBuilder` · `ElementsTable` · `ObjectRow` · `Tex`

### 项目内的坑
- **「造」类操作不能用 `opsFor` 筛**——它的语义是"选中值能把参数填满"，单选一个对象时多元操作不在结果里。要直接遍历 `OPS` + `paramAccepts(op.params[0].type, v, [])`。
- **从 UI 状态取 id 去拼表达式**是危险动作（id 的语义无类型保护）。实例：`取出为对象` 第一版拿焦点 id（那是子群集 `S`）拼出 `闭包(S, e)` —— **tsc 与单测全过**，只有求值器拒。凡见此类代码，补真浏览器走查断言。
- **`闭包` 的上下文群形态**：`if (G0 && a.length > 1)` 才成立——单个群参数（`闭包(J)`）要走"取它的元素当种子"，否则返回平凡群（U0 埋的老 bug，体检才挖出）。
- **集合运算 `∩`/`·`** 在结果是子群时**升级为真群对象**（这是定理不是猜测）；∪/∖ 不升级（决策 ⑤ 针对的是**用户手工造集合**，那种要判断）。
- **`stabilizers` 产出是 G 的子群** → `result: 'group'`（曾漏升级）。
- **KaTeX 渲染后的 DOM**：`S₄` 的 `textContent` 是 `S4`（数字是独立 span）→ **节点定位统一走 `<g class="gnode" data-label="S₄">`**。
- **`⟨⟩` 归一的边界**：`normalizeAngle` **只在顶层（括号外）**改写（`K = ⟨J⟩` → `闭包(J)`），且**实参位置一律不改写**（`normalizeExpr(s, angle=false)`）——否则 `稳定子(A, ⟨r⟩)` 里的 `⟨r⟩`（Ω 的成员记号）会被改写成 `闭包(r)`。Ω 成员标签含逗号的用**纯数字下标**寻址（`稳定子(A, 1)`）。
- **布局的列约束不许传染**：竖直约束（`π`/`π₁`/`π₂`/`↪`/`↷`）合并用**贪心**（短跨度优先）+ **不许跨过已在同列的节点**，否则两条不同来源的竖直边把无关节点串成一列、长箭头从中间节点穿过。
- **`toTex()` 四步有序**：上下标 → 运算符/希腊字母 → 函数名（包 `\operatorname{}`，否则 `Sub` 被排成 `S·u·b` 乘积）→ 中文（包 `\text{}`，math mode 下 CJK 渲染失败）。

## 交互模型（docs/INTERACTION.md，细节看它）
- 画布 = **交换图**（对象=节点，操作=箭头，位置由关系决定），非坐标系。
- 视觉编码：**形状=类型**（群=**无形状只有符号+一小块常驻淡底** / 集合=圆 / 作用=淡虚线框 / 映射=箭头）· **颜色=来源**（蓝=输入 / 紫=运算）。
- **操作 = 结果对象 + 结构伴生**（伴生的映射/作用/包含 = 箭头的真正来源，图由操作"长"出来）。
- 边界：**映射边**（实线，一等对象，**可点选**——点箭头环绕出 ker/im）· **来源线**（淡虚线，辅助，可关）。
- 布局：网格化（见上"核心概念 2"）。
- **输入层三种形态**：文本定义 · **对象编辑器**（映射构建器已落地）· 搭积木（枚举块 + 属性筛块）。
- **5 条决策（已定案）**：① 径向菜单三类两层（看/算/造）② 宏**先纯重放**，排 M1 之后复用 Proof Spec 执行器 ③ 集合描述式 = 属性谓词分面 + 字谓词两条都做，`∧∨` 组合，不开放任意表达式 ④ 拖动 = 钉住 + 吸附网格 + 一键恢复自动 + 持久化 ⑤ 固化集合**不自动升级**（命中子群时提示由用户点升级）。
- **集合构造（§6）**：点击流与文本流 = 同一个 `FilterSpec` AST 的两个前端；「类型 × 属性」表一处定义两处消费（筛选 + 列表列定义）。

## 阶段进度（详见 docs/ROADMAP.md）
**U0 ✅** 注册表 params + `opsFor` + 集合运算 + 子群升级真群对象 · **U1 ✅** 两块输入框 + 自动命名 + 边打边校验 · **U2 ✅** 径向菜单 + 一键执行 · **U2.5 ✅** UI v3/v3.1 浮层面板 + 悬浮球 + 输入球 + 元素表格 + KaTeX · **U3 ✅** 映射构建器 + 实线箭头 + 结构伴生 · **U3.1 ✅** 映射是对象（箭头可点选） · **U4 ✅** 结论层（同构识别 / 第一同构定理）+ 真 TeX · **U5 ✅** 交换图化（节点只有符号 + 给出 φ 自动补另两条线） · **U6 进行中**（对象栈分层 ✅ · 布局网格化 ✅ · **集合展开 ⏳**） · **U7 ✅**（Sylow III 的图：`共轭作用在(G, Ω)` + Ω 升格为对象 + 作用成为一等边 + `n_p` 三条结论） · U8 工具条 + 群目录 + 查表 / U9 集合构造器 / U10 拖动 / U11 宏。

## 已知缺口（体检挖出，按严重度）
| # | 缺口 | 挡住 |
|---|---|---|
| G4 | **商群的子群判定失败**（两个商群的元素 id 体系不同）| 第三同构 `(G/N)/(K/N)` |
| ~~G5~~ | ~~共轭作用在子群集上缺失~~ | ✅ 已解决（U7；core 有 `conjugateSubgroup`）|
| G6 | 箭头形状不编码单射/满射/同构 | 短正合列、五引理 |
| ~~G7~~ | ~~作用仍占节点、轨道/稳定子的边是虚线~~ | ✅ 已解决（U7）|
| G8 | 不自动补 `im φ` | 第一同构的正方形版 |

**体检的教训**：**"算得对"与"画得对"是两件事**。第二同构定理在修 G3 前阶全对，但图上 `H∩N` 是"集合圆"、包含箭头是虚线。既有断言全绿因为都在测"算得对不对"——**光看断言发现不了图的问题**。

## 遗留给未来
- 自定义作用编辑器（共轭/正则已可用）；伴生箭头还不是映射对象（不能对 π 做 ker/im）；陪集作用的轨道/稳定子分支；半直积 ⋊；识别类。
