/*
 * ESP32 Firmware V3.0 FINAL - Hệ thống quản lý canh tác bằng AI
 * Tích hợp: Tưới tiêu, Châm phân (L298N), Mái che (L298N), DHT11, Mưa, Ánh sáng
 * Điều khiển qua USB Serial (115200 baud) từ Raspberry Pi 4
 */

#include "DHT.h"

// ===================== ĐỊNH NGHĨA CHÂN =====================

// 1. Cụm Bơm phân (Sử dụng 2 Module L298N)
#define PUMP_A_PIN 18     // IN1 - L298N số 1 (Đạm hữu cơ)
#define PUMP_B_PIN 19     // IN2 - L298N số 1 (Rong biển + Amino)
#define PUMP_C_PIN 21     // IN3 - L298N số 2 (Canxi - Bo)
#define PUMP_D_PIN 22     // IN4 - L298N số 2 (Vi sinh)

// 2. Cụm Bơm nước (Sử dụng Module Relay đôi)
#define RELAY_WATER 23    // Bơm tưới tiêu
#define RELAY_WELL 5      // Bơm cấp nước từ giếng

// 3. Cụm Cảm biến & Phao
#define SOIL1_PIN 34      // Cảm biến độ ẩm đất 1 (Điện dung)
#define SOIL2_PIN 35      // Cảm biến độ ẩm đất 2 (Điện trở)
#define FLOAT_LOW_PIN 32  // Phao đáy (Báo cạn)
#define FLOAT_HIGH_PIN 33 // Phao đỉnh (Báo đầy)

// 4. Cụm Cảm biến Thời tiết
#define DHTPIN 4          // Chân DATA của DHT11
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);
#define RAIN_PIN 36       // Cảm biến Mưa (Analog - Chân VP)
#define LIGHT_PIN 39      // Cảm biến Quang trở (Analog - Chân VN)

// 5. Cụm Động cơ Mái che (Sử dụng Module L298N số 3)
#define MOTOR_RAIN_IN1 26 // Kéo/cuộn bạt che mưa
#define MOTOR_RAIN_IN2 27
#define MOTOR_SUN_IN3 14  // Kéo/cuộn lưới che nắng
#define MOTOR_SUN_IN4 12

// 6. Cụm Công tắc hành trình Mái che (Limit Switch)
#define LIMIT_RAIN_OPEN 25   // Bạt mưa đã thu gọn
#define LIMIT_RAIN_CLOSE 13  // Bạt mưa đã che kín
#define LIMIT_SUN_OPEN 16    // Lưới nắng đã thu gọn
#define LIMIT_SUN_CLOSE 17   // Lưới nắng đã che kín


// ===================== BIẾN TRẠNG THÁI =====================
bool lastFloatLow = false;
bool lastFloatHigh = false;

// Biến quản lý Bơm phân (Non-blocking)
unsigned long pumpStartTime = 0;
unsigned long pumpDuration = 0;
int currentActivePump = -1;
bool isDosing = false;

// Trạng thái Mái che (0: Dừng, 1: Đang kéo che, 2: Đang thu lại)
int rainRoofState = 0; 
int sunRoofState = 0;

// ===================== SETUP =====================
void setup() {
  Serial.begin(115200);
  dht.begin();

  // Khởi tạo Output
  pinMode(PUMP_A_PIN, OUTPUT);
  pinMode(PUMP_B_PIN, OUTPUT);
  pinMode(PUMP_C_PIN, OUTPUT);
  pinMode(PUMP_D_PIN, OUTPUT);
  pinMode(RELAY_WATER, OUTPUT);
  pinMode(RELAY_WELL, OUTPUT);
  
  pinMode(MOTOR_RAIN_IN1, OUTPUT);
  pinMode(MOTOR_RAIN_IN2, OUTPUT);
  pinMode(MOTOR_SUN_IN3, OUTPUT);
  pinMode(MOTOR_SUN_IN4, OUTPUT);

  turnOffAll(); // Tắt toàn bộ khi khởi động

  // Khởi tạo Input (Dùng điện trở kéo lên nội)
  pinMode(FLOAT_LOW_PIN, INPUT_PULLUP);
  pinMode(FLOAT_HIGH_PIN, INPUT_PULLUP);
  pinMode(LIMIT_RAIN_OPEN, INPUT_PULLUP);
  pinMode(LIMIT_RAIN_CLOSE, INPUT_PULLUP);
  pinMode(LIMIT_SUN_OPEN, INPUT_PULLUP);
  pinMode(LIMIT_SUN_CLOSE, INPUT_PULLUP);
  
  lastFloatLow = (digitalRead(FLOAT_LOW_PIN) == LOW);
  lastFloatHigh = (digitalRead(FLOAT_HIGH_PIN) == LOW);
  
  Serial.println("ESP32_READY_V3_FINAL");
}

