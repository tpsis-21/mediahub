/**
 * Leitura/gravação de app_settings e flags derivadas.
 * @param {{ query: (text: string, params?: any[]) => Promise<{ rows: any[] }> }} deps
 */
export const parseBooleanSettingValue = (rawValue, fallback = true) => {
  if (typeof rawValue === 'boolean') return rawValue
  if (rawValue === null || rawValue === undefined) return fallback
  const normalized = String(rawValue).trim().toLowerCase()
  if (!normalized) return fallback
  if (
    normalized === 'true' ||
    normalized === '"true"' ||
    normalized === '1' ||
    normalized === 'yes' ||
    normalized === 'on'
  ) {
    return true
  }
  if (
    normalized === 'false' ||
    normalized === '"false"' ||
    normalized === '0' ||
    normalized === 'no' ||
    normalized === 'off'
  ) {
    return false
  }
  return fallback
}

export const createAppSettingsService = (deps) => {
  const { query } = deps

  const getAppSettingValue = async (key) => {
    try {
      const result = await query('select value from app_settings where key = $1 limit 1', [key])
      const row = result.rows[0]
      if (!row) return null
      if (typeof row.value === 'string') return row.value
      if (row.value === null || row.value === undefined) return null
      return String(row.value)
    } catch {
      return null
    }
  }

  const setAppSettingValue = async ({ key, value }) => {
    await query(
      `
    insert into app_settings (key, value, updated_at)
    values ($1, $2, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
    `,
      [key, value],
    )
  }

  const getAllowRegistrations = async () => {
    let allow = process.env.ALLOW_REGISTRATIONS !== 'false'
    try {
      const result = await query('select value from app_settings where key = $1 limit 1', [
        'allow_registrations',
      ])
      const row = result.rows[0]
      if (row && typeof row.value === 'string') {
        allow = row.value !== 'false'
      }
    } catch {
      // keep env default
    }
    return allow
  }

  const getTicketsEnabled = async () => {
    try {
      const result = await query("select value from app_settings where key = 'tickets_enabled' limit 1")
      const row = result.rows[0]
      if (!row) {
        await setAppSettingValue({ key: 'tickets_enabled', value: 'true' })
        return true
      }
      return parseBooleanSettingValue(row.value, true)
    } catch {
      return true
    }
  }

  return {
    getAppSettingValue,
    setAppSettingValue,
    getAllowRegistrations,
    getTicketsEnabled,
    parseBooleanSettingValue,
  }
}
