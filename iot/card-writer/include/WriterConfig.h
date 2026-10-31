// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
#pragma once
#include <Arduino.h>

#if !defined(CONFIG_IDF_TARGET_ESP32)
#error "The card writer targets NodeMCU-32S ESP32. Use the nodemcu-32s environment."
#endif

constexpr uint8_t RFID_SCK = 18;
constexpr uint8_t RFID_MISO = 19;
constexpr uint8_t RFID_MOSI = 23;
constexpr uint8_t RFID_SS = 21;
constexpr uint8_t RFID_RST = 22;
constexpr uint8_t BUZZER_PIN = 25;
constexpr bool BUZZER_ACTIVE_HIGH = true;
