#pragma once

#include <Arduino.h>

struct LightConfig {
  const char* id;
  uint8_t ledPin;
  uint8_t buttonPin;
};

#if __has_include("DeviceLights.h")
#include "DeviceLights.h"
#else
constexpr LightConfig LIGHTS[] = {
    {"light-1", 18, 25},
    {"light-2", 19, 26},
};
#endif
constexpr size_t LIGHT_COUNT = sizeof(LIGHTS) / sizeof(LIGHTS[0]);
constexpr unsigned long DEBOUNCE_MS = 35;
