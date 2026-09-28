# Galculator 项目长期笔记

> 排序即优先级：**前四节是每次开工必看的**（做什么 / 纪律 / 坑 / 理念），参考资料在末尾（被截断也不伤）。
> 细节一律在仓库里。进度 `docs/ROADMAP.md` · 交互 `docs/INTERACTION.md` · 图 `docs/DIAGRAM_SPEC.md` · 证明 `docs/PROOF_SPEC.md` · 任务清单 `docs/TASKS.md`（输入视角）· 可用性 `docs/USABILITY.md`（动作视角）· 流水 `.workbuddy/memory/YYYY-MM-DD.md`

## 1. 遗留（详单在 ROADMAP）
- **可用性缺口**（`docs/USABILITY.md` §6，状态列在表里）：**①–⑩ 全部修完**（U18–U21 + U26）；
  剩 **⑪** core 缺失项（极大子群 / Inn / Hall / 合成列 / Burnside / φ(n) / gcd / ⋊）——
  core 已有**合成列**（`computeSubgroupSeries`）与**半直积分解**（`findSemidirectDecompositions`），是接线不是重写。
- **伴生边的语义身份（U26，2026-09-28）**：画布上 `π`/`π₁`/`↪`/`=`/`≅` 可点了 ——
  `StructuralEdge`（kind+两端+账）挂在 `GalEdge.structural`，焦点前缀 `struct:<边id>`（`edgeFocusId` 三分支），
  **不升级为一等对象**（不进对象表 / 不挂球，列 `ker` 就是撒谎）；账走 `containment()` 判据同源；
  蓝灰细线不变。**伴生包含边的标签由正规性定**（正规 `⊴` / 否则 `↪`）——
  `Z(G)⊴G`、`im φ ⊴ C₆`（交换群）这类不再被画成普通单射。回归 `suites/structural.ts`(31) + `e2e/structural-edges.mjs`(34)。
- **第五批 ✅（U22，补回归）**：U10 走查 `e2e/grid-drag.mjs`(42) · 径向菜单 `e2e/radial-menu.mjs`(51) ·
  `suites/grid.ts`(48) · `suites/interaction.ts`(81) —— 全部进了 `verify:e2e` / `run.ts`。
  `docs/USABILITY.md §7` 只剩 **`ui/MapBuilder`** 没线。
- **文本形态已定案（U25，2026-09-27 用户要求）**：**全 ASCII 的简化 LaTeX**（`S_4` / `\varphi`），
  显示靠 KaTeX，输入只认 ASCII（打不出的报错 + 给可照抄的改法）。U23/U24 那条"同类风险"由此
  **整类消失**（不再有第二套写法）。细节在 `docs/DIAGRAM_SPEC.md §1.7`；
  回归是 `verify/e2e/no-unicode-leak.mjs`（43 条，把用户那句话变成了可执行判据）。
- **草稿画布**（用户构思，已给设计推演）：判据是"**位置有没有语义**"——交换图上位置是信息
  （格点 + 吸附 + 自动布局），草稿上不是（自由摆放 + 不画结构边 + 不做自动布局）。
  要定三点：分页 vs 同屏（推荐分页）· 产出就地留下 · 不连结构边。
- **定理库 5 条 ✅（M3/U17）**；还差 **Cayley 定理**——舞台现成（`正则作用(G)`），
  但"G ↪ Sym(Ω)"在图上**没有落点**（S₆ 已 720 阶、S₂₄ 建不出来）；方向是把「**作用的核**」
  变成一等对象（核 = {e} ⟺ 忠实 ⟺ 嵌入），而不是把 S_n 画出来。
- **布局两个已知缺口**：① OST 的图是两条斜线（`Orb` 与 `Stab` 同层但与 `G` 不同列）——缺"一个顶点带
  多个下层产物"的规范；② Sylow III 图里 `Stab ↪ G` 与 `Orb ↪ Ω` 撞同列 → 穿行检查拒绝合并 → 长对角线，
  正解是**每个竖直约束组各占一列**（而非合并），风险在几何断言。
