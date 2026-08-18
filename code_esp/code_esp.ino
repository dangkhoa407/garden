/*
 * ============================================================
 * ESP32 FIRMWARE V3.3
 * HỆ THỐNG QUẢN LÝ CANH TÁC BẰNG AI
 * ============================================================
 *
 * TÍCH HỢP:
 * - 4 bơm phân
 * - Bơm tưới
 * - Bơm giếng
 * - Phao nước
 * - DHT11
 * - Cảm biến mưa
 * - Cảm biến ánh sáng
 * - Rèm mưa
 * - Rèm nắng
 * - 4 công tắc hành trình
 *
 * SERIAL:
 * 115200 baud
 *
 *
 * ============================================================
 * LOGIC RÈM MƯA
 * ============================================================
 *
 * RAIN CLOSE
 * -> Motor chạy chiều đóng
 * -> Chạy cho tới khi RAIN_OPEN_LIMIT = 1
 * -> Giữ 500ms
 * -> Dừng
 * -> DONE,RAIN_CLOSED
 *
 *
 * RAIN OPEN
 * -> Motor chạy chiều mở
 * -> Chạy cho tới khi RAIN_CLOSE_LIMIT = 1
 * -> Giữ 500ms
 * -> Dừng
 * -> DONE,RAIN_OPENED
 *
 *
 * ============================================================
 * LOGIC RÈM NẮNG
 * ============================================================
 *
 * SUN CLOSE
 * -> Motor chạy chiều đóng
 * -> Chạy cho tới khi SUN_OPEN_LIMIT = 1
 * -> Giữ 500ms
 * -> Dừng
 * -> DONE,SUN_CLOSED
 *
 *
 * SUN OPEN
 * -> Motor chạy chiều mở
 * -> Chạy cho tới khi SUN_CLOSE_LIMIT = 1
 * -> Giữ 500ms
 * -> Dừng
 * -> DONE,SUN_OPENED
 *
 *
 * ============================================================
 */

#include "DHT.h"


// ============================================================
// 1. BƠM PHÂN
// ============================================================

#define PUMP_A_PIN 18
#define PUMP_B_PIN 19
#define PUMP_C_PIN 21
#define PUMP_D_PIN 22


// ============================================================
// 2. BƠM NƯỚC
// ============================================================

#define RELAY_WATER 23
#define RELAY_WELL 5


// ============================================================
// 3. CẢM BIẾN ĐẤT + PHAO
// ============================================================

#define SOIL1_PIN 34
#define SOIL2_PIN 35

#define FLOAT_LOW_PIN 32
#define FLOAT_HIGH_PIN 33


// ============================================================
// 4. CẢM BIẾN THỜI TIẾT
// ============================================================

#define DHTPIN 4
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

#define RAIN_PIN 36
#define LIGHT_PIN 39


// ============================================================
// 5. MOTOR RÈM MƯA
// ============================================================

#define MOTOR_RAIN_IN1 26
#define MOTOR_RAIN_IN2 27


// ============================================================
// 6. MOTOR RÈM NẮNG
// ============================================================

#define MOTOR_SUN_IN3 14
#define MOTOR_SUN_IN4 12


// ============================================================
// 7. LIMIT RÈM MƯA
// ============================================================

#define LIMIT_RAIN_OPEN 25
#define LIMIT_RAIN_CLOSE 13


// ============================================================
// 8. LIMIT RÈM NẮNG
// ============================================================

#define LIMIT_SUN_OPEN 16
#define LIMIT_SUN_CLOSE 17


// ============================================================
// 9. THỜI GIAN XÁC NHẬN CÔNG TẮC
// ============================================================
//
// Công tắc phải ở trạng thái LOW liên tục trong 500ms
// mới được xác nhận là đã tác động.
//
// ============================================================

const unsigned long LIMIT_CONFIRM_TIME = 100;


// ============================================================
// BIẾN PHAO
// ============================================================

bool lastFloatLow = false;
bool lastFloatHigh = false;


