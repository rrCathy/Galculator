# Galculator 参考（不常驻，需要时读）

> 从 `MEMORY.md` 搬出来的两节：core 速查＋坑 · 代码落点。
> `MEMORY.md` 的注入上限容不下它们，而它们是"查的时候才要"的东西。

## 5. 参考：core v2.3.0 速查＋坑
> 包在 `node_modules/.pnpm/@groupviz+core@2.3.0/...`，**先 grep `*.d.ts` 再动手**（踩过：误以为共轭作用要自己实现）。
> 下面只记**容易找错的那几个**，不是全表。

**入口** `parseGroupNotation`（统一入口；`createGroupFromSymbol` 不吃裸符号）· `computeLatticeLayout` ·
`detectIsomorphicGroup`（超限 null；**core 的 D₃ 就是 S₃**）· `getAllSmallGroups`/`getSmallGroupBySymbol`/`getPrecomputed`。
**Sylow** `findSylowSubgroups`（与 op `Syl_p` **逐项同序**）`conjugateSubgroup`（返回**排序**后的数组）。
**作用** `computeOrbits` `computeStabilizers` `computeConjugationPerms` `computeLeftTranslationPerms` `computeCosetActionPerms`。
**子群** `buildSubgroupGroup(parent, elements, symbol, gens?)`（元素 id 沿用母群）· `subgroupStructureSymbol`（**返回 TeX**）·
`subgroupSetKey(elementIds)`（**收 id 不收元素**）· `subgroupFromElementIds`（**静默**，见坑）· `isSubgroupElementSet` ·
`findAllNormalSubgroups` · `getCentralizer`/`getNormalizer`/`getGroupCenter` · `computeQuotientGroup` ·
**子群格** `computeSubgroupLattice`（`nodes[]` 带 `elementIds/order/index/isNormal/level`；`edges[].from → to` 是**自下而上**，
覆盖边 = Hasse）· `findMinimalGenerators(elements, group)`。
**结构与判定（U27 接线用的）** `computeSubgroupSeries(group, 'derived'|'lowerCentral'|'upperCentral'|'composition')`
（`terms/factors/reachesTrivial/solvable/nilpotent/alternativeCount`；超 `SERIES_MAX_ORDER` 144 返 **null**）·
`findSemidirectDecompositions`（候选带 **`verified`** 与 `rebuiltIsoSymbol`；`phiMap.get(hId).map` 恒等 ⟺ 作用平凡 ⟺ 直积）·
`computeBurnsideCount(perms, n)` · `getConjugacyClasses` · `isPerfect` / `isSolvable` / `isNilpotent` / `isSimpleGroup` / `isGroupCyclic`。
**映射** `Homomorphism`（**不要另立结构**）· `extendFromGenerators`/`extractGeneratorMapping`（key 是**元素 id**）·
`verifyHomomorphism`（violation 全是**元素 id**）`computeKernelFromMapping`/`computeImageFromMapping` · `autoBuildMapping`。
**元素** `resolveElement`（认 id/label/value/循环记号）。**阈值**（guards.ts）ENUMERATION 144 · SYLOW_MAX_ORDER 144 · SERIES_MAX_ORDER 144 · PROPERTIES_CUTOFF 144。

### 5.1 core 的坑（全是静默失败）
- `extendFromGenerators`/`extractGeneratorMapping` 的 Map key 是**生成元元素的 id**，传 `gen.name` 得 `null` 且无报错。
- `createGroupFromSymbol` 不吃裸符号 → 先过 `parseGroupNotation`；群符号是 `\operatorname{Aut}(S_{4})` 这种完整 TeX。
- `C_n` 是**加法群**（生成元 `a`、元素 `0..n-1`），课本写乘法 `r^k` → 本地三级回退（精确 → 生成元的幂 →
  单生成元群单字母别名）。
- `subgroupStructureSymbol` 返回 TeX → 展示前必须过 `prettySymbol`。
- **商群元素 id `qcoset-<i>` 的 `i` 只在自家母群里有意义**（= 陪集序）；跨商群按 id 匹配会**静默命中另一个陪集**
  （实测 9 组里 5 组侥幸通过）。跨群比较用 **`cosetMemberLabels`** 做语义键。
- **`subgroupFromElementIds` 对认不得的引用是静默的**（丢掉 → 返回平凡子群）。判包含必须另加两道关：
  id 全覆盖 + 校验出的阶 = `|H|`（`gal/relations.ts#containment`）。
- **`computeSubgroupLattice` 超限（> `ENUMERATION_LIMIT` 144）不报错，而是静默退化成"{e} 与 G 两点"**
  （实测 216 阶群）——照单全收会把**平凡子群**当成 G 的极大子群。要自己判阶再拒（`ops.ts` 的 `极大子群`）。
- **合成列 / 半直积分解都贵**：S₅（120）一次 3 秒（合成列 2.2s）、A₅（60）约 250ms —— 自动展示必须自带上限；
  分解候选的 `verified` 是"重建后与 G 同构类相同"，**只用 verified 的**。
- **因子 `label` 形态不统一**：`C_{2}` 带花括号、A₅ 那个是 `A_5` —— 比较前过 `prettySymbol`。
- **A₄ 的 n₂ = 1（V₄ 正规）、n₃ = 4** —— 演示 Sylow II/III 要用 p = 3。
- **S₄ 的生成元是 `s12`（σ₁₂）与 `c`（σ₁₂₃₄）**；S₄ ↠ S₃ 用 `映射(G, S_3, s12→23, c→13)`（两像**必须是对换且不同**）。
  `c` 是 4-循环 → 像的阶只能整除 4 → S₃ 里就是对换，所以"`c ↦ 3-循环`"永远报不是同态；两像相同则退化成符号映射（ker = A₄）。

