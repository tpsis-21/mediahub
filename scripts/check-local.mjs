/**
 * Checklist local que roda SEM `.env` / SEM API.
 * Uso: npm run check:local
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const hasEnv = fs.existsSync(path.join(root, '.env'))

const steps = [
  { name: 'vitest', cmd: 'npm', args: ['test'] },
  { name: 'tsc', cmd: 'npx', args: ['tsc', '-p', 'tsconfig.json', '--noEmit'] },
  { name: 'tsc-lib-strict', cmd: 'npm', args: ['run', 'typecheck:lib'] },
  { name: 'lint', cmd: 'npm', args: ['run', 'lint'] },
  { name: 'build', cmd: 'npm', args: ['run', 'build'] },
  { name: 'e2e-spa', cmd: 'npm', args: ['run', 'test:e2e'] },
]

console.log('check:local — suite sem depender de SMOKE_* / .env da API')
console.log(`.env presente: ${hasEnv ? 'sim' : 'não (API/smoke HTTP ficam para depois)'}`)
console.log('')

let failed = 0
for (const step of steps) {
  console.log(`→ ${step.name}`)
  const result = spawnSync(step.cmd, step.args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
  const code = typeof result.status === 'number' ? result.status : 1
  if (code !== 0) {
    failed += 1
    console.error(`FAIL ${step.name} (exit ${code})`)
  } else {
    console.log(`OK   ${step.name}`)
  }
  console.log('')
}

if (!hasEnv) {
  console.log('Próximo (quando tiver Postgres): copie .env.example → .env, npm run dev:api,')
  console.log('depois no terminal: $env:SMOKE_API_BASE_URL="http://127.0.0.1:8081"; npm run smoke:staging')
}

process.exit(failed > 0 ? 1 : 0)
