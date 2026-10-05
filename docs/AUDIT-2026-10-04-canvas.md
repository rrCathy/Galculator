# 画布可用性 + 数学语义审查（2026-10-04）

> 审查范围：U0–U58 全部已落地功能，问两件事 —— **在画布上能不能用** · **有没有数学语义错误**。
> 方法与 `fe-batch-acceptance` 一致：**不拿"回归绿"当证据**（绿灯的边界 = 写断言时的想象力），
> 改成从**用户的手**出发独立走一遍，并把"产物那一侧"单独写探针。
> 探针全部落在 `apps/web/.tmp-audit/`（临时目录，未入库）。

---

## 0. 基线（先确认不是环境坏了）

| 关 | 命令 | 结果 |
|---|---|---|
| 类型 | `npm run typecheck` | **0 错误** |
| 语义层 | `npm run verify` | **2327 PASS / 0 FAIL** |
| 走查 | `bash verify/e2e-ledger.sh` | **32 套 1111 PASS / 0 FAIL** |

三关全绿。**下面所有发现都是全绿之下漏掉的** —— 它们恰好都在现有断言的盲区里：
现有断言问的是"点得中按钮吗"，而这些问题问的是"**点下去跑得动吗 / 用户想走的那条路有没有**"。

---

## 1. 结论摘要

**数学语义：没有发现算错。** 手算的 40 余项（群阶 / 中心 / 换位子 / Aut / Inn / Sylow 数 / 轨道 /
稳定子 / Burnside / ker·im / 商 / 直积 / 半直积 / 小群表 GAP 编号）逐条对上（§4）。

**画布可用性：发现了系统性的"菜单撒谎"。** 根子在**同一件事的判据被写成了两份**：

- UI 层 `ops.ts#paramAccepts` 说"这个值能填这一位"，
- 内核层 `ops.ts#subgroupArgOf` / 各 `run` 说"不能"。

两份不一致 ⇒ **菜单/候选列出来的，点下去必报错**。实测拖一次就有 10 条候选里 9 条是假的。

| 编号 | 发现 | 严重度 | 用户能否撞上 | 状态 |
|---|---|---|---|---|
| **F1** | `set`（点集/`asSet` 产物）能填 `subset` / `setlike` 位，内核却不收 ⇒ 拖拽候选与集合节点球成片撒谎 | **高** | 能，且是最自然的操作 | **✅ 已修**（§7） |
| **F2** | `paramAccepts` 的"群当集合读"用 core 的静默判据 ⇒ 跨 id 空间的群被误认成子群 | 中 | 能（拖两个独立群） | **✅ 已修**（2026-10-05，§8）|
| **F3** | 45 条 op 只有 **2 条**有 `fits` 预检；且已有的 `fits` 与真实预算仍不一致 | 中 | 能 | **✅ 已修**（2026-10-05，§8）|
| **F4** | `omega` 位同类：`paramAccepts('omega', set)` 收，`conjOn` 的 run 有条件不收 | 中 | 能（拖集合到群） | **✅ 已修**（随 F1，§7） |
| **F5** | **Burnside（轨道数）在画布上零入口** —— 作用线的球上没有它，也没有别的手势入口 | 中 | 能（想算轨道数） | **✅ 已修**（2026-10-05，§8）|
| **F6** | `C_2 x C_2` 是 `derived`（落「操作」抽屉），README 却把它和 `S_4` 并列在"记号建群" | 低 | 会困惑 | **✅ 已修**（2026-10-05，§8）|
| **F7** | `normalSubgroups(G)` 含 G 自身，`Sub(G)` / `maximalSubgroups(G)` 不含 —— 同族口径不一 | 低 | 会困惑 | **✅ 已修**（2026-10-05，§8）** |

