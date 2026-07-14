import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Envio via Telegram (usuário autenticado).
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerTelegramRoutes = (app, deps) => {
  const {
    requireAuth,
    rateLimitTelegram,
    express,
    upload,
    query,
    hasTelegramChatIdColumn,
    getTelegramBotToken,
    getSearchProviderImageBaseUrl,
    getSearchProviderSettingsKeys,
    stripYouTubeUrlsFromText,
    isYouTubeTrailerId,
    isYouTubeTrailerUrl,
    buildYouTubeTrailerUrlFromId,
    resolveTrailerUrlFromProvider,
    fetchSearchProviderJson,
    readOptionalAuthUserContext,
    uniqStrings,
    resolveBundledYtdlpCommand,
    resolveFfmpegCommand,
    runProcess,
    safeRm,
    hasBinary,
  } = deps

  app.post('/api/telegram/send', requireAuth, rateLimitTelegram, async (req, res) => {
    const textRaw = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
    const text = stripYouTubeUrlsFromText(textRaw)
    const includeCover = Boolean(req.body?.includeCover)
    const posterPath = typeof req.body?.posterPath === 'string' ? req.body.posterPath.trim() : ''

    if (!text && !includeCover) {
      res.status(400).json({ message: 'Informe o texto ou selecione uma imagem.' })
      return
    }

    if (includeCover && (!posterPath || !posterPath.startsWith('/'))) {
      res.status(400).json({ message: 'Imagem inválida.' })
      return
    }

    try {
      const canUseTelegramChatId = await hasTelegramChatIdColumn()
      if (!canUseTelegramChatId) {
        res.status(503).json({ message: 'Envio via Telegram indisponível no momento.' })
        return
      }

      const userResult = await query('select telegram_chat_id, type from app_users where id = $1 limit 1', [req.auth.userId])
      const userRow = userResult.rows[0]
      const chatId = userRow && typeof userRow.telegram_chat_id === 'string' ? userRow.telegram_chat_id.trim() : ''
      const userType = userRow && typeof userRow.type === 'string' ? userRow.type : null

      if (!chatId) {
        res.status(400).json({ message: 'Configure seu ID do Telegram na Minha Área para enviar.' })
        return
      }

      const token = await getTelegramBotToken()
      if (!token) {
        res.status(503).json({ message: userType === 'admin' ? 'Telegram não configurado.' : 'Envio via Telegram indisponível no momento.' })
        return
      }

      const telegramBase = `https://api.telegram.org/bot${token}`
      const imageBaseUrl = includeCover ? await getSearchProviderImageBaseUrl() : ''
      if (includeCover && !imageBaseUrl) {
        res.status(503).json({ message: 'Imagem indisponível no momento.' })
        return
      }
      const photoUrl = includeCover ? `${imageBaseUrl}/w780${posterPath}` : ''

      const sendMessage = async (payload) => {
        const r = await fetch(`${telegramBase}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        return r
      }

      const sendPhoto = async (payload) => {
        const r = await fetch(`${telegramBase}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        return r
      }

      if (includeCover) {
        const caption = text.length > 1024 ? text.slice(0, 1021) + '…' : text
        const photoRes = await sendPhoto({ chat_id: chatId, photo: photoUrl, caption })
        await photoRes.json().catch(() => null)
        if (!photoRes.ok) {
          res.status(502).json({ message: 'Não foi possível enviar via Telegram agora.' })
          return
        }

        if (text.length > 1024) {
          const msgRes = await sendMessage({ chat_id: chatId, text })
          if (!msgRes.ok) {
            res.json({ ok: true, warning: true })
            return
          }
        }

        res.json({ ok: true })
        return
      }

      const msgRes = await sendMessage({ chat_id: chatId, text })
      if (!msgRes.ok) {
        res.status(502).json({ message: 'Não foi possível enviar via Telegram agora.' })
        return
      }

      res.json({ ok: true })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.post('/api/telegram/send-trailer-video', requireAuth, rateLimitTelegram, async (req, res) => {
    const trailerId = typeof req.body?.trailerId === 'string' ? req.body.trailerId.trim() : ''
    const trailerUrlRaw = typeof req.body?.trailerUrl === 'string' ? req.body.trailerUrl.trim() : ''
    let trailerUrl = isYouTubeTrailerId(trailerId) ? buildYouTubeTrailerUrlFromId(trailerId) : trailerUrlRaw
    const mediaType = req.body?.mediaType === 'tv' ? 'tv' : 'movie'
    const idRaw = req.body?.id
    const id = typeof idRaw === 'number' ? idRaw : Number(idRaw)
    const captionRaw = typeof req.body?.caption === 'string' ? req.body.caption.trim() : ''

    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ message: 'Conteúdo inválido.' })
      return
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediahub-telegram-trailer-'))
    const cleanup = () => safeRm(tmpDir)
    res.on('close', cleanup)

    try {
      const canUseTelegramChatId = await hasTelegramChatIdColumn()
      if (!canUseTelegramChatId) {
        res.status(503).json({ message: 'Envio via Telegram indisponível no momento.' })
        return
      }

      const userResult = await query('select telegram_chat_id, type from app_users where id = $1 limit 1', [req.auth.userId])
      const userRow = userResult.rows[0]
      const chatId = userRow && typeof userRow.telegram_chat_id === 'string' ? userRow.telegram_chat_id.trim() : ''
      const userType = userRow && typeof userRow.type === 'string' ? userRow.type : null

      if (!chatId) {
        res.status(400).json({ message: 'Configure seu ID do Telegram na Minha Área para enviar.' })
        return
      }

      const token = await getTelegramBotToken()
      if (!token) {
        res.status(503).json({ message: userType === 'admin' ? 'Telegram não configurado.' : 'Envio via Telegram indisponível no momento.' })
        return
      }

      const userContext = await readOptionalAuthUserContext(req)
      const resolvedUserType = userContext.userType
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

      let ffmpegCommand = resolveFfmpegCommand()
      if (ffmpegCommand !== 'ffmpeg' && !fs.existsSync(ffmpegCommand)) {
        ffmpegCommand = 'ffmpeg'
      }
      const ffmpegOk = await hasBinary(ffmpegCommand, ['-version'])

      const ensureTrailerFile = async () => {
        let trailerFile = path.join(tmpDir, 'trailer.mp4')
        const trailerTemplate = path.join(tmpDir, 'trailer.%(ext)s')
        const bundledYtdlpCommand = resolveBundledYtdlpCommand()
        const command = bundledYtdlpCommand ? bundledYtdlpCommand : (await hasBinary('yt-dlp', ['--version'])) ? 'yt-dlp' : null
        if (!command) {
          res.status(503).json({ message: resolvedUserType === 'admin' ? 'Trailer não configurado no servidor.' : 'Trailer indisponível no momento.' })
          return null
        }
        const downloadResult = await runProcess({
          command,
          args: [
            '--js-runtimes',
            'node',
            '--no-playlist',
            '-f',
            'b[ext=mp4][height<=720][filesize<45M]/b[ext=mp4][height<=720]/b[ext=mp4][height<=480][filesize<45M]/b[ext=mp4][height<=480]/b[ext=mp4]',
            '-o',
            trailerTemplate,
            trailerUrl,
          ],
          cwd: tmpDir,
          timeoutMs: 180_000,
        })
        if (downloadResult.code !== 0) {
          console.error('telegram-trailer-video: yt-dlp failed', { code: downloadResult.code, stderr: downloadResult.stderr.slice(0, 1000) })
          res.status(503).json({ message: 'Não foi possível baixar o trailer agora. Tente novamente.' })
          return null
        }

        if (!fs.existsSync(trailerFile)) {
          const files = fs
            .readdirSync(tmpDir)
            .filter((name) => name.toLowerCase().startsWith('trailer.') && name.toLowerCase().endsWith('.mp4'))
          if (files.length > 0) trailerFile = path.join(tmpDir, files[0])
        }

        if (!fs.existsSync(trailerFile)) return null
        return trailerFile
      }

      const trailerFile = await ensureTrailerFile()
      if (!trailerFile) {
        if (!res.headersSent) {
          res.status(503).json({ message: 'Não foi possível baixar o trailer agora. Tente novamente.' })
        }
        return
      }
      let uploadFile = trailerFile
      if (ffmpegOk) {
        const optimizedFile = path.join(tmpDir, 'trailer_telegram.mp4')
        const optimizeResult = await runProcess({
          command: ffmpegCommand,
          args: [
            '-y',
            '-i',
            trailerFile,
            '-t',
            '45',
            '-vf',
            'scale=-2:720',
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '28',
            '-maxrate',
            '1400k',
            '-bufsize',
            '2800k',
            '-c:a',
            'aac',
            '-b:a',
            '96k',
            '-movflags',
            '+faststart',
            optimizedFile,
          ],
          cwd: tmpDir,
          timeoutMs: 240_000,
        })
        if (optimizeResult.code === 0 && fs.existsSync(optimizedFile)) {
          uploadFile = optimizedFile
        }
      }

      let titleText = ''
      let overviewText = ''
      let ratingValue = null

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
          overviewText = typeof payload?.overview === 'string' ? payload.overview : ''
          ratingValue = Number.isFinite(payload?.vote_average) ? Number(payload.vote_average) : null
        }
      } catch {
        titleText = ''
        overviewText = ''
        ratingValue = null
      }

      const captionParts = []
      if (captionRaw) {
        captionParts.push(stripYouTubeUrlsFromText(captionRaw))
      } else {
        if (titleText) captionParts.push(titleText)
        captionParts.push(`Tipo: ${mediaType === 'tv' ? 'Série' : 'Filme'}`)
        if (typeof ratingValue === 'number' && ratingValue > 0) captionParts.push(`Avaliação: ${ratingValue.toFixed(1)}/10`)
        const synopsis = String(overviewText || '').trim()
        if (synopsis) captionParts.push(synopsis)
      }

      const fullCaption = stripYouTubeUrlsFromText(captionParts.join('\n\n')).slice(0, 4096)
      const safeCaption = fullCaption.length > 1024 ? fullCaption.slice(0, 1021) + '…' : fullCaption

      const safeFileBaseName = (value) => {
        return String(value || '')
          .replace(/[^a-z0-9]+/gi, '_')
          .replace(/^_+|_+$/g, '')
          .toLowerCase()
          .slice(0, 80) || 'trailer'
      }
      const filename = `${safeFileBaseName(titleText || 'trailer')}_trailer.mp4`

      const telegramBase = `https://api.telegram.org/bot${token}`

      const buffer = fs.readFileSync(uploadFile)
      const form = new FormData()
      form.set('chat_id', chatId)
      if (safeCaption) {
        form.set('caption', safeCaption)
      }
      form.set('video', new Blob([buffer], { type: 'video/mp4' }), filename)

      const r = await fetch(`${telegramBase}/sendVideo`, { method: 'POST', body: form })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        console.error('telegram-trailer-video: sendVideo failed', err)
        res.status(502).json({ message: 'Não foi possível enviar via Telegram agora.' })
        return
      }

      if (fullCaption.length > 1024) {
        const msgRes = await fetch(`${telegramBase}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: fullCaption }),
        })
        if (!msgRes.ok) {
          res.json({ ok: true, warning: true })
          return
        }
      }

      res.json({ ok: true })
    } catch (error) {
      console.error('telegram-trailer-video: unexpected error', { message: String(error?.message || '') })
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    } finally {
      cleanup()
    }
  })

  app.post('/api/telegram/send-upload', requireAuth, rateLimitTelegram, express.raw({ type: ['image/png', 'image/jpeg', 'application/octet-stream'], limit: '6mb' }), async (req, res) => {
    const captionRaw = typeof req.query?.caption === 'string' ? req.query.caption : ''
    const caption = captionRaw ? String(captionRaw).slice(0, 4096) : ''

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([])
    if (buffer.length === 0) {
      res.status(400).json({ message: 'Arquivo inválido.' })
      return
    }

    try {
      const canUseTelegramChatId = await hasTelegramChatIdColumn()
      if (!canUseTelegramChatId) {
        res.status(503).json({ message: 'Envio via Telegram indisponível no momento.' })
        return
      }

      const userResult = await query('select telegram_chat_id, type from app_users where id = $1 limit 1', [req.auth.userId])
      const userRow = userResult.rows[0]
      const chatId = userRow && typeof userRow.telegram_chat_id === 'string' ? userRow.telegram_chat_id.trim() : ''
      const userType = userRow && typeof userRow.type === 'string' ? userRow.type : null

      if (!chatId) {
        res.status(400).json({ message: 'Configure seu ID do Telegram na Minha Área para enviar.' })
        return
      }

      const token = await getTelegramBotToken()
      if (!token) {
        res.status(503).json({ message: userType === 'admin' ? 'Telegram não configurado.' : 'Envio via Telegram indisponível no momento.' })
        return
      }

      const telegramBase = `https://api.telegram.org/bot${token}`
      const contentType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : 'application/octet-stream'
      const filename = contentType.includes('png') ? 'imagem.png' : 'imagem.jpg'

      const form = new FormData()
      form.set('chat_id', chatId)
      if (caption) {
        const safeCaption = caption.length > 1024 ? caption.slice(0, 1021) + '…' : caption
        form.set('caption', safeCaption)
      }
      form.set('photo', new Blob([buffer], { type: contentType }), filename)

      const r = await fetch(`${telegramBase}/sendPhoto`, { method: 'POST', body: form })
      await r.json().catch(() => null)
      if (!r.ok) {
        res.status(502).json({ message: 'Não foi possível enviar via Telegram agora.' })
        return
      }

      if (caption.length > 1024) {
        const msgRes = await fetch(`${telegramBase}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: caption }),
        })
        if (!msgRes.ok) {
          res.json({ ok: true, warning: true })
          return
        }
      }

      res.json({ ok: true })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.post('/api/telegram/send-video-upload', requireAuth, rateLimitTelegram, upload.single('video'), async (req, res) => {
    try {
      const file = req.file
      if (!file) {
        res.status(400).json({ message: 'Vídeo inválido.' })
        return
      }

      const captionRaw = req.body.caption || ''
      const caption = String(captionRaw).slice(0, 1024)

      const canUseTelegramChatId = await hasTelegramChatIdColumn()
      if (!canUseTelegramChatId) {
        res.status(503).json({ message: 'Envio via Telegram indisponível no momento.' })
        return
      }

      const userResult = await query('select telegram_chat_id from app_users where id = $1 limit 1', [req.auth.userId])
      const userRow = userResult.rows[0]
      const chatId = userRow && typeof userRow.telegram_chat_id === 'string' ? userRow.telegram_chat_id.trim() : ''

      if (!chatId) {
        res.status(400).json({ message: 'Configure seu ID do Telegram na Minha Área para enviar.' })
        return
      }

      const token = await getTelegramBotToken()
      if (!token) {
        res.status(503).json({ message: 'Telegram não configurado.' })
        return
      }

      const telegramBase = `https://api.telegram.org/bot${token}`
      
      const form = new FormData()
      form.append('chat_id', chatId)
      if (caption) {
        form.append('caption', caption)
      }
      const contentType = typeof file.mimetype === 'string' ? file.mimetype : 'application/octet-stream'
      const isMp4 = contentType.toLowerCase().includes('mp4')
      const filename = file.originalname || (isMp4 ? 'video.mp4' : 'video.webm')
      const blob = new Blob([file.buffer], { type: contentType })
      if (isMp4) {
        form.append('video', blob, filename)
      } else {
        form.append('document', blob, filename)
      }

      const r = await fetch(`${telegramBase}/${isMp4 ? 'sendVideo' : 'sendDocument'}`, { method: 'POST', body: form })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        console.error('Telegram Error:', err)
        res.status(502).json({ message: 'Não foi possível enviar via Telegram agora.' })
        return
      }

      res.json({ ok: true })
    } catch (error) {
      console.error('Send Video Error:', error)
      res.status(500).json({ message: 'Erro interno ao enviar vídeo.' })
    }
  })

  app.post('/api/telegram/send-media-group-upload',
    requireAuth,
    rateLimitTelegram,
    express.raw({ type: ['application/octet-stream'], limit: '12mb' }),
    async (req, res) => {
      const captionRaw = typeof req.query?.caption === 'string' ? req.query.caption : ''
      const caption = captionRaw ? String(captionRaw).slice(0, 4096) : ''

      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([])
      if (buffer.length < 8) {
        res.status(400).json({ message: 'Arquivo inválido.' })
        return
      }

      const firstLen = buffer.readUInt32BE(0)
      const firstStart = 4
      const secondLenOffset = firstStart + firstLen
      if (firstLen <= 0 || secondLenOffset + 4 > buffer.length) {
        res.status(400).json({ message: 'Arquivo inválido.' })
        return
      }

      const secondLen = buffer.readUInt32BE(secondLenOffset)
      const secondStart = secondLenOffset + 4
      const end = secondStart + secondLen
      if (secondLen <= 0 || end !== buffer.length) {
        res.status(400).json({ message: 'Arquivo inválido.' })
        return
      }

      const first = buffer.subarray(firstStart, firstStart + firstLen)
      const second = buffer.subarray(secondStart, secondStart + secondLen)

      try {
        const canUseTelegramChatId = await hasTelegramChatIdColumn()
        if (!canUseTelegramChatId) {
          res.status(503).json({ message: 'Envio via Telegram indisponível no momento.' })
          return
        }

        const userResult = await query('select telegram_chat_id, type from app_users where id = $1 limit 1', [req.auth.userId])
        const userRow = userResult.rows[0]
        const chatId = userRow && typeof userRow.telegram_chat_id === 'string' ? userRow.telegram_chat_id.trim() : ''
        const userType = userRow && typeof userRow.type === 'string' ? userRow.type : null

        if (!chatId) {
          res.status(400).json({ message: 'Configure seu ID do Telegram na Minha Área para enviar.' })
          return
        }

        const token = await getTelegramBotToken()
        if (!token) {
          res
            .status(503)
            .json({ message: userType === 'admin' ? 'Telegram não configurado.' : 'Envio via Telegram indisponível no momento.' })
          return
        }

        const telegramBase = `https://api.telegram.org/bot${token}`
        const safeCaption = caption && caption.length > 1024 ? caption.slice(0, 1021) + '…' : caption

        const form = new FormData()
        form.set('chat_id', chatId)
        form.set(
          'media',
          JSON.stringify([
            ...(safeCaption
              ? [{ type: 'photo', media: 'attach://p1', caption: safeCaption }]
              : [{ type: 'photo', media: 'attach://p1' }]),
            { type: 'photo', media: 'attach://p2' },
          ])
        )
        form.set('p1', new Blob([first], { type: 'image/png' }), 'top10_1.png')
        form.set('p2', new Blob([second], { type: 'image/png' }), 'top10_2.png')

        const r = await fetch(`${telegramBase}/sendMediaGroup`, { method: 'POST', body: form })
        await r.json().catch(() => null)
        if (!r.ok) {
          res.status(502).json({ message: 'Não foi possível enviar via Telegram agora.' })
          return
        }

        if (caption.length > 1024) {
          const msgRes = await fetch(`${telegramBase}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: caption }),
          })
          if (!msgRes.ok) {
            res.json({ ok: true, warning: true })
            return
          }
        }

        res.json({ ok: true })
      } catch {
        res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
      }
    }
  )

  app.post(
    '/api/telegram/send-document-upload',
    requireAuth,
    express.raw({ type: ['application/zip', 'application/octet-stream'], limit: '20mb' }),
    async (req, res) => {
      const captionRaw = typeof req.query?.caption === 'string' ? req.query.caption : ''
      const caption = captionRaw ? String(captionRaw).slice(0, 4096) : ''

      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([])
      if (buffer.length === 0) {
        res.status(400).json({ message: 'Arquivo inválido.' })
        return
      }

      try {
        const canUseTelegramChatId = await hasTelegramChatIdColumn()
        if (!canUseTelegramChatId) {
          res.status(503).json({ message: 'Envio via Telegram indisponível no momento.' })
          return
        }

        const userResult = await query('select telegram_chat_id, type from app_users where id = $1 limit 1', [req.auth.userId])
        const userRow = userResult.rows[0]
        const chatId = userRow && typeof userRow.telegram_chat_id === 'string' ? userRow.telegram_chat_id.trim() : ''
        const userType = userRow && typeof userRow.type === 'string' ? userRow.type : null

        if (!chatId) {
          res.status(400).json({ message: 'Configure seu ID do Telegram na Minha Área para enviar.' })
          return
        }

        const token = await getTelegramBotToken()
        if (!token) {
          res.status(503).json({ message: userType === 'admin' ? 'Telegram não configurado.' : 'Envio via Telegram indisponível no momento.' })
          return
        }

        const telegramBase = `https://api.telegram.org/bot${token}`
        const contentType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : 'application/octet-stream'

        const form = new FormData()
        form.set('chat_id', chatId)
        if (caption) {
          const safeCaption = caption.length > 1024 ? caption.slice(0, 1021) + '…' : caption
          form.set('caption', safeCaption)
        }
        form.set('document', new Blob([buffer], { type: contentType }), 'banners.zip')

        const r = await fetch(`${telegramBase}/sendDocument`, { method: 'POST', body: form })
        await r.json().catch(() => null)
        if (!r.ok) {
          res.status(502).json({ message: 'Não foi possível enviar via Telegram agora.' })
          return
        }

        if (caption.length > 1024) {
          const msgRes = await fetch(`${telegramBase}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: caption }),
          })
          if (!msgRes.ok) {
            res.json({ ok: true, warning: true })
            return
          }
        }

        res.json({ ok: true })
      } catch {
        res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
      }
    }
  )


}