## 6. 参考：代码落点（apps/web/src/）
- **回归线**（U27 收口后）：`verify/run.ts` 串 **11** 个套件（含 `suites/grid.ts` 48 · `suites/interaction.ts` 81 ·
  `suites/structure.ts` 107）· `verify:e2e` 串 **19** 个走查（含 `grid-drag.mjs` 42 · `radial-menu.mjs` 51 ·
  `structure-ops.mjs` 47）—— 语义 **1169** / 走查 **546**。
- `gal/`：`value`(8 值类型 + `sortOf`) `ops`(注册表 **38 条**：mechanism/call/infix/params/arity/optional/variadic/
  editor/result/run + `opsFor`/`paramAccepts`) `naming` `compose` `interaction`(idle→selected→menu→pending/fill)
  `evalDef` `build`(`firstIsoObjects` 隐式补点) `derive`(`arrowOf`/`alongsideEdges`/`computeLevels`) `insights`
  `relations` `structure`(U27：`structureFacts` 上限 60 + 指纹缓存；`factorsText`/`chainText` 供 `data-*`)
  `tex` `pretty` `numeric` `grid` `proof` · `ui/`：`CanvasView` `DockPanel`（**收起时 body 不渲染**）
  `ObjectDock`/`OpDock`/`InfoDock`/`NumericDock` `ComposerOrb`（**`.orb-center` 与 MultiOrb 撞类名**）
  `ObjectOrb`/`MultiOrb` `MapBuilder` `ElementsTable` `Tex` `ProofDock`
- **证明（`gal/proof.ts`）**：`ProofStep{kind,text,tex,line,highlight}` + `ProofTemplate{slots,defaults,suggest?,
  build(group?,p?,extra?)}` + 5 条模板（Sylow I/II/III · ORBIT_STABILIZER · FIRST_ISO）。
  **支点：每步 `line` = 一整行定义 → 交给现成的求值器**（零新求值机制、机器写的行可见可改）；数字由 `build()` 真算。
  `extra` 装参数槽值（全是文本）；`templateReady` 与 `build` 共用同一批纯函数。**`SYLOW_III` 的关键是换主角**：
  `G ↷ Ω` 只给 `n_p | m`，`n_p ≡ 1 (mod p)` 要 `P ↷ Ω`。**OST** = 共轭作用在自身上（轨道 = 共轭类、稳定子 =
  中心化子，两路交叉核对）。**FirstIso** = 只写 3 行，`φ/ker` 与 `φ/im` 靠 `build.ts` 自动补 ——
  **模板绝不产出 `ker`/`im` 的定义行**。
- **关系层（`gal/relations.ts`，U19）**：`relationsFor(node, table)` → kind = `kernel`|`image`|`quotient`|`equal`|
  `subgroup`|`contains`|`derived`。两条来源：**① `node.sources` + `node.opId`**；**② `containment(H, G)`**
  三道关（id 全覆盖 → `subgroupFromElementIds` → **阶相等**）再 `findAllNormalSubgroups` + `subgroupSetKey` 判 ⊴。
  **指数 1 单列成 `equal`**（元素完全相同 = 同一个群）。面板落点：`InfoDock` 在**结论层与 tab 之间**插一节「关系」。
- **`relation` 值类型（U20）**：`GalRelation{from,to,index,isNormal,normalUnknown}`；`sortOf → 'edge'`
  （**是边不是顶点**，不占节点不占行）。**`像(f, H)`** = `image` op 的**可选第二参**（`arity 1 / optional 1`）：
  同一个 op，别名只指向一条路；建出**靶群里的子群**（第二同构的 `H′`）；**叙述分家**——两参说 `= f(H)`、
  单参说 `= im f`。**`包含(H, G)`**（`call: ['包含','include','subset']`、`infix: ['⊆']`）→ 一条
  `gedge-relation` 边，`label = isNormal ? '⊴' : '↪'`，带 `objectId`（**可点选**）；判定复用 `containment()`
  （判据同源），**声明的压过自动生成的同向 `↪`**（不叠两条）。**正规性是算出来的不是声明的** →
  没有"声明正规子群"这个操作；**指数 1 拒收**（包含是严格小于）。三种写法等价：`A ⊆ G` / `A⊆G` / `包含(A, G)`。
- **拖拽连线的落点（U21）**：`gal/interaction.ts#pairOps(a,b)` → `PairCandidate{op, swapped}[]`
  （`PAIR_PRIORITY` 定序；**`contains` 单独走两个方向各实判一次**，判据定顺序）；
  `CanvasView` 的手势 `mode:'connect'`（**起点/落点都能是边背后的对象** → 收了 prop `objects`）+
  底栏「连线」开关/Shift；`App.dispatchPairOp` 做"正序不通就反序"的兜底；
  信息面板「可做」= `InfoDock` 的 `singleOps`/`onRunOp`。
  **`ParamType` 拆成三个**（U21）：`subset`（单个数集，含"恰好一个成员"的列表）/ `setlike`（**只有 `底集`** 收整个子群集列表）/ `omega`（Ω，走 `omegaArgOf`）。
- **列序规则（U20 换掉）**：水平边当约束图 → **分量内穷举列序，取"两端之间夹着别的组"的边数最少者**；
  **并列只接受严格更优**（布局稳，多一条边不重排）；分量 > 7 保持原序**不猜**。
  换掉的是"夹在中间的组挪到行尾"——它在**两条水平边共用一个端点**时自相打架。