> **7 条全部结清**（2026-10-05）。逐条施工与读数见 [HISTORY.md](HISTORY.md) 丙编 2026-10-05；
> 回归线 `verify/suites/f2f3.ts`（+47 条）。**这次清账是 [PROPOSAL-zones.md](PROPOSAL-zones.md) 三区重构的前置**
> —— 走查 34 套 1222 条全靠 DOM 选择器，动布局要等判据底座干净。|

---

## 2. F1（高）：判据分家 —— `set` 在 UI 层能当集合参数，内核层不能

### 两份判据

| 位置 | 说什么 |
|---|---|
| `ops.ts:3617` `paramAccepts` 的 `subset` 分支 | `if (v.type === 'elements' \|\| v.type === 'set') return true` |
| `ops.ts:3586` `paramAccepts` 的 `setlike` 分支 | `if (v.type === 'elements' \|\| v.type === 'subgroups' \|\| v.type === 'set') return true` |
| `ops.ts:342-351` `subgroupArgOf`（`closure` / `setOp` 内部用） | 只认 `elements` / `group` / `subgroups`（恰一成员）—— **不收 `set`** |
| `ops.ts:2264-2268` `underlyingSet`(`asSet`) 的 `run` | 只认 `subgroups` / `elements` / `group` —— 对 `set` 回 `fail('<name> 没有底集可取')` |

`paramAccepts` 是 `opsFor` / `canPick` / `pairOps` **三处入口共用**的（"菜单里列的"就由它定），
而 `subgroupArgOf` 是内核真正取值的判据。**两份口径不一致，就是"菜单撒谎"。**

### 真机复现 ①：拖「群」到「点集」

```
建 G = S_4 · P = pointSet(4) · Shift 拖 G → P
```
`.connect-menu` 列出 **10 条**：

```
quotient, intersection, productSet, union, difference, conjOn, cosetAction, customAction, C_G, N_G
```

点第一条 `quotient` → notice：**「商需要第二个参数是子群」（除 `customAction` 外，其余 9 条全报错）**。
（探针：`.tmp-audit/repro-drag.mjs`）

### 真机复现 ②：点「点集」节点上的悬浮球

```
点 P 节点 → 球 → 环上 4 颗：信息 · 被作用 · asSet · closure
```
- 点 `asSet` → notice：**「P 没有底集可取 - asSet 接受子群集（如 Syl(G, 2)）、元素集、群」**
- 点 `closure` → notice：**「closure 需要一个集合」**

（探针：`.tmp-audit/repro-set-menu.mjs`）

> 环上 `asSet` / `closure` 是直接铺开的单对象 op（`ObjectOrb#ringItems`，≤3 条不收进下拉），
> 用户的第一个动作就是点它 —— 点了必错。

### 量化

`pairOps` 的候选整体真跑一遍（`.tmp-audit/probe4.ts`，剔除"还要补参（UI 会继续收）"那一档）：

```
486 个候选：324 个"点了必报错"   (67%)
 70 个单对象候选：6 个必报错      (全是 set 值上的 asSet / closure)
```

被 `paramAccepts` 误放行的 `set` 位（`probe4.ts` 末尾直接列出）：

```
quotient   1:subset      cosetAction 1:subset      intersection 0/1:subset
union      0/1:subset    difference  0/1:subset      productSet   0/1:subset
centralizer 1:subset     normalizer  1:subset      closure      0:subset
underlyingSet 0:setlike
```

### 附：这不是"用户不该这么拖"

`pairOps` 对 `contains` / `isomorphism` **专门做了实判**（`interaction.ts:287-312`），
`OpDef.fits` 的注释也写着"列出来点下去必被拦住 = 撒谎"。所以**设计意图就是"不撒谎"** ——
只是覆盖到了那两条，没推广到 `subset` / `setlike` / `omega` 这几档。

---

## 3. F2–F5：同一病根的另外几处

### F2（中）跨 id 空间的群被误认成子群

