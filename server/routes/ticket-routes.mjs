/**
 * @param {import('express').Express} app
 * @param {Record<string, any>} deps
 */
export const registerTicketRoutes = (app, deps) => {
  const { requireAuth, requireAdmin, query, pool, getTicketsEnabled } = deps

  app.get('/api/tickets/settings', async (_req, res) => {
    try {
      const enabled = await getTicketsEnabled()
      res.json({ enabled })
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Erro ao buscar configurações.' })
    }
  })

  app.put('/api/admin/tickets/settings', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { enabled } = req.body
      await query(
        "INSERT INTO app_settings (key, value) VALUES ('tickets_enabled', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
        [JSON.stringify(enabled)]
      )
      res.json({ success: true })
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Erro ao atualizar configurações.' })
    }
  })

  app.get('/api/tickets', requireAuth, async (req, res) => {
    try {
      const result = await query('SELECT * FROM tickets WHERE user_id = $1 ORDER BY updated_at DESC', [
        req.auth.userId,
      ])
      res.json(result.rows)
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Erro ao buscar tickets.' })
    }
  })

  app.post('/api/tickets', requireAuth, async (req, res) => {
    try {
      const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : ''
      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
      const priority = 'medium'
      if (!subject || !message) {
        return res.status(400).json({ message: 'Assunto e mensagem são obrigatórios.' })
      }

      const enabled = await getTicketsEnabled()

      if (!enabled) {
        const user = await query('select type from app_users where id = $1', [req.auth.userId])
        if (user.rows[0]?.type !== 'admin') {
          return res.status(403).json({ message: 'O sistema de tickets está temporariamente desativado.' })
        }
      }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const ticketRes = await client.query(
          'INSERT INTO tickets (user_id, subject, priority) VALUES ($1, $2, $3) RETURNING id',
          [req.auth.userId, subject, priority]
        )
        const ticketId = ticketRes.rows[0].id
        await client.query(
          'INSERT INTO ticket_messages (ticket_id, user_id, message, is_admin) VALUES ($1, $2, $3, $4)',
          [ticketId, req.auth.userId, message, false]
        )
        await client.query('COMMIT')
        res.json({ id: ticketId })
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Erro ao criar ticket.' })
    }
  })

  app.get('/api/tickets/:id(\\d+)', requireAuth, async (req, res) => {
    try {
      const { id } = req.params
      const ticketRes = await query(
        'SELECT t.*, u.email as user_email FROM tickets t JOIN app_users u ON t.user_id = u.id WHERE t.id = $1',
        [id]
      )
      const ticket = ticketRes.rows[0]

      if (!ticket) return res.status(404).json({ message: 'Ticket não encontrado.' })

      if (ticket.user_id !== req.auth.userId) {
        const user = await query('select type from app_users where id = $1', [req.auth.userId])
        if (user.rows[0]?.type !== 'admin') {
          return res.status(403).json({ message: 'Acesso negado.' })
        }
      }

      const messagesRes = await query(
        `
      SELECT tm.*, u.email as user_email, u.type as user_type 
      FROM ticket_messages tm 
      JOIN app_users u ON tm.user_id = u.id 
      WHERE tm.ticket_id = $1 
      ORDER BY tm.created_at ASC
    `,
        [id]
      )

      res.json({ ticket, messages: messagesRes.rows })
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Erro ao buscar detalhes do ticket.' })
    }
  })

  app.post('/api/tickets/:id(\\d+)/messages', requireAuth, async (req, res) => {
    try {
      const { id } = req.params
      const { message } = req.body

      const ticketRes = await query('SELECT * FROM tickets WHERE id = $1', [id])
      const ticket = ticketRes.rows[0]

      if (!ticket) return res.status(404).json({ message: 'Ticket não encontrado.' })

      let isAdmin = false
      if (ticket.user_id !== req.auth.userId) {
        const user = await query('select type from app_users where id = $1', [req.auth.userId])
        if (user.rows[0]?.type !== 'admin') {
          return res.status(403).json({ message: 'Acesso negado.' })
        }
        isAdmin = true
      }

      await query('INSERT INTO ticket_messages (ticket_id, user_id, message, is_admin) VALUES ($1, $2, $3, $4)', [
        id,
        req.auth.userId,
        message,
        isAdmin,
      ])

      await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [id])

      res.json({ success: true })
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Erro ao enviar mensagem.' })
    }
  })

  app.get('/api/admin/tickets', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const result = await query(`
      SELECT t.*, u.email as user_email 
      FROM tickets t 
      JOIN app_users u ON t.user_id = u.id 
      ORDER BY 
        CASE WHEN t.status = 'open' THEN 1 
             WHEN t.status = 'in_progress' THEN 2 
             ELSE 3 
        END, 
        t.updated_at DESC
    `)
      res.json(result.rows)
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Erro ao buscar tickets.' })
    }
  })

  app.put('/api/admin/tickets/:id(\\d+)/status', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params
      const { status } = req.body
      await query('UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2', [status, id])
      res.json({ success: true })
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Erro ao atualizar status.' })
    }
  })

  // Stats do usuário autenticado (comportamento legado)
  app.get('/api/tickets/stats', requireAuth, async (req, res) => {
    try {
      const userId = req.auth.userId
      const result = await query(
        `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved
      FROM tickets 
      WHERE user_id = $1
    `,
        [userId]
      )
      res.json(result.rows[0])
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Erro ao buscar estatísticas.' })
    }
  })
}
