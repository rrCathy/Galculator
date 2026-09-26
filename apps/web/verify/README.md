# 验证线（回归线）

> **这是资产，不是临时物。** 2026-09-19 之前这套脚本住在 `.tmp-verify/`（被 `.gitignore` 忽略），
> 一次临时目录清理就丢了 363 条断言——ROADMAP 里引用的 U0–U7 数字再无法复现。
> 从此入库。

## 两段

| 段 | 内容 | 位置 |
|---|---|---|
| **语义层** | 纯逻辑断言：注册表 / 求值 / 派生图 / 结论层 | `verify/run.ts` + `verify/suites/*.ts` |
| **几何层** | 真浏览器：DOM 里读节点坐标与箭头 marker，验硬规范 | `verify/e2e/*.mjs` |

期望值一律**来自数学**（手算的理论值），不从运行结果里抄——否则测试永远通过。

## 跑法

```bash
# ① 语义层：vite SSR 打包后 node 直跑（绕开浏览器）
cd apps/web
node node_modules/vite/bin/vite.js build --ssr verify/run.ts --outDir .tmp-verify/vout --logLevel warn
node .tmp-verify/vout/run.js          # 有 FAIL 时退出码非 0
# 等价：pnpm --filter @galculator/web verify

# ② 几何层：先起 dev server，再跑走查
node node_modules/vite/bin/vite.js . --port 5273 --host 127.0.0.1   # 后台
node verify/e2e/dock-layout.mjs       # 左上抽屉分列 + 两栏都展开时的封顶（U16）
node verify/e2e/layout-spec.mjs       # 布局硬规范体检（三张图 + 截图）
node verify/e2e/first-iso-square.mjs  # 第一同构正方形（G8）
node verify/e2e/third-iso.mjs         # 第三同构骨架（G4）
node verify/e2e/tex-render.mjs        # 面板 TeX 渲染与记号回认（U14）
node verify/e2e/proof-step.mjs        # 证明面板的 step-through（M1）
node verify/e2e/proof-sylow3.mjs      # Sylow III 的 14 步与孤点判据（M2）
node verify/e2e/proof-params.mjs      # 证明模板的入参界面（U15）
node verify/e2e/proof-m3.mjs          # 轨道–稳定子 / 第一同构的参数槽与正方形（M3）
node verify/e2e/usability-fixes.mjs   # 结论区不再沉默 / φ 能敲 / 报错分清（U18）
node verify/e2e/relations.mjs         # 关系层：用户的 S₄↠S₃ 剧本（U19）
node verify/e2e/relation-ops.mjs      # 子群像 f(H) 与声明包含 H ⊆ G（U20）
# 等价：pnpm --filter @galculator/web verify:e2e
```

- **走查脚本要起跑的模板，点的是卡片上的 `.proof-start`**，不是卡片本身
  （U15 起卡片带参数控件，点卡片不再等于起跑；卡片上有 `data-tpl="<模板 id>"` 可定位）。
- **抽屉的类名不看顺序看标题**：左上一列里 `.dock` 有多个（对象 / 操作 / 信息），
  定位用 `.dock:has(.dock-title:text-is("操作"))` 或 `.dock-title` 文本，别用 `.nth(i)`
  （U16 把对象与操作叠进同一个 `.dock-col` 之后，DOM 顺序与"视觉顺序"仍然一致，
  但**列分组**变了，`.nth()` 断言的语义会跟着变）。

- 走查用 **GroupViz 项目里已装的 playwright**（`file:///C:/newproject/GroupViz/node_modules/playwright/index.mjs`），
  启动必须带 `args: ['--no-proxy-server']`，且命令前清代理变量（`env -u HTTP_PROXY -u HTTPS_PROXY …`），
  否则 chromium 打不开 `127.0.0.1` 而 curl 却是通的，极易误判成"服务挂了"。
- 走查脚本一律从 `?empty=1`（空画布）起、自己铺前置行——只依赖自己写了什么，
  产品改默认示范不会打崩它们。`layout-spec.mjs` 里唯一使用默认示范的那段是**故意的**（它是门面）。
- 截图落在仓库根的 `docs/assets/`（脚本 cwd 是 `apps/web`，所以路径写 `../../docs/assets/…`）。

## 写断言时的坑（都是真踩过的）

