// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
#define DEVICE_ID "test-device"
#define ROOM_ID "test-room"

#include <algorithm>
#include <cassert>
#include <iostream>

#include "Arduino.h"

unsigned long mockTime = 0;
int inputs[40];
int outputs[40];
MockSerial Serial;

#include "../../src/main.cpp"
#include "HttpResponseBody.h"

struct BodyClient {
  std::string data;
  bool open;
  BodyClient(const std::string& content, bool connected) : data(content), open(connected) {}
  int available() const { return static_cast<int>(data.size()); }
  bool connected() const { return open; }
  int read() {
    const unsigned char value = data.front();
    data.erase(0, 1);
    return value;
  }
};

int main() {
  assert(!lightingTransportStalled(59999, 0));
  assert(lightingTransportStalled(60000, 0));
  assert(!lightingTransportStalled(65000, 64000));
  const unsigned long nearWrap = ~0UL - 100;
  assert(!lightingTransportStalled(50, nearWrap));
  assert(lightingTransportStalled(60000, nearWrap));
  {
    String body;
    BodyClient client{"{}", true};
    assert(readResponseBody(client, 2, body) == BodyResult::Complete);
    assert(body == "{}");
    body.clear();
    client = {"{", true};
    const auto start = millis();
    assert(readResponseBody(client, 2, body) == BodyResult::Timeout);
    assert(millis() - start == BODY_TIMEOUT_MS);
    body.clear();
    client = {"{", false};
    assert(readResponseBody(client, 2, body) == BodyResult::Truncated);
    body.clear();
    client = {"{}", false};
    assert(readResponseBody(client, -1, body) == BodyResult::Complete);
    body.clear();
    client = {"", true};
    assert(readResponseBody(client, MAX_BODY_BYTES + 1, body) == BodyResult::TooLarge);
    client = {std::string(MAX_BODY_BYTES + 1, 'x'), true};
    assert(readResponseBody(client, -1, body) == BodyResult::TooLarge);
    body.clear();
    client = {"", true};
    assert(readResponseBody(client, 0, body) == BodyResult::Complete);
    body.clear();
    client = {"{}", true};
    assert(readResponseBody(client, 2, body) == BodyResult::Complete);
  }
  std::fill(inputs, inputs + 40, HIGH);
  setup();
  assert(outputs[18] == LOW && outputs[19] == LOW);

  handleCommand("light-1 on");
  assert(outputs[18] == HIGH && outputs[19] == LOW);
  handleCommand("light-2 on");
  handleCommand("light-1 off");
  assert(outputs[18] == LOW && outputs[19] == HIGH);
  handleCommand("light-2 toggle");
  assert(outputs[19] == LOW);

  Serial.output.clear();
  handleCommand("status");
  assert(Serial.output.find("\"device_id\":\"test-device\"") != std::string::npos);
  assert(Serial.output.find("\"light_id\":\"light-2\"") != std::string::npos);
  for (const char* invalid : {"missing on", "light-1 bad", "light-1 on extra"}) {
    Serial.output.clear();
    handleCommand(invalid);
    assert(Serial.output.find("ERROR:") == 0);
    assert(outputs[18] == LOW && outputs[19] == LOW);
  }

  Serial.input = "light-1 on\r\nlight-2 on\n";
  readCommands();
  assert(outputs[18] == HIGH && outputs[19] == HIGH);
  Serial.output.clear();
  Serial.input = std::string(90, 'x') + "\n";
  readCommands();
  assert(Serial.output.find("ERROR: command too long") == 0);

  inputs[25] = LOW;
  loop();
  mockTime += 10;
  inputs[25] = HIGH;
  loop();
  inputs[25] = LOW;
  loop();
  assert(outputs[18] == HIGH);
  mockTime += DEBOUNCE_MS;
  loop();
  assert(outputs[18] == LOW && outputs[19] == HIGH);
  mockTime += 100;
  loop();
  assert(outputs[18] == LOW);
  inputs[25] = HIGH;
  loop();
  mockTime += DEBOUNCE_MS;
  loop();
  inputs[25] = LOW;
  loop();
  mockTime += DEBOUNCE_MS;
  loop();
  assert(outputs[18] == HIGH);

  auto sent = readLighting();
  assert(!lightingNeedsReport(readLighting(), sent));
  auto remote = sent;
  remote.revision[0] = 5;
  remote.on[0] = false;
  applyLighting(remote, sent);
  assert(outputs[18] == LOW && readLighting().revision[0] == 5);
  assert(lightingNeedsReport(readLighting(), sent));
  sent = readLighting();
  assert(!lightingNeedsReport(readLighting(), sent));
  setLight(0, true);
  assert(lightingNeedsReport(readLighting(), sent));
  // An HTTP response in flight must not undo a newer physical button event.
  applyLighting(remote, sent);
  assert(outputs[18] == HIGH);
  remote.revision[0] = 6;
  applyLighting(remote, sent);
  assert(outputs[18] == LOW && readLighting().revision[0] == 6);
  remote.revision[0] = 4;
  remote.on[0] = true;
  applyLighting(remote, sent);
  assert(outputs[18] == LOW);
  sent = readLighting();
  setLight(0, true);
  setLight(0, false);
  assert(lightingNeedsReport(readLighting(), sent));
  sent = readLighting();
  remote = sent;
  ++remote.revision[1];
  assert(lightingNeedsReport(remote, sent));

  std::cout << "PASS: initial off, independent lights, serial commands, invalid input, "
               "debounce, held presses, remote revisions, immediate report detection "
               "in-flight button events, bounded HTTP body recovery and network stall detection\n";
}
