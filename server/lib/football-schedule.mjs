/**
 * Agenda de futebol: settings, enrich de escudos, refresh e heurísticas de auto-refresh.
 * @param {Record<string, any>} deps
 */
import * as cheerio from 'cheerio'

export const createFootballScheduleService = (deps) => {
  const {
    query,
    getAppSettingValue,
    setAppSettingValue,
    isSafeExternalHttpUrl,
    FOOTBALL_SETTINGS_KEYS,
    DEFAULT_FOOTBALL_TIME_ZONE,
    DEFAULT_FOOTBALL_READ_TIME,
    DEFAULT_FOOTBALL_READ_WINDOW_START,
    DEFAULT_FOOTBALL_READ_WINDOW_END,
    DEFAULT_FOOTBALL_EXCLUDED_CHANNELS,
    DEFAULT_FOOTBALL_EXCLUDED_COMPETITIONS,
    parseClockTime,
    parseFootballSettingList,
    normalizeFootballFilterToken,
    normalizeFootballSearchText,
    normalizeFootballCrestUrl,
    isPlaceholderFootballTeamCrestUrl,
    stripHtml,
    parseFootballScheduleFromSource,
    parseFutebolNaTvBrMarkdownSchedule,
    parseFutebolNaTvBrSchedule,
    parseOneFootballMarkdownSchedule,
    isLikelyBlockedHtml,
    getZonedNowParts,
    addDaysToIsoDate,
    resolveFootballSourceFetchUrl,
    resolveOneFootballFetchUrl,
    toJinaReaderUrl,
    fetchTextWithHeaders,
    uniqStrings = (items) => {
      const out = []
      const seen = new Set()
      for (const item of Array.isArray(items) ? items : []) {
        const value = String(item || '').trim()
        if (!value) continue
        const key = value.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(value)
      }
      return out
    },
  } = deps

  const getFootballSettings = async () => {
    const [readTimeValue, readWindowStartValue, readWindowEndValue, timeZoneValue, lastRunValue, excludedChannelsValue, excludedCompetitionsValue] = await Promise.all([
      getAppSettingValue(FOOTBALL_SETTINGS_KEYS.readTime),
      getAppSettingValue(FOOTBALL_SETTINGS_KEYS.readWindowStart),
      getAppSettingValue(FOOTBALL_SETTINGS_KEYS.readWindowEnd),
      getAppSettingValue(FOOTBALL_SETTINGS_KEYS.timeZone),
      getAppSettingValue(FOOTBALL_SETTINGS_KEYS.lastRunDate),
      getAppSettingValue(FOOTBALL_SETTINGS_KEYS.excludedChannels),
      getAppSettingValue(FOOTBALL_SETTINGS_KEYS.excludedCompetitions),
    ])

    const readTime = parseClockTime(readTimeValue) || DEFAULT_FOOTBALL_READ_TIME
    const readWindowStart = parseClockTime(readWindowStartValue) || DEFAULT_FOOTBALL_READ_WINDOW_START
    const readWindowEnd = parseClockTime(readWindowEndValue) || DEFAULT_FOOTBALL_READ_WINDOW_END
    const timeZoneCandidate = typeof timeZoneValue === 'string' ? timeZoneValue.trim() : ''
    const timeZone = timeZoneCandidate === DEFAULT_FOOTBALL_TIME_ZONE ? timeZoneCandidate : DEFAULT_FOOTBALL_TIME_ZONE
    const lastRunDate = typeof lastRunValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lastRunValue.trim()) ? lastRunValue.trim() : null
    const excludedChannels = parseFootballSettingList(excludedChannelsValue, DEFAULT_FOOTBALL_EXCLUDED_CHANNELS)
    const excludedCompetitions = parseFootballSettingList(excludedCompetitionsValue, DEFAULT_FOOTBALL_EXCLUDED_COMPETITIONS)
    return { readTime, readWindowStart, readWindowEnd, timeZone, lastRunDate, excludedChannels, excludedCompetitions }
  }

  const getDefaultFootballScheduleDate = ({ nowDateIso, nowTime, readTime }) => {
    const date = typeof nowDateIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(nowDateIso) ? nowDateIso : ''
    if (!date) return addDaysToIsoDate(getZonedNowParts({ timeZone: DEFAULT_FOOTBALL_TIME_ZONE }).date, 1)
    const currentTime = parseClockTime(nowTime) || ''
    const cutoffTime = parseClockTime(readTime) || DEFAULT_FOOTBALL_READ_TIME
    if (!currentTime) return date
    return currentTime >= cutoffTime ? addDaysToIsoDate(date, 1) : date
  }

  const toMinutes = (time) => {
    const parsed = parseClockTime(time)
    if (!parsed) return null
    const [hRaw, mRaw] = parsed.split(':')
    const h = Number(hRaw)
    const m = Number(mRaw)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    return h * 60 + m
  }

  const getWindowTriggerMinute = ({ dateIso, windowStart, windowEnd }) => {
    const start = toMinutes(windowStart)
    const end = toMinutes(windowEnd)
    if (start === null || end === null) return toMinutes(DEFAULT_FOOTBALL_READ_WINDOW_START)
    const span = end >= start ? (end - start + 1) : (24 * 60 - start + end + 1)
    const safeSpan = Math.max(1, span)
    const seed = String(dateIso || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    const offset = seed % safeSpan
    return (start + offset) % (24 * 60)
  }

  const footballMatchCrestLookupCache = new Map()
  const footballMatchCompetitionLookupCache = new Map()

  const toAbsFutebolNaTvAssetUrl = (href) => {
    const raw = String(href || '').trim()
    if (!raw) return ''
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
    if (raw.startsWith('//')) return `https:${raw}`
    if (raw.startsWith('/')) return `https://www.futebolnatv.com.br${raw}`
    return `https://www.futebolnatv.com.br/${raw}`
  }

  const extractFutebolNaTvTeamCrestsFromHtml = (html) => {
    const raw = String(html || '')
    if (!raw) return { homeCrestUrl: '', awayCrestUrl: '' }

    const $ = cheerio.load(raw);
    const urls = [];

    const isTeamCrestUrl = (u) => {
      const s = String(u || '').trim();
      if (!s) return false;
      if (s.includes('/assets/img/loadteam.png')) return false;
      // Aceita variações de caminho do provedor (upload/teams, upload/team, teams/<...>)
      return /(\/upload\/teams\/|\/upload\/team\/|\/teams\/)/i.test(s);
    }

    $('img').each((i, elem) => {
      const src = $(elem).attr('src') || $(elem).attr('data-src') || $(elem).attr('data-original') || $(elem).attr('data-lazy-src') || $(elem).attr('data-lazy');
      const srcset = $(elem).attr('srcset');

      if (src) urls.push(toAbsFutebolNaTvAssetUrl(src));
      if (srcset) {
        // srcset pode vir como: "url1 1x, url2 2x"
        const first = String(srcset).split(',').map((p) => p.trim())[0];
        const urlOnly = first ? first.split(/\s+/)[0] : '';
        if (urlOnly) urls.push(toAbsFutebolNaTvAssetUrl(urlOnly));
      }
    });

    // Alguns escudos podem aparecer no HTML em blocos/estilos e não necessariamente em img.src.
    // Captura caminhos que contenham "teams" e normaliza.
    const regexTeamUrls = raw.match(/(?:https?:\/\/(?:www\.)?futebolnatv\.com\.br)?\/(?:upload\/)?teams\/[^"'\\s)]+/gi) || [];
    for (const m of regexTeamUrls) {
      urls.push(toAbsFutebolNaTvAssetUrl(m));
    }

    const unique = uniqStrings(urls);
    const teamUrls = unique.filter((u) => isTeamCrestUrl(u));
    return { homeCrestUrl: teamUrls[0] || '', awayCrestUrl: teamUrls[1] || '' };
  }

  const extractFutebolNaTvTeamCrestsFromMarkdown = (markdown) => {
    const raw = String(markdown || '')
    if (!raw) return { homeCrestUrl: '', awayCrestUrl: '' }
    const urls = []
    const re = /!\[[^\]]*\]\(([^)\s]+)\)/gi
    let m

    const isTeamCrestUrl = (u) => {
      const s = String(u || '').trim();
      if (!s) return false;
      if (s.includes('/assets/img/loadteam.png')) return false;
      return /(\/upload\/teams\/|\/upload\/team\/|\/teams\/)/i.test(s);
    }

    while ((m = re.exec(raw)) !== null) {
      const abs = toAbsFutebolNaTvAssetUrl(String(m[1] || '').trim())
      if (abs) urls.push(abs)
    }
    const unique = uniqStrings(urls)
    const teamUrls = unique.filter((u) => isTeamCrestUrl(u))
    return { homeCrestUrl: teamUrls[0] || '', awayCrestUrl: teamUrls[1] || '' }
  }

  const fetchFutebolNaTvMatchCrests = async (absHref) => {
    const href = typeof absHref === 'string' ? absHref.trim() : ''
    if (!href || !isSafeExternalHttpUrl(href)) return { homeCrestUrl: '', awayCrestUrl: '' }
    const cached = footballMatchCrestLookupCache.get(href)
    if (cached && cached.expiresAt && Date.now() < cached.expiresAt) {
      return { homeCrestUrl: cached.homeCrestUrl || '', awayCrestUrl: cached.awayCrestUrl || '' }
    }
    let homeCrestUrl = ''
    let awayCrestUrl = ''
    try {
      const primary = await fetchTextWithHeaders(href)
      const extracted = extractFutebolNaTvTeamCrestsFromHtml(primary.text)
      homeCrestUrl = extracted.homeCrestUrl
      awayCrestUrl = extracted.awayCrestUrl
      const shouldTryReader = !homeCrestUrl || !awayCrestUrl || !primary.ok || isLikelyBlockedHtml(primary.text)
      if (shouldTryReader) {
        const reader = await fetchTextWithHeaders(toJinaReaderUrl(href))
        if (reader.ok && reader.text) {
          const fromMd = extractFutebolNaTvTeamCrestsFromMarkdown(reader.text)
          if (!homeCrestUrl && fromMd.homeCrestUrl) homeCrestUrl = fromMd.homeCrestUrl
          if (!awayCrestUrl && fromMd.awayCrestUrl) awayCrestUrl = fromMd.awayCrestUrl
        }
      }
    } catch {
      homeCrestUrl = ''
      awayCrestUrl = ''
    }
    const isEmpty = !String(homeCrestUrl || '').trim() && !String(awayCrestUrl || '').trim()
    footballMatchCrestLookupCache.set(href, {
      homeCrestUrl,
      awayCrestUrl,
      expiresAt: Date.now() + (isEmpty ? 10 * 60_000 : 12 * 60 * 60_000),
    })
    return { homeCrestUrl, awayCrestUrl }
  }

  const extractFutebolNaTvCompetitionFromMarkdown = (markdown) => {
    const raw = String(markdown || '')
    if (!raw) return ''
    const strong = raw.match(/\*\*([^*]+)\*\s*(?:-\s*rodada[^\n\]]*)?/i)
    if (strong) {
      const normalized = normalizeFootballCompetitionLabel(strong[1])
      if (normalized) return normalized
    }
    const lineMatch = raw.match(/\b((?:campeonato|copa|liga|divisão|superliga)[^\n]{0,120})/i)
    return normalizeFootballCompetitionLabel(lineMatch ? lineMatch[1] : '')
  }

  const fetchFutebolNaTvMatchCompetition = async (absHref) => {
    const href = typeof absHref === 'string' ? absHref.trim() : ''
    if (!href || !isSafeExternalHttpUrl(href)) return ''
    const cached = footballMatchCompetitionLookupCache.get(href)
    if (cached && cached.expiresAt && Date.now() < cached.expiresAt) {
      return String(cached.competition || '').trim()
    }
    let competition = ''
    try {
      const reader = await fetchTextWithHeaders(toJinaReaderUrl(href))
      if (reader.ok && reader.text) {
        competition = extractFutebolNaTvCompetitionFromMarkdown(reader.text)
      }
      if (!competition) {
        const primary = await fetchTextWithHeaders(href)
        if (primary.ok && primary.text) {
          const fromHtml = stripHtml(primary.text).replace(/\s+/g, ' ').trim()
          const m = fromHtml.match(/\b((?:campeonato|copa|liga|divisão|superliga)[^–—\-]{0,120})\s*(?:[-–—]\s*rodada.*)?/i)
          competition = normalizeFootballCompetitionLabel(m ? m[1] : '')
        }
      }
    } catch {
      competition = ''
    }
    const normalized = normalizeFootballCompetitionLabel(competition)
    footballMatchCompetitionLookupCache.set(href, {
      competition: normalized,
      expiresAt: Date.now() + (normalized ? 12 * 60 * 60_000 : 15 * 60_000),
    })
    return normalized
  }

  const enrichFutebolNaTvMatchesWithCompetition = async (matches) => {
    const list = Array.isArray(matches) ? matches : []
    const targets = list.filter((m) => {
      const href = typeof m?.href === 'string' ? m.href.trim() : ''
      const competition = typeof m?.competition === 'string' ? m.competition.trim() : ''
      return href && isSafeExternalHttpUrl(href) && !competition
    })
    if (targets.length === 0) return list
    const queue = [...targets].slice(0, 120)
    const workerCount = Math.max(1, Math.min(8, queue.length))
    await Promise.all(
      Array.from({ length: workerCount }).map(async () => {
        while (queue.length > 0) {
          const item = queue.shift()
          if (!item) return
          const href = typeof item?.href === 'string' ? item.href.trim() : ''
          if (!href) continue
          const value = await fetchFutebolNaTvMatchCompetition(href)
          if (value && !item.competition) item.competition = value
        }
      })
    )
    return list
  }

  const enrichFutebolNaTvMatchesWithCrests = async (matches) => {
    const list = Array.isArray(matches) ? matches : []
    const candidates = list.filter((m) => {
      const href = typeof m?.href === 'string' ? m.href.trim() : ''
      if (!href || !isSafeExternalHttpUrl(href)) return false
      const home = typeof m?.homeCrestUrl === 'string' ? m.homeCrestUrl.trim() : ''
      const away = typeof m?.awayCrestUrl === 'string' ? m.awayCrestUrl.trim() : ''
      return !home || !away || isPlaceholderFootballTeamCrestUrl(home) || isPlaceholderFootballTeamCrestUrl(away)
    })
    candidates.sort((a, b) => {
      const ah = typeof a?.homeCrestUrl === 'string' ? a.homeCrestUrl.trim() : ''
      const aa = typeof a?.awayCrestUrl === 'string' ? a.awayCrestUrl.trim() : ''
      const bh = typeof b?.homeCrestUrl === 'string' ? b.homeCrestUrl.trim() : ''
      const ba = typeof b?.awayCrestUrl === 'string' ? b.awayCrestUrl.trim() : ''
      const aScore = (!ah || isPlaceholderFootballTeamCrestUrl(ah) ? 1 : 0) + (!aa || isPlaceholderFootballTeamCrestUrl(aa) ? 1 : 0)
      const bScore = (!bh || isPlaceholderFootballTeamCrestUrl(bh) ? 1 : 0) + (!ba || isPlaceholderFootballTeamCrestUrl(ba) ? 1 : 0)
      return bScore - aScore
    })
    const targets = candidates.slice(0, 120)
    if (targets.length === 0) return list

    const queue = [...targets]
    const workerCount = Math.max(1, Math.min(6, queue.length))
    await Promise.all(
      Array.from({ length: workerCount }).map(async () => {
        while (queue.length > 0) {
          const item = queue.shift()
          if (!item) return
          const href = typeof item?.href === 'string' ? item.href.trim() : ''
          if (!href) continue
          const currentHome = typeof item?.homeCrestUrl === 'string' ? item.homeCrestUrl.trim() : ''
          const currentAway = typeof item?.awayCrestUrl === 'string' ? item.awayCrestUrl.trim() : ''
          const fetched = await fetchFutebolNaTvMatchCrests(href)
          const nextHome = String(fetched.homeCrestUrl || '').trim()
          const nextAway = String(fetched.awayCrestUrl || '').trim()
          if ((!currentHome || isPlaceholderFootballTeamCrestUrl(currentHome)) && nextHome) item.homeCrestUrl = nextHome
          if ((!currentAway || isPlaceholderFootballTeamCrestUrl(currentAway)) && nextAway) item.awayCrestUrl = nextAway
        }
      })
    )
    return list
  }

  const footballTeamBadgeLookupCache = new Map()

  const normalizeFootballTeamForBadgeSearch = (value) => {
    const base = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(fc|ec|sc|ac|cf|cd|clube de regatas|clube)\b/gi, ' ')
      .replace(/\b(w|women|feminino|fem|sub[-\s]?\d{2})\b/gi, ' ')
      .replace(/[^a-z0-9\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    return base
  }

  const fetchTeamBadgeByName = async (teamName) => {
    const normalized = normalizeFootballTeamForBadgeSearch(teamName)
    if (!normalized) return ''
    const cached = footballTeamBadgeLookupCache.get(normalized)
    if (cached && cached.expiresAt && Date.now() < cached.expiresAt) {
      return String(cached.url || '').trim()
    }

    const tryNames = uniqStrings([
      String(teamName || '').trim(),
      normalized.replace(/\b(feminino|fem)\b/gi, '').trim(),
      normalized.replace(/\bfc\b/gi, '').trim(),
    ]).filter(Boolean)

    let out = ''
    for (const name of tryNames.slice(0, 2)) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 3500)
      try {
        const url = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(name)}`
        const res = await fetch(url, {
          headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
          signal: controller.signal,
        })
        if (!res.ok) continue
        const payload = await res.json()
        const teams = Array.isArray(payload?.teams) ? payload.teams : []
        const exact = teams.find((t) => normalizeFootballTeamForBadgeSearch(t?.strTeam) === normalized)
        const candidate = exact || teams[0]
        const badge = String(candidate?.strTeamBadge || '').trim()
        if (badge && isSafeExternalHttpUrl(badge)) {
          out = badge
          break
        }
      } catch {
      } finally {
        clearTimeout(timer)
      }
    }

    footballTeamBadgeLookupCache.set(normalized, {
      url: out,
      expiresAt: Date.now() + (out ? 7 * 24 * 60 * 60_000 : 20 * 60_000),
    })
    return out
  }

  const enrichFootballMatchesWithTeamNameBadges = async (matches) => {
    const list = Array.isArray(matches) ? matches : []
    if (list.length === 0) return list

    const missingNames = uniqStrings(
      list.flatMap((m) => {
        const out = []
        const home = String(m?.homeCrestUrl || '').trim()
        const away = String(m?.awayCrestUrl || '').trim()
        if (!home || isPlaceholderFootballTeamCrestUrl(home)) out.push(String(m?.home || '').trim())
        if (!away || isPlaceholderFootballTeamCrestUrl(away)) out.push(String(m?.away || '').trim())
        return out
      }).filter(Boolean)
    ).slice(0, 24)

    if (missingNames.length === 0) return list
    const badgeMap = new Map()
    const queue = [...missingNames]
    const workerCount = Math.max(1, Math.min(6, queue.length))
    await Promise.all(
      Array.from({ length: workerCount }).map(async () => {
        while (queue.length > 0) {
          const team = queue.shift()
          if (!team) return
          const url = await fetchTeamBadgeByName(team)
          if (url) badgeMap.set(team, url)
        }
      })
    )

    if (badgeMap.size === 0) return list
    for (const m of list) {
      const currentHome = String(m?.homeCrestUrl || '').trim()
      const currentAway = String(m?.awayCrestUrl || '').trim()
      if (!currentHome || isPlaceholderFootballTeamCrestUrl(currentHome)) {
        const nextHome = badgeMap.get(String(m?.home || '').trim())
        if (nextHome) m.homeCrestUrl = nextHome
      }
      if (!currentAway || isPlaceholderFootballTeamCrestUrl(currentAway)) {
        const nextAway = badgeMap.get(String(m?.away || '').trim())
        if (nextAway) m.awayCrestUrl = nextAway
      }
    }
    return list
  }

  /** Cache URL externa → data URL (evita canvas/CORS no browser: o schedule já traz pixels embutidos). */
  const footballCrestDataUrlCache = new Map()

  const sniffImageMimeFromBuffer = (buf) => {
    if (!buf || buf.length < 12) return ''
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
      return 'image/webp'
    }
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
    return ''
  }

  const fetchExternalCrestAsDataUrl = async (rawUrl) => {
    const normalized = normalizeFootballCrestUrl(rawUrl)
    if (!normalized || normalized.startsWith('data:')) return ''
    if (!isSafeExternalHttpUrl(normalized)) return ''
    const hit = footballCrestDataUrlCache.get(normalized)
    if (hit && hit.expiresAt > Date.now()) return String(hit.dataUrl || '')

    try {
      const url = new URL(normalized)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6500)
      let response
      try {
        response = await fetch(url.toString(), {
          signal: controller.signal,
          headers: {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            referer: `${url.origin}/`,
            'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          },
        })
      } finally {
        clearTimeout(timer)
      }
      if (!response.ok) {
        footballCrestDataUrlCache.set(normalized, { dataUrl: '', expiresAt: Date.now() + 12 * 60_000 })
        return ''
      }
      const buf = Buffer.from(await response.arrayBuffer())
      // Limite alinhado ao proxy /api/football/crest; acima disso o cliente usa a URL remota ou o proxy.
      if (buf.length < 24 || buf.length > 600_000) {
        footballCrestDataUrlCache.set(normalized, { dataUrl: '', expiresAt: Date.now() + 20 * 60_000 })
        return ''
      }
      const ct = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      let mime = ct.startsWith('image/') ? ct : ''
      if (!mime) mime = sniffImageMimeFromBuffer(buf)
      if (!mime) {
        const headUtf8 = buf.slice(0, Math.min(256, buf.length)).toString('utf8').trimStart()
        if (headUtf8.startsWith('<svg') || headUtf8.startsWith('<?xml') || /<svg[\s>]/i.test(headUtf8)) {
          mime = 'image/svg+xml'
        }
      }
      if (!mime) {
        footballCrestDataUrlCache.set(normalized, { dataUrl: '', expiresAt: Date.now() + 20 * 60_000 })
        return ''
      }
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
      footballCrestDataUrlCache.set(normalized, { dataUrl, expiresAt: Date.now() + 24 * 60 * 60_000 })
      return dataUrl
    } catch {
      footballCrestDataUrlCache.set(normalized, { dataUrl: '', expiresAt: Date.now() + 8 * 60_000 })
      return ''
    }
  }

  /** Substitui homeCrestUrl/awayCrestUrl por data URLs quando o servidor consegue baixar a imagem (definitivo para produção). */
  const inlineFootballCrestUrlsAsDataUrls = async (matches, { budgetMs = 26_000 } = {}) => {
    const list = Array.isArray(matches) ? matches : []
    if (list.length === 0) return list

    const seen = new Set()
    const queue = []
    for (const m of list) {
      for (const field of ['homeCrestUrl', 'awayCrestUrl']) {
        const raw = String(m[field] || '').trim()
        if (!raw || raw.startsWith('data:') || isPlaceholderFootballTeamCrestUrl(raw)) continue
        const norm = normalizeFootballCrestUrl(raw)
        if (!norm || !isSafeExternalHttpUrl(norm)) continue
        if (seen.has(norm)) continue
        seen.add(norm)
        queue.push(norm)
      }
    }
    if (queue.length === 0) return list

    const deadline = Date.now() + budgetMs
    const urlToData = new Map()
    const workerCount = Math.min(8, Math.max(1, queue.length))
    const workQueue = [...queue]

    await Promise.all(
      Array.from({ length: workerCount }).map(async () => {
        while (Date.now() < deadline && workQueue.length > 0) {
          const u = workQueue.shift()
          if (!u) return
          const dataUrl = await fetchExternalCrestAsDataUrl(u)
          if (dataUrl) urlToData.set(u, dataUrl)
        }
      })
    )

    for (const m of list) {
      for (const field of ['homeCrestUrl', 'awayCrestUrl']) {
        const raw = String(m[field] || '').trim()
        if (!raw || raw.startsWith('data:') || isPlaceholderFootballTeamCrestUrl(raw)) continue
        const norm = normalizeFootballCrestUrl(raw)
        const embedded = urlToData.get(norm)
        if (embedded) {
          if (field === 'homeCrestUrl') {
            if (!m.homeCrestUrlRemote) m.homeCrestUrlRemote = norm
          } else if (!m.awayCrestUrlRemote) {
            m.awayCrestUrlRemote = norm
          }
          m[field] = embedded
        }
      }
    }
    return list
  }

  const refreshFootballSchedule = async ({ scheduleDateIso, timeZone }) => {
    // const sources = await query(
      //   `
      //   select id, name, url
      //   from football_sources
      //   where is_active = true
      //   order by created_at asc
      //   `
      // );
    const sources = await query(
      `
      select id, name, url
      from football_sources
      where is_active = true
      order by created_at asc
      `
    );
    const results = []

    const looksLikeFutebolNaTvScheduleHtml = (html) => {
      const raw = String(html || '')
      if (!raw) return false
      const lowerRaw = raw.toLowerCase()
      const aovivoCount = (lowerRaw.match(/\/aovivo\//g) || []).length
      if (aovivoCount >= 8) return true
      const text = normalizeFootballSearchText(stripHtml(raw))
      const timeCount = (text.match(/\b\d{1,2}[:h]\d{2}\b/g) || []).length
      if (timeCount >= 10) return true
      if (text.includes('hora') && text.includes('canal')) return true
      return false
    }

    for (const source of sources.rows) {
      const urlRaw = typeof source.url === 'string' ? source.url.trim() : ''
      if (!urlRaw || !isSafeExternalHttpUrl(urlRaw)) continue
      const fetchUrl = resolveOneFootballFetchUrl({
        sourceUrl: resolveFootballSourceFetchUrl({ sourceUrl: urlRaw, scheduleDateIso, timeZone }),
        scheduleDateIso,
      })
      if (!fetchUrl || !isSafeExternalHttpUrl(fetchUrl)) continue
      let isFutebolNaTvBrSource = false
      try {
        const host = (new URL(fetchUrl).hostname || '').toLowerCase()
        isFutebolNaTvBrSource = host.endsWith('futebolnatv.com.br')
      } catch {
        isFutebolNaTvBrSource = false
      }
      let matches = []
      let ok = false
      try {
        const isOneFootballSource = (() => {
          try {
            const host = (new URL(fetchUrl).hostname || '').toLowerCase()
            return host.endsWith('onefootball.com')
          } catch {
            return false
          }
        })()

        if (isFutebolNaTvBrSource) {
          try {
            const readerUrl = toJinaReaderUrl(fetchUrl)
            const reader = await fetchTextWithHeaders(readerUrl)
            if (reader.ok && reader.text) {
              const readerMatches = parseFutebolNaTvBrMarkdownSchedule({ markdown: reader.text })
              if (readerMatches.length > 0) {
                matches = readerMatches
                ok = true
              }
            }
          } catch {
          }
        }

        if (isOneFootballSource) {
          try {
            const readerUrl = toJinaReaderUrl(fetchUrl)
            const reader = await fetchTextWithHeaders(readerUrl)
            if (reader.ok && reader.text) {
              const readerMatches = parseOneFootballMarkdownSchedule({ markdown: reader.text })
              if (readerMatches.length > 0) {
                matches = readerMatches
                ok = true
              }
            }
          } catch {
          }
        }

        const primary = await fetchTextWithHeaders(fetchUrl)
        const primarySearchText = normalizeFootballSearchText(stripHtml(primary.text))
        const primaryParsed = parseFootballScheduleFromSource({ sourceUrl: fetchUrl, html: primary.text, targetDateIso: scheduleDateIso })
        if (matches.length === 0) {
          matches = primaryParsed
        } else if (Array.isArray(primaryParsed) && primaryParsed.length > 0) {
          const mergedMap = new Map()
          const buildKey = (m) => `${m.time}::${normalizeFootballSearchText(m.home)}::${normalizeFootballSearchText(m.away)}`
          for (const m of [...matches, ...primaryParsed]) {
            const time = parseClockTime(m?.time)
            const home = typeof m?.home === 'string' ? m.home.trim() : ''
            const away = typeof m?.away === 'string' ? m.away.trim() : ''
            const competition = typeof m?.competition === 'string' ? m.competition.trim() : ''
            const channels = Array.isArray(m?.channels) ? m.channels.map((c) => String(c || '').trim()).filter(Boolean) : []
            const homeCrestUrl = typeof m?.homeCrestUrl === 'string' ? m.homeCrestUrl.trim() : ''
            const awayCrestUrl = typeof m?.awayCrestUrl === 'string' ? m.awayCrestUrl.trim() : ''
            const href = typeof m?.href === 'string' ? m.href.trim() : ''
            if (!time || !home || !away) continue
            const key = buildKey({ time, home, away })
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
          matches = [...mergedMap.values()]
          matches.sort((a, b) => a.time.localeCompare(b.time))
        }
        ok = Boolean(ok) || primary.ok

        const shouldTryReaderToFillGaps = (() => {
          try {
            const url = new URL(fetchUrl)
            const host = (url.hostname || '').toLowerCase()
            if (!host.endsWith('futebolnatv.com.br')) return false
          } catch {
            return false
          }
          return matches.length > 0 && matches.length < 80
        })()

        const shouldTryReader = (() => {
          if (matches.length > 0) return false
          try {
            const url = new URL(fetchUrl)
            const host = (url.hostname || '').toLowerCase()
            if (!host.endsWith('futebolnatv.com.br')) return false
          } catch {
            return false
          }
          if (primary.status >= 400) return true
          if (isLikelyBlockedHtml(primary.text)) return true
          return true
        })()

        if (shouldTryReader || shouldTryReaderToFillGaps) {
          const readerUrl = toJinaReaderUrl(fetchUrl)
          const reader = await fetchTextWithHeaders(readerUrl)
          if (reader.ok && reader.text) {
            const readerMatches = parseFutebolNaTvBrMarkdownSchedule({ markdown: reader.text })
            const canFilterReaderByPrimary =
              Boolean(primary.ok) &&
              Boolean(primary.text) &&
              primarySearchText.length > 400 &&
              !isLikelyBlockedHtml(primary.text) &&
              looksLikeFutebolNaTvScheduleHtml(primary.text)
            const filteredReaderMatches = canFilterReaderByPrimary
              ? readerMatches.filter((m) => {
                  const home = typeof m?.home === 'string' ? m.home.trim() : ''
                  const away = typeof m?.away === 'string' ? m.away.trim() : ''
                  if (!home || !away) return false
                  const homeNeedle = normalizeFootballSearchText(home)
                  const awayNeedle = normalizeFootballSearchText(away)
                  if (!homeNeedle || !awayNeedle) return false
                  return primarySearchText.includes(homeNeedle) && primarySearchText.includes(awayNeedle)
                })
              : []
            const effectiveReaderMatches =
              filteredReaderMatches.length >= Math.max(12, Math.min(readerMatches.length, matches.length))
                ? filteredReaderMatches
                : readerMatches
            if (shouldTryReader) {
              matches = effectiveReaderMatches
            } else if (effectiveReaderMatches.length > 0) {
              const mergedMap = new Map()
              const buildKey = (m) => `${m.time}::${String(m.home || '').toLowerCase()}::${String(m.away || '').toLowerCase()}`
              for (const m of [...matches, ...effectiveReaderMatches]) {
                const time = parseClockTime(m?.time)
                const home = typeof m?.home === 'string' ? m.home.trim() : ''
                const away = typeof m?.away === 'string' ? m.away.trim() : ''
                const competition = typeof m?.competition === 'string' ? m.competition.trim() : ''
                const channels = Array.isArray(m?.channels) ? m.channels.map((c) => String(c || '').trim()).filter(Boolean) : []
                const homeCrestUrl = typeof m?.homeCrestUrl === 'string' ? m.homeCrestUrl.trim() : ''
                const awayCrestUrl = typeof m?.awayCrestUrl === 'string' ? m.awayCrestUrl.trim() : ''
                const href = typeof m?.href === 'string' ? m.href.trim() : ''
                if (!time || !home || !away) continue
                const key = buildKey({ time, home, away })
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
                if (!existing.homeCrestUrl && homeCrestUrl) existing.homeCrestUrl = homeCrestUrl
                if (!existing.awayCrestUrl && awayCrestUrl) existing.awayCrestUrl = awayCrestUrl
                if (!existing.href && href) existing.href = href
              }
              matches = [...mergedMap.values()]
              matches.sort((a, b) => a.time.localeCompare(b.time))
            }
            ok = true
          }
        }
      } catch (err) {
        console.error('[football-refresh] source failed', {
          sourceId: source?.id,
          sourceName: source?.name,
          fetchUrl,
          message: err?.message || String(err),
          stack: err?.stack?.split('\n').slice(0, 4),
        })
        matches = []
        ok = false
      }

      if (isFutebolNaTvBrSource && matches.length > 0) {
        matches = await enrichFutebolNaTvMatchesWithCompetition(matches)
        matches = await enrichFutebolNaTvMatchesWithCrests(matches)
      }

      await query(
        `
        insert into football_schedules (source_id, schedule_date, matches, fetched_at, created_at, updated_at)
        values ($1, $2, $3::jsonb, now(), now(), now())
        on conflict (source_id, schedule_date)
        do update set matches = excluded.matches, fetched_at = now(), updated_at = now()
        `,
        [source.id, scheduleDateIso, JSON.stringify(matches)]
      )

      results.push({ sourceId: source.id, sourceName: source.name, matchesCount: matches.length, ok })
    }
    return { date: scheduleDateIso, results }
  }

  const footballScheduleAutoRefreshCache = new Map()

  const footballScheduleCrestDebugLogCache = new Map()

  const shouldRefreshFootballScheduleBecauseTooFew = ({ merged, scheduleDateIso }) => {
    const matchesCount = Array.isArray(merged) ? merged.length : 0
    if (matchesCount >= 24) return false
    const dateKey = typeof scheduleDateIso === 'string' && scheduleDateIso.trim() ? scheduleDateIso.trim() : ''
    if (!dateKey) return true
    const now = Date.now()
    const last = footballScheduleAutoRefreshCache.get(dateKey) || 0
    const minCooldownMs = matchesCount < 18 ? 60_000 : 10 * 60_000
    if (now - last < minCooldownMs) return false
    footballScheduleAutoRefreshCache.set(dateKey, now)
    return true
  }

  const shouldRefreshFootballScheduleBecauseCrestsMissing = ({ merged, scheduleDateIso }) => {
    const matches = Array.isArray(merged) ? merged : []
    if (matches.length < 8) return false
    const withBoth = matches.filter((m) => {
      const home = typeof m?.homeCrestUrl === 'string' ? m.homeCrestUrl.trim() : ''
      const away = typeof m?.awayCrestUrl === 'string' ? m.awayCrestUrl.trim() : ''
      if (!home || !away) return false
      if (isPlaceholderFootballTeamCrestUrl(home) || isPlaceholderFootballTeamCrestUrl(away)) return false
      return true
    }).length
    const ratio = withBoth / matches.length
    if (ratio >= 0.6) return false
    const dateKey = typeof scheduleDateIso === 'string' && scheduleDateIso.trim() ? scheduleDateIso.trim() : ''
    if (!dateKey) return true
    const now = Date.now()
    const cacheKey = `${dateKey}:crests`
    const last = footballScheduleAutoRefreshCache.get(cacheKey) || 0
    const minCooldownMs = ratio < 0.2 ? 60_000 : 10 * 60_000
    if (now - last < minCooldownMs) return false
    footballScheduleAutoRefreshCache.set(cacheKey, now)
    return true
  }


  return {
    getFootballSettings,
    getDefaultFootballScheduleDate,
    enrichFutebolNaTvMatchesWithCrests,
    enrichFutebolNaTvMatchesWithCompetition,
    enrichFootballMatchesWithTeamNameBadges,
    inlineFootballCrestUrlsAsDataUrls,
    refreshFootballSchedule,
    shouldRefreshFootballScheduleBecauseTooFew,
    shouldRefreshFootballScheduleBecauseCrestsMissing,
    footballScheduleCrestDebugLogCache,
    sniffImageMimeFromBuffer,
  }
}

