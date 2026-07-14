/**
 * Fluxos bot-first: marca, recuperação de senha, admin e busca em lote.
 */
import {
  adminHubKeyboard,
  adminHubText,
  brandHubKeyboard,
  brandHubText,
  cancelKeyboard,
  escapeHtml,
  formatBulkSearchResults,
  replyGuestKeyboard,
  searchPickKeyboard,
  ticketsListKeyboard,
  ticketsText,
  welcomeKeyboard,
} from '../lib/format.mjs'
import {
  assertAuthAllowed,
  clearAuthFailures,
  clearPending,
  getPending,
  recordAuthFailure,
  setPending,
} from '../lib/pending.mjs'

const hexOk = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || '').trim())
const makeOtp = () => String(Math.floor(100000 + Math.random() * 900000))

export const createProfessionalFlows = ({ api, sessions, services, requireSession }) => {
  const handleBrandHub = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    const brand = (await services.getUserBrand(session.userId)) || {}
    await api.sendMessage(chatId, brandHubText(brand), {
      reply_markup: brandHubKeyboard(),
    })
  }

  const startBrandEdit = async ({ chatId, field }) => {
    const session = await requireSession(chatId)
    if (!session) return
    const map = {
      name: {
        state: 'awaiting_brand_name',
        prompt: ['<b>Nome da marca</b>', '', 'Envie o nome (2 a 80 caracteres).'].join('\n'),
      },
      primary: {
        state: 'awaiting_brand_primary',
        prompt: ['<b>Cor primária</b>', '', 'Envie a cor em hex, ex.: <code>#0F172A</code>'].join('\n'),
      },
      secondary: {
        state: 'awaiting_brand_secondary',
        prompt: ['<b>Cor secundária</b>', '', 'Envie a cor em hex, ex.: <code>#1D4ED8</code>'].join('\n'),
      },
      logo: {
        state: 'awaiting_brand_logo',
        prompt: [
          '<b>Logo da marca</b>',
          '',
          'Envie uma <b>foto</b> (PNG/JPG) agora.',
          'A logo aparece nos banners Premium.',
        ].join('\n'),
      },
    }
    const cfg = map[field]
    if (!cfg) return
    await sessions.patch(chatId, { state: cfg.state, context: {}, mergeContext: false })
    await api.sendMessage(chatId, cfg.prompt, { reply_markup: cancelKeyboard() })
  }

  const handleBrandText = async ({ chatId, session, text }) => {
    const state = session.state
    if (state === 'awaiting_brand_name') {
      const brandName = text.trim().slice(0, 80)
      const result = await services.updateBrand({ userId: session.userId, brandName })
      await sessions.patch(chatId, { state: 'linked', context: {}, mergeContext: false })
      await api.sendMessage(chatId, result.ok ? 'Nome da marca atualizado.' : result.message, {
        reply_markup: brandHubKeyboard(),
      })
      return true
    }
    if (state === 'awaiting_brand_primary') {
      const primary = text.trim()
      if (!hexOk(primary)) {
        await api.sendMessage(chatId, 'Formato inválido. Use #RRGGBB.', {
          reply_markup: cancelKeyboard(),
        })
        return true
      }
      const result = await services.updateBrand({ userId: session.userId, primary })
      await sessions.patch(chatId, { state: 'linked', context: {}, mergeContext: false })
      await api.sendMessage(chatId, result.ok ? 'Cor primária atualizada.' : result.message, {
        reply_markup: brandHubKeyboard(),
      })
      return true
    }
    if (state === 'awaiting_brand_secondary') {
      const secondary = text.trim()
      if (!hexOk(secondary)) {
        await api.sendMessage(chatId, 'Formato inválido. Use #RRGGBB.', {
          reply_markup: cancelKeyboard(),
        })
        return true
      }
      const result = await services.updateBrand({ userId: session.userId, secondary })
      await sessions.patch(chatId, { state: 'linked', context: {}, mergeContext: false })
      await api.sendMessage(chatId, result.ok ? 'Cor secundária atualizada.' : result.message, {
        reply_markup: brandHubKeyboard(),
      })
      return true
    }
    return false
  }

  const handleBrandPhoto = async ({ chatId, dataUrl }) => {
    const session = await sessions.getByChatId(chatId)
    if (!session || session.state !== 'awaiting_brand_logo') return false
    if (!dataUrl) {
      await api.sendMessage(chatId, 'Não consegui ler a imagem. Envie outra foto.', {
        reply_markup: cancelKeyboard(),
      })
      return true
    }
    const result = await services.updateBrand({ userId: session.userId, brandLogo: dataUrl })
    await sessions.patch(chatId, { state: 'linked', context: {}, mergeContext: false })
    await api.sendMessage(
      chatId,
      result.ok ? 'Logo atualizada. Já vale nos próximos banners.' : result.message,
      { reply_markup: brandHubKeyboard() },
    )
    return true
  }

  const startRecoverFlow = async (chatId) => {
    const gate = assertAuthAllowed(chatId)
    if (!gate.ok) {
      await api.sendMessage(chatId, gate.message)
      return
    }
    setPending(chatId, { state: 'awaiting_recover_email', data: {} })
    await api.sendMessage(
      chatId,
      [
        '<b>Recuperar senha</b>',
        '',
        'Envie o <b>e-mail</b> da conta.',
        'Enviaremos um código de 6 dígitos neste chat.',
      ].join('\n'),
      { reply_markup: cancelKeyboard() },
    )
  }

  const handleRecoverPending = async ({ chatId, text, messageId }) => {
    const pending = getPending(chatId)
    if (!pending?.state?.startsWith('awaiting_recover')) return false

    const scrub = async () => {
      if (messageId && api.deleteMessage) await api.deleteMessage(chatId, messageId)
    }

    if (pending.state === 'awaiting_recover_email') {
      const email = text.trim()
      if (!email.includes('@')) {
        await api.sendMessage(chatId, 'E-mail inválido. Envie novamente.', {
          reply_markup: cancelKeyboard(),
        })
        return true
      }
      const user = await services.findUserByEmail(email)
      const otp = makeOtp()
      const expiresAt = Date.now() + 15 * 60_000
      if (user?.is_active !== false && user?.id) {
        setPending(chatId, {
          state: 'awaiting_recover_otp',
          data: { userId: user.id, email: user.email, otp, expiresAt },
        })
        await api.sendMessage(
          chatId,
          [
            '<b>Código enviado</b>',
            '',
            `Seu código: <code>${otp}</code>`,
            'Válido por 15 minutos.',
            '',
            'Envie o código agora.',
          ].join('\n'),
          { reply_markup: cancelKeyboard() },
        )
      } else {
        clearPending(chatId)
        await api.sendMessage(
          chatId,
          'Se o e-mail existir, você receberá um código. Confira e tente de novo se precisar.',
          { reply_markup: welcomeKeyboard() },
        )
      }
      return true
    }

    if (pending.state === 'awaiting_recover_otp') {
      const code = text.trim().replace(/\s+/g, '')
      if (Date.now() > Number(pending.data.expiresAt || 0)) {
        clearPending(chatId)
        await api.sendMessage(chatId, 'Código expirado. Use /recuperar de novo.', {
          reply_markup: welcomeKeyboard(),
        })
        return true
      }
      if (code !== String(pending.data.otp || '')) {
        recordAuthFailure(chatId)
        await api.sendMessage(chatId, 'Código incorreto. Tente novamente.', {
          reply_markup: cancelKeyboard(),
        })
        return true
      }
      setPending(chatId, {
        state: 'awaiting_recover_password',
        data: { userId: pending.data.userId, email: pending.data.email },
      })
      await api.sendMessage(chatId, 'Código ok. Envie a <b>nova senha</b> (mín. 6 caracteres).', {
        reply_markup: cancelKeyboard(),
      })
      return true
    }

    if (pending.state === 'awaiting_recover_password') {
      await scrub()
      const result = await services.setPasswordByUserId({
        userId: pending.data.userId,
        newPassword: text,
      })
      if (!result.ok) {
        await api.sendMessage(chatId, result.message, { reply_markup: cancelKeyboard() })
        return true
      }
      clearPending(chatId)
      clearAuthFailures(chatId)
      await api.sendMessage(
        chatId,
        ['<b>Senha redefinida</b>', '', 'Use /entrar com a nova senha.'].join('\n'),
        { reply_markup: replyGuestKeyboard() },
      )
      return true
    }

    return false
  }

  const handleAdminCommand = async ({ chatId, args }) => {
    const session = await requireSession(chatId)
    if (!session) return
    if (session.user.type !== 'admin') {
      await api.sendMessage(chatId, 'Acesso restrito à equipe.')
      return
    }

    const parts = String(args || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    const sub = (parts[0] || '').toLowerCase()

    if (!sub || sub === 'painel' || sub === 'dash' || sub === 'dashboard') {
      const dash = await services.getAdminDashboard()
      await api.sendMessage(chatId, adminHubText(dash), {
        reply_markup: adminHubKeyboard(),
      })
      return
    }

    if (sub === 'tickets' || sub === 'fila') {
      const rows = await services.listAdminTickets({ limit: 12 })
      await api.sendMessage(chatId, ticketsText(rows, { admin: true }), {
        reply_markup: ticketsListKeyboard(rows, { admin: true }),
      })
      return
    }

    if (sub === 'premium') {
      await sessions.patch(chatId, {
        state: 'awaiting_admin_premium_email',
        context: {},
        mergeContext: false,
      })
      await api.sendMessage(
        chatId,
        [
          '<b>Liberar Premium</b>',
          '',
          'Envie o e-mail do cliente.',
          'Opcional: dias (padrão 30). Ex.: <code>cliente@email.com 60</code>',
        ].join('\n'),
        { reply_markup: cancelKeyboard() },
      )
      return
    }

    if (sub === 'user' || sub === 'usuario' || sub === 'buscar') {
      const email = parts.slice(1).join(' ').trim()
      if (!email) {
        await api.sendMessage(chatId, 'Uso: <code>/admin user email@dominio.com</code>', {
          reply_markup: adminHubKeyboard(),
        })
        return
      }
      const user = await services.findUserByEmail(email)
      if (!user) {
        await api.sendMessage(chatId, 'Usuário não encontrado.', {
          reply_markup: adminHubKeyboard(),
        })
        return
      }
      await api.sendMessage(
        chatId,
        [
          '<b>Usuário</b>',
          `Nome: ${escapeHtml(user.name || '—')}`,
          `E-mail: ${escapeHtml(user.email || '—')}`,
          `Plano: <b>${escapeHtml(user.type || '—')}</b>`,
          `Ativo: ${user.is_active === false ? 'não' : 'sim'}`,
          `ID: <code>${escapeHtml(user.id)}</code>`,
        ].join('\n'),
        { reply_markup: adminHubKeyboard() },
      )
      return
    }

    if (sub === 'futebol' || sub === 'football') {
      await api.sendMessage(chatId, 'Atualizando agenda de jogos…')
      try {
        const refreshed = await services.refreshFootball(parts[1] || '')
        await api.sendMessage(
          chatId,
          [
            '<b>Agenda atualizada</b>',
            `Data: ${escapeHtml(refreshed?.date || 'hoje')}`,
            `Jogos: ${Array.isArray(refreshed?.matches) ? refreshed.matches.length : '—'}`,
          ].join('\n'),
          { reply_markup: adminHubKeyboard() },
        )
      } catch (e) {
        console.error('[telegram-bot] admin futebol', e)
        await api.sendMessage(chatId, 'Falha ao atualizar a agenda.', {
          reply_markup: adminHubKeyboard(),
        })
      }
      return
    }

    if (sub === 'status' || sub === 'bot') {
      await api.sendMessage(
        chatId,
        [
          '<b>Status do bot</b>',
          'Webhook e sessão ativos neste processo.',
          'Admins com /entrar neste chat recebem avisos de chamado.',
        ].join('\n'),
        { reply_markup: adminHubKeyboard() },
      )
      return
    }

    await api.sendMessage(
      chatId,
      [
        '<b>Admin</b>',
        '',
        '<code>/admin</code> — painel',
        '<code>/admin tickets</code> — fila',
        '<code>/admin premium</code> — liberar plano',
        '<code>/admin user email</code> — buscar conta',
        '<code>/admin futebol</code> — atualizar agenda',
        '<code>/admin status</code> — status do bot',
      ].join('\n'),
      { reply_markup: adminHubKeyboard() },
    )
  }

  const runBulkOrSingleSearch = async ({ chatId, session, queryText, runSingle }) => {
    const raw = String(queryText || '')
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 10)

    if (lines.length <= 1) {
      await runSingle({ chatId, session, queryText: lines[0] || raw.trim() })
      return
    }

    await api.sendMessage(chatId, `Buscando lote (<b>${lines.length}</b> títulos)…`)
    const picks = []
    for (const line of lines) {
      const result = await services.searchTitles({
        userId: session.userId,
        queryText: line.slice(0, 120),
        skipHistory: true,
      })
      picks.push({
        query: line,
        item: result.ok && result.items?.[0] ? result.items[0] : null,
      })
    }

    const items = picks.map((p) => p.item).filter(Boolean)
    await services.saveBulkSearchHistory({
      userId: session.userId,
      queryText: lines.join('\n'),
      items,
    })

    await sessions.patch(chatId, {
      state: 'linked',
      context: { results: items, bulkPicks: picks },
      mergeContext: true,
    })

    await api.sendMessage(chatId, formatBulkSearchResults(picks), {
      reply_markup: searchPickKeyboard(items.length),
    })
  }

  return {
    handleBrandHub,
    startBrandEdit,
    handleBrandText,
    handleBrandPhoto,
    startRecoverFlow,
    handleRecoverPending,
    handleAdminCommand,
    runBulkOrSingleSearch,
  }
}
