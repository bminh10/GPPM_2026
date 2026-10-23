#pragma once

#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <string>

constexpr int HIGH = 1;
constexpr int LOW = 0;
constexpr int OUTPUT = 1;
constexpr int INPUT_PULLUP = 2;

extern unsigned long mockTime;
extern int inputs[40];
extern int outputs[40];

inline unsigned long millis() { return mockTime; }
inline void delay(unsigned long value) { mockTime += value; }
inline void pinMode(uint8_t, int) {}
inline int digitalRead(uint8_t pin) { return inputs[pin]; }
inline void digitalWrite(uint8_t pin, int value) { outputs[pin] = value; }

struct MockSerial {
  std::string input;
  std::string output;
  void begin(unsigned long) {}
  int available() const { return static_cast<int>(input.size()); }
  char read() {
    const char next = input.front();
    input.erase(0, 1);
    return next;
  }
  void println(const char* text) { output += std::string(text) + "\n"; }
  template <typename... Args>
  void printf(const char* format, Args... args) {
    char buffer[512];
    std::snprintf(buffer, sizeof(buffer), format, args...);
    output += buffer;
  }
};

extern MockSerial Serial;
