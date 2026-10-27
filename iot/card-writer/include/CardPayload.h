// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string.h>

inline bool isMssv(const char* text) {
  if (!text || strlen(text) != 10 || strncmp(text, "245101", 6) != 0) return false;
  for (size_t i = 0; i < 10; ++i) if (text[i] < '0' || text[i] > '9') return false;
  return true;
}

inline bool replaceableBlock(const uint8_t* bytes) {
  bool blank = true;
  for (size_t i = 0; i < 16; ++i) if (bytes[i] != 0) blank = false;
  if (blank) return true;
  char mssv[11] = {};
  memcpy(mssv, bytes, 10);
  if (!isMssv(mssv)) return false;
  for (size_t i = 10; i < 16; ++i) if (bytes[i] != 0) return false;
  return true;
}
