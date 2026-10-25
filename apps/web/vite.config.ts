import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  /**
   * GitHub Pages 的**项目页**站点根是 `/<repo>/`（仓库是 `rrCathy/Galcalculator`
   * ⇒ `/Galculator/`）—— 产物里的资源路径必须带这个前缀，否则线上 `index.html`
   * 引的 `/assets/...` 全 404，打开就是白屏。
   *
   * ⚠️ **大小写敏感**：仓库名是 `Galcalculator`（首字母 G、中间是 alculator），
   * Pages 的路径就是 `/Galculator/`。写错一个字母 = 全站白屏。
   *
   * **只在 `build` 时加**：dev server 仍从根起（`verify/e2e/*` 41 套一律连
   * `http://127.0.0.1:5273/`，给 dev 加前缀会把它们全打断）。
   *
   * 验证生产形态：`npm run build` → 用任意静态服务器把 `dist` 挂在 `/Galculator/`
   * 下访问（`vite preview` 不吃这个 base，别拿它验）。
   *
   * ⚠️ 换自定义域名、或改成用户首页（`rrCathy.github.io` 根）时，这里回到 `'/'`。
   */
  base: command === 'build' ? '/Galculator/' : '/',
  plugins: [react()],
  // host 写死 127.0.0.1：默认的 'localhost' 在 Node 18+ 会解析成 ::1（只监听 IPv6），
  // 而 verify/e2e/* 一律按 `http://127.0.0.1:5273` 连（见 verify/README.md）。
  server: { host: '127.0.0.1', port: 5273, strictPort: false },
}))
