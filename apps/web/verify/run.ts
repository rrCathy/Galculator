/**
 * 回归线入口。
 *
 * ```bash
 * node node_modules/vite/bin/vite.js build --ssr verify/run.ts --outDir .tmp-verify/vout --logLevel warn
 * node .tmp-verify/vout/run.js
 * ```
 *
 * 退出码：有 FAIL 时非 0（可直接接进 CI / pre-push）。
 */
import { summary } from './harness'
import { run as diagram } from './suites/diagram'
import { run as firstIso } from './suites/firstIso'
import { run as thirdIso } from './suites/thirdIso'
import { run as algebra } from './suites/algebra'

diagram()
firstIso()
thirdIso()
algebra()

const failed = summary()
if (failed > 0) process.exitCode = 1
