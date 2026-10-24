#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <MFRC522.h>
#include <SPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include "ReaderConfig.h"
#include "../../light-room/firmware/include/HttpResponseBody.h"

#if __has_include("DeviceLocal.h")
#include "DeviceLocal.h"
#else
#include "../DeviceLocal.h.example"
#endif

MFRC522 reader(RFID_SS, RFID_RST);
unsigned long lastScan = 0;
unsigned long lastWifiAttempt = 0;
bool scanned = false;

void beep(unsigned int count, unsigned long duration) {
  for (unsigned int i = 0; i < count; ++i) {
    digitalWrite(BUZZER_PIN, BUZZER_ACTIVE_HIGH ? HIGH : LOW);
    delay(duration);
    digitalWrite(BUZZER_PIN, BUZZER_ACTIVE_HIGH ? LOW : HIGH);
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
  const String base = READER_API_URL;
  WiFiClient plain;
  WiFiClientSecure secure;
  HTTPClient http;
  http.useHTTP10(true);
  http.setReuse(false);
  http.setConnectTimeout(4000);
  http.setTimeout(4000);
  bool started = false;
  if (base.startsWith("https://")) {
    if (!strlen(READER_ROOT_CA) || time(nullptr) < 1700000000) {
      Serial.println("ERROR: HTTPS requires a trusted root CA and synchronized time.");
      return false;
    }
    secure.setCACert(READER_ROOT_CA);
    secure.setHandshakeTimeout(5);
    started = http.begin(secure, base + "/iot/card-reader/scans");
  } else if (READER_ALLOW_LAN_HTTP && base.startsWith("http://")) {
    started = http.begin(plain, base + "/iot/card-reader/scans");
  }
  if (!started) {
    Serial.println("ERROR: API URL/TLS configuration is invalid.");
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Reader-Id", READER_ID);
  http.addHeader("X-Reader-Key", READER_DEVICE_KEY);
  String body;
  serializeJson(report, body);
  const int status = http.POST(body);
  String response;
  const auto result = status > 0
    ? readResponseBody(http.getStream(), http.getSize(), response)
    : BodyResult::Truncated;
  http.end();
  plain.stop();
  secure.stop();
  JsonDocument ack;
  const bool delivered = status == 200 && result == BodyResult::Complete &&
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
    Serial.printf("Attendance: %s\n", ack["attendance"]["message"].as<const char*>());
  }
  return delivered;
}

void setup() {
  Serial.begin(115200);
  digitalWrite(BUZZER_PIN, BUZZER_ACTIVE_HIGH ? LOW : HIGH);
  pinMode(BUZZER_PIN, OUTPUT);
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
  if (strlen(READER_WIFI_SSID) && WiFi.status() != WL_CONNECTED &&
      millis() - lastWifiAttempt >= 15000) {
    lastWifiAttempt = millis();
    Serial.println("Wi-Fi reconnecting...");
    WiFi.reconnect();
  }
  if (scanned && millis() - lastScan < SCAN_COOLDOWN_MS) { delay(5); return; }
  if (!reader.PICC_IsNewCardPresent()) { delay(5); return; }
  if (!reader.PICC_ReadCardSerial()) {
    Serial.println("ERROR: Card detected but UID read failed.");
    beep(2, 100);
    return;
  }
  scanned = true;
  lastScan = millis();
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
  Serial.println(delivered ? "API: received scan." : "API: scan NOT confirmed.");
  Serial.println("==================================");
  if (!delivered) beep(3, 100);
  else if (attendanceStatus != "recorded") {
    Serial.printf("Buzzer: 2 beeps; attendance not added (%s).\n", attendanceStatus.c_str());
    beep(2, 100);
  } else {
    Serial.printf("MSSV: %s. Buzzer: 1 beep; attendance recorded, student identity NOT verified.\n", mssv.c_str());
    beep(1, 100);
  }
}
