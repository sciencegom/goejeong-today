// 전자담배 감지기 케이스 (3D 프린팅용, OpenSCAD)
// OpenSCAD(무료, openscad.org)에서 열고 F6 → File > Export > STL
// PART 값을 "body" / "lid" 로 바꿔 각각 STL로 내보내세요. "both"는 미리보기용.
//
// 구조: 칸막이로 나눈 2칸 상자
//   왼쪽 [전자부 칸]  ESP32 + 전원선   → 막혀 있음 (ESP32 열이 센서에 영향 주지 않게)
//   오른쪽 [센서 칸]  PMS5003 + ENS160 → 옆면/바닥 통풍구로 외부 공기 유입
// 천장·벽에 달 때는 통풍구가 아래/옆을 향하게 (물·먼지가 위에서 들어오지 않도록)

PART = "both";       // "body" | "lid" | "both"

L = 120;  W = 80;  H = 40;   // 바깥 크기 (mm)
T = 2;                       // 벽 두께
SPLIT = 62;                  // 칸막이 위치 (왼쪽 끝 기준)
SLOT_W = 2.5; SLOT_GAP = 3;  // 통풍구 슬롯 폭/간격
CABLE_D = 7;                 // USB 케이블 구멍 지름
SCREW_D = 4.5;               // 벽 고정용 나사 구멍
POST_D = 6; POST_HOLE = 2.5; // 뚜껑 고정 기둥 (M3 셀프태핑 나사)

$fn = 40;

module rounded_box(l, w, h, r = 4) {
  hull() for (x = [r, l - r], y = [r, w - r]) translate([x, y, 0]) cylinder(r = r, h = h);
}

// 세로 슬롯 여러 개 (통풍구)
module slots(len, count, h) {
  for (i = [0 : count - 1]) translate([i * (SLOT_W + SLOT_GAP), 0, 0]) cube([SLOT_W, len, h]);
}

module body() {
  difference() {
    union() {
      difference() {
        rounded_box(L, W, H);
        translate([T, T, T]) rounded_box(L - 2 * T, W - 2 * T, H, 2);
      }
      // 칸막이 (가운데 아래쪽에 배선 통로)
      difference() {
        translate([SPLIT, T, 0]) cube([T, W - 2 * T, H - 1]);
        translate([SPLIT - 1, W / 2 - 8, T]) cube([T + 2, 16, 10]);
      }
      // 뚜껑 나사 기둥 4개
      for (p = [[T + 4, T + 4], [L - T - 4, T + 4], [T + 4, W - T - 4], [L - T - 4, W - T - 4]])
        translate([p[0], p[1], 0]) difference() {
          cylinder(d = POST_D, h = H - 1);
          cylinder(d = POST_HOLE, h = H);
        }
      // 벽/천장 고정 날개
      for (x = [-10, L]) translate([x, W / 2 - 10, 0])
        difference() {
          cube([10, 20, 3]);
          translate([5, 10, -1]) cylinder(d = SCREW_D, h = 5);
        }
    }
    // 센서 칸 통풍구: 앞/뒤 벽
    for (y = [-1, W - T - 1])
      translate([SPLIT + 8, y, 8]) slots(T + 2, 7, H - 16);
    // 센서 칸 통풍구: 오른쪽 끝 벽
    for (i = [0 : 7])
      translate([L - T - 1, 14 + i * (SLOT_W + SLOT_GAP), 8]) cube([T + 2, SLOT_W, H - 16]);
    // 센서 칸 통풍구: 바닥
    translate([SPLIT + 10, 15, -1]) slots(W - 30, 8, T + 2);
    // 전자부 칸: USB 케이블 구멍 (왼쪽 벽)
    translate([-1, W / 2, 12]) rotate([0, 90, 0]) cylinder(d = CABLE_D, h = T + 2);
    // ESP32 상태 LED 확인 창 (작은 구멍)
    translate([30, W / 2, -1]) cylinder(d = 3, h = T + 2);
  }
}

module lid() {
  difference() {
    rounded_box(L, W, T);
    for (p = [[T + 4, T + 4], [L - T - 4, T + 4], [T + 4, W - T - 4], [L - T - 4, W - T - 4]])
      translate([p[0], p[1], -1]) cylinder(d = 3.4, h = T + 6);
  }
}

if (PART == "body") body();
else if (PART == "lid") lid();
else { body(); translate([0, W + 15, 0]) lid(); }
