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
import { run as notation } from './suites/notation'
import { run as proof } from './suites/proof'
import { run as usability } from './suites/usability'
import { run as structural } from './suites/structural'
import { run as structure } from './suites/structure'
import { run as grid } from './suites/grid'
import { run as interaction } from './suites/interaction'
import { run as batch8 } from './suites/batch8'
import { run as batch9 } from './suites/batch9'
import { run as batch10 } from './suites/batch10'
import { run as snapshot } from './suites/snapshot'
import { run as idspace } from './suites/idspace'
import { run as budget } from './suites/budget'
import { run as u50 } from './suites/u50'
import { run as u51 } from './suites/u51'
import { run as u52 } from './suites/u52'
import { run as u53 } from './suites/u53'
import { run as u54 } from './suites/u54'

diagram()
firstIso()
thirdIso()
algebra()
notation()
proof()
usability()
structural()
structure()
grid()
interaction()
batch8()
batch9()
batch10()
snapshot()
idspace()
budget()
u50()
u51()
u52()
u53()
u54()

const failed = summary()
if (failed > 0) process.exitCode = 1
