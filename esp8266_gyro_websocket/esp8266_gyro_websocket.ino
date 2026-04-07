/*
 * ESP8266 + MPU6050 Gyroscope WebSocket Server
 * ============================================
 * Этот скетч отправляет данные гироскопа (Roll, Pitch, Yaw)
 * через WebSocket на порту 81.
 *
 * Подключение MPU6050 к ESP8266 (Wemos D1 Mini / NodeMCU):
 *   VCC  -> 3.3V
 *   GND  -> GND
 *   SDA  -> D2 (GPIO4)
 *   SCL  -> D1 (GPIO5)
 *
 * Библиотеки (установить через Менеджер Библиотек Arduino IDE):
 *   1. WebSocketsServer  -> поиск: "WebSockets" by Markus Sattler
 *   2. ArduinoJson       -> поиск: "ArduinoJson" by Benoit Blanchon
 *   3. MPU6050            -> поиск: "MPU6050" by Electronic Cats
 *   4. Wire               -> встроена
 *
 * ============================================
 * ВАЖНО: Измените SSID и PASSWORD на ваши данные Wi-Fi!
 * ============================================
 */

#include <ESP8266WiFi.h>
#include <WebSocketsServer.h>
#include <Wire.h>
#include <ArduinoJson.h>

// ========== KALMAN FILTER CLASS ==========
class Kalman {
public:
    Kalman() {
        Q_angle = 0.001f;
        Q_bias = 0.003f;
        R_measure = 0.03f;

        angle = 0.0f;
        bias = 0.0f;

        P[0][0] = 0.0f;
        P[0][1] = 0.0f;
        P[1][0] = 0.0f;
        P[1][1] = 0.0f;
    };

    float getAngle(float newAngle, float newRate, float dt) {
        // Step 1: Predict
        rate = newRate - bias;
        angle += dt * rate;

        P[0][0] += dt * (dt * P[1][1] - P[0][1] - P[1][0] + Q_angle);
        P[0][1] -= dt * P[1][1];
        P[1][0] -= dt * P[1][1];
        P[1][1] += Q_bias * dt;

        // Step 2: Update
        float S = P[0][0] + R_measure;
        float K[2];
        K[0] = P[0][0] / S;
        K[1] = P[1][0] / S;

        float y = newAngle - angle;
        angle += K[0] * y;
        bias += K[1] * y;

        float P00_temp = P[0][0];
        float P01_temp = P[0][1];

        P[0][0] -= K[0] * P00_temp;
        P[0][1] -= K[0] * P01_temp;
        P[1][0] -= K[1] * P00_temp;
        P[1][1] -= K[1] * P01_temp;

        return angle;
    };

    void setAngle(float newAngle) { angle = newAngle; };
    void setParameters(float Q_a, float Q_b, float R_m) {
        Q_angle = Q_a;
        Q_bias = Q_b;
        R_measure = R_m;
    };

private:
    float Q_angle, Q_bias, R_measure;
    float angle, bias, rate;
    float P[2][2];
};

// ========== НАСТРОЙКИ WI-FI ==========
// Вариант 1: Подключение к вашему роутеру (Station Mode)
const char* ssid     = "MEGA 4G_395714";     // <-- Замените на имя вашего Wi-Fi
const char* password = "6N52435T6K";  // <-- Замените на пароль

// Вариант 2: Если хотите режим точки доступа (раскомментируйте):
// #define USE_ACCESS_POINT
// const char* ap_ssid = "ESP8266_Gyro";
// const char* ap_password = "12345678";

// ========== НАСТРОЙКИ ==========
#define MPU6050_ADDR 0x68
#define SEND_INTERVAL_MS 50  // Интервал отправки данных (50мс = ~20 Гц)

WebSocketsServer webSocket = WebSocketsServer(81);

// Переменные для углов
float roll  = 0;
float pitch = 0;
float yaw   = 0;

// Фильтры Калмана
Kalman kalmanRoll;
Kalman kalmanPitch;

// Калибровочные смещения
float gyroXoffset = 0, gyroYoffset = 0, gyroZoffset = 0;
bool sensorOk = false;

