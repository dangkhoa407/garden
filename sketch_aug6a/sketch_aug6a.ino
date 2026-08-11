// ================== DEFINE ==================

// ==== Động cơ bước 1 (X) ====
#define STEP1_PIN 8
#define DIR1_PIN  9
#define EN1_PIN   10

// ==== Động cơ bước 2 (Y) ====
#define STEP2_PIN 6
#define DIR2_PIN  7
#define EN2_PIN   5

// ==== Công tắc hành trình ====
#define LIMIT_X_PIN 11   // NO
#define LIMIT_Y_PIN 12   // NO

// ==== Nút & Relay ====
#define BUTTON_PIN 4
#define RELAY_LED   2
#define RELAY_PUMP  3

// ==== Thông số ====
int stepsPerCm = 80;
int steps7  = 7  * stepsPerCm;
int steps14 = 14 * stepsPerCm;
int steps02 = (int)(0.3 * stepsPerCm);   // 0.3 cm

// ==== Thời gian ====
#define WAIT_SPRAY_MS      5000UL
#define SPRAY_TIME_MS     1500UL
#define REST_AFTER_MS        0UL
#define LOOP_DELAY_MS     90000UL
#define HOMING_TIMEOUT_MS 6000UL
#define SPRAY_INTERVAL_MS 86400000UL   // ✅ CHỐNG PHUN LẶP 24H

bool systemError = false;

// ===== Trạng thái phun =====
bool sprayed[6] = {false, false, false, false, false, false};
unsigned long lastSprayTime[6] = {0,0,0,0,0,0};

// ================== PROTOTYPE ==================
void waitSprayOrSkip(int idx);
void captureFromPC();
void sprayCycle();
void runSprayPoints();
bool homeAll();

// ================== MOTOR ==================
void runMotor(int stepPin, int dirPin, int steps, bool direction) {
  digitalWrite(dirPin, direction ? LOW : HIGH);
  for (int i = 0; i < steps; i++) {
    digitalWrite(stepPin, HIGH);
    delayMicroseconds(2500);
    digitalWrite(stepPin, LOW);
    delayMicroseconds(2500);
  }
}

// ================== PUMP ==================
void pumpON()  { digitalWrite(RELAY_PUMP, HIGH); }
void pumpOFF() { digitalWrite(RELAY_PUMP, LOW); }

// ================== EMERGENCY STOP ==================
void emergencyStop(const char* msg) {
  digitalWrite(EN1_PIN, HIGH);
  digitalWrite(EN2_PIN, HIGH);
  pumpOFF();
  systemError = true;

  Serial.print("ALERT: ");
  Serial.println(msg);
  
  delay(100);   // ✅ cho PC kịp nhận ALERT
  while (1);
}

// ================== HOMING ==================
bool homeAxis(int stepPin, int dirPin, int limitPin, const char* errMsg) {
  unsigned long startTime = millis();
  digitalWrite(dirPin, HIGH);

  while (digitalRead(limitPin) == HIGH) {
    if (millis() - startTime > HOMING_TIMEOUT_MS) {
      emergencyStop(errMsg);
      return false;
    }
    digitalWrite(stepPin, HIGH);
    delayMicroseconds(2500);
    digitalWrite(stepPin, LOW);
    delayMicroseconds(2500);
  }

  delay(100);
  runMotor(stepPin, dirPin, steps02, true);
  return true;
}

bool homeAll() {
  Serial.println("BAT DAU HOMING");
  if (!homeAxis(STEP1_PIN, DIR1_PIN, LIMIT_X_PIN, "HOMING X TIMEOUT")) return false;
  if (!homeAxis(STEP2_PIN, DIR2_PIN, LIMIT_Y_PIN, "HOMING Y TIMEOUT")) return false;
  Serial.println("HOMING OK");
  return true;
}

// ================== CAMERA ==================
void captureFromPC() {
  digitalWrite(RELAY_LED, HIGH);
  delay(200);
  Serial.println("CAPTURE");
  delay(200);
  digitalWrite(RELAY_LED, LOW);
}

