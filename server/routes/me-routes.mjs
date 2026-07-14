/**
 * Conta do usuário: password-reset + /api/me
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerMeRoutes = (app, deps) => {
  const {
    rateLimitAuth,
    requireAuth,
    requireAdmin,
    normalizeEmail,
    query,
    crypto,
    APP_URL,
    sendResetEmail,
    createPasswordDigest,
    verifyPassword,
    publicUserFromRow,
    generateRandomPassword,
    hasTelegramChatIdColumn,
    getSearchIntegrationKeyColumn,
  } = deps

  app.post('/api/auth/password-reset/start', rateLimitAuth, async (req, res) => {
    try {
      const email = normalizeEmail(String(req.body?.email || ''))
      if (!email) {
        res.status(400).json({ message: 'Informe o email.' })
        return
      }
      const userResult = await query('select id, email from app_users where lower(email) = $1 limit 1', [email])
      const user = userResult.rows[0]
      if (!user) {
        res.json({ ok: true })
        return
      }
      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
      await query(
        `insert into app_password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt]
      )
      const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim().replace(/\/$/, '') : ''
      const baseUrl = APP_URL || origin || (process.env.NODE_ENV !== 'production' ? `http://127.0.0.1:${process.env.VITE_PORT || 5173}` : '')
      const url = `${baseUrl}/reset?token=${rawToken}`
      try {
        await sendResetEmail({ to: user.email, url })
        res.json({ ok: true })
      } catch (e) {
        console.error('SMTP Error', e)
        if (process.env.NODE_ENV !== 'production') {
          res.json({ ok: true, devResetUrl: url, devToken: rawToken })
          return
        }
        res.status(503).json({ message: 'Envio indisponível. Tente mais tarde.' })
      }
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Não foi possível solicitar reset no momento.' })
    }
  })

  app.post('/api/auth/password-reset/confirm', rateLimitAuth, async (req, res) => {
    try {
      const token = String(req.body?.token || '').trim()
      const password = String(req.body?.password || '').trim()
      if (!token || !password) {
        res.status(400).json({ message: 'Token e nova senha são obrigatórios.' })
        return
      }
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      const result = await query(
        `select t.id, t.user_id, t.expires_at, t.used_at
         from app_password_reset_tokens t
         where t.token_hash = $1
         limit 1`,
        [tokenHash]
      )
      const row = result.rows[0]
      if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
        res.status(400).json({ message: 'Token inválido ou expirado.' })
        return
      }
      const digest = await createPasswordDigest(password)
      await query(
        `update app_users set password_hash = $1, password_salt = $2, password_iterations = $3, updated_at = now() where id = $4`,
        [digest.hash, digest.salt, digest.iterations, row.user_id]
      )
      await query(`update app_password_reset_tokens set used_at = now() where id = $1`, [row.id])
      res.json({ ok: true })
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Não foi possível redefinir a senha.' })
    }
  })
  app.post('/api/auth/password-reset/request', rateLimitAuth, async (req, res) => {
    try {
      const email = normalizeEmail(String(req.body?.email || ''))
      if (!email) {
        res.status(400).json({ message: 'Informe o email.' })
        return
      }
      const userResult = await query('select id from app_users where lower(email) = $1 limit 1', [email])
      const userId = userResult.rows[0]?.id || null
      await query(
        `insert into app_password_reset_requests (email, user_id, status)
         values ($1, $2, 'pending')`,
        [email, userId]
      )
      res.json({ ok: true })
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Não foi possível solicitar reset no momento.' })
    }
  })

  app.get('/api/admin/password-reset-requests', requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await query(
        `select id, email, user_id, status, created_at, resolved_at
         from app_password_reset_requests
         where status = 'pending'
         order by created_at desc
         limit 200`,
        []
      )
      res.json({ items: result.rows })
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Erro ao listar solicitações.' })
    }
  })

  app.post('/api/admin/password-reset-requests/:id/reset', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = String(req.params?.id || '').trim()
      if (!id) {
        res.status(400).json({ message: 'ID inválido.' })
        return
      }
      const rowResult = await query('select id, user_id from app_password_reset_requests where id = $1 and status = \'pending\' limit 1', [id])
      const row = rowResult.rows[0]
      if (!row || !row.user_id) {
        res.status(404).json({ message: 'Solicitação não encontrada.' })
        return
      }
      const password = generateRandomPassword(14)
      const digest = await createPasswordDigest(password)
      await query(
        `update app_users
         set password_hash = $1,
             password_salt = $2,
             password_iterations = $3,
             updated_at = now()
         where id = $4`,
        [digest.hash, digest.salt, digest.iterations, row.user_id]
      )
      await query('update app_password_reset_requests set status = \'resolved\', resolved_at = now() where id = $1', [id])
      res.json({ password })
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Erro ao processar solicitação.' })
    }
  })
  app.get('/api/me', requireAuth, async (req, res) => {
    try {
      const result = await query('select * from app_users where id = $1 limit 1', [req.auth.userId])
      const row = result.rows[0]
      if (!row) {
        res.status(401).json({ message: 'Não autenticado.' })
        return
      }
      res.json({ user: publicUserFromRow(row) })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.put('/api/me', requireAuth, async (req, res) => {
    const asTrimmedStringOrNullOrUndefined = (value) => {
      if (value === null) return null
      if (typeof value !== 'string') return undefined
      return value.trim()
    }

    const name = asTrimmedStringOrNullOrUndefined(req.body?.name)
    const phone = asTrimmedStringOrNullOrUndefined(req.body?.phone)
    const website = asTrimmedStringOrNullOrUndefined(req.body?.website)
    const brandName = asTrimmedStringOrNullOrUndefined(req.body?.brandName)
    const brandLogo = req.body?.brandLogo === null ? null : typeof req.body?.brandLogo === 'string' ? req.body.brandLogo : undefined
    const brandColors = req.body?.brandColors === null ? null : req.body?.brandColors && typeof req.body.brandColors === 'object' ? req.body.brandColors : undefined
    const telegramChatIdRaw = asTrimmedStringOrNullOrUndefined(req.body?.telegramChatId)
    const telegramChatId = telegramChatIdRaw === '' ? null : telegramChatIdRaw
    const searchIntegrationKeyRaw = asTrimmedStringOrNullOrUndefined(req.body?.searchIntegrationKey)
    const searchIntegrationKey = searchIntegrationKeyRaw === '' ? null : searchIntegrationKeyRaw

    if (typeof searchIntegrationKey === 'string' && searchIntegrationKey.length > 256) {
      res.status(400).json({ message: 'Chave inválida.' })
      return
    }

    try {
      const canUseTelegramChatId = telegramChatId !== undefined ? await hasTelegramChatIdColumn() : false
      const searchKeyColumn = searchIntegrationKey !== undefined ? await getSearchIntegrationKeyColumn() : null
      const canUseSearchKey = searchIntegrationKey !== undefined ? Boolean(searchKeyColumn) : false

      if (searchIntegrationKey !== undefined && !canUseSearchKey) {
        res.status(503).json({ message: 'Configuração de busca indisponível no momento.' })
        return
      }

      const currentResult = await query(
        `
        select brand_name, brand_name_changed_at, brand_change_count,
               brand_logo, logo_changed_at, logo_change_count
        from app_users
        where id = $1
        limit 1
        `,
        [req.auth.userId]
      )
      const current = currentResult.rows[0]
      if (!current) {
        res.status(401).json({ message: 'Não autenticado.' })
        return
      }

      const patch = []

      if (typeof name === 'string' && name) patch.push(['name', name])
      if (phone === null) patch.push(['phone', null])
      if (typeof phone === 'string') patch.push(['phone', phone || null])
      if (website === null) patch.push(['website', null])
      if (typeof website === 'string') patch.push(['website', website || null])
      if (brandColors !== undefined) patch.push(['brand_colors', brandColors])
      if (telegramChatId !== undefined && canUseTelegramChatId) patch.push(['telegram_chat_id', telegramChatId])
      if (searchIntegrationKey !== undefined && searchKeyColumn) patch.push([searchKeyColumn, searchIntegrationKey])

      if (brandName !== undefined) {
        const nextBrandName = typeof brandName === 'string' ? brandName : ''
        if (!nextBrandName) {
          res.status(400).json({ message: 'Nome da marca inválido.' })
          return
        }

        const currentBrandName = typeof current.brand_name === 'string' ? current.brand_name : ''
        if (nextBrandName !== currentBrandName) {
          const lastChangedAt = current.brand_name_changed_at ? new Date(current.brand_name_changed_at) : null
          if (lastChangedAt) {
            const diffDays = (Date.now() - lastChangedAt.getTime()) / (1000 * 3600 * 24)
            if (diffDays < 15) {
              const remaining = Math.max(0, 15 - Math.floor(diffDays))
              res.status(403).json({ message: `Você poderá alterar o nome da marca novamente em ${remaining} dias.` })
              return
            }
          }
          patch.push(['brand_name', nextBrandName])
          patch.push(['brand_name_changed_at', new Date().toISOString()])
          patch.push(['brand_change_count', (Number(current.brand_change_count) || 0) + 1])
        }
      }

      if (brandLogo !== undefined) {
        const currentLogo = typeof current.brand_logo === 'string' ? current.brand_logo : null
        const nextLogo = brandLogo

        const changed = (currentLogo || null) !== (nextLogo || null)
        if (changed) {
          patch.push(['brand_logo', nextLogo])
          patch.push(['logo_changed_at', new Date().toISOString()])
          patch.push(['logo_change_count', (Number(current.logo_change_count) || 0) + 1])
        }
      }

      if (patch.length === 0) {
        res.status(400).json({ message: 'Nada para atualizar.' })
        return
      }

      const setParts = []
      const values = []
      let i = 1
      for (const [k, v] of patch) {
        setParts.push(`${k} = $${i}`)
        values.push(v)
        i++
      }
      setParts.push(`updated_at = now()`)

      values.push(req.auth.userId)

      const result = await query(
        `update app_users set ${setParts.join(', ')} where id = $${i} returning *`,
        values
      )
      const row = result.rows[0]
      res.json({ user: publicUserFromRow(row) })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.post('/api/me/password', requireAuth, async (req, res) => {
    const currentPassword = String(req.body?.currentPassword || '')
    const newPassword = String(req.body?.newPassword || '')
    const confirmPassword = String(req.body?.confirmPassword || '')

    if (!currentPassword || !newPassword || !confirmPassword) {
      res.status(400).json({ message: 'Preencha senha atual, nova senha e confirmação.' })
      return
    }

    if (newPassword.length < 8) {
      res.status(400).json({ message: 'A nova senha deve ter pelo menos 8 caracteres.' })
      return
    }

    if (newPassword !== confirmPassword) {
      res.status(400).json({ message: 'A confirmação da senha não confere.' })
      return
    }

    if (currentPassword === newPassword) {
      res.status(400).json({ message: 'A nova senha precisa ser diferente da senha atual.' })
      return
    }

    try {
      const result = await query('select id, password_hash, password_salt, password_iterations from app_users where id = $1 limit 1', [
        req.auth.userId,
      ])
      const row = result.rows[0]
      if (!row) {
        res.status(401).json({ message: 'Não autenticado.' })
        return
      }

      const ok = await verifyPassword({
        password: currentPassword,
        digest: {
          hash: row.password_hash,
          salt: row.password_salt,
          iterations: row.password_iterations,
        },
      })

      if (!ok) {
        res.status(401).json({ message: 'Senha atual inválida.' })
        return
      }

      const digest = await createPasswordDigest(newPassword)
      await query(
        `update app_users
            set password_hash = $1,
                password_salt = $2,
                password_iterations = $3,
                updated_at = now()
          where id = $4`,
        [digest.hash, digest.salt, digest.iterations, req.auth.userId]
      )

      res.json({ ok: true })
    } catch {
      res.status(500).json({ message: 'Não foi possível atualizar a senha agora. Tente novamente.' })
    }
  })


}