// Таймеры
unsigned long lastSendTime = 0;
unsigned long lastGyroTime = 0;

// ========== MPU6050 ИНИЦИАЛИЗАЦИЯ ==========
void initMPU6050() {
  Wire.begin(D2, D1); // SDA=D2, SCL=D1
  Wire.setClock(100000); // 100kHz for better stability with joystick nearby

  // Проверка присутствия датчика
  Wire.beginTransmission(MPU6050_ADDR);
  if (Wire.endTransmission() != 0) {
    Serial.println("Ошибка: MPU6050 не найден по адресу 0x68!");
    sensorOk = false;
    return;
  }

  // Пробуждение MPU6050
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(0x6B); // PWR_MGMT_1
  Wire.write(0x00); // Пробудить
  if (Wire.endTransmission() != 0) {
    sensorOk = false;
    return;
  }

  // Настройка гироскопа: ±250°/s
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(0x1B); // GYRO_CONFIG
  Wire.write(0x00); // FS_SEL=0 -> ±250°/s
  Wire.endTransmission();

  // Настройка акселерометра: ±2g
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(0x1C); // ACCEL_CONFIG
  Wire.write(0x00); // AFS_SEL=0 -> ±2g
  Wire.endTransmission();

  // Настройка фильтра: ~44Hz bandwidth
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(0x1A); // CONFIG
  Wire.write(0x03);
  Wire.endTransmission();

  delay(100);

  // Калибровка гироскопа (не двигайте датчик!)
  Serial.println("Калибровка гироскопа... Не трогайте датчик!");
  float sumX = 0, sumY = 0, sumZ = 0;
  int samples = 500;
  for (int i = 0; i < samples; i++) {
    int16_t gx, gy, gz;
    readGyroRaw(gx, gy, gz);
    sumX += gx;
    sumY += gy;
    sumZ += gz;
    delay(3);
  }
  gyroXoffset = sumX / samples;
  gyroYoffset = sumY / samples;
  gyroZoffset = sumZ / samples;
  
  sensorOk = true;
  Serial.println("MPU6050 успешно инициализирован!");
}

// ========== ЧТЕНИЕ СЫРЫХ ДАННЫХ ==========
void readGyroRaw(int16_t &gx, int16_t &gy, int16_t &gz) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(0x43); // gyro register
  if (Wire.endTransmission(false) != 0) { gx = gy = gz = 0; return; }
  if (Wire.requestFrom((int)MPU6050_ADDR, 6, (int)true) == 6) {
    gx = (Wire.read() << 8) | Wire.read();
    gy = (Wire.read() << 8) | Wire.read();
    gz = (Wire.read() << 8) | Wire.read();
  } else { gx = gy = gz = 0; }
}

void readAccelRaw(int16_t &ax, int16_t &ay, int16_t &az) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(0x3B); // accel register
  if (Wire.endTransmission(false) != 0) { ax = ay = az = 0; return; }
  if (Wire.requestFrom((int)MPU6050_ADDR, 6, (int)true) == 6) {
    ax = (Wire.read() << 8) | Wire.read();
    ay = (Wire.read() << 8) | Wire.read();
    az = (Wire.read() << 8) | Wire.read();
  } else { ax = ay = az = 0; }
}

// ========== РАСЧЁТ УГЛОВ ==========
void updateAngles() {
  unsigned long now = micros();
  float dt = (now - lastGyroTime) / 1000000.0;

  // Если задержка слишком большая (напр. после WiFi/калибровки), сбрасываем таймер
  if (dt > 0.5) {
    lastGyroTime = now;
    return;
  }
  
  // Если задержка слишком маленькая, пропускаем и копим время
  if (dt <= 0.0001) return; 
  
  lastGyroTime = now; // Теперь время обновляется корректно

  int16_t gx, gy, gz;
  readGyroRaw(gx, gy, gz);
  int16_t ax, ay, az;
  readAccelRaw(ax, ay, az);

  // Гироскоп: градусы/сек (чувствительность ±250: 131 LSB/°/s)
  float gyroX = (gx - gyroXoffset) / 131.0;
  float gyroY = (gy - gyroYoffset) / 131.0;
  float gyroZ = (gz - gyroZoffset) / 131.0;

  // Акселерометр: углы
  float accelRoll  = atan2(ay, az) * 180.0 / PI;
  float accelPitch = atan2(-ax, sqrt((float)ay * ay + (float)az * az)) * 180.0 / PI;

  // Фильтр Калмана
  roll  = kalmanRoll.getAngle(accelRoll, gyroX, dt);
  pitch = kalmanPitch.getAngle(accelPitch, gyroY, dt);
  yaw  += gyroZ * dt; // Yaw нельзя корректировать без магнитометра
}

