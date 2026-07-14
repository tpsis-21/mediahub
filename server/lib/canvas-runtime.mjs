import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Bootstrap @napi-rs/canvas + ICU no Windows.
 * @param {{ rootDir: string, require: NodeRequire }} opts
 */
export const bootstrapCanvasRuntime = ({ rootDir, require }) => {
  const resolveCanvasIcuPath = () => {
    const fromEnv = typeof process.env.ICU_DATA === 'string' ? process.env.ICU_DATA.trim() : ''
    if (fromEnv && fs.existsSync(fromEnv)) return fromEnv
    try {
      const canvasPkg = require.resolve('@napi-rs/canvas/package.json')
      const pkgDir = path.dirname(canvasPkg)
      const candidate = path.join(pkgDir, 'icudtl.dat')
      if (fs.existsSync(candidate)) return candidate
    } catch {
      void 0
    }
    const nodeDirCandidate = path.join(path.dirname(process.execPath), 'icudtl.dat')
    if (fs.existsSync(nodeDirCandidate)) return nodeDirCandidate
    if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
      const findIcuByPrefix = (baseDir, prefix) => {
        try {
          if (!baseDir || !fs.existsSync(baseDir)) return ''
          const entries = fs
            .readdirSync(baseDir, { withFileTypes: true })
            .filter(
              (entry) =>
                entry && entry.isDirectory() && entry.name.toLowerCase().startsWith(prefix.toLowerCase()),
            )
            .map((entry) => entry.name)
            .sort((a, b) => (a > b ? -1 : 1))
          for (const name of entries) {
            const candidate = path.join(baseDir, name, 'icudtl.dat')
            if (fs.existsSync(candidate)) return candidate
          }
        } catch {
          void 0
        }
        return ''
      }
      const candidates = [
        path.join(localAppData, 'Programs', 'cursor', 'icudtl.dat'),
        path.join(localAppData, 'Programs', 'Cursor', 'icudtl.dat'),
      ]
      for (const candidate of candidates) {
        try {
          if (candidate && fs.existsSync(candidate)) return candidate
        } catch {
          void 0
        }
      }
      const dynamicCandidates = [
        findIcuByPrefix(path.join(localAppData, 'Discord'), 'app-'),
        findIcuByPrefix(path.join(localAppData, 'Programs', 'Microsoft VS Code'), ''),
        findIcuByPrefix(path.join(localAppData, 'Programs', 'Opera'), ''),
      ].filter(Boolean)
      for (const candidate of dynamicCandidates) {
        if (candidate && fs.existsSync(candidate)) return candidate
      }
    }
    return ''
  }

  const verifyCanvasRuntimeHealth = (icuPath) => {
    if (process.platform !== 'win32') return true
    if (!icuPath || !fs.existsSync(icuPath)) return false
    try {
      const script = [
        "const { createCanvas } = require('@napi-rs/canvas');",
        "const c = createCanvas(128, 128);",
        "const ctx = c.getContext('2d');",
        "ctx.fillStyle = '#111'; ctx.fillRect(0,0,128,128);",
        "ctx.font = '700 24px Arial';",
        "ctx.fillStyle = '#fff';",
        "ctx.fillText('OK', 12, 64);",
        'process.exit(0);',
      ].join(' ')
      const result = spawnSync(process.execPath, ['-e', script], {
        cwd: rootDir,
        env: { ...process.env, ICU_DATA: icuPath },
        encoding: 'utf8',
        timeout: 12000,
      })
      return result.status === 0
    } catch {
      return false
    }
  }

  const ensureCanvasIcuNearBinary = (icuPath) => {
    if (!icuPath || !fs.existsSync(icuPath)) return
    const targets = []
    try {
      const canvasNativePkg = require.resolve('@napi-rs/canvas-win32-x64-msvc/package.json')
      targets.push(path.join(path.dirname(canvasNativePkg), 'icudtl.dat'))
    } catch {
      void 0
    }
    targets.push(path.join(path.dirname(process.execPath), 'icudtl.dat'))
    for (const target of targets) {
      try {
        if (!target || fs.existsSync(target)) continue
        fs.copyFileSync(icuPath, target)
      } catch {
        void 0
      }
    }
  }

  const canvasIcuDataPath = resolveCanvasIcuPath()
  let isCanvasRuntimeHealthy = process.platform !== 'win32' || Boolean(canvasIcuDataPath)
  let hasWarnedCanvasRuntimeUnhealthy = false

  if (canvasIcuDataPath && !process.env.ICU_DATA) {
    process.env.ICU_DATA = canvasIcuDataPath
  }
  if (canvasIcuDataPath) {
    ensureCanvasIcuNearBinary(canvasIcuDataPath)
  }
  if (process.platform === 'win32' && isCanvasRuntimeHealthy) {
    isCanvasRuntimeHealthy = verifyCanvasRuntimeHealth(canvasIcuDataPath)
  }
  if (process.platform === 'win32') {
    if (canvasIcuDataPath) {
      console.log('[video-branding] ICU_DATA carregado para canvas:', canvasIcuDataPath)
    } else {
      console.warn('[video-branding] ICU_DATA não encontrado no Windows; fallback degradado será usado.')
    }
    if (!isCanvasRuntimeHealthy) {
      console.warn('[video-branding] Canvas desativado no Windows (healthcheck falhou). Usando fallback.')
    }
  }

  let createCanvas = (..._args) => {
    throw new Error('Canvas runtime indisponível.')
  }
  let GlobalFonts = {
    registerFromPath: () => false,
  }
  let loadImage = async () => {
    throw new Error('Canvas runtime indisponível.')
  }
  if (isCanvasRuntimeHealthy) {
    try {
      const canvasApi = require('@napi-rs/canvas')
      createCanvas = canvasApi.createCanvas
      GlobalFonts = canvasApi.GlobalFonts
      loadImage = canvasApi.loadImage
    } catch {
      isCanvasRuntimeHealthy = false
    }
  }

  return {
    canvasIcuDataPath,
    get isCanvasRuntimeHealthy() {
      return isCanvasRuntimeHealthy
    },
    set isCanvasRuntimeHealthy(value) {
      isCanvasRuntimeHealthy = Boolean(value)
    },
    get hasWarnedCanvasRuntimeUnhealthy() {
      return hasWarnedCanvasRuntimeUnhealthy
    },
    set hasWarnedCanvasRuntimeUnhealthy(value) {
      hasWarnedCanvasRuntimeUnhealthy = Boolean(value)
    },
    createCanvas,
    GlobalFonts,
    loadImage,
  }
}
