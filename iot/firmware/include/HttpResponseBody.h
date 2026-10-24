#pragma once

#include <Arduino.h>

enum class BodyResult { Complete, Timeout, Truncated, TooLarge };
constexpr unsigned long BODY_TIMEOUT_MS = 8000;
constexpr size_t MAX_BODY_BYTES = 16384;

template <typename Client>
BodyResult readResponseBody(Client& client, int expectedBytes, String& body) {
  if (expectedBytes > static_cast<int>(MAX_BODY_BYTES)) return BodyResult::TooLarge;
  const unsigned long started = millis();
  while (expectedBytes < 0 || body.length() < static_cast<size_t>(expectedBytes)) {
    if (millis() - started >= BODY_TIMEOUT_MS) return BodyResult::Timeout;
    if (client.available() > 0) {
      const int next = client.read();
      if (next >= 0) {
        if (body.length() >= MAX_BODY_BYTES) return BodyResult::TooLarge;
        body += static_cast<char>(next);
      }
    } else if (!client.connected()) {
      return expectedBytes < 0 ? BodyResult::Complete : BodyResult::Truncated;
    } else {
      delay(1);
    }
  }
  return BodyResult::Complete;
}