// ================== PHUN TOÀN BỘ ==================
void sprayCycle() {
  if (!homeAll()) return;

  pumpON();

  runMotor(STEP1_PIN, DIR1_PIN, steps7, true);
  runMotor(STEP1_PIN, DIR1_PIN, steps7, false);
  runMotor(STEP2_PIN, DIR2_PIN, steps7, true);

  runMotor(STEP1_PIN, DIR1_PIN, steps7, true);
  runMotor(STEP1_PIN, DIR1_PIN, steps7, false);
  runMotor(STEP2_PIN, DIR2_PIN, steps7, true);

  runMotor(STEP1_PIN, DIR1_PIN, steps7, true);
  runMotor(STEP1_PIN, DIR1_PIN, steps7, false);

  pumpOFF();
  runMotor(STEP2_PIN, DIR2_PIN, steps14, false);
}

// ================== PHUN ĐIỂM (CÓ CHỐNG LẶP & KHÔNG DELAY) ==================
void waitSprayOrSkip(int idx) {
  unsigned long start = millis();
  String cmd = "";

  while (millis() - start < WAIT_SPRAY_MS) {
    while (Serial.available()) {
      char c = Serial.read();
      if (c == '\n') {
        cmd.trim();
        cmd.toUpperCase();

        if (cmd == "SPRAY" || cmd.endsWith(":SPRAY")) {
          // ✅ KIỂM TRA CHỐNG PHUN LẶP 24H
          if (!sprayed[idx] || millis() - lastSprayTime[idx] > SPRAY_INTERVAL_MS) {
            pumpON();
            delay(SPRAY_TIME_MS);
            pumpOFF();
            sprayed[idx] = true;
            lastSprayTime[idx] = millis();
            Serial.println("PHUN DIEM OK");
          } else {
            Serial.println("DA PHUN <24H - BO QUA");
          }
          return;
        } 
        else if (cmd == "NO_SPRAY" || cmd.endsWith(":NO_SPRAY") || cmd.indexOf("NO_SPRAY") != -1 || cmd.indexOf("ERROR") != -1) {
          // KHÔNG PHUN -> THOÁT NGAY ĐỂ SANG ĐIỂM TIẾP THEO 0ms DELAY
          Serial.println("NO_SPRAY OK - CHUYEN DIEM NGAY");
          return;
        }
        cmd = "";
      } else {
        cmd += c;
      }
    }
  }
}

// ================== CHU TRÌNH ĐIỂM ==================
void runSprayPoints() {
  if (!homeAll()) return;

  // Điểm 0
  captureFromPC(); 
  waitSprayOrSkip(0); // PHUN NGAY TẠI VỊ TRÍ HIỆN TẠI
  runMotor(STEP1_PIN, DIR1_PIN, steps7, true);

  // Điểm 1
  captureFromPC(); 
  waitSprayOrSkip(1);
  runMotor(STEP1_PIN, DIR1_PIN, steps7, false);

  // Điểm 2
  runMotor(STEP2_PIN, DIR2_PIN, steps7, true);
  captureFromPC(); 
  waitSprayOrSkip(2);

  // Điểm 3
  runMotor(STEP1_PIN, DIR1_PIN, steps7, true);
  captureFromPC(); 
  waitSprayOrSkip(3);
  runMotor(STEP1_PIN, DIR1_PIN, steps7, false);

  // Điểm 4
  runMotor(STEP2_PIN, DIR2_PIN, steps7, true);
  captureFromPC(); 
  waitSprayOrSkip(4);

  // Điểm 5
  runMotor(STEP1_PIN, DIR1_PIN, steps7, true);
  captureFromPC(); 
  waitSprayOrSkip(5);
  runMotor(STEP1_PIN, DIR1_PIN, steps7, false);

  // Kết thúc
  runMotor(STEP2_PIN, DIR2_PIN, steps14, false);
}