- 自定义作用编辑器 · **陪集视图** · 半直积 ⋊ · **集合节点展开**（第 2 层密度）· 短正合列/五引理
  （只清了形状障碍）· U6 的 B/C（节点宽度解耦 / 画布分层）· U8 工具条+群目录 · U9 集合构造器 · U11 宏。

## 2. 仓库与协作纪律
- git `main`；远端 `git@github.com:rrCathy/Galculator.git`。**push 要 `dangerouslyDisableSandbox`**（被拒就别重试）；
  推完核 HEAD 要带 `-H 'Cache-Control: no-cache'` 打 `api.github.com/repos/rrCathy/Galculator/commits/main`
  （**不带会吃 CDN 缓存、返回上一个 sha，看着像推送失败**），或 `git status -sb` 看 ahead。
- `.gitattributes` = `* text=auto eol=lf`；忽略 `node_modules/ dist/ .tmp-*`。活文档在 `docs/`；`docs/archive/` 只移动不删。
- **期望值一律来自数学（手算理论值），不从运行结果抄**。临时脚本放 `.tmp-*/`，验证线进 `verify/`（是资产不是临时物）。
- 跑法：`pnpm --filter @galculator/web verify`（语义层）· `verify:e2e`（真浏览器几何，需先起 dev server 5273）。

## 3. 项目内的坑（最贵的一节，都是真踩过的）
- **「造」类操作不能用 `opsFor` 筛**（它要参数被填满）→ 遍历 `OPS` + `paramAccepts`。
- **从 UI 状态取 id 拼表达式危险**（id 无类型保护）：`取出为对象` 拿焦点 id 拼出 `闭包(S,e)`——tsc 与单测全过，只有求值器拒。
- 集合运算 `∩`/`·` 结果若确是子群则**升级**为真群对象；∪/∖ 不升级。`stabilizers` 产出是 G 的子群 → `result:'group'`。
- `闭包` 的上下文群形态是 `if (G0 && a.length > 1)`——单个群参数走"取它的元素当种子"，否则返回平凡群。
- **`⟨⟩` 归一**只在**顶层（括号外）**改写（`normalizeExpr(s, angle=false)`）。
- **Ω 上的点怎么寻址看 Ω 是什么**（`ops.omegaIndexOf`）：Ω 是**集合**（成员是子群/陪集，标签含逗号）→
  **1 起的数字下标**（`轨道(B, 1)`）；Ω = **G 自身** → **元素记号**（`轨道(A, (123))`）。
  **C₆ 上 `轨道(A, 1)` 会侥幸成功**（真有元素 `1`），S₄ 上才暴露。
- **布局列约束不许传染**：竖直约束（`π`/`π₁`/`π₂`/`↪`/`=`/`⊴`/`relation`）用**贪心**（短跨度优先）+
  **合并后整组**全局穿行检查；**`π` 优先于 `↪`**、同层边不参与列合并。判据按**边的语义**不按几何猜。
- **不上画布的对象不占行**（`computeLevels`），否则图里留空行；**行内也防传染**（同层显式映射边两端之间不许夹列组）。
- **箭头形状 = marker**：`marker-end` 挂 `-surj`（满射双箭头）、`marker-start` 挂 `-hook`（单射尾钩，
  要 `orient="auto-start-reverse"`）、**同构两端都挂 `-head`**；marker 必须**按视觉族成套生成**。
  形状由 `arrowOf()` 推，判不出**不猜**。
- **指针拖动别信 `setPointerCapture`**（React 合成事件里只让第一次 `pointermove` 到位）→
  `pointerdown` 时把 `pointermove/up` 挂到 **window**。
- **画布包围盒要用"自动布局"的位置算**（不含被钉住/正在拖的节点），否则拖走一个节点整张图重新缩放。
- **格点 = 无限延伸的规则网格**（`gal/grid.ts` 纯函数）：`gridSpec` + `quantize`（顺带拉平列宽差）+
  `visibleGridPoints` + `snapToGrid`（跳过占用点）。格点必须**画出来**。
