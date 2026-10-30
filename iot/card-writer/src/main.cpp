// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <MFRC522.h>
#include <SPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include "CardPayload.h"
#include "WriterConfig.h"

#if __has_include("DeviceLocal.h")
#include "DeviceLocal.h"
#else
#include "../DeviceLocal.h.example"
#endif

MFRC522 reader(RFID_SS, RFID_RST);
String pendingUid;
JsonDocument unconfirmedResult;
unsigned long lastPoll = 0;
unsigned long lastWifi = 0;
bool pausedForUnknownClaim = false;
bool wifiWasConnected = false;

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

void beep(unsigned count) {
  for (unsigned i = 0; i < count; ++i) {
    buzzerOn();
    delay(100);
    buzzerOff();
    delay(100);
  }
}

WiFiClient plainClient;
WiFiClientSecure secureClient;
HTTPClient http;

void closeRequest() {
  http.end();
  plainClient.stop();
  secureClient.stop();
}

bool openRequest(const String& url) {
  const String base = READER_API_URL;
  bool started = false;
  if (base.startsWith("https://") && strlen(READER_ROOT_CA) && time(nullptr) > 1700000000) {
    secureClient.setCACert(READER_ROOT_CA);
    secureClient.setHandshakeTimeout(5);
    started = http.begin(secureClient, url);
  } else if (READER_ALLOW_LAN_HTTP && base.startsWith("http://")) {
    started = http.begin(plainClient, url);
  }
  if (!started) return false;
  http.setReuse(true);
  http.setConnectTimeout(4000);
  http.setTimeout(4000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Writer-Id", READER_ID);
  http.addHeader("X-Writer-Key", READER_DEVICE_KEY);
  return true;
}

// Non-idempotent requests (claim) use a fresh connection and are never retried,
// because a lost response may mean the authorization was already consumed.
bool request(const char* endpoint, const JsonDocument& body, JsonDocument& response, bool idempotent = true) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("ERROR: Wi-Fi disconnected; no card write authorized.");
    return false;
  }
  const String base = READER_API_URL;
  const String url = base + endpoint;
  if (!idempotent) closeRequest();
  String payload;
  serializeJson(body, payload);
  int status = -1;
  for (int attempt = 0; attempt < 2; ++attempt) {
    if (!openRequest(url)) { Serial.println("ERROR: Invalid API/TLS configuration."); return false; }
    status = http.POST(payload);
    if (status > 0 || !idempotent || attempt == 1) break;
    // A kept-alive socket can be closed by the server while idle; reconnect once.
    closeRequest();
  }
  // getString() decodes chunked bodies, which Render uses, and respects the HTTP timeout.
  const String result = status > 0 ? http.getString() : String();
  if (result.isEmpty()) closeRequest();
  else http.end();
  if (status <= 0) {
    Serial.printf("ERROR: Writer API transport %d (%s), endpoint=%s\n",
                  status, HTTPClient::errorToString(status).c_str(), endpoint);
    Serial.printf("Target: %s; ESP32 IP: %s; gateway: %s; RSSI: %d dBm\n",
                  base.c_str(), WiFi.localIP().toString().c_str(),
                  WiFi.gatewayIP().toString().c_str(), WiFi.RSSI());
    Serial.println("Check backend is running with --host 0.0.0.0, LAN IP/port, private-network firewall and Wi-Fi client isolation. No API response received.");
    return false;
  }
  if (status != 200) {
    Serial.printf("ERROR: Writer API HTTP %d, endpoint=%s; result NOT confirmed.\n", status, endpoint);
    if (status == 401 || status == 403) Serial.println("Check writer ID/key and restart backend after configuration changes.");
    else if (status == 404) Serial.println("Check backend URL and card-writer router version.");
    else if (status == 503) Serial.println("Check writer setup and backend configuration; inspect backend logs.");
    return false;
  }
  if (result.isEmpty()) {
    Serial.printf("ERROR: Incomplete/oversized API response, endpoint=%s; result NOT confirmed.\n", endpoint);
    return false;
  }
  const auto jsonError = deserializeJson(response, result);
  if (jsonError) {
    Serial.printf("ERROR: Invalid API JSON (%s), endpoint=%s; result NOT confirmed.\n",
                  jsonError.c_str(), endpoint);
    return false;
  }
  return true;
}

