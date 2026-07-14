import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Vídeo / trailer branding + download + proxy de assets.
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerVideoRoutes = (app, deps) => {
  const {
    buildYouTubeTrailerUrlFromId,
    cleanupStaleTempFiles,
    createCanvas,
    downloadToFile,
    escapeFfmpegPath,
    escapeFfmpegText,
    fetchSearchProviderJson,
    getSearchProviderImageBaseUrl,
    getSearchProviderSettingsKeys,
    hasBinary,
    isCanvasRuntimeHealthy,
    GlobalFonts,
    isYouTubeTrailerId,
    isYouTubeTrailerUrl,
    loadImage,
    query,
    rateLimitVideo,
    readOptionalAuthUserContext,
    requireAuth,
    requirePremiumOrAdmin,
    resolveBundledYtdlpCommand,
    resolveFfmpegCommand,
    resolveFfmpegDrawtextFont,
    resolveTrailerUrlFromProvider,
    resolveVideoBrandingFonts,
    resolveYtdl,
    resolveYtdlpExec,
    runProcess,
    safeRm,
    uniqStrings,
    isSafeExternalHttpUrl,
  } = deps

  let hasWarnedCanvasRuntimeUnhealthy = false

  app.post('/api/video-branding/trailer', requireAuth, requirePremiumOrAdmin, rateLimitVideo, async (req, res) => {
    const asBool = (value, fallback = false) => {
      if (typeof value === 'boolean') return value
      if (typeof value === 'number') return value === 1
      if (typeof value === 'string') {
        const v = value.trim().toLowerCase()
        if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true
        if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
      }
      return fallback
    }
    const startedAt = Date.now()
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    let responseFinished = false
    console.log('[video-branding] request:start', { requestId, userId: req.auth?.userId || null })
    res.on('finish', () => {
      responseFinished = true
      console.log('[video-branding] request:finish', {
        requestId,
        statusCode: res.statusCode,
        elapsedMs: Date.now() - startedAt,
        writableEnded: res.writableEnded,
      })
    })
    res.on('close', () => {
      console.log('[video-branding] request:close', {
        requestId,
        statusCode: res.statusCode,
        elapsedMs: Date.now() - startedAt,
        finished: responseFinished,
        writableEnded: res.writableEnded,
        destroyed: res.destroyed,
      })
    })
    req.on('aborted', () => {
      console.warn('[video-branding] request:aborted', {
        requestId,
        elapsedMs: Date.now() - startedAt,
        finished: responseFinished,
      })
    })

    const mediaType = req.body?.mediaType === 'tv' ? 'tv' : 'movie'
    const id = Number(req.body?.id)
    const trailerId = typeof req.body?.trailerId === 'string' ? req.body.trailerId.trim() : ''
    const trailerUrlRaw = typeof req.body?.trailerUrl === 'string' ? req.body.trailerUrl.trim() : ''
    let trailerUrl = isYouTubeTrailerId(trailerId) ? buildYouTubeTrailerUrlFromId(trailerId) : trailerUrlRaw
    const layoutRaw = typeof req.body?.layout === 'string' ? req.body.layout.trim() : ''
    const layout = layoutRaw === 'feed' ? 'feed' : 'portrait'
    const includeLogo = asBool(req.body?.includeLogo, true)
    const includeSynopsis = true
    const includeCta = asBool(req.body?.includeCta, true)
    const includePhone = asBool(req.body?.includePhone, false)
    const includeWebsite = asBool(req.body?.includeWebsite, false)
    const forceDownload = asBool(req.body?.download, false)
    const ctaText = typeof req.body?.ctaText === 'string' ? req.body.ctaText.replace(/\r/g, '').trim().slice(0, 40) : ''
    const synopsisTheme = typeof req.body?.synopsisTheme === 'string' ? req.body.synopsisTheme.trim().slice(0, 60) : ''
    const limitDuration = asBool(req.body?.limitDuration, false)
    let preview = asBool(req.body?.preview, false)
    const voteAverageRaw = Number(req.body?.voteAverage)
    const requestVoteAverage = Number.isFinite(voteAverageRaw) && voteAverageRaw > 0 ? voteAverageRaw : 0
    const previewSecondsRaw = Number(req.body?.previewSeconds)
    let previewSeconds = Number.isFinite(previewSecondsRaw) && previewSecondsRaw > 0 ? Math.min(Math.round(previewSecondsRaw), 30) : 0
    if (previewSeconds > 0) preview = true
    const maxDurationRaw = Number(req.body?.maxDurationSeconds)
    const maxDurationSeconds = limitDuration
      ? 90
      : Number.isFinite(maxDurationRaw) && maxDurationRaw > 0
        ? Math.min(Math.max(Math.round(maxDurationRaw), 10), 180)
        : null
    if (limitDuration) {
      preview = false
      previewSeconds = 0
    }

    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ message: 'Dados inválidos.' })
      return
    }

    let userType = null
    let brandName = ''
    let brandColors = { primary: '#7c3aed', secondary: '#2563eb' }
    let brandLogo = ''
    let website = ''
    let phone = ''
    try {
      const result = await query(
        'select type, brand_name, brand_colors, brand_logo, website, phone from app_users where id = $1 limit 1',
        [req.auth.userId]
      )
      const row = result.rows[0]
      userType = row && typeof row.type === 'string' ? row.type : null
      brandName = row && typeof row.brand_name === 'string' ? row.brand_name.trim() : ''
      website = row && typeof row.website === 'string' ? row.website.trim() : ''
      phone = row && typeof row.phone === 'string' ? row.phone.trim() : ''
      brandLogo = row && typeof row.brand_logo === 'string' ? row.brand_logo.trim() : ''

      const colorsRaw = row ? row.brand_colors : null
      const colors =
        colorsRaw && typeof colorsRaw === 'object'
          ? colorsRaw
          : typeof colorsRaw === 'string'
            ? (() => {
                try {
                  return JSON.parse(colorsRaw)
                } catch {
                  return null
                }
              })()
            : null

      if (colors && typeof colors === 'object') {
        const primary = typeof colors.primary === 'string' ? colors.primary : ''
        const secondary = typeof colors.secondary === 'string' ? colors.secondary : ''
        brandColors = {
          primary: primary || brandColors.primary,
          secondary: secondary || brandColors.secondary,
        }
      }
      if (!trailerUrl || !isYouTubeTrailerUrl(trailerUrl)) {
        trailerUrl = await resolveTrailerUrlFromProvider({
          mediaType,
          id,
          userKey: req.auth.userKey,
          fetchSearchProviderJson,
          getSearchProviderSettingsKeys,
          uniqStrings,
        })
      }
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
      return
    }
    if (!trailerUrl || !isYouTubeTrailerUrl(trailerUrl)) {
      res.status(404).json({ message: 'Trailer não encontrado para este conteúdo.' })
      return
    }

    if (!isCanvasRuntimeHealthy) {
      if (!hasWarnedCanvasRuntimeUnhealthy) {
        hasWarnedCanvasRuntimeUnhealthy = true
        console.warn(
          '[video-branding] ICU do canvas não encontrado; continuando execução com fallback.'
        )
      }
    }

    let ffmpegCommand = resolveFfmpegCommand()
    if (ffmpegCommand !== 'ffmpeg' && !fs.existsSync(ffmpegCommand)) {
      ffmpegCommand = 'ffmpeg'
    }
    const ffmpegOk = await hasBinary(ffmpegCommand, ['-version'])
    if (!ffmpegOk) {
      if (userType === 'admin') {
        res.status(503).json({ message: 'Geração com trailer não configurada no servidor.' })
      } else {
        res.status(503).json({ message: 'Geração com trailer indisponível no momento.' })
      }
      return
    }

    cleanupStaleTempFiles()
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediahub-vb-'))
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      if (tmpDir) safeRm(tmpDir)
    }
    res.on('finish', cleanup)
    res.on('close', cleanup)

    try {
      const formatPhoneForDisplay = (value) => {
        const raw = typeof value === 'string' ? value.trim() : ''
        if (!raw) return ''
        let digits = raw.replace(/\D/g, '')
        if (digits.length >= 12 && digits.startsWith('55')) digits = digits.slice(2)
        if (digits.length === 11) {
          const ddd = digits.slice(0, 2)
          const first = digits.slice(2, 7)
          const last = digits.slice(7)
          return `(${ddd}) ${first}-${last}`
        }
        if (digits.length === 10) {
          const ddd = digits.slice(0, 2)
          const first = digits.slice(2, 6)
          const last = digits.slice(6)
          return `(${ddd}) ${first}-${last}`
        }
        return raw
      }

      let trailerFile = path.join(tmpDir, 'trailer.mp4')
      let trailerAcquireErrorText = ''
      const trailerTemplate = path.join(tmpDir, 'trailer.%(ext)s')
      const bundledYtdlpCommand = resolveBundledYtdlpCommand()

      /** ytdl-core quebra com frequência com mudanças do YouTube; nesta rota usamos só yt-dlp (mais estável). */
      const useYtdlCoreBranding = process.env.MEDIAHUB_VIDEO_BRANDING_USE_YTDL === '1'
      const ytdl = useYtdlCoreBranding ? resolveYtdl() : null
      if (ytdl) {
        try {
          if (!ytdl.validateURL(trailerUrl)) {
            res.status(400).json({ message: 'Trailer inválido.' })
            return
          }
          const info = await ytdl.getInfo(trailerUrl)
          const mp4Formats = info?.formats?.filter((f) => f && f.container === 'mp4' && f.hasVideo && f.hasAudio) || []
          const format = mp4Formats.length
            ? mp4Formats.sort((a, b) => (Number(b.bitrate || 0) - Number(a.bitrate || 0)))[0]
            : ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'audioandvideo' })
          const stream = ytdl.downloadFromInfo(info, { format, requestOptions: { headers: { 'user-agent': 'Mozilla/5.0' } } })
          await downloadToFile({ stream, filePath: trailerFile, timeoutMs: 180_000 })
        } catch (e) {
          trailerAcquireErrorText = `${trailerAcquireErrorText}\n${String(e?.message || '')}`
          console.error('video-branding: ytdl-core failed, trying yt-dlp', { message: String(e?.message || '') })
        }
      }

      if (!fs.existsSync(trailerFile)) {
        const files = fs
          .readdirSync(tmpDir)
          .filter((name) => name.toLowerCase().startsWith('trailer.') && name.toLowerCase().endsWith('.mp4'))
        if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
      }

      if (!fs.existsSync(trailerFile)) {
        const ytdlpExec = resolveYtdlpExec()
        if (ytdlpExec) {
          try {
            console.log('video-branding: trying yt-dlp-exec for', trailerUrl)
            await ytdlpExec(trailerUrl, {
              output: trailerTemplate,
              format: 'bv*+ba/b',
              mergeOutputFormat: 'mp4',
              ffmpegLocation: ffmpegCommand,
              retries: 2,
            })
            console.log('video-branding: yt-dlp-exec completed')
          } catch (ee) {
            trailerAcquireErrorText = `${trailerAcquireErrorText}\n${String(ee?.message || '')}\n${String(ee?.stderr || '')}`
            console.error('video-branding: yt-dlp-exec failed', {
              message: String(ee?.message || ''),
              stack: String(ee?.stack || ''),
              stderr: String(ee?.stderr || ''),
              stdout: String(ee?.stdout || '')
            })
          }
        }
      }

      if (!fs.existsSync(trailerFile)) {
        const files = fs
          .readdirSync(tmpDir)
          .filter((name) => name.toLowerCase().startsWith('trailer.') && name.toLowerCase().endsWith('.mp4'))
        if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
      }

      if (!fs.existsSync(trailerFile) && isYouTubeTrailerUrl(trailerUrl)) {
        if (bundledYtdlpCommand) {
          try {
            const downloadResult = await runProcess({
              command: bundledYtdlpCommand,
              args: [
                '--no-progress',
                '--no-playlist',
                '--retries',
                '2',
                '-f',
                'bv*+ba/b',
                '--merge-output-format',
                'mp4',
                '-o',
                trailerTemplate,
                trailerUrl,
              ],
              cwd: tmpDir,
              timeoutMs: 180_000,
            })
            if (downloadResult.code !== 0) {
              trailerAcquireErrorText = `${trailerAcquireErrorText}\n${downloadResult.stderr || ''}`
              console.error('video-branding: bundled yt-dlp failed', { code: downloadResult.code, stderr: downloadResult.stderr.slice(0, 1000) })
            }
          } catch (e) {
            trailerAcquireErrorText = `${trailerAcquireErrorText}\n${String(e?.message || '')}`
            console.error('video-branding: bundled yt-dlp spawn failed', { message: String(e?.message || '') })
          }
        }
      }

      if (!fs.existsSync(trailerFile)) {
        const files = fs
          .readdirSync(tmpDir)
          .filter((name) => name.toLowerCase().startsWith('trailer.') && name.toLowerCase().endsWith('.mp4'))
        if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
      }

      if (!fs.existsSync(trailerFile)) {
        const command = (await hasBinary('yt-dlp', ['--version'])) ? 'yt-dlp' : null
        if (!command) {
          if (bundledYtdlpCommand) {
            cleanupStaleTempFiles()
            const retryResult = await runProcess({
              command: bundledYtdlpCommand,
              args: [
                '--no-progress',
                '--no-playlist',
                '--retries',
                '1',
                '-f',
                'bv*+ba/b',
                '--merge-output-format',
                'mp4',
                '-o',
                trailerTemplate,
                trailerUrl,
              ],
              cwd: tmpDir,
              timeoutMs: 180_000,
            })
            if (retryResult.code === 0) {
              const files = fs
                .readdirSync(tmpDir)
                .filter((name) => name.toLowerCase().startsWith('trailer.') && name.toLowerCase().endsWith('.mp4'))
              if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
            } else {
              trailerAcquireErrorText = `${trailerAcquireErrorText}\n${retryResult.stderr || ''}`
            }
          }
        }
        if (!fs.existsSync(trailerFile) && !command) {
          const lower = trailerAcquireErrorText.toLowerCase()
          const looksLikeNoSpace =
            lower.includes('failed to extract') || lower.includes('no space') || lower.includes('nospc') || lower.includes('decompression')
          if (looksLikeNoSpace) {
            res.status(503).json({ message: 'Servidor sem espaço temporário para gerar com trailer. Tente novamente em instantes.' })
            return
          }
          if (userType === 'admin') {
            res.status(503).json({ message: 'Geração com trailer não configurada no servidor.' })
          } else {
            res.status(503).json({ message: 'Geração com trailer indisponível no momento.' })
          }
          return
        }
        const downloadResult = await runProcess({
          command,
          args: [
            '--no-progress',
            '--no-playlist',
            '--retries',
            '2',
            '-f',
            'bv*+ba/b',
            '--merge-output-format',
            'mp4',
            '-o',
            trailerTemplate,
            trailerUrl,
          ],
          cwd: tmpDir,
          timeoutMs: 180_000,
        })
        if (downloadResult.code !== 0) {
          console.error('video-branding: yt-dlp failed', { code: downloadResult.code, stderr: downloadResult.stderr.slice(0, 1000) })
          res.status(503).json({ message: 'Não foi possível gerar com o trailer agora. Tente novamente.' })
          return
        }
      }

      if (!fs.existsSync(trailerFile)) {
        const files = fs
          .readdirSync(tmpDir)
          .filter((name) => name.toLowerCase().startsWith('trailer.') && name.toLowerCase().endsWith('.mp4'))
        if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
      }

      if (!fs.existsSync(trailerFile)) {
        res.status(503).json({ message: 'Não foi possível gerar com o trailer agora. Tente novamente.' })
        return
      }

      let trailerMaxEndSeconds = null
      if (typeof maxDurationSeconds === 'number' && maxDurationSeconds > 0) {
        trailerMaxEndSeconds =
          typeof trailerMaxEndSeconds === 'number' && trailerMaxEndSeconds > 0
            ? Math.min(trailerMaxEndSeconds, maxDurationSeconds)
            : maxDurationSeconds
      }

      if (!isCanvasRuntimeHealthy) {
        console.warn('[video-branding] canvas indisponível: usando fallback de branding via ffmpeg.')
        // Em alguns navegadores a conexão longa é encerrada se os headers demorarem.
        // Enviamos headers cedo para manter o socket vivo durante o transcode.
        res.setHeader('Content-Type', 'video/mp4')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Accel-Buffering', 'no')
        if (forceDownload) res.setHeader('Content-Disposition', 'attachment; filename="video_branding_trailer.mp4"')
        res.status(200)
        if (typeof res.flushHeaders === 'function') {
          try { res.flushHeaders() } catch { void 0 }
        }
        const outFileDegraded = path.join(tmpDir, 'out-degraded.mp4')
        const outputLimitSeconds = preview && previewSeconds > 0
          ? previewSeconds
          : typeof trailerMaxEndSeconds === 'number' && trailerMaxEndSeconds > 1
            ? trailerMaxEndSeconds
            : 0
        const fallbackBrandName = String(brandName || 'MediaHub').trim() || 'MediaHub'
        const fallbackCta = includeCta ? String(ctaText || 'Dica de Conteúdo').trim() || 'Dica de Conteúdo' : ''
        const fallbackFooter = includePhone
          ? formatPhoneForDisplay(phone)
          : includeWebsite
            ? String(website || '').trim()
            : ''
        const colorRaw = String(brandColors?.primary || '#7c3aed').trim()
        const normalizedColor = /^#?[0-9a-fA-F]{6}$/.test(colorRaw) ? `#${colorRaw.replace('#', '')}` : '#7c3aed'
        const secondaryRaw = String(brandColors?.secondary || '#2563eb').trim()
        const normalizedSecondary = /^#?[0-9a-fA-F]{6}$/.test(secondaryRaw) ? `#${secondaryRaw.replace('#', '')}` : '#2563eb'
        const escapedName = escapeFfmpegText(fallbackBrandName)
        const escapedCta = escapeFfmpegText(fallbackCta)
        const escapedFooter = escapeFfmpegText(fallbackFooter)
        const fallbackFontFile = resolveFfmpegDrawtextFont()
        const fontPrefix = fallbackFontFile
          ? `fontfile='${escapeFfmpegPath(fallbackFontFile)}':`
          : ''

        const targetW = 1080
        const targetH = layout === 'feed' ? 1350 : 1920
        const headerH = layout === 'feed' ? 180 : 220
        const trailerH = layout === 'feed' ? 520 : 608
        const trailerY = headerH
        const infoY = trailerY + trailerH
        const infoH = Math.max(180, targetH - infoY)

        const buildDegradedArgs = (mode = 'full') => {
          const args = ['-y', '-i', trailerFile]
          const parts = [
            `[0:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},boxblur=28:2[bg]`,
            `[0:v]scale=${targetW}:${trailerH}:force_original_aspect_ratio=increase,crop=${targetW}:${trailerH}[main]`,
            `[bg][main]overlay=0:${trailerY}[v0]`,
            `[v0]drawbox=x=0:y=0:w=${targetW}:h=${headerH}:color=black@0.42:t=fill[v1]`,
            `[v1]drawbox=x=0:y=${infoY}:w=${targetW}:h=${infoH}:color=black@0.52:t=fill[v2]`,
          ]

          if (mode === 'full') {
            // Topbar (estilo story): CTA forte + barra de marca.
            parts.push(`[v2]drawbox=x=0:y=${headerH - 12}:w=${targetW}:h=12:color=${normalizedColor}:t=fill[v3]`)
            parts.push(`[v3]drawtext=${fontPrefix}expansion=none:text='${escapedName}':x=120:y=${Math.max(56, Math.round(headerH * 0.52))}:fontsize=72:fontcolor=white:shadowx=2:shadowy=2[v4]`)
            parts.push(`[v4]drawtext=${fontPrefix}expansion=none:text='▶':x=52:y=${Math.max(56, Math.round(headerH * 0.52))}:fontsize=42:fontcolor=white:shadowx=1:shadowy=1[v5]`)
            if (escapedCta) {
              parts.push(`[v5]drawbox=x=36:y=${targetH - 132}:w=${targetW - 72}:h=68:color=${normalizedSecondary}@0.38:t=fill[v6]`)
              parts.push(`[v6]drawtext=${fontPrefix}expansion=none:text='${escapedCta}':x=56:y=${targetH - 86}:fontsize=34:fontcolor=white:shadowx=2:shadowy=2[v7]`)
              if (escapedFooter) {
                parts.push(`[v7]drawtext=${fontPrefix}expansion=none:text='${escapedFooter}':x=56:y=${targetH - 36}:fontsize=32:fontcolor=white:shadowx=2:shadowy=2[vout]`)
              } else {
                parts.push(`[v7]null[vout]`)
              }
            } else if (escapedFooter) {
              parts.push(`[v5]drawtext=${fontPrefix}expansion=none:text='${escapedFooter}':x=56:y=${targetH - 36}:fontsize=32:fontcolor=white:shadowx=2:shadowy=2[vout]`)
            } else {
              parts.push(`[v5]null[vout]`)
            }
          } else if (mode === 'minimal') {
            parts.push(`[v2]drawbox=x=0:y=${headerH - 10}:w=${targetW}:h=10:color=${normalizedColor}:t=fill[v3]`)
            parts.push(`[v3]drawbox=x=0:y=0:w=${targetW}:h=8:color=${normalizedSecondary}:t=fill[vout]`)
          } else {
            parts.push(`[v2]null[vout]`)
          }

          args.push('-filter_complex', parts.join(';'))
          args.push('-map', '[vout]')
          args.push('-map', '0:a?')
          if (outputLimitSeconds > 0) args.push('-t', String(outputLimitSeconds))
          args.push('-c:v', 'libx264')
          args.push('-preset', 'veryfast')
          args.push('-crf', preview ? '24' : '24')
          args.push('-c:a', 'aac')
          args.push('-b:a', '128k')
          args.push('-movflags', '+faststart')
          args.push(outFileDegraded)
          return args
        }

        let degradedResult = await runProcess({
          command: ffmpegCommand,
          args: buildDegradedArgs('full'),
          cwd: tmpDir,
          timeoutMs: preview ? 90_000 : 900_000,
        })
        let degradedModeApplied = 'full'
        if (degradedResult.code !== 0 || !fs.existsSync(outFileDegraded)) {
          console.warn('video-branding: fallback com overlay falhou; tentando fallback minimo.', {
            code: degradedResult.code,
            stderr: degradedResult.stderr.slice(0, 3000),
          })
          degradedResult = await runProcess({
            command: ffmpegCommand,
            args: buildDegradedArgs('minimal'),
            cwd: tmpDir,
            timeoutMs: preview ? 90_000 : 900_000,
          })
          degradedModeApplied = 'minimal'
        }
        if (degradedResult.code !== 0 || !fs.existsSync(outFileDegraded)) {
          console.warn('video-branding: fallback minimo falhou; tentando sem overlay.', {
            code: degradedResult.code,
            stderr: degradedResult.stderr.slice(0, 1000),
          })
          degradedResult = await runProcess({
            command: ffmpegCommand,
            args: buildDegradedArgs('none'),
            cwd: tmpDir,
            timeoutMs: preview ? 90_000 : 900_000,
          })
          degradedModeApplied = 'none'
        }
        if (degradedResult.code !== 0 || !fs.existsSync(outFileDegraded)) {
          console.error('video-branding: ffmpeg degraded failed', {
            code: degradedResult.code,
            stderr: degradedResult.stderr.slice(0, 4000),
          })
          // Última barreira: entrega trailer cru para evitar quebra total da funcionalidade.
          if (fs.existsSync(trailerFile)) {
            fs.createReadStream(trailerFile).pipe(res)
            return
          }
          try { res.destroy() } catch { void 0 }
          return
        }
        console.log('video-branding: fallback gerado', { mode: degradedModeApplied })
        const degradedStream = fs.createReadStream(outFileDegraded)
        degradedStream.on('error', (err) => {
          console.error('video-branding: degraded stream error', { message: String(err?.message || '') })
          try {
            if (!res.headersSent) res.status(503).json({ message: 'Não foi possível gerar com o trailer agora. Tente novamente.' })
            else res.destroy()
          } catch {
            void 0
          } finally {
            cleanup()
          }
        })
        res.on('close', () => {
          try {
            degradedStream.destroy()
          } catch {
            void 0
          }
        })
        degradedStream.pipe(res)
        return
      }

      let posterFile = ''
      let synopsisText = ''
      let titleText = ''
      let yearText = ''
      let runtimeText = ''
      let genresText = ''
      let seasonsText = ''
      let ratingValue = requestVoteAverage

      // Always fetch details for metadata and poster
      if (true) {
        const userContext = await readOptionalAuthUserContext(req)
        const settingsKeys = await getSearchProviderSettingsKeys()
        const apiKeys = uniqStrings([userContext.userKey, ...settingsKeys])
        if (apiKeys.length > 0) {
          try {
            const payload = await fetchSearchProviderJson({
              path: `/${mediaType}/${id}`,
              params: { language: 'pt-BR' },
              apiKeys,
            })

            if (payload) {
               titleText = payload.title || payload.name || ''
               const date = payload.release_date || payload.first_air_date || ''
               yearText = date ? date.split('-')[0] : ''
               runtimeText = payload.runtime ? `${payload.runtime} min` : ''
               const seasonCount = Number(payload.number_of_seasons)
               seasonsText = mediaType === 'tv' && Number.isFinite(seasonCount) && seasonCount > 0
                 ? `${Math.round(seasonCount)} ${Math.round(seasonCount) === 1 ? 'TEMPORADA' : 'TEMPORADAS'}`
                 : ''
               genresText = payload.genres?.map(g => g.name).slice(0, 2).join(', ') || ''
               if (typeof payload.vote_average === 'number' && Number.isFinite(payload.vote_average) && payload.vote_average > 0) {
                 ratingValue = payload.vote_average
               }

               if (includeSynopsis) {
                 const overviewRaw = typeof payload.overview === 'string' ? payload.overview.trim() : ''
                 const normalized = overviewRaw.replace(/\s+/g, ' ').trim()
                synopsisText = normalized || 'Sinopse não disponível para este conteúdo.'
               }

               // Always try to fetch poster for the card
               const posterPath = typeof payload.poster_path === 'string' ? payload.poster_path.trim() : ''
               if (posterPath) {
                 const imageBaseUrl = await getSearchProviderImageBaseUrl()
                 if (imageBaseUrl) {
                   const url = `${imageBaseUrl}/w500${posterPath}`
                   console.log('video-branding: fetching poster', url)
                   const upstream = await fetch(url)
                   if (upstream.ok) {
                     const buffer = Buffer.from(await upstream.arrayBuffer())
                     posterFile = path.join(tmpDir, 'poster.jpg')
                     fs.writeFileSync(posterFile, buffer)
                     console.log('video-branding: poster saved', posterFile, buffer.length)
                   } else {
                     console.error('video-branding: poster fetch failed', upstream.status, upstream.statusText)
                   }
                 } else {
                   console.error('video-branding: no imageBaseUrl')
                 }
               } else {
                 console.log('video-branding: no posterPath in payload')
               }
            }
          } catch (e) {
            console.error('video-branding: search provider fetch failed', { message: String(e?.message || ''), stack: e?.stack })
          }
        }
      }

      let logoFile = ''
      if (includeLogo && brandLogo && brandLogo.startsWith('data:')) {
        try {
          const match = /^data:([^;]+);base64,(.+)$/.exec(brandLogo)
          if (match) {
            const base64 = match[2]
            const buffer = Buffer.from(base64, 'base64')
            logoFile = path.join(tmpDir, 'logo.png')
            fs.writeFileSync(logoFile, buffer)
            console.log('video-branding: logo saved', logoFile, buffer.length)
          } else {
            console.warn('video-branding: invalid logo data uri format')
          }
        } catch (e) {
          console.error('video-branding: logo save failed', e)
        }
      }

      const { fontFile, fontBoldFile } = await resolveVideoBrandingFonts(tmpDir)
      if (!fontFile && !fontBoldFile) {
        console.warn('video-branding: nenhuma fonte TTF encontrada; Canvas usa fallback do sistema')
      }

      const outFile = path.join(tmpDir, 'out.mp4')
      const args = []
      args.push('-y')

      // Input 0: trailer
      args.push('-i', trailerFile)
      let inputIndex = 1

      // Input opcional: poster
      let posterIndex = -1
      if (posterFile) {
        args.push('-i', posterFile)
        posterIndex = inputIndex++
      }

      // Input opcional: logo
      let logoIndex = -1
      if (logoFile) {
        args.push('-i', logoFile)
        logoIndex = inputIndex++
      }

      // Input do Info Card (Canvas) - será adicionado após gerar a imagem
      let infoCardIndex = -1
      let headerIndex = -1

      const primary = brandColors?.primary || '#7c3aed'
      const secondary = brandColors?.secondary || '#2563eb'

      const normalizeSynopsisTheme = (value) => {
        const safe = String(value || '').trim().toLowerCase()
        if (safe === 'elegant-black' || safe === 'highlight-yellow' || safe === 'brand') {
          return safe
        }
        return 'brand'
      }

      const parseHexColor = (value) => {
        const raw = String(value || '').trim()
        if (!raw) return null
        const hex = raw.startsWith('#') ? raw.slice(1) : raw
        if (hex.length === 3) {
          const r = parseInt(hex[0] + hex[0], 16)
          const g = parseInt(hex[1] + hex[1], 16)
          const b = parseInt(hex[2] + hex[2], 16)
          if ([r, g, b].some((n) => Number.isNaN(n))) return null
          return { r, g, b }
        }
        if (hex.length === 6) {
          const r = parseInt(hex.slice(0, 2), 16)
          const g = parseInt(hex.slice(2, 4), 16)
          const b = parseInt(hex.slice(4, 6), 16)
          if ([r, g, b].some((n) => Number.isNaN(n))) return null
          return { r, g, b }
        }
        return null
      }

      const rgbaFromHex = (value, alpha) => {
        const rgb = parseHexColor(value)
        if (!rgb) return `rgba(255,255,255,${alpha})`
        const a = Number.isFinite(alpha) ? Math.min(Math.max(alpha, 0), 1) : 1
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`
      }

      const resolvedTheme = normalizeSynopsisTheme(synopsisTheme)
      const themePrimary = brandColors?.primary || '#3b82f6'
      const themeSecondary = brandColors?.secondary || '#0ea5e9'
      const videoThemeConfig = (() => {
        if (resolvedTheme === 'elegant-black') {
          return {
            headerOverlayStops: ['rgba(0,0,0,0.90)', 'rgba(0,0,0,0.78)', 'rgba(0,0,0,0.84)'],
            headerColorWash: null,
            bgDarkenAlpha: 0.74,
            infoOverlayFill: 'rgba(0, 0, 0, 0.62)',
            infoFallbackFill: 'rgba(0, 0, 0, 0.88)',
            infoColorWash: null,
            infoBottomColorWashStops: null,
            infoPosterBlurPx: 7,
            infoPosterSharpAlpha: 0.24,
            tagsFill: 'rgba(255,255,255,0.90)',
            ctaBg: '#111827',
            ctaFg: '#ffffff',
            spacing: { posterY: 66, gap: 28, bottomPad: 60 },
          }
        }
        if (resolvedTheme === 'highlight-yellow') {
          return {
            headerOverlayStops: ['rgba(0,0,0,0.86)', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.78)'],
            headerColorWash: 'rgba(251,191,36,0.08)',
            bgDarkenAlpha: 0.66,
            infoOverlayFill: 'rgba(0, 0, 0, 0.42)',
            infoFallbackFill: 'rgba(0, 0, 0, 0.84)',
            infoColorWash: 'rgba(251,191,36,0.24)',
            infoBottomColorWashStops: ['rgba(251,191,36,0.38)', 'rgba(217,119,6,0.32)'],
            infoPosterBlurPx: 5,
            infoPosterSharpAlpha: 0.28,
            tagsFill: '#fbbf24',
            ctaBg: '#fbbf24',
            ctaFg: '#111827',
            spacing: { posterY: 44, gap: 20, bottomPad: 46 },
          }
        }
        if (resolvedTheme === 'brand') {
          return {
            headerOverlayStops: ['rgba(0,0,0,0.86)', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.78)'],
            headerColorWash: rgbaFromHex(themePrimary, 0.12),
            bgDarkenAlpha: 0.66,
            infoOverlayFill: 'rgba(0, 0, 0, 0.42)',
            infoFallbackFill: 'rgba(0, 0, 0, 0.84)',
            infoColorWash: rgbaFromHex(themePrimary, 0.24),
            infoBottomColorWashStops: [rgbaFromHex(themePrimary, 0.34), rgbaFromHex(themeSecondary, 0.28)],
            infoPosterBlurPx: 5,
            infoPosterSharpAlpha: 0.28,
            tagsFill: rgbaFromHex(themeSecondary, 0.95),
            ctaBg: themePrimary,
            ctaFg: '#ffffff',
            spacing: { posterY: 52, gap: 24, bottomPad: 52 },
          }
        }
        return {
          headerOverlayStops: ['rgba(0,0,0,0.90)', 'rgba(0,0,0,0.78)', 'rgba(0,0,0,0.84)'],
          headerColorWash: null,
          bgDarkenAlpha: 0.74,
          infoOverlayFill: 'rgba(0, 0, 0, 0.62)',
          infoFallbackFill: 'rgba(0, 0, 0, 0.88)',
          infoColorWash: null,
          infoBottomColorWashStops: null,
          infoPosterBlurPx: 7,
          infoPosterSharpAlpha: 0.24,
          tagsFill: 'rgba(255,255,255,0.90)',
          ctaBg: '#111827',
          ctaFg: '#ffffff',
          spacing: { posterY: 66, gap: 28, bottomPad: 60 },
        }
      })()

      // -----------------------------------------------------------------------
      // NOVO DESIGN "PROMPT USER" - V6 (COM CANVAS SUPREME)
      // -----------------------------------------------------------------------
      
      // Registrar fontes no Canvas
      const fontName = 'CustomFont'
      const fontBoldName = 'CustomFontBold'
      const fontFallbackStack = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
      const canvasFontRegular = `"${fontName}", ${fontFallbackStack}`
      const canvasFontBold = `"${fontBoldName}", ${fontFallbackStack}`
      
      // Normalizar caminhos para o canvas (remove prefixo file:// se existir, mas aqui são paths locais)
      // No Windows, GlobalFonts.registerFromPath precisa do caminho absoluto limpo.
      // As variáveis fontFile e fontBoldFile já são caminhos absolutos copiados para temp.
      // Mas elas têm formatação para o ffmpeg (escapes). Vamos usar as variáveis originais antes do escape se possível, 
      // ou limpar.
      
      // Recuperando caminhos limpos (sem escapes do ffmpeg)
      const cleanFontFile = fontFile ? fontFile.replace(/\\\\:/g, ':').replace(/\//g, path.sep) : ''
      const cleanFontBoldFile = fontBoldFile ? fontBoldFile.replace(/\\\\:/g, ':').replace(/\//g, path.sep) : ''

      try {
        if (cleanFontFile) GlobalFonts.registerFromPath(cleanFontFile, fontName)
        if (cleanFontBoldFile) GlobalFonts.registerFromPath(cleanFontBoldFile, fontBoldName)
      } catch (e) {
        console.error('Canvas font registration failed:', e)
      }

      const targetW = 1080
      const targetH = layout === 'feed' ? 1350 : 1920
      const isTallLayout = layout === 'portrait' || layout === 'feed'
      const headerH = isTallLayout ? 220 : Math.max(110, Math.min(160, Math.round(targetH * 0.115)))
      let videoH = isTallLayout ? 608 : Math.max(520, Math.min(640, Math.round(targetH * 0.56)))
      let videoW = Math.round((videoH * 16) / 9)
      if (videoW > targetW) {
        videoW = targetW
        videoH = Math.round((videoW * 9) / 16)
      }
      let videoX = Math.round((targetW - videoW) / 2)
      const videoY = headerH
      let infoY = videoY + videoH
      let infoH = targetH - infoY
      void includeSynopsis

      try {
        const headerCanvas = createCanvas(targetW, headerH)
        const hctx = headerCanvas.getContext('2d')

        try {
          const headerBgPath = path.resolve('anexos', 'bg.jpg')
          if (fs.existsSync(headerBgPath)) {
            const headerBg = await loadImage(headerBgPath)
            const iw = headerBg.width || targetW
            const ih = headerBg.height || headerH
            const scale = Math.max(targetW / iw, headerH / ih)
            const dw = iw * scale
            const dh = ih * scale
            const dx = (targetW - dw) / 2
            const dy = (headerH - dh) / 2
            hctx.drawImage(headerBg, dx, dy, dw, dh)
          } else {
            hctx.fillStyle = '#0b1220'
            hctx.fillRect(0, 0, targetW, headerH)
          }
        } catch (e) {
          hctx.fillStyle = '#0b1220'
          hctx.fillRect(0, 0, targetW, headerH)
        }

        const headerOverlay = hctx.createLinearGradient(0, 0, 0, headerH)
        headerOverlay.addColorStop(0, videoThemeConfig.headerOverlayStops[0])
        headerOverlay.addColorStop(0.55, videoThemeConfig.headerOverlayStops[1])
        headerOverlay.addColorStop(1, videoThemeConfig.headerOverlayStops[2])
        hctx.fillStyle = headerOverlay
        hctx.fillRect(0, 0, targetW, headerH)
        if (videoThemeConfig.headerColorWash) {
          hctx.fillStyle = videoThemeConfig.headerColorWash
          hctx.fillRect(0, 0, targetW, headerH)
        }

        const hasHeaderCta = includeCta
        const headerTitle = hasHeaderCta ? (String(ctaText || '').trim() || 'Dica de Conteúdo') : ''
        const headerPhone = ''

        const headerScale = Math.max(0.5, Math.min(1.25, headerH / 220))
        const headerCtaScale = hasHeaderCta ? 0.78 : 1
        const headerUiScale = headerScale * headerCtaScale
        const padX = Math.max(28, Math.round(64 * headerUiScale))
        const iconBox = Math.max(48, Math.round(84 * headerUiScale))
        const gap = Math.max(10, Math.round(18 * headerUiScale))
        const iconX = padX
        const iconY = Math.round((headerH - iconBox) / 2)
        const textX = iconX + iconBox + gap
        const headerLogoW = Math.max(146, Math.round(targetW * (165 / 1080)))
        const reservedRight = logoIndex >= 0 ? 26 + headerLogoW + Math.round(30 * headerUiScale) : padX
        const textW = targetW - textX - reservedRight

        const wrapHeaderLines = (context, text, maxWidth, maxLines) => {
          const safe = String(text || '').replace(/\s+/g, ' ').trim()
          if (!safe) return []
          const words = safe.split(' ')
          const lines = []
          let line = ''
          for (let i = 0; i < words.length; i++) {
            const test = line ? `${line} ${words[i]}` : words[i]
            if (context.measureText(test).width > maxWidth && line) {
              lines.push(line)
              line = words[i]
              if (lines.length >= maxLines) break
            } else {
              line = test
            }
          }
          if (line && lines.length < maxLines) lines.push(line)
          return lines
        }

        let titleFontSize = Math.max(24, Math.round(58 * headerUiScale))
        let titleLines = []
        if (hasHeaderCta) {
          const titleFsMax = Math.max(24, Math.round(58 * headerUiScale))
          const titleFsMin = Math.max(18, Math.round(40 * headerUiScale))
          for (let fs = titleFsMax; fs >= titleFsMin; fs -= 2) {
            hctx.font = `800 ${fs}px ${canvasFontBold}`
            const lines = wrapHeaderLines(hctx, headerTitle, textW, 2)
            if (lines.length <= 2) {
              titleFontSize = fs
              titleLines = lines
              break
            }
          }
        }

        const titleLineHeight = Math.round(titleFontSize * 1.06)
        const phoneFontSize = Math.max(18, Math.round(34 * headerScale))
        const blockH = titleLines.length * titleLineHeight + (headerPhone ? 16 + phoneFontSize : 0)
        const startY = Math.round((headerH - blockH) / 2)

        if (hasHeaderCta) {
          try {
            const cx = iconX + iconBox / 2
            const cy = iconY + iconBox / 2
            const radius = Math.round(iconBox * 0.36)

            hctx.save()
            hctx.shadowColor = 'rgba(0,0,0,0.65)'
            hctx.shadowBlur = 18
            hctx.shadowOffsetY = 10

            hctx.strokeStyle = 'rgba(255,255,255,0.22)'
            hctx.lineWidth = 3
            hctx.beginPath()
            hctx.arc(cx, cy, radius, 0, Math.PI * 2)
            hctx.stroke()

            const roundedRectPath = (context, x, y, w, h, r) => {
              const rr = Math.max(0, Math.min(r, Math.floor(Math.min(w, h) / 2)))
              context.beginPath()
              context.moveTo(x + rr, y)
              context.lineTo(x + w - rr, y)
              context.quadraticCurveTo(x + w, y, x + w, y + rr)
              context.lineTo(x + w, y + h - rr)
              context.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
              context.lineTo(x + rr, y + h)
              context.quadraticCurveTo(x, y + h, x, y + h - rr)
              context.lineTo(x, y + rr)
              context.quadraticCurveTo(x, y, x + rr, y)
              context.closePath()
            }

            const boardW = Math.round(iconBox * 0.60)
            const boardH = Math.round(iconBox * 0.42)
            const boardX = Math.round(cx - boardW / 2)
            const boardY = Math.round(cy - boardH / 2 + iconBox * 0.06)
            const topH = Math.max(10, Math.round(boardH * 0.32))
            const topW = Math.round(boardW * 0.98)
            const topX = Math.round(cx - topW / 2)
            const topY = Math.round(boardY - topH + iconBox * 0.05)
            const corner = Math.max(6, Math.round(iconBox * 0.07))

            hctx.fillStyle = 'rgba(255,255,255,0.18)'
            hctx.strokeStyle = 'rgba(255,255,255,0.92)'
            hctx.lineWidth = Math.max(3, Math.round(iconBox * 0.04))
            roundedRectPath(hctx, boardX, boardY, boardW, boardH, corner)
            hctx.fill()
            hctx.stroke()

            hctx.fillStyle = 'rgba(255,255,255,0.20)'
            roundedRectPath(hctx, topX, topY, topW, topH, corner)
            hctx.fill()
            hctx.stroke()

            const stripes = 4
            hctx.strokeStyle = 'rgba(0,0,0,0.30)'
            hctx.lineWidth = Math.max(2, Math.round(iconBox * 0.03))
            hctx.beginPath()
            for (let i = 0; i < stripes; i++) {
              const sx = topX + Math.round((i * topW) / stripes)
              hctx.moveTo(sx, topY + Math.round(topH * 0.15))
              hctx.lineTo(sx + Math.round(topW / stripes), topY + Math.round(topH * 0.85))
            }
            hctx.stroke()

            hctx.restore()
          } catch (e) {
            console.error('video-branding: header icon draw failed', e)
          }

          hctx.textAlign = 'left'
          hctx.textBaseline = 'middle'
          hctx.shadowColor = 'rgba(0,0,0,0.70)'
          hctx.shadowBlur = 12
          hctx.shadowOffsetY = 6

          hctx.fillStyle = '#ffffff'
          hctx.font = `800 ${titleFontSize}px ${canvasFontBold}`
          for (let i = 0; i < titleLines.length; i++) {
            hctx.fillText(titleLines[i], textX, startY + i * titleLineHeight + Math.round(titleLineHeight / 2))
          }

          if (headerPhone) {
            hctx.fillStyle = 'rgba(255,255,255,0.92)'
            hctx.font = `800 ${phoneFontSize}px ${canvasFontBold}`
            hctx.fillText(headerPhone, textX, startY + titleLines.length * titleLineHeight + 16 + Math.round(phoneFontSize / 2))
          }
        }

        const headerPng = path.join(tmpDir, 'header.png')
        fs.writeFileSync(headerPng, headerCanvas.toBuffer('image/png'))
        args.push('-loop', '1', '-i', headerPng)
        headerIndex = inputIndex++
      } catch (e) {
        console.error('video-branding: header canvas failed', { message: String(e?.message || '') })
      }

      const parts = []
      
      // 1. Background Geral (Dark Texture/Blur)
      // "Fundo escuro com textura/collage de filmes"
      if (posterIndex >= 0) {
          // Blur forte para textura
          parts.push(`[${posterIndex}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},boxblur=80:5[bg_base]`)
          // Escurecer bem (Cinematic Dark)
          parts.push(`[bg_base]drawbox=color=black@${videoThemeConfig.bgDarkenAlpha}:t=fill[bg]`)
      } else {
          parts.push(`color=c=#0f172a:s=${targetW}x${targetH}[bg]`)
      }

      let vNext = 'bg'

      if (headerIndex >= 0) {
        parts.push(`[${headerIndex}:v]scale=${targetW}:${headerH}[v_header_img]`)
        parts.push(`[${vNext}][v_header_img]overlay=0:0[v_header_out]`)
        vNext = 'v_header_out'
      }

      // Logo da Marca (Topo Direito - Discreta)
      if (logoIndex >= 0) {
          const logoW = Math.max(160, Math.round(targetW * (190 / 1080)))
          parts.push(`[${logoIndex}:v]scale=${logoW}:-1:force_original_aspect_ratio=decrease[logo_scaled]`)
          const logoX = includeCta ? 'W-w-36' : '(W-w)/2'
          parts.push(`[${vNext}][logo_scaled]overlay=${logoX}:(${headerH}-h)/2[v_header_final]`)
          vNext = 'v_header_final'
      }

      // 3. Área Central (Trailer)
      // "Faixa horizontal central... Janela de reprodução"
      // Altura do vídeo 16:9 em 1080 width é ~608px.
      // Centralizado verticalmente no espaço livre?
      // Header acaba em 220. Footer deve ter uns 800px.
      // Vamos por o vídeo logo abaixo do Header com um espaçamento.
      if (typeof trailerMaxEndSeconds === 'number' && trailerMaxEndSeconds > 1) {
        parts.push(`[0:v]trim=start=0:end=${trailerMaxEndSeconds},setpts=PTS-STARTPTS[v_trailer]`)
      } else {
        parts.push(`[0:v]setpts=PTS-STARTPTS[v_trailer]`)
      }
      const trailerScaleFilter =
        layout === 'feed'
          ? `scale=${videoW}:${videoH}:force_original_aspect_ratio=increase,crop=${videoW}:${videoH},setsar=1`
          : `scale=${videoW}:${videoH}:force_original_aspect_ratio=decrease,pad=${videoW}:${videoH}:(ow-iw)/2:(oh-ih)/2,setsar=1`
      parts.push(`[v_trailer]${trailerScaleFilter}[video_scaled]`)
      // Adicionar leve sombra/glow no vídeo? (Opcional, manter simples por compatibilidade)
      parts.push(`[${vNext}][video_scaled]overlay=${videoX}:${videoY}[v_mid]`)
      vNext = 'v_mid'

      // 4. Área Inferior de Informações (CANVAS TOTAL)
      // Substitui toda a geração manual de boxes e textos do ffmpeg por uma imagem única gerada via Canvas.
      
      const infoCanvas = createCanvas(targetW, infoH)
      const ctx = infoCanvas.getContext('2d')

      // Helper para rounded rect (compatibilidade)
      const drawRoundedRect = (ctx, x, y, w, h, r) => {
          ctx.beginPath()
          ctx.moveTo(x + r, y)
          ctx.lineTo(x + w - r, y)
          ctx.quadraticCurveTo(x + w, y, x + w, y + r)
          ctx.lineTo(x + w, y + h - r)
          ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
          ctx.lineTo(x + r, y + h)
          ctx.quadraticCurveTo(x, y + h, x, y + h - r)
          ctx.lineTo(x, y + r)
          ctx.quadraticCurveTo(x, y, x + r, y)
          ctx.closePath()
      }

      // Fundo Geral (Poster Esmaecido se possível)
      if (posterFile && fs.existsSync(posterFile)) {
          try {
              const bgPoster = await loadImage(posterFile)
              const blurPxRaw = Number(videoThemeConfig.infoPosterBlurPx)
              const blurPx = Number.isFinite(blurPxRaw) ? Math.max(0, Math.min(24, Math.round(blurPxRaw))) : 10
              const sharpAlphaRaw = Number(videoThemeConfig.infoPosterSharpAlpha)
              const sharpAlpha = Number.isFinite(sharpAlphaRaw) ? Math.max(0, Math.min(0.35, sharpAlphaRaw)) : 0.16

              ctx.save()
              ctx.filter = `blur(${blurPx}px)`
              ctx.globalAlpha = 1
              ctx.drawImage(bgPoster, -32, -32, targetW + 64, infoH + 64)
              ctx.restore()

              if (sharpAlpha > 0) {
                ctx.save()
                ctx.filter = 'none'
                ctx.globalAlpha = sharpAlpha
                ctx.drawImage(bgPoster, -16, -16, targetW + 32, infoH + 32)
                ctx.restore()
              }

          } catch (e) {
              console.error('Erro ao desenhar background poster:', e)
              ctx.fillStyle = '#0f172a' // Fallback
              ctx.fillRect(0, 0, targetW, infoH)
          }
      } else {
          ctx.fillStyle = videoThemeConfig.infoFallbackFill
          ctx.fillRect(0, 0, targetW, infoH)
      }

      const infoOverlay = ctx.createLinearGradient(0, 0, 0, infoH)
      infoOverlay.addColorStop(0, 'rgba(2,6,23,0.32)')
      infoOverlay.addColorStop(0.55, 'rgba(2,6,23,0.40)')
      infoOverlay.addColorStop(1, 'rgba(2,6,23,0.55)')
      ctx.fillStyle = infoOverlay
      ctx.fillRect(0, 0, targetW, infoH)
      if (videoThemeConfig.headerColorWash) {
        ctx.fillStyle = videoThemeConfig.headerColorWash
        ctx.fillRect(0, 0, targetW, infoH)
      }
      const lowerThemeShadow = ctx.createRadialGradient(
        Math.round(targetW * 0.5),
        Math.round(infoH * 0.72),
        Math.round(targetW * 0.1),
        Math.round(targetW * 0.5),
        Math.round(infoH * 0.72),
        Math.round(targetW * 0.7)
      )
      lowerThemeShadow.addColorStop(0, rgbaFromHex(themePrimary, 0.22))
      lowerThemeShadow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = lowerThemeShadow
      ctx.fillRect(0, 0, targetW, infoH)
      
      const padX = Math.max(44, Math.round(targetW * 0.055))
      const isCompactInfo = infoH < 720
      const canShowPosterCard = !isCompactInfo && posterFile && fs.existsSync(posterFile)
      const posterW = canShowPosterCard ? Math.max(220, Math.round(targetW * (300 / 1080))) : 0
      const posterH = canShowPosterCard ? Math.max(280, Math.round(posterW * 1.4)) : 0
      const posterX = padX
      const posterY = canShowPosterCard ? videoThemeConfig.spacing.posterY : 0

      const wrapTextCanvas = (context, text, x, y, maxWidth, lineHeight) => {
        const words = String(text || '').split(/\s+/).filter(Boolean)
        let line = ''
        let currentY = y

        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' '
          const metrics = context.measureText(testLine)
          const testWidth = metrics.width

          if (testWidth > maxWidth && n > 0) {
            context.fillText(line, x, currentY)
            line = words[n] + ' '
            currentY += lineHeight
          } else {
            line = testLine
          }
        }
        context.fillText(line, x, currentY)
        return currentY + lineHeight
      }

      const synopsisThemeConfig = (() => {
        if (resolvedTheme === 'elegant-black') {
          return {
            stripFrom: 'rgba(0,0,0,0.92)',
            stripTo: 'rgba(17,24,39,0.92)',
            boxFill: 'rgba(0,0,0,0.52)',
            boxStroke: 'rgba(255,255,255,0.18)',
            boxWashStops: null,
          }
        }
        if (resolvedTheme === 'highlight-yellow') {
          return {
            stripFrom: 'rgba(251,191,36,0.92)',
            stripTo: 'rgba(217,119,6,0.92)',
            boxFill: 'rgba(0,0,0,0.30)',
            boxStroke: 'rgba(255,255,255,0.18)',
            boxWashStops: ['rgba(251,191,36,0.30)', 'rgba(217,119,6,0.26)'],
          }
        }
        if (resolvedTheme === 'brand') {
          return {
            stripFrom: rgbaFromHex(themePrimary, 0.92),
            stripTo: rgbaFromHex(themeSecondary, 0.92),
            boxFill: 'rgba(0,0,0,0.30)',
            boxStroke: 'rgba(255,255,255,0.18)',
            boxWashStops: [rgbaFromHex(themePrimary, 0.30), rgbaFromHex(themeSecondary, 0.26)],
          }
        }
        return {
          stripFrom: 'rgba(0,0,0,0.92)',
          stripTo: 'rgba(17,24,39,0.92)',
          boxFill: 'rgba(0,0,0,0.52)',
          boxStroke: 'rgba(255,255,255,0.18)',
          boxWashStops: null,
        }
      })()

      const bottomPad = videoThemeConfig.spacing.bottomPad
      const gap = videoThemeConfig.spacing.gap
      const showPhone = Boolean(includePhone && phone)
      const showWebsite = !showPhone && Boolean(includeWebsite && website)
      const showCta = !showPhone && !showWebsite && Boolean(includeCta && ctaText)
      const footerKind = showPhone ? 'phone' : showWebsite ? 'website' : showCta ? 'cta' : 'none'
      const bottomPadResolved = Math.max(24, Math.min(bottomPad, Math.round(infoH * (isCompactInfo ? 0.09 : 0.12))))
      const footerH = footerKind === 'cta' ? (isCompactInfo ? 54 : 62) : footerKind === 'none' ? 0 : isCompactInfo ? 72 : 96
      const footerY = footerH ? infoH - footerH - bottomPadResolved : infoH - bottomPadResolved

      const titleX = canShowPosterCard ? posterX + posterW + Math.max(28, Math.round(targetW * (40 / 1080))) : padX
      const titleY = canShowPosterCard ? posterY + 6 : Math.max(24, Math.round(infoH * 0.08))
      const titleW = targetW - titleX - padX

      if (canShowPosterCard) {
        try {
          ctx.fillStyle = 'rgba(0,0,0,0.5)'
          ctx.beginPath()
          drawRoundedRect(ctx, posterX + 6, posterY + 6, posterW, posterH, 20)
          ctx.fill()

          const posterImg = await loadImage(posterFile)
          ctx.save()
          ctx.beginPath()
          drawRoundedRect(ctx, posterX, posterY, posterW, posterH, 20)
          ctx.clip()
          ctx.drawImage(posterImg, posterX, posterY, posterW, posterH)

          ctx.strokeStyle = 'rgba(255,255,255,0.12)'
          ctx.lineWidth = 2
          drawRoundedRect(ctx, posterX, posterY, posterW, posterH, 20)
          ctx.stroke()
          ctx.restore()
        } catch (e) {
          console.error('Erro ao carregar poster no canvas:', e)
        }
      }

      ctx.fillStyle = 'white'
      const titleFontSize = isCompactInfo ? 48 : 56
      const titleLineHeight = isCompactInfo ? 58 : 66
      ctx.font = `900 ${titleFontSize}px ${canvasFontBold}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'

      ctx.shadowColor = 'rgba(0,0,0,0.8)'
      ctx.shadowBlur = 6
      ctx.shadowOffsetX = 2
      ctx.shadowOffsetY = 2

      const endTitleY = wrapTextCanvas(ctx, titleText, titleX, titleY, titleW, titleLineHeight)
      ctx.shadowColor = 'transparent'

      const tagsY = endTitleY + (isCompactInfo ? 12 : 18)
      const genresList = genresText.split(',').slice(0, 2).join(', ')
      const typeText = mediaType === 'tv' ? 'SÉRIE' : 'FILME'
      const tagsText = [typeText, genresList, yearText, seasonsText].filter(Boolean).join(' • ')

      ctx.fillStyle = videoThemeConfig.tagsFill
      let tagsFontSize = 30
      for (let fs = 30; fs >= 20; fs--) {
        ctx.font = `800 ${fs}px ${canvasFontBold}`
        if (ctx.measureText(tagsText).width <= titleW) {
          tagsFontSize = fs
          break
        }
        tagsFontSize = fs
      }
      ctx.font = `800 ${tagsFontSize}px ${canvasFontBold}`
      const tagsMetrics = ctx.measureText(tagsText)
      const tagsTextW = Math.ceil(tagsMetrics.width)
      const tagsH = Number.isFinite(tagsMetrics?.actualBoundingBoxAscent) && Number.isFinite(tagsMetrics?.actualBoundingBoxDescent)
        ? Math.ceil(tagsMetrics.actualBoundingBoxAscent + tagsMetrics.actualBoundingBoxDescent)
        : Math.max(24, Math.round(tagsFontSize * 1.4))
      ctx.fillText(tagsText, titleX, tagsY)

      let ratingPillBottomY = 0
      if (typeof ratingValue === 'number' && ratingValue > 0) {
        const base = ratingValue.toFixed(1)
        const label = `NOTA ${base}${isCompactInfo ? '' : '/10'}`
        const pillH = isCompactInfo ? 44 : 48
        const pad = isCompactInfo ? 16 : 18
        const gapInline = isCompactInfo ? 12 : 14
        const ratingFontSize = isCompactInfo ? 22 : 24
        ctx.font = `900 ${ratingFontSize}px ${canvasFontBold}`
        const textW = Math.ceil(ctx.measureText(label).width)
        const pillW = Math.max(isCompactInfo ? 150 : 170, Math.min(titleW, textW + pad * 2))
        const pillXInline = titleX + tagsTextW + gapInline
        const canInline = pillXInline + pillW <= titleX + titleW
        const pillX = canInline ? pillXInline : titleX
        const pillY = canInline ? Math.round(tagsY + (tagsH - pillH) / 2) : tagsY + tagsH + (isCompactInfo ? 10 : 14)

        ctx.fillStyle = 'rgba(0,0,0,0.36)'
        ctx.beginPath()
        drawRoundedRect(ctx, pillX, pillY, pillW, pillH, Math.round(pillH / 2))
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.14)'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.96)'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, pillX + pad, pillY + Math.round(pillH / 2))

        ratingPillBottomY = canInline ? 0 : pillY + pillH
      }

      const btnY = footerY
      const synTopGap = isCompactInfo ? 22 : 30

      const synBaseY = tagsY + tagsH
      const synBaseBottomY = ratingPillBottomY ? Math.max(synBaseY, ratingPillBottomY) : synBaseY
      const synBoxX = padX
      const synBoxW = targetW - padX * 2
      const synMinY = synBaseBottomY + synTopGap
      const synAfterPosterY = canShowPosterCard ? posterY + posterH + 22 : synMinY
      const synBoxY = Math.max(synMinY, synAfterPosterY)
      const synAvailableH = btnY - synBoxY - gap
      const synBoxH = Math.max(60, Math.min(synAvailableH, Math.round(infoH * (isCompactInfo ? 0.56 : 0.62))))

      const synopsisStripW = isCompactInfo
        ? Math.max(44, Math.min(72, Math.round(synBoxW * 0.14)))
        : Math.max(56, Math.min(96, Math.round(synBoxW * 0.16)))
      ctx.fillStyle = synopsisThemeConfig.boxFill
      ctx.beginPath()
      drawRoundedRect(ctx, synBoxX, synBoxY, synBoxW, synBoxH, 26)
      ctx.fill()

      if (Array.isArray(synopsisThemeConfig.boxWashStops) && synopsisThemeConfig.boxWashStops.length >= 2) {
        const boxG = ctx.createLinearGradient(0, synBoxY, 0, synBoxY + synBoxH)
        boxG.addColorStop(0, synopsisThemeConfig.boxWashStops[0])
        boxG.addColorStop(1, synopsisThemeConfig.boxWashStops[1])
        ctx.save()
        ctx.beginPath()
        drawRoundedRect(ctx, synBoxX, synBoxY, synBoxW, synBoxH, 26)
        ctx.clip()
        ctx.fillStyle = boxG
        ctx.fillRect(synBoxX, synBoxY, synBoxW, synBoxH)
        ctx.restore()
      }

      ctx.strokeStyle = synopsisThemeConfig.boxStroke
      ctx.lineWidth = 2
      ctx.stroke()

      const stripGradient = ctx.createLinearGradient(synBoxX, 0, synBoxX + synopsisStripW, 0)
      stripGradient.addColorStop(0, synopsisThemeConfig.stripFrom)
      stripGradient.addColorStop(1, synopsisThemeConfig.stripTo)
      ctx.fillStyle = stripGradient
      ctx.save()
      ctx.beginPath()
      drawRoundedRect(ctx, synBoxX, synBoxY, synopsisStripW, synBoxH, 26)
      ctx.clip()
      ctx.fillRect(synBoxX, synBoxY, synopsisStripW, synBoxH)
      ctx.restore()

      ctx.save()
      ctx.translate(synBoxX + synopsisStripW / 2, synBoxY + synBoxH / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.font = `900 34px ${canvasFontBold}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('SINOPSE', 0, 0)
      ctx.restore()

      const synTextPadY = isCompactInfo ? 18 : 28
      const synTextPadX = isCompactInfo ? 22 : 32
      const synTextX = synBoxX + synopsisStripW + synTextPadX
      const synTextY = synBoxY + synTextPadY
      const synTextW = synBoxW - synopsisStripW - synTextPadX * 2
      const synTextH = synBoxH - synTextPadY * 2

      const wrapLinesFull = (context, text, maxWidth) => {
        const safe = String(text || '').replace(/\s+/g, ' ').trim()
        if (!safe) return []
        const paragraphs = safe.split('\n').map(p => p.trim()).filter(Boolean)
        const out = []
        for (let p = 0; p < paragraphs.length; p++) {
          const words = paragraphs[p].split(' ').filter(Boolean)
          let line = ''
          for (let i = 0; i < words.length; i++) {
            const test = line ? `${line} ${words[i]}` : words[i]
            if (context.measureText(test).width > maxWidth && line) {
              out.push(line)
              line = words[i]
            } else {
              line = test
            }
          }
          if (line) out.push(line)
        }
        return out
      }

      const minSynFont = layout === 'feed' ? 7 : 7
      const maxSynFont = isCompactInfo ? 22 : 26
      const synColGap = isCompactInfo ? 16 : 20
      const synMaxCols = layout === 'feed' ? 3 : 2

      let synTextFontSize = minSynFont
      let synTextLineHeight = Math.max(minSynFont + 2, Math.round(minSynFont * 1.22))
      let synTextLines = []
      let synCols = 1
      let synColW = synTextW
      let synMaxLinesPerCol = Math.max(1, Math.floor(synTextH / synTextLineHeight))

      for (let fs = maxSynFont; fs >= minSynFont; fs--) {
        ctx.font = `600 ${fs}px ${canvasFontRegular}`
        const lh = Math.max(fs + 3, Math.round(fs * 1.28))
        const maxLinesPerCol = Math.max(1, Math.floor(synTextH / lh))
        for (let cols = 1; cols <= synMaxCols; cols++) {
          const colW = cols === 1 ? synTextW : Math.floor((synTextW - synColGap * (cols - 1)) / cols)
          if (colW < 120) continue
          const lines = wrapLinesFull(ctx, synopsisText, colW)
          if (lines.length <= maxLinesPerCol * cols) {
            synTextFontSize = fs
            synTextLineHeight = lh
            synTextLines = lines
            synCols = cols
            synColW = colW
            synMaxLinesPerCol = maxLinesPerCol
            break
          }
        }
        if (synTextLines.length) break
      }

      if (!synTextLines.length) {
        ctx.font = `500 ${minSynFont}px ${canvasFontRegular}`
        synTextFontSize = minSynFont
        synTextLineHeight = Math.max(minSynFont + 2, Math.round(minSynFont * 1.22))
        synCols = synMaxCols
        synColW = synCols === 1 ? synTextW : Math.floor((synTextW - synColGap * (synCols - 1)) / synCols)
        synTextLines = wrapLinesFull(ctx, synopsisText, synColW)
        synMaxLinesPerCol = Math.max(1, Math.floor(synTextH / synTextLineHeight))
      }

      ctx.fillStyle = 'rgba(248,250,252,0.95)'
      ctx.font = `500 ${synTextFontSize}px ${canvasFontRegular}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      if (synCols === 1) {
        for (let i = 0; i < synTextLines.length; i++) {
          ctx.fillText(synTextLines[i], synTextX, synTextY + i * synTextLineHeight, synTextW)
        }
      } else {
        for (let i = 0; i < synTextLines.length; i++) {
          const col = Math.floor(i / synMaxLinesPerCol)
          if (col >= synCols) break
          const row = i % synMaxLinesPerCol
          const x = synTextX + col * (synColW + synColGap)
          const y = synTextY + row * synTextLineHeight
          ctx.fillText(synTextLines[i], x, y, synColW)
        }
      }

      if (footerKind !== 'none') {
        ctx.shadowColor = 'rgba(0,0,0,0.35)'
        ctx.shadowBlur = 14
        ctx.shadowOffsetY = 7

        ctx.shadowColor = 'transparent'
        if (footerKind === 'cta') {
          const btnColor = videoThemeConfig.ctaBg
          const btnText = String(ctaText || '').replace(/\r/g, '').trim()
          const isSmallCta = true
          const btnH = isCompactInfo ? 44 : 52
          let btnX = padX
          let btnW = isCompactInfo ? 320 : 420
          const by = footerY

          if (includeLogo && logoFile && fs.existsSync(logoFile)) {
            try {
              const logoImg = await loadImage(logoFile)
              const maxLogoH = btnH - 10
              const maxLogoW = isCompactInfo ? 120 : 150
              const scale = Math.min(maxLogoW / (logoImg.width || 1), maxLogoH / (logoImg.height || 1), 1)
              const lw = Math.max(1, Math.round((logoImg.width || 1) * scale))
              const lh = Math.max(1, Math.round((logoImg.height || 1) * scale))
              const lx = padX
              const ly = Math.round(by + (btnH - lh) / 2)
              ctx.save()
              ctx.globalAlpha = 1
              ctx.drawImage(logoImg, lx, ly, lw, lh)
              ctx.restore()

              const gap = 10
              btnX = lx + lw + gap
              const remaining = targetW - btnX - padX
              const minW = isCompactInfo ? 200 : 240
              btnW = Math.max(minW, Math.min(btnW, remaining))
            } catch (e) {
              void e
            }
          } else {
            btnW = Math.min(btnW, targetW - padX * 2)
            btnX = Math.round((targetW - btnW) / 2)
          }

          ctx.fillStyle = btnColor
          ctx.beginPath()
          drawRoundedRect(ctx, btnX, by, btnW, btnH, Math.round(btnH / 2))
          ctx.fill()

          ctx.fillStyle = videoThemeConfig.ctaFg
          const maxLines = 1
          const maxTextW = btnW - 48
          const rawLines = btnText.split('\n')
          const tokens = []
          for (let i = 0; i < rawLines.length; i++) {
            const words = rawLines[i].replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
            for (let j = 0; j < words.length; j++) tokens.push(words[j])
            if (i < rawLines.length - 1) tokens.push('\n')
          }

          const ellipsisCta = '…'
          const wrapTokensEllipsis = (context, nextTokens, maxWidth, linesCap) => {
            const lines = []
            let line = ''
            let truncated = false
            let i = 0
            for (; i < nextTokens.length; i++) {
              const t = nextTokens[i]
              if (t === '\n') {
                if (line) {
                  lines.push(line)
                  line = ''
                }
                if (lines.length >= linesCap) {
                  truncated = true
                  break
                }
                continue
              }
              const test = line ? `${line} ${t}` : t
              if (context.measureText(test).width > maxWidth && line) {
                lines.push(line)
                line = t
                if (lines.length >= linesCap) {
                  truncated = true
                  break
                }
              } else {
                line = test
              }
            }
            if (line && lines.length < linesCap) lines.push(line)
            if (!truncated && i < nextTokens.length - 1) truncated = true
            if (lines.length === 0) return { lines: [], truncated: Boolean(nextTokens.length) }

            const clampLine = (value) => {
              let next = value
              while (next.length > 0 && context.measureText(next).width > maxWidth) next = next.slice(0, -1).trimEnd()
              return next
            }

            for (let k = 0; k < lines.length; k++) lines[k] = clampLine(lines[k])
            if (truncated) {
              let last = lines[lines.length - 1]
              while (last.length > 0 && context.measureText(last + ellipsisCta).width > maxWidth) last = last.slice(0, -1).trimEnd()
              lines[lines.length - 1] = `${last}${ellipsisCta}`
            }
            return { lines, truncated }
          }

          let btnFontSize = isCompactInfo ? 14 : 16
          let btnLineHeight = isCompactInfo ? 18 : 20
          let btnLines = []
          for (let fs = isCompactInfo ? 14 : 16; fs >= 12; fs--) {
            ctx.font = `800 ${fs}px ${canvasFontBold}`
            const lh = Math.round(fs * 1.18)
            const { lines } = wrapTokensEllipsis(ctx, tokens, maxTextW, maxLines)
            if (!lines.length) continue
            if (lines.length * lh <= btnH - 10) {
              btnFontSize = fs
              btnLineHeight = lh
              btnLines = lines
              break
            }
          }

          if (!btnLines.length) {
            ctx.font = `800 ${btnFontSize}px ${canvasFontBold}`
            btnLines = [btnText.replace(/\s+/g, ' ').trim()].filter(Boolean)
          }

          ctx.font = `800 ${btnFontSize}px ${canvasFontBold}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const centerX = btnX + btnW / 2
          const midY = by + btnH / 2
          const startY = midY - ((btnLines.length - 1) * btnLineHeight) / 2
          for (let i = 0; i < btnLines.length; i++) {
            ctx.fillText(btnLines[i], centerX, startY + i * btnLineHeight)
          }
        } else {
          const footerText = footerKind === 'phone' ? formatPhoneForDisplay(phone) : String(website || '').trim()
          let fontSize = footerKind === 'phone' ? 34 : 30
          const maxW = Math.max(120, targetW - padX * 2)
          const measureGroup = (size) => {
            ctx.font = `800 ${size}px ${canvasFontBold}`
            const textW = ctx.measureText(footerText).width
            if (footerKind === 'phone') {
              const iconSize = Math.max(22, Math.round(size * 1.6))
              const iconGap = Math.max(12, Math.round(size * 0.6))
              return { total: iconSize + iconGap + textW, iconSize, iconGap, textW }
            }
            return { total: textW, iconSize: 0, iconGap: 0, textW }
          }

          let m = measureGroup(fontSize)
          while (m.total > maxW && fontSize > 12) {
            fontSize -= 1
            m = measureGroup(fontSize)
          }

          const startX = Math.round((targetW - m.total) / 2)
          const midY = Math.round(footerY + footerH / 2) - (footerKind === 'phone' ? Math.round(targetH * 0.008) : 0)

          let x = startX
          ctx.fillStyle = 'rgba(255,255,255,0.92)'
          ctx.font = `800 ${fontSize}px ${canvasFontBold}`
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'

          if (footerKind === 'phone') {
            try {
              const waIconPath = path.resolve('anexos', 'pngtree-whatsapp-icon-png-image_6315990.png')
              if (fs.existsSync(waIconPath)) {
                const waIcon = await loadImage(waIconPath)
                const iconY = Math.round(footerY + (footerH - m.iconSize) / 2) - Math.round(targetH * 0.008)
                ctx.save()
                ctx.globalAlpha = 1
                ctx.drawImage(waIcon, x, iconY, m.iconSize, m.iconSize)
                ctx.restore()
              }
            } catch (e) {
              console.error('video-branding: failed to load whatsapp icon', e)
            }
            x += m.iconSize + m.iconGap
          }

          ctx.fillText(footerText, x, midY)
        }
      }

      // Salvar Info Card
      const infoCardPng = path.join(tmpDir, 'info_card.png')
      fs.writeFileSync(infoCardPng, infoCanvas.toBuffer('image/png'))
      
      // Adicionar Info Card como novo input de vídeo (loop estático)
      args.push('-loop', '1', '-i', infoCardPng)
      infoCardIndex = inputIndex++
      
      // Usar o input do Info Card no filter_complex
      parts.push(`[${infoCardIndex}:v]scale=${targetW}:${infoH}[v_info_card]`)
      parts.push(`[${vNext}][v_info_card]overlay=0:${infoY}[v_final_out]`)
      vNext = 'v_final_out'

      // Final output mapping
      parts.push(`[${vNext}]null[vout]`)

      const filterComplex = parts.join(';')
      args.push('-filter_complex', filterComplex)
      args.push('-map', `[vout]`)
      args.push('-map', '0:a?')
      args.push('-c:v', 'libx264')
      args.push('-profile:v', 'high')
      args.push('-pix_fmt', 'yuv420p')
      args.push('-preset', preview ? 'veryfast' : 'fast')
      args.push('-crf', preview ? '24' : '20')
      args.push('-c:a', 'aac')
      args.push('-b:a', '128k')
      args.push('-shortest')
      args.push('-movflags', '+faststart')
      const outputLimitSeconds = preview && previewSeconds > 0
        ? previewSeconds
        : typeof trailerMaxEndSeconds === 'number' && trailerMaxEndSeconds > 1
          ? trailerMaxEndSeconds
          : 0
      if (outputLimitSeconds > 0) {
        args.push('-t', String(outputLimitSeconds))
      }
      args.push(outFile)
      console.log('video-branding: running ffmpeg', { command: ffmpegCommand, args })
      const renderResult = await runProcess({ command: ffmpegCommand, args, cwd: tmpDir, timeoutMs: preview ? 90_000 : 900_000 })
      if (renderResult.code !== 0 || !fs.existsSync(outFile)) {
        console.error('video-branding: ffmpeg failed', { code: renderResult.code, stderr: renderResult.stderr.slice(0, 5000) })
        res.status(503).json({ message: 'Não foi possível gerar com o trailer agora. Tente novamente.' })
        return
      }

      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Cache-Control', 'no-store')
      if (forceDownload) res.setHeader('Content-Disposition', 'attachment; filename="video_branding_trailer.mp4"')
      try {
        const stats = fs.statSync(outFile)
        if (Number.isFinite(stats.size) && stats.size > 0) res.setHeader('Content-Length', String(stats.size))
      } catch {
        void 0
      }
      res.status(200)
      const stream = fs.createReadStream(outFile)
      stream.on('error', (err) => {
        console.error('video-branding: stream error', { message: String(err?.message || '') })
        try {
          if (!res.headersSent) res.status(503).json({ message: 'Não foi possível gerar com o trailer agora. Tente novamente.' })
          else res.destroy()
        } catch {
          void 0
        } finally {
          cleanup()
        }
      })
      res.on('close', () => {
        try {
          stream.destroy()
        } catch {
          void 0
        }
      })
      stream.pipe(res)
    } catch (e) {
      console.error('video-branding: unexpected error', { message: String(e?.message || '') })
      try {
        if (!res.headersSent) {
          res.status(503).json({ message: 'Não foi possível gerar com o trailer agora. Tente novamente.' })
        } else {
          res.destroy()
        }
      } catch {
        void 0
      }
    }
  })

  app.post('/api/trailer/download', requireAuth, rateLimitVideo, async (req, res) => {
    const trailerId = typeof req.body?.trailerId === 'string' ? req.body.trailerId.trim() : ''
    const trailerUrlRaw = typeof req.body?.trailerUrl === 'string' ? req.body.trailerUrl.trim() : ''
    let trailerUrl = isYouTubeTrailerId(trailerId) ? buildYouTubeTrailerUrlFromId(trailerId) : trailerUrlRaw
    const mediaType = req.body?.mediaType === 'tv' ? 'tv' : 'movie'
    const idRaw = req.body?.id
    const id = typeof idRaw === 'number' ? idRaw : Number(idRaw)
    const previewSecondsRaw = Number(req.body?.previewSeconds)
    const previewSeconds = Number.isFinite(previewSecondsRaw) && previewSecondsRaw > 0 ? Math.min(Math.max(Math.round(previewSecondsRaw), 6), 30) : 0

    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ message: 'Conteúdo inválido.' })
      return
    }

    let tmpDir = ''
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      if (tmpDir) safeRm(tmpDir)
    }
    res.on('finish', cleanup)
    res.on('close', cleanup)

    try {
      const userContext = await readOptionalAuthUserContext(req)
      const userType = userContext.userType
      if (!trailerUrl || !isYouTubeTrailerUrl(trailerUrl)) {
        trailerUrl = await resolveTrailerUrlFromProvider({
          mediaType,
          id,
          userKey: userContext.userKey,
          fetchSearchProviderJson,
          getSearchProviderSettingsKeys,
          uniqStrings,
        })
      }
      if (!trailerUrl || !isYouTubeTrailerUrl(trailerUrl)) {
        res.status(404).json({ message: 'Trailer não encontrado para este conteúdo.' })
        return
      }

      cleanupStaleTempFiles()
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediahub-trailer-'))

      let trailerFile = path.join(tmpDir, 'trailer.mp4')
      const trailerTemplate = path.join(tmpDir, 'trailer.%(ext)s')
      const bundledYtdlpCommand = resolveBundledYtdlpCommand()
      const findDownloadedTrailerFile = () => {
        const files = fs
          .readdirSync(tmpDir)
          .filter((name) => name.toLowerCase().startsWith('trailer.'))
        if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
        return fs.existsSync(trailerFile)
      }
      let ffmpegCommand = resolveFfmpegCommand()
      if (ffmpegCommand !== 'ffmpeg' && !fs.existsSync(ffmpegCommand)) {
        ffmpegCommand = 'ffmpeg'
      }
      const ffmpegOk = await hasBinary(ffmpegCommand, ['-version'])
      const canUseDownloadSections = previewSeconds > 0 && ffmpegOk

      const ytdlpFormat = previewSeconds > 0 ? 'best[ext=mp4][height<=480]/best[height<=480]' : 'best[ext=mp4]/best'
      const acquireErrors = []

      const buildYtdlpArgList = (withJsRuntime) => {
        const parts = []
        if (withJsRuntime) {
          parts.push('--js-runtimes', 'node')
        }
        parts.push(
          '--no-playlist',
          '--extractor-retries',
          '2',
          '--retries',
          '2',
          '--fragment-retries',
          '2',
          '--socket-timeout',
          '30',
          '-f',
          ytdlpFormat,
          '-o',
          trailerTemplate,
          trailerUrl
        )
        if (canUseDownloadSections) {
          parts.splice(parts.length - 3, 0, '--download-sections', `*0-${previewSeconds}`)
        }
        return parts
      }

      const ytdlpCommandVariants = []
      ytdlpCommandVariants.push({ command: 'py', baseArgs: ['-m', 'yt_dlp'] })
      ytdlpCommandVariants.push({ command: 'python', baseArgs: ['-m', 'yt_dlp'] })
      if (bundledYtdlpCommand) ytdlpCommandVariants.push({ command: bundledYtdlpCommand, baseArgs: [] })
      ytdlpCommandVariants.push({ command: 'yt-dlp', baseArgs: [] })

      const attemptYtdlpDownload = async (command, baseArgs, ytdlpArgList) => {
        const cookieSources = [null, 'edge', 'chrome', 'firefox']
        for (const cookieSource of cookieSources) {
          const args = cookieSource
            ? [...baseArgs, '--cookies-from-browser', cookieSource, ...ytdlpArgList]
            : [...baseArgs, ...ytdlpArgList]
          try {
            const downloadResult = await runProcess({
              command,
              args,
              cwd: tmpDir,
              timeoutMs: 420_000,
            })
            if (downloadResult.code === 0) {
              if (findDownloadedTrailerFile()) return true
              continue
            }
            acquireErrors.push(String(downloadResult.stderr || `${command} failed (${cookieSource || 'no-cookies'})`))
          } catch (e) {
            acquireErrors.push(String(e?.message || `${command} spawn failed (${cookieSource || 'no-cookies'})`))
          }
        }
        return false
      }

      const runAllYtdlpStrategies = async () => {
        for (const withJs of [true, false]) {
          if (findDownloadedTrailerFile()) return
          const ytdlpArgList = buildYtdlpArgList(withJs)
          for (const variant of ytdlpCommandVariants) {
            if (findDownloadedTrailerFile()) return
            const ok = await attemptYtdlpDownload(variant.command, variant.baseArgs, ytdlpArgList)
            if (!ok) {
              console.error('trailer-download: yt-dlp variant failed', { command: variant.command, withJsRuntime: withJs })
            }
          }
        }
      }

      // ytdl-core removido nesta rota (instável com mudanças do YouTube); yt-dlp é o caminho padrão.

      if (!findDownloadedTrailerFile() && isYouTubeTrailerUrl(trailerUrl)) {
        const ytdlpExec = resolveYtdlpExec()
        if (ytdlpExec) {
          try {
            await ytdlpExec(trailerUrl, {
              output: trailerTemplate,
              format: previewSeconds > 0 ? ytdlpFormat : 'bv*+ba/b',
              mergeOutputFormat: 'mp4',
              ffmpegLocation: ffmpegCommand,
              retries: 2,
            })
          } catch (ee) {
            acquireErrors.push(String(ee?.message || 'youtube-dl-exec failed'))
            console.error('trailer-download: youtube-dl-exec failed', {
              message: String(ee?.message || ''),
              stderr: String(ee?.stderr || ''),
            })
          }
        }
      }

      if (!findDownloadedTrailerFile()) {
        await runAllYtdlpStrategies()
      }

      if (!findDownloadedTrailerFile() && bundledYtdlpCommand) {
        cleanupStaleTempFiles()
        for (const withJs of [true, false]) {
          if (findDownloadedTrailerFile()) break
          const ytdlpArgList = buildYtdlpArgList(withJs)
          await attemptYtdlpDownload(bundledYtdlpCommand, [], ytdlpArgList)
        }
        findDownloadedTrailerFile()
      }

      if (!findDownloadedTrailerFile()) {
        if (userType === 'admin' || process.env.NODE_ENV !== 'production') {
          console.error('trailer-download: acquisition failed', { errors: acquireErrors.slice(0, 8) })
        }
        res.status(503).json({
          message: 'Não foi possível baixar o trailer agora. Tente novamente em instantes.',
          hint:
            'No computador onde a API roda, instale o yt-dlp no PATH (ex.: winget install yt-dlp ou pip install yt-dlp) e confira se o ffmpeg está disponível. Em desenvolvimento, veja o terminal da API para o erro detalhado.',
        })
        return
      }

      let titleText = ''
      try {
        const settingsKeys = await getSearchProviderSettingsKeys()
        const apiKeys = uniqStrings([userContext.userKey, ...settingsKeys])
        if (apiKeys.length > 0) {
          const payload = await fetchSearchProviderJson({
            path: `/${mediaType}/${id}`,
            params: { language: 'pt-BR' },
            apiKeys,
          })
          titleText = payload?.title || payload?.name || ''
        }
      } catch {
        titleText = ''
      }

      const safeFileBaseName = (value) => {
        return String(value || '')
          .replace(/[^a-z0-9]+/gi, '_')
          .replace(/^_+|_+$/g, '')
          .toLowerCase()
          .slice(0, 80) || 'trailer'
      }
      const extRaw = path.extname(trailerFile || '').toLowerCase()
      const ext = extRaw && extRaw.startsWith('.') ? extRaw.slice(1) : (extRaw || '')
      const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : 'mp4'
      const contentType =
        safeExt === 'mp4'
          ? 'video/mp4'
          : safeExt === 'webm'
            ? 'video/webm'
            : 'application/octet-stream'
      const downloadName = `${safeFileBaseName(titleText || 'trailer')}_trailer.${safeExt}`

      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`)
      try {
        const stats = fs.statSync(trailerFile)
        if (Number.isFinite(stats.size) && stats.size > 0) res.setHeader('Content-Length', String(stats.size))
      } catch {
        void 0
      }
      res.status(200)
      const stream = fs.createReadStream(trailerFile)
      stream.on('error', (err) => {
        console.error('trailer-download: stream error', { message: String(err?.message || '') })
        try {
          if (!res.headersSent) res.status(503).json({ message: 'Não foi possível baixar o trailer agora. Tente novamente.' })
          else res.destroy()
        } catch {
          void 0
        } finally {
          cleanup()
        }
      })
      res.on('close', () => {
        try {
          stream.destroy()
        } catch {
          void 0
        }
      })
      stream.pipe(res)
    } catch (e) {
      console.error('trailer-download: unexpected error', { message: String(e?.message || '') })
      if (!res.headersSent) res.status(503).json({ message: 'Não foi possível baixar o trailer agora. Tente novamente.' })
    }
  })

  app.get('/api/assets/image', requireAuth, requirePremiumOrAdmin, async (req, res) => {
    const urlRaw = typeof req.query?.url === 'string' ? req.query.url.trim() : ''
    if (!urlRaw || urlRaw.length > 800 || !isSafeExternalHttpUrl(urlRaw)) {
      res.status(400).end()
      return
    }

    try {
      const url = new URL(urlRaw)
      const response = await fetch(url.toString(), {
        headers: {
          'user-agent': 'Mozilla/5.0',
          accept: 'image/*',
        },
      })
      if (!response.ok) {
        res.status(502).end()
        return
      }
      const contentType = String(response.headers.get('content-type') || '')
      if (!contentType.startsWith('image/')) {
        res.status(502).end()
        return
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length > 2_500_000) {
        res.status(413).end()
        return
      }
      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'private, max-age=86400')
      res.status(200).send(buffer)
    } catch {
      res.status(400).end()
    }
  })

}
