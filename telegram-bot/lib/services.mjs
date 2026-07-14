/**
 * Serviços de domínio usados pelos handlers (sem HTTP interno).
 */
export const createBotServices = (deps) => {
  const {
    query,
    pool,
    assertAndIncrementDailySearchQuota,
    getSearchProviderSettingsKeys,
    getSearchProviderImageBaseUrl,
    fetchSearchProviderJson,
    getSearchProviderCache,
    setSearchProviderCache,
    getStableObjectKey,
    uniqStrings,
    getSearchProviderErrorMessage,
    ensureSearchHistorySchema,
    getFootballSettings,
    getZonedNowParts,
    getDefaultFootballScheduleDate,
    refreshFootballSchedule,
    parseClockTime,
    normalizeFootballCrestUrl,
    normalizeFootballSearchText,
    isPlaceholderFootballTeamCrestUrl,
    getTicketsEnabled,
    deactivateExpiredPremiumByUserId,
    normalizeTrendingPayload,
  } = deps

  const loadUserKey = async (userId) => {
    try {
      const result = await query(
        `select search_api_key, type, is_active, subscription_end from app_users where id = $1 limit 1`,
        [userId],
      )
      const row = result.rows[0]
      if (!row || !row.is_active) return null
      if (typeof deactivateExpiredPremiumByUserId === 'function') {
        await deactivateExpiredPremiumByUserId(userId)
      }
      return {
        userKey: typeof row.search_api_key === 'string' ? row.search_api_key.trim() : '',
        type: row.type,
      }
    } catch {
      return { userKey: '', type: null }
    }
  }

  const searchTitles = async ({ userId, queryText, type = 'multi' }) => {
    const quota = await assertAndIncrementDailySearchQuota(userId)
    if (!quota.ok) {
      return { ok: false, message: quota.message }
    }
    const profile = await loadUserKey(userId)
    if (!profile) return { ok: false, message: 'Conta indisponível.' }

    const settingsKeys = await getSearchProviderSettingsKeys()
    const apiKeys = uniqStrings([profile.userKey, ...settingsKeys])
    const searchPath = type === 'movie' ? '/search/movie' : type === 'tv' ? '/search/tv' : '/search/multi'
    const params = {
      query: queryText,
      language: 'pt-BR',
      include_adult: 'false',
    }

    try {
      const cacheKey = `bot-search:${searchPath}:${getStableObjectKey(params)}`
      let payload = getSearchProviderCache(cacheKey)
      if (!payload) {
        payload = await fetchSearchProviderJson({ path: searchPath, params, apiKeys })
        setSearchProviderCache({ key: cacheKey, data: payload, ttlMs: 30_000, maxEntries: 250 })
      }

      const results = Array.isArray(payload?.results) ? payload.results : []
      const items = results.slice(0, 10).map((r) => {
        const mediaType = r.media_type === 'tv' || type === 'tv' ? 'tv' : 'movie'
        const title = mediaType === 'tv' ? r.name || r.original_name : r.title || r.original_title
        const date = mediaType === 'tv' ? r.first_air_date : r.release_date
        const year = typeof date === 'string' && date.length >= 4 ? date.slice(0, 4) : ''
        return {
          id: r.id,
          mediaType,
          title: String(title || 'Sem título').trim(),
          year,
          overview: typeof r.overview === 'string' ? r.overview.trim().slice(0, 400) : '',
          posterPath: typeof r.poster_path === 'string' ? r.poster_path : '',
        }
      })

      try {
        await ensureSearchHistorySchema()
        await query(
          `
          insert into app_search_history (user_id, query, results, timestamp, type)
          values ($1, $2, $3::jsonb, $4, 'individual')
          `,
          [userId, queryText, JSON.stringify(items.slice(0, 5)), Date.now()],
        )
      } catch {
        /* histórico opcional */
      }

      return { ok: true, items }
    } catch (e) {
      const status = typeof e?.status === 'number' ? e.status : e?.code === 'SEARCH_PROVIDER_NOT_CONFIGURED' ? 503 : 502
      return {
        ok: false,
        message: getSearchProviderErrorMessage({ userType: profile.type, status, code: e?.code }),
      }
    }
  }

  const buildPosterUrl = async (posterPath) => {
    if (!posterPath) return ''
    if (posterPath.startsWith('http')) return posterPath
    const base = await getSearchProviderImageBaseUrl()
    const b = String(base || '').replace(/\/$/, '')
    const p = posterPath.startsWith('/') ? posterPath : `/${posterPath}`
    return b ? `${b}/w500${p}` : ''
  }

  const getHistory = async (userId) => {
    await ensureSearchHistorySchema()
    const result = await query(
      `select query, timestamp from app_search_history where user_id = $1 order by timestamp desc limit 10`,
      [userId],
    )
    return result.rows
  }

  const mergeScheduleRows = (rows) => {
    const mergedMap = new Map()
    for (const row of rows) {
      const list = Array.isArray(row.matches) ? row.matches : []
      for (const item of list) {
        const time = parseClockTime(item?.time)
        const home = typeof item?.home === 'string' ? item.home.trim() : ''
        const away = typeof item?.away === 'string' ? item.away.trim() : ''
        const competition = typeof item?.competition === 'string' ? item.competition.trim() : ''
        const channels = Array.isArray(item?.channels)
          ? item.channels.map((c) => String(c || '').trim()).filter(Boolean)
          : []
        const homeCrestUrl = normalizeFootballCrestUrl(
          typeof item?.homeCrestUrl === 'string' ? item.homeCrestUrl.trim() : '',
        )
        const awayCrestUrl = normalizeFootballCrestUrl(
          typeof item?.awayCrestUrl === 'string' ? item.awayCrestUrl.trim() : '',
        )
        if (!time || !home || !away) continue
        const key = `${time}::${normalizeFootballSearchText(home)}::${normalizeFootballSearchText(away)}`
        const existing = mergedMap.get(key)
        if (!existing) {
          mergedMap.set(key, { time, home, away, competition, channels, homeCrestUrl, awayCrestUrl })
          continue
        }
        if (!existing.competition && competition) existing.competition = competition
        if (channels.length) existing.channels = uniqStrings([...(existing.channels || []), ...channels])
        if (
          (!existing.homeCrestUrl || isPlaceholderFootballTeamCrestUrl(existing.homeCrestUrl)) &&
          homeCrestUrl &&
          !isPlaceholderFootballTeamCrestUrl(homeCrestUrl)
        ) {
          existing.homeCrestUrl = homeCrestUrl
        }
        if (
          (!existing.awayCrestUrl || isPlaceholderFootballTeamCrestUrl(existing.awayCrestUrl)) &&
          awayCrestUrl &&
          !isPlaceholderFootballTeamCrestUrl(awayCrestUrl)
        ) {
          existing.awayCrestUrl = awayCrestUrl
        }
      }
    }
    return Array.from(mergedMap.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)))
  }

  const getFootballSchedule = async (dateRaw) => {
    const settings = await getFootballSettings()
    const nowParts = getZonedNowParts({ timeZone: settings.timeZone })
    const date =
      /^\d{4}-\d{2}-\d{2}$/.test(String(dateRaw || ''))
        ? dateRaw
        : getDefaultFootballScheduleDate({
            nowDateIso: nowParts.date,
            nowTime: nowParts.time,
            readTime: settings.readWindowEnd || settings.readTime,
          })

    const result = await query(
      `
      select distinct on (fs.source_id) fs.matches, fs.fetched_at
      from football_schedules fs
      join football_sources s on s.id = fs.source_id
      where fs.schedule_date = $1
        and s.is_active = true
      order by fs.source_id, fs.fetched_at desc nulls last
      `,
      [date],
    )
    const matches = mergeScheduleRows(result.rows)
    return { date, matches }
  }

  const refreshFootball = async (dateRaw) => {
    const settings = await getFootballSettings()
    const nowParts = getZonedNowParts({ timeZone: settings.timeZone })
    const scheduleDateIso =
      /^\d{4}-\d{2}-\d{2}$/.test(String(dateRaw || ''))
        ? dateRaw
        : getDefaultFootballScheduleDate({
            nowDateIso: nowParts.date,
            nowTime: nowParts.time,
            readTime: settings.readWindowEnd || settings.readTime,
          })
    const results = await refreshFootballSchedule({ scheduleDateIso, timeZone: settings.timeZone })
    const schedule = await getFootballSchedule(scheduleDateIso)
    return { results, ...schedule }
  }

  const listTickets = async (userId) => {
    const result = await query(
      `select id, subject, status, updated_at from tickets where user_id = $1 order by updated_at desc limit 10`,
      [userId],
    )
    return result.rows
  }

  const createTicket = async ({ userId, subject, message }) => {
    const enabled = await getTicketsEnabled()
    if (!enabled) {
      const user = await query(`select type from app_users where id = $1`, [userId])
      if (user.rows[0]?.type !== 'admin') {
        return { ok: false, message: 'Suporte temporariamente indisponível.' }
      }
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const ticketRes = await client.query(
        `insert into tickets (user_id, subject, priority) values ($1, $2, 'medium') returning id`,
        [userId, subject],
      )
      const ticketId = ticketRes.rows[0].id
      await client.query(
        `insert into ticket_messages (ticket_id, user_id, message, is_admin) values ($1, $2, $3, false)`,
        [ticketId, userId, message],
      )
      await client.query('COMMIT')
      return { ok: true, id: ticketId }
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }

  const getUserBrand = async (userId) => {
    const result = await query(
      `
      select name, brand_name, brand_colors, brand_logo, type
      from app_users
      where id = $1
      limit 1
      `,
      [userId],
    )
    const row = result.rows[0]
    if (!row) return null
    const colors = row.brand_colors && typeof row.brand_colors === 'object' ? row.brand_colors : {}
    return {
      brandName: (typeof row.brand_name === 'string' && row.brand_name.trim()) || row.name || 'MediaHub',
      primary: typeof colors.primary === 'string' ? colors.primary : '#0F172A',
      secondary: typeof colors.secondary === 'string' ? colors.secondary : '#1D4ED8',
      brandLogo: typeof row.brand_logo === 'string' ? row.brand_logo : '',
      type: row.type,
    }
  }

  const getTrending = async ({ userId, mediaType = 'all' }) => {
    const profile = await loadUserKey(userId)
    if (!profile) return { ok: false, message: 'Conta indisponível.', items: [] }
    const settingsKeys = await getSearchProviderSettingsKeys()
    const apiKeys = uniqStrings([profile.userKey, ...settingsKeys])
    const type = mediaType === 'movie' || mediaType === 'tv' ? mediaType : 'all'
    try {
      const cacheKey = `bot-trending:${type}:week:pt-BR`
      let payload = getSearchProviderCache(cacheKey)
      if (!payload) {
        const raw = await fetchSearchProviderJson({
          path: `/trending/${type}/week`,
          params: { language: 'pt-BR' },
          apiKeys,
        })
        payload = typeof normalizeTrendingPayload === 'function' ? normalizeTrendingPayload(raw, type) : raw
        setSearchProviderCache({ key: cacheKey, data: payload, ttlMs: 10 * 60_000, maxEntries: 50 })
      }
      const results = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : []
      const items = results.slice(0, 10).map((r) => {
        const media = r.media_type === 'tv' || type === 'tv' ? 'tv' : 'movie'
        const title = media === 'tv' ? r.name || r.original_name : r.title || r.original_title
        const date = media === 'tv' ? r.first_air_date : r.release_date
        const year = typeof date === 'string' && date.length >= 4 ? date.slice(0, 4) : ''
        return {
          id: r.id,
          mediaType: media,
          title: String(title || 'Sem título').trim(),
          year,
          posterPath: typeof r.poster_path === 'string' ? r.poster_path : '',
        }
      })
      return { ok: true, items }
    } catch (e) {
      const status = typeof e?.status === 'number' ? e.status : e?.code === 'SEARCH_PROVIDER_NOT_CONFIGURED' ? 503 : 502
      return {
        ok: false,
        message: getSearchProviderErrorMessage({ userType: profile.type, status, code: e?.code }),
        items: [],
      }
    }
  }

  return {
    searchTitles,
    buildPosterUrl,
    getHistory,
    getFootballSchedule,
    refreshFootball,
    listTickets,
    createTicket,
    getUserBrand,
    getTrending,
  }
}