// ================== DI CHUYỂN TRỰC TIẾP TỚI 1 ĐIỂM / KHAY ==================
void moveToPoint(int idx) {
  if (!homeAll()) return;
  Serial.print("MOVING_TO_POINT:");
  Serial.println(idx);

  if (idx == 0) {
    // Điểm 0 (Khay 01): (0, 0)
    Serial.println("MOVED:0");
  } else if (idx == 1) {
    // Điểm 1 (Khay 02): X = 7cm
    runMotor(STEP1_PIN, DIR1_PIN, steps7, true);
    Serial.println("MOVED:1");
  } else if (idx == 2) {
    // Điểm 2 (Khay 03): Y = 7cm
    runMotor(STEP2_PIN, DIR2_PIN, steps7, true);
    Serial.println("MOVED:2");
  } else if (idx == 3) {
    // Điểm 3 (Khay 04): X = 7cm, Y = 7cm
    runMotor(STEP1_PIN, DIR1_PIN, steps7, true);
    runMotor(STEP2_PIN, DIR2_PIN, steps7, true);
    Serial.println("MOVED:3");
  } else if (idx == 4) {
    // Điểm 4 (Khay 05): Y = 14cm
    runMotor(STEP2_PIN, DIR2_PIN, steps14, true);
    Serial.println("MOVED:4");
  } else if (idx == 5) {
    // Điểm 5 (Khay 06): X = 7cm, Y = 14cm
    runMotor(STEP1_PIN, DIR1_PIN, steps7, true);
    runMotor(STEP2_PIN, DIR2_PIN, steps14, true);
    Serial.println("MOVED:5");
  }
}

// ================== LẮNG NGHE & XỬ LÝ LỆNH SERIAL (NON-BLOCKING) ==================
void checkSerialCommands() {
  while (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.length() == 0) continue;

    String normalized = cmd;
    normalized.toUpperCase();

    if (normalized == "PING") {
      Serial.println("PONG:NODE_CONNECTED");
    } else if (normalized == "HOME" || normalized == "H") {
      homeAll();
    } else if (normalized == "CHECK_PESTS" || normalized == "RUN") {
      runSprayPoints();
    } else if (normalized == "SPRAY") {
      pumpON();
      delay(SPRAY_TIME_MS);
      pumpOFF();
      Serial.println("PHUN OK");
    } else if (normalized.startsWith("GOTO:") || normalized.startsWith("MOVE:") || normalized.startsWith("POINT:")) {
      int idx = normalized.substring(normalized.indexOf(':') + 1).toInt();
      if (idx >= 0 && idx <= 5) moveToPoint(idx);
    } else if (normalized == "P1" || normalized == "POINT0") { moveToPoint(0); }
    else if (normalized == "P2" || normalized == "POINT1") { moveToPoint(1); }
    else if (normalized == "P3" || normalized == "POINT2") { moveToPoint(2); }
    else if (normalized == "P4" || normalized == "POINT3") { moveToPoint(3); }
    else if (normalized == "P5" || normalized == "POINT4") { moveToPoint(4); }
    else if (normalized == "P6" || normalized == "POINT5") { moveToPoint(5); }
  }
}

// ================== SETUP ==================
void setup() {
  Serial.begin(9600);

  pinMode(STEP1_PIN, OUTPUT);
  pinMode(DIR1_PIN, OUTPUT);
  pinMode(EN1_PIN, OUTPUT);

  pinMode(STEP2_PIN, OUTPUT);
  pinMode(DIR2_PIN, OUTPUT);
  pinMode(EN2_PIN, OUTPUT);

  pinMode(LIMIT_X_PIN, INPUT_PULLUP);
  pinMode(LIMIT_Y_PIN, INPUT_PULLUP);

  digitalWrite(EN1_PIN, LOW);
  digitalWrite(EN2_PIN, LOW);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(RELAY_LED, OUTPUT);
  pinMode(RELAY_PUMP, OUTPUT);

  Serial.println("HE THONG SAN SANG");
}

// ================== LOOP ==================
void loop() {
  if (systemError) return;

  // Lắng nghe và điều khiển robot di chuyển theo lệnh từ Web / Node.js
  checkSerialCommands();

  // Nút bấm vật lý kích hoạt quét toàn bộ khay
  if (digitalRead(BUTTON_PIN) == LOW) {
    delay(100);
    if (digitalRead(BUTTON_PIN) == LOW) {
      runSprayPoints();
    }
  }

  delay(50);
}
