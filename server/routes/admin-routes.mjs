/**
 * Rotas administrativas.
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerAdminRoutes = (app, deps) => {
  const {
    requireAdmin,
    requireAuth,
    appendDebugNdjsonToSessionFiles,
    ensureSearchHistorySchema,
    getAllowRegistrations,
    getDefaultFootballScheduleDate,
    getFootballSettings,
    getSearchProviderBaseUrl,
    getSearchProviderSettingsKeys,
    getTicketsEnabled,
    getZonedNowParts,
    migrateSearchProviderSettingsKeysIfNeeded,
    clearSearchProviderSettingsCache,
    SEARCH_PROVIDER_SETTINGS_KEYS,
    setTelegramTokenCache,
    normalizeEmail,
    normalizeFootballCrestUrl,
    normalizeFootballFilterToken,
    parseClockTime,
    query,
    refreshFootballSchedule,
    setAppSettingValue,
    sniffImageMimeFromBuffer,
    uniqStrings,
    createPasswordDigest,
    generateRandomPassword,
    pool,
    FOOTBALL_SETTINGS_KEYS,
  } = deps

  app.get('/api/admin/telegram', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const result = await query('select value from app_settings where key = $1 limit 1', ['telegram_bot_token'])
      const row = result.rows[0]
      const token = row && typeof row.value === 'string' ? row.value : ''
      res.json({ configured: Boolean(token && token.trim()) })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.put('/api/admin/telegram', requireAuth, requireAdmin, async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
    try {
      await query(
        `
        insert into app_settings (key, value, updated_at)
        values ($1, $2, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()
        `,
        ['telegram_bot_token', token]
      )
      if (typeof setTelegramTokenCache === 'function') {
        setTelegramTokenCache({ token, fetchedAt: Date.now() })
      }
      res.status(204).end()
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.get('/api/admin/search-provider', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { primaryValue, secondaryValue } = await migrateSearchProviderSettingsKeysIfNeeded()
      res.json({
        primaryConfigured: Boolean(primaryValue),
        secondaryConfigured: Boolean(secondaryValue),
      })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.put('/api/admin/search-provider', requireAuth, requireAdmin, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const hasPrimary = Object.prototype.hasOwnProperty.call(body, 'primary')
    const hasSecondary = Object.prototype.hasOwnProperty.call(body, 'secondary')

    const primary = hasPrimary && typeof body.primary === 'string' ? body.primary.trim() : undefined
    const secondary = hasSecondary && typeof body.secondary === 'string' ? body.secondary.trim() : undefined

    try {
      const entries = []
      if (primary !== undefined) entries.push([SEARCH_PROVIDER_SETTINGS_KEYS.primary, primary])
      if (secondary !== undefined) entries.push([SEARCH_PROVIDER_SETTINGS_KEYS.secondary, secondary])

      if (entries.length === 0) {
        res.status(400).json({ message: 'Dados inválidos.' })
        return
      }

      const params = []
      const valuesSql = entries
        .map(([key, value], index) => {
          const i = index * 2
          params.push(key, value)
          return `($${i + 1}, $${i + 2}, now())`
        })
        .join(', ')

      await query(
        `
        insert into app_settings (key, value, updated_at)
        values ${valuesSql}
        on conflict (key) do update set value = excluded.value, updated_at = now()
        `,
        params
      )
      if (typeof clearSearchProviderSettingsCache === 'function') {
        clearSearchProviderSettingsCache()
      }
      res.status(204).end()
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.get('/api/admin/dashboard', requireAuth, requireAdmin, async (_req, res) => {
    try {
      await ensureSearchHistorySchema()
      const now = Date.now()
      const since24h = now - 24 * 60 * 60 * 1000
      const since7d = now - 7 * 24 * 60 * 60 * 1000

      const usersTotalPromise = query('select count(*)::int as value from app_users')
      const usersActivePromise = query('select count(*)::int as value from app_users where is_active = true')
      const usersByTypePromise = query('select type, count(*)::int as value from app_users group by type')
      const premiumExpiringSoonPromise = query(
        `
        select count(*)::int as value
        from app_users
        where type = 'premium'
          and is_active = true
          and subscription_end is not null
          and subscription_end >= now()
          and subscription_end < now() + interval '7 days'
        `
      )
      const premiumExpiredPromise = query(
        `
        select count(*)::int as value
        from app_users
        where type = 'premium'
          and is_active = true
          and subscription_end is not null
          and subscription_end < now()
        `
      )
      const searchesTotalPromise = query('select count(*)::int as value from app_search_history')
      const searches24hPromise = query('select count(*)::int as value from app_search_history where timestamp >= $1', [since24h])
      const topQueries7dPromise = query(
        `
        select query, count(*)::int as value
        from app_search_history
        where timestamp >= $1
        group by query
        order by value desc
        limit 10
        `,
        [since7d]
      )
      const topQueriesAllPromise = query(
        `
        select query, count(*)::int as value
        from app_search_history
        group by query
        order by value desc
        limit 10
        `
      )

      const [usersTotal, usersActive, usersByType, premiumExpiringSoon, premiumExpired, searchesTotal, searches24h, topQueries7d, topQueriesAll] = await Promise.all([
        usersTotalPromise,
        usersActivePromise,
        usersByTypePromise,
        premiumExpiringSoonPromise,
        premiumExpiredPromise,
        searchesTotalPromise,
        searches24hPromise,
        topQueries7dPromise,
        topQueriesAllPromise,
      ])
      const topRows = topQueries7d.rows.length > 0 ? topQueries7d.rows : topQueriesAll.rows

      const allowRegistrations = await getAllowRegistrations()
      const baseUrl = await getSearchProviderBaseUrl()
      const searchKeys = uniqStrings([...(await getSearchProviderSettingsKeys())])
      const searchConfigured = Boolean(baseUrl) && searchKeys.length > 0
      const typesMap = new Map(usersByType.rows.map((row) => [row.type, row.value]))

      res.json({
        users: {
          total: usersTotal.rows[0]?.value ?? 0,
          active: usersActive.rows[0]?.value ?? 0,
          byType: {
            admin: typesMap.get('admin') ?? 0,
            premium: typesMap.get('premium') ?? 0,
            free: typesMap.get('free') ?? 0,
          },
          premiumExpiringSoon: premiumExpiringSoon.rows[0]?.value ?? 0,
          premiumExpired: premiumExpired.rows[0]?.value ?? 0,
        },
        searches: {
          total: searchesTotal.rows[0]?.value ?? 0,
          last24h: searches24h.rows[0]?.value ?? 0,
          topQueries7d: topRows.map((row) => ({ query: row.query, count: row.value })),
        },
        system: {
          allowRegistrations,
          searchConfigured,
        },
      })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    const q = typeof req.query?.q === 'string' ? req.query.q.trim().slice(0, 120) : ''
    const limitRaw = typeof req.query?.limit === 'string' ? Number(req.query.limit) : NaN
    const offsetRaw = typeof req.query?.offset === 'string' ? Number(req.query.offset) : NaN
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 100) : 50
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0

    try {
      const where = q
        ? `where email ilike $1 or name ilike $1 or coalesce(brand_name,'') ilike $1`
        : ``
      const values = q ? [`%${q}%`, limit, offset] : [limit, offset]
      const queryText = q
        ? `
          select id, email, name, type, is_active, brand_name, subscription_end, phone, website, created_at, updated_at
          from app_users
          ${where}
          order by created_at desc
          limit $2 offset $3
        `
        : `
          select id, email, name, type, is_active, brand_name, subscription_end, phone, website, created_at, updated_at
          from app_users
          order by created_at desc
          limit $1 offset $2
        `

      const result = await query(queryText, values)
      res.json({
        items: result.rows.map((row) => ({
          id: row.id,
          email: row.email,
          name: row.name,
          type: row.type,
          isActive: Boolean(row.is_active),
          brandName: row.brand_name || undefined,
          subscriptionEnd: row.subscription_end || undefined,
          phone: row.phone || undefined,
          website: row.website || undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    const email = normalizeEmail(req.body?.email)
    const password = String(req.body?.password || '')
    const name = String(req.body?.name || '').trim()
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : ''
    const website = typeof req.body?.website === 'string' ? req.body.website.trim() : ''
    const brandName = String(req.body?.brandName || '').trim()
    const type = req.body?.type === 'admin' || req.body?.type === 'premium' ? req.body.type : 'free'
    const subscriptionEndRaw = typeof req.body?.subscriptionEnd === 'string' ? req.body.subscriptionEnd.trim() : ''
    const subscriptionEnd = subscriptionEndRaw ? new Date(subscriptionEndRaw).toISOString() : null

    if (!email || !password || !name || !brandName) {
      res.status(400).json({ message: 'Preencha os campos obrigatórios.' })
      return
    }

    try {
      const digest = await createPasswordDigest(password)
      const created = await query(
        `
        insert into app_users
          (email, name, phone, website, type, is_active, subscription_end, brand_name, brand_colors, password_hash, password_salt, password_iterations)
        values
          ($1, $2, nullif($3,''), nullif($4,''), $5, true, $6, $7, $8, $9, $10, $11)
        returning id, email, name, type, is_active, brand_name, subscription_end, created_at, updated_at
        `,
        [
          email,
          name,
          phone,
          website,
          type,
          type === 'premium' ? subscriptionEnd : null,
          brandName,
          JSON.stringify({ primary: '#3b82f6', secondary: '#8b5cf6' }),
          digest.hash,
          digest.salt,
          digest.iterations,
        ]
      )

      const row = created.rows[0]
      res.status(201).json({
        user: {
          id: row.id,
          email: row.email,
          name: row.name,
          type: row.type,
          isActive: Boolean(row.is_active),
          brandName: row.brand_name || undefined,
          subscriptionEnd: row.subscription_end || undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      })
    } catch (e) {
      const message = String(e?.message || '')
      if (message.includes('unique') || message.includes('duplicate')) {
        res.status(409).json({ message: 'Este email já está cadastrado.' })
        return
      }
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.patch('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    const userId = String(req.params?.id || '').trim()
    if (!userId) {
      res.status(400).json({ message: 'Dados inválidos.' })
      return
    }

    const patch = []
    const nextIsActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined
    const nextType = req.body?.type === 'admin' || req.body?.type === 'premium' || req.body?.type === 'free' ? req.body.type : undefined

    if (typeof req.body?.email === 'string') {
      const email = normalizeEmail(req.body.email)
      if (!email) {
        res.status(400).json({ message: 'Email inválido.' })
        return
      }
      patch.push(['email', email])
    }

    if (typeof req.body?.name === 'string') {
      const name = req.body.name.trim()
      if (!name) {
        res.status(400).json({ message: 'Nome inválido.' })
        return
      }
      patch.push(['name', name])
    }

    if (typeof req.body?.brandName === 'string') {
      const brandName = req.body.brandName.trim()
      if (!brandName) {
        res.status(400).json({ message: 'Nome da marca inválido.' })
        return
      }
      patch.push(['brand_name', brandName])
    }

    if (typeof req.body?.phone === 'string') {
      const phone = req.body.phone.trim()
      patch.push(['phone', phone ? phone : null])
    }

    if (typeof req.body?.website === 'string') {
      const website = req.body.website.trim()
      patch.push(['website', website ? website : null])
    }

    if (typeof nextIsActive === 'boolean') {
      patch.push(['is_active', nextIsActive])
    }

    if (typeof nextType === 'string') {
      patch.push(['type', nextType])
    }

    const subscriptionEndRaw = typeof req.body?.subscriptionEnd === 'string' ? req.body.subscriptionEnd.trim() : undefined
    if (subscriptionEndRaw !== undefined) {
      const subscriptionEnd = subscriptionEndRaw ? new Date(subscriptionEndRaw).toISOString() : null
      patch.push(['subscription_end', subscriptionEnd])
    }

    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    const passwordTrimmed = password.trim()

    if (patch.length === 0 && !passwordTrimmed) {
      res.status(400).json({ message: 'Nada para atualizar.' })
      return
    }

    try {
      const currentResult = await query(
        `select id, email, type, is_active from app_users where id = $1 limit 1`,
        [userId]
      )
      const current = currentResult.rows[0]
      if (!current) {
        res.status(404).json({ message: 'Usuário não encontrado.' })
        return
      }

      const currentType = typeof current.type === 'string' ? current.type : 'free'
      const effectiveNextType = typeof nextType === 'string' ? nextType : currentType
      const effectiveNextIsActive = typeof nextIsActive === 'boolean' ? nextIsActive : Boolean(current.is_active)

      if (currentType === 'admin' && (!effectiveNextIsActive || effectiveNextType !== 'admin')) {
        const otherAdmins = await query(
          `select count(1)::int as total from app_users where type = 'admin' and id <> $1 and is_active = true`,
          [userId]
        )
        const total = Number(otherAdmins.rows[0]?.total || 0)
        if (total <= 0) {
          res.status(403).json({ message: 'Você não pode remover/desativar o último admin.' })
          return
        }
      }

      const requestedEmail = patch.find((item) => item[0] === 'email')?.[1]
      if (typeof requestedEmail === 'string' && requestedEmail !== current.email) {
        const exists = await query(`select 1 from app_users where email = $1 and id <> $2 limit 1`, [requestedEmail, userId])
        if (exists.rowCount > 0) {
          res.status(409).json({ message: 'Este email já está cadastrado.' })
          return
        }
      }

      if (effectiveNextType !== 'premium') {
        const hasTypePatch = patch.some((item) => item[0] === 'type')
        const hasSubscriptionPatch = patch.some((item) => item[0] === 'subscription_end')
        if (hasTypePatch || hasSubscriptionPatch) {
          patch.push(['subscription_end', null])
        }
      }

      if (passwordTrimmed) {
        const digest = await createPasswordDigest(passwordTrimmed)
        patch.push(['password_hash', digest.hash])
        patch.push(['password_salt', digest.salt])
        patch.push(['password_iterations', digest.iterations])
      }

      const setClause = patch.map((item, index) => `${item[0]} = $${index + 1}`).join(', ')
      const values = patch.map((item) => item[1])
      values.push(userId)

      const result = await query(
        `
        update app_users
        set ${setClause}, updated_at = now()
        where id = $${patch.length + 1}
        returning id, email, name, type, is_active, brand_name, subscription_end, phone, website, created_at, updated_at
        `,
        values
      )
      const row = result.rows[0]
      res.json({
        user: {
          id: row.id,
          email: row.email,
          name: row.name,
          type: row.type,
          isActive: Boolean(row.is_active),
          brandName: row.brand_name || undefined,
          subscriptionEnd: row.subscription_end || undefined,
          phone: row.phone || undefined,
          website: row.website || undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      })
    } catch (e) {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    const userId = String(req.params?.id || '').trim()
    if (!userId) {
      res.status(400).json({ message: 'Dados inválidos.' })
      return
    }

    if (userId === req.auth.userId) {
      res.status(403).json({ message: 'Você não pode excluir sua própria conta.' })
      return
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const currentResult = await client.query(`select id, type from app_users where id = $1 limit 1`, [userId])
      const current = currentResult.rows[0]
      if (!current) {
        await client.query('ROLLBACK')
        res.status(404).json({ message: 'Usuário não encontrado.' })
        return
      }

      if (current.type === 'admin') {
        const otherAdmins = await client.query(
          `select count(1)::int as total from app_users where type = 'admin' and id <> $1 and is_active = true`,
          [userId]
        )
        const total = Number(otherAdmins.rows[0]?.total || 0)
        if (total <= 0) {
          await client.query('ROLLBACK')
          res.status(403).json({ message: 'Você não pode excluir o último admin.' })
          return
        }
      }

      await client.query(`delete from ticket_messages where user_id = $1`, [userId])
      await client.query(`delete from tickets where user_id = $1`, [userId])
      await client.query(`delete from app_users where id = $1`, [userId])
      await client.query('COMMIT')
      res.status(204).end()
    } catch {
      try {
        await client.query('ROLLBACK')
      } catch {
        void 0
      }
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    } finally {
      client.release()
    }
  })

  app.post('/api/admin/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
    const userId = String(req.params?.id || '').trim()
    if (!userId) {
      res.status(400).json({ message: 'Dados inválidos.' })
      return
    }

    try {
      const current = await query(`select id from app_users where id = $1 limit 1`, [userId])
      if (current.rowCount <= 0) {
        res.status(404).json({ message: 'Usuário não encontrado.' })
        return
      }

      const password = generateRandomPassword(14)
      const digest = await createPasswordDigest(password)
      await query(
        `
        update app_users
        set password_hash = $1,
            password_salt = $2,
            password_iterations = $3,
            updated_at = now()
        where id = $4
        `,
        [digest.hash, digest.salt, digest.iterations, userId]
      )

      res.json({ password })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.get('/api/admin/settings', requireAuth, requireAdmin, async (_req, res) => {
    const allowRegistrations = await getAllowRegistrations()
    const ticketsEnabled = await getTicketsEnabled()
    res.json({ allowRegistrations, ticketsEnabled })
  })

  app.put('/api/admin/settings', requireAuth, requireAdmin, async (req, res) => {
    const allowRegistrations = typeof req.body?.allowRegistrations === 'boolean' ? req.body.allowRegistrations : null
    const ticketsEnabled = typeof req.body?.ticketsEnabled === 'boolean' ? req.body.ticketsEnabled : null
    if (allowRegistrations === null && ticketsEnabled === null) {
      res.status(400).json({ message: 'Dados inválidos.' })
      return
    }

    try {
      if (allowRegistrations !== null) {
        await query(
          `
          insert into app_settings (key, value, updated_at)
          values ($1, $2, now())
          on conflict (key) do update set value = excluded.value, updated_at = now()
          `,
          ['allow_registrations', allowRegistrations ? 'true' : 'false']
        )
      }
      if (ticketsEnabled !== null) {
        await setAppSettingValue({ key: 'tickets_enabled', value: ticketsEnabled ? 'true' : 'false' })
      }
      res.status(204).end()
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.get('/api/admin/football/settings', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const settings = await getFootballSettings()
      const sources = await query(
        `
        select id, name, url, is_active, created_at, updated_at
        from football_sources
        order by created_at asc
        `
      )
      res.json({
        settings,
        sources: sources.rows.map((row) => ({
          id: row.id,
          name: row.name,
          url: row.url,
          isActive: Boolean(row.is_active),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.put('/api/admin/football/settings', requireAuth, requireAdmin, async (req, res) => {
    const readTimeRaw = typeof req.body?.readTime === 'string' ? req.body.readTime.trim() : ''
    const readWindowStartRaw = typeof req.body?.readWindowStart === 'string' ? req.body.readWindowStart.trim() : ''
    const readWindowEndRaw = typeof req.body?.readWindowEnd === 'string' ? req.body.readWindowEnd.trim() : ''
    const timeZoneRaw = typeof req.body?.timeZone === 'string' ? req.body.timeZone.trim() : ''
    const readTime = parseClockTime(readTimeRaw)
    const readWindowStart = parseClockTime(readWindowStartRaw)
    const readWindowEnd = parseClockTime(readWindowEndRaw)
    const timeZone = timeZoneRaw || null
    const excludedChannelsInput = Array.isArray(req.body?.excludedChannels)
      ? req.body.excludedChannels
      : typeof req.body?.excludedChannels === 'string'
        ? req.body.excludedChannels.split(/\r?\n|[,;]+/g)
        : []
    const excludedCompetitionsInput = Array.isArray(req.body?.excludedCompetitions)
      ? req.body.excludedCompetitions
      : typeof req.body?.excludedCompetitions === 'string'
        ? req.body.excludedCompetitions.split(/\r?\n|[,;]+/g)
        : []
    const excludedChannels = [...new Set(excludedChannelsInput.map((v) => normalizeFootballFilterToken(v)).filter(Boolean))]
    const excludedCompetitions = [...new Set(excludedCompetitionsInput.map((v) => normalizeFootballFilterToken(v)).filter(Boolean))]

    if (!readTime && !readWindowStart && !readWindowEnd && !timeZone && excludedChannels.length === 0 && excludedCompetitions.length === 0) {
      res.status(400).json({ message: 'Dados inválidos.' })
      return
    }

    try {
      const effectiveReadTime = readTime || readWindowEnd || DEFAULT_FOOTBALL_READ_TIME
      await setAppSettingValue({ key: FOOTBALL_SETTINGS_KEYS.readTime, value: effectiveReadTime })
      await setAppSettingValue({
        key: FOOTBALL_SETTINGS_KEYS.readWindowStart,
        value: readWindowStart || DEFAULT_FOOTBALL_READ_WINDOW_START,
      })
      await setAppSettingValue({
        key: FOOTBALL_SETTINGS_KEYS.readWindowEnd,
        value: readWindowEnd || DEFAULT_FOOTBALL_READ_WINDOW_END,
      })
      if (timeZone) {
        await setAppSettingValue({ key: FOOTBALL_SETTINGS_KEYS.timeZone, value: timeZone })
      }
      await setAppSettingValue({
        key: FOOTBALL_SETTINGS_KEYS.excludedChannels,
        value: JSON.stringify(excludedChannels.length ? excludedChannels : DEFAULT_FOOTBALL_EXCLUDED_CHANNELS),
      })
      await setAppSettingValue({
        key: FOOTBALL_SETTINGS_KEYS.excludedCompetitions,
        value: JSON.stringify(excludedCompetitions.length ? excludedCompetitions : DEFAULT_FOOTBALL_EXCLUDED_COMPETITIONS),
      })
      res.status(204).end()
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.post('/api/admin/football/sources', requireAuth, requireAdmin, async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : ''
    const url = typeof req.body?.url === 'string' ? req.body.url.trim().slice(0, 500) : ''
    if (!name || !url || !isSafeExternalHttpUrl(url)) {
      res.status(400).json({ message: 'Dados inválidos.' })
      return
    }
    try {
      const created = await query(
        `
        insert into football_sources (name, url, is_active, created_at, updated_at)
        values ($1, $2, true, now(), now())
        returning id, name, url, is_active, created_at, updated_at
        `,
        [name, url]
      )
      const row = created.rows[0]
      res.status(201).json({
        source: {
          id: row.id,
          name: row.name,
          url: row.url,
          isActive: Boolean(row.is_active),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.put('/api/admin/football/sources/:id', requireAuth, requireAdmin, async (req, res) => {
    const sourceId = String(req.params?.id || '').trim()
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : ''
    const url = typeof req.body?.url === 'string' ? req.body.url.trim().slice(0, 500) : ''
    if (!sourceId || !name || !url || !isSafeExternalHttpUrl(url)) {
      res.status(400).json({ message: 'Dados inválidos.' })
      return
    }
    try {
      const updated = await query(
        `
        update football_sources
        set name = $1, url = $2, updated_at = now()
        where id = $3
        returning id, name, url, is_active, created_at, updated_at
        `,
        [name, url, sourceId]
      )
      if (updated.rowCount <= 0) {
        res.status(404).json({ message: 'Fonte não encontrada.' })
        return
      }
      const row = updated.rows[0]
      res.json({
        source: {
          id: row.id,
          name: row.name,
          url: row.url,
          isActive: Boolean(row.is_active),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.patch('/api/admin/football/sources/:id', requireAuth, requireAdmin, async (req, res) => {
    const sourceId = String(req.params?.id || '').trim()
    const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : null
    if (!sourceId || isActive === null) {
      res.status(400).json({ message: 'Dados inválidos.' })
      return
    }
    try {
      const updated = await query(
        `
        update football_sources
        set is_active = $1, updated_at = now()
        where id = $2
        returning id, name, url, is_active, created_at, updated_at
        `,
        [isActive, sourceId]
      )
      if (updated.rowCount <= 0) {
        res.status(404).json({ message: 'Fonte não encontrada.' })
        return
      }
      const row = updated.rows[0]
      res.json({
        source: {
          id: row.id,
          name: row.name,
          url: row.url,
          isActive: Boolean(row.is_active),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.post('/api/admin/football/refresh', requireAuth, requireAdmin, async (req, res) => {
    const dateRaw = typeof req.body?.date === 'string' ? req.body.date.trim() : ''
    const explicitDate = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null

    try {
      const settings = await getFootballSettings()
      const nowParts = getZonedNowParts({ timeZone: settings.timeZone })
      const date = explicitDate || getDefaultFootballScheduleDate({ nowDateIso: nowParts.date, nowTime: nowParts.time, readTime: settings.readWindowEnd || settings.readTime })
      void refreshFootballSchedule({ scheduleDateIso: date, timeZone: settings.timeZone }).catch(() => undefined)
      res.status(202).json({ started: true, date })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })
}