String uidText() {
  String uid;
  for (byte i = 0; i < reader.uid.size; ++i) {
    if (i) uid += ':';
    if (reader.uid.uidByte[i] < 16) uid += '0';
    uid += String(reader.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("CampusOpt writer: YOLO UNO ESP32-S3 (USB CDC).");
  Serial.printf("RC522 pins: SCK=%u, MISO=%u, MOSI=%u, SS=%u, RST=%u; buzzer=%u\n",
                RFID_SCK, RFID_MISO, RFID_MOSI, RFID_SS, RFID_RST, BUZZER_PIN);
  buzzerInit();
  SPI.begin(RFID_SCK, RFID_MISO, RFID_MOSI, RFID_SS);
  reader.PCD_Init();
  const byte version = reader.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.printf("Writer RC522 version: 0x%02X\n", version);
  if (version == 0 || version == 0xFF) {
    Serial.println("ERROR: RC522 not responding. Check 3.3V, common GND and YOLO UNO D-pin wiring.");
  }
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  if (strlen(READER_WIFI_SSID)) {
    WiFi.begin(READER_WIFI_SSID, READER_WIFI_PASSWORD);
    configTime(0, 0, "pool.ntp.org", "time.google.com");
  } else Serial.println("ERROR: Configure writer Wi-Fi before use.");
  Serial.println("WRITER: owned blank Classic cards only. Present, authorize on admin web, then remove and tap SAME card again.");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiWasConnected) {
      Serial.println("ERROR: Writer Wi-Fi connection lost.");
      wifiWasConnected = false;
    }
    if (millis() - lastWifi > 15000) { lastWifi = millis(); WiFi.reconnect(); Serial.println("Writer Wi-Fi reconnecting..."); }
    pendingUid = "";
    delay(10);
  }
  if (WiFi.status() == WL_CONNECTED && !wifiWasConnected) {
    Serial.printf("Writer Wi-Fi connected: IP=%s, gateway=%s, RSSI=%d dBm; API=%s\n",
                  WiFi.localIP().toString().c_str(), WiFi.gatewayIP().toString().c_str(),
                  WiFi.RSSI(), READER_API_URL);
    wifiWasConnected = true;
  }
  if (WiFi.status() == WL_CONNECTED && millis() - lastPoll >= 1500) {
    lastPoll = millis();
    JsonDocument body, response;
    if (!unconfirmedResult.isNull() && unconfirmedResult["job_id"].is<const char*>()) {
      if (request("/iot/card-writer/result", unconfirmedResult, response) &&
          response["received"].is<bool>() && response["received"].as<bool>()) {
        beep(unconfirmedResult["success"].as<bool>() ? 1 : 2);
        Serial.println("Write result confirmed by API.");
        unconfirmedResult.clear();
      } else {
        Serial.println("ERROR: Write result still unconfirmed; retrying result only, never rewriting card.");
      }
      return;
    }
    if (request("/iot/card-writer/poll", body, response)) {
      pendingUid = response["pending_uid"].is<const char*>() ? response["pending_uid"].as<String>() : "";
    } else pendingUid = "";
  }
  if (pausedForUnknownClaim || unconfirmedResult["job_id"].is<const char*>()) { delay(10); return; }
  if (!reader.PICC_IsNewCardPresent()) { delay(5); return; }
  const unsigned long scanAt = millis();
  if (!reader.PICC_ReadCardSerial()) { Serial.println("ERROR: Cannot read UID."); beep(2); return; }
  const auto type = reader.PICC_GetType(reader.uid.sak);
  const String uid = uidText();
  Serial.printf("Presented UID: %s; type: %s\n", uid.c_str(), reader.PICC_GetTypeName(type));
  if (type != MFRC522::PICC_TYPE_MIFARE_MINI && type != MFRC522::PICC_TYPE_MIFARE_1K &&
      type != MFRC522::PICC_TYPE_MIFARE_4K) {
    Serial.println("ERROR: Unsupported type; card NOT modified.");
    reader.PICC_HaltA();
    reader.PCD_StopCrypto1();
    beep(2);
    return;
  }
  JsonDocument identity, response;
  identity["uid"] = uid;
  identity["card_type"] = reader.PICC_GetTypeName(type);
  if (pendingUid.isEmpty() || pendingUid != uid) {
    const unsigned long sentAt = millis();
    const bool acknowledged = request("/iot/card-writer/present", identity, response) &&
        response["received"].is<bool>() && response["received"].as<bool>();
    Serial.printf("TIMING: scan->sent %lu ms, HTTP present %lu ms, scan->ack %lu ms\n",
                  sentAt - scanAt, millis() - sentAt, millis() - scanAt);
    if (!acknowledged) {
      Serial.println("ERROR: Card presentation not acknowledged by API.");
      beep(3);
    } else {
      Serial.println("Card scanned and acknowledged by API. No write yet; authorize MSSV on web, remove card and tap again.");
      beep(1);
    }
    reader.PICC_HaltA();
    reader.PCD_StopCrypto1();
    return;
  }
  if (!request("/iot/card-writer/claim", identity, response, false)) {
    pausedForUnknownClaim = true;
    Serial.println("ERROR: Claim uncertain. NO WRITE performed. Check web and restart writer; authorization may have been consumed.");
    reader.PICC_HaltA();
    reader.PCD_StopCrypto1();
    beep(3);
    return;
  }
  pendingUid = "";
  const String job = response["job_id"].as<String>();
  const String mssv = response["mssv"].as<String>();
  if (job.length() != 36 || response["uid"].as<String>() != uid ||
      !response["block"].is<int>() || response["block"].as<int>() != 4 || !isMssv(mssv.c_str())) {
    pausedForUnknownClaim = true;
    Serial.println("ERROR: Malformed authorization. NO WRITE performed; inspect job on web.");
    reader.PICC_HaltA(); reader.PCD_StopCrypto1(); beep(3); return;
  }
  MFRC522::MIFARE_Key key;
  memset(key.keyByte, 0xFF, sizeof(key.keyByte));
  byte before[18], after[18], size = 18, encoded[16] = {};
  memcpy(encoded, mssv.c_str(), mssv.length());
  auto status = reader.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A, 4, &key, &reader.uid);
  if (status == MFRC522::STATUS_OK) status = reader.MIFARE_Read(4, before, &size);
  bool acceptable = status == MFRC522::STATUS_OK;
  if (acceptable) acceptable = replaceableBlock(before);
  bool success = false;
  String detail;
  if (!acceptable) detail = "Authentication/read failed or block 4 has unrelated data. No write attempted.";
  else {
    // Exactly block 4: never manufacturer block 0 or sector trailer keys.
    status = reader.MIFARE_Write(4, encoded, 16);
    size = 18;
    if (status == MFRC522::STATUS_OK) status = reader.MIFARE_Read(4, after, &size);
    success = status == MFRC522::STATUS_OK && memcmp(encoded, after, 16) == 0;
    detail = success ? "MSSV written and all 16 bytes read back correctly."
                     : "Write/read-back failed. Card content may have changed; inspect before retry.";
  }
  reader.PICC_HaltA();
  reader.PCD_StopCrypto1();
  unconfirmedResult["job_id"] = job;
  unconfirmedResult["uid"] = uid;
  unconfirmedResult["success"] = success;
  unconfirmedResult["detail"] = detail;
  if (success) {
    String hex;
    for (byte value : encoded) { if (value < 16) hex += '0'; hex += String(value, HEX); }
    hex.toUpperCase();
    unconfirmedResult["data_hex"] = hex;
  } else unconfirmedResult["data_hex"] = nullptr;
  Serial.println(detail);
  JsonDocument ack;
  if (request("/iot/card-writer/result", unconfirmedResult, ack) &&
      ack["received"].is<bool>() && ack["received"].as<bool>()) {
    beep(success ? 1 : 2);
    unconfirmedResult.clear();
  } else {
    Serial.println("ERROR: Physical result not confirmed by API; retrying RESULT only, never re-writing.");
    beep(3);
  }
}