// ========== WEBSOCKET EVENTS ==========
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.printf("[WS] Клиент #%u отключился\n", num);
      break;
    case WStype_CONNECTED:
      {
        IPAddress ip = webSocket.remoteIP(num);
        Serial.printf("[WS] Клиент #%u подключился с %s\n", num, ip.toString().c_str());
      }
      break;
    case WStype_TEXT:
      Serial.printf("[WS] Получено от #%u: %s\n", num, payload);
      // Можно добавить обработку входящих команд
      break;
  }
}

// ========== SETUP ==========
void setup() {
  Serial.begin(115200);
  delay(500); // Give serial some time to init
  Serial.println("\n=== ESP8266 Gyroscope WebSocket Server ===");

  // Настройка фильтров Калмана для максимальной стабильности
  // По умолчанию: Q_angle=0.001, Q_bias=0.003, R_measure=0.03
  // Увеличиваем R_measure (Measurement Noise), чтобы фильтр игнорировал мелкие скачки датчика
  kalmanRoll.setParameters(0.0005, 0.001, 0.5);  // Огромная инерция для Roll (стабилизация)
  kalmanPitch.setParameters(0.0005, 0.001, 0.3); // Высокая инерция для Pitch

  // Инициализация MPU6050
  initMPU6050();
  lastGyroTime = micros();

  // Wi-Fi подключение
  #ifdef USE_ACCESS_POINT
    // Режим точки доступа
    WiFi.mode(WIFI_AP);
    WiFi.softAP(ap_ssid, ap_password);
    Serial.print("AP IP: ");
    Serial.println(WiFi.softAPIP()); // Обычно 192.168.4.1
  #else
    // Подключение к роутеру
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, password);
    Serial.print("Подключение к Wi-Fi");
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
      delay(500);
      Serial.print(".");
      attempts++;
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println();
      Serial.print("Подключено! IP: ");
      Serial.println(WiFi.localIP());
    } else {
      Serial.println("\nНе удалось подключиться к Wi-Fi!");
      // Fallback: создаём свою точку доступа
      WiFi.mode(WIFI_AP);
      WiFi.softAP("ESP8266_Gyro", "12345678");
      Serial.print("Создана точка доступа. IP: ");
      Serial.println(WiFi.softAPIP());
    }
  #endif

  // Запуск WebSocket сервера
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  Serial.println("WebSocket сервер запущен на порту 81");
  Serial.println("Откройте в браузере: http://" + WiFi.localIP().toString() + ":3000");
}

// ========== LOOP ==========
void loop() {
  webSocket.loop();
  updateAngles();

  // Отправка данных с заданным интервалом
  if (millis() - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = millis();

    // Чтение джойстика (тяга/скорость)
    int rawJoy = analogRead(A0);
    // Маппинг: 0 -> 6.0 (600% макс), 512 -> 1.0 (норма), 1023 -> 0.5 (50% мин)
    float throttle = map(rawJoy, 0, 1023, 600, 50) / 100.0;

    // Формируем JSON
    StaticJsonDocument<256> doc; 
    doc["roll"]  = round(roll  * 10.0) / 10.0;
    doc["pitch"] = round(pitch * 10.0) / 10.0;
    doc["yaw"]   = round(yaw   * 10.0) / 10.0;
    doc["throttle"] = round(throttle * 100.0) / 100.0;
    doc["sensor"] = sensorOk;

    String json;
    serializeJson(doc, json);

    // Отправляем всем подключенным клиентам
    webSocket.broadcastTXT(json);
  }
}
