#pragma once

#include <Arduino.h>

struct LightConfig {
  const char* id;
  uint8_t ledPin;
  uint8_t buttonPin;
};

constexpr LightConfig LIGHTS[] = {
    {"light-1", 18, 25},
    {"light-2", 19, 26},
};
constexpr size_t LIGHT_COUNT = sizeof(LIGHTS) / sizeof(LIGHTS[0]);
constexpr unsigned long DEBOUNCE_MS = 35;
