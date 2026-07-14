import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** Ferramentas de mídia: ffmpeg/yt-dlp, YouTube trailer helpers, temp cleanup. */

export const runProcess = async ({ command, args, cwd, timeoutMs }) => {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''

    const timer = typeof timeoutMs === 'number' && timeoutMs > 0
      ? setTimeout(() => child.kill('SIGKILL'), timeoutMs)
      : null

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })

    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolve({ code: typeof code === 'number' ? code : -1, stdout, stderr })
    })
  })
}

const FFMPEG_FONT_PATHS_REGULAR = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/TTF/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
  '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',
]

const FFMPEG_FONT_PATHS_BOLD = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf',
]

const firstReadableFontFile = (candidates) => {
  for (const p of candidates) {
    if (!p || typeof p !== 'string') continue
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
    } catch {
      // ignore
    }
  }
  return ''
}

const ffmpegFilterFontPath = (absPath) => String(absPath || '').replace(/\\/g, '/').replace(':', '\\:')

const copyFontToTmpForFfmpeg = (srcPath, destName, tmpDir) => {
  if (!srcPath || !tmpDir) return ''
  try {
    const dest = path.join(tmpDir, destName)
    fs.copyFileSync(srcPath, dest)
    return ffmpegFilterFontPath(dest)
  } catch {
    return ''
  }
}

/** Fontes TTF para video branding (Canvas + escapes do ffmpeg) em Linux/Docker sem só Debian paths. */
export const resolveVideoBrandingFonts = async (tmpDir) => {
  let fontFile = ''
  let fontBoldFile = ''
  const isWin = process.platform === 'win32'

  const envR = typeof process.env.VIDEO_BRANDING_FONT === 'string' ? process.env.VIDEO_BRANDING_FONT.trim() : ''
  const envB = typeof process.env.VIDEO_BRANDING_FONT_BOLD === 'string' ? process.env.VIDEO_BRANDING_FONT_BOLD.trim() : ''

  try {
    if (isWin) {
      const systemFontPath = 'C:\\Windows\\Fonts\\segoeui.ttf'
      const systemFontBoldPath = 'C:\\Windows\\Fonts\\segoeuib.ttf'
      const fallbackFontPath = 'C:\\Windows\\Fonts\\arial.ttf'
      const fallbackFontBoldPath = 'C:\\Windows\\Fonts\\arialbd.ttf'

      if (fs.existsSync(systemFontPath)) {
        fontFile = copyFontToTmpForFfmpeg(systemFontPath, 'vb-font.ttf', tmpDir)
      } else if (fs.existsSync(fallbackFontPath)) {
        fontFile = copyFontToTmpForFfmpeg(fallbackFontPath, 'vb-font.ttf', tmpDir)
      }

      if (fs.existsSync(systemFontBoldPath)) {
        fontBoldFile = copyFontToTmpForFfmpeg(systemFontBoldPath, 'vb-font-bold.ttf', tmpDir)
      } else if (fs.existsSync(fallbackFontBoldPath)) {
        fontBoldFile = copyFontToTmpForFfmpeg(fallbackFontBoldPath, 'vb-font-bold.ttf', tmpDir)
      } else {
        fontBoldFile = fontFile
      }
      return { fontFile, fontBoldFile }
    }

    let regSrc = envR && fs.existsSync(envR) ? envR : ''
    let boldSrc = envB && fs.existsSync(envB) ? envB : ''

    if (!regSrc) {
      try {
        const fm = await runProcess({ command: 'fc-match', args: ['-f', '%{file}', 'DejaVu Sans'], timeoutMs: 5000 })
        if (fm.code === 0) {
          const fp = fm.stdout.trim().split(/\n/)[0]?.trim()
          if (fp && fs.existsSync(fp)) regSrc = fp
        }
      } catch {
        // ignore
      }
    }
    if (!boldSrc) {
      try {
        const fmB = await runProcess({ command: 'fc-match', args: ['-f', '%{file}', 'DejaVu Sans Bold'], timeoutMs: 5000 })
        if (fmB.code === 0) {
          const fp = fmB.stdout.trim().split(/\n/)[0]?.trim()
          if (fp && fs.existsSync(fp)) boldSrc = fp
        }
      } catch {
        // ignore
      }
    }

    if (!regSrc) regSrc = firstReadableFontFile(FFMPEG_FONT_PATHS_REGULAR)
    if (!boldSrc) boldSrc = firstReadableFontFile(FFMPEG_FONT_PATHS_BOLD)

    fontFile = copyFontToTmpForFfmpeg(regSrc, 'vb-font.ttf', tmpDir)
    fontBoldFile = copyFontToTmpForFfmpeg(boldSrc, 'vb-font-bold.ttf', tmpDir)
    if (!fontBoldFile && fontFile) fontBoldFile = fontFile
    if (!fontFile && fontBoldFile) fontFile = fontBoldFile
  } catch (e) {
    console.error('video-branding: font resolve failed', e)
  }

  return { fontFile, fontBoldFile }
}

