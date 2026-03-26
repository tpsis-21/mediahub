/**
 * Libera a porta do Express (PORT no .env) antes de `npm run dev:api`.
 * Evita EADDRINUSE quando ficou um node antigo escutando.
 */
import { execSync } from 'node:child_process'
import { readEnvPort } from './read-env-port.mjs'

const port = readEnvPort()
const isWin = process.platform === 'win32'

if (isWin) {
  try {
    const cmd = `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`
    execSync(`powershell -NoProfile -NonInteractive -Command "${cmd}"`, {
      stdio: 'ignore',
      windowsHide: true,
    })
  } catch {
    void 0
  }
} else {
  try {
    const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null`, {
      encoding: 'utf8',
      shell: true,
    }).trim()
    if (!out) {
      // ok
    } else {
      const pids = [...new Set(out.split(/\n/).map((s) => Number(s.trim())).filter((n) => n > 0))]
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {
          void 0
        }
      }
    }
  } catch {
    void 0
  }
}

console.log(`[free-api-port] porta ${port} liberada (processo anterior encerrado, se existia).`)
