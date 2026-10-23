#include "LightingTransport.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>

#if __has_include("DeviceLocal.h")
#include "DeviceLocal.h"
#else
#define LIGHTING_API_URL ""
#define LIGHTING_DEVICE_KEY ""
#define LIGHTING_ROOT_CA ""
#define LIGHTING_ALLOW_LOCAL_HTTP false
#endif

namespace {
ReadLighting readLighting;
ApplyLighting applyLighting;
String sessionId;
unsigned long sequence = 0;
TaskHandle_t networkHandle = nullptr;
constexpr unsigned long POLL_MS = 1000;
constexpr unsigned long WIFI_RETRY_MS = 15000;
unsigned long lastWifiAttempt = 0;

int post(const char* path, const String& body, JsonDocument& response) {
  const String base = LIGHTING_API_URL;
  // The clients must outlive each request for TCP/TLS keep-alive.
  static WiFiClient plain;
  static WiFiClientSecure secure;
  static HTTPClient http;
  const bool tls = base.startsWith("https://");
  if (tls) {
    if (strlen(LIGHTING_ROOT_CA) == 0) {
      Serial.println("IoT ERROR: HTTPS requires a trusted root CA in DeviceLocal.h");
      return -1;
    }
    secure.setCACert(LIGHTING_ROOT_CA);
    secure.setHandshakeTimeout(5);
    if (!http.begin(secure, base + path)) return -1;
  } else {
    const bool local = base.startsWith("http://host.wokwi.internal:") ||
                       base.startsWith("http://127.0.0.1:") ||
                       base.startsWith("http://localhost:");
    if (!LIGHTING_ALLOW_LOCAL_HTTP || !local) {
      Serial.println("IoT ERROR: use HTTPS for deployment; HTTP only allowed for local gateway");
      return -1;
    }
    if (!http.begin(plain, base + path)) return -1;
  }
  http.setConnectTimeout(5000);
  http.setTimeout(8000);
  http.setReuse(true);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Id", DEVICE_ID);
  http.addHeader("X-Device-Key", LIGHTING_DEVICE_KEY);
  const int status = http.POST(body);
  if (status == 200) {
    const auto error = deserializeJson(response, http.getString());
    if (error) {
      Serial.printf("IoT ERROR: invalid JSON response: %s\n", error.c_str());
      plain.stop();
      secure.stop();
      http.end();
      return -1;
    }
  } else {
    if (status > 0) http.getString();
    Serial.printf("IoT request failed: HTTP %d (%s)\n", status,
                  status < 0 ? HTTPClient::errorToString(status).c_str() : "check server response and credentials");
    plain.stop();
    secure.stop();
  }
  http.end();
  return status;
}

bool applyResponse(JsonDocument& doc, const LightingSnapshot& sent) {
  if (!doc["session_id"].is<const char*>() || !doc["lights"].is<JsonArray>()) return false;
  JsonArray lights = doc["lights"].as<JsonArray>();
  if (lights.size() != LIGHT_COUNT) return false;
  LightingSnapshot desired = sent;
  bool found[LIGHT_COUNT] = {};
  for (JsonObject light : lights) {
    if (!light["light_id"].is<const char*>() || !light["on"].is<bool>() ||
        !light["revision"].is<int>() || light["revision"].as<int>() < 0) return false;
    size_t index = 0;
    while (index < LIGHT_COUNT && strcmp(light["light_id"], LIGHTS[index].id) != 0) ++index;
    if (index == LIGHT_COUNT || found[index]) return false;
    found[index] = true;
    desired.on[index] = light["on"].as<bool>();
    desired.revision[index] = light["revision"].as<int>();
  }
  applyLighting(desired, sent);
  return true;
}

void networkTask(void*) {
  unsigned long retryMs = POLL_MS;
  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      sessionId = "";
      if (millis() - lastWifiAttempt >= WIFI_RETRY_MS) {
        Serial.println("IoT Wi-Fi unavailable; retrying connection");
        WiFi.reconnect();
        lastWifiAttempt = millis();
      }
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }
    if (sessionId.isEmpty()) {
      // TLS certificate validity needs real time, not ESP32 uptime.
      if (String(LIGHTING_API_URL).startsWith("https://") && time(nullptr) < 1700000000) {
        Serial.println("IoT waiting for NTP clock before TLS");
        vTaskDelay(pdMS_TO_TICKS(3000));
        continue;
      }
      JsonDocument doc;
      const auto sent = readLighting();
      if (post("/iot/device/connect", "{}", doc) == 200 && applyResponse(doc, sent)) {
        sessionId = doc["session_id"].as<String>();
        sequence = 0;
        retryMs = POLL_MS;
        Serial.println("IoT connected; reporting GPIO state");
        continue;
      }
    } else {
      const auto sent = readLighting();
      JsonDocument request, response;
      request["session_id"] = sessionId;
      request["sequence"] = sequence++;
      JsonArray lights = request["lights"].to<JsonArray>();
      for (size_t i = 0; i < LIGHT_COUNT; ++i) {
        JsonObject light = lights.add<JsonObject>();
        light["light_id"] = LIGHTS[i].id;
        light["on"] = sent.on[i];
        light["revision"] = sent.revision[i];
      }
      String body;
      serializeJson(request, body);
      const int status = post("/iot/device/sync", body, response);
      if (status == 200 && applyResponse(response, sent)) {
        retryMs = POLL_MS;
        // Confirm applied commands or in-flight button changes without another poll delay.
        if (!lightingNeedsReport(readLighting(), sent)) {
          ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(POLL_MS));
        }
        continue;
      }
      if (status == 200) Serial.println("IoT ERROR: invalid lighting response");
      if (status == 409) sessionId = "";
    }
    vTaskDelay(pdMS_TO_TICKS(retryMs));
    retryMs = min(retryMs * 2, 10000UL);
  }
}
}  // namespace

void startLightingTransport(ReadLighting read, ApplyLighting apply) {
  if (strlen(LIGHTING_API_URL) == 0 || strlen(LIGHTING_DEVICE_KEY) < 32) {
    Serial.println("IoT network disabled: configure DeviceLocal.h (see README)");
    return;
  }
  readLighting = read;
  applyLighting = apply;
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  lastWifiAttempt = millis();
  WiFi.begin("Wokwi-GUEST", "", 6);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  if (xTaskCreate(networkTask, "lighting-http", 16384, nullptr, 1, &networkHandle) != pdPASS) {
    Serial.println("IoT ERROR: unable to create network task");
  }
}

void notifyLightingChanged() {
  if (networkHandle != nullptr) xTaskNotifyGive(networkHandle);
}
