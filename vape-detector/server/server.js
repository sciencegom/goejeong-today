// 전자담배 감지 모니터링 서버 (Node.js 18 이상, 추가 설치 없음)
// 실행:  node server.js     →  http://<이 PC의 IP>:3000 접속
//
// 센서(ESP32) → POST /api/report  (JSON, 헤더 X-API-Key)
// 웹 화면     ← GET  /events      (Server-Sent Events로 실시간 푸시)

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.API_KEY || "change-me"; // 아두이노 API_KEY와 같게
const OFFLINE_MS = 35 * 1000; // 이 시간 동안 보고가 없으면 '연결 끊김'

const devices = new Map(); // device_id → 최신 상태
const clients = new Set(); // 접속 중인 브라우저
const history = []; // 최근 감지 기록

function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

function snapshot() {
  const now = Date.now();
  return {
    devices: [...devices.values()].map((d) => ({ ...d, online: now - d.last_seen < OFFLINE_MS })),
    history,
  };
}

function handleReport(req, res) {
  if (req.headers["x-api-key"] !== API_KEY) {
    res.writeHead(401).end("bad api key");
    return;
  }
  let body = "";
  req.on("data", (c) => {
    body += c;
    if (body.length > 4096) req.destroy();
  });
  req.on("end", () => {
    let r;
    try {
      r = JSON.parse(body);
    } catch {
      res.writeHead(400).end("bad json");
      return;
    }
    if (!r.device_id || !["alert", "clear", "heartbeat"].includes(r.event)) {
      res.writeHead(400).end("missing fields");
      return;
    }
    const prev = devices.get(r.device_id);
    const alarm = r.event === "alert";
    const d = {
      device_id: String(r.device_id),
      location: String(r.location || r.device_id),
      alarm,
      tvoc: r.tvoc, pm25: r.pm25, eco2: r.eco2, aqi: r.aqi,
      temp: r.temp, humid: r.humid, rssi: r.rssi,
      warming_up: !!r.warming_up,
      last_seen: Date.now(),
      alarm_since: alarm ? (prev?.alarm ? prev.alarm_since : Date.now()) : null,
    };
    devices.set(d.device_id, d);

    if (alarm && !prev?.alarm) {
      history.unshift({ location: d.location, time: d.alarm_since, tvoc: d.tvoc, pm25: d.pm25 });
      history.length = Math.min(history.length, 50);
      console.log(`[감지] ${d.location}  TVOC=${d.tvoc}ppb PM2.5=${d.pm25}`);
    }
    broadcast("state", snapshot());
    res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");

  if (req.method === "POST" && url.pathname === "/api/report") return handleReport(req, res);

  if (url.pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(path.join(__dirname, "public", "index.html")).pipe(res);
    return;
  }
  res.writeHead(404).end("not found");
});

// 연결 끊김 표시를 위해 주기적으로 상태 전송 (+ 프록시 연결 유지)
setInterval(() => broadcast("state", snapshot()), 5000);

server.listen(PORT, () => {
  console.log(`모니터링 서버 실행 중: http://localhost:${PORT}`);
  if (API_KEY === "change-me") console.log("※ API_KEY 기본값 사용 중. 실제 설치 시 바꾸세요.");
});
