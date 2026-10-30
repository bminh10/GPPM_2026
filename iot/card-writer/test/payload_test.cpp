// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
#include <assert.h>
#include <stdio.h>
#include "../include/CardPayload.h"

int main() {
  assert(isMssv("2451010000"));
  assert(isMssv("SV-A_2026"));
  assert(isMssv("1234567890123456"));
  assert(!isMssv(""));
  assert(!isMssv("12345678901234567"));
  assert(!isMssv("HAS SPACE"));
  uint8_t bytes[16] = {};
  assert(replaceableBlock(bytes));
  memcpy(bytes, "2451010001", 10);
  assert(replaceableBlock(bytes));
  memset(bytes, 0, sizeof(bytes));
  memcpy(bytes, "SV-A_2026", 9);
  assert(replaceableBlock(bytes));
  bytes[15] = 1;
  assert(!replaceableBlock(bytes));
  memset(bytes, 0xFF, 16);
  assert(!replaceableBlock(bytes));
  memset(bytes, 0, 16);
  memcpy(bytes, "OTHER DATA", 10);
  assert(!replaceableBlock(bytes));
  puts("PASS: MSSV format, blank/issued block and unrelated data protection.");
}
