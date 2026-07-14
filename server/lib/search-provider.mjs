/**
 * Cliente do provedor de busca (chaves, cache, fetch, normalização).
 */

export const SEARCH_PROVIDER_SETTINGS_KEYS = {
  primary: 'search_provider_api_key_primary',
  secondary: 'search_provider_api_key_secondary',
}

export const uniqStrings = (items) => {
  const out = []
  const seen = new Set()
  for (const item of items) {
    const value = typeof item === 'string' ? item.trim() : ''
    if (!value) continue
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

export const getSearchProviderErrorMessage = (args) => {
  const userType = args?.userType || null
  const status = typeof args?.status === 'number' ? args.status : null
  const code = typeof args?.code === 'string' ? args.code : null

  const isNotConfigured = code === 'SEARCH_PROVIDER_NOT_CONFIGURED'
  const isInvalidKey = status === 401 || status === 403

  if (isNotConfigured) {
    if (userType === 'admin') return 'Integração de busca não configurada. Abra o Admin e salve a chave.'
    return 'Busca indisponível no momento.'
  }

  if (isInvalidKey) {
    if (userType === 'admin') return 'Integração de busca com credenciais inválidas.'
    return 'Busca indisponível no momento.'
  }

  return 'Busca temporariamente indisponível. Tente novamente mais tarde.'
}

export const getStableObjectKey = (obj) => {
  const entries = Object.entries(obj || {}).filter(([, v]) => v !== null && v !== undefined)
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return JSON.stringify(entries)
}

/** TMDB omite media_type em /trending/movie|tv/week; o cliente filtrava e ficava sem itens. */
export const normalizeTrendingPayload = (payload, mediaType) => {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.results)) return payload
  const results = payload.results.map((item) => {
    if (!item || typeof item !== 'object') return item
    const mt = item.media_type
    if (mt === 'movie' || mt === 'tv' || mt === 'person') return item
    if (mediaType === 'movie') return { ...item, media_type: 'movie' }
    if (mediaType === 'tv') return { ...item, media_type: 'tv' }
    const hasMovieFields = typeof item.title === 'string' || typeof item.release_date === 'string'
    const hasTvFields = typeof item.name === 'string' || typeof item.first_air_date === 'string'
    if (hasTvFields && !hasMovieFields) return { ...item, media_type: 'tv' }
    if (hasMovieFields) return { ...item, media_type: 'movie' }
    return item
  })
  return { ...payload, results }
}

/**
 * @param {{
 *   query: (text: string, params?: any[]) => Promise<{ rows: any[] }>
 *   baseUrl: string
 *   imageBaseUrl: string
 * }} deps
 */
