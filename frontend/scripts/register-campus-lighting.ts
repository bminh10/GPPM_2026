// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import campusSources from '../src/data/campusSources.json' with { type: 'json' }
import { createDevicePlan, readRoomCollection } from './create-lighting-device.ts'
import type { DevicePlan } from './create-lighting-device.ts'

const repo = fileURLToPath(new URL('..\\..\\', import.meta.url))
const { values } = parseArgs({ options: { write: { type: 'boolean', default: false } } })
const plans: DevicePlan[] = []
const addresses = new Set<string>()
for (const campus of campusSources) {
  const collection = await readRoomCollection(
    path.join(repo, 'frontend', 'src', 'data', campus.directory, 'room-3d.geojson'),
  )
  for (const feature of collection.features.filter((entry) => entry.properties.kind === 'room')) {
    const room = feature.properties.id
    const plan = await createDevicePlan(campus.id, room, `${campus.id}-${room}`.toLowerCase())
    if (addresses.has(plan.device.deviceId)) throw new Error(`Duplicate device: ${plan.device.deviceId}`)
    addresses.add(plan.device.deviceId)
    plans.push(plan)
  }
}
console.log(`Validated ${plans.length} devices, ${plans.reduce((sum, plan) => sum + plan.device.lightIds.length, 0)} lights.`)
if (values.write) {
  // Persist the private key before DB registration so a failed run can resume without rotating it.
  for (const [index, plan] of plans.entries()) {
    const directory = path.join(repo, 'iot', 'light-room', plan.project)
    await mkdir(directory, { recursive: true })
    for (const [filename, content] of Object.entries(plan.files)) {
      const target = path.join(directory, filename)
      try {
        await writeFile(target, content, { flag: 'wx' })
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
        if (await readFile(target, 'utf8') !== content) throw new Error(`Existing project differs: ${target}`, { cause: error })
      }
    }
    const headerPath = path.join(directory, 'DeviceLocal.h')
    const key = randomBytes(32).toString('base64')
    try {
      await writeFile(headerPath, `#pragma once
#define LIGHTING_API_URL "http://host.wokwi.internal:8000"
#define LIGHTING_DEVICE_KEY "${key}"
#define LIGHTING_ALLOW_LOCAL_HTTP true
#define LIGHTING_ROOT_CA ""
`, { flag: 'wx' })
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
    }
    const header = await readFile(headerPath, 'utf8')
    const savedKey = /^#define LIGHTING_DEVICE_KEY "([^"]+)"\r?$/m.exec(header)?.[1]
    if (!savedKey || savedKey.length < 32) throw new Error(`Invalid private configuration: ${headerPath}`)
    const result = spawnSync('python', [
      '-m', 'app.lighting.provision',
      '--device', plan.device.deviceId, '--campus', plan.device.campusId, '--room', plan.device.roomId,
      '--key-env', 'CAMPUSOPT_PROVISION_KEY', '--preserve-existing',
      ...plan.device.lightIds.flatMap((id) => ['--light', id]),
    ], {
      cwd: path.join(repo, 'backend'),
      env: { ...process.env, CAMPUSOPT_PROVISION_KEY: savedKey, PYTHONIOENCODING: 'utf-8' },
      stdio: 'inherit',
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`Registration stopped at ${plan.project}; existing keys were not rotated. Fix the error and rerun.`)
    console.log(`[${index + 1}/${plans.length}] ${plan.device.campusId}/${plan.device.roomId}`)
  }
  console.log('Registration complete. Build and start selected Wokwi projects to bring devices online.')
} else {
  console.log('Preview only. Pass --write to generate projects and register against the configured backend database.')
}