// ============================================================
// BIẾN BƠM PHÂN
// ============================================================

unsigned long pumpStartTime = 0;
unsigned long pumpDuration = 0;

int currentActivePump = -1;

bool isDosing = false;


// ============================================================
// TRẠNG THÁI RÈM MƯA
//
// 0 = DỪNG
// 1 = ĐANG ĐÓNG
// 2 = ĐANG MỞ
// ============================================================

int rainRoofState = 0;


// ============================================================
// TRẠNG THÁI RÈM NẮNG
//
// 0 = DỪNG
// 1 = ĐANG ĐÓNG
// 2 = ĐANG MỞ
// ============================================================

int sunRoofState = 0;


// ============================================================
// XÁC NHẬN RAIN_OPEN_LIMIT
//
// Dùng khi RAIN CLOSE
// ============================================================

bool rainOpenLimitChecking = false;

unsigned long rainOpenLimitStartTime = 0;


// ============================================================
// XÁC NHẬN RAIN_CLOSE_LIMIT
//
// Dùng khi RAIN OPEN
// ============================================================

bool rainCloseLimitChecking = false;

unsigned long rainCloseLimitStartTime = 0;


// ============================================================
// XÁC NHẬN SUN_OPEN_LIMIT
//
// Dùng khi SUN CLOSE
// ============================================================

bool sunOpenLimitChecking = false;

unsigned long sunOpenLimitStartTime = 0;


// ============================================================
// XÁC NHẬN SUN_CLOSE_LIMIT
//
// Dùng khi SUN OPEN
// ============================================================

bool sunCloseLimitChecking = false;

unsigned long sunCloseLimitStartTime = 0;


// ============================================================
// SETUP
// ============================================================

void setup() {

  // ----------------------------------------------------------
  // SERIAL
  // ----------------------------------------------------------

  Serial.begin(115200);


  // ----------------------------------------------------------
  // DHT
  // ----------------------------------------------------------

  dht.begin();


  // ----------------------------------------------------------
  // OUTPUT BƠM PHÂN
  // ----------------------------------------------------------

  pinMode(PUMP_A_PIN, OUTPUT);
  pinMode(PUMP_B_PIN, OUTPUT);
  pinMode(PUMP_C_PIN, OUTPUT);
  pinMode(PUMP_D_PIN, OUTPUT);


  // ----------------------------------------------------------
  // OUTPUT BƠM NƯỚC
  // ----------------------------------------------------------

  pinMode(RELAY_WATER, OUTPUT);
  pinMode(RELAY_WELL, OUTPUT);


  // ----------------------------------------------------------
  // OUTPUT MOTOR RÈM MƯA
  // ----------------------------------------------------------

  pinMode(MOTOR_RAIN_IN1, OUTPUT);
  pinMode(MOTOR_RAIN_IN2, OUTPUT);


  // ----------------------------------------------------------
  // OUTPUT MOTOR RÈM NẮNG
  // ----------------------------------------------------------

  pinMode(MOTOR_SUN_IN3, OUTPUT);
  pinMode(MOTOR_SUN_IN4, OUTPUT);


  // ----------------------------------------------------------
  // INPUT PHAO
  // ----------------------------------------------------------

  pinMode(FLOAT_LOW_PIN, INPUT_PULLUP);
  pinMode(FLOAT_HIGH_PIN, INPUT_PULLUP);


  // ----------------------------------------------------------
  // INPUT LIMIT RÈM MƯA
  // ----------------------------------------------------------

  pinMode(LIMIT_RAIN_OPEN, INPUT_PULLUP);
  pinMode(LIMIT_RAIN_CLOSE, INPUT_PULLUP);


  // ----------------------------------------------------------
  // INPUT LIMIT RÈM NẮNG
  // ----------------------------------------------------------

  pinMode(LIMIT_SUN_OPEN, INPUT_PULLUP);
  pinMode(LIMIT_SUN_CLOSE, INPUT_PULLUP);


  // ----------------------------------------------------------
  // TẮT TOÀN BỘ
  // ----------------------------------------------------------

  turnOffAll();


  // ----------------------------------------------------------
  // ĐỌC PHAO BAN ĐẦU
  // ----------------------------------------------------------

  lastFloatLow =
      (digitalRead(FLOAT_LOW_PIN) == LOW);

  lastFloatHigh =
      (digitalRead(FLOAT_HIGH_PIN) == LOW);


  // ----------------------------------------------------------
  // READY
  // ----------------------------------------------------------

  Serial.println("ESP32_READY_V3.3");
}


