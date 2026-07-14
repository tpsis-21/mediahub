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
    normalizeEmail,
    createPasswordDigest,
    verifyPassword,
    getAllowRegistrations,
    resolveTrailerUrlFromProvider,
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
      `
      select query, timestamp, type
      from app_search_history
      where user_id = $1
      order by timestamp desc
      limit 10
      `,
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

  const listAdminTickets = async ({ limit = 15 } = {}) => {
    const result = await query(
      `
      select t.id, t.subject, t.status, t.updated_at, u.email as user_email, u.name as user_name, u.telegram_chat_id
      from tickets t
      join app_users u on u.id = t.user_id
      order by
        case when t.status = 'open' then 1
             when t.status = 'in_progress' then 2
             else 3 end,
        t.updated_at desc
      limit $1
      `,
      [limit],
    )
    return result.rows
  }

  const getTicketDetail = async ({ ticketId, requesterUserId, requesterType }) => {
    const id = Number(ticketId)
    if (!Number.isFinite(id)) return { ok: false, message: 'Chamado inválido.' }
    const ticketRes = await query(
      `
      select t.*, u.email as user_email, u.name as user_name, u.telegram_chat_id as user_telegram_chat_id
      from tickets t
      join app_users u on u.id = t.user_id
      where t.id = $1
      limit 1
      `,
      [id],
    )
    const ticket = ticketRes.rows[0]
    if (!ticket) return { ok: false, message: 'Chamado não encontrado.' }
    const isAdmin = requesterType === 'admin'
    if (!isAdmin && ticket.user_id !== requesterUserId) {
      return { ok: false, message: 'Acesso negado.' }
    }
    const messagesRes = await query(
      `
      select tm.message, tm.is_admin, tm.created_at, u.name, u.email
      from ticket_messages tm
      join app_users u on u.id = tm.user_id
      where tm.ticket_id = $1
      order by tm.created_at asc
      limit 40
      `,
      [id],
    )
    return { ok: true, ticket, messages: messagesRes.rows, isAdmin }
  }

  const addTicketMessage = async ({ ticketId, userId, message, asAdmin = false }) => {
    const id = Number(ticketId)
    const text = String(message || '').trim().slice(0, 2000)
    if (!Number.isFinite(id) || text.length < 1) {
      return { ok: false, message: 'Mensagem inválida.' }
    }
    const ticketRes = await query(`select * from tickets where id = $1 limit 1`, [id])
    const ticket = ticketRes.rows[0]
    if (!ticket) return { ok: false, message: 'Chamado não encontrado.' }

    const userRes = await query(`select type from app_users where id = $1 limit 1`, [userId])
    const type = userRes.rows[0]?.type
    const isAdmin = type === 'admin'
    if (asAdmin && !isAdmin) return { ok: false, message: 'Acesso negado.' }
    if (!isAdmin && ticket.user_id !== userId) return { ok: false, message: 'Acesso negado.' }

    await query(
      `insert into ticket_messages (ticket_id, user_id, message, is_admin) values ($1, $2, $3, $4)`,
      [id, userId, text, Boolean(asAdmin || (isAdmin && ticket.user_id !== userId))],
    )
    await query(`update tickets set updated_at = now() where id = $1`, [id])

    // se estava aberto e admin respondeu, marca em andamento
    if (isAdmin && ticket.user_id !== userId && ticket.status === 'open') {
      await query(`update tickets set status = 'in_progress', updated_at = now() where id = $1`, [id])
    }

    const detail = await getTicketDetail({
      ticketId: id,
      requesterUserId: userId,
      requesterType: type,
    })
    return { ok: true, ticket: detail.ticket || ticket, isAdminReply: isAdmin && ticket.user_id !== userId }
  }

  const updateTicketStatus = async ({ ticketId, status, adminUserId }) => {
    const admin = await query(`select type from app_users where id = $1 limit 1`, [adminUserId])
    if (admin.rows[0]?.type !== 'admin') return { ok: false, message: 'Acesso negado.' }
  const allowed = ['open', 'in_progress', 'closed', 'resolved']
  if (!allowed.includes(status)) return { ok: false, message: 'Status inválido.' }
    await query(`update tickets set status = $1, updated_at = now() where id = $2`, [status, ticketId])
    return { ok: true }
  }

  /** Destinos Telegram de admins (chat do bot ou chat_id do perfil). */
  const listAdminTelegramTargets = async () => {
    const result = await query(
      `
      select distinct chat_id from (
        select s.chat_id
        from telegram_bot_sessions s
        join app_users u on u.id = s.user_id
        where u.type = 'admin' and u.is_active = true
        union
        select u.telegram_chat_id as chat_id
        from app_users u
        where u.type = 'admin'
          and u.is_active = true
          and u.telegram_chat_id is not null
          and length(trim(u.telegram_chat_id)) > 0
      ) t
      where chat_id is not null and length(trim(chat_id)) > 0
      `,
    )
    return result.rows.map((r) => String(r.chat_id).trim()).filter(Boolean)
  }

  const getUserTelegramChatId = async (userId) => {
    const result = await query(
      `
      select coalesce(
        (select s.chat_id from telegram_bot_sessions s where s.user_id = $1 limit 1),
        (select u.telegram_chat_id from app_users u where u.id = $1 limit 1)
      ) as chat_id
      `,
      [userId],
    )
    const chat = result.rows[0]?.chat_id
    return chat ? String(chat).trim() : ''
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
      const userRes = await query(`select name, email from app_users where id = $1`, [userId])
      return {
        ok: true,
        id: ticketId,
        subject,
        message,
        userName: userRes.rows[0]?.name || '',
        userEmail: userRes.rows[0]?.email || '',
      }
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }

  /** Admin promove usuário a Premium pelo bot (dias). */
  const setUserPremium = async ({ adminUserId, targetEmail, days = 30 }) => {
    const admin = await query(`select type from app_users where id = $1`, [adminUserId])
    if (admin.rows[0]?.type !== 'admin') return { ok: false, message: 'Acesso negado.' }
    const email = String(targetEmail || '').trim().toLowerCase()
    if (!email.includes('@')) return { ok: false, message: 'E-mail inválido.' }
    const daysN = Math.max(1, Math.min(730, Number(days) || 30))
    const end = new Date(Date.now() + daysN * 24 * 60 * 60 * 1000)
    const updated = await query(
      `
      update app_users
      set type = 'premium',
          subscription_end = $1,
          updated_at = now()
      where email = $2 and is_active = true
      returning id, name, email, telegram_chat_id
      `,
      [end.toISOString(), email],
    )
    if (!updated.rows[0]) return { ok: false, message: 'Usuário não encontrado.' }
    return { ok: true, user: updated.rows[0], subscriptionEnd: end.toISOString(), days: daysN }
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

  const loginWithPassword = async ({ emailRaw, password }) => {
    const email = typeof normalizeEmail === 'function' ? normalizeEmail(emailRaw) : String(emailRaw || '').trim().toLowerCase()
    if (!email || !password) {
      return { ok: false, message: 'Informe e-mail e senha.' }
    }
    const result = await query('select * from app_users where email = $1 limit 1', [email])
    const row = result.rows[0]
    if (!row) return { ok: false, message: 'E-mail ou senha inválidos.' }

    if (typeof deactivateExpiredPremiumByUserId === 'function') {
      await deactivateExpiredPremiumByUserId(row.id)
    }
    const currentResult = await query('select * from app_users where id = $1 limit 1', [row.id])
    const currentRow = currentResult.rows[0] || row
    if (!currentRow.is_active) {
      return { ok: false, message: 'Sua conta está inativa. Fale com o suporte.' }
    }

    const ok = await verifyPassword({
      password,
      digest: {
        hash: currentRow.password_hash,
        salt: currentRow.password_salt,
        iterations: currentRow.password_iterations,
      },
    })
    if (!ok) return { ok: false, message: 'E-mail ou senha inválidos.' }

    return {
      ok: true,
      userId: currentRow.id,
      email: currentRow.email,
      name: currentRow.name,
      type: currentRow.type,
    }
  }

  const registerWithPassword = async ({ emailRaw, password, name, brandName, phone = '' }) => {
    const email = typeof normalizeEmail === 'function' ? normalizeEmail(emailRaw) : String(emailRaw || '').trim().toLowerCase()
    const nameTrim = String(name || '').trim()
    const brandTrim = String(brandName || '').trim() || nameTrim
    const phoneTrim = String(phone || '').trim()

    if (!email || !password || !nameTrim) {
      return { ok: false, message: 'Preencha nome, e-mail e senha.' }
    }
    if (String(password).length < 6) {
      return { ok: false, message: 'A senha precisa ter pelo menos 6 caracteres.' }
    }

    if (typeof getAllowRegistrations === 'function') {
      const allow = await getAllowRegistrations()
      if (!allow) {
        return { ok: false, message: 'Cadastros estão temporariamente fechados. Use /entrar se já tiver conta.' }
      }
    }

    try {
      const digest = await createPasswordDigest(password)
      const bootstrapAdminEmail =
        typeof process.env.ADMIN_BOOTSTRAP_EMAIL === 'string'
          ? process.env.ADMIN_BOOTSTRAP_EMAIL.trim().toLowerCase()
          : 'admin@mediahub.com'
      const isAdmin = Boolean(bootstrapAdminEmail && email === bootstrapAdminEmail)

      const created = await query(
        `
        insert into app_users
          (email, name, phone, type, is_active, subscription_end, brand_name, brand_colors, password_hash, password_salt, password_iterations)
        values
          ($1, $2, nullif($3,''), $4, true, null, $5, $6, $7, $8, $9)
        returning id, email, name, type
        `,
        [
          email,
          nameTrim,
          phoneTrim,
          isAdmin ? 'admin' : 'free',
          brandTrim,
          JSON.stringify({ primary: '#3b82f6', secondary: '#8b5cf6' }),
          digest.hash,
          digest.salt,
          digest.iterations,
        ],
      )
      const row = created.rows[0]
      return { ok: true, userId: row.id, email: row.email, name: row.name, type: row.type }
    } catch (e) {
      const message = String(e?.message || '')
      if (message.includes('unique') || message.includes('duplicate')) {
        return { ok: false, message: 'Este e-mail já está cadastrado. Use /entrar.' }
      }
      return { ok: false, message: 'Não foi possível criar a conta. Tente novamente.' }
    }
  }

  const changePassword = async ({ userId, currentPassword, newPassword }) => {
    if (!currentPassword || !newPassword) {
      return { ok: false, message: 'Informe a senha atual e a nova.' }
    }
    if (String(newPassword).length < 6) {
      return { ok: false, message: 'A nova senha precisa ter pelo menos 6 caracteres.' }
    }
    const result = await query(
      `select password_hash, password_salt, password_iterations from app_users where id = $1 limit 1`,
      [userId],
    )
    const row = result.rows[0]
    if (!row) return { ok: false, message: 'Conta não encontrada.' }
    const ok = await verifyPassword({
      password: currentPassword,
      digest: {
        hash: row.password_hash,
        salt: row.password_salt,
        iterations: row.password_iterations,
      },
    })
    if (!ok) return { ok: false, message: 'Senha atual incorreta.' }
    const digest = await createPasswordDigest(newPassword)
    await query(
      `
      update app_users
      set password_hash = $1, password_salt = $2, password_iterations = $3, updated_at = now()
      where id = $4
      `,
      [digest.hash, digest.salt, digest.iterations, userId],
    )
    return { ok: true }
  }

  const findTrailerUrl = async ({ userId, mediaType, mediaId }) => {
    if (typeof resolveTrailerUrlFromProvider !== 'function') {
      return { ok: false, message: 'Trailer indisponível neste servidor.' }
    }
    const profile = await loadUserKey(userId)
    if (!profile) return { ok: false, message: 'Conta indisponível.' }
    const id = Number(mediaId)
    if (!Number.isFinite(id) || id <= 0) {
      return { ok: false, message: 'Título inválido para trailer.' }
    }
    try {
      const url = await resolveTrailerUrlFromProvider({
        mediaType: mediaType === 'tv' ? 'tv' : 'movie',
        id,
        userKey: profile.userKey,
      })
      if (!url) return { ok: false, message: 'Não encontrei trailer para este título.' }
      return { ok: true, url }
    } catch {
      return { ok: false, message: 'Não foi possível buscar o trailer agora.' }
    }
  }

  return {
    searchTitles,
    buildPosterUrl,
    getHistory,
    getFootballSchedule,
    refreshFootball,
    listTickets,
    listAdminTickets,
    getTicketDetail,
    addTicketMessage,
    updateTicketStatus,
    listAdminTelegramTargets,
    getUserTelegramChatId,
    createTicket,
    setUserPremium,
    getUserBrand,
    getTrending,
    loginWithPassword,
    registerWithPassword,
    changePassword,
    findTrailerUrl,
  }
}
