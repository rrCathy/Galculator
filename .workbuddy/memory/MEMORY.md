# Galculator 项目长期笔记

> 排序即优先级：**前四节每次开工必看**（做什么 / 纪律 / 坑 / 理念）；细节一律在仓库里 ——
> `docs/ROADMAP.md`（进度）· `INTERACTION.md`（交互）· `DIAGRAM_SPEC.md`（图）· `PROOF_SPEC.md`（证明）·
> `TASKS.md`（输入视角）· `USABILITY.md`（动作视角）· 流水 `.workbuddy/memory/YYYY-MM-DD.md`

## 1. 遗留（详单在 ROADMAP / USABILITY §6）
- **U0–U34 全部落地**：可用性缺口 ①–⑳ 全 ✅，逐批账在 `USABILITY.md §6.1–§6.18`，**别在这里复述**。
  近四批：U31 `f(H)` 的菜单入口（`maxObjectArity` + ⊕ 菜单 + "不填 H 直接执行"）·
  U32 集合运算对齐 + 母群指针（`A_4 · 独立V_4 = A_4`、`A_4 ∩ 独立V_4 = Klein`；第二同构整条链跑通）·
  U33 记号串号（`idsComparable`：`C_3 ∩ C_7` 不再给假交集）·
  U34 画布上下文 + 「结果与选择无关就不问」（`OpContext`；`F_21` 摆着时 `积集(C_3, C_7)` 直接算）。
- **还留下的账**：③ 元素表仍未复现（等用户步骤）· **`包含(H, G)` / `像(f, H)` 遇独立构造的群不自动翻译**
  （现在给"元素不在同一个群里 + 可照抄配方"；要不要像集合运算那样唯一就翻译，等用户点名）·
  **关系层 `containment` 仍纯按 id 判**（U19 设计：靠自证式 id 发现"独立定义之间的包含"）——
  副作用：`C_4` 与 `V_4` 这种整表撞号的独立群会被判成「同一个群」，要不要给指数 1 那档加符号校验，等点名。
- **U27 两条守卫（复用要自己拦）**：超限**明说没算**；`computeSubgroupLattice` 超限**静默退化成 {e} 与 G 两点**。
- **⑪ 只差三件**：Hall 子群（core 没有，要新写）· 子群格图（有列表没图）· 自定义作用编辑器。
- **草稿画布**（用户构思）：判据是"**位置有没有语义**"——交换图上位置是信息（格点 + 吸附 + 自动布局），
  草稿上不是（自由摆放 + 不画结构边 + 不做自动布局）。待定：分页 vs 同屏（推荐分页）· 产出就地留下 · 不连结构边。
- **定理库 5 条 ✅（M3/U17）**；还差 **Cayley 定理**——舞台现成（`正则作用(G)`），但"G ↪ Sym(Ω)"在图上
  **没有落点**（S₆ 已 720 阶、S₂₄ 建不出来）；方向是把「**作用的核**」变成一等对象（核 = {e} ⟺ 忠实 ⟺ 嵌入）。
- **布局两个缺口**：① OST 的图是两条斜线（`Orb` 与 `Stab` 同层但与 `G` 不同列）——缺"一个顶点带多个下层产物"的规范；
  ② Sylow III 里 `Stab ↪ G` 与 `Orb ↪ Ω` 撞同列 → 穿行检查拒绝合并 → 长对角线，正解是**每个竖直约束组各占一列**。
- 陪集视图 · 半直积 ⋊ · 集合节点展开（第 2 层密度）· 短正合列 / 五引理（只清了形状障碍）·
  U6 的 B/C（节点宽度解耦 / 画布分层）· U8 工具条 + 群目录 · U9 集合构造器 · U11 宏。

## 2. 仓库与协作纪律
- git `main`；远端 `git@github.com:rrCathy/Galculator.git`。**push 要 `dangerouslyDisableSandbox`**（被拒就别重试）；
  推完核 HEAD 要带 `-H 'Cache-Control: no-cache'` 打 `api.github.com/repos/rrCathy/Galculator/commits/main`
  （**不带会吃 CDN 缓存、返回上一个 sha，看着像推送失败**），或 `git status -sb` 看 ahead。