`paramAccepts` 的 `groupAsSet` 用 core 的 `isSubgroupElementSet`（`ops.ts:3573`）——
它**对认不得的元素引用是静默的**（`verify/README.md` 第 17 条：会得出 `V_4 ≤ D_4` 的假结论），
而 `containment()` 是**加了两道关**才可信的。于是独立构造的两个群之间：

```
拖 A_4 → S_4：列 quotient / cosetAction / C_G / N_G  →  点了报「元素不在 A 里，不是同一个群里的子群」
```

（`containment` 的那两道关没有走到 `paramAccepts` 这条路上来。）

### F3（中）`fits` 预检只有 2/45

```
grep -c "fits:" src/gal/ops.ts   ->  2
```
只有 `semidirectProduct`(1480) 与 `customAction`(2013) 有预检 —— 正是 U51/U52 那两处
"真实的菜单撒谎"（`docs/HISTORY.md:3242`）。**这个模式是对的，但没有推广**。

而且已有的那一处也仍有缝：

```
拖 G(S_4) → Z(= Z(G) = C_1)  ->  semidirectProduct(G, Z)  ->  报「G 与 Z 的半直积本地算不了」
```
`fits` 与 `planSemidirect` 号称共用 `semidirectBudget`，但对平凡群这一档没对齐 ——
**"共用同一个判据"这句话本身，又变成了两份**。

### F4（中）`omega` 位同样过宽

`paramAccepts('omega', v)` 对 `set` / `elements` 一律 true（`ops.ts:3596`），
而 `conjOn` 的 run 要求 Ω 是"**某个群的**子群集 / 元素集"。于是：

```
拖 G → P(pointSet)  ->  conjOn(G, P)  ->  报「conjOn 要 Omega 是某个群的子群集 / 元素集」
```

（`conjOn(G, asSet(Syl(G,3)))` 是合法的、也确实是 Sylow 那条主链 —— 问题是 `pointSet` 也被放过。）

### F5（中）Burnside 在画布上零入口

点作用线（`Ac = conjAction(S_4)`）的球，环上铺开的是：

```
信息 · orbits · stabilizer · fix
```

**没有 `burnside`**。原因：`singleOpsFor` 排除了 `result === 'number'` 的 op
（`interaction.ts:95-97`，"计算先不弄"那条老决策），而 burnside 产数值。
另外两个手势入口也够不着它：⊕ 球要求 ≥2 个画布对象位（burnside 只有 1 个），拖拽要求 2 个位。

⇒ **用户点完作用、想看"有几条轨道"，界面上点不出来，必须手打 `burnside(Ac)`**。
README 却把它和 `orbits` / `stabilizer` / `fix` 并列在同一行（"作用导出 / Burnside"），
暗示它该在环上。**"作用才是主角"（U57 那句话）在这一处断了。**

（`ord` 同样零手势入口，但那条是"计算先不弄"的既定决策，另有文本入口与数值区，**这次不判为问题**。）

---

## 4. 数学语义：手算逐条核对（无错）

不看任何现有断言，全部手算期望值后用 `buildLines` 真跑（`.tmp-audit/math.ts`、`probe2/probe3.ts`）。