export const hasBinary = async (name, args) => {
  try {
    const result = await runProcess({ command: name, args, timeoutMs: 12000 })
    return result.code === 0
  } catch {
    return false
  }
}

const safeRequire = (id) => {
  try {
    return require(id)
  } catch {
    return null
  }
}

const safeResolve = (id) => {
  try {
    return require.resolve(id)
  } catch {
    return ''
  }
}

export const resolveFfmpegCommand = () => {
  const envPath = typeof process.env.FFMPEG_PATH === 'string' ? process.env.FFMPEG_PATH.trim() : ''
  if (envPath) return envPath
  const resolved = safeRequire('ffmpeg-static')
  return typeof resolved === 'string' && resolved.trim() ? resolved.trim() : 'ffmpeg'
}

export const resolveYtdl = () => {
  const resolved = safeRequire('ytdl-core')
  return resolved && typeof resolved === 'function' ? resolved : null
}

export const resolveYtdlpExec = () => {
  const resolved = safeRequire('youtube-dl-exec')
  if (resolved && typeof resolved === 'function') return resolved
  if (resolved && typeof resolved === 'object' && typeof resolved.default === 'function') return resolved.default
  return null
}

export const resolveBundledYtdlpCommand = () => {
  const filename = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  const candidates = []
  candidates.push(path.join(process.cwd(), 'server', 'bin', filename))
  const pkgPath = safeResolve('youtube-dl-exec/package.json')
  if (pkgPath) {
    candidates.push(path.join(path.dirname(pkgPath), 'bin', filename))
  }
  const modPath = safeResolve('youtube-dl-exec')
  if (modPath) {
    candidates.push(path.join(path.dirname(modPath), '..', 'bin', filename))
  }
  candidates.push(path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', filename))

  for (const fullPath of candidates) {
    if (fullPath && fs.existsSync(fullPath)) return fullPath
  }
  return null
}

export const isYouTubeTrailerUrl = (value) => {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = url.pathname.replace(/^\//, '').trim()
      return Boolean(id)
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      return url.pathname === '/watch' && Boolean(url.searchParams.get('v'))
    }
    return false
  } catch {
    return false
  }
}

export const isYouTubeTrailerId = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return false
  return /^[a-zA-Z0-9_-]{6,32}$/.test(raw)
}

export const buildYouTubeTrailerUrlFromId = (id) => {
  const raw = String(id || '').trim()
  if (!raw) return ''
  return `https://www.youtube.com/watch?v=${raw}`
}