- `.gitattributes` = `* text=auto eol=lf`；忽略 `node_modules/ dist/ .tmp-*`。活文档在 `docs/`；`docs/archive/` 只移动不删。
- **期望值一律来自数学（手算），不从运行结果抄**。临时脚本放 `.tmp-*/`，验证线进 `verify/`（是资产不是临时物）。
- 跑法：`pnpm --filter @galculator/web verify`（语义层）· `verify:e2e`（真浏览器几何，需先起 dev server 5273）。
- **要数据时的快路**：core 是纯 ESM，**在 `apps/web/` 里直接 `node x.mjs` 就能 `import '@groupviz/core'`**
  （放仓库根不行）。建群走 `parseGroupNotation(s).symbol` → `createGroupFromSymbol(symbol)`
  ——后者**只认规范形**，直接喂 `'S_4'` 返回 null。

## 3. 项目内的坑（最贵的一节，都真踩过）
- **独立构造的两个群，元素 id 空间互不相通**（2026-09-29 复现**并已修**）：`S_4`/`A_4` 的 id 是**置换本身**（`1,2,3,4`），
  `V_4` 的是**抽象记号**（`e a b c`）。core 的 `findPermIndex` 查不到就**静默回退到单位元**（`A4·V4` → 只剩 `{e}` → `C_1`），
  `alignElementSet`（`elt:${id}`）判"不是子群"，`containment` 按 id 判 → 伴生箭头只连一方。**判据 = `containment` 第①关**
  （元素 id 是否全在 G 里）。**修法**：`\cdot` 硬检查 + `foreignSubgroupFail` 分诊 + `isoSubgroupHint` 给可照抄的
  `闭包(...)`（**唯一才给**；U30 起求商 / 陪集作用在唯一时**直接翻译**；**U32 起集合运算（∩ ∪ ∖ ·）也走同一条对齐**
  —— 候选母群逐个试、唯一同构才翻译、全败挑最有料的错，**不再静默给空集**）。回归 `suites/idspace.ts` / `e2e/idspace.mjs`。
  判定链顺序**恰好相反**：`containment` 里"id 对齐"在**最前**、"正规性"在**最后**，且正规性判的是「G 里那个子集」
  （`normalKeys(G)` 查 `subgroupSetKey(sub.elements)`）——**没有对齐就没有可判的子集**。
- **core 没有「跨 id 空间建映射」的原语**（2026-09-29 实测）：`autoBuildMapping` 只对**循环群**给结果
  （`C_4→C_4` 有；`V_4`/`S_3`/`A_4` 连自映射都 `null`）；`subgroupInclusionMapping` **纯按 id 匹配**（跨空间 → null）。
  ⇒ "把 V₄ 的元素换成 A₄ 的格式"在 core 层**没支撑**；可行做法是应用层搜同构子群后**直接用那个子群**。
- **母群指针是 app 侧自己记的**（U32）：core 的 `Group` **没有 parent 字段** —— 子群升格成群对象后
  "它在哪个群里"就丢了，旧代码只能拿**子群自己**当上下文群（`闭包(G,(12)) · 闭包(G,(34))` 因此误报"不是同一个群"）。
  现在 `gal/parents.ts`（WeakMap）在 `subgroupGroupOf` / `build.ts` 的 `im φ` 处记账，`rootOf` 一路回溯。
  **另一条**：`findAllSubgroups` **不含 G 自身**，凡"找与 X 同构的子群"的判据都要自己把 G 补进候选
  （`商(V4, 独立V4)` → 平凡商、Klein×V₄ 整个映到 V₄，都靠这条）。
- **记号群的元素 id 是"群内编号"，跨群会撞号**（U33 实测，最阴的一条）：`C_3` 的 `e0 e1 e2`
  在 `C_7` 的 `e0…e6` 表里"也有"（`V_4`/`D_4`/`Q_8`/`F_21` 同理）——只按 id 判会把它们当同一批元素。
  **判据 = `parents.ts#idsComparable`**：id 能直接对着读 = **同一个世界**（根相同）**或两边都是自证式 id**
  （`id === value.join(',')`：置换群 A₄/S₄ 为 true，其余全 false）。集合运算 / `包含` / `像` / `商` / `陪集作用`
  都走它；**陪集层（商群）除外**（那套按陪集成员语义走）。**关系层 `containment` 保持纯 id 判**（U19 设计）。
- **集合运算的候选母群还包含"画布上的群"**（U34）：`OpDef.run(a, ctx?)` 的第二参 `OpContext`
  （`evalDef#opContextOf` 现造）；候选顺序 = 显式母群 → 根 → 各自群 → **画布上的群**（绝不顶掉前者）。
  **多个同构候选时枚举全部组合**：结果全同 → 直接算（披露"N 个候选，结果相同"）、不同 → 才停下。
  失败诊断的记分只认"可操作"的提示（另一边**原位**站住才算）。
