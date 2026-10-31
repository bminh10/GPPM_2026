// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
#pragma once
#include <Arduino.h>

#if !defined(CONFIG_IDF_TARGET_ESP32S3)
#error "The card reader targets YOLO UNO ESP32-S3. Use the yolo-uno environment."
#endif

// YOLO UNO header labels differ from ESP32-S3 GPIO numbers.
constexpr uint8_t RFID_SCK = 48;   // D13
constexpr uint8_t RFID_MISO = 47;  // D12
constexpr uint8_t RFID_MOSI = 38;  // D11
constexpr uint8_t RFID_SS = 21;   // D10
constexpr uint8_t RFID_RST = 18;  // D9
constexpr uint8_t BUZZER_PIN = 17; // D8
constexpr bool BUZZER_ACTIVE_HIGH = true;
constexpr uint8_t LCD_SDA = 11;
constexpr uint8_t LCD_SCL = 12;
constexpr uint8_t LCD_ADDRESS = 0x27;
constexpr uint8_t LCD_COLUMNS = 16;
constexpr uint8_t LCD_ROWS = 2;
constexpr unsigned long LCD_IDLE_TIMEOUT_MS = 5000;
constexpr uint8_t DATA_BLOCK = 4;
constexpr unsigned long SCAN_COOLDOWN_MS = 2000;
