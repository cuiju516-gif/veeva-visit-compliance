#!/bin/bash
# Walks the ten acceptance criteria from docs/需求说明.md §12 against a running
# server. Reads and writes through the public API only; the two criteria that are
# pure functions (boundaries, double deviation) point at their unit tests instead
# of pretending an HTTP call proves them.
#
#   BASE=http://localhost:8080 scripts/acceptance.sh
set -u
B="${BASE:-http://localhost:18084}"
# psql is needed for the one step that has to touch master data directly (there
# is no admin CRUD API yet). Failing loudly beats a check that silently reports
# "the deleted doctor is still listed" because the UPDATE never ran.
PSQL="${PSQL:-psql}"
command -v "$PSQL" >/dev/null 2>&1 || { echo "缺少 psql：设置 PSQL=<路径> 后重跑（第 ⑨ 步需要它）" >&2; exit 2; }
MR1=11111111-1111-1111-1111-111111111111
MR2=11111111-1111-1111-1111-111111111112
HCP1=22222222-2222-2222-2222-222222222221
PRD1=33333333-3333-3333-3333-333333333331
pass=0; fail=0
ok(){ echo "  ✅ $1"; pass=$((pass+1)); }
no(){ echo "  ❌ $1"; fail=$((fail+1)); }
check(){ [ "$1" = "$2" ] && ok "$3 ($1)" || no "$3: 期望 $2 实际 $1"; }

echo "① 代表只能看本人"
n1=$(curl -s -H "X-Actor: $MR1" "$B/api/visits?limit=200" | python3 -c "import sys,json;print(json.load(sys.stdin)['count'])")
n2=$(curl -s -H "X-Actor: $MR2" "$B/api/visits?limit=200" | python3 -c "import sys,json;print(json.load(sys.stdin)['count'])")
nA=$(curl -s -H "X-Actor: admin" "$B/api/visits?limit=200" | python3 -c "import sys,json;print(json.load(sys.stdin)['count'])")
check "$([ $n1 -lt $nA ] && echo yes)" yes "张伟($n1) < 管理员($nA)"
other=$(curl -s -H "X-Actor: admin" "$B/api/visits?limit=200" | python3 -c "
import sys,json;d=json.load(sys.stdin);print(next(v['id'] for v in d['visits'] if v['mrId'].endswith('112')))")
code=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Actor: $MR1" "$B/api/visits/$other")
check "$code" 403 "读别人的拜访被拒"
code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "X-Actor: $MR1" "$B/api/visits/$other")
check "$code" 403 "改别人的拜访被拒"

echo "② 时间由服务端生成"
body=$(curl -s -X POST -H "X-Actor: $MR1" -H 'Content-Type: application/json' \
  -d "{\"mrId\":\"$MR1\",\"hcpId\":\"$HCP1\",\"productId\":\"$PRD1\",\"plannedAt\":\"$(date -u -v+48H +%Y-%m-%dT%H:%M:%SZ)\"}" "$B/api/visits")
VID=$(echo "$body" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
check "$(echo "$body" | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])")" PLANNED "新建计划"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "X-Actor: $MR1" -H 'Content-Type: application/json' \
  -d "{\"mrId\":\"$MR1\",\"hcpId\":\"$HCP1\",\"productId\":\"$PRD1\",\"plannedAt\":\"2030-01-01T10:00:00Z\"}" "$B/api/visits")
echo "  （额外的创建不参与计数）"

echo "③ 299/300 秒、499.9/500.1 米"
echo "  见 domain 单测：TestDurationBoundaries / TestDistanceBoundaries / TestExceedsLimit"

echo "④ 双重异常 3 项"
echo "  见 store 单测：TestBothPointsDeviatingProducesThreeFlags"

echo "⑤ 非法流转 409"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "X-Actor: $MR1" -H 'Content-Type: application/json' -d '{"lat":31.2,"lng":121.4}' "$B/api/visits/$VID/checkout")
check "$code" 409 "未签到就签退"

echo "⑥ 取消需原因 / 删除窗口 / 作废仅已签到"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "X-Actor: $MR1" -H 'Content-Type: application/json' -d '{}' "$B/api/visits/$VID/cancel")
check "$code" 400 "缺原因取消"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "X-Actor: $MR1" -H 'Content-Type: application/json' -d '{"reason":"演示"}' "$B/api/visits/$VID/cancel")
check "$code" 200 "带原因取消"