- **求商路的候选恒唯一**（同次实测）：A₄ 的 Klein 子群 1 个（正规）；S₄ 的 4 个里正规的也只有 1 个 ⇒
  "与 H 同构 **且** 正规"唯一 ⇒ 自动翻译无歧义（多重嵌入的像相同：Aut(V₄)≅S₃ 的 6 种选法结果一样）。
  **已落地（U30）**：`ops.ts#autoTranslatedSubgroup` —— 唯一时**直接拿它当分母**并把翻译写进 `sub`/`note`；
  `isoSubgroupHint` 仍管报错路径（多了 `requireNormal` 筛子）。两道边界：**带陪集元素的任一边不翻译**
  （`商(G/N, K)` 必须继续报错，`thirdIso.ts` 的反例钉着）· 超 `ENUM_LIMIT` 或算不出结构符号就不猜。
- **`subgroupStructureSymbol` 跨母群形式一致**（实测 `V_4` 自身与 A₄ 的 Klein 子群都算出 `C_{2}\times C_{2}`）→ 找同构子群可直接比字符串。
- **`identifyGroup` 的 key 已换成 `identity.ts#groupFingerprint`**（含元素 id；`relations.containment` 用同一份）。
  旧 key `symbol#order` 会串（同符号同阶可能是不同结构）—— 回归用"符号撒谎"的一对（同记号同阶，一个 ≅ C₄、一个 ≅ C₂×C₂）。
- **「造」类操作不能用 `opsFor` 筛**（它要参数被填满）→ 遍历 `OPS` + `paramAccepts`。
- **`objectArity` 不计可选参数**（U31 踩到）：`像(f, H)` 因此被判成"单对象操作" ⇒ 点它只算 `im f`、
  `⊕` 菜单也收不到它 —— 整条菜单入口消失，而按钮上还写着「像 f(H)」（**菜单撒谎**）。
  判"要不要停下来等一个**可选**对象"要用 **`maxObjectArity`（含可选）**；`composeCall` 还得丢掉
  超出必需位的空实参（否则拼出 `im(f, )`）。**加可选对象参数时，必须同时问：这条 op 从哪个入口进得来？**
- **从 UI 状态取 id 拼表达式危险**（id 无类型保护）：`取出为对象` 拿焦点 id 拼出 `闭包(S,e)`——tsc 与单测全过，只有求值器拒。
- 集合运算 `∩`/`·` 结果若确是子群则**升级**为真群对象；∪/∖ 不升级。`stabilizers` 产出是 G 的子群 → `result:'group'`。
- `闭包` 的上下文群形态是 `if (G0 && a.length > 1)`——单个群参数走"取它的元素当种子"，否则返回平凡群。
- **`⟨⟩` 归一**只在**顶层（括号外）**改写（`normalizeExpr(s, angle=false)`）。
- **Ω 上的点怎么寻址看 Ω 是什么**（`ops.omegaIndexOf`）：Ω 是**集合**（成员是子群 / 陪集）→ **1 起数字下标**；
  Ω = **G 自身** → **元素记号**。**C₆ 上 `轨道(A, 1)` 会侥幸成功**（真有元素 `1`），S₄ 上才暴露。
- **布局列约束不许传染**：竖直约束用**贪心**（短跨度优先）+ **合并后整组**全局穿行检查；**`π` 优先于 `↪`**、
  同层边不参与列合并。判据按**边的语义**不按几何猜。
- **不上画布的对象不占行**（`computeLevels`），否则留空行；**行内也防传染**（同层显式映射边两端之间不许夹列组）。
- **箭头形状 = marker**：`marker-end` 挂 `-surj`、`marker-start` 挂 `-hook`（要 `orient="auto-start-reverse"`）、
  **同构两端都挂 `-head`**；必须**按视觉族成套生成**。形状由 `arrowOf()` 推，判不出**不猜**。
- **指针拖动别信 `setPointerCapture`**（React 合成事件里只让第一次 `pointermove` 到位）→ `pointerdown` 时挂到 **window**。
- **画布包围盒要用"自动布局"的位置算**，否则拖走一个节点整张图重新缩放。
- **格点 = 无限延伸的规则网格**（`gal/grid.ts` 纯函数）：`gridSpec` + `quantize` + `visibleGridPoints` +
  `snapToGrid`（跳过占用点）。格点必须**画出来**。