- `toTex()` 四步有序：上下标 → 运算符/希腊 → 函数名(`\operatorname{}`) → 中文(`\text{}`)。
  **`prettySymbol` 不认的宏会掉进"去反斜杠"兜底** → 希腊字母表 + `\mathrm/\mathbb/\operatorname` 展开必须齐。
- **上画布的节点不许是孤点**：来源若是一条**边**（作用/映射）而不是节点，来源线那支整条跳过 →
  飘一个没边的圆（`不动点` 就这样）。判据：`nodes.every(n => 有边)`。
- **图上同名节点 = 看不清**：标签要带**来源的名字**（`Orb_A(1)` / `Fix_B`）。
- **面板把文本当纯文本渲染**（只有 `tex` 走 KaTeX）：写 `**强调**` 会**原样显示两颗星**。要强调用「」。
- **循环群里的单字母一律视作那个生成元**（`resolveElementLoose` 第 ③ 级）：`映射(G, H, a→x)` 在 C₆ 上合法
  （`x` ≡ `a`），别拿它当"元素不存在"的反例。
- **轨道的值类型随 Ω 变**：Ω = G 自身 → `elements`；Ω 是集合 → `set`。读"轨道多大"要认两种。
- **dev server host**：`localhost` 在 Node 18+ 解析成 `::1` → 走查连 `127.0.0.1` 会 `ERR_CONNECTION_REFUSED`，
  看着像"服务没起"。`vite.config.ts` 已写死 `server.host`。
- **跑中文输出的回归要防 PowerShell 乱码**：`node … | Out-File -Encoding utf8` 会先按 GBK 解码；
  先设 `[Console]::OutputEncoding = [Text.Encoding]::UTF8`，或让探针 `fs.writeFileSync(path, text, 'utf8')` 落盘。
- **走查点画布上的边/节点要派发事件**（`.gedge-hit`/`.gnode-hit` 是 `transparent`，Playwright 判 "not visible"
  → 白等 30s 超时）：`el.dispatchEvent(new MouseEvent('click',{bubbles:true}))`（React 18 监听在根容器）。
- **断言里不许 `JSON.stringify(值)`**：`Group.generators[].inverse` 是环 → `Converting circular structure to JSON`，
  **整份回归崩在那一行**。写 `describeValue()` 只摘 symbol/order/index/isNormal。
- **几何判据要成对**：只判"竖直不穿行"会让"水平穿行"藏很久（实测藏了 7 天）。
- **批量替换 LaTeX 记号时，坑全在"字符边界"上**（U25 一轮踩四个）：① 命令与后随字母**粘连**
  （`\timesC_2` 是不存在的命令）。扫它的脚本**别用带备选分支的正则配 lookahead** —— 会回溯到
  更短的备选、假阳性一片；正解是先把「反斜杠 + 字母串」整段抠出来再看是不是"某命令 + 尾巴"。
  ② 源码里**单反斜杠被 JS 当转义**（`'a\to 2'` 的 `\t` 成制表符 → 对象凭空不存在）。
  ③ **`\uXXXX` 转义被改成双反斜杠** → `NAME_RE` 静默拒收所有中文名（tsc 抓不到）。
  ④ **分隔点 `·` 被换成 `\cdot`**（语义错位：那是乘法）。
- **文本形态 = 简化 LaTeX，全 ASCII**（U25 定案，细节见 `DIAGRAM_SPEC §1.7`）：展示串一律
  `S_4` / `\varphi` / `\times`（`prettySymbol` 只省单字符下标的花括号），**显示靠 KaTeX**，
  输入只认 ASCII（打不出的报错 + 给可照抄的改法）。⚠️ `prettySymbol` 里**空格不能删**（命令分隔符）；
  **渲染后 `textContent` 里没有空格**（math mode 吃空格）→ **断言读 `data-*` 原始形态**；
  **纯文本面**（状态行 / 按钮 / 菜单标签 / 报错语）**不写 LaTeX 命令**，那里没人替它渲染。
  回归 `verify/e2e/no-unicode-leak.mjs`（43 条）——**用户的一句话变成了可执行判据**。
