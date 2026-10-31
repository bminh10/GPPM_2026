// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <LiquidCrystal_I2C.h>
#include <MFRC522.h>
#include <SPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <time.h>
#include "ReaderConfig.h"

#if __has_include("DeviceLocal.h")
#include "DeviceLocal.h"
#else
#include "../DeviceLocal.h.example"
#endif

MFRC522 reader(RFID_SS, RFID_RST);
unsigned long lastScan = 0;
unsigned long lastWifiAttempt = 0;
bool scanned = false;
WiFiClient plainClient;
WiFiClientSecure secureClient;
HTTPClient http;
LiquidCrystal_I2C lcd(LCD_ADDRESS, LCD_COLUMNS, LCD_ROWS);
bool lcdReady = false;
bool lcdIdlePending = false;
unsigned long lastDisplayAt = 0;
unsigned long lastLcdInitAttempt = 0;

void showDisplay(const String& title, const String& detail = "") {
  if (!lcdReady) return;
  const String lines[] = {title, detail};
  for (uint8_t row = 0; row < LCD_ROWS; ++row) {
    const size_t length = lines[row].length() < LCD_COLUMNS ? lines[row].length() : LCD_COLUMNS;
    const size_t padding = (LCD_COLUMNS - length) / 2;
    lcd.setCursor(0, row);
    for (uint8_t column = 0; column < LCD_COLUMNS; ++column) {
      lcd.write(column >= padding && column < padding + length ? lines[row][column - padding] : ' ');
    }
  }
  lastDisplayAt = millis();
  lcdIdlePending = true;
}

void displayInit() {
  lastLcdInitAttempt = millis();
  if (!Wire.begin(LCD_SDA, LCD_SCL)) {
    Serial.println("ERROR: LCD I2C initialization failed.");
    return;
  }
  Wire.setTimeOut(100);
  // OhStem's Arduino example uses 0x21; some module specifications list 0x27.
  const uint8_t addresses[] = {LCD_ADDRESS, 0x21};
  uint8_t detectedAddress = 0;
  for (const uint8_t address : addresses) {
    Wire.beginTransmission(address);
    const uint8_t error = Wire.endTransmission();
    Serial.printf("LCD probe: address=0x%02X, I2C status=%u\n", address, error);
    if (error == 0) {
      detectedAddress = address;
      break;
    }
  }
  if (detectedAddress == 0) {
    Serial.println("ERROR: LCD not responding at 0x27 or 0x21. Check I2C4 cable, 3.3V and address.");
    return;
  }
  lcd = LiquidCrystal_I2C(detectedAddress, LCD_COLUMNS, LCD_ROWS);
  lcd.init();
  lcd.backlight();
  lcdReady = true;
  Serial.printf("LCD initialized: address=0x%02X, SDA=%u, SCL=%u\n", detectedAddress, LCD_SDA, LCD_SCL);
  showDisplay("San sang", "Cham the SV");
  lcdIdlePending = false;
}

void closeScanConnection() {
  http.end();
  plainClient.stop();
  secureClient.stop();
}

