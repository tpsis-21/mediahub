/** Parsing/normalização de agenda e filtros de futebol (sem I/O de banco). */

const uniqStrings = (items) => {
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
}

export const FOOTBALL_SETTINGS_KEYS = {
  readTime: 'football_read_time',
  readWindowStart: 'football_read_window_start',
  readWindowEnd: 'football_read_window_end',
  timeZone: 'football_time_zone',
  lastRunDate: 'football_last_run_date',
  excludedChannels: 'football_excluded_channels',
  excludedCompetitions: 'football_excluded_competitions',
}

export const DEFAULT_FOOTBALL_TIME_ZONE = 'America/Sao_Paulo'
export const DEFAULT_FOOTBALL_READ_TIME = '19:00'
export const DEFAULT_FOOTBALL_READ_WINDOW_START = '19:30'
export const DEFAULT_FOOTBALL_READ_WINDOW_END = '20:00'
export const DEFAULT_FOOTBALL_EXCLUDED_CHANNELS = [
  'ppv onefootball',
  'ppv-onefootball',
  'ppv/onefootball',
  'onefootball ppv',
]
export const DEFAULT_FOOTBALL_EXCLUDED_COMPETITIONS = [
  'ingles 5 divisao',
  'inglês 5ª divisão',
  'english 5th division',
  'national league',
  'vanarama national league',
]

export const normalizeFootballFilterToken = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

export const parseFootballSettingList = (rawValue, defaults) => {
  const fallback = Array.isArray(defaults) ? defaults.map((v) => normalizeFootballFilterToken(v)).filter(Boolean) : []
  if (typeof rawValue !== 'string') return fallback
  const raw = rawValue.trim()
  if (!raw) return fallback
  let values = []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) values = parsed
  } catch {
    values = raw.split(/\r?\n|[,;]+/g)
  }
  const normalized = values.map((v) => normalizeFootballFilterToken(v)).filter(Boolean)
  return normalized.length ? [...new Set(normalized)] : fallback
}

export const parseClockTime = (value) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return null
  const m = raw.match(/^(\d{1,2})(?::|h|H)(\d{2})$/)
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23) return null
  if (minutes < 0 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export const getZonedNowParts = ({ timeZone }) => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(new Date())
  const map = new Map(parts.map((p) => [p.type, p.value]))
  const date = `${map.get('year')}-${map.get('month')}-${map.get('day')}`
  const time = `${map.get('hour')}:${map.get('minute')}`
  return { date, time }
}

export const addDaysToIsoDate = (isoDate, days) => {
  const base = new Date(`${isoDate}T12:00:00.000Z`)
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
  return next.toISOString().slice(0, 10)
}