// ============================================================
// LOOP
// ============================================================

void loop() {

  // ----------------------------------------------------------
  // NHẬN SERIAL
  // ----------------------------------------------------------

  if (Serial.available() > 0) {

    String command =
        Serial.readStringUntil('\n');

    command.trim();

    if (command.length() > 0) {

      processCommand(command);
    }
  }


  // ----------------------------------------------------------
  // PHAO
  // ----------------------------------------------------------

  checkFloats();


  // ----------------------------------------------------------
  // BƠM PHÂN
  // ----------------------------------------------------------

  handleDosing();


  // ----------------------------------------------------------
  // RÈM
  // ----------------------------------------------------------

  handleRoofs();
}


// ============================================================
// XỬ LÝ COMMAND
// ============================================================

void processCommand(String cmd) {

  // ==========================================================
  // STATUS
  // ==========================================================

  if (cmd == "STATUS") {

    sendStatus();
  }


  // ==========================================================
  // WATER ON
  // ==========================================================

  else if (cmd == "WATER ON") {

    digitalWrite(
        RELAY_WATER,
        HIGH
    );

    Serial.println(
        "DONE,WATER ON"
    );
  }


  // ==========================================================
  // WATER OFF
  // ==========================================================

  else if (cmd == "WATER OFF") {

    digitalWrite(
        RELAY_WATER,
        LOW
    );

    Serial.println(
        "DONE,WATER OFF"
    );
  }


  // ==========================================================
  // WELL ON
  // ==========================================================

  else if (cmd == "WELL ON") {

    digitalWrite(
        RELAY_WELL,
        HIGH
    );

    Serial.println(
        "DONE,WELL ON"
    );
  }


  // ==========================================================
  // WELL OFF
  // ==========================================================

  else if (cmd == "WELL OFF") {

    digitalWrite(
        RELAY_WELL,
        LOW
    );

    Serial.println(
        "DONE,WELL OFF"
    );
  }


  // ==========================================================
  // DOSE
  // ==========================================================

  else if (cmd.startsWith("DOSE ")) {

    char pump =
        cmd.charAt(5);

    int durationSec =
        cmd.substring(7).toInt();

    startDosing(
        pump,
        durationSec
    );
  }


  // ==========================================================
  // RAIN CLOSE
  //
  // ĐÓNG RÈM MƯA
  // DỪNG TẠI RAIN_OPEN_LIMIT
  // ==========================================================

  else if (cmd == "RAIN CLOSE") {

    stopRainMotor();

    resetRainLimitChecks();


    // Chiều đóng

    digitalWrite(
        MOTOR_RAIN_IN1,
        HIGH
    );

    digitalWrite(
        MOTOR_RAIN_IN2,
        LOW
    );


    rainRoofState = 1;


    Serial.println(
        "ACTION,RAIN_CLOSING"
    );
  }


  // ==========================================================
  // RAIN OPEN
  //
  // MỞ RÈM MƯA
  // DỪNG TẠI RAIN_CLOSE_LIMIT
  // ==========================================================

  else if (cmd == "RAIN OPEN") {

    stopRainMotor();

    resetRainLimitChecks();


    // Chiều mở

    digitalWrite(
        MOTOR_RAIN_IN1,
        LOW
    );

    digitalWrite(
        MOTOR_RAIN_IN2,
        HIGH
    );


    rainRoofState = 2;


    Serial.println(
        "ACTION,RAIN_OPENING"
    );
  }


  // ==========================================================
  // SUN CLOSE
  //
  // ĐÓNG RÈM NẮNG
  // DỪNG TẠI SUN_OPEN_LIMIT
  // ==========================================================

  else if (cmd == "SUN CLOSE") {

    stopSunMotor();

    resetSunLimitChecks();


    // Chiều đóng

    digitalWrite(
        MOTOR_SUN_IN3,
        HIGH
    );

    digitalWrite(
        MOTOR_SUN_IN4,
        LOW
    );


    sunRoofState = 1;


    Serial.println(
        "ACTION,SUN_CLOSING"
    );
  }


  // ==========================================================
  // SUN OPEN
  //
  // MỞ RÈM NẮNG
  // DỪNG TẠI SUN_CLOSE_LIMIT
  // ==========================================================

  else if (cmd == "SUN OPEN") {

    stopSunMotor();

    resetSunLimitChecks();


    // Chiều mở

    digitalWrite(
        MOTOR_SUN_IN3,
        LOW
    );

    digitalWrite(
        MOTOR_SUN_IN4,
        HIGH
    );


    sunRoofState = 2;


    Serial.println(
        "ACTION,SUN_OPENING"
    );
  }


  // ==========================================================
  // STOP ROOF
  // ==========================================================

  else if (cmd == "STOP ROOF") {

    stopRainMotor();

    stopSunMotor();

    resetRainLimitChecks();
    resetSunLimitChecks();


    Serial.println(
        "DONE,ROOF_STOPPED"
    );
  }


  // ==========================================================
  // COMMAND KHÔNG HỢP LỆ
  // ==========================================================

  else {

    Serial.println(
        "ERROR,UNKNOWN_COMMAND"
    );
  }
}


