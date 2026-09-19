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
node verify/e2e/layout-spec.mjs       # 布局硬规范体检（三张图 + 截图）
node verify/e2e/first-iso-square.mjs  # 第一同构正方形（G8）
node verify/e2e/third-iso.mjs         # 第三同构骨架（G4）
# 等价：pnpm --filter @galculator/web verify:e2e
```

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
4. **Ω 上的点用 1 起的数字下标寻址**（`轨道(A, 1)`）——Ω 的成员是子群，标签里含逗号，不能用标签寻址。
5. **几何断言别写"端点重合"**：边的端点被节点尺寸裁过，两条边共用同一个对象时端点并不相等。要比的是**轴向**（水平边两端 y 相等）与**节点中心**（从 `.gnode-hit` 的 cx/cy 读）。
6. **别写恒真断言**（`ok('...', true)`）——那是装饰不是测试。写不出判据就说明这条不该断言。
7. **回归失败先判"bug 还是期望值写错"**：本次首轮 12 条 FAIL 全是期望值算错（`|D₄/⟨r²⟩|`、`⟨r⟩ ∩ ⟨s⟩`、`n₂(D₄)`、Ω 的 1-based 下标）。改断言前先重算一遍数学。