| 项 | 手算期望 | 实测 | |
|---|---|---|---|
| `S_4`/`C_6`/`D_4`/`Q_8`/`A_4` 阶 | 24 / 6 / 8 / 8 / 12 | 同 | ✅ |
| `gcd(12,18)` `lcm(4,6)` `phi(12)` `C(12,4)` `Cmod(12,4,2)` `factor(24)` | 6 / 12 / 4 / 495 / 1 / 2³·3 | 同 | ✅ |
| `ord(S_4,(123))` | 3 | 3 | ✅ |
| `Z(S_4)` `Z(D_4)` `Z(Q_8)` `Z(C_6)` | 1 / 2 / 2 / 6 | 同 | ✅ |
| `[S_4,S_4]` `[D_4,D_4]` `[Q_8,Q_8]` | 12(A_4) / 2 / 2 | 同 | ✅ |
| `Aut(S_4)` `Aut(C_6)` `Aut(C_2²)` | 24 / 2 / 6 | 同 | ✅ |
| `Inn(S_4)` `Inn(C_6)` | 24 / 1 | 同 | ✅ |
| `Sub(S_4)`（**不含自身**） | 29 | 29，阶分布 1·9·4·7·4·3·1 | ✅ |
| `Syl(S_4,2)` `Syl(S_4,3)` | 3 个阶8 / 4 个阶3（n₂=3, n₃=4） | 同 | ✅ |
| `maximalSubgroups(S_4)` | 8（4×S_3 + 3×D_8 + A_4） | 8，{6,6,6,6,8,8,8,12} | ✅ |
| `orbits(conjAction(S_4),(12))` | 6（对换共轭类） | 6 | ✅ |
| `stabilizer(conjAction(S_4),(12))` | 4（=24/6） | C_2×C_2 = 4 | ✅ |
| `fix(conjAction(S_4))` | 1（中心） | 1 | ✅ |
| `burnside(conjAction(S_4))` | 5（共轭类数） | 5 | ✅ |
| `map(C_6,C_6,a→2)` ker/im | 2 / 3 | 2 / 3，hom=true | ✅ |
| `S_4/A_4` `C_2×C_3` | 2 / 6 | 同 | ✅ |
| `C_3:C_2` | 6（S_3 或 C_6，需披露 φ） | 6（未在层上看到 φ 披露，见备注） | ⚠️ |
| `smallGroup(8,3)` `smallGroup(16,3)` | D_8 / (C_4×C_2):C_2 | 同 | ✅ |
| `A_4 ⊆ S_4` | contains, index 2, normal=true | 同 | ✅ |
| `C_6 ≅ C_2×C_3` | isomorphic | 同 | ✅ |

**备注（非错误，仅观察）**：`C_3 : C_2` 只从对象表读到阶 6，`φ` 是否披露要看信息面板的 note
（本次没在 SSR 层取到；U51 的分诊逻辑声称"多解列候选"，与此不冲突，留待需要时再查）。

**观察（F7）**：`normalSubgroups(S_4)` 回 4 个（**含 G 自身**，阶 {1,4,12,24}），
而 `Sub(S_4)` / `maximalSubgroups(S_4)` **都不含自身**。数学上"正规子群含 G 自身"是对的，
但同一个族里两种口径并列在界面上，用户会问"为什么正规子群多算一个"。**建议统一或加一句说明。**

---

## 5. 建议的修法（按性价比排，未动手）

1. **F1 是根，先收判据**：让 `paramAccepts` 的 `subset` / `setlike` 与内核 `subgroupArgOf` /
   `underlyingSet.run` **共用一份**"这个值能不能当集合参数"的判据。
   最小改动：`subset` / `setlike` 分支去掉 `|| v.type === 'set'`（`set` 是 Ω 载体，不是数集）；
   或反过来给内核加 `set` 支路 —— **二选一，但必须同手改**。
   改完 `pairOps` 的 324 条假候选与集合球上那两颗按钮会一起消失。
2. **F2**：`groupAsSet` 改走 `containment()`（带两道关），而不是裸 `isSubgroupElementSet`。
3. **F3**：把 `fits` 从"两条特例"提升为**每个 op 可选的一等字段**，至少补上
   `quotient` / `cosetAction` / `C_G` / `N_G` / `image` / `conjOn`；同时把 `semidirect`
   那处对平凡群的缝对齐。
4. **F4**：`omega` 分支按 `omegaArgOf` 的真实能力收紧（区分"有母群的子群集/元素集"与"合成点集"）。
5. **F5**：给作用线的环补一颗 `burnside`（或在环上放"轨道数"），
   或明确在 README 里把它标成"仅文本入口"。
6. **F6/F7**：README 归类与 `normalSubgroups` 的自含性，各补一句说明或对齐。

## 6. 复现命令

