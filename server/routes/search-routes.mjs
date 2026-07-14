/**
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerSearchRoutes = (app, deps) => {
  const {
    requireAuth,
    rateLimitSearch,
    readOptionalAuthUserContext,
    getSearchProviderBaseUrl,
    getSearchProviderImageBaseUrl,
    getSearchProviderSettingsKeys,
    uniqStrings,
    getSearchProviderCache,
    setSearchProviderCache,
    getStableObjectKey,
    fetchSearchProviderJson,
    normalizeTrendingPayload,
    getSearchProviderErrorMessage,
    assertAndIncrementDailySearchQuota,
  } = deps

  app.get('/api/search/status', async (req, res) => {
    const userContext = await readOptionalAuthUserContext(req)
    const baseUrl = await getSearchProviderBaseUrl()
    const settingsKeys = await getSearchProviderSettingsKeys()
    const hasUserKey = Boolean(userContext.userKey && userContext.userKey.trim())
    const hasSystemKey = settingsKeys.length > 0
    const apiKeys = uniqStrings([userContext.userKey, ...settingsKeys])
    const configured = Boolean(baseUrl) && apiKeys.length > 0
    const scope = !baseUrl ? 'none' : hasUserKey ? 'user' : hasSystemKey ? 'system' : 'none'
    res.json({ configured, scope })
  })

  app.get('/api/search/trending', requireAuth, async (req, res) => {
    const mediaType = req.query?.mediaType === 'movie' || req.query?.mediaType === 'tv' ? req.query.mediaType : 'all'
    const language = typeof req.query?.language === 'string' ? req.query.language.trim().slice(0, 10) : 'pt-BR'
    const userContext = await readOptionalAuthUserContext(req)
    const settingsKeys = await getSearchProviderSettingsKeys()
    const apiKeys = uniqStrings([userContext.userKey, ...settingsKeys])

    try {
      const cacheKey = `trending:${mediaType}:week:${language}`
      const cached = getSearchProviderCache(cacheKey)
      if (cached) {
        res.json(normalizeTrendingPayload(cached, mediaType))
        return
      }

      const raw = await fetchSearchProviderJson({
        path: `/trending/${mediaType}/week`,
        params: { language },
        apiKeys,
      })
      const payload = normalizeTrendingPayload(raw, mediaType)
      setSearchProviderCache({ key: cacheKey, data: payload, ttlMs: 10 * 60_000, maxEntries: 50 })
      res.json(payload)
    } catch (e) {
      const status = typeof e?.status === 'number' ? e.status : e?.code === 'SEARCH_PROVIDER_NOT_CONFIGURED' ? 503 : 502
      if (status === 429) {
        res.status(429).json({ message: 'Limite de requisições atingido. Tente novamente em instantes.' })
        return
      }
      res.status(status).json({
        message: getSearchProviderErrorMessage({ userType: userContext.userType, status, code: e?.code }),
      })
    }
  })

  app.get('/api/search/image', requireAuth, rateLimitSearch, async (req, res) => {
    const sizeRaw = typeof req.query?.size === 'string' ? req.query.size.trim() : 'w780'
    const pathRaw = typeof req.query?.path === 'string' ? req.query.path.trim() : ''
    const download = req.query?.download === '1' || req.query?.download === 'true'
    const filenameRaw = typeof req.query?.filename === 'string' ? req.query.filename.trim() : ''

    const allowedSizes = new Set(['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'w1280', 'original'])
    const size = allowedSizes.has(sizeRaw) ? sizeRaw : 'w780'

    if (!pathRaw || !pathRaw.startsWith('/') || pathRaw.includes('..') || pathRaw.includes('\\')) {
      res.status(400).json({ message: 'Imagem inválida.' })
      return
    }

    const safeName = filenameRaw
      ? filenameRaw.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)
      : 'imagem.jpg'
    const filename = safeName.toLowerCase().endsWith('.jpg') || safeName.toLowerCase().endsWith('.jpeg') || safeName.toLowerCase().endsWith('.png')
      ? safeName
      : `${safeName}.jpg`

    try {
      const imageBaseUrl = await getSearchProviderImageBaseUrl()
      if (!imageBaseUrl) {
        res.status(503).json({ message: 'Imagem indisponível no momento.' })
        return
      }
      const url = `${imageBaseUrl}/${size}${pathRaw}`
      const upstream = await fetch(url)
      if (!upstream.ok) {
        res.status(502).json({ message: 'Não foi possível baixar a imagem agora.' })
        return
      }

      const contentType = upstream.headers.get('content-type') || 'image/jpeg'
      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      if (download) {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      }

      const buffer = Buffer.from(await upstream.arrayBuffer())
      res.status(200).send(buffer)
    } catch {
      res.status(502).json({ message: 'Não foi possível baixar a imagem agora.' })
    }
  })

  app.get('/api/search/query', requireAuth, rateLimitSearch, async (req, res) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DEBUG] Search Request:', {
        url: req.url,
        auth: Boolean(req.headers.authorization || req.headers.cookie),
        query: req.query,
      })
    }
    const type = req.query?.type === 'movie' || req.query?.type === 'tv' ? req.query.type : 'multi'
    const queryText = typeof req.query?.query === 'string' ? req.query.query.trim().slice(0, 120) : ''
    const language = typeof req.query?.language === 'string' ? req.query.language.trim().slice(0, 10) : 'pt-BR'
    const yearRaw = typeof req.query?.year === 'string' ? req.query.year.trim() : ''
    const year = /^\d{4}$/.test(yearRaw) ? yearRaw : ''

    if (!queryText) {
      res.status(400).json({ message: 'Consulta inválida.' })
      return
    }

    const quota = await assertAndIncrementDailySearchQuota(req.auth.userId)
    if (!quota.ok) {
      res.status(quota.status).json({ message: quota.message })
      return
    }

    const userContext = await readOptionalAuthUserContext(req)

    const settingsKeys = await getSearchProviderSettingsKeys()
    const apiKeys = uniqStrings([userContext.userKey, ...settingsKeys])
    const searchPath = type === 'movie' ? '/search/movie' : type === 'tv' ? '/search/tv' : '/search/multi'
    const params = {
      query: queryText,
      language,
      include_adult: 'false',
      ...(type === 'movie' && year ? { year } : null),
      ...(type === 'tv' && year ? { first_air_date_year: year } : null),
    }

    try {
      const cacheKey = `search:${searchPath}:${getStableObjectKey(params)}`
      const cached = getSearchProviderCache(cacheKey)
      if (cached) {
        res.json(cached)
        return
      }

      const payload = await fetchSearchProviderJson({ path: searchPath, params, apiKeys })
      setSearchProviderCache({ key: cacheKey, data: payload, ttlMs: 30_000, maxEntries: 250 })
      res.json(payload)
    } catch (e) {
      const status = typeof e?.status === 'number' ? e.status : e?.code === 'SEARCH_PROVIDER_NOT_CONFIGURED' ? 503 : 502
      if (status === 429) {
        res.status(429).json({ message: 'Limite de requisições atingido. Tente novamente em instantes.' })
        return
      }
      res.status(status).json({
        message: getSearchProviderErrorMessage({ userType: userContext.userType, status, code: e?.code }),
      })
    }
  })

  app.get('/api/search/videos', requireAuth, rateLimitSearch, async (req, res) => {
    const mediaType = req.query?.mediaType === 'tv' ? 'tv' : 'movie'
    const id = typeof req.query?.id === 'string' ? Number(req.query.id) : NaN
    const language = typeof req.query?.language === 'string' ? req.query.language.trim().slice(0, 10) : 'pt-BR'

    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ message: 'Dados inválidos.' })
      return
    }

    const userContext = await readOptionalAuthUserContext(req)

    const settingsKeys = await getSearchProviderSettingsKeys()
    const apiKeys = uniqStrings([userContext.userKey, ...settingsKeys])
    try {
      const cacheKey = `videos:${mediaType}:${id}:${language}`
      const cached = getSearchProviderCache(cacheKey)
      if (cached) {
        res.json(cached)
        return
      }

      const payload = await fetchSearchProviderJson({
        path: `/${mediaType}/${id}/videos`,
        params: { language },
        apiKeys,
      })
      setSearchProviderCache({ key: cacheKey, data: payload, ttlMs: 15 * 60_000, maxEntries: 500 })
      res.json(payload)
    } catch (e) {
      const status = typeof e?.status === 'number' ? e.status : e?.code === 'SEARCH_PROVIDER_NOT_CONFIGURED' ? 503 : 502
      if (status === 429) {
        res.status(429).json({ message: 'Limite de requisições atingido. Tente novamente em instantes.' })
        return
      }
      res.status(status).json({
        message: getSearchProviderErrorMessage({ userType: userContext.userType, status, code: e?.code }),
      })
    }
  })

  app.get('/api/search/details', requireAuth, async (req, res) => {
    const mediaType = req.query?.mediaType === 'tv' ? 'tv' : 'movie'
    const id = typeof req.query?.id === 'string' ? Number(req.query.id) : NaN
    const language = typeof req.query?.language === 'string' ? req.query.language.trim().slice(0, 10) : 'pt-BR'

    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ message: 'Dados inválidos.' })
      return
    }

    const userContext = await readOptionalAuthUserContext(req)
    const settingsKeys = await getSearchProviderSettingsKeys()
    const apiKeys = uniqStrings([userContext.userKey, ...settingsKeys])

    try {
      const cacheKey = `details:${mediaType}:${id}:${language}`
      const cached = getSearchProviderCache(cacheKey)
      if (cached) {
        res.json(cached)
        return
      }

      const payload = await fetchSearchProviderJson({
        path: `/${mediaType}/${id}`,
        params: { language },
        apiKeys,
      })

      const genresRaw = payload && Array.isArray(payload.genres) ? payload.genres : []
      const genres = genresRaw
        .map((g) => ({
          id: typeof g?.id === 'number' ? g.id : null,
          name: typeof g?.name === 'string' ? g.name.trim() : '',
        }))
        .filter((g) => Boolean(g.name))

      const data = {
        vote_average: typeof payload?.vote_average === 'number' ? payload.vote_average : 0,
        vote_count: typeof payload?.vote_count === 'number' ? payload.vote_count : 0,
        genres,
      }

      setSearchProviderCache({ key: cacheKey, data, ttlMs: 15 * 60_000, maxEntries: 500 })
      res.json(data)
    } catch (e) {
      const status = typeof e?.status === 'number' ? e.status : e?.code === 'SEARCH_PROVIDER_NOT_CONFIGURED' ? 503 : 502
      if (status === 429) {
        res.status(429).json({ message: 'Limite de requisições atingido. Tente novamente em instantes.' })
        return
      }
      res.status(status).json({
        message: getSearchProviderErrorMessage({ userType: userContext.userType, status, code: e?.code }),
      })
    }
  })
}