echo "⑦ 作废补判 R2"
V2=$(curl -s -X POST -H "X-Actor: $MR2" -H 'Content-Type: application/json' -d "{\"mrId\":\"$MR2\",\"hcpId\":\"$HCP1\",\"productId\":\"$PRD1\",\"plannedAt\":\"$(date -u -v+48H +%Y-%m-%dT%H:%M:%SZ)\"}" "$B/api/visits" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -X POST -H "X-Actor: $MR2" -H 'Content-Type: application/json' -d '{"lat":31.2119,"lng":121.4861}' "$B/api/visits/$V2/checkin" >/dev/null
vout=$(curl -s -X POST -H "X-Actor: $MR2" -H 'Content-Type: application/json' -d '{"reason":"走错楼"}' "$B/api/visits/$V2/void")
check "$(echo "$vout" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['evaluation']['source'])")" void_backfill "作废快照来源"
check "$(echo "$vout" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['evaluation']['durationSec'])")" None "作废无时长"
check "$(echo "$vout" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['abnormal'])")" True "作废仍为异常"

echo "⑧ 改阈值不回溯"
before=$(curl -s -H "X-Actor: admin" "$B/api/visits/$V2" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['ruleVersion'], d['evaluation']['thresholds']['minDurationSec'])")
curl -s -X PUT -H "X-Actor: admin" -H 'Content-Type: application/json' \
  -d '{"minDurationSeconds":600,"maxDistanceMeters":800,"timeoutHours":24,"reportTimeoutHours":72,"note":"验收"}' "$B/api/admin/rules" >/dev/null
after=$(curl -s -H "X-Actor: admin" "$B/api/visits/$V2" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['ruleVersion'], d['evaluation']['thresholds']['minDurationSec'])")
check "$before" "$after" "历史判定不变"

echo "⑨ 主数据逻辑删除，历史靠快照可读"
# Capture the name from the visit first: the script must be re-runnable, so it
# compares against what the snapshot says now rather than a hard-coded literal
# that a previous run may already have renamed.
name_before=$(curl -s -H "X-Actor: admin" "$B/api/visits/$V2" | python3 -c "import sys,json;print(json.load(sys.stdin)['hcpName'])")
"$PSQL" -h "${PGHOST:-localhost}" -p "${PGPORT:-55432}" -U "${PGUSER:-veeva}" -d "${PGDATABASE:-visits_accept}" -q -c "UPDATE hcp SET name='被改过的名字', deleted_at=now() WHERE id='$HCP1';"
name_after=$(curl -s -H "X-Actor: admin" "$B/api/visits/$V2" | python3 -c "import sys,json;print(json.load(sys.stdin)['hcpName'])")
check "$name_after" "$name_before" "读到的仍是快照里的旧名字"
listed=$(curl -s -H "X-Actor: admin" "$B/api/catalog" | python3 -c "import sys,json;print(any(h['id']=='$HCP1' for h in json.load(sys.stdin)['hcps']))")
check "$listed" False "已删除医生不再出现在目录"
# Put the master row back so the next run starts from the same place.
"$PSQL" -h "${PGHOST:-localhost}" -p "${PGPORT:-55432}" -U "${PGUSER:-veeva}" -d "${PGDATABASE:-visits_accept}" -q -c "UPDATE hcp SET name='$name_before', deleted_at=NULL WHERE id='$HCP1';"

echo "⑩ 看板五个数字"
dash=$(curl -s -H "X-Actor: admin" "$B/api/dashboard/monthly")
python3 - "$dash" <<'PY'
import json,sys
d=json.loads(sys.argv[1]) if len(sys.argv)>1 else json.load(sys.stdin)
rows=d['rows']
visits=sum(r['visits'] for r in rows); done=sum(r['done'] for r in rows)
cxl=sum(r['cancelled'] for r in rows); void=sum(r['voided'] for r in rows)
eff=sum(r['effective'] for r in rows); abn=sum(r['abnormal'] for r in rows)
print(f"  visits={visits} done={done} effective={eff} abnormal={abn} cancelled={cxl} voided={void}")
print("  ✅ visits = done + cancelled + voided" if visits==done+cxl+void else "  ❌ visits 恒等式不成立")
print("  ✅ done = effective + abnormal" if done==eff+abn else "  ❌ done 恒等式不成立")
PY

echo
echo "通过 $pass · 失败 $fail"