```bash
cd apps/web
# 入口矩阵（静态）
node node_modules/vite/bin/vite.js build --ssr .tmp-audit/entries.ts --outDir .tmp-audit/out --logLevel warn && node .tmp-audit/out/entries.js
# 数学语义
node node_modules/vite/bin/vite.js build --ssr .tmp-audit/math.ts   --outDir .tmp-audit/out2 --logLevel warn && node .tmp-audit/out2/math.js
# 菜单撒谎（pairOps 全量真跑）
node node_modules/vite/bin/vite.js build --ssr .tmp-audit/probe4.ts --outDir .tmp-audit/out6 --logLevel warn && node .tmp-audit/out6/probe4.js
# 真机（先起 dev server 5273）
env -u HTTP_PROXY -u HTTPS_PROXY node .tmp-audit/repro-set-menu.mjs
env -u HTTP_PROXY -u HTTPS_PROXY node .tmp-audit/repro-drag.mjs
```

**入口矩阵（静态）要点**（`entries.js`）：45 条 op 里 32 条有画布手势入口；
12 条只有文本入口 —— 其中 `pointSet`/`labeledSet`/`smallGroup` 有「目录」面板（U56，正常），
`factorize`/`binomial`/`binomialMod`/`gcd`/`lcm`/`eulerPhi`/`elementOrder` 是"计算"（正常），
**`burnside`（orbitCount）与 `kernel` 例外 —— 见 F5 与备注**。
（`kernel` 需要画布上有一条映射边；映射是边、可点选，`radial-menu.mjs` 已验过 ker/im 可达，
本次探针未造映射值，故列为待复核。）

---

## 7. 修复记录：F1 + F4（2026-10-04 晚，用户授权"内核补 set"）

> 授权原话：**"内核补 set，修"** —— 选的是 §5 建议里"给内核加 `set` 支路"那一支
> （另一支是"把 `set` 从 `subset`/`setlike` 里去掉"）。

### 7.1 修法：判据收成一份（`ops.ts#setElementSetOf`）

病根是判据分家，所以修法不是"两边各改一下"，而是**让两边共用同一个函数**：

```ts
/** `set` 值 → 元素集（`subset` 位的唯一读法，内核与菜单共用）。 */
function setElementSetOf(v: GalValue): { group: Group; elements: GroupElement[] } | null {
  if (v.type !== 'set' || !v.set.group) return null          // ① 抽象点集没有母群 ⇒ 拒
  const G = v.set.group
  const elements: GroupElement[] = []
  for (const m of v.set.members) {
    if (m.subgroupElements) return null                       // ② 成员是子群点 ⇒ 拒
    const e = resolveElementLoose(G, m.label)
    if (!e) return null
    elements.push(e)
  }
  return { group: G, elements }
}
```

于是"补"与"收窄"**同时**发生 —— 这正是分开改做不到的：

| 值的来路 | 改前（菜单说了算） | 改后 | 数学上 |
|---|---|---|---|
| `asSet(群)` / `asSet(元素集)` 的 set | 列，点下去**报错** | ✅ 列，**能跑**（内核补上了） | 是元素集的提升 ⇒ 该收 |
| `asSet(子群集)` 的 set | 列，点下去**报错** | ❌ 不再列（②） | 成员是子群，不是群元素 ⇒ 不该当元素集 |
| `pointSet(n)` / `labeledSet(...)` | 列，点下去**报错** | ❌ 不再列（①） | 抽象点集，没有母群 ⇒ 是 Ω，不是元素集 |
| `asSet(set)`（底集套底集） | 列，点下去报**"没有底集可取"** | ❌ 不再列；手打则报**"已经是集合了"** | 底集是"忘记结构"，set 早没结构可忘 |

同步改的三处：
1. `elementsOf`（喂内核：`elementSetArgOf` → `C_G` / `N_G`）加 `set` 支路，
   `subgroupArgOf`（喂 `closure` / `setOp` / `商` / `cosetAction`）改为复用 `elementsOf` —— **判据只有一份**。
