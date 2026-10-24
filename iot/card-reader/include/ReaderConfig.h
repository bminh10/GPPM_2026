#pragma once
#include <Arduino.h>

constexpr uint8_t RFID_SCK = 18;
constexpr uint8_t RFID_MISO = 19;
constexpr uint8_t RFID_MOSI = 23;
constexpr uint8_t RFID_SS = 21;
constexpr uint8_t RFID_RST = 22;
constexpr uint8_t BUZZER_PIN = 25;
constexpr bool BUZZER_ACTIVE_HIGH = true;
constexpr uint8_t DATA_BLOCK = 4;
constexpr unsigned long SCAN_COOLDOWN_MS = 2000;
