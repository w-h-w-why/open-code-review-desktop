#!/usr/bin/env node
// Generates src/shared/providers.json from the OpenCodeReview provider registry.
// Usage: node scripts/gen-providers.mjs <path-to-providers.go>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const sourcePath = process.argv[2]
if (!sourcePath) {
  console.error('usage: node scripts/gen-providers.mjs <providers.go>')
  process.exit(1)
}

const source = readFileSync(sourcePath, 'utf8')
const lines = source.split(/\r?\n/)
const providers = []
let current = null
let modelMode = false

const field = (line, name) => {
  const m = line.match(new RegExp(`${name}:\\s*(?:\\[\\]string\\{)?\\s*"([^"]*)"`))
  return m ? m[1] : undefined
}
const boolField = (line, name) => new RegExp(`${name}:\\s*true`).test(line)

for (const raw of lines) {
  const line = raw.trim()
  if (line === '{' || line === '{,' || line === '{') {
    if (!current) current = { name: '', displayName: '', protocol: '', models: [] }
    continue
  }
  if (line.startsWith('Name:') && current && !current.name) {
    current.name = field(line, 'Name') ?? ''
  }
  if (line.startsWith('DisplayName:')) current.displayName = field(line, 'DisplayName') ?? ''
  if (line.startsWith('Protocol:')) {
    const m = line.match(/Protocol:\s*(\w+)/)
    current.protocol = m ? m[1] : ''
  }
  if (line.startsWith('BaseURL:')) current.baseURL = field(line, 'BaseURL')
  if (line.startsWith('EnvVar:')) current.envVar = field(line, 'EnvVar')
  if (line.startsWith('AuthHeader:')) current.authHeader = field(line, 'AuthHeader')
  if (boolField(line, 'AmbientAuth')) current.ambientAuth = true
  if (boolField(line, 'ExternalAuth')) current.externalAuth = true
  if (line.startsWith('Models: []string{')) {
    modelMode = !line.includes('}')
    if (!modelMode) current.models = []
    continue
  }
  if (modelMode) {
    if (line.startsWith('}')) {
      modelMode = false
      continue
    }
    const m = line.match(/"([^"]+)"/)
    if (m) current.models.push(m[1])
  }
  if (line === '},' && current && current.name) {
    providers.push(current)
    current = null
    continue
  }
}

const protocolValues = {
  ProtocolAnthropic: 'anthropic',
  ProtocolOpenAIChatCompletions: 'openai',
  ProtocolOpenAIResponses: 'openai-responses',
  ProtocolAnthropicBedrock: 'anthropic-bedrock'
}
for (const p of providers) {
  p.protocol = protocolValues[p.protocol] ?? p.protocol
  delete p.authHeader
}

mkdirSync(resolve(root, 'src/shared'), { recursive: true })
writeFileSync(resolve(root, 'src/shared/providers.json'), JSON.stringify(providers, null, 2) + '\n')
console.log(`wrote ${providers.length} providers`)
