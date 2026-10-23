#include <Arduino.h>
#include <stdio.h>
#include <string.h>

#include "LightConfig.h"
#include "LightingTransport.h"

#ifndef DEVICE_ID
#error "Set DEVICE_ID in platformio.ini"
#endif
#ifndef ROOM_ID
#error "Set ROOM_ID in platformio.ini"
#endif

struct LightState {
  bool on = false;
  int revision = -1;
  unsigned long generation = 0;
  int lastReading = HIGH;
  int stableReading = HIGH;
  unsigned long changedAt = 0;
};

LightState states[LIGHT_COUNT];
char command[80];
size_t commandLength = 0;
bool commandOverflow = false;
#ifdef ARDUINO_ARCH_ESP32
portMUX_TYPE stateMux = portMUX_INITIALIZER_UNLOCKED;
#define LOCK_STATE() portENTER_CRITICAL(&stateMux)
#define UNLOCK_STATE() portEXIT_CRITICAL(&stateMux)
#else
#define LOCK_STATE()
#define UNLOCK_STATE()
#endif

LightingSnapshot readLighting() {
  LightingSnapshot result;
  LOCK_STATE();
  for (size_t i = 0; i < LIGHT_COUNT; ++i) {
    result.on[i] = states[i].on;
    result.revision[i] = states[i].revision;
    result.generation[i] = states[i].generation;
  }
  UNLOCK_STATE();
  return result;
}

void applyLighting(const LightingSnapshot& desired, const LightingSnapshot& sent) {
  LOCK_STATE();
  for (size_t i = 0; i < LIGHT_COUNT; ++i) {
    if (desired.revision[i] > states[i].revision ||
        (desired.revision[i] == states[i].revision &&
         sent.generation[i] == states[i].generation)) {
      states[i].revision = desired.revision[i];
      states[i].on = desired.on[i];
      digitalWrite(LIGHTS[i].ledPin, desired.on[i] ? HIGH : LOW);
    }
  }
  UNLOCK_STATE();
}

void reportState(size_t index) {
  const auto snapshot = readLighting();
  Serial.printf(
      "{\"source\":\"simulated\",\"device_id\":\"%s\",\"room_id\":\"%s\","
      "\"light_id\":\"%s\",\"on\":%s,\"uptime_ms\":%lu}\n",
      DEVICE_ID, ROOM_ID, LIGHTS[index].id,
      snapshot.on[index] ? "true" : "false", millis());
}

void setLight(size_t index, bool on) {
  LOCK_STATE();
  states[index].on = on;
  states[index].generation++;
  digitalWrite(LIGHTS[index].ledPin, on ? HIGH : LOW);
  UNLOCK_STATE();
#ifdef ARDUINO_ARCH_ESP32
  notifyLightingChanged();
#endif
  reportState(index);
}

void handleCommand(const char* input) {
  if (strcmp(input, "status") == 0) {
    for (size_t i = 0; i < LIGHT_COUNT; ++i) reportState(i);
    return;
  }

  char id[32], action[16], extra;
  if (sscanf(input, "%31s %15s %c", id, action, &extra) == 2) {
    for (size_t i = 0; i < LIGHT_COUNT; ++i) {
      if (strcmp(id, LIGHTS[i].id) != 0) continue;
      if (strcmp(action, "on") == 0) return setLight(i, true);
      if (strcmp(action, "off") == 0) return setLight(i, false);
      if (strcmp(action, "toggle") == 0) return setLight(i, !readLighting().on[i]);
    }
  }
  Serial.println("ERROR: use status OR <light-id> on|off|toggle");
}

void readCommands() {
  while (Serial.available()) {
    const char character = Serial.read();
    if (character == '\r') continue;
    if (character == '\n') {
      if (commandOverflow) {
        Serial.println("ERROR: command too long");
      } else if (commandLength > 0) {
        command[commandLength] = '\0';
        handleCommand(command);
      }
      commandLength = 0;
      commandOverflow = false;
    } else if (commandLength < sizeof(command) - 1) {
      command[commandLength++] = character;
    } else {
      commandOverflow = true;
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial.printf("CampusOpt simulated lighting: %s / %s\n",
                DEVICE_ID, ROOM_ID);
  for (size_t i = 0; i < LIGHT_COUNT; ++i) {
    pinMode(LIGHTS[i].ledPin, OUTPUT);
    pinMode(LIGHTS[i].buttonPin, INPUT_PULLUP);
    setLight(i, false);
  }
  Serial.println("Commands: status, light-1 on, light-1 off, light-2 toggle");
#ifdef ARDUINO_ARCH_ESP32
  startLightingTransport(readLighting, applyLighting);
#endif
}

void loop() {
  readCommands();
  const unsigned long now = millis();
  for (size_t i = 0; i < LIGHT_COUNT; ++i) {
    LightState& state = states[i];
    const int reading = digitalRead(LIGHTS[i].buttonPin);
    if (reading != state.lastReading) state.changedAt = now;
    state.lastReading = reading;
    if (now - state.changedAt >= DEBOUNCE_MS && reading != state.stableReading) {
      state.stableReading = reading;
      if (reading == LOW) setLight(i, !readLighting().on[i]);
    }
  }
  delay(1);
}