// ===================== VÒNG LẶP CHÍNH =====================
void loop() {
  // 1. Nhận lệnh từ Raspberry Pi 4
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    if (command.length() > 0) {
      processCommand(command);
    }
  }

  // 2. Các hàm kiểm tra tự động (Non-blocking)
  checkFloats();
  handleDosing();
  handleRoofs();
}

// ===================== XỬ LÝ LỆNH TỪ PI =====================
void processCommand(String cmd) {
  if (cmd == "STATUS") {
    sendStatus();
  } 
  else if (cmd == "WATER ON") {
    digitalWrite(RELAY_WATER, HIGH);
    Serial.println("DONE,WATER ON");
  } 
  else if (cmd == "WATER OFF") {
    digitalWrite(RELAY_WATER, LOW);
    Serial.println("DONE,WATER OFF");
  } 
  else if (cmd == "WELL ON") {
    digitalWrite(RELAY_WELL, HIGH);
    Serial.println("DONE,WELL ON");
  } 
  else if (cmd == "WELL OFF") {
    digitalWrite(RELAY_WELL, LOW);
    Serial.println("DONE,WELL OFF");
  }
  else if (cmd.startsWith("DOSE ")) {
    char pump = cmd.charAt(5);
    int durationSec = cmd.substring(7).toInt();
    startDosing(pump, durationSec);
  }
  else if (cmd == "RAIN CLOSE") {
    digitalWrite(MOTOR_RAIN_IN1, HIGH);
    digitalWrite(MOTOR_RAIN_IN2, LOW);
    rainRoofState = 1;
    Serial.println("ACTION,RAIN_CLOSING");
  }
  else if (cmd == "RAIN OPEN") {
    digitalWrite(MOTOR_RAIN_IN1, LOW);
    digitalWrite(MOTOR_RAIN_IN2, HIGH);
    rainRoofState = 2;
    Serial.println("ACTION,RAIN_OPENING");
  }
  else if (cmd == "SUN CLOSE") {
    digitalWrite(MOTOR_SUN_IN3, HIGH);
    digitalWrite(MOTOR_SUN_IN4, LOW);
    sunRoofState = 1;
    Serial.println("ACTION,SUN_CLOSING");
  }
  else if (cmd == "SUN OPEN") {
    digitalWrite(MOTOR_SUN_IN3, LOW);
    digitalWrite(MOTOR_SUN_IN4, HIGH);
    sunRoofState = 2;
    Serial.println("ACTION,SUN_OPENING");
  }
  else if (cmd == "STOP ROOF") {
    stopRainMotor();
    stopSunMotor();
    Serial.println("DONE,ROOF_STOPPED");
  }
  else {
    Serial.println("ERROR,UNKNOWN_COMMAND");
  }
}

// ===================== GỬI DỮ LIỆU TỔNG HỢP VỀ PI =====================
void sendStatus() {
  // Đọc cảm biến Analog
  int soil1 = analogRead(SOIL1_PIN);
  int soil2 = analogRead(SOIL2_PIN);
  int rainValue = analogRead(RAIN_PIN);
  int lightValue = analogRead(LIGHT_PIN);

  // Đọc phao và trạng thái
  int lowState = (digitalRead(FLOAT_LOW_PIN) == LOW) ? 1 : 0;
  int highState = (digitalRead(FLOAT_HIGH_PIN) == LOW) ? 1 : 0;
  int runState = (digitalRead(RELAY_WATER) == HIGH || digitalRead(RELAY_WELL) == HIGH || isDosing) ? 1 : 0;

  // Đọc DHT11
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (isnan(h) || isnan(t)) {
    h = 0.0; 
    t = 0.0; 
  }

  // Gửi toàn bộ 9 thông số
  Serial.print("STATUS,");
  Serial.print("SOIL1="); Serial.print(soil1); Serial.print(",");
  Serial.print("SOIL2="); Serial.print(soil2); Serial.print(",");
  Serial.print("LOW="); Serial.print(lowState); Serial.print(",");
  Serial.print("HIGH="); Serial.print(highState); Serial.print(",");
  Serial.print("RUN="); Serial.print(runState); Serial.print(",");
  Serial.print("TEMP="); Serial.print(t, 1); Serial.print(",");
  Serial.print("HUM="); Serial.print(h, 1); Serial.print(",");
  Serial.print("RAIN="); Serial.print(rainValue); Serial.print(",");
  Serial.print("LIGHT="); Serial.println(lightValue);
}