- **走查的场地有两份入场**：`/` **自带示例定义**（进来就有图），`?empty=1` 才是空画布。
  按"空"写断言会撞「名字「G」已被占用」。
- **判据别用"节点数 +1"**：`build.ts` 的隐式补点会被显式定义**取代** → 数量不变才对；比 **id 列表**。
- **画布几何走查用 `getBBox()`**（同处 viewBox 空间直接比 → 判据敢收到 < 0.5）；"铺满"看 col×row 规模。
- **画布文字要 `user-select: none`**，否则拖过别人的标签会被判"选文本" → `pointercancel` 掐断手势。
- **`CanvasView` 有个"没有图就早点 return 占位"的分支 → 新的 hook 必须放在它之前**：
  空画布 18 个 hook、有图 19 个 → React 抛错并**卸载整棵子树**（症状是 `#root` 空、白屏）。
  走查里"等不到选择器就 dump console 与 `#root`"是唯一线索。
- **菜单/候选不撒谎**：列给用户点的东西，点下去必须真能跑（或至多"要补参/进编辑器"）。
  U21 靠它抓出两笔账（`包含` 两位同型 · `ParamType` 一型两用 → 拆 `setlike`/`omega`）。
- **`verify/README.md`** 还收着：块注释不许有"星号+斜杠" · rolldown 对模板串换行转义 + 多字节与 U+2500 报错
  → 输出装饰一律 ASCII · 几何判据比**轴向**与**节点中心** · 别写恒真断言 · 回归失败先判"bug 还是期望值写错" ·
  **缓存 key 要带身份指纹**（containment 只看 symbol#order 会串，42 号）· **走查结尾必须 `browser.close()`**
  （漏了 node 挂着不退，43 号）。
- **教训：算得对 != 画得对**（第二同构在修 G3 前阶全对，图上 `H∩N` 却是集合圆、包含箭头是虚线）。

## 4. 理念与已定决策
群论计算器——"计算 + 证明可见化"，对标 Desmos/GeoGebra，市面空白（参照 Desmos / Group Explorer；Lean/Coq 不碰）。
- **根本区别**：Desmos 的画布是输出，Galculator 的画布是**操作台**。**用户原话：用户应该在对象旁边完成他想要的操作。**
- 交换图简约风；web 优先。MVP = 用群作用证明 Sylow 定理（演示性、非形式化）。
- 计算栈：Sage/GAP 后端（SymPy 不做主力）；M0/M1 前端即够，后端推迟。依赖 `@groupviz/core` `@groupviz/react` v2.3.0。
- **渲染层自研交换图画布**（`@groupviz/react` 的 sylow 视图未入包，且证明可见化本就要自绘）。
- **两条核心契约**：①群描述 = GroupViz **GroupDescriptor v1** ②**Proof Spec** = 步骤序列（声明|计算）+ 展示方式。
- **5 条交互决策**：①径向菜单三类两层 ②宏先纯重放 ③集合描述式 = 属性谓词分面 + 字谓词，`∧∨` 组合
  ④拖动 = 钉住 + 吸附网格 + 一键恢复 + 持久化 ⑤固化集合**不自动升级**。

### 4.1 核心理念（最易混）
1. **存在层级 `ValueSort`**（`value.ts#sortOf`，一处定义三处消费）：`vertex` · `edge`(map/action/relation) ·
   `list`(subgroups) · `scalar`；与 `ValueType` 正交。**判据：能作为某映射的源或靶的才配当顶点。**
2. **交换图硬规范**：对象落格点 · 水平箭头同高 / 垂直箭头同列 · 方向只有水平/垂直/对角。
   **是硬约束不是"尽量对齐"**（软约束得到 nearly-but-not-quite，更难看）。