// ============================================================
// XỬ LÝ RÈM
// ============================================================

void handleRoofs() {


  // ==========================================================
  // RÈM MƯA - CLOSE
  //
  // RAIN CLOSE
  // Motor đóng
  // Dừng khi RAIN_OPEN_LIMIT = 1
  // ==========================================================

  if (rainRoofState == 1) {

    int limitState =
        digitalRead(
            LIMIT_RAIN_OPEN
        );


    if (limitState == LOW) {

      if (!rainOpenLimitChecking) {

        rainOpenLimitChecking = true;

        rainOpenLimitStartTime =
            millis();
      }

      else if (
          millis() -
          rainOpenLimitStartTime
          >= LIMIT_CONFIRM_TIME
      ) {

        stopRainMotor();

        rainOpenLimitChecking = false;

        rainOpenLimitStartTime = 0;


        Serial.println(
            "LIMIT,RAIN_OPEN"
        );

        Serial.println(
            "DONE,RAIN_CLOSED"
        );
      }
    }

    else {

      rainOpenLimitChecking = false;

      rainOpenLimitStartTime = 0;
    }
  }


  // ==========================================================
  // RÈM MƯA - OPEN
  //
  // RAIN OPEN
  // Motor mở
  // Dừng khi RAIN_CLOSE_LIMIT = 1
  // ==========================================================

  else if (rainRoofState == 2) {

    int limitState =
        digitalRead(
            LIMIT_RAIN_CLOSE
        );


    if (limitState == LOW) {

      if (!rainCloseLimitChecking) {

        rainCloseLimitChecking = true;

        rainCloseLimitStartTime =
            millis();
      }

      else if (
          millis() -
          rainCloseLimitStartTime
          >= LIMIT_CONFIRM_TIME
      ) {

        stopRainMotor();

        rainCloseLimitChecking = false;

        rainCloseLimitStartTime = 0;


        Serial.println(
            "LIMIT,RAIN_CLOSE"
        );

        Serial.println(
            "DONE,RAIN_OPENED"
        );
      }
    }

    else {

      rainCloseLimitChecking = false;

      rainCloseLimitStartTime = 0;
    }
  }



  // ==========================================================
  // RÈM NẮNG - CLOSE
  //
  // SUN CLOSE
  // Motor đóng
  // Dừng khi SUN_OPEN_LIMIT = 1
  // ==========================================================

  if (sunRoofState == 1) {

    int limitState =
        digitalRead(
            LIMIT_SUN_OPEN
        );


    if (limitState == LOW) {

      if (!sunOpenLimitChecking) {

        sunOpenLimitChecking = true;

        sunOpenLimitStartTime =
            millis();
      }

      else if (
          millis() -
          sunOpenLimitStartTime
          >= LIMIT_CONFIRM_TIME
      ) {

        stopSunMotor();

        sunOpenLimitChecking = false;

        sunOpenLimitStartTime = 0;


        Serial.println(
            "LIMIT,SUN_OPEN"
        );

        Serial.println(
            "DONE,SUN_CLOSED"
        );
      }
    }

    else {

      sunOpenLimitChecking = false;

      sunOpenLimitStartTime = 0;
    }
  }


  // ==========================================================
  // RÈM NẮNG - OPEN
  //
  // SUN OPEN
  // Motor mở
  // Dừng khi SUN_CLOSE_LIMIT = 1
  // ==========================================================

  else if (sunRoofState == 2) {

    int limitState =
        digitalRead(
            LIMIT_SUN_CLOSE
        );


    if (limitState == LOW) {

      if (!sunCloseLimitChecking) {

        sunCloseLimitChecking = true;

        sunCloseLimitStartTime =
            millis();
      }

      else if (
          millis() -
          sunCloseLimitStartTime
          >= LIMIT_CONFIRM_TIME
      ) {

        stopSunMotor();

        sunCloseLimitChecking = false;

        sunCloseLimitStartTime = 0;


        Serial.println(
            "LIMIT,SUN_CLOSE"
        );

        Serial.println(
            "DONE,SUN_OPENED"
        );
      }
    }

    else {

      sunCloseLimitChecking = false;

      sunCloseLimitStartTime = 0;
    }
  }
}


