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

int main() {
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
               "and in-flight button events\n";
}
