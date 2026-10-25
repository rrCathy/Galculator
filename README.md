# Galculator

**群论计算器** —— 敲一行定义，算它的阶、结构、子群、同态、轨道。
每一步运算都留在画布上，变成下一步的输入。

[**在线试用**](https://rrCathy.github.io/Galculator/) · [文档](docs/README.md) · [问题反馈](https://github.com/rrCathy/Galculator/issues)

![Galculator：S₄ 的轨道–稳定子计算](docs/assets/readme-hero.png)

## 它是什么

群论计算器，不是"把群画出来"的工具。

- **输入**是一行定义：`G = S_4`、`N = normalSubgroups(G)`、`Q = quotient(G, N)` —— 语法就是操作名，跟菜单上看到的一致。
- **输出**是画布上的一个对象。它不是一个答案字符串，而是一个能继续被点的东西：点它问"你是什么"（阶 / 是否交换 / 同构于谁 / 子群 / 元素表），点它做"下一步运算"（商、闭包、作用、像）。
- **画布是操作台**，不是结果展示区。箭头是运算本身：`Q = quotient(G, N)` 会画出 `G → Q` 的商映射；给一个映射 `f`，第一同构定理的另外两条线会自动补上。

所以它更像 Desmos 之于函数：改一个定义，图跟着变。区别是这里的对象是群、子群、商群、作用与同态。

## 三十秒上手

在线打开 <https://rrCathy.github.io/Galculator/>，在底部输入框敲：

```text
G = S_4
```

回车，画布上出现 `S₄`。点它，底部升起工作台：阶 24 = 2³·3、生成元、是否交换 / 循环 / 单 / 可解，以及 `Aut(S₄) ≅ S₄`、`Z(S₄) = 1`、`[S₄,S₄] = A₄` 这些课本结论。

本地跑：

```bash
pnpm install
pnpm dev        # → http://127.0.0.1:5273
```

从空白画布开始：地址后加 `?empty=1`。

## 能算什么

下面每个例子的数字都是真跑出来的。

**挑出满足条件的元素**

```text
G = S_4
J = {x in S_4 : x^2 = e}
```

得到 10 个元素：`e` 加上 6 个对换、3 个双换位。这一批恰好对乘法封闭，面板会说破「这本身就是一个子群 `C₂×C₂`」，并给一颗「升格为群」。

**枚举子群结构**

```text
G = S_4
N = normalSubgroups(G)
M = maximalSubgroups(G)
```

4 个正规子群（阶 1 / 4 / 12 / 24）、8 个极大子群（一个 `A₄`、三个 `D₄`、四个 `S₃`）。列表里每一项都能「取出为对象」，继续对它做运算。

**商群，以及它同构于谁**

```text
G = S_4
N = closure(G, (12)(34), (13)(24))
Q = quotient(G, N)
```

`Q` 阶 6，面板结论区直接写 `≅ S₃`。

**Sylow 与群作用**

```text
G = S_4
P = Syl(G, 2)
```

3 个 Sylow 2-子群，各阶 8。对子群集做共轭作用，轨道分解、`n_p ≡ 1 (mod p)`、`n_p | m` 这些结论会写进结论区。

**Burnside 引理**

```text
G = D_4
A = conjAction(G)
k = burnside(A)
```

`k = 5`，并且副行给出 `40 / 8 = 5` 的当场对账 —— 直接数与平均式两条路互相验证。

**定理逐步演示**

右上角「证明」面板里有 5 条模板：Sylow I / II / III、轨道–稳定子、第一同构定理。点「下一步」，这一步的定义**真的写进定义表**，画布跟着长出一块 —— 证明不是念稿，是在这个群上现场算一遍。

![工作台：对象槽、符号键盘与信息面](docs/assets/readme-workbench.png)

## 怎么操作

三个等价的入口，走同一条求值路：

| 入口 | 你要做什么 |
|---|---|
| **输入框**（底部） | 打一行 `名字 = 表达式`；名字留空会自动命名，表达式边打边校验 |
| **点对象** | 点画布上的节点 → 环绕出「基本 / 元素 / 子群 / 操作」，选一项就执行 |
| **拖两个对象** | 从 A 拖到 B 松手，列出这两个对象能做的事；唯一候选直接执行 |

「补参」也不用手打记号：元素按阶升序列成可点的 chips，素数只列当前群阶的素因子。

## 输入语法

全部操作名是 ASCII 英文，与菜单标签一一对应（`S_4` 而不是 `S₄`，`\varphi` 而不是 `φ`）。常用的一批：

| 输入 | 得到 |
|---|---|
| `G = S_4` · `D_4` · `A_4` · `Q_8` · `C_12` · `GL(2,3)` | 群 |
| `P = G x H` · `Q = G / N` · `N : H` | 直积 / 商群 / 半直积 |
| `K = closure(G, r2, s)` · `K = <J>` | 由生成元造子群 |
| `Z = Z(G)` · `C = C_G(G, x)` · `N = N_G(G, H)` · `Inn(G)` | 作用导出的子群（都是真群对象，可以接着 `Z(Z(G))`） |
| `S = Sub(G)` · `Syl(G, 2)` · `pSub(G, 3)` · `normalSubgroups(G)` | 子群集（每项可取出为对象） |
| `A = conjAction(G)` · `conjOn(G, Ω)` · `cosetAction(G, H)` · `leftAction(G)` · `customAction(G, 4, a -> (1 2 3 4))` | 群作用 |
| `O = orbits(A, x)` · `stabilizer(A, x)` · `fix(A)` · `burnside(A)` | 轨道 / 稳定子 / 不动点 / 轨道数 |
| `f = map(G, H, r -> e, s -> s)` · `ker(f)` · `im(f)` | 同态（不占节点，画成箭头） |
| `V = pointSet(5)` · `L = labeledSet(a, b, c)` · `J = {x in G : x^2 = e}` | 集合 / 元素集 |
| `K = smallGroup(16, 3)` | 从内嵌的 1–31 阶小群表导入（编号同 GAP） |
| `ord(G, (123))` · `Aut(G)` · `gcd(12,18)` · `phi(12)` · `factor(24)` · `C(12,4)` | 属性与算术 |

完整 47 条操作在 [`apps/web/src/gal/ops.ts`](apps/web/src/gal/ops.ts) 的注册表里；界面上按右上角「操作表」可以看全量并按任务分组。

## 画布上的三条硬规范

不是"尽量对齐"，是**必须**：

- **形状 = 类型**：群是一块淡底上的符号，集合是圆。
- **颜色 = 来源**：蓝 = 手写定义，紫 = 运算产物，绿 = 作用。
- **箭头形状 = 映射类型**：`↠` 满射、`↪` 单射、`≅` 同构；判不出来就退回普通箭头，不猜。

水平箭头同高、垂直箭头同列，对象落在可吸附的格点上。

## 开发

```bash
pnpm install
pnpm dev                                  # 开发服务器
pnpm build                                # 生产构建
pnpm --filter @galculator/web typecheck   # tsc --noEmit
pnpm --filter @galculator/web verify      # 语义层断言（纯逻辑，不需要浏览器）
pnpm --filter @galculator/web verify:e2e  # 真浏览器走查（几何、命中、渲染）
```

当前 **2600 条语义断言 + 1476 条走查断言（41 套）全绿**。

约定：期望值一律是**手算**出来的数学值，不从运行结果里抄。这条规矩抓过好几次实现错误（比如把"阶为 2"和"平方等于单位元"混为一谈）。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 19 + TypeScript + Vite |
| 计算内核 | [`@groupviz/core`](https://github.com/rrCathy/GroupViz) v2.3.0（纯算法层，零 DOM） |
| 排版 | KaTeX |
| 画布 | 自研 SVG 交换图 |

计算全部在浏览器里完成，没有后端。

## 项目结构

```
apps/web/
  src/gal/      纯逻辑层（无 React）：值类型、操作注册表、求值、派生画布、证明模板
  src/ui/       画布与面板：SVG 交换图、抽屉、悬浮球、输入卡、工作台
  verify/       回归线：suites/（语义断言）· e2e/（真浏览器走查）
docs/           规范（架构 / 交互 / 图 / 证明）· 核对清单 · 账本（HISTORY）· 路线图
```

## 已知限制

- 计算规模有上限（子群枚举、结构分解都在 60 阶附近），超限时**明说"没算"**，不会给一个错的数字。
- `image(f, H)` 在 H 有多个嵌入时不自动翻译 —— "取哪个嵌入的像"在数学上说不准。
- 裸群之间的正规性问不出答案（`H ⊴ G` 问的是"G 里那个具体拷贝稳不稳"），这时如实回「未判定」。
- 后端计算栈（GAP 之类）没有，目前全靠前端原语。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/ROADMAP.md](docs/ROADMAP.md) | 定位与方向、里程碑、当前规划 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 内核分层、值类型、原语与操作清单 |
| [docs/INTERACTION.md](docs/INTERACTION.md) | 交互规范：操作入口、输入层、画布布局 |
| [docs/DIAGRAM_SPEC.md](docs/DIAGRAM_SPEC.md) | 交换图的六条硬规范 |
| [docs/TASKS.md](docs/TASKS.md) | 群论常见计算清单：每条给可粘贴的输入与实测结果 |
| [docs/HISTORY.md](docs/HISTORY.md) | 开发账本（每次改动的来龙去脉，很长，按需检索） |

## 致谢

计算内核来自同一个人维护的 [GroupViz](https://github.com/rrCathy/GroupViz) —— 本项目只复用它的算法层 `@groupviz/core`，可视化层（`@groupviz/react`）没有接。
