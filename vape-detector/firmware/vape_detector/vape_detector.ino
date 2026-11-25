/*
 * 화장실 전자담배 감지기 (ESP32 + ENS160/AHT21 + PMS5003)
 *
 * 필요한 라이브러리 (아두이노 IDE > 라이브러리 매니저에서 검색해 설치)
 *   - "SparkFun Indoor Air Quality Sensor - ENS160"  (SparkFun_ENS160.h)
 *   - "Adafruit AHTX0"                              (Adafruit_AHTX0.h)
 *   - "PMS Library" by Mariusz Kacki                (PMS.h)
 *   - "ArduinoJson" by Benoit Blanchon (v7)
 * 보드: "ESP32 Dev Module" (보드 매니저에서 esp32 by Espressif 설치)
 *
 * 배선
 *   ENS160+AHT21 모듈: VIN→3V3, GND→GND, SDA→GPIO21, SCL→GPIO22
 *   PMS5003         : VCC(1번)→VIN(5V), GND(2번)→GND, TX(5번)→GPIO16
 *
 * 동작
 *   1) 1초마다 TVOC / 미세먼지(PM2.5)를 측정
 *   2) 평상시 값(기준선)을 천천히 학습
 *   3) TVOC가 기준선보다 크게 오르고 PM2.5도 함께 오르는 상태가 몇 초 이어지면 '감지'
 *   4) 서버로 HTTP POST 전송 → 웹 화면이 붉게 점멸 + 경보음
 *   5) 평소에도 10초마다 현재 수치를 보내서 '정상 작동 중'인지 웹에서 확인 가능
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include "SparkFun_ENS160.h"
#include <Adafruit_AHTX0.h>
#include <PMS.h>

// ===================== 설치마다 바꿀 설정 =====================
// 학교 WiFi 이름과 비밀번호 (ESP32는 2.4GHz WiFi에만 연결됩니다)
const char* WIFI_SSID     = "학교WiFi이름";
const char* WIFI_PASSWORD = "WiFi비밀번호";
const char* SERVER_URL    = "http://192.168.0.10:3000/api/report";  // 서버 PC의 IP
const char* API_KEY       = "change-me";          // 서버의 API_KEY와 같게
const char* DEVICE_ID     = "toilet-main-2f-m";   // 기기마다 다르게
const char* LOCATION      = "본관 2층 남자화장실";

const bool  USE_PMS       = true;   // PMS5003을 안 달았으면 false

// ===================== 감지 기준 (현장에서 조정) =====================
const float TVOC_RATIO     = 2.5;    // 기준선의 몇 배 이상이면 '상승'
const int   TVOC_MIN_DELTA = 300;    // 기준선보다 최소 몇 ppb 이상 올라야 '상승'
const int   PM_MIN_DELTA   = 15;     // PM2.5가 기준선보다 몇 ug/m3 이상 오르면 '상승'
const int   CONFIRM_COUNT  = 3;      // 연속 몇 번(초) 상승해야 감지로 확정
const unsigned long COOLDOWN_MS   = 60UL * 1000;   // 감지 후 재알림 금지 시간
const unsigned long WARMUP_MS     = 3UL * 60 * 1000; // 전원 켠 뒤 예열 시간
const unsigned long HEARTBEAT_MS  = 10UL * 1000;   // 평상시 상태 보고 간격
const float BASELINE_ALPHA = 0.01;   // 기준선 학습 속도 (작을수록 천천히)

const int LED_PIN = 2;               // 보드 내장 LED (WiFi 상태 표시)

// =============================================================
SparkFun_ENS160 ens;
Adafruit_AHTX0  aht;
PMS             pms(Serial2);
PMS::DATA       pmsData;

float tvocBase = -1, pmBase = -1;
int   tvoc = 0, eco2 = 0, aqi = 0, pm25 = 0;
float tempC = NAN, humid = NAN;
int   riseCount = 0;
bool  alarmActive = false;
unsigned long bootMs, lastAlertMs = 0, lastHeartbeatMs = 0, lastReadMs = 0;

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("WiFi 연결 중: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
    digitalWrite(LED_PIN, i % 2);
    delay(250);
  }
  bool ok = WiFi.status() == WL_CONNECTED;
  digitalWrite(LED_PIN, ok ? HIGH : LOW);
  if (ok) Serial.printf("WiFi 연결됨. IP=%s\n", WiFi.localIP().toString().c_str());
  else    Serial.println("WiFi 연결 실패. 다음 루프에서 다시 시도");
}

bool sendReport(const char* event) {
  connectWiFi();
  if (WiFi.status() != WL_CONNECTED) return false;

  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["location"]  = LOCATION;
  doc["event"]     = event;            // "alert" | "clear" | "heartbeat"
  doc["tvoc"]      = tvoc;
  doc["eco2"]      = eco2;
  doc["aqi"]       = aqi;
  doc["pm25"]      = USE_PMS ? pm25 : -1;
  doc["tvoc_base"] = (int)tvocBase;
  doc["pm_base"]   = (int)pmBase;
  if (!isnan(tempC)) doc["temp"] = tempC;
  if (!isnan(humid)) doc["humid"] = humid;
  doc["warming_up"] = millis() - bootMs < WARMUP_MS;
  doc["rssi"]      = WiFi.RSSI();

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(3000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);
  int code = http.POST(body);
  http.end();
  Serial.printf("[%s] 전송 → HTTP %d\n", event, code);
  return code >= 200 && code < 300;
}

void readSensors() {
  // 온습도 → ENS160 보정값으로 전달
  sensors_event_t h, t;
  if (aht.getEvent(&h, &t)) {
    tempC = t.temperature;
    humid = h.relative_humidity;
    ens.setTempCompensationCelsius(tempC);
    ens.setRHCompensationFloat(humid);
  }
  if (ens.checkDataStatus()) {
    tvoc = ens.getTVOC();
    eco2 = ens.getECO2();
    aqi  = ens.getAQI();
  }
}

void updateDetection() {
  bool warming = millis() - bootMs < WARMUP_MS;

  // 처음 값으로 기준선 초기화
  if (tvocBase < 0) { tvocBase = tvoc; pmBase = pm25; }

  bool tvocRise = tvoc > tvocBase * TVOC_RATIO && tvoc - tvocBase > TVOC_MIN_DELTA;
  bool pmRise   = !USE_PMS || (pm25 - pmBase > PM_MIN_DELTA);
  bool rising   = tvocRise && pmRise;

  // 상승 중이 아닐 때만 기준선을 학습 (연기에 기준선이 끌려 올라가지 않도록)
  if (!rising && !alarmActive) {
    float a = warming ? 0.2 : BASELINE_ALPHA;   // 예열 중엔 빠르게 맞춤
    tvocBase += a * (tvoc - tvocBase);
    pmBase   += a * (pm25 - pmBase);
  }

  Serial.printf("TVOC=%d(기준 %.0f) PM2.5=%d(기준 %.0f) %s%s\n",
                tvoc, tvocBase, pm25, pmBase,
                rising ? "▲상승 " : "", warming ? "[예열중]" : "");

  if (warming) return;

  riseCount = rising ? riseCount + 1 : 0;

  if (!alarmActive && riseCount >= CONFIRM_COUNT &&
      (lastAlertMs == 0 || millis() - lastAlertMs > COOLDOWN_MS)) {
    alarmActive = true;
    lastAlertMs = millis();
    Serial.println("!!! 전자담배 의심 감지 !!!");
    // 실패하면 다음 루프에서 heartbeat로 alarm 상태가 다시 전달됨
    sendReport("alert");
    lastHeartbeatMs = millis();
  }

  // 수치가 기준선 근처로 내려오고 쿨다운이 지나면 해제
  if (alarmActive && !rising && tvoc < tvocBase * 1.5 &&
      millis() - lastAlertMs > COOLDOWN_MS) {
    alarmActive = false;
    sendReport("clear");
    lastHeartbeatMs = millis();
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  bootMs = millis();

  Wire.begin(21, 22);
  if (!aht.begin()) Serial.println("AHT21을 찾을 수 없음 (온습도 보정 없이 진행)");

  // 모듈에 따라 주소가 0x53 또는 0x52
  if (!ens.begin(0x53) && !ens.begin(0x52)) {
    Serial.println("ENS160을 찾을 수 없음! 배선을 확인하세요.");
    while (true) { digitalWrite(LED_PIN, !digitalRead(LED_PIN)); delay(100); }
  }
  ens.setOperatingMode(SFE_ENS160_RESET);
  delay(100);
  ens.setOperatingMode(SFE_ENS160_STANDARD);

  if (USE_PMS) {
    Serial2.begin(9600, SERIAL_8N1, 16, 17);  // RX=16, TX=17
    // PMS5003은 기본(액티브) 모드에서 스스로 약 1초마다 값을 보냄
  }

  connectWiFi();
  Serial.println("예열을 시작합니다 (약 3분). 이 동안은 감지하지 않습니다.");
}

void loop() {
  // PMS5003 데이터는 들어오는 대로 계속 받아 최신 값만 저장
  if (USE_PMS && pms.read(pmsData)) pm25 = pmsData.PM_AE_UG_2_5;

  if (millis() - lastReadMs >= 1000) {
    lastReadMs = millis();
    readSensors();
    updateDetection();
  }

  if (millis() - lastHeartbeatMs >= HEARTBEAT_MS) {
    lastHeartbeatMs = millis();
    sendReport(alarmActive ? "alert" : "heartbeat");
  }
}