1. **块注释里不能出现"星号 + 斜杠"**——哪怕是在行内代码里写通配路径（`.tmp-*` 加斜杠）。它会提前终止注释，后面整段中文变成代码，报的错却是"Expected a semicolon"，位置还指向另一行。第一版 `harness.ts` 就栽在这上面。
2. **rolldown 1.2.8 的 transform 很脆**：模板串里"换行转义 + 多字节字符"、以及 U+2500（制表横线）都会报 `Invalid ...` 而构建失败，**连写在注释里也炸**（它先做 transform）。所以 `harness.ts` 的输出装饰一律 ASCII。
3. **`JSON.stringify` 不了域对象**：`Group.generators[].inverse` 指回生成元，是循环引用。断言里只比扁平字段（`ok`/`error`/`label`/`order`）。
4. **Ω 上的点怎么寻址，看 Ω 是什么**（判据在 `ops.omegaIndexOf`）：Ω 是**集合**（成员是子群，如 `Syl_p(G)`、陪集）时按 **1 起的数字下标**（`轨道(B, 1)`——标签里含逗号，没法用标签寻址）；Ω 是 **G 自身**（共轭作用 / 正则作用）时按**元素记号**（`轨道(A, (123))`）。M3 首轮就栽在这条：`轨道(A, 1)` 在 S₄ 上被拒（没有叫 `1` 的元素），在 C₆ 上却侥幸成功。
5. **几何断言别写"端点重合"**：边的端点被节点尺寸裁过，两条边共用同一个对象时端点并不相等。要比的是**轴向**（水平边两端 y 相等）与**节点中心**（从 `.gnode-hit` 的 cx/cy 读）。
6. **别写恒真断言**（`ok('...', true)`）——那是装饰不是测试。写不出判据就说明这条不该断言。
7. **回归失败先判"bug 还是期望值写错"**：本次首轮 12 条 FAIL 全是期望值算错（`|D₄/⟨r²⟩|`、`⟨r⟩ ∩ ⟨s⟩`、`n₂(D₄)`、Ω 的 1-based 下标）。改断言前先重算一遍数学。
8. **`|G| ≤ 144` 之外别建 Sylow**：`findSylowSubgroups` 到那个量级就不给算了。参数体检（`proof.stageInfo`）先拦，别让断言卡在枚举里。
9. **core 元素 `label` 在置换群上单循环不带括号**（S₄ 的 `234` / `12`，而双对换却是 `(12)(34)`）。要显示或写进定义行时过 `ops.elementNotation`——它带**回认判据**，所以 C₁₂ 里标签为 `10` 的元素会被正确留在原样（`(10)` 解析不了）。
10. **`n_p` 与 `m` 是 Sylow III 里最容易抄反的一对**：`m = |G| / pᵏ`（不是 `|G| / n_p`）。本次 5 条 FAIL 全出自这里。
11. **面板把 `step.text` 当纯文本渲染**（只有 `tex` 走 KaTeX）：模板文本里写 `**强调**` 会原样显示成两颗星（M3 首轮截图里就露出来了）。断言里加了"文案不含 `**`"的哨兵；要强调请用「」。
12. **循环群里的单字母一律视作那个生成元**（`resolveElementLoose` 的第 ③ 级）：`映射(G, H, a→x)` 在 C₆ 上**是合法的**（`x` 等价于 `a`），别拿它当"元素不存在"的反例——要用 `a→9`。
13. **轨道的值类型随 Ω 变**：Ω = G 自身时是 `elements`，Ω 是集合时是 `set`。读"轨道多大"得认两种（`suites/proof.ts` 的 `orbSize`），只按 `set` 读会得到 `-1` 而看不出为什么。
14. **dev server 的 host**：`vite.config.ts` 里已写死 `127.0.0.1`——默认的 `localhost` 在 Node 18+ 会解析成 `::1`（只监听 IPv6），而走查脚本一律连 `http://127.0.0.1:5273`，会报 `ERR_CONNECTION_REFUSED`，看着像"服务没起"。
15. **左上「对象」与「操作」是**两个**抽屉**：前者列 `origin === 'input'`（手写声明）、后者列 `derived`（运算产物，映射 / 核 / 像都在这里）。而 `DockPanel` **收起时 body 整个不渲染** —— 不先展开「操作」抽屉就去读 `.row-click`，会**只读到一半对象**（U18 走查栽过：映射建出来了却"查不到"）。
16. **点左栏的行要按 `.row-name` 里的 id 匹配，不要按文本包含**：行里渲染的是**原始定义**（`S = S_4`），而 `S₄` 是 `prettySymbol` 之后的展示形态。拿展示形态匹配永远匹不上，而信息面板会**停在上一个被选中的对象**上 —— 于是失败原因看起来像"说明没渲染"（U18 走查的真实误判）。
17. **`subgroupFromElementIds` 对认不得的元素引用是静默的**：`subgroupFromElementIds(D_4, ['e','a','b','c'])` **不报错**，它把不认识的引用一丢了之、返回**平凡子群**。于是"id 子集 + core 校验"的朴素包含判定会得出 `V₄ ≤ D₄`（V₄ 的 id 是 `e a b c`，D₄ 的是 `r0…s3`）。判包含必须**另加两道关**：id 全覆盖 + 校验出的子群阶 = `|H|`（见 `gal/relations.ts` 的 `containment()`）。
18. **判包含不能只看 id 前缀**：`C₂` 的 id 是 `e0 e1`、`C₄` 的是 `e0 e1 e2 e3` —— **真子集**，第 ① 关会通过。挡住它的是"乘法封闭"（`e1 + e1 = e2 ∉ {e0,e1}`）。凡是按 id 判结构关系的地方，都要拿**群运算**兜一次。
19. **KaTeX 渲染后的文本要抹零宽字符再比**：`.rel-body` 里是 KaTeX（`K ≤ A` 会带上 `\u200b` 之类），断言前先 `replace(/[\u200b\u2061\u2062]/g,'').replace(/\s+/g,'')` 再 `includes`（`e2e/relations.mjs` 的 `relState`）。**附注那行是纯文本**（`.rel-detail`），比它更稳——优先断言它。
20. **PowerShell 里跑中文输出的回归会变乱码**：`node … | Out-File -Encoding utf8` 会先按控制台代码页（GBK）解码 node 的 UTF-8 输出。跑前先设 `$OutputEncoding = [Text.Encoding]::UTF8; [Console]::OutputEncoding = [Text.Encoding]::UTF8`。更稳的写法是让探针自己用 `fs.writeFileSync(..., 'utf8')` 落盘（`.tmp-probe/*.ts` 都这么做）。
21. **走查里点画布上的边/节点要派发事件，不能用 `page.click`**：`.gedge-hit` / `.gnode-hit` 的 `stroke`/`fill` 是 `transparent`，Playwright 的动作性检查判它 "not visible"（截图里它确实什么都不画），会白等 30s 再 `TimeoutError`。改用 `el.dispatchEvent(new MouseEvent('click', { bubbles: true }))`（React 18 的监听挂在根容器上，冒泡能到）。`e2e/relation-ops.mjs` 的 `clickSvg` 就是这个。
22. **断言"值"时不要 `JSON.stringify(值)`**：`Group` 里有 `generators[].inverse` 指回生成元自己（环），一 stringify 就抛 `Converting circular structure to JSON`，**而且是在整份回归跑到那一行时崩掉**（不是只失败一条）。写个 `describeValue()` 只摘 `symbol/order/index/isNormal` 那几项（`suites/usability.ts` 顶部）。
23. **布局的"水平穿行"是另一半硬规范**：老走查只判了竖直箭头不穿对象，水平那半没判 —— 于是"两条水平边共用一个端点"时列序自相打架（`psi: B→G` 从 `H` 身上横穿）**一直没被发现**。`e2e/layout-spec.mjs` 现在两条都判。判据：水平的边（Δy ≤ 2）两端之间有别的节点的中心（同 y ±6）即失败。
24. **`⊆` 这类"绝不会出现在群记号里"的中缀要进 `UNICODE_ALIASES`**：`findTopLevelInfix` 只认"两侧都不是标识符字符"的中缀，`H⊆G`（不补空格）会被当成一个整词。`∩`/`∪`/`·` 早就这么处理了，`⊆` 是 U20 补的。另外可以趁这个符号的"独占性"做一件直积的 `x` 不能做的事：`R = A ⊆ K9`（某一侧打错）**直接报"是哪一侧算不出来"**，而不是掉进记号解析、最后答非所问地说"这行写的是一个关系"。
