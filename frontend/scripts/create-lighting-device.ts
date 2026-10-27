// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { parseRoomLights } from '../src/data/roomLighting.ts'
import type { FeatureCollection, Polygon } from 'geojson'
import campusSources from '../src/data/campusSources.json' with { type: 'json' }
import defaults from '../src/data/lightingDefaults.json' with { type: 'json' }
import { parseRoomGeoJSON } from '../src/data/buildingGeoJSON.ts'

type RoomProperties = { kind?: string; id: string; lights?: unknown }
export type RoomCollection = FeatureCollection<Polygon, RoomProperties>
export type DevicePlan = {
  project: string
  device: { deviceId: string; campusId: string; roomId: string; lightIds: string[] }
  files: Record<string, string>
}

export async function readRoomCollection(filename: string): Promise<RoomCollection> {
  const source = await readFile(filename, 'utf8')
  parseRoomGeoJSON(source)
  return JSON.parse(source) as RoomCollection
}

const repo = fileURLToPath(new URL('..\\..\\', import.meta.url))
const dataDirectory = path.join(repo, 'frontend', 'src', 'data')

export async function createDevicePlan(campusId: string, roomId: string, project: string): Promise<DevicePlan> {
  for (const value of [campusId, roomId, project]) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) {
      throw new Error('Campus, room and project IDs must contain only letters, digits, hyphens or underscores')
    }
  }
  const campus = campusSources.find((entry) => entry.id === campusId)
  if (!campus) throw new Error(`Unknown campus: ${campusId}`)
  const collection = await readRoomCollection(path.join(dataDirectory, campus.directory, 'room-3d.geojson'))
  const matches = collection.features.filter(
    (feature) => feature.properties.kind === 'room' && feature.properties.id === roomId,
  )
  if (matches.length !== 1) throw new Error(`Expected exactly one room ${campusId}/${roomId}, found ${matches.length}`)
  const room = matches[0]
  const configured = room.properties.lights ?? defaults.lights
  const boundary = room.geometry.coordinates[0].slice(0, -1).map(
    ([lng, lat]): [number, number] => [lng, lat],
  )
  const lights = parseRoomLights(room.properties.lights, roomId, boundary)
  if (!lights.length) throw new Error(`Room ${roomId} has no configured lights`)
  if (!Array.isArray(configured)) throw new Error('Room lights must be an array')
  const usedPins = new Set<number>()
  const usablePins = new Set([4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33])
  const wiring = lights.map((light) => {
    const entry: unknown = configured.find(
      (item: unknown) => typeof item === 'object' && item !== null && 'id' in item && item.id === light.id,
    )
    const fallback = defaults.lights.find((item) => item.id === light.id)
    const ledPin = typeof entry === 'object' && entry !== null && 'ledPin' in entry
      ? entry.ledPin ?? fallback?.ledPin : fallback?.ledPin
    const buttonPin = typeof entry === 'object' && entry !== null && 'buttonPin' in entry
      ? entry.buttonPin ?? fallback?.buttonPin : fallback?.buttonPin
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(light.id)) throw new Error(`Invalid firmware light ID: ${light.id}`)
    for (const pin of [ledPin, buttonPin]) {
      if (typeof pin !== 'number' || !usablePins.has(pin) || usedPins.has(pin)) throw new Error(`Missing, unsupported or duplicate GPIO for ${light.id}: ${String(pin)}`)
      usedPins.add(pin)
    }
    return { ...light, ledPin, buttonPin }
  })
  const device = {
    deviceId: `esp32-${project}`, campusId, roomId, lightIds: wiring.map((light) => light.id),
  }
  if (device.deviceId.length > 80) throw new Error('Device ID exceeds backend limit of 80 characters')
  const diagram = {
    version: 1, author: 'CampusOpt', editor: 'wokwi',
    parts: [
      { type: 'board-esp32-devkit-c-v4', id: 'esp', top: 0, left: 0, attrs: {} },
      ...wiring.flatMap((light, index) => [
        { type: 'wokwi-led', id: `light${index}`, top: index * 110 - 50, left: 230, attrs: { color: 'yellow', label: `${roomId} - ${light.id}` } },
        { type: 'wokwi-resistor', id: `r${index}`, top: index * 110, left: 180, attrs: { value: '220' } },
        { type: 'wokwi-pushbutton', id: `button${index}`, top: index * 110, left: -150, attrs: { color: 'green', label: `Toggle ${light.id}` } },
      ]),
    ],
    connections: [
      ...wiring.flatMap((light, index) => [
        [`esp:${light.ledPin}`, `r${index}:1`, 'orange', []],
        [`r${index}:2`, `light${index}:A`, 'orange', []],
        [`light${index}:C`, 'esp:GND.1', 'black', []],
        [`esp:${light.buttonPin}`, `button${index}:1.l`, 'green', []],
        [`button${index}:2.l`, 'esp:GND.2', 'black', []],
      ]),
      ['esp:TX', '$serialMonitor:RX', '', []],
      ['esp:RX', '$serialMonitor:TX', '', []],
    ],
    dependencies: {},
  }
  return {
    project, device,
    files: {
      'device.json': JSON.stringify(device, null, 2) + '\n',
      'diagram.json': JSON.stringify(diagram, null, 2) + '\n',
      'DeviceLights.h': '// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.\n#pragma once\n\nconstexpr LightConfig LIGHTS[] = {\n' +
        wiring.map((light) => `    {"${light.id}", ${light.ledPin}, ${light.buttonPin}},`).join('\n') + '\n};\n',
      'platformio.ini': `; Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
[platformio]
src_dir = ../firmware/src
include_dir = ../firmware/include
extra_configs = ../platformio-common.ini
default_envs = esp32

[env:esp32]
build_flags =
    -I .
    -D DEVICE_ID=\\"${device.deviceId}\\"
    -D ROOM_ID=\\"${roomId}\\"
`,
      'wokwi.toml': '[wokwi]\nversion = 1\nfirmware = ".pio/build/esp32/firmware.bin"\nelf = ".pio/build/esp32/firmware.elf"\n',
    },
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    campus: { type: 'string' }, room: { type: 'string' }, project: { type: 'string' },
    write: { type: 'boolean', default: false },
  } })
  if (!values.campus || !values.room) throw new Error('Usage: node scripts\\create-lighting-device.ts --campus CS3 --room B101 [--project cs3-b101] [--write]')
  const project = values.project ?? `${values.campus}-${values.room}`.toLowerCase()
  const plan = await createDevicePlan(values.campus, values.room, project)
  if (values.write) {
    const directory = path.join(repo, 'iot', 'light-room', project)
    await mkdir(directory)
    for (const [filename, content] of Object.entries(plan.files)) {
      await writeFile(path.join(directory, filename), content, { flag: 'wx' })
    }
    console.log(`Created ${directory}. No database changes or credentials created.`)
  } else {
    console.log('Preview only; pass --write to create the project. No database changes.')
  }
  console.log(JSON.stringify(plan.device, null, 2))
  console.log(`From repository root: .\\iot\\configure-device.ps1 -Project ${project}`)
}
