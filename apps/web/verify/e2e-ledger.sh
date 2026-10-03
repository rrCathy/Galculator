#!/usr/bin/env bash
# 走查台账：**逐个**跑 verify/e2e/*.mjs，打印每套条数 + 加总，失败时打印 FAIL 行。
#
# 为什么是 shell 而不是 node：
#   node 里 spawn 出来的孙进程会 `spawnSync ... EBUSY`（REFERENCE §8 实测）——
#   那会得到"**21 套全 0 PASS / 0 FAIL**"，看着像 dev server 没起，其实是被沙箱挡了。
#   **shell 里的直接子进程才是正解。**
#
# 为什么不用 `npm run verify:e2e` 数条数：
#   那条是 `&&` 链、常被接上 `| tail` ⇒ **退出码是 tail 的**，且它不报条数。
#   批次收尾要的是"28 套各多少条、有没有 FAIL" —— 那是这个脚本的事。
#
# 用法（**cwd 必须是 apps/web**：截图的 path 相对 cwd，见 REFERENCE §8）：
#   bash verify/e2e-ledger.sh                      # 全部（自动枚举 verify/e2e/*.mjs）
#   bash verify/e2e-ledger.sh point-set connect    # 只跑这几套（调试用）
#
# 退出码：0 = 全过；1 = 有套件 FAIL；2 = dev server 没起。
set -u

BASE="${GAL_BASE:-http://127.0.0.1:5273}"

# ① 先 ping —— dev server 会在两次调用之间**静默死掉**，别信上一轮的 200（REFERENCE §8）
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 --noproxy '*' "$BASE/" 2>/dev/null || true)
if [ "$code" != "200" ]; then
  echo "!! dev server 没在跑：$BASE -> ${code:-timeout}" >&2
  echo "   先起：cd apps/web && npm run dev（用 run_in_background，别用 (npx vite &)）" >&2
  exit 2
fi

if [ "$#" -gt 0 ]; then
  LIST="$*"
else
  LIST=""
  for f in verify/e2e/*.mjs; do
    LIST="$LIST $(basename "$f" .mjs)"
  done
fi

total_pass=0
total_fail=0
suites=0
bad=""

for name in $LIST; do
  out=$(node "verify/e2e/$name.mjs" 2>&1)
  code=$?
  pass=$(printf '%s\n' "$out" | grep -c '^  PASS')
  fail=$(printf '%s\n' "$out" | grep -c '^  FAIL')
  suites=$((suites + 1))
  total_pass=$((total_pass + pass))
  total_fail=$((total_fail + fail))
  printf '%-20s exit=%-3s PASS=%-4s FAIL=%s\n' "$name" "$code" "$pass" "$fail"
  if [ "$fail" != "0" ] || [ "$code" != "0" ]; then
    bad="$bad $name"
    printf '%s\n' "$out" | grep '^  FAIL' | sed 's/^/      /'
    printf '%s\n' "$out" > ".tmp-e2e-fail-$name.log"
    echo "      （完整输出在 apps/web/.tmp-e2e-fail-$name.log）"
  fi
done

echo '----------------------------------------'
echo "$suites 套：$total_pass PASS / $total_fail FAIL"
if [ -n "$bad" ]; then
  echo "红的：$bad"
  exit 1
fi
echo '截图已随本套重跑刷新 —— 推前跑 `git status --short docs/assets/` 复核差异。'