- `toTex()` 四步有序：上下标 → 运算符 / 希腊 → 函数名 → 中文。**`prettySymbol` 不认的宏会掉进"去反斜杠"兜底**
  → 希腊字母表 + `\mathrm/\mathbb/\operatorname` 展开必须齐。
- **上画布的节点不许是孤点**：来源若是一条**边**而不是节点，来源线那支整条跳过 → 飘一个没边的圆。
- **图上同名节点 = 看不清**：标签要带**来源的名字**（`Orb_A(1)` / `Fix_B`）。
- **面板把文本当纯文本渲染**（只有 `tex` 走 KaTeX）：`**强调**` 会原样显示两颗星。要强调用「」。
- **循环群里的单字母一律视作那个生成元**（`resolveElementLoose` 第 ③ 级）。
- **`S_4` 的生成元叫 `s12, c`**（不是 `(12)`）：`映射(G, H, s12->23, c->13)` 才对（见 `e2e/relation-ops.mjs`）。
- **轨道的值类型随 Ω 变**：Ω = G 自身 → `elements`；Ω 是集合 → `set`。
- **dev server**：`localhost` 在 Node 18+ 解析成 `::1` → 走查连 `127.0.0.1` 会 `ERR_CONNECTION_REFUSED`。
  `vite.config.ts` 已写死 `server.host`。**Bash 里 `(npx vite &)` 起的服务会随调用结束而死，要 `run_in_background`。**
- **跑中文输出的回归要防 PowerShell 乱码**：先设 `[Console]::OutputEncoding = [Text.Encoding]::UTF8`，
  或让探针 `fs.writeFileSync(path, text, 'utf8')` 落盘。
- **走查点画布上的边 / 节点要派发事件**（`.gedge-hit`/`.gnode-hit` 是 `transparent`，Playwright 判 not visible →
  白等 30s）：`el.dispatchEvent(new MouseEvent('click',{bubbles:true}))`（React 18 监听在根容器）。
- **断言里不许 `JSON.stringify(值)`**：`generators[].inverse` 是环 → 整份回归崩在那行。写 `describeValue()`。
- **几何判据要成对**：只判"竖直不穿行"会让"水平穿行"藏很久（实测藏了 7 天）。
- **批量替换 LaTeX 记号的坑全在"字符边界"**（U25 一轮踩四个）：① 命令与后随字母**粘连**（`\timesC_2`）——
  扫它的脚本**别用带备选分支的正则配 lookahead**，要先把「反斜杠 + 字母串」整段抠出来再判；② 源码里**单反斜杠被 JS 当转义**；
  ③ **`\uXXXX` 被改成双反斜杠** → `NAME_RE` 静默拒收中文名；④ **分隔点 `·` 被换成 `\cdot`**（那是乘法）。
- **文本形态 = 简化 LaTeX，全 ASCII**（U25 定案，细则 `DIAGRAM_SPEC §1.7`）：展示串一律 `S_4` / `\varphi`，
  **显示靠 KaTeX**，输入只认 ASCII。⚠️ `prettySymbol` 里**空格不能删**（命令分隔符）；**渲染后 `textContent`
  里没有空格** → **断言读 `data-*` 原始形态**；**纯文本面**（状态行 / 按钮 / 菜单 / 报错语）**不写 LaTeX 命令**。
  回归 `e2e/no-unicode-leak.mjs`（43 条）。
- **走查的场地有两份入场**：`/` **自带示例定义**（`G = S_4` + Sylow 链），`?empty=1` 才是空画布。
- **判据别用"节点数 +1"**：`build.ts` 的隐式补点会被显式定义**取代** → 数量不变才对；比 **id 列表**。
- **画布几何走查用 `getBBox()`**（同 viewBox 空间直接比 → 判据敢收敛）；"铺满"看 col×row 规模。
- **画布文字要 `user-select: none`**，否则拖过标签会被判"选文本" → `pointercancel` 掐断手势。
- **`CanvasView` 的"没有图就早点 return 占位"分支 → 新 hook 必须放在它之前**，否则 React 抛错并
  **卸载整棵子树**（`#root` 空、白屏）。走查"等不到选择器就 dump console 与 `#root`"是唯一线索。
- **菜单 / 候选不撒谎**：列给用户点的东西，点下去必须真能跑（或至多"要补参 / 进编辑器"）。
- **`verify/README.md`** 还收着：块注释不许有"星号+斜杠" · rolldown 对模板串换行转义 + 多字节与 U+2500 报错
  → 输出装饰一律 ASCII · 别写恒真断言 · 回归失败先判"bug 还是期望值写错" ·
  **缓存 key 要带身份指纹**（containment 只看 symbol#order 会串，42 号）· **走查结尾必须 `browser.close()`**（43 号）。
