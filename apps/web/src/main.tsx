import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@groupviz/react/theme.css'
import 'katex/dist/katex.min.css'
import './App.css'
import App from './App'
import { applyTheme, loadTheme } from './theme'

/*
 * 主题（W1）：**挂载前同步应用**——首帧就是正确主题，避免浅色闪一下再变深。
 * 读取顺序与切换细节见 `theme.ts`（默认浅色；`?theme=dark` 强制；本地持久化）。
 */
applyTheme(loadTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
