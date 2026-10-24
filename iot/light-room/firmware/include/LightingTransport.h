#pragma once

#include "LightConfig.h"

struct LightingSnapshot {
  bool on[LIGHT_COUNT];
  int revision[LIGHT_COUNT];
  unsigned long generation[LIGHT_COUNT];
};

using ReadLighting = LightingSnapshot (*)();
using ApplyLighting = void (*)(const LightingSnapshot&, const LightingSnapshot&);

inline bool lightingNeedsReport(const LightingSnapshot& current, const LightingSnapshot& sent) {
  for (size_t i = 0; i < LIGHT_COUNT; ++i) {
    if (current.on[i] != sent.on[i] || current.revision[i] != sent.revision[i] ||
        current.generation[i] != sent.generation[i]) return true;
  }
  return false;
}

void startLightingTransport(ReadLighting read, ApplyLighting apply);
void notifyLightingChanged();
void checkLightingTransport();

constexpr unsigned long NETWORK_STALL_MS = 60000;
inline bool lightingTransportStalled(unsigned long now, unsigned long progressAt) {
  return now - progressAt >= NETWORK_STALL_MS;
}