3. **两种"层"**：对象级（顶点 = 群/集合）vs 元素级。**画布画对象之间，面板画元素之间。**
4. **文本形态**：core 的 `label`/`symbol` 本身就是 LaTeX；`prettySymbol()` 只把它规整成
   **简化 LaTeX**（省单字符下标的花括号），文本流全 ASCII、显示走 KaTeX。**细则见 `DIAGRAM_SPEC §1.7`**。
5. **操作架构**：两个平面——造对象（原子构造 / 作用导出 / 枚举筛 / 迭代）· 属性（筛选/判定/识别都是查属性）。
   **10 原语**：原子构造 5 · 作用导出 2 · 枚举筛 2 · 迭代 1；其余是实例（`闭包` = 迭代(乘,封闭)；`不动点` = 轨道长 1）。
   **配方是元数据**，只用于解释，求值走 core 最优路径。

### 4.2 交互模型（细看 docs/INTERACTION.md）
- 画布 = 交换图（对象 = 节点、操作 = 箭头），非坐标系。**形状 = 类型**（群 = 无形状 + 一小块常驻淡底 /
  集合 = 圆 / 映射 = 箭头）；**颜色 = 来源**（蓝 = 输入 / 紫 = 运算）。
- **操作 = 结果对象 + 结构伴生**（伴生的映射/作用/包含才是箭头真正来源）。边界：映射边（实线、一等对象、
  **可点选**）vs 来源线（淡虚线、辅助、可关）。
- 输入层三形态：文本定义 · 对象编辑器（映射构建器已落地）· 搭积木。
- **左上三栏**：`对象`（`origin === 'input'`）与 `操作`（`derived`）**同列上下**（`.dock-col`），`信息` 另起一列；
  封顶 `calc(100vh − 64px)`，两栏都展开时按内容比例让高度、缩下去可滚动。**收起时 body 整个不渲染** →
  走查不先展开「操作」抽屉就只读到一半对象。
- **点左栏的行要按 `.row-name` 的 id 匹配**，别按文本包含（行里是**原始定义** `S = S_4`，`S₄` 是展示形态；
  匹不上时信息面板停在上一个对象上，失败现象像"没渲染"）。
- **拖拽连线**（U21，第四个入口）：从 A 拖到 B 松手 → `pairOps(a,b)` 列「这两个能做的事」；
  **唯一候选直接执行**、多个弹菜单（按数学意图排序）；起点/落点**都能是边背后的对象**（映射不占节点）；
  手势判别 = 底栏「连线」开关 或 Shift（普通拖动仍是"钉住+吸附格点"）；
  **参数顺序**：先按类型猜（`swapped`），落地时正序不通就反序（**只在这条手势上**，手打的错序照旧报错）。
- **证明面板**：step-through = 替用户一行行写定义；当前步的对象在画布上**高亮**；**开始证明清空画布、结束证明保留画布**。
- **可用性缺口**：历史盘点与逐条状态在 `docs/USABILITY.md`（U18–U25 已修完 ①②③④⑤⑥⑦⑨⑩）；
  **判据**记一条：结论区"识别结果 ≠ 自身符号才说"会让构造物永远沉默 → 判据看 `node.opId`。

## 5. 参考（**按需读**，不常驻本文件）

- **core v2.3.0 速查＋坑**（入口 / Sylow / 作用 / 子群 / 映射的 API 与静默失败清单）
  与 **代码落点**（`apps/web/src/` 各文件的职责与关键导出）
  → 见 **`.workbuddy/memory/REFERENCE.md`**。

为什么搬出去：这两节加起来 7.4K 字节，只在动手查 API / 找函数时才用得上，
而本文件的注入有上限 —— 留在里面会**把前四节挤掉**（截断从末尾开始），得不偿失。
文件头的规则仍然是"**细节一律在仓库里**"：真要找什么，`grep` 比这份清单更准。
