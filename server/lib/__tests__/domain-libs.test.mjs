import { describe, expect, it } from 'vitest'
import {
  isYouTubeTrailerId,
  isYouTubeTrailerUrl,
  buildYouTubeTrailerUrlFromId,
  stripYouTubeUrlsFromText,
  escapeFfmpegText,
} from '../media-tools.mjs'
import {
  parseClockTime,
  parseFootballLine,
  normalizeFootballCrestUrl,
  normalizeFootballFilterToken,
  stripHtml,
  addDaysToIsoDate,
  getZonedNowParts,
  parseFutebolNaTvBrSchedule,
} from '../football-parse.mjs'
import { createFootballScheduleService } from '../football-schedule.mjs'
import {
  createSearchProviderService,
  getSearchProviderErrorMessage,
  getStableObjectKey,
  normalizeTrendingPayload,
  uniqStrings,
} from '../search-provider.mjs'

describe('media-tools', () => {
  it('valida ids/urls de YouTube', () => {
    expect(isYouTubeTrailerId('dQw4w9WgXcQ')).toBe(true)
    expect(isYouTubeTrailerId('curto')).toBe(false)
    expect(isYouTubeTrailerUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
    expect(buildYouTubeTrailerUrlFromId('dQw4w9WgXcQ')).toContain('dQw4w9WgXcQ')
  })

  it('stripYouTubeUrlsFromText e escapeFfmpegText', () => {
    const cleaned = stripYouTubeUrlsFromText('Veja https://youtu.be/dQw4w9WgXcQ agora')
    expect(cleaned.toLowerCase()).not.toContain('youtu')
    expect(escapeFfmpegText("a:b'c")).toContain('\\')
  })
})

describe('football-parse', () => {
  it('parseClockTime / parseFootballLine', () => {
    expect(parseClockTime('21h30')).toBe('21:30')
    const match = parseFootballLine('21:00 Flamengo x Palmeiras - SporTV')
    expect(match?.home?.toLowerCase()).toContain('flamengo')
    expect(match?.away?.toLowerCase()).toContain('palmeiras')
  })

  it('parseFutebolNaTvBrSchedule lê cards /aovivo/ do layout atual', () => {
    const html = `
<a href="/aovivo/america-mg-x-londrina-a86e8895c7.html" class="block">
  <article>
    <span class="font-bold">Brasileirão Série B</span>
    <time>19:00</time>
    <img src="https://static.futebolnatv.com.br/upload/teams/home.png" alt="América-MG" />
    <span>América-MG</span>
    <img src="https://static.futebolnatv.com.br/upload/teams/away.png" alt="Londrina" />
    <span>Londrina</span>
    <span>PREMIERE</span>
  </article>
</a>`
    const matches = parseFutebolNaTvBrSchedule({ html })
    expect(matches.length).toBe(1)
    expect(matches[0].time).toBe('19:00')
    expect(matches[0].home.toLowerCase()).toContain('américa')
    expect(matches[0].away.toLowerCase()).toContain('londrina')
    expect(matches[0].competition.toLowerCase()).toContain('brasileirão')
    expect(matches[0].homeCrestUrl).toContain('/upload/teams/')
  })

  it('normalize crest / filter / stripHtml', () => {
    expect(normalizeFootballCrestUrl('//cdn.example/a.png')).toBe('https://cdn.example/a.png')
    expect(normalizeFootballFilterToken('  Inglês  5ª  ')).toContain('ingles')
    expect(stripHtml('<b>Olá</b>')).toBe('Olá')
  })
})

describe('football-schedule service', () => {
  const svc = createFootballScheduleService({
    query: async () => ({ rows: [] }),
    getAppSettingValue: async () => null,
    setAppSettingValue: async () => {},
    isSafeExternalHttpUrl: () => true,
    FOOTBALL_SETTINGS_KEYS: {
      readTime: 'football_read_time',
      readWindowStart: 'football_read_window_start',
      readWindowEnd: 'football_read_window_end',
      timeZone: 'football_time_zone',
      lastRunDate: 'football_last_run_date',
      excludedChannels: 'football_excluded_channels',
      excludedCompetitions: 'football_excluded_competitions',
    },
    DEFAULT_FOOTBALL_TIME_ZONE: 'America/Sao_Paulo',
    DEFAULT_FOOTBALL_READ_TIME: '18:00',
    DEFAULT_FOOTBALL_READ_WINDOW_START: '06:00',
    DEFAULT_FOOTBALL_READ_WINDOW_END: '23:59',
    DEFAULT_FOOTBALL_EXCLUDED_CHANNELS: [],
    DEFAULT_FOOTBALL_EXCLUDED_COMPETITIONS: [],
    parseClockTime,
    parseFootballSettingList: () => [],
    normalizeFootballFilterToken,
    normalizeFootballSearchText: (s) => String(s || '').toLowerCase(),
    normalizeFootballCrestUrl,
    isPlaceholderFootballTeamCrestUrl: () => false,
    stripHtml,
    parseFootballScheduleFromSource: () => [],
    parseFutebolNaTvBrMarkdownSchedule: () => [],
    parseFutebolNaTvBrSchedule: () => [],
    getZonedNowParts,
    addDaysToIsoDate,
    resolveFootballSourceFetchUrl: ({ sourceUrl }) => sourceUrl,
    resolveOneFootballFetchUrl: ({ sourceUrl }) => sourceUrl,
    toJinaReaderUrl: (u) => u,
    fetchTextWithHeaders: async () => ({ ok: false, text: '' }),
  })

  it('getDefaultFootballScheduleDate avança após cutoff', () => {
    expect(
      svc.getDefaultFootballScheduleDate({
        nowDateIso: '2026-07-12',
        nowTime: '17:00',
        readTime: '18:00',
      }),
    ).toBe('2026-07-12')
    expect(
      svc.getDefaultFootballScheduleDate({
        nowDateIso: '2026-07-12',
        nowTime: '18:00',
        readTime: '18:00',
      }),
    ).toBe('2026-07-13')
  })

  it('sniffImageMimeFromBuffer reconhece JPEG/PNG', () => {
    const jpeg = Buffer.alloc(12, 0)
    jpeg[0] = 0xff
    jpeg[1] = 0xd8
    jpeg[2] = 0xff
    expect(svc.sniffImageMimeFromBuffer(jpeg)).toBe('image/jpeg')

    const png = Buffer.alloc(12, 0)
    png[0] = 0x89
    png[1] = 0x50
    png[2] = 0x4e
    png[3] = 0x47
    expect(svc.sniffImageMimeFromBuffer(png)).toBe('image/png')
  })
})

describe('search-provider', () => {
  it('uniqStrings / getStableObjectKey / mensagens de erro', () => {
    expect(uniqStrings([' a ', 'a', '', 'b'])).toEqual(['a', 'b'])
    expect(getStableObjectKey({ b: 1, a: 2 })).toBe(getStableObjectKey({ a: 2, b: 1 }))
    expect(getSearchProviderErrorMessage({ code: 'SEARCH_PROVIDER_NOT_CONFIGURED', userType: 'free' })).toMatch(
      /indisponível/i,
    )
    expect(getSearchProviderErrorMessage({ code: 'SEARCH_PROVIDER_NOT_CONFIGURED', userType: 'admin' })).toMatch(
      /Admin/i,
    )
  })

  it('normalizeTrendingPayload preenche media_type', () => {
    const payload = {
      results: [{ title: 'X', release_date: '2020' }, { name: 'Y', first_air_date: '2021' }],
    }
    const out = normalizeTrendingPayload(payload, 'all')
    expect(out.results[0].media_type).toBe('movie')
    expect(out.results[1].media_type).toBe('tv')
  })

  it('createSearchProviderService falha sem chaves', async () => {
    const svc = createSearchProviderService({
      query: async () => ({ rows: [] }),
      baseUrl: 'https://example.test/3',
      imageBaseUrl: 'https://image.example/',
    })
    await expect(svc.fetchSearchProviderJson({ path: '/search/movie', params: {}, apiKeys: [] })).rejects.toMatchObject({
      code: 'SEARCH_PROVIDER_NOT_CONFIGURED',
    })
    expect(await svc.getSearchProviderBaseUrl()).toBe('https://example.test/3')
  })
})

describe('app-settings', () => {
  it('parseBooleanSettingValue e getTicketsEnabled default', async () => {
    const { parseBooleanSettingValue, createAppSettingsService } = await import('../app-settings.mjs')
    expect(parseBooleanSettingValue('false', true)).toBe(false)
    expect(parseBooleanSettingValue('1', false)).toBe(true)

    const calls = []
    const svc = createAppSettingsService({
      query: async (sql, params) => {
        calls.push({ sql, params })
        if (String(sql).includes('tickets_enabled') && String(sql).startsWith('select')) {
          return { rows: [] }
        }
        return { rows: [] }
      },
    })
    expect(await svc.getTicketsEnabled()).toBe(true)
    expect(calls.some((c) => String(c.sql).includes('insert into app_settings'))).toBe(true)
  })
})

describe('football-crest', () => {
  it('setFootballCrestCorsHeaders define CORS', async () => {
    const { setFootballCrestCorsHeaders } = await import('../football-crest.mjs')
    const headers = {}
    setFootballCrestCorsHeaders({
      setHeader(k, v) {
        headers[k] = v
      },
    })
    expect(headers['Access-Control-Allow-Origin']).toBe('*')
    expect(headers['Cross-Origin-Resource-Policy']).toBe('cross-origin')
  })

  it('processFootballCrestProxy rejeita URL insegura', async () => {
    const { createFootballCrestProxy } = await import('../football-crest.mjs')
    const { processFootballCrestProxy } = createFootballCrestProxy({
      normalizeFootballCrestUrl: (u) => String(u || ''),
      isSafeExternalHttpUrl: () => false,
      sniffImageMimeFromBuffer: () => '',
      loadImage: async () => ({ width: 1, height: 1 }),
      createCanvas: () => ({ getContext: () => ({ drawImage() {} }), toBuffer: () => Buffer.alloc(0) }),
      isCanvasRuntimeHealthy: () => true,
      appendDebugNdjsonToSessionFiles: () => {},
    })
    let status = 0
    await processFootballCrestProxy(
      {
        status(code) {
          status = code
          return this
        },
        end() {},
        setHeader() {},
        send() {},
      },
      'https://evil.example/a.png',
      () => {},
    )
    expect(status).toBe(403)
  })
})

describe('cors', () => {
  it('createIsAllowedOrigin respeita lista e loopback em dev', async () => {
    const { createIsAllowedOrigin } = await import('../cors.mjs')
    const allow = createIsAllowedOrigin({
      allowedOrigins: ['http://localhost:5173'],
      isDev: true,
    })
    expect(allow('http://localhost:5173')).toBe(true)
    expect(allow('http://127.0.0.1:5173')).toBe(true)
    expect(allow('https://evil.example')).toBe(false)
  })
})

describe('debug-session', () => {
  it('ring buffer e snapshot', async () => {
    const { createDebugSession } = await import('../debug-session.mjs')
    const dbg = createDebugSession({ rootDir: process.cwd(), sessionId: 'test' })
    dbg.appendFootballDebugNdjson('H0', 'test', 'ping', { ok: true })
    const snap = dbg.getSessionDebugSnapshot()
    expect(snap.count).toBe(1)
    expect(snap.items[0].message).toBe('ping')
    dbg.clearSessionDebugRing()
    expect(dbg.getSessionDebugSnapshot().count).toBe(0)
  })
})