// ===================== QUẢN LÝ MÁI CHE =====================
void handleRoofs() {
  // 1. Kiểm tra mái che mưa
  if (rainRoofState == 1) { // Đang kéo bạt che
    if (digitalRead(LIMIT_RAIN_CLOSE) == LOW) {
      stopRainMotor();
      Serial.println("DONE,RAIN_CLOSED");
    }
  } 
  else if (rainRoofState == 2) { // Đang thu bạt lại
    if (digitalRead(LIMIT_RAIN_OPEN) == LOW) {
      stopRainMotor();
      Serial.println("DONE,RAIN_OPENED");
    }
  }

  // 2. Kiểm tra mái che nắng
  if (sunRoofState == 1) { // Đang kéo lưới che
    if (digitalRead(LIMIT_SUN_CLOSE) == LOW) {
      stopSunMotor();
      Serial.println("DONE,SUN_CLOSED");
    }
  } 
  else if (sunRoofState == 2) { // Đang thu lưới lại
    if (digitalRead(LIMIT_SUN_OPEN) == LOW) {
      stopSunMotor();
      Serial.println("DONE,SUN_OPENED");
    }
  }
}

void stopRainMotor() {
  digitalWrite(MOTOR_RAIN_IN1, LOW);
  digitalWrite(MOTOR_RAIN_IN2, LOW);
  rainRoofState = 0;
}

void stopSunMotor() {
  digitalWrite(MOTOR_SUN_IN3, LOW);
  digitalWrite(MOTOR_SUN_IN4, LOW);
  sunRoofState = 0;
}

// ===================== QUẢN LÝ PHAO NƯỚC =====================
void checkFloats() {
  bool currentLow = (digitalRead(FLOAT_LOW_PIN) == LOW); 
  bool currentHigh = (digitalRead(FLOAT_HIGH_PIN) == LOW); 
  
  if (currentLow && !lastFloatLow) {
    Serial.println("EVENT,TANK_EMPTY");
  }
  
  if (currentHigh && !lastFloatHigh) {
    digitalWrite(RELAY_WELL, LOW); // Tự động ngắt bơm bảo vệ
    Serial.println("EVENT,TANK_FULL");
  }
  
  lastFloatLow = currentLow;
  lastFloatHigh = currentHigh;
}

// ===================== QUẢN LÝ BƠM PHÂN =====================
void startDosing(char pump, int durationSec) {
  int pin = -1;
  if (pump == 'A') pin = PUMP_A_PIN;
  else if (pump == 'B') pin = PUMP_B_PIN;
  else if (pump == 'C') pin = PUMP_C_PIN;
  else if (pump == 'D') pin = PUMP_D_PIN;

  if (pin != -1 && durationSec > 0) {
    currentActivePump = pin;
    pumpDuration = durationSec * 1000UL; 
    pumpStartTime = millis();
    isDosing = true;
    digitalWrite(currentActivePump, HIGH);
  } else {
    Serial.println("ERROR,INVALID_DOSE_PARAMS");
  }
}

void handleDosing() {
  if (isDosing) {
    if (millis() - pumpStartTime >= pumpDuration) {
      digitalWrite(currentActivePump, LOW);
      isDosing = false;
      
      if (currentActivePump == PUMP_A_PIN) Serial.println("DONE,PUMP_A");
      else if (currentActivePump == PUMP_B_PIN) Serial.println("DONE,PUMP_B");
      else if (currentActivePump == PUMP_C_PIN) Serial.println("DONE,PUMP_C");
      else if (currentActivePump == PUMP_D_PIN) Serial.println("DONE,PUMP_D");
      
      currentActivePump = -1;
    }
  }
}

// ===================== DỪNG KHẨN CẤP =====================
void turnOffAll() {
  digitalWrite(PUMP_A_PIN, LOW);
  digitalWrite(PUMP_B_PIN, LOW);
  digitalWrite(PUMP_C_PIN, LOW);
  digitalWrite(PUMP_D_PIN, LOW);
  digitalWrite(RELAY_WATER, LOW);
  digitalWrite(RELAY_WELL, LOW);
  stopRainMotor();
  stopSunMotor();
}