// ============================================================
// RESET LIMIT RÈM MƯA
// ============================================================

void resetRainLimitChecks() {

  rainOpenLimitChecking = false;

  rainOpenLimitStartTime = 0;

  rainCloseLimitChecking = false;

  rainCloseLimitStartTime = 0;
}


// ============================================================
// RESET LIMIT RÈM NẮNG
// ============================================================

void resetSunLimitChecks() {

  sunOpenLimitChecking = false;

  sunOpenLimitStartTime = 0;

  sunCloseLimitChecking = false;

  sunCloseLimitStartTime = 0;
}


// ============================================================
// DỪNG MOTOR RÈM MƯA
// ============================================================

void stopRainMotor() {

  digitalWrite(
      MOTOR_RAIN_IN1,
      LOW
  );

  digitalWrite(
      MOTOR_RAIN_IN2,
      LOW
  );


  rainRoofState = 0;
}


// ============================================================
// DỪNG MOTOR RÈM NẮNG
// ============================================================

void stopSunMotor() {

  digitalWrite(
      MOTOR_SUN_IN3,
      LOW
  );

  digitalWrite(
      MOTOR_SUN_IN4,
      LOW
  );


  sunRoofState = 0;
}


// ============================================================
// STATUS
// ============================================================

void sendStatus() {

  // ----------------------------------------------------------
  // ĐỌC ĐẤT
  // ----------------------------------------------------------

  int soil1 =
      analogRead(SOIL1_PIN);

  int soil2 =
      analogRead(SOIL2_PIN);


  // ----------------------------------------------------------
  // ĐỌC MƯA
  // ----------------------------------------------------------

  int rainValue =
      analogRead(RAIN_PIN);


  // ----------------------------------------------------------
  // ĐỌC ÁNH SÁNG
  // ----------------------------------------------------------

  int lightValue =
      analogRead(LIGHT_PIN);


  // ----------------------------------------------------------
  // PHAO
  // ----------------------------------------------------------

  int lowState =
      (
        digitalRead(FLOAT_LOW_PIN) == LOW
      )
      ? 1
      : 0;


  int highState =
      (
        digitalRead(FLOAT_HIGH_PIN) == LOW
      )
      ? 1
      : 0;


  // ----------------------------------------------------------
  // DHT11
  // ----------------------------------------------------------

  float hum =
      dht.readHumidity();

  float temp =
      dht.readTemperature();


  if (
      isnan(hum) ||
      isnan(temp)
  ) {

    hum = 0.0;

    temp = 0.0;
  }


  // ----------------------------------------------------------
  // MOTOR STATE
  //
  // 0 = STOP
  // 1 = ĐÓNG
  // 2 = MỞ
  // ----------------------------------------------------------

  int rainMotor =
      rainRoofState;

  int sunMotor =
      sunRoofState;


  // ----------------------------------------------------------
  // LIMIT
  //
  // INPUT_PULLUP:
  // LOW = ĐANG NHẤN
  // HIGH = CHƯA NHẤN
  //
  // STATUS:
  // 1 = NHẤN
  // 0 = CHƯA NHẤN
  // ----------------------------------------------------------

  int rainOpenLimit =
      (
        digitalRead(LIMIT_RAIN_OPEN)
        == LOW
      )
      ? 1
      : 0;


  int rainCloseLimit =
      (
        digitalRead(LIMIT_RAIN_CLOSE)
        == LOW
      )
      ? 1
      : 0;


  int sunOpenLimit =
      (
        digitalRead(LIMIT_SUN_OPEN)
        == LOW
      )
      ? 1
      : 0;


  int sunCloseLimit =
      (
        digitalRead(LIMIT_SUN_CLOSE)
        == LOW
      )
      ? 1
      : 0;


  // ----------------------------------------------------------
  // RUN
  // ----------------------------------------------------------

  int runState =
      (
        digitalRead(RELAY_WATER) == HIGH ||
        digitalRead(RELAY_WELL) == HIGH ||
        isDosing ||
        rainRoofState != 0 ||
        sunRoofState != 0
      )
      ? 1
      : 0;


  // ==========================================================
  // SERIAL STATUS
  // ==========================================================

  Serial.print("STATUS,");


  Serial.print("SOIL1=");
  Serial.print(soil1);

  Serial.print(",");


  Serial.print("SOIL2=");
  Serial.print(soil2);

  Serial.print(",");


  Serial.print("LOW=");
  Serial.print(lowState);

  Serial.print(",");


  Serial.print("HIGH=");
  Serial.print(highState);

  Serial.print(",");


  Serial.print("RUN=");
  Serial.print(runState);

  Serial.print(",");


  Serial.print("TEMP=");
  Serial.print(temp, 1);

  Serial.print(",");


  Serial.print("HUM=");
  Serial.print(hum, 1);

  Serial.print(",");


  Serial.print("RAIN=");
  Serial.print(rainValue);

  Serial.print(",");


  Serial.print("LIGHT=");
  Serial.print(lightValue);

  Serial.print(",");


  // ----------------------------------------------------------
  // RÈM MƯA
  // ----------------------------------------------------------

  Serial.print("RAIN_MOTOR=");
  Serial.print(rainMotor);

  Serial.print(",");


  Serial.print("RAIN_OPEN_LIMIT=");
  Serial.print(rainOpenLimit);

  Serial.print(",");


  Serial.print("RAIN_CLOSE_LIMIT=");
  Serial.print(rainCloseLimit);

  Serial.print(",");


  // ----------------------------------------------------------
  // RÈM NẮNG
  // ----------------------------------------------------------

  Serial.print("SUN_MOTOR=");
  Serial.print(sunMotor);

  Serial.print(",");


  Serial.print("SUN_OPEN_LIMIT=");
  Serial.print(sunOpenLimit);

  Serial.print(",");


  Serial.print("SUN_CLOSE_LIMIT=");
  Serial.println(sunCloseLimit);
}