- **手写的派生行 origin 是 `derived`** → 进「操作」抽屉，**只数对象区的 `.row-name` 会少一个**；判"图变了没有"读 `g.gnode[data-id]`。
- **空画布时整条 `.canvas-toolbar` 不渲染**（占位分支早 return）→ 空画布上够得着的入口要放进 `.canvas-empty`。
- **通知类浮层要 `pointer-events: none`**：`.notice` 与底部输入球同在 `bottom:12px` 中央而 z-index 更高 ⇒
  **提示一出现输入球就点不动**。只给关闭按钮 `auto`。
- **"键盘打不出来"的判据要看"有没有这个键"**：换行是回车敲的 → `\n\r\t` 必须放行。
- **教训：算得对 != 画得对**（第二同构修 G3 前阶全对，图上 `H∩N` 却是集合圆、包含箭头是虚线）。

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
1. **存在层级 `ValueSort`**（`value.ts#sortOf`，一处定义三处消费）：`vertex` · `edge` · `list` · `scalar`；
   与 `ValueType` 正交。**判据：能作为某映射的源或靶的才配当顶点。**
2. **交换图硬规范**：对象落格点 · 水平箭头同高 / 垂直箭头同列 · 方向只有水平 / 垂直 / 对角。
   **是硬约束不是"尽量对齐"**（软约束得到 nearly-but-not-quite，更难看）。
3. **两种"层"**：对象级（顶点 = 群 / 集合）vs 元素级。**画布画对象之间，面板画元素之间。**
4. **文本形态**：core 的 `label`/`symbol` 本身就是 LaTeX；`prettySymbol()` 只规整成**简化 LaTeX**，细则见 `§1.7`。
5. **操作架构**：两个平面——造对象（原子构造 / 作用导出 / 枚举筛 / 迭代）· 属性（筛选 / 判定 / 识别都是查属性）。
   **10 原语**（原子 5 · 作用 2 · 枚举 2 · 迭代 1）；其余是实例（`闭包` = 迭代(乘,封闭)；`不动点` = 轨道长 1）。
   **配方是元数据**，只用于解释，求值走 core 最优路径。

### 4.2 交互模型（细看 INTERACTION.md）
- 画布 = 交换图（对象 = 节点、操作 = 箭头），非坐标系。**形状 = 类型**（群 / 集合 = 圆 / 映射 = 箭头）；
  **颜色 = 来源**（蓝 = 输入 / 紫 = 运算）。
- **操作 = 结果对象 + 结构伴生**（伴生的映射 / 作用 / 包含才是箭头真正来源）。边界：映射边（实线、一等对象、
  **可点选**）vs 来源线（淡虚线、辅助、可关）。
- 输入层三形态：文本定义 · 对象编辑器（映射构建器已落地）· 搭积木。
- **左上三栏**：`对象`（`origin === 'input'`）与 `操作`（`derived`）**同列上下**，`信息` 另起一列；
  封顶 `calc(100vh − 64px)`。**收起时 body 整个不渲染** → 走查不先展开「操作」抽屉就只读到一半对象。
- **点左栏的行要按 `.row-name` 的 id 匹配**，别按文本包含（行里是**原始定义** `S = S_4`，`S₄` 是展示形态；
  匹不上时面板停在上一个对象上，现象像"没渲染"）。
- **拖拽连线**（U21，第四个入口）：从 A 拖到 B 松手 → `pairOps(a,b)` 列「这两个能做的事」；**唯一候选直接执行**；
  起点 / 落点**都能是边背后的对象**；手势判别 = 底栏「连线」开关 或 Shift；参数顺序先猜，落地时正序不通就反序
  （**只在这条手势上**，手打的错序照旧报错）。
- **证明面板**：step-through = 替用户一行行写定义；当前步的对象在画布上**高亮**；
  **开始证明清空画布、结束证明保留画布**。
- **结论区判据**："识别结果 ≠ 自身符号才说"会让构造物永远沉默 → 判据看 `node.opId`。
- **视图归属**：`pins` / `userView` 是 `CanvasView` 自己的 state —— 要读它走 `CanvasHandle`，别改成往上报。

## 5. 参考（**按需读**，不常驻本文件）
- **core v2.3.0 速查＋坑**与**代码落点**（`apps/web/src/` 各文件职责与关键导出）→ 见 **`.workbuddy/memory/REFERENCE.md`**。
