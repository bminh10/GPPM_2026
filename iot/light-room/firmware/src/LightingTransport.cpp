#include "LightingTransport.h"
#include "HttpResponseBody.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <atomic>

#if __has_include("DeviceLocal.h")
#include "DeviceLocal.h"
#else
#define LIGHTING_API_URL ""
#define LIGHTING_DEVICE_KEY ""
#define LIGHTING_ROOT_CA ""
#define LIGHTING_ALLOW_LOCAL_HTTP false
#endif

#ifndef LIGHTING_INSECURE_TLS
#define LIGHTING_INSECURE_TLS 0
#endif

namespace {
ReadLighting readLighting;
ApplyLighting applyLighting;
String sessionId;
unsigned long sequence = 0;
TaskHandle_t networkHandle = nullptr;
constexpr unsigned long POLL_MS = 1000;
constexpr unsigned long WIFI_RETRY_MS = 15000;
constexpr unsigned long WIFI_STUCK_MS = 60000;
unsigned long lastWifiAttempt = 0;
std::atomic<unsigned long> progressAt{0};
std::atomic<unsigned long> lastSuccessAt{0};
std::atomic<bool> hasSuccess{false};
std::atomic<const char*> phase{"starting"};

void progress(const char* stage) {
  phase.store(stage);
  progressAt.store(millis());
}

// Persistent clients keep one TLS session open (HTTP/1.1 keep-alive). A fresh TLS
// handshake per poll is too slow through the public Wokwi gateway and gets cut off.
WiFiClient plain;
WiFiClientSecure secure;
HTTPClient http;
bool transportConfigured = false;

void dropConnection() {
  plain.stop();
  secure.stop();
  http.end();
}

int post(const char* path, const String& body, JsonDocument& response) {
  const String base = LIGHTING_API_URL;
  const bool tls = base.startsWith("https://");
  progress("opening HTTP connection");
  if (!transportConfigured) {
    if (tls) {
#if LIGHTING_INSECURE_TLS
      // Wokwi web demo only: skipping chain verification shortens the emulated handshake,
      // but anyone on the path could impersonate the server and read the device key.
      secure.setInsecure();
#else
      if (strlen(LIGHTING_ROOT_CA) == 0) {
        Serial.println("IoT ERROR: HTTPS requires a trusted root CA in DeviceLocal.h");
        return -1;
      }
      secure.setCACert(LIGHTING_ROOT_CA);
#endif
      secure.setHandshakeTimeout(30);
    } else {
      const bool local = base.startsWith("http://host.wokwi.internal:") ||
                         base.startsWith("http://127.0.0.1:") ||
                         base.startsWith("http://localhost:");
      if (!LIGHTING_ALLOW_LOCAL_HTTP || !local) {
        Serial.println("IoT ERROR: use HTTPS for deployment; HTTP only allowed for local gateway");
        return -1;
      }
    }
    http.useHTTP10(false);
    http.setReuse(true);
    transportConfigured = true;
  }
  const bool begun = tls ? http.begin(secure, base + path) : http.begin(plain, base + path);
  if (!begun) {
    dropConnection();
    return -1;
  }
  http.setConnectTimeout(15000);
  http.setTimeout(15000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Id", DEVICE_ID);
  http.addHeader("X-Device-Key", LIGHTING_DEVICE_KEY);
  progress("waiting for HTTP headers");
  const int status = http.POST(body);
  if (status != 200) {
    Serial.printf("IoT request failed: HTTP %d (%s)\n", status,
                  status < 0 ? HTTPClient::errorToString(status).c_str() : "check server response and credentials");
    dropConnection();
    return status;
  }
  if (http.getSize() > static_cast<int>(MAX_BODY_BYTES)) {
    Serial.println("IoT ERROR: response too large");
    dropConnection();
    return -1;
  }
  progress("reading HTTP body");
  // getString() decodes chunked bodies (Render/Cloudflare) and leaves the socket reusable.
  const String payload = http.getString();
  const auto error = payload.isEmpty() ? DeserializationError::EmptyInput : deserializeJson(response, payload);
  if (error) {
    Serial.printf("IoT ERROR: invalid JSON response: %s; reconnecting\n", error.c_str());
    dropConnection();
    return -1;
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
    progress("checking Wi-Fi");
    const wl_status_t wifi = WiFi.status();
    if (wifi != WL_CONNECTED) {
      if (!sessionId.isEmpty()) dropConnection();
      sessionId = "";
      // The public Wokwi gateway can take longer than one retry window; reconnecting
      // while still idle/connecting would abort the attempt in progress.
      const bool failed = wifi == WL_CONNECT_FAILED || wifi == WL_CONNECTION_LOST ||
                          wifi == WL_DISCONNECTED || wifi == WL_NO_SSID_AVAIL;
      if (millis() - lastWifiAttempt >= (failed ? WIFI_RETRY_MS : WIFI_STUCK_MS)) {
        Serial.printf("IoT Wi-Fi unavailable (status %d); retrying connection\n", static_cast<int>(wifi));
        WiFi.disconnect();
        WiFi.begin("Wokwi-GUEST", "", 6);
        lastWifiAttempt = millis();
      }
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }
    if (sessionId.isEmpty()) {
      // TLS certificate validity needs real time, not ESP32 uptime.
      if (!LIGHTING_INSECURE_TLS && String(LIGHTING_API_URL).startsWith("https://") && time(nullptr) < 1700000000) {
        static unsigned long ntpRequestedAt = 0;
        if (ntpRequestedAt == 0 || millis() - ntpRequestedAt >= 20000) {
          configTime(0, 0, "time.google.com", "pool.ntp.org", "time.cloudflare.com");
          ntpRequestedAt = millis();
        }
        Serial.println("IoT waiting for NTP clock before TLS");
        vTaskDelay(pdMS_TO_TICKS(3000));
        continue;
      }
      JsonDocument doc;
      const auto sent = readLighting();
      const int status = post("/iot/device/connect", "{}", doc);
      if (status == 200 && applyResponse(doc, sent)) {
        sessionId = doc["session_id"].as<String>();
        sequence = 0;
        retryMs = POLL_MS;
        Serial.println("IoT connected; reporting GPIO state");
        hasSuccess.store(true);
        lastSuccessAt.store(millis());
        continue;
      }
      if (status == 200) Serial.println("IoT ERROR: invalid connect response");
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
        hasSuccess.store(true);
        lastSuccessAt.store(millis());
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
  progress("starting Wi-Fi");
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

void checkLightingTransport() {
  if (networkHandle == nullptr) return;
  static unsigned long loggedAt = 0;
  const unsigned long lastProgress = progressAt.load();
  const unsigned long lastSuccess = lastSuccessAt.load();
  const unsigned long now = millis();
  const unsigned long elapsed = now - lastProgress;
  if (now - loggedAt >= 15000) {
    loggedAt = now;
    if (hasSuccess.load()) {
      Serial.printf("IoT health: uptime_ms=%lu WiFi=%d stage=%s stage_age_ms=%lu last_response_age_ms=%lu heap=%u\n",
                    now, static_cast<int>(WiFi.status()), phase.load(), elapsed,
                    now - lastSuccess, ESP.getFreeHeap());
    } else {
      Serial.printf("IoT health: uptime_ms=%lu WiFi=%d stage=%s stage_age_ms=%lu no_successful_response heap=%u\n",
                    now, static_cast<int>(WiFi.status()), phase.load(), elapsed, ESP.getFreeHeap());
    }
  }
  if (lightingTransportStalled(now, lastProgress) && progressAt.load() == lastProgress) {
    Serial.printf("IoT ERROR: network task stalled in %s for at least 60s; restarting board to recover\n", phase.load());
    Serial.flush();
    ESP.restart();
  }
}