// ============================================================
// KIỂM TRA PHAO
// ============================================================

void checkFloats() {

  bool currentLow =
      (
        digitalRead(FLOAT_LOW_PIN)
        == LOW
      );


  bool currentHigh =
      (
        digitalRead(FLOAT_HIGH_PIN)
        == LOW
      );


  // ----------------------------------------------------------
  // BÌNH CẠN
  // ----------------------------------------------------------

  if (
      currentLow &&
      !lastFloatLow
  ) {

    Serial.println(
        "EVENT,TANK_EMPTY"
    );
  }


  // ----------------------------------------------------------
  // BÌNH ĐẦY
  // ----------------------------------------------------------

  if (
      currentHigh &&
      !lastFloatHigh
  ) {

    digitalWrite(
        RELAY_WELL,
        LOW
    );


    Serial.println(
        "EVENT,TANK_FULL"
    );
  }


  lastFloatLow =
      currentLow;

  lastFloatHigh =
      currentHigh;
}


// ============================================================
// BẮT ĐẦU BƠM PHÂN
// ============================================================

void startDosing(
    char pump,
    int durationSec
) {

  int pin = -1;


  if (pump == 'A') {

    pin = PUMP_A_PIN;
  }

  else if (pump == 'B') {

    pin = PUMP_B_PIN;
  }

  else if (pump == 'C') {

    pin = PUMP_C_PIN;
  }

  else if (pump == 'D') {

    pin = PUMP_D_PIN;
  }


  // ----------------------------------------------------------
  // KIỂM TRA
  // ----------------------------------------------------------

  if (
      pin != -1 &&
      durationSec > 0
  ) {

    currentActivePump =
        pin;

    pumpDuration =
        durationSec * 1000UL;

    pumpStartTime =
        millis();

    isDosing =
        true;


    digitalWrite(
        currentActivePump,
        HIGH
    );
  }

  else {

    Serial.println(
        "ERROR,INVALID_DOSE_PARAMS"
    );
  }
}


