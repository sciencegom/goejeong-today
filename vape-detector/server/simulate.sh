#!/usr/bin/env bash
# 센서 없이 웹 화면을 시험해 보는 스크립트
# 사용법: ./simulate.sh [alert|clear|heartbeat] [기기ID] [위치]
SERVER=${SERVER:-http://localhost:3000}
EVENT=${1:-alert}
ID=${2:-test-1}
LOC=${3:-본관 2층 남자화장실}
if [ "$EVENT" = alert ]; then TVOC=1450; PM=48; else TVOC=120; PM=6; fi
curl -s -X POST "$SERVER/api/report" \
  -H "Content-Type: application/json" -H "X-API-Key: ${API_KEY:-change-me}" \
  -d "{\"device_id\":\"$ID\",\"location\":\"$LOC\",\"event\":\"$EVENT\",\"tvoc\":$TVOC,\"pm25\":$PM,\"temp\":23.5,\"humid\":55}"
echo
