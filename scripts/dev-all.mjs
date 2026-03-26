/**
 * Sobe API + Vite num único comando (dev local).
 * Espera /api/health na porta do .env antes de iniciar o Vite (evita "Failed to fetch" nos primeiros segundos).
 */
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readEnvPort } from './read-env-port.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const apiPort = readEnvPort()
const vitePort = Number(process.env.VITE_PORT || 5173)

const common = {
  cwd: root,
  stdio: 'inherit',
  shell: isWin,
  env: { ...process.env, FORCE_COLOR: '1' },
}

const freeApiPortNow = () => {
  try {
    execFileSync(process.execPath, [join(root, 'scripts', 'free-api-port.mjs')], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, PORT: String(apiPort) },
    })
  } catch {
    void 0
  }
}

const freePortNow = (port) => {
  if (!Number.isFinite(port) || port <= 0) return
  try {
    execFileSync(process.execPath, [join(root, 'scripts', 'free-api-port.mjs')], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, PORT: String(port) },
    })
  } catch {
    void 0
  }
}

const waitForApiHealth = async () => {
  const url = `http://127.0.0.1:${apiPort}/api/health`
  const deadline = Date.now() + 90_000
  let lastLog = 0
  console.log(`[dev:all] Aguardando API em ${url} …`)
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        console.log('[dev:all] API respondeu. Iniciando Vite…')
        return true
      }
    } catch {
      void 0
    }
    if (Date.now() - lastLog > 8000) {
      console.log(`[dev:all] Ainda aguardando API na porta ${apiPort}… (confira o terminal da API: DATABASE_URL, JWT_SECRET, etc.)`)
      lastLog = Date.now()
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  console.warn(
    `[dev:all] API não respondeu em 90s (${url}). Subindo o Vite mesmo assim — chamadas /api podem falhar até a API subir.`
  )
  return false
}

/**
 * Evita corrida: se existir API antiga na porta, libera antes de subir a nova.
 * Assim o health-check passa na instância certa e não há janela de ECONNREFUSED.
 */
freeApiPortNow()
const api = spawn(process.execPath, ['--env-file=.env', 'server/server.mjs'], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, FORCE_COLOR: '1' },
})

await waitForApiHealth()

freePortNow(vitePort)
const vite = spawn(process.execPath, [
  join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
  '--host',
  '::',
  '--port',
  String(vitePort),
  '--strictPort',
], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, FORCE_COLOR: '1' },
})

let shuttingDown = false
const shutdown = () => {
  if (shuttingDown) return
  shuttingDown = true
  try {
    api.kill()
  } catch {
    void 0
  }
  try {
    vite.kill()
  } catch {
    void 0
  }
}

process.on('SIGINT', () => {
  shutdown()
  process.exit(0)
})
process.on('SIGTERM', () => {
  shutdown()
  process.exit(0)
})

api.on('exit', (code) => {
  if (shuttingDown) return
  console.error(`[dev:all] API encerrou (código ${code}). Encerrando Vite…`)
  try {
    vite.kill()
  } catch {
    void 0
  }
  process.exit(typeof code === 'number' && code !== 0 ? code : 0)
})

vite.on('exit', (code) => {
  if (shuttingDown) return
  console.error(`[dev:all] Vite encerrou (código ${code}). Encerrando API…`)
  try {
    api.kill()
  } catch {
    void 0
  }
  process.exit(typeof code === 'number' && code !== 0 ? code : 0)
})
