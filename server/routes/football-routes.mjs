/**
 * Rotas football: crest proxy, refresh e schedule.
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerFootballRoutes = (app, deps) => {
  const {
    requireAuth,
    requirePremiumOrAdmin,
    rateLimitFootball,
    setFootballCrestCorsHeaders,
    processFootballCrestProxy,
    makeFootballCrestDbg,
    appendFootballDebugNdjson,
    getFootballSettings,
    getZonedNowParts,
    getDefaultFootballScheduleDate,
    refreshFootballSchedule,
    query,
    parseClockTime,
    normalizeFootballCrestUrl,
    normalizeFootballSearchText,
    uniqStrings,
    isPlaceholderFootballTeamCrestUrl,
    normalizeFootballFilterToken,
    addDaysToIsoDate,
    shouldRefreshFootballScheduleBecauseCrestsMissing,
    shouldRefreshFootballScheduleBecauseTooFew,
    enrichFutebolNaTvMatchesWithCrests,
    enrichFootballMatchesWithTeamNameBadges,
    inlineFootballCrestUrlsAsDataUrls,
    footballScheduleCrestDebugLogCache,
  } = deps

  app.options('/api/football/crest', (_req, res) => {
    setFootballCrestCorsHeaders(res)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Max-Age', '86400')
    res.status(204).end()
  })

  app.get('/api/football/crest', requireAuth, requirePremiumOrAdmin, rateLimitFootball, async (req, res) => {
    setFootballCrestCorsHeaders(res)
    appendFootballDebugNdjson('H18', 'football-routes:/api/football/crest', 'crest_route_hit', {
      method: 'GET',
      hasUrl: typeof req.query?.url === 'string' && req.query.url.trim().length > 0,
      urlLen: typeof req.query?.url === 'string' ? req.query.url.trim().length : 0,
    })
    const urlRaw = typeof req.query?.url === 'string' ? req.query.url.trim() : ''
    if (!urlRaw || urlRaw.length > 3000) {
      res.status(400).end()
      return
    }
    await processFootballCrestProxy(res, urlRaw, makeFootballCrestDbg('GET'))
  })

  app.post('/api/football/crest', requireAuth, requirePremiumOrAdmin, rateLimitFootball, async (req, res) => {
    setFootballCrestCorsHeaders(res)
    appendFootballDebugNdjson('H18', 'football-routes:/api/football/crest', 'crest_route_hit', {
      method: 'POST',
      hasUrl: typeof req.body?.url === 'string' && req.body.url.trim().length > 0,
      urlLen: typeof req.body?.url === 'string' ? req.body.url.trim().length : 0,
    })
    const urlRaw = typeof req.body?.url === 'string' ? req.body.url.trim() : ''
    if (!urlRaw || urlRaw.length > 16384) {
      res.status(400).end()
      return
    }
    await processFootballCrestProxy(res, urlRaw, makeFootballCrestDbg('POST'))
  })

  app.get('/api/football/schedule/refresh', requireAuth, requirePremiumOrAdmin, rateLimitFootball, async (req, res) => {
    try {
      const dateRaw = typeof req.query?.date === 'string' ? req.query.date.trim() : ''
      const settings = await getFootballSettings()
      const nowParts = getZonedNowParts({ timeZone: settings.timeZone })
      const scheduleDateIso =
        /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
          ? dateRaw
          : getDefaultFootballScheduleDate({
              nowDateIso: nowParts.date,
              nowTime: nowParts.time,
              readTime: settings.readWindowEnd || settings.readTime,
            })

      const results = await refreshFootballSchedule({ scheduleDateIso, timeZone: settings.timeZone })
      res.json(results)
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Erro ao forçar a atualização da programação de futebol.' })
    }
  })

  app.get(['/api/football/schedule', '/api/football/schedule/'], requireAuth, requirePremiumOrAdmin, async (req, res) => {
    const dateRaw = typeof req.query?.date === 'string' ? req.query.date.trim() : ''
    const explicitDate = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null

    try {
      const settings = await getFootballSettings()
      const nowParts = getZonedNowParts({ timeZone: settings.timeZone })
      const date =
        explicitDate ||
        getDefaultFootballScheduleDate({
          nowDateIso: nowParts.date,
          nowTime: nowParts.time,
          readTime: settings.readWindowEnd || settings.readTime,
        })

      const loadRows = async (targetDate) =>
        query(
          `
          select distinct on (fs.source_id) fs.matches, fs.fetched_at
          from football_schedules fs
          join football_sources s on s.id = fs.source_id
          where fs.schedule_date = $1
            and s.is_active = true
          order by fs.source_id, fs.fetched_at desc nulls last
          `,
          [targetDate]
        )

      const mergeRows = (rows) => {
        const mergedMap = new Map()
        let updatedAt = null
        for (const row of rows) {
          if (!updatedAt || (row.fetched_at && new Date(row.fetched_at).getTime() > new Date(updatedAt).getTime())) {
            updatedAt = row.fetched_at
          }
          const list = Array.isArray(row.matches) ? row.matches : []
          for (const item of list) {
            const time = parseClockTime(item?.time)
            const home = typeof item?.home === 'string' ? item.home.trim() : ''
            const away = typeof item?.away === 'string' ? item.away.trim() : ''
            const competition = typeof item?.competition === 'string' ? item.competition.trim() : ''
            const channels = Array.isArray(item?.channels) ? item.channels.map((c) => String(c || '').trim()).filter(Boolean) : []
            const homeCrestUrl = normalizeFootballCrestUrl(typeof item?.homeCrestUrl === 'string' ? item.homeCrestUrl.trim() : '')
            const awayCrestUrl = normalizeFootballCrestUrl(typeof item?.awayCrestUrl === 'string' ? item.awayCrestUrl.trim() : '')
            const href = typeof item?.href === 'string' ? item.href.trim() : ''
            if (!time || !home || !away) continue
            const key = `${time}::${normalizeFootballSearchText(home)}::${normalizeFootballSearchText(away)}`
            const existing = mergedMap.get(key)
            if (!existing) {
              mergedMap.set(key, { time, home, away, competition, channels, homeCrestUrl, awayCrestUrl, href })
              continue
            }
            if (!existing.competition && competition) existing.competition = competition
            if (existing.channels.length === 0 && channels.length > 0) {
              existing.channels = channels
            } else if (channels.length > 0) {
              existing.channels = uniqStrings([...existing.channels, ...channels])
            }

            const existingHome = typeof existing.homeCrestUrl === 'string' ? existing.homeCrestUrl.trim() : ''
            const existingAway = typeof existing.awayCrestUrl === 'string' ? existing.awayCrestUrl.trim() : ''
            if ((!existingHome || isPlaceholderFootballTeamCrestUrl(existingHome)) && homeCrestUrl && !isPlaceholderFootballTeamCrestUrl(homeCrestUrl)) {
              existing.homeCrestUrl = homeCrestUrl
            } else if (!existingHome && homeCrestUrl) {
              existing.homeCrestUrl = homeCrestUrl
            }
            if ((!existingAway || isPlaceholderFootballTeamCrestUrl(existingAway)) && awayCrestUrl && !isPlaceholderFootballTeamCrestUrl(awayCrestUrl)) {
              existing.awayCrestUrl = awayCrestUrl
            } else if (!existingAway && awayCrestUrl) {
              existing.awayCrestUrl = awayCrestUrl
            }
            if (!existing.href && href) existing.href = href
          }
        }
        const merged = [...mergedMap.values()]
        merged.sort((a, b) => a.time.localeCompare(b.time))
        return { merged, updatedAt }
      }

      const shouldExcludeFootballMatch = (match, s) => {
        const competition = normalizeFootballFilterToken(match?.competition || '')
        const channels = Array.isArray(match?.channels)
          ? match.channels.map((c) => normalizeFootballFilterToken(c)).filter(Boolean)
          : []
        const excludedCompetitions = Array.isArray(s?.excludedCompetitions) ? s.excludedCompetitions : []
        const excludedChannels = Array.isArray(s?.excludedChannels) ? s.excludedChannels : []
        const competitionExcluded = competition && excludedCompetitions.some((needle) => competition.includes(needle))
        const exclusiveChannelsExcluded =
          channels.length > 0 &&
          excludedChannels.length > 0 &&
          channels.every((channel) => excludedChannels.some((needle) => channel.includes(needle)))
        return competitionExcluded || exclusiveChannelsExcluded
      }

      let responseDate = date
      let result = await loadRows(responseDate)
      let { merged, updatedAt } = mergeRows(result.rows)

      if (!explicitDate && merged.length === 0) {
        const fallbackDates = uniqStrings([nowParts.date, addDaysToIsoDate(nowParts.date, -1)])
        for (const fallbackDate of fallbackDates) {
          if (fallbackDate === responseDate) continue
          const fallbackRows = await loadRows(fallbackDate)
          const fallbackMerged = mergeRows(fallbackRows.rows)
          if (fallbackMerged.merged.length > 0) {
            responseDate = fallbackDate
            merged = fallbackMerged.merged
            updatedAt = fallbackMerged.updatedAt
            break
          }
        }
      }

      merged = merged.filter((match) => !shouldExcludeFootballMatch(match, settings))

      const shouldEnrichNow = shouldRefreshFootballScheduleBecauseCrestsMissing({ merged, scheduleDateIso: responseDate })
      if (shouldEnrichNow && merged.length > 0) {
        const timeoutMs = 8_000
        const withTimeout = async (p) => {
          let timer = null
          const timeout = new Promise((resolve) => {
            timer = setTimeout(() => resolve(null), timeoutMs)
          })
          try {
            return await Promise.race([p, timeout])
          } finally {
            if (timer) clearTimeout(timer)
          }
        }
        try {
          const enriched = await withTimeout(enrichFutebolNaTvMatchesWithCrests(merged))
          if (Array.isArray(enriched) && enriched.length > 0) merged = enriched
        } catch {
        }
        try {
          const byName = await withTimeout(enrichFootballMatchesWithTeamNameBadges(merged))
          if (Array.isArray(byName) && byName.length > 0) merged = byName
        } catch {
        }
      }

      try {
        merged = await inlineFootballCrestUrlsAsDataUrls(merged, { budgetMs: 26_000 })
      } catch {
      }

      if (
        shouldRefreshFootballScheduleBecauseTooFew({ merged, scheduleDateIso: responseDate }) ||
        shouldRefreshFootballScheduleBecauseCrestsMissing({ merged, scheduleDateIso: responseDate })
      ) {
        void refreshFootballSchedule({ scheduleDateIso: responseDate, timeZone: settings.timeZone }).catch(() => undefined)
      }

      const isMissingCrest = (url) => !String(url || '').trim() || isPlaceholderFootballTeamCrestUrl(String(url || ''))
      const totalMatches = Array.isArray(merged) ? merged.length : 0
      const missingHome = merged.filter((m) => isMissingCrest(m.homeCrestUrl)).length
      const missingAway = merged.filter((m) => isMissingCrest(m.awayCrestUrl)).length
      const missingBoth = merged.filter((m) => isMissingCrest(m.homeCrestUrl) && isMissingCrest(m.awayCrestUrl)).length
      const missingAny = merged.filter((m) => isMissingCrest(m.homeCrestUrl) || isMissingCrest(m.awayCrestUrl)).length

      const dateKey = typeof responseDate === 'string' ? responseDate.trim() : ''
      const shouldLogCrestsDebug =
        dateKey &&
        missingAny >= Math.max(6, Math.floor(totalMatches * 0.7)) &&
        Date.now() - (footballScheduleCrestDebugLogCache.get(dateKey) || 0) > 10 * 60_000

      if (shouldLogCrestsDebug) {
        const sample = merged
          .filter((m) => isMissingCrest(m.homeCrestUrl) || isMissingCrest(m.awayCrestUrl))
          .slice(0, 3)
          .map((m) => ({
            time: m.time,
            home: m.home,
            away: m.away,
            href: m.href,
            homeCrestUrl: m.homeCrestUrl,
            awayCrestUrl: m.awayCrestUrl,
          }))

        console.log('football_schedule_crests_debug', {
          date: dateKey,
          totalMatches,
          missingHome,
          missingAway,
          missingBoth,
          missingAny,
          missingAnyRatio: totalMatches ? missingAny / totalMatches : 0,
          sample,
        })
        footballScheduleCrestDebugLogCache.set(dateKey, Date.now())
      }

      const normalizeCrestFieldForClient = (u) => {
        const s = typeof u === 'string' ? u.trim() : ''
        if (!s || s.startsWith('data:')) return s
        return normalizeFootballCrestUrl(s) || s
      }
      const publicMatches = merged.map((m) => {
        const base = {
          time: m.time,
          home: m.home,
          away: m.away,
          competition: m.competition,
          channels: Array.isArray(m.channels) ? m.channels : [],
          homeCrestUrl: normalizeCrestFieldForClient(m.homeCrestUrl || ''),
          awayCrestUrl: normalizeCrestFieldForClient(m.awayCrestUrl || ''),
        }
        const hr = typeof m.homeCrestUrlRemote === 'string' ? m.homeCrestUrlRemote.trim() : ''
        const ar = typeof m.awayCrestUrlRemote === 'string' ? m.awayCrestUrlRemote.trim() : ''
        if (hr) base.homeCrestUrlRemote = normalizeCrestFieldForClient(hr)
        if (ar) base.awayCrestUrlRemote = normalizeCrestFieldForClient(ar)
        return base
      })
      appendFootballDebugNdjson('H16,H17', 'football-routes:/api/football/schedule', 'schedule_response_summary', {
        date: responseDate,
        totalMatches,
        missingHome,
        missingAway,
        missingBoth,
        missingAny,
        sample: publicMatches.slice(0, 2).map((m) => ({
          home: m.home,
          away: m.away,
          homeCrestUrlLen: String(m.homeCrestUrl || '').length,
          awayCrestUrlLen: String(m.awayCrestUrl || '').length,
        })),
      })
      res.json({ date: responseDate, updatedAt, matches: publicMatches })
    } catch {
      res.status(200).json({
        date: explicitDate || new Date().toISOString().slice(0, 10),
        updatedAt: null,
        matches: [],
      })
    }
  })
}

/** @deprecated use registerFootballRoutes */
export const registerFootballCrestAndRefreshRoutes = registerFootballRoutes
