// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string.h>

inline bool isMssv(const char* text) {
  if (!text) return false;
  const size_t length = strlen(text);
  if (length == 0 || length > 16) return false;
  for (size_t i = 0; i < length; ++i) {
    const char value = text[i];
    if (!((value >= 'A' && value <= 'Z') || (value >= 'a' && value <= 'z') ||
          (value >= '0' && value <= '9') || value == '.' || value == '_' || value == '-')) {
      return false;
    }
  }
  return true;
}

inline bool replaceableBlock(const uint8_t* bytes) {
  bool blank = true;
  for (size_t i = 0; i < 16; ++i) if (bytes[i] != 0) blank = false;
  if (blank) return true;
  char mssv[17] = {};
  memcpy(mssv, bytes, 16);
  if (!isMssv(mssv)) return false;
  const size_t length = strlen(mssv);
  for (size_t i = length; i < 16; ++i) if (bytes[i] != 0) return false;
  return true;
}
