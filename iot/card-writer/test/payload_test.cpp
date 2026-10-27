// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
#include <assert.h>
#include <stdio.h>
#include "../include/CardPayload.h"

int main() {
  assert(isMssv("2451010000"));
  assert(isMssv("2451019999"));
  assert(!isMssv("245101xxxx"));
  assert(!isMssv("245101123"));
  assert(!isMssv("24510112345"));
  assert(!isMssv("2451021234"));
  uint8_t bytes[16] = {};
  assert(replaceableBlock(bytes));
  memcpy(bytes, "2451010001", 10);
  assert(replaceableBlock(bytes));
  bytes[15] = 1;
  assert(!replaceableBlock(bytes));
  memset(bytes, 0xFF, 16);
  assert(!replaceableBlock(bytes));
  memset(bytes, 0, 16);
  memcpy(bytes, "OTHER DATA", 10);
  assert(!replaceableBlock(bytes));
  puts("PASS: MSSV format, leading zeros, blank/issued block and unrelated data protection.");
}