export const stripYouTubeUrlsFromText = (value) => {
  const raw = String(value || '')
  const stripped = raw.replace(
    /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[^\s]+|m\.youtube\.com\/watch\?v=[^\s]+|youtu\.be\/[^\s]+)[^\s]*/gi,
    ''
  )
  return stripped.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export const resolveTrailerUrlFromProvider = async ({
  mediaType,
  id,
  userKey,
  fetchSearchProviderJson,
  getSearchProviderSettingsKeys,
  uniqStrings,
}) => {
  if (typeof fetchSearchProviderJson !== 'function') {
    throw new Error('fetchSearchProviderJson é obrigatório')
  }
  if (typeof getSearchProviderSettingsKeys !== 'function') {
    throw new Error('getSearchProviderSettingsKeys é obrigatório')
  }
  if (typeof uniqStrings !== 'function') {
    throw new Error('uniqStrings é obrigatório')
  }
  if (!Number.isFinite(id) || id <= 0) return ''
  const settingsKeys = await getSearchProviderSettingsKeys()
  const apiKeys = uniqStrings([userKey, ...settingsKeys])
  if (apiKeys.length === 0) return ''

  const pickBestTrailerId = (videos) => {
    const normalized = Array.isArray(videos)
      ? videos
          .map((video) => ({
            key: typeof video?.key === 'string' ? video.key.trim() : '',
            site: typeof video?.site === 'string' ? video.site.trim().toLowerCase() : '',
            type: typeof video?.type === 'string' ? video.type.trim().toLowerCase() : '',
            name: typeof video?.name === 'string' ? video.name.trim().toLowerCase() : '',
          }))
          .filter((video) => video.site === 'youtube' && isYouTubeTrailerId(video.key))
      : []
    if (normalized.length === 0) return ''

    const scored = normalized
      .map((video) => {
        let score = 0
        if (video.type === 'trailer') score += 100
        else if (video.type === 'teaser') score += 70
        else if (video.type === 'clip') score += 55
        else if (video.type === 'featurette') score += 45
        else score += 20
        if (video.name.includes('official') || video.name.includes('oficial')) score += 20
        if (video.name.includes('trailer')) score += 10
        if (video.name.includes('teaser')) score += 6
        return { key: video.key, score }
      })
      .sort((a, b) => b.score - a.score)
    return scored[0]?.key || ''
  }

  const languages = ['pt-BR', 'en-US']
  for (const language of languages) {
    try {
      const payload = await fetchSearchProviderJson({
        path: `/${mediaType}/${id}/videos`,
        params: { language },
        apiKeys,
      })
      const trailerId = pickBestTrailerId(payload?.results)
      if (trailerId) return buildYouTubeTrailerUrlFromId(trailerId)
    } catch {
      // tenta próximo idioma
    }
  }
  try {
    const payload = await fetchSearchProviderJson({
      path: `/${mediaType}/${id}/videos`,
      params: {},
      apiKeys,
    })
    const trailerId = pickBestTrailerId(payload?.results)
    if (trailerId) return buildYouTubeTrailerUrlFromId(trailerId)
  } catch {
    // sem fallback extra
  }
  return ''
}

export const downloadToFile = async ({ stream, filePath, timeoutMs }) => {
  return await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(filePath)
    const timer = typeof timeoutMs === 'number' && timeoutMs > 0
      ? setTimeout(() => {
          try {
            stream.destroy(new Error('timeout'))
          } catch {
            // ignore
          }
          try {
            out.destroy(new Error('timeout'))
          } catch {
            // ignore
          }
        }, timeoutMs)
      : null

    const done = (err) => {
      if (timer) clearTimeout(timer)
      if (err) reject(err)
      else resolve()
    }

    out.on('finish', () => done())
    out.on('error', done)
    stream.on('error', done)
    stream.pipe(out)
  })
}

export const escapeFfmpegText = (value) =>
  String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/'/g, "\\'")
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')

export const escapeFfmpegPath = (value) =>
  String(value || '')
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")

export const resolveFfmpegDrawtextFont = () => {
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Windows\\Fonts\\segoeui.ttf',
        'C:\\Windows\\Fonts\\arial.ttf',
      ]
    : [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
      ]
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      void 0
    }
  }
  return ''
}

export const safeRm = (targetPath) => {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

export const cleanupStaleTempFiles = () => {
  try {
    const tmpRoot = os.tmpdir()
    const entries = fs.readdirSync(tmpRoot, { withFileTypes: true })
    const now = Date.now()
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const name = entry.name
      const isMediahub = name.startsWith('mediahub-')
      const isPyInstaller = name.startsWith('_MEI')
      if (!isMediahub && !isPyInstaller) continue
      const fullPath = path.join(tmpRoot, name)
      let stale = true
      try {
        const stat = fs.statSync(fullPath)
        stale = now - stat.mtimeMs > 15 * 60_000
      } catch {
        stale = true
      }
      if (stale) safeRm(fullPath)
    }
  } catch {
    // ignore
  }
}