export const stripHtml = (html) => {
  const pre = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|tr|li|div|h1|h2|h3|h4|h5|h6)>/gi, '\n')
  return pre
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export const parseFootballLine = (line) => {
  const normalized = String(line || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  const timeMatch = normalized.match(/\b(\d{1,2}[:hH]\d{2})\b/)
  if (!timeMatch) return null
  const time = parseClockTime(timeMatch[1])
  if (!time) return null

  const rest = normalized.slice((timeMatch.index || 0) + timeMatch[0].length).trim()
  if (!rest) return null

  const parts = rest.split(/\s[-–—]\s/).map((p) => p.trim()).filter(Boolean)
  const teamsPart = parts[0] || rest
  const channelsPart = parts.length > 1 ? parts.slice(1).join(' - ') : ''

  const teamsMatch = teamsPart.match(/^(.+?)\s+(?:x|X|vs\.?|VS\.?)\s+(.+?)$/)
  if (!teamsMatch) return null

  const home = teamsMatch[1].trim()
  const away = teamsMatch[2].trim()
  if (!home || !away) return null

  const channels = channelsPart
    ? channelsPart.split(/[,/|•]+/).map((c) => c.trim()).filter(Boolean)
    : []

  return { time, home, away, channels }
}

export const parseFutebolNaTvSchedule = ({ html, targetDateIso }) => {
  const text = stripHtml(html)
  const targetDdMm = (() => {
    const [y, m, d] = targetDateIso.split('-')
    return `${d}/${m}`
  })()

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  let inDate = false
  const matches = []
  for (const line of lines) {
    const dateMatch = line.match(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/)
    if (dateMatch) {
      const dd = String(dateMatch[1]).padStart(2, '0')
      const mm = String(dateMatch[2]).padStart(2, '0')
      const ddMm = `${dd}/${mm}`
      inDate = ddMm === targetDdMm
      continue
    }
    if (!inDate) continue
    const parsed = parseFootballLine(line)
    if (parsed) matches.push(parsed)
  }
  return matches
}

export const prettifyFootballTeamFromSlug = (slug) => {
  const raw = String(slug || '').trim().replace(/^-+/, '').replace(/-+$/, '')
  if (!raw) return ''
  return raw
    .split('-')
    .filter(Boolean)
    .map((part) => {
      const lowered = part.toLowerCase()
      if (lowered === 'fc' || lowered === 'sc' || lowered === 'mg' || lowered === 'sp' || lowered === 'rj') {
        return lowered.toUpperCase()
      }
      if (part.length <= 2) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const normalizeFootballCompetitionLabel = (value) => {
  const raw = String(value || '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  return raw
    .replace(/\s*[-–—]\s*rodada.*$/i, '')
    .replace(/\s+rodada.*$/i, '')
    .replace(/\s*[-–—]\s*\d+ª?\s+rodada.*$/i, '')
    .trim()
}

export const extractFootballCompetitionFromHref = (absHref) => {
  const m = String(absHref || '').match(/\/aovivo\/([^?#]+)$/i)
  const path = m ? m[1] : ''
  if (!path) return ''
  const parts = path
    .replace(/\.html$/i, '')
    .split('/')
    .map((part) => String(part || '').trim())
    .filter(Boolean)
  if (parts.length < 2) return ''
  const competitionSlug = parts[0]
  if (!competitionSlug || competitionSlug.includes('-x-')) return ''
  return normalizeFootballCompetitionLabel(prettifyFootballTeamFromSlug(competitionSlug))
}

export const normalizeFootballSearchText = (value) => {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const isPlaceholderFootballTeamCrestUrl = (value) => String(value || '').includes('/assets/img/loadteam.png')

export const normalizeFootballCrestUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('data:')) return raw
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('/')) return `https://www.futebolnatv.com.br${raw}`
  if (raw.startsWith('upload/')) return `https://www.futebolnatv.com.br/${raw}`
  // Sem protocolo, new URL() falha e isSafeExternalHttpUrl rejeita — quebra o proxy /api/football/crest.
  if (/^www\.futebolnatv\.com\.br(\/|$|\?|#)/i.test(raw) && !/^https?:\/\//i.test(raw)) {
    return `https://${raw}`
  }
  try {
    const parsed = new URL(raw)
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:'
      return parsed.toString()
    }
    return parsed.toString()
  } catch {
    return raw
  }
}

export const parseFutebolNaTvBrSchedule = ({ html }) => {
  const rawHtml = String(html || '')
  const anchorRe = /<a\b[^>]*href="([^"]*\/aovivo\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const byHref = new Map()

  const toAbsHref = (href) => {
    const raw = String(href || '')
      .trim()
      .replace(/^[\[(<"']+/, '')
      .replace(/[\])>,"'.;:!?]+$/, '')
    if (!raw) return ''
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
    if (raw.startsWith('/')) return `https://www.futebolnatv.com.br${raw}`
    return `https://www.futebolnatv.com.br/${raw}`
  }

  const parseTeamsFromHref = (absHref) => {
    const m = String(absHref || '').match(/\/aovivo\/([^?#]+)$/i)
    const last = m ? m[1] : ''
    const base = last.replace(/\.html$/i, '')
    const sep = base.indexOf('-x-')
    if (sep === -1) return { home: '', away: '' }
    const homeSlug = base.slice(0, sep)
    let awaySlug = base.slice(sep + 3)
    awaySlug = awaySlug
      .replace(/-\d{2}-\d{2}-\d{4}$/i, '')
      .replace(/-\d{4}-\d{2}-\d{2}$/i, '')
      .replace(/-[a-f0-9]{8,}$/i, '')
    return { home: prettifyFootballTeamFromSlug(homeSlug), away: prettifyFootballTeamFromSlug(awaySlug) }
  }

  const maybeSetChannels = (entry, text) => {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim()
    if (!normalized) return
    if (normalized.length > 140) return
    const looksLikeChannels = normalized === normalized.toUpperCase() && /[A-Z]/.test(normalized) && !/\b\d{1,2}[:hH]\d{2}\b/.test(normalized)
    if (!looksLikeChannels) return
    entry.channels = [normalized]
  }

  const toAbsAssetUrl = (href) => {
    const raw = String(href || '').trim()
    if (!raw) return ''
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
    if (raw.startsWith('//')) return `https:${raw}`
    if (raw.startsWith('/')) return `https://www.futebolnatv.com.br${raw}`
    return `https://www.futebolnatv.com.br/${raw}`
  }

  const extractTeamCrestsFromAnchorHtml = (value) => {
    const raw = String(value || '')
    if (!raw) return { homeCrestUrl: '', awayCrestUrl: '' }
    const urls = []
    const re = /<img\b[^>]*\b(?:data-src|src|data-original|data-lazy-src|data-lazy)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi
    let m
    while ((m = re.exec(raw)) !== null) {
      const src = String(m[1] || m[2] || m[3] || '').trim()
      if (src) urls.push(toAbsAssetUrl(src))
    }
    const unique = uniqStrings(urls)
    const teamUrls = unique.filter((u) => u.includes('/upload/teams/') || u.includes('/assets/img/loadteam.png'))
    return { homeCrestUrl: teamUrls[0] || '', awayCrestUrl: teamUrls[1] || '' }
  }

  const parseTableMatches = () => {
    let selectedTableHtml = ''

    const parseTableMatchesFromHtml = (tableHtml) => {
      const rows = String(tableHtml || '').match(/<tr\b[\s\S]*?<\/tr>/gi) || []
      const out = []
      for (const rowHtml of rows) {
        const hrefMatch = String(rowHtml || '').match(/href="([^"]*\/aovivo\/[^"]+)"/i)
        const href = hrefMatch ? toAbsHref(hrefMatch[1]) : ''
        const cells = []
        const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi
        let m
        while ((m = cellRe.exec(rowHtml)) !== null) {
          cells.push(m[1])
        }
        if (cells.length < 4) continue

        const timeCell = stripHtml(cells[0]).replace(/\s+/g, ' ').trim()
        const timeToken = (timeCell.match(/\b(\d{1,2}[:hH]\d{2})\b/) || [])[1] || timeCell
        const time = parseClockTime(timeToken)
        if (!time) continue

        const normalizeCellText = (html) => stripHtml(html).replace(/\s+/g, ' ').trim()
        const competitionCell = normalizeFootballCompetitionLabel(cells[1] ? normalizeCellText(cells[1]) : '')
        const competitionHref = normalizeFootballCompetitionLabel(extractFootballCompetitionFromHref(href))
        const competition = competitionCell || competitionHref
        const separatorIdx = cells.findIndex((cellHtml) => {
          const value = normalizeCellText(cellHtml).toLowerCase()
          return value === 'x' || value === '×' || value === 'vs' || value === 'vs.'
        })

        let homeHtml = ''
        let awayHtml = ''
        let home = ''
        let away = ''
        if (separatorIdx > 1 && separatorIdx < cells.length - 2) {
          homeHtml = cells[separatorIdx - 1]
          awayHtml = cells[separatorIdx + 1]
          home = normalizeCellText(homeHtml)
          away = normalizeCellText(awayHtml)
        } else {
          const gameHtml = cells.slice(2, -1).join(' ')
          const gameText = normalizeCellText(gameHtml)
          const teamsMatch = gameText.match(/^(.+?)\s*(?:x|X|×|vs\.?|VS\.?)\s*(.+?)$/)
          if (!teamsMatch) continue
          home = teamsMatch[1].trim()
          away = teamsMatch[2].trim()
          homeHtml = gameHtml
          awayHtml = gameHtml
        }
        if (!home || !away) continue

        const channelHtml = cells[cells.length - 1] || ''
        const channelTextRaw = stripHtml(channelHtml).replace(/\s+/g, ' ').trim()
        const isNoBroadcast = /sem\s+transmiss/i.test(channelTextRaw)
        const channels = isNoBroadcast || !channelTextRaw
          ? []
          : channelTextRaw
              .split(/\s*(?:,|\/|\||•|\be\b)\s*/i)
              .map((c) => c.trim())
              .filter(Boolean)

        const firstImgSrc = (html) => {
          const value = String(html || '')
          const imgMatch = value.match(/<img\b[^>]*\b(?:data-src|src|data-original|data-lazy-src|data-lazy)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/i)
          const src = imgMatch ? (imgMatch[1] || imgMatch[2] || imgMatch[3] || '') : ''
          return src ? toAbsAssetUrl(src) : ''
        }
        const homeCrestUrl = firstImgSrc(homeHtml)
        const awayCrestUrl = firstImgSrc(awayHtml)

        out.push({ time, home, away, competition, channels, homeCrestUrl, awayCrestUrl, href })
      }
      return out
    }

    const tables = rawHtml.match(/<table\b[\s\S]*?<\/table>/gi) || []
    const candidates = tables.length > 0 ? tables : [rawHtml]
    let bestMatches = []
    let bestScore = -1
    for (const candidate of candidates) {
      const headerText = stripHtml(candidate).replace(/\s+/g, ' ').toLowerCase()
      const hasHeader = headerText.includes('hora') && headerText.includes('jogo') && headerText.includes('canal')
      const parsed = parseTableMatchesFromHtml(candidate)
      const score = parsed.length * 10 + (hasHeader ? 50 : 0)
      if (score > bestScore) {
        bestScore = score
        bestMatches = parsed
        selectedTableHtml = candidate
      }
    }

    parseTableMatches.selectedTableHtml = selectedTableHtml
    return bestMatches
  }

  let match
  while ((match = anchorRe.exec(rawHtml)) !== null) {
    const absHref = toAbsHref(match[1])
    if (!absHref) continue
    const inner = match[2]
    const text = stripHtml(inner).replace(/\s+/g, ' ').trim()
    if (!text) continue

    const existing = byHref.get(absHref) || {
      href: absHref,
      time: null,
      home: '',
      away: '',
      competition: '',
      channels: [],
      homeCrestUrl: '',
      awayCrestUrl: '',
    }
    if (!existing.href) existing.href = absHref
    if (!existing.homeCrestUrl || !existing.awayCrestUrl) {
      const crests = extractTeamCrestsFromAnchorHtml(inner)
      if (!existing.homeCrestUrl && crests.homeCrestUrl) existing.homeCrestUrl = crests.homeCrestUrl
      if (!existing.awayCrestUrl && crests.awayCrestUrl) existing.awayCrestUrl = crests.awayCrestUrl
    }
    const timeMatch = text.match(/\b(\d{1,2}[:hH]\d{2})\b/)
    if (timeMatch) {
      const time = parseClockTime(timeMatch[1])
      if (time) existing.time = time
      if (!existing.home || !existing.away) {
        const fromAlt = (() => {
          const alts = []
          const re = /<img\b[^>]*\balt\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi
          let m
          while ((m = re.exec(inner)) !== null) {
            const alt = String(m[1] || m[2] || '').trim()
            if (!alt) continue
            // ignora logo de competição / país
            if (/série|brasileir|copa|liga|campeonato|rodada|uefa|libertadores/i.test(alt)) continue
            alts.push(alt)
          }
          return { home: alts[0] || '', away: alts[1] || '' }
        })()
        if (fromAlt.home && fromAlt.away) {
          existing.home = fromAlt.home
          existing.away = fromAlt.away
        } else {
          const teams = parseTeamsFromHref(absHref)
          if (teams.home && teams.away) {
            existing.home = teams.home
            existing.away = teams.away
          }
        }
      }
      if (!existing.competition) {
        const competition = normalizeFootballCompetitionLabel(
          extractFootballCompetitionFromHref(absHref) ||
            (() => {
              const bold = inner.match(/<span[^>]*font-bold[^>]*>([\s\S]*?)<\/span>/i)
              return bold ? stripHtml(bold[1]).replace(/\s+/g, ' ').trim() : ''
            })(),
        )
        if (competition) existing.competition = competition
      }
    } else {
      maybeSetChannels(existing, text)
    }
    byHref.set(absHref, existing)
  }

  const matches = []
  for (const entry of byHref.values()) {
    const time = parseClockTime(entry?.time)
    const home = typeof entry?.home === 'string' ? entry.home.trim() : ''
    const away = typeof entry?.away === 'string' ? entry.away.trim() : ''
    const competition = typeof entry?.competition === 'string' ? entry.competition.trim() : ''
    const channels = Array.isArray(entry?.channels) ? entry.channels.map((c) => String(c || '').trim()).filter(Boolean) : []
    const homeCrestUrl = typeof entry?.homeCrestUrl === 'string' ? entry.homeCrestUrl.trim() : ''
    const awayCrestUrl = typeof entry?.awayCrestUrl === 'string' ? entry.awayCrestUrl.trim() : ''
    const href = typeof entry?.href === 'string' ? entry.href.trim() : ''
    if (!time || !home || !away) continue
    matches.push({ time, home, away, competition, channels, homeCrestUrl, awayCrestUrl, href })
  }

  const tableMatches = parseTableMatches()
  const selectedTableHtml = typeof parseTableMatches.selectedTableHtml === 'string' ? parseTableMatches.selectedTableHtml : ''
  const looseMatches = tableMatches.length > 0
    ? []
    : (() => {
        const text = stripHtml(selectedTableHtml || rawHtml)
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
        const out = []
        for (const line of lines) {
          const parsed = parseFootballLine(line)
          if (!parsed) continue
          out.push(parsed)
        }
        return out
      })()

  const mergedMap = new Map()
  const buildKey = (m) => `${m.time}::${String(m.home || '').toLowerCase()}::${String(m.away || '').toLowerCase()}`
  for (const m of [...matches, ...tableMatches, ...looseMatches]) {
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
      const nextChannels = uniqStrings([...existing.channels, ...channels])
      existing.channels = nextChannels
    }
    if (!existing.homeCrestUrl && homeCrestUrl) existing.homeCrestUrl = homeCrestUrl
    if (!existing.awayCrestUrl && awayCrestUrl) existing.awayCrestUrl = awayCrestUrl
    if (!existing.href && href) existing.href = href
  }

  const merged = [...mergedMap.values()]
  merged.sort((a, b) => a.time.localeCompare(b.time))
  return merged
}

export const parseFutebolNaTvBrMarkdownSchedule = ({ markdown }) => {
  const raw = String(markdown || '')
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const byHref = new Map()
  const pipeMatches = []

  const toAbsHref = (href) => {
    const raw = String(href || '')
      .trim()
      .replace(/^[\[(<"']+/, '')
      .replace(/[\])>,"'.;:!?]+$/, '')
    if (!raw) return ''
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
    if (raw.startsWith('//')) return `https:${raw}`
    if (raw.startsWith('/')) return `https://www.futebolnatv.com.br${raw}`
    return `https://www.futebolnatv.com.br/${raw}`
  }

  const toAbsAssetUrl = (href) => {
    const raw = String(href || '').trim()
    if (!raw) return ''
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
    if (raw.startsWith('//')) return `https:${raw}`
    if (raw.startsWith('/')) return `https://www.futebolnatv.com.br${raw}`
    return `https://www.futebolnatv.com.br/${raw}`
  }

  const ensureEntry = (absHref) => {
    const existing = byHref.get(absHref)
    if (existing) return existing
    const next = { href: absHref, time: null, home: '', away: '', competition: '', channels: [], homeCrestUrl: '', awayCrestUrl: '' }
    byHref.set(absHref, next)
    return next
  }

  const parseTeamsFromHref = (absHref) => {
    const m = String(absHref || '').match(/\/aovivo\/([^?#]+)$/i)
    const last = m ? m[1] : ''
    const base = last.replace(/\.html$/i, '')
    const sep = base.indexOf('-x-')
    if (sep === -1) return { home: '', away: '' }
    const homeSlug = base.slice(0, sep)
    let awaySlug = base.slice(sep + 3)
    awaySlug = awaySlug
      .replace(/-\d{2}-\d{2}-\d{4}$/i, '')
      .replace(/-\d{4}-\d{2}-\d{2}$/i, '')
      .replace(/-[a-f0-9]{8,}$/i, '')
    return { home: prettifyFootballTeamFromSlug(homeSlug), away: prettifyFootballTeamFromSlug(awaySlug) }
  }

  const extractGameHrefsFromLine = (line) => {
    const hrefs = []
    const re = /\]\(((?:https?:\/\/(?:www\.)?futebolnatv\.com\.br)?\/aovivo\/[^)\s]+|https?:\/\/(?:www\.)?futebolnatv\.com\.br\/aovivo\/[^)\s]+)\)/gi
    let m
    while ((m = re.exec(line)) !== null) {
      const abs = toAbsHref(m[1])
      if (abs) hrefs.push(abs)
    }
    const fallbackRe = /(https?:\/\/(?:www\.)?futebolnatv\.com\.br\/aovivo\/[^\s)\]>"]+)/gi
    while ((m = fallbackRe.exec(String(line || ''))) !== null) {
      const abs = toAbsHref(m[1])
      if (abs) hrefs.push(abs)
    }
    if (hrefs.length === 0) return hrefs
    return uniqStrings(hrefs)
  }

  const extractChannelLabelFromLine = (line, absHref) => {
    const escaped = String(absHref || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\[([^\\]]{1,80})\\]\\(${escaped}\\)`, 'gi')
    const labels = []
    let m
    while ((m = re.exec(line)) !== null) {
      labels.push(String(m[1] || '').trim())
    }
    return labels.filter(Boolean)
  }

  const extractTeamCrestsFromLine = (line) => {
    const rawLine = String(line || '')
    if (!rawLine) return { homeCrestUrl: '', awayCrestUrl: '' }
    const urls = []
    const re = /!\[[^\]]*\]\(([^)\s]+)\)/gi
    let m
    while ((m = re.exec(rawLine)) !== null) {
      const abs = toAbsAssetUrl(String(m[1] || '').trim())
      if (abs) urls.push(abs)
    }
    const htmlImgRe = /<img\b[^>]*\b(?:data-src|src|data-original|data-lazy-src|data-lazy)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi
    while ((m = htmlImgRe.exec(rawLine)) !== null) {
      const src = String(m[1] || m[2] || m[3] || '').trim()
      const abs = toAbsAssetUrl(src)
      if (abs) urls.push(abs)
    }
    const teamUrls = urls
      .filter(Boolean)
      .filter((u) => u.includes('/upload/teams/') || u.includes('/assets/img/loadteam.png'))
    const unique = uniqStrings(teamUrls)
    const homeCrestUrl = unique[0] || ''
    const awayCrestUrl = unique[1] || ''
    return { homeCrestUrl, awayCrestUrl }
  }

  const normalizeChannelListFromCell = (value) => {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim()
    if (!normalized) return []
    if (/sem\s+transmiss/i.test(normalized)) return []
    return normalized
      .split(/\s*(?:,|\/|\||•|\be\b)\s*/i)
      .map((c) => c.trim())
      .filter(Boolean)
  }

  const stripMarkdownInline = (value) => {
    const raw = String(value || '')
    if (!raw) return ''
    const withoutLinks = raw.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    const withoutHtml = stripHtml(withoutLinks)
    return withoutHtml
      .replace(/[`*_~]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const parsePipeRow = (line) => {
    if (!line.includes('|')) return null
    const cells = line
      .split('|')
      .map((c) => stripMarkdownInline(c))
      .filter(Boolean)
    if (cells.length < 3) return null
    const timeToken = (cells[0].match(/\b(\d{1,2}[:hH]\d{2})\b/) || [])[1] || cells[0]
    const time = parseClockTime(timeToken)
    if (!time) return null

    const separatorIdx = cells.findIndex((c) => {
      const v = c.toLowerCase()
      return v === 'x' || v === '×' || v === 'vs' || v === 'vs.'
    })
    let home = ''
    let away = ''
    if (separatorIdx > 0 && separatorIdx < cells.length - 1) {
      home = String(cells[separatorIdx - 1] || '').trim()
      away = String(cells[separatorIdx + 1] || '').trim()
    } else {
      const gameCell = cells.find((c) => /(?:\bx\b|×|\bvs\.?\b)/i.test(c)) || ''
      const match = String(gameCell).match(/^(.+?)\s*(?:x|X|×|vs\.?|VS\.?)\s*(.+?)$/)
      if (match) {
        home = String(match[1] || '').trim()
        away = String(match[2] || '').trim()
      }
    }
    if (!home || !away) return null

    const href = extractGameHrefsFromLine(line)[0] || ''
    const competitionCell = normalizeFootballCompetitionLabel(cells[1] || '')
    const competitionHref = normalizeFootballCompetitionLabel(extractFootballCompetitionFromHref(href))
    const competition = competitionCell || competitionHref
    const channels = normalizeChannelListFromCell(cells[cells.length - 1])
    const crests = extractTeamCrestsFromLine(line)
    return { time, home, away, competition, channels, homeCrestUrl: crests.homeCrestUrl, awayCrestUrl: crests.awayCrestUrl, href }
  }

  const extractCompetitionFromMarkdownLine = (line) => {
    const raw = String(line || '')
    if (!raw) return ''
    const boldMatch = raw.match(/\*\*([^*]+)\*\s*(?:-\s*rodada[^\]\n]*)?/i)
    const fromBold = normalizeFootballCompetitionLabel(boldMatch ? boldMatch[1] : '')
    if (fromBold) return fromBold
    const inlineMatch = raw.match(/\b((?:campeonato|copa|liga|divisão|superliga)[^–—\-\n]{0,120})\s*(?:[-–—]\s*rodada.*)?/i)
    return normalizeFootballCompetitionLabel(inlineMatch ? inlineMatch[1] : '')
  }

  const headerIdx = lines.findIndex((line) => {
    if (!line.includes('|')) return false
    const normalized = stripMarkdownInline(line).toLowerCase()
    return normalized.includes('hora') && normalized.includes('jogo') && normalized.includes('canal')
  })

  const pipeScanLines = headerIdx >= 0 ? lines.slice(headerIdx + 1) : lines
  let hasParsedPipe = false
  for (const line of pipeScanLines) {
    let allowPipeParse = true
    if (headerIdx >= 0) {
      const normalized = stripMarkdownInline(line)
      if (!normalized.includes('|') && hasParsedPipe) break
      if (/\b:?-{3,}:?\b/.test(normalized)) continue
      if (!normalized.includes('|')) allowPipeParse = false
    }
    if (allowPipeParse) {
      const parsedPipe = parsePipeRow(line)
      if (parsedPipe) {
        pipeMatches.push(parsedPipe)
        hasParsedPipe = true
      }
    }

    const hrefs = extractGameHrefsFromLine(line)
    if (hrefs.length === 0) continue

    const timeMatch = line.match(/\b(\d{1,2}[:hH]\d{2})\b/)
    const crests = extractTeamCrestsFromLine(line)
    const lineCompetition = extractCompetitionFromMarkdownLine(line)
    for (const absHref of hrefs) {
      const entry = ensureEntry(absHref)

      if (!entry.homeCrestUrl && crests.homeCrestUrl) entry.homeCrestUrl = crests.homeCrestUrl
      if (!entry.awayCrestUrl && crests.awayCrestUrl) entry.awayCrestUrl = crests.awayCrestUrl
      if (!entry.competition && lineCompetition) entry.competition = lineCompetition
      if (!entry.competition) {
        const fromHref = normalizeFootballCompetitionLabel(extractFootballCompetitionFromHref(absHref))
        if (fromHref) entry.competition = fromHref
      }

      if (timeMatch) {
        const time = parseClockTime(timeMatch[1])
        if (time) entry.time = time
        if (!entry.home || !entry.away) {
          const teams = parseTeamsFromHref(absHref)
          if (teams.home && teams.away) {
            entry.home = teams.home
            entry.away = teams.away
          }
        }
        continue
      }

      const labels = extractChannelLabelFromLine(line, absHref)
      if (labels.length > 0) {
        entry.channels = labels
        continue
      }

      if (entry.channels.length === 0) {
        const normalized = String(line || '').replace(/\s+/g, ' ').trim()
        const looksLikeChannels = normalized === normalized.toUpperCase() && /[A-Z]/.test(normalized) && normalized.length <= 140
        if (looksLikeChannels) entry.channels = [normalized]
      }
    }
  }

  const matches = []
  for (const entry of byHref.values()) {
    const time = parseClockTime(entry?.time)
    const home = typeof entry?.home === 'string' ? entry.home.trim() : ''
    const away = typeof entry?.away === 'string' ? entry.away.trim() : ''
    const competition = typeof entry?.competition === 'string' ? entry.competition.trim() : ''
    const channels = Array.isArray(entry?.channels) ? entry.channels.map((c) => String(c || '').trim()).filter(Boolean) : []
    const homeCrestUrl = typeof entry?.homeCrestUrl === 'string' ? entry.homeCrestUrl.trim() : ''
    const awayCrestUrl = typeof entry?.awayCrestUrl === 'string' ? entry.awayCrestUrl.trim() : ''
    const href = typeof entry?.href === 'string' ? entry.href.trim() : ''
    if (!time || !home || !away) continue
    matches.push({ time, home, away, competition, channels, homeCrestUrl, awayCrestUrl, href })
  }
  const mergedMap = new Map()
  const buildKey = (m) => `${m.time}::${String(m.home || '').toLowerCase()}::${String(m.away || '').toLowerCase()}`
  for (const m of [...matches, ...pipeMatches]) {
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
  const merged = [...mergedMap.values()]
  merged.sort((a, b) => a.time.localeCompare(b.time))
  return merged
}

export const parseOneFootballMarkdownSchedule = ({ markdown }) => {
  const raw = String(markdown || '')
  if (!raw) return []
  const lines = raw.split('\n')
  const out = []
  let currentCompetition = ''

  const extractOneFootballCrestUrl = (rawUrl) => {
    const value = String(rawUrl || '').trim()
    if (!value) return ''
    try {
      const parsed = new URL(value)
      const encoded = parsed.searchParams.get('image')
      if (encoded) {
        let decoded = encoded
        for (let i = 0; i < 3; i++) {
          try {
            const next = decodeURIComponent(decoded)
            if (next === decoded) break
            decoded = next
          } catch {
            break
          }
        }
        if (/^https?:\/\//i.test(decoded)) return decoded
      }
      return parsed.toString()
    } catch {
      return value
    }
  }

  for (const originalLine of lines) {
    const line = String(originalLine || '').trim()
    if (!line) continue

    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      currentCompetition = normalizeFootballCompetitionLabel(heading[1])
      continue
    }

    if (!/^\*\s+/.test(line)) continue
    if (!/\/match\//i.test(line)) continue

    const iconRe = /Icon:\s*([^)\]]+)\]\((https?:\/\/[^)\s]+)\)/gi
    const teams = []
    let m
    while ((m = iconRe.exec(line)) !== null) {
      const name = String(m[1] || '').replace(/\s+/g, ' ').trim()
      const crest = extractOneFootballCrestUrl(m[2])
      if (name) teams.push({ name, crest })
      if (teams.length >= 2) break
    }
    if (teams.length < 2) continue

    const timeMatch = line.match(/\b(\d{1,2}:\d{2})\b/)
    const time = parseClockTime(timeMatch ? timeMatch[1] : '')
    if (!time) continue

    const hrefMatch = line.match(/\]\((https?:\/\/(?:www\.)?onefootball\.com\/[^)\s]*\/match\/\d+[^)\s]*)\)/i)
    const href = hrefMatch ? String(hrefMatch[1]).trim() : ''

    out.push({
      time,
      home: teams[0].name,
      away: teams[1].name,
      competition: currentCompetition,
      channels: [],
      homeCrestUrl: teams[0].crest || '',
      awayCrestUrl: teams[1].crest || '',
      href,
    })
  }

  const mergedMap = new Map()
  for (const m of out) {
    const key = `${m.time}::${normalizeFootballSearchText(m.home)}::${normalizeFootballSearchText(m.away)}`
    if (!mergedMap.has(key)) {
      mergedMap.set(key, m)
      continue
    }
    const existing = mergedMap.get(key)
    if (!existing.competition && m.competition) existing.competition = m.competition
    if (!existing.homeCrestUrl && m.homeCrestUrl) existing.homeCrestUrl = m.homeCrestUrl
    if (!existing.awayCrestUrl && m.awayCrestUrl) existing.awayCrestUrl = m.awayCrestUrl
  }
  const merged = [...mergedMap.values()]
  merged.sort((a, b) => a.time.localeCompare(b.time))
  return merged
}

export const isLikelyBlockedHtml = (html) => {
  const raw = String(html || '')
  if (!raw) return false
  const lower = raw.toLowerCase()
  if (lower.includes('cf-browser-verification')) return true
  if (lower.includes('cloudflare')) return true
  if (lower.includes('attention required')) return true
  if (lower.includes('just a moment')) return true
  if (lower.includes('enable javascript')) return true
  if (lower.includes('checking your browser')) return true
  return false
}

export const toJinaReaderUrl = (absUrl) => {
  const raw = String(absUrl || '').trim()
  if (!raw) return ''
  try {
    const u = new URL(raw)
    return `https://r.jina.ai/${u.protocol}//${u.host}${u.pathname}${u.search}${u.hash}`
  } catch {
    return `https://r.jina.ai/https://${raw.replace(/^\/+/, '')}`
  }
}

export const fetchTextWithHeaders = async (url) => {
  let origin = ''
  try {
    origin = new URL(String(url || '')).origin
  } catch {
    origin = ''
  }
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.7,en;q=0.6',
      ...(origin ? { referer: `${origin}/`, origin } : {}),
    },
  })
  const text = await response.text()
  return { ok: response.ok, status: response.status, text }
}

export const resolveFootballSourceFetchUrl = ({ sourceUrl, scheduleDateIso, timeZone }) => {
  try {
    const url = new URL(String(sourceUrl || ''))
    const host = (url.hostname || '').toLowerCase()
    if (!host.endsWith('futebolnatv.com.br')) return sourceUrl

    const nowParts = getZonedNowParts({ timeZone: timeZone || DEFAULT_FOOTBALL_TIME_ZONE })
    const today = nowParts.date
    if (scheduleDateIso === today) return 'https://www.futebolnatv.com.br/jogos-hoje/'
    if (scheduleDateIso === addDaysToIsoDate(today, 1)) return 'https://www.futebolnatv.com.br/jogos-amanha/'
    if (scheduleDateIso === addDaysToIsoDate(today, -1)) return 'https://www.futebolnatv.com.br/jogos-ontem/'
    return 'https://www.futebolnatv.com.br/'
  } catch {
    return sourceUrl
  }
}

export const resolveOneFootballFetchUrl = ({ sourceUrl, scheduleDateIso }) => {
  try {
    const url = new URL(String(sourceUrl || ''))
    const host = (url.hostname || '').toLowerCase()
    if (!host.endsWith('onefootball.com')) return sourceUrl
    if (!scheduleDateIso) return 'https://onefootball.com/pt-br/jogos'
    return `https://onefootball.com/pt-br/jogos?date=${encodeURIComponent(scheduleDateIso)}`
  } catch {
    return sourceUrl
  }
}

export const parseFootballScheduleFromSource = ({ sourceUrl, html, targetDateIso }) => {
  try {
    const url = new URL(String(sourceUrl || ''))
    const host = (url.hostname || '').toLowerCase()
    if (host.endsWith('futebolnatv.com.br')) {
      return parseFutebolNaTvBrSchedule({ html })
    }
  } catch {
  }
  return parseFutebolNaTvSchedule({ html, targetDateIso })
}

