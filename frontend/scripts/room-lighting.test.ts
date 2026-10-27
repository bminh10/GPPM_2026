// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { booleanPointInPolygon, point, polygon } from '@turf/turf'
import { parseRoomLights, placeRoomLights } from '../src/data/roomLighting.ts'
import { createDevicePlan, readRoomCollection } from './create-lighting-device.ts'
import type { RoomLight } from '../src/data/roomLighting.ts'
import campusSources from '../src/data/campusSources.json' with { type: 'json' }
import type { LngLat } from '../src/data/campusData.ts'

const square: LngLat[] = [[0, 0], [1, 0], [1, 1], [0, 1]]

test('every current room has exactly two distinct lights inside its polygon', async () => {
  const counts: Record<string, number> = {}
  for (const campus of campusSources) {
    const collection = await readRoomCollection(
      fileURLToPath(new URL(`../src/data/${campus.directory}/room-3d.geojson`, import.meta.url)),
    )
    const rooms = collection.features.filter((feature) => feature.properties.kind === 'room')
    const ids = new Set()
    counts[campus.id] = rooms.length
    for (const room of rooms) {
      assert.ok(!ids.has(room.properties.id), `Duplicate room: ${campus.id}/${room.properties.id}`)
      ids.add(room.properties.id)
      const boundary = room.geometry.coordinates[0].slice(0, -1).map(
        ([lng, lat]): LngLat => [lng, lat],
      )
      const lights = parseRoomLights(room.properties.lights, room.properties.id, boundary)
      assert.equal(lights.length, 2, `${campus.id}/${room.properties.id}`)
      assert.equal(new Set(lights.map((light) => light.id)).size, 2)
      assert.equal(new Set(lights.map((light) => light.position.join(','))).size, 2)
      for (const light of lights) {
        assert.ok(booleanPointInPolygon(point(light.position), room.geometry, { ignoreBoundary: true }))
      }
    }
  }
  console.log('Validated room counts:', counts)
})

test('explicit empty list and custom lights override defaults; invalid data is rejected', () => {
  assert.deepEqual(parseRoomLights([], 'empty', square), [])
  const custom: RoomLight[] = [{ id: 'custom', name: 'Custom', position: [0.2, 0.8] }]
  assert.deepEqual(parseRoomLights(custom, 'custom', square), custom)
  assert.throws(() => parseRoomLights(null, 'invalid', square), /must be an array/)
  assert.throws(() => parseRoomLights([...custom, ...custom], 'duplicate', square), /duplicate/)
  assert.throws(() => parseRoomLights([{ ...custom[0], position: [2, 2] }], 'outside', square), /inside/)
})

test('placement supports concave rooms and configurable light counts', () => {
  const boundary: LngLat[] = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]]
  const lights = placeRoomLights(
    Array.from({ length: 3 }, (_, index) => ({ id: `light-${index}`, name: 'Light' })),
    boundary,
  )
  assert.equal(lights.length, 3)
  assert.equal(new Set(lights.map((light) => light.position.join(','))).size, 3)
  for (const light of lights) {
    assert.ok(booleanPointInPolygon(point(light.position), polygon([[...boundary, boundary[0]]]), { ignoreBoundary: true }))
  }
  assert.throws(() => placeRoomLights([{ id: 'bad', name: 'Bad', offset: [2, 0.5] }], square), /offset/)
})

test('generated projects agree on room, device, light IDs and GPIOs without touching DB', async () => {
  for (const [campus, room] of [['CS1', 'A121'], ['CS3', 'B101']]) {
    const plan = await createDevicePlan(campus, room, `${campus}-${room}`.toLowerCase())
    assert.equal(plan.device.campusId, campus)
    assert.equal(plan.device.roomId, room)
    assert.deepEqual(plan.device.lightIds, ['light-1', 'light-2'])
    assert.ok(plan.files['platformio.ini'].includes(plan.device.deviceId))
    assert.ok(plan.files['platformio.ini'].includes(`ROOM_ID=\\"${room}\\"`))
    assert.deepEqual(JSON.parse(plan.files['device.json']), plan.device)
    const diagram = JSON.parse(plan.files['diagram.json']) as {
      parts: { type: string; attrs: { label?: string } }[]
    }
    for (const id of plan.device.lightIds) {
      assert.ok(plan.files['DeviceLights.h'].includes(`"${id}"`))
      assert.ok(diagram.parts.some((part) => part.attrs.label === `${room} - ${id}`))
    }
    assert.equal(diagram.parts.filter((part) => part.type === 'wokwi-led').length, 2)
  }
  await assert.rejects(createDevicePlan('CS3', 'missing', 'missing'), /exactly one room/)
  await assert.rejects(createDevicePlan('unknown', 'B101', 'unknown'), /Unknown campus/)
  await assert.rejects(createDevicePlan('CS3', 'B101', '..'), /IDs must/)
})
