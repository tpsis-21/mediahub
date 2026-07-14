/**
 * Auth JWT: middleware, contexto opcional, downgrade premium e quota free.
 * @param {Record<string, any>} deps
 */
export const publicUserFromRow = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  phone: row.phone || undefined,
  website: row.website || undefined,
  type: row.type,
  brandName: row.brand_name || undefined,
  brandColors: row.brand_colors || undefined,
  brandLogo: row.brand_logo || undefined,
  telegramChatId: row.telegram_chat_id || undefined,
  brandNameChangedAt: row.brand_name_changed_at || undefined,
  logoUpdatedAt: row.logo_changed_at || undefined,
  brandChangeCount: row.brand_change_count ?? undefined,
  logoChangeCount: row.logo_change_count ?? undefined,
  subscriptionEnd: row.subscription_end || undefined,
  isActive: Boolean(row.is_active),
  dailySearches: row.daily_searches ?? undefined,
  lastSearchDate: row.last_search_date || undefined,
})

export const createAuthMiddleware = (deps) => {
  const {
    query,
    jwt,
    JWT_SECRET,
    validateUserId,
    evaluateFreeDailySearchQuota,
    getSearchIntegrationKeyColumn,
  } = deps

  const signToken = (payload) => jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: '30d' })

  const readTokenFromRequest = (req) => {
    const auth = req.headers.authorization || ''
    const headerToken = auth.startsWith('Bearer ') ? String(auth.slice(7) || '').trim() : ''
    if (headerToken) return headerToken

    const cookie = req.headers.cookie || ''
    if (!cookie) return ''
    const parts = cookie.split(';').map((s) => s.trim())
    const match = parts.find((p) => p.toLowerCase().startsWith('auth_token='))
    if (!match) return ''
    const value = match.slice('auth_token='.length)
    try {
      return decodeURIComponent(value || '').trim()
    } catch {
      return String(value || '').trim()
    }
  }

  const deactivateExpiredPremiumByUserId = async (userId) => {
    if (!userId) return
    try {
      // Premium expirado volta para free (conta permanece ativa).
      await query(
        `
      update app_users
      set type = 'free',
          subscription_end = null,
          updated_at = now()
      where id = $1
        and type = 'premium'
        and subscription_end is not null
        and subscription_end < now()
      `,
        [userId],
      )
    } catch {
      // noop
    }
  }

  const requireAuth = async (req, res, next) => {
    const token = readTokenFromRequest(req)
    if (!token) {
      console.log('requireAuth: Token ausente', { path: req.path, method: req.method })
      res.status(401).json({ message: 'Não autenticado.' })
      return
    }

    let decoded
    try {
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
    } catch (err) {
      console.log('requireAuth: JWT inválido ou expirado', err?.message || err)
      res.status(401).json({ message: 'Não autenticado.' })
      return
    }
    if (!decoded || typeof decoded !== 'object') {
      console.log('requireAuth: Token decodificado inválido', decoded)
      res.status(401).json({ message: 'Não autenticado.' })
      return
    }
    const sub = decoded && typeof decoded === 'object' ? decoded.sub : null
    const userId = validateUserId(sub)
    if (!userId) {
      console.log('requireAuth: UserId inválido no token', sub)
      res.status(401).json({ message: 'Não autenticado.' })
      return
    }

    try {
      await deactivateExpiredPremiumByUserId(userId)
      const result = await query('select is_active from app_users where id = $1 limit 1', [userId])
      const row = result.rows[0]
      if (!row || !row.is_active) {
        console.log('requireAuth: Usuário inativo ou não encontrado', userId)
        res.status(403).json({ message: 'Acesso negado.' })
        return
      }
      req.auth = { userId }
      next()
    } catch (err) {
      console.error('requireAuth: falha ao consultar o banco (não é erro de JWT)', err?.message || err)
      res.status(503).json({
        message: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.',
      })
    }
  }

  const readOptionalAuthUserId = (req) => {
    const token = readTokenFromRequest(req)
    if (!token) return null
    try {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
      if (!decoded || typeof decoded !== 'object') return null
      const sub = decoded && typeof decoded === 'object' ? decoded.sub : null
      return validateUserId(sub)
    } catch {
      return null
    }
  }

  const readOptionalAuthUserContext = async (req) => {
    const userId = validateUserId(readOptionalAuthUserId(req))
    if (!userId) return { userId: null, userType: null, userKey: '' }

    try {
      const searchKeyColumn = await getSearchIntegrationKeyColumn()
      const searchKeySelect = searchKeyColumn
        ? `${searchKeyColumn} as search_api_key`
        : `null::text as search_api_key`
      const result = await query(
        `select ${searchKeySelect}, type, is_active from app_users where id = $1 limit 1`,
        [userId],
      )
      const row = result.rows[0]

      if (!row || !row.is_active) return { userId: null, userType: null, userKey: '' }

      const userKey = typeof row.search_api_key === 'string' ? row.search_api_key.trim() : ''
      const userType = typeof row.type === 'string' ? row.type : null
      return { userId, userType, userKey }
    } catch {
      return { userId, userType: null, userKey: '' }
    }
  }

  const requirePremiumOrAdmin = async (req, res, next) => {
    try {
      const result = await query(
        'select type, is_active, subscription_end from app_users where id = $1 limit 1',
        [req.auth.userId],
      )
      const row = result.rows[0]
      if (!row || !row.is_active) {
        res.status(403).json({ message: 'Acesso negado.' })
        return
      }

      if (row.type === 'admin') {
        next()
        return
      }

      if (row.type !== 'premium') {
        res.status(403).json({ message: 'Acesso negado.' })
        return
      }

      const subscriptionEnd = row.subscription_end ? new Date(row.subscription_end) : null
      const now = new Date()
      if (
        !subscriptionEnd ||
        Number.isNaN(subscriptionEnd.getTime()) ||
        subscriptionEnd.getTime() < now.getTime()
      ) {
        res.status(403).json({ message: 'Assinatura Premium expirada.' })
        return
      }
      next()
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  }

  const requireAdmin = async (req, res, next) => {
    try {
      const result = await query('select type from app_users where id = $1 limit 1', [req.auth.userId])
      const row = result.rows[0]
      if (!row || row.type !== 'admin') {
        res.status(403).json({ message: 'Acesso negado.' })
        return
      }
      next()
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  }

  const assertAndIncrementDailySearchQuota = async (userId) => {
    if (!userId) return { ok: false, status: 401, message: 'Não autenticado.' }
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
    try {
      const result = await query(
        `select type, is_active, daily_searches, last_search_date from app_users where id = $1 limit 1`,
        [userId],
      )
      const row = result.rows[0]
      if (!row) return { ok: false, status: 403, message: 'Acesso negado.' }

      const decision = evaluateFreeDailySearchQuota({
        type: row.type,
        isActive: Boolean(row.is_active),
        dailySearches: row.daily_searches,
        lastSearchDate: row.last_search_date,
        todayIso: today,
      })
      if (!decision.ok) return decision
      if (decision.nextCount == null) return { ok: true }

      await query(
        `
      update app_users
      set daily_searches = $2,
          last_search_date = $3,
          updated_at = now()
      where id = $1
      `,
        [userId, decision.nextCount, today],
      )
      return { ok: true, dailySearches: decision.nextCount, lastSearchDate: today }
    } catch {
      return {
        ok: false,
        status: 503,
        message: 'Serviço temporariamente indisponível. Tente novamente em alguns minutos.',
      }
    }
  }

  return {
    signToken,
    requireAuth,
    requireAdmin,
    requirePremiumOrAdmin,
    readOptionalAuthUserId,
    readOptionalAuthUserContext,
    deactivateExpiredPremiumByUserId,
    assertAndIncrementDailySearchQuota,
    publicUserFromRow,
  }
}