bool openScanRequest(const String& url) {
  const String base = READER_API_URL;
  bool started = false;
  if (base.startsWith("https://")) {
    if (!strlen(READER_ROOT_CA) || time(nullptr) < 1700000000) {
      Serial.println("ERROR: HTTPS requires a trusted root CA and synchronized time.");
      return false;
    }
    secureClient.setCACert(READER_ROOT_CA);
    secureClient.setHandshakeTimeout(5);
    started = http.begin(secureClient, url);
  } else if (READER_ALLOW_LAN_HTTP && base.startsWith("http://")) {
    started = http.begin(plainClient, url);
  }
  if (!started) {
    Serial.println("ERROR: API URL/TLS configuration is invalid.");
    return false;
  }
  http.setReuse(true);
  http.setConnectTimeout(4000);
  http.setTimeout(4000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Reader-Id", READER_ID);
  http.addHeader("X-Reader-Key", READER_DEVICE_KEY);
  return true;
}

constexpr uint8_t BUZZER_LEDC_CHANNEL = 0;
constexpr uint32_t BUZZER_TONE_HZ = 2700;

// Tone is driven by LEDC PWM, which assumes an active-high buzzer.
void buzzerInit() {
  ledcSetup(BUZZER_LEDC_CHANNEL, BUZZER_TONE_HZ, 8);
  ledcAttachPin(BUZZER_PIN, BUZZER_LEDC_CHANNEL);
  ledcWrite(BUZZER_LEDC_CHANNEL, 0);
}

void buzzerOn() {
  ledcWriteTone(BUZZER_LEDC_CHANNEL, BUZZER_TONE_HZ);
}

void buzzerOff() {
  ledcWrite(BUZZER_LEDC_CHANNEL, 0);
}

void beep(unsigned int count, unsigned long duration) {
  for (unsigned int i = 0; i < count; ++i) {
    buzzerOn();
    delay(duration);
    buzzerOff();
    delay(100);
  }
}

String hexBytes(const byte* bytes, size_t count, bool separators) {
  String text;
  for (size_t i = 0; i < count; ++i) {
    if (i && separators) text += ':';
    if (bytes[i] < 16) text += '0';
    text += String(bytes[i], HEX);
  }
  text.toUpperCase();
  return text;
}

bool sendReport(const JsonDocument& report, String& mssv, String& attendanceStatus) {
  mssv = "";
  attendanceStatus = "";
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("ERROR: Wi-Fi disconnected. Scan was NOT delivered; reconnect and scan again.");
    return false;
  }
  const String url = String(READER_API_URL) + "/iot/card-reader/scans";
  if (!openScanRequest(url)) return false;
  String body;
  serializeJson(report, body);
  int status = http.POST(body);
  if (status <= 0) {
    // A kept-alive socket can be closed by the server while idle; reconnect once.
    closeScanConnection();
    if (!openScanRequest(url)) return false;
    status = http.POST(body);
  }
  // getString() decodes chunked bodies, which Render uses, and respects the HTTP timeout.
  const String response = status > 0 ? http.getString() : String();
  if (response.isEmpty()) closeScanConnection();
  else http.end();
  JsonDocument ack;
  const bool delivered = status == 200 && !response.isEmpty() &&
    !deserializeJson(ack, response) && ack["received"].is<bool>() &&
    ack["received"].as<bool>() && ack["read_status"].as<String>() == report["read_status"].as<String>();
  if (!delivered) {
    Serial.printf("ERROR: API delivery failed (HTTP %d). Check backend/key/network and scan again.\n", status);
  } else {
    attendanceStatus = ack["attendance"]["status"].as<String>();
    if (attendanceStatus != "recorded" && attendanceStatus != "duplicate" &&
        attendanceStatus != "outside" && attendanceStatus != "invalid") {
      Serial.println("ERROR: API did not confirm attendance outcome. Update backend; attendance NOT confirmed.");
      return false;
    }
    if (!ack["attendance"]["message"].is<const char*>()) {
      Serial.println("ERROR: Attendance response missing message; attendance NOT confirmed.");
      return false;
    }
    if (ack["mssv"].is<const char*>()) mssv = ack["mssv"].as<String>();
    if (attendanceStatus == "recorded" && mssv.isEmpty()) {
      Serial.println("ERROR: Recorded attendance response missing MSSV; attendance NOT confirmed.");
      return false;
    }
    Serial.printf("Attendance: %s\n", ack["attendance"]["message"].as<const char*>());
  }
  return delivered;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("Smart OU reader: YOLO UNO ESP32-S3 (USB CDC).");
  displayInit();
  buzzerInit();
  SPI.begin(RFID_SCK, RFID_MISO, RFID_MOSI, RFID_SS);
  reader.PCD_Init();
  const byte version = reader.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.printf("RC522 version: 0x%02X\n", version);
  if (version == 0 || version == 0xFF) {
    Serial.println("ERROR: RC522 not responding. Check 3.3V power, GND and SPI wiring.");
  }
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  if (strlen(READER_WIFI_SSID)) {
    WiFi.begin(READER_WIFI_SSID, READER_WIFI_PASSWORD);
    lastWifiAttempt = millis();
    configTime(0, 0, "pool.ntp.org", "time.google.com");
  } else {
    Serial.println("ERROR: Wi-Fi not configured. Serial-only reads; API delivery will fail.");
  }
  Serial.println("Read-only reader ready. No card writes. Tap a card; remove it before rescanning.");
}