// ============================================================
// XỬ LÝ BƠM PHÂN
// ============================================================

void handleDosing() {

  if (!isDosing) {

    return;
  }


  if (
      millis() -
      pumpStartTime
      >= pumpDuration
  ) {

    digitalWrite(
        currentActivePump,
        LOW
    );


    isDosing =
        false;


    if (
        currentActivePump ==
        PUMP_A_PIN
    ) {

      Serial.println(
          "DONE,PUMP_A"
      );
    }

    else if (
        currentActivePump ==
        PUMP_B_PIN
    ) {

      Serial.println(
          "DONE,PUMP_B"
      );
    }

    else if (
        currentActivePump ==
        PUMP_C_PIN
    ) {

      Serial.println(
          "DONE,PUMP_C"
      );
    }

    else if (
        currentActivePump ==
        PUMP_D_PIN
    ) {

      Serial.println(
          "DONE,PUMP_D"
      );
    }


    currentActivePump =
        -1;
  }
}


// ============================================================
// TẮT TOÀN BỘ
// ============================================================

void turnOffAll() {

  // ----------------------------------------------------------
  // BƠM PHÂN
  // ----------------------------------------------------------

  digitalWrite(
      PUMP_A_PIN,
      LOW
  );

  digitalWrite(
      PUMP_B_PIN,
      LOW
  );

  digitalWrite(
      PUMP_C_PIN,
      LOW
  );

  digitalWrite(
      PUMP_D_PIN,
      LOW
  );


  // ----------------------------------------------------------
  // BƠM NƯỚC
  // ----------------------------------------------------------

  digitalWrite(
      RELAY_WATER,
      LOW
  );

  digitalWrite(
      RELAY_WELL,
      LOW
  );


  // ----------------------------------------------------------
  // RÈM
  // ----------------------------------------------------------

  stopRainMotor();

  stopSunMotor();


  // ----------------------------------------------------------
  // RESET LIMIT
  // ----------------------------------------------------------

  resetRainLimitChecks();

  resetSunLimitChecks();
}