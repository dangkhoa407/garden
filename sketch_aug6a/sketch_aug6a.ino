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
#define WAIT_SPRAY_MS      35000UL
#define SPRAY_TIME_MS     1500UL
#define REST_AFTER_MS     15000UL
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
  delay(3000);
  digitalWrite(RELAY_LED, HIGH);
  delay(2000);
  Serial.println("CAPTURE");
  delay(4000);
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

// ================== PHUN ĐIỂM (CÓ CHỐNG LẶP) ==================
void waitSprayOrSkip(int idx) {
  unsigned long start = millis();
  String cmd = "";

  while (millis() - start < WAIT_SPRAY_MS) {
    while (Serial.available()) {
      char c = Serial.read();
      if (c == '\n') {
        cmd.trim();
        if (cmd == "SPRAY") {

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

          delay(REST_AFTER_MS);
          return;
        }
        cmd = "";
      } else cmd += c;
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

  runSprayPoints();

  unsigned long waitStart = millis();
  bool fullSpray = false;

  while (millis() - waitStart < LOOP_DELAY_MS) {
    if (digitalRead(BUTTON_PIN) == LOW) {
      delay(100);
      fullSpray = true;
      break;
    }
  }

  if (fullSpray) sprayCycle();

  delay(LOOP_DELAY_MS);
}