void loop() {
  if (!lcdReady && millis() - lastLcdInitAttempt >= 2000) {
    displayInit();
  }
  if (lcdIdlePending && millis() - lastDisplayAt >= LCD_IDLE_TIMEOUT_MS) {
    showDisplay("San sang", "Cham the SV");
    lcdIdlePending = false;
  }
  if (strlen(READER_WIFI_SSID) && WiFi.status() != WL_CONNECTED &&
      millis() - lastWifiAttempt >= 15000) {
    lastWifiAttempt = millis();
    Serial.println("Wi-Fi reconnecting...");
    WiFi.reconnect();
  }
  if (scanned && millis() - lastScan < SCAN_COOLDOWN_MS) { delay(5); return; }
  if (!reader.PICC_IsNewCardPresent()) { delay(5); return; }
  const unsigned long scanAt = millis();
  if (!reader.PICC_ReadCardSerial()) {
    Serial.println("ERROR: Card detected but UID read failed.");
    showDisplay("Diem danh", "that bai");
    beep(2, 100);
    return;
  }
  scanned = true;
  lastScan = millis();
  showDisplay("Dang doc the", "Vui long doi");
  beep(1, 80);
  const auto type = reader.PICC_GetType(reader.uid.sak);
  JsonDocument report;
  report["uid"] = hexBytes(reader.uid.uidByte, reader.uid.size, true);
  report["card_type"] = reader.PICC_GetTypeName(type);
  report["block"] = DATA_BLOCK;
  report["read_status"] = "uid_only";
  report["data_hex"] = nullptr;
  report["detail"] = "Memory reading is limited to MIFARE Classic; UID only for this card type.";
  if (type == MFRC522::PICC_TYPE_MIFARE_MINI ||
      type == MFRC522::PICC_TYPE_MIFARE_1K || type == MFRC522::PICC_TYPE_MIFARE_4K) {
    MFRC522::MIFARE_Key key;
    memset(key.keyByte, 0xFF, sizeof(key.keyByte));
    auto status = reader.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A, DATA_BLOCK, &key, &reader.uid);
    byte buffer[18];
    byte size = sizeof(buffer);
    if (status == MFRC522::STATUS_OK) status = reader.MIFARE_Read(DATA_BLOCK, buffer, &size);
    if (status == MFRC522::STATUS_OK) {
      report["read_status"] = "ok";
      report["data_hex"] = hexBytes(buffer, 16, false);
      report["detail"] = "Read 16 bytes with factory Key A. Raw data only; student NOT verified.";
    } else {
      report["read_status"] = "read_error";
      report["detail"] = String("Default-key block read failed: ") + reader.GetStatusCodeName(status);
    }
  }
  reader.PICC_HaltA();
  reader.PCD_StopCrypto1();
  Serial.println("\n========== CARD SCANNED ==========");
  Serial.printf("UID: %s\n", report["uid"].as<const char*>());
  Serial.printf("Card type: %s\n", report["card_type"].as<const char*>());
  Serial.printf("Read status: %s\n", report["read_status"].as<const char*>());
  Serial.printf("Block: %u\n", static_cast<unsigned int>(DATA_BLOCK));
  if (report["data_hex"].is<const char*>()) {
    const char* hex = report["data_hex"].as<const char*>();
    Serial.printf("Data HEX: %s\n", hex);
    Serial.print("Data ASCII (not verified student ID): ");
    for (size_t i = 0; i < 32; i += 2) {
      char pair[] = {hex[i], hex[i + 1], '\0'};
      const unsigned long value = strtoul(pair, nullptr, 16);
      Serial.write(value >= 32 && value <= 126 ? static_cast<uint8_t>(value) : '.');
    }
    Serial.println();
  } else {
    Serial.println("Data: unavailable; UID was read, memory was not.");
  }
  Serial.printf("Detail: %s\n", report["detail"].as<const char*>());
  Serial.println("Student verification: NOT performed. Card was NOT modified.");
  Serial.print("JSON: ");
  serializeJson(report, Serial);
  Serial.println();
  String mssv;
  String attendanceStatus;
  const bool delivered = sendReport(report, mssv, attendanceStatus);
  Serial.printf("TIMING: tap->result %lu ms\n", millis() - scanAt);
  Serial.println(delivered ? "API: received scan." : "API: scan NOT confirmed.");
  Serial.println("==================================");
  if (!delivered) {
    showDisplay("Loi ket noi API", "Quet lai the");
    beep(3, 100);
  }
  else if (attendanceStatus != "recorded") {
    if (attendanceStatus == "duplicate") {
      showDisplay("Da diem danh", mssv);
    } else if (attendanceStatus == "outside") {
      showDisplay("Ngoai phien", "Chua mo/het gio");
    } else if (report["read_status"].as<String>() == "ok" &&
               report["block"].as<int>() == DATA_BLOCK &&
               report["data_hex"].as<String>() == "00000000000000000000000000000000") {
      showDisplay("Diem danh", "that bai");
    } else if (mssv.isEmpty()) {
      showDisplay("Diem danh", "that bai");
    } else {
      showDisplay("Diem danh", "that bai");
    }
    Serial.printf("Buzzer: 2 beeps; attendance not added (%s).\n", attendanceStatus.c_str());
    beep(2, 100);
  } else {
    showDisplay("Diem danh ok", mssv);
    Serial.printf("MSSV: %s. Buzzer: 1 beep; attendance recorded, student identity NOT verified.\n", mssv.c_str());
    beep(1, 100);
  }
}
