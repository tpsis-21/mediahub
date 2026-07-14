/**
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerAuthRoutes = (app, deps) => {
  const {
    rateLimitAuth,
    normalizeEmail,
    getAllowRegistrations,
    createPasswordDigest,
    verifyPassword,
    query,
    signToken,
    publicUserFromRow,
    deactivateExpiredPremiumByUserId,
  } = deps

  app.post('/api/auth/register', rateLimitAuth, async (req, res) => {
    const email = normalizeEmail(req.body?.email)
    const password = String(req.body?.password || '')
    const name = String(req.body?.name || '').trim()
    const phone = String(req.body?.phone || '').trim()
    const brandName = String(req.body?.brandName || '').trim()

    if (!email || !password || !name || !brandName) {
      res.status(400).json({ message: 'Preencha os campos obrigatórios.' })
      return
    }

    const allowRegistrations = await getAllowRegistrations()
    if (!allowRegistrations) {
      res.status(403).json({ message: 'Cadastros temporariamente desabilitados.' })
      return
    }

    try {
      const digest = await createPasswordDigest(password)
      const bootstrapAdminEmail = typeof process.env.ADMIN_BOOTSTRAP_EMAIL === 'string'
        ? process.env.ADMIN_BOOTSTRAP_EMAIL.trim().toLowerCase()
        : 'admin@mediahub.com'
      const isAdmin = Boolean(bootstrapAdminEmail && email === bootstrapAdminEmail)
      const subscriptionEnd = null

      const created = await query(
        `
        insert into app_users
          (email, name, phone, type, is_active, subscription_end, brand_name, brand_colors, password_hash, password_salt, password_iterations)
        values
          ($1, $2, nullif($3,''), $4, true, $5, $6, $7, $8, $9, $10)
        returning *
        `,
        [
          email,
          name,
          phone,
          isAdmin ? 'admin' : 'free',
          subscriptionEnd,
          brandName,
          JSON.stringify({ primary: '#3b82f6', secondary: '#8b5cf6' }),
          digest.hash,
          digest.salt,
          digest.iterations,
        ]
      )

      const row = created.rows[0]
      const token = signToken({ sub: row.id })
      res.json({ token, user: publicUserFromRow(row) })
    } catch (e) {
      const message = String(e?.message || '')
      if (message.includes('unique') || message.includes('duplicate')) {
        res.status(409).json({ message: 'Este email já está cadastrado.' })
        return
      }
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })

  app.post('/api/auth/login', rateLimitAuth, async (req, res) => {
    const email = normalizeEmail(req.body?.email)
    const password = String(req.body?.password || '')

    if (!email || !password) {
      res.status(400).json({ message: 'Preencha email e senha.' })
      return
    }

    try {
      const result = await query('select * from app_users where email = $1 limit 1', [email])
      const row = result.rows[0]
      if (!row) {
        res.status(401).json({ message: 'Email ou senha inválidos.' })
        return
      }

      await deactivateExpiredPremiumByUserId(row.id)
      const currentResult = await query('select * from app_users where id = $1 limit 1', [row.id])
      const currentRow = currentResult.rows[0] || row
      if (!currentRow.is_active) {
        res.status(403).json({ message: 'Sua conta está inativa. Fale com o suporte.' })
        return
      }

      const ok = await verifyPassword({
        password,
        digest: {
          hash: currentRow.password_hash,
          salt: currentRow.password_salt,
          iterations: currentRow.password_iterations,
        },
      })

      if (!ok) {
        res.status(401).json({ message: 'Email ou senha inválidos.' })
        return
      }

      const token = signToken({ sub: currentRow.id })
      res.json({ token, user: publicUserFromRow(currentRow) })
    } catch {
      res.status(500).json({ message: 'Não foi possível concluir. Tente novamente.' })
    }
  })
}
