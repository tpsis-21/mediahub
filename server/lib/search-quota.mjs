export const FREE_DAILY_SEARCH_LIMIT = Number.parseInt(String(process.env.FREE_DAILY_SEARCH_LIMIT || '50'), 10) || 50

/**
 * Decisão pura de quota diária (plano free). Admin/premium sem teto.
 * @param {{ type?: string|null, isActive?: boolean, dailySearches?: unknown, lastSearchDate?: unknown, todayIso: string, limit?: number }} input
 */
export const evaluateFreeDailySearchQuota = ({
  type,
  isActive,
  dailySearches,
  lastSearchDate,
  todayIso,
  limit = FREE_DAILY_SEARCH_LIMIT,
}) => {
  if (!isActive) {
    return { ok: false, status: 403, message: 'Acesso negado.' }
  }

  if (type === 'admin' || type === 'premium') {
    return { ok: true }
  }

  const last = typeof lastSearchDate === 'string' ? lastSearchDate.trim() : ''
  const count = last === todayIso ? Number(dailySearches) || 0 : 0
  if (count >= limit) {
    return {
      ok: false,
      status: 429,
      message: `Limite diário de buscas atingido (${limit}). Tente amanhã ou faça upgrade.`,
    }
  }

  return { ok: true, nextCount: count + 1, todayIso }
}
