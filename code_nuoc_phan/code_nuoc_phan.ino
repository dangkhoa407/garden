/*
 * ESP32 Firmware V2.0 - Hệ thống quản lý canh tác bằng AI
 * Điều khiển qua USB Serial từ Raspberry Pi 4
 */

// Định nghĩa các chân (Theo chuẩn ESP32 DevKit V1)
#define PUMP_A_PIN 18     // Bơm phân A (Đạm hữu cơ)
#define PUMP_B_PIN 19     // Bơm phân B (Rong biển + Amino)
#define PUMP_C_PIN 21     // Bơm phân C (Canxi - Bo)
#define PUMP_D_PIN 22     // Bơm phân D (Vi sinh)
#define RELAY_WATER 23    // Relay bơm tưới
#define RELAY_WELL 5      // Relay bơm giếng

#define SOIL1_PIN 34      // Cảm biến độ ẩm 1
#define SOIL2_PIN 35      // Cảm biến độ ẩm 2

#define FLOAT_LOW_PIN 32  // Phao mức thấp (Hết dung dịch)
#define FLOAT_HIGH_PIN 33 // Phao mức cao (Đầy dung dịch)

// Biến lưu trạng thái phao để bắt sự kiện thay đổi
bool lastFloatLow = false;
bool lastFloatHigh = false;

// Biến điều khiển bơm phân (Non-blocking)
unsigned long pumpStartTime = 0;
unsigned long pumpDuration = 0;
int currentActivePump = -1;
bool isDosing = false;

void setup() {
  // Khởi tạo Serial tốc độ 115200 baud
  Serial.begin(115200);

  // Cấu hình chân Output
  pinMode(PUMP_A_PIN, OUTPUT);
  pinMode(PUMP_B_PIN, OUTPUT);
  pinMode(PUMP_C_PIN, OUTPUT);
  pinMode(PUMP_D_PIN, OUTPUT);
  pinMode(RELAY_WATER, OUTPUT);
  pinMode(RELAY_WELL, OUTPUT);

  // Đảm bảo tất cả thiết bị đều tắt lúc khởi động
  turnOffAll();

  // Cấu hình chân Input (Phao dùng INPUT_PULLUP nếu thiết kế đóng ngắt mass)
  pinMode(FLOAT_LOW_PIN, INPUT_PULLUP);
  pinMode(FLOAT_HIGH_PIN, INPUT_PULLUP);
  
  // Khởi tạo trạng thái phao ban đầu
  lastFloatLow = (digitalRead(FLOAT_LOW_PIN) == LOW);
  lastFloatHigh = (digitalRead(FLOAT_HIGH_PIN) == LOW);
  
  Serial.println("ESP32_READY");
}

void loop() {
  // 1. Lắng nghe và xử lý lệnh từ Raspberry Pi
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim(); // Xóa khoảng trắng và ký tự xuống dòng
    if (command.length() > 0) {
      processCommand(command);
    }
  }

  // 2. Theo dõi và báo cáo trạng thái phao (Sự kiện)
  checkFloats();

  // 3. Xử lý logic bơm phân (Non-blocking timer)
  handleDosing();
}

// Hàm xử lý lệnh từ Pi
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
    // Cú pháp: DOSE A 35 (Bơm A chạy 35 giây)
    char pump = cmd.charAt(5);
    int durationSec = cmd.substring(7).toInt();
    startDosing(pump, durationSec);
  }
  else {
    Serial.println("ERROR,UNKNOWN_COMMAND");
  }
}

// Hàm gửi trạng thái về Pi
void sendStatus() {
  int soil1 = analogRead(SOIL1_PIN);
  int soil2 = analogRead(SOIL2_PIN);
  int lowState = (digitalRead(FLOAT_LOW_PIN) == LOW) ? 1 : 0;
  int highState = (digitalRead(FLOAT_HIGH_PIN) == LOW) ? 1 : 0;
  int runState = (digitalRead(RELAY_WATER) == HIGH || digitalRead(RELAY_WELL) == HIGH || isDosing) ? 1 : 0;

  Serial.print("STATUS,");
  Serial.print("SOIL1="); Serial.print(soil1); Serial.print(",");
  Serial.print("SOIL2="); Serial.print(soil2); Serial.print(",");
  Serial.print("LOW="); Serial.print(lowState); Serial.print(",");
  Serial.print("HIGH="); Serial.print(highState); Serial.print(",");
  Serial.print("RUN="); Serial.println(runState);
}

// Hàm kiểm tra phao mức nước
void checkFloats() {
  bool currentLow = (digitalRead(FLOAT_LOW_PIN) == LOW); // Giả sử phao kích LOW
  bool currentHigh = (digitalRead(FLOAT_HIGH_PIN) == LOW); 

  // Phát hiện sự kiện bồn cạn
  if (currentLow && !lastFloatLow) {
    Serial.println("EVENT,TANK_EMPTY");
  }
  
  // Phát hiện sự kiện bồn đầy
  if (currentHigh && !lastFloatHigh) {
    // Tự động ngắt bơm giếng bảo vệ phần cứng
    digitalWrite(RELAY_WELL, LOW);
    Serial.println("EVENT,TANK_FULL");
    Serial.println("DONE,WELL");
  }

  lastFloatLow = currentLow;
  lastFloatHigh = currentHigh;
}

// Hàm bắt đầu bơm phân
void startDosing(char pump, int durationSec) {
  int pin = -1;
  String pumpName = "";
  
  if (pump == 'A') { pin = PUMP_A_PIN; pumpName = "PUMP1"; }
  else if (pump == 'B') { pin = PUMP_B_PIN; pumpName = "PUMP2"; }
  else if (pump == 'C') { pin = PUMP_C_PIN; pumpName = "PUMP3"; }
  else if (pump == 'D') { pin = PUMP_D_PIN; pumpName = "PUMP4"; }

  if (pin != -1 && durationSec > 0) {
    currentActivePump = pin;
    pumpDuration = durationSec * 1000UL; // Chuyển sang mili-giây
    pumpStartTime = millis();
    isDosing = true;
    
    digitalWrite(currentActivePump, HIGH);
  } else {
    Serial.println("ERROR,INVALID_DOSE_PARAMS");
  }
}

// Hàm tự động tắt bơm phân khi hết thời gian (Không dùng delay để tránh treo ESP32)
void handleDosing() {
  if (isDosing) {
    if (millis() - pumpStartTime >= pumpDuration) {
      digitalWrite(currentActivePump, LOW);
      isDosing = false;
      
      // Báo cáo hoàn thành về Pi
      if (currentActivePump == PUMP_A_PIN) Serial.println("DONE,PUMP_A");
      else if (currentActivePump == PUMP_B_PIN) Serial.println("DONE,PUMP_B");
      else if (currentActivePump == PUMP_C_PIN) Serial.println("DONE,PUMP_C");
      else if (currentActivePump == PUMP_D_PIN) Serial.println("DONE,PUMP_D");
      
      currentActivePump = -1;
    }
  }
}

// Hàm tắt tất cả an toàn
void turnOffAll() {
  digitalWrite(PUMP_A_PIN, LOW);
  digitalWrite(PUMP_B_PIN, LOW);
  digitalWrite(PUMP_C_PIN, LOW);
  digitalWrite(PUMP_D_PIN, LOW);
  digitalWrite(RELAY_WATER, LOW);
  digitalWrite(RELAY_WELL, LOW);
}