2. `paramAccepts` 的 `subset` 分支：`set` 改判 `setElementSetOf(v) !== null`（与内核同宽）。
3. `paramAccepts` 的 `setlike` 分支：**去掉 `set`**（`底集` 的 run 本来就不收，菜单跟着收，才不撒谎）。

**F4（顺带修，同一函数内）**：`paramAccepts` 的 `omega` 分支对 `set` 改为 `v.set.group != null`。
`omega` 位**唯一**的消费者是 `conjOn`，而它的 run 里 `ambient`（= `omegaArgOf` 读出的 `group`）为 null
必然报错 —— 判据与那道关同宽即可。抽象点集要走 `customAction`（它的位是 `omegaOrInt`，不受影响）。

> 为什么 F4 必须搭车修：F1 修完，拖「群 → 点集」的菜单从 10 条缩到 **2 条**
> （`conjOn` + `customAction`），而 `conjOn` 那一条**仍然报错** —— 不修 F4，
> "拖群到点集菜单不撒谎"这个验收结论就不成立，u57 的断言也无法诚实地翻。

### 7.2 读数对照（同一份探针 `probe4.ts`，改前 / 改后各跑一次）

| 量 | 改前 | 改后 |
|---|---|---|
| 拖拽候选总数 | 486 | 230 |
| **其中"列出来必报错"** | **324（67%）** | **68（30%）** |
| 单对象候选 / 其中必报错 | 70 / **6** | 64 / **0** |
| 拖 G(S_4) → P(pointSet(4)) 的菜单 | 10 条（9 条必报错） | **1 条**（`customAction`，能跑） |

**对照跑（防"按下葫芦浮起瓢"）**：把 `ops.ts` 临时回退到 HEAD 再跑同一份 `probe4`，
两份 LIE 行集合做差 —— **只在改后出现的 = 0 条**（无回退），**被修掉的 = 246 条**。

残留 68 条**不是**本次改动引入的：全是 **F2** 那一类（跨 id 空间的群被 core 的静默判据
`isSubgroupElementSet` 放行，如拖 `Z(G)` 到 `A_4` 上列 `quotient` 而报"元素不在"）。
改前改后同在，等 F2 点名再修。

### 7.3 断言与走查

- **翻了两条过时断言**（`verify/suites/u57.ts`）：它们记的是**当时的筛子实现**、不是数学事实
  （"集合运算照旧并列" / "点集确实有单对象操作（底集/生成子群）"）。两条都直接对应本文
  §2 的真机复现，即"把撒谎行为写进了断言"。翻法是把"有"改成"**没有（本来就不该有）**"，
  并**补一条**守住 U57 的原意（"点集不是死路"）：拖一个群过去必须列得出 `customAction`。
- **新增真机套件** `verify/e2e/set-menu.mjs`（6 组场景）：拖群到点集菜单只剩能跑的 ·
  点集球上不再列 `asSet`/`closure` · 手打时报错语对症 · **D_4 拖到 `asSet(center(D_4))` 上
  商算得出**（"补 set"这一半的正向证据）。已挂进 `verify:e2e` 链尾。
- 三验：`typecheck` **0** · 语义层 **2329 PASS / 0 FAIL**（较基线 +2，来自 u57 新增的两条）·
  走查 **33 套 1129 PASS / 0 FAIL**（新增 `set-menu.mjs` 16 条；`action-entries` 40 → 43 条）。

> 注：`paramAccepts` 对 `set` **不做**"与前缀群是否同群"的检查，这与 `elements` 档一致
> （跨群由各 `run` 里的 `foreignElementSetFail` 给出对症诊断）。若把 `groupAsSet` 那套
> 搬过来，反而会**漏报** `G / asSet(A_4)` 这种"独立构造但同构、autoTranslatedSubgroup 能翻译"
> 的合法情形 —— 那条属于 F2，不能顺手塞进来。