export const createSearchProviderService = (deps) => {
  const { query, baseUrl, imageBaseUrl } = deps

  let searchProviderSettingsCache = { keys: [], fetchedAt: 0 }
  const searchProviderResponseCache = new Map()

  const clearSearchProviderSettingsCache = () => {
    searchProviderSettingsCache = { keys: [], fetchedAt: 0 }
  }

  const migrateSearchProviderSettingsKeysIfNeeded = async () => {
    try {
      const current = await query(`select key, value from app_settings where key = any($1::text[])`, [
        [SEARCH_PROVIDER_SETTINGS_KEYS.primary, SEARCH_PROVIDER_SETTINGS_KEYS.secondary],
      ])
      const map = new Map(current.rows.map((row) => [row.key, row.value]))
      const primaryValue =
        typeof map.get(SEARCH_PROVIDER_SETTINGS_KEYS.primary) === 'string'
          ? map.get(SEARCH_PROVIDER_SETTINGS_KEYS.primary).trim()
          : ''
      const secondaryValue =
        typeof map.get(SEARCH_PROVIDER_SETTINGS_KEYS.secondary) === 'string'
          ? map.get(SEARCH_PROVIDER_SETTINGS_KEYS.secondary).trim()
          : ''
      if (primaryValue || secondaryValue) return { primaryValue, secondaryValue }

      const legacy = await query(
        `
      select key, value
      from app_settings
      where key like '%api_key_primary'
         or key like '%api_key_secondary'
      `,
      )
      const legacyMap = new Map(legacy.rows.map((row) => [row.key, row.value]))
      const legacyPrimaryKey = legacy.rows.find(
        (row) =>
          typeof row?.key === 'string' &&
          row.key.endsWith('api_key_primary') &&
          row.key !== SEARCH_PROVIDER_SETTINGS_KEYS.primary,
      )?.key
      const legacySecondaryKey = legacy.rows.find(
        (row) =>
          typeof row?.key === 'string' &&
          row.key.endsWith('api_key_secondary') &&
          row.key !== SEARCH_PROVIDER_SETTINGS_KEYS.secondary,
      )?.key

      const legacyPrimary =
        legacyPrimaryKey && typeof legacyMap.get(legacyPrimaryKey) === 'string'
          ? legacyMap.get(legacyPrimaryKey).trim()
          : ''
      const legacySecondary =
        legacySecondaryKey && typeof legacyMap.get(legacySecondaryKey) === 'string'
          ? legacyMap.get(legacySecondaryKey).trim()
          : ''

      if (!legacyPrimary && !legacySecondary) return { primaryValue: '', secondaryValue: '' }

      await query(
        `
      insert into app_settings (key, value, updated_at)
      values
        ($1, $2, now()),
        ($3, $4, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
      `,
        [
          SEARCH_PROVIDER_SETTINGS_KEYS.primary,
          legacyPrimary,
          SEARCH_PROVIDER_SETTINGS_KEYS.secondary,
          legacySecondary,
        ],
      )

      return { primaryValue: legacyPrimary, secondaryValue: legacySecondary }
    } catch {
      return { primaryValue: '', secondaryValue: '' }
    }
  }

  const getSearchProviderSettings = async () => {
    const now = Date.now()
    if (now - searchProviderSettingsCache.fetchedAt < 30_000) return searchProviderSettingsCache

    try {
      const { primaryValue, secondaryValue } = await migrateSearchProviderSettingsKeysIfNeeded()
      const keys = uniqStrings([primaryValue, secondaryValue])
      searchProviderSettingsCache = { keys, fetchedAt: now }
      return searchProviderSettingsCache
    } catch {
      searchProviderSettingsCache = { keys: [], fetchedAt: now }
      return searchProviderSettingsCache
    }
  }

  const getSearchProviderSettingsKeys = async () => (await getSearchProviderSettings()).keys
  const getSearchProviderBaseUrl = async () => baseUrl
  const getSearchProviderImageBaseUrl = async () => imageBaseUrl

  const getSearchProviderCache = (key) => {
    const hit = searchProviderResponseCache.get(key)
    if (!hit) return null
    if (Date.now() > hit.expiresAt) {
      searchProviderResponseCache.delete(key)
      return null
    }
    return hit.data
  }

  const setSearchProviderCache = (args) => {
    const key = args.key
    const data = args.data
    const ttlMs = args.ttlMs
    const maxEntries = args.maxEntries

    searchProviderResponseCache.set(key, { data, expiresAt: Date.now() + ttlMs })
    while (searchProviderResponseCache.size > maxEntries) {
      const firstKey = searchProviderResponseCache.keys().next().value
      if (!firstKey) break
      searchProviderResponseCache.delete(firstKey)
    }
  }

  const fetchSearchProviderJson = async ({ path: apiPath, params, apiKeys }) => {
    const resolvedBase = await getSearchProviderBaseUrl()
    if (!resolvedBase) {
      const err = new Error('Integração de busca não configurada')
      err.code = 'SEARCH_PROVIDER_NOT_CONFIGURED'
      throw err
    }

    const safeKeys = uniqStrings(apiKeys)
    if (safeKeys.length === 0) {
      const err = new Error('Integração de busca não configurada')
      err.code = 'SEARCH_PROVIDER_NOT_CONFIGURED'
      throw err
    }

    let lastError = null
    for (let i = 0; i < safeKeys.length; i++) {
      const key = safeKeys[i]
      const url = new URL(`${resolvedBase}${apiPath}`)
      url.searchParams.set('api_key', key)
      for (const [k, v] of Object.entries(params || {})) {
        if (typeof v === 'string' && v.trim().length > 0) url.searchParams.set(k, v)
        if (typeof v === 'number' && Number.isFinite(v)) url.searchParams.set(k, String(v))
      }

      const res = await fetch(url.toString())
      if (res.status === 429) {
        lastError = { status: 429 }
        continue
      }
      if (res.status === 401 || res.status === 403) {
        lastError = { status: res.status }
        continue
      }
      if (!res.ok) {
        lastError = { status: res.status }
        break
      }
      return await res.json()
    }

    const err = new Error('Search provider request failed')
    err.status = lastError?.status || 502
    throw err
  }

  return {
    SEARCH_PROVIDER_SETTINGS_KEYS,
    clearSearchProviderSettingsCache,
    migrateSearchProviderSettingsKeysIfNeeded,
    getSearchProviderSettings,
    getSearchProviderSettingsKeys,
    getSearchProviderBaseUrl,
    getSearchProviderImageBaseUrl,
    getSearchProviderCache,
    setSearchProviderCache,
    fetchSearchProviderJson,
    getSearchProviderErrorMessage,
    getStableObjectKey,
    normalizeTrendingPayload,
    uniqStrings,
  }
}
