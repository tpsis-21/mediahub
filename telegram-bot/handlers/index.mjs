import { isPremiumOrAdmin } from '../lib/config.mjs'
import {
  accountKeyboard,
  accountText,
  cancelKeyboard,
  escapeHtml,
  footballKeyboard,
  footballModelKeyboard,
  footballModelPickText,
  formatFootballListChunks,
  formatSearchResults,
  helpText,
  historyKeyboard,
  historyText,
  linkHelpText,
  linkedWelcomeText,
  lockedFeatureKeyboard,
  mainMenuKeyboard,
  mainMenuText,
  plansText,
  premiumUpsell,
  replyGuestKeyboard,
  replyNavKeyboard,
  searchPickKeyboard,
  searchPromptText,
  supportHubKeyboard,
  supportHubText,
  ticketsListKeyboard,
  ticketsText,
  ticketDetailKeyboard,
  ticketDetailText,
  titleActionsKeyboard,
  titleDetailText,
  top10HubKeyboard,
  top10HubText,
  top10ModelKeyboard,
  top10ModelPickText,
  unlinkNeedText,
  welcomeKeyboard,
  welcomeText,
} from '../lib/format.mjs'
import {
  assertAuthAllowed,
  clearAuthFailures,
  clearPending,
  getPending,
  recordAuthFailure,
  setPending,
} from '../lib/pending.mjs'

/**
 * @param {object} ctx
 */
export const createHandlers = (ctx) => {
  const { api, sessions, pairing, services, banners } = ctx

  const requireSession = async (chatId) => {
    const session = await sessions.getByChatId(chatId)
    if (!session) {
      await api.sendMessage(chatId, unlinkNeedText(), {
        reply_markup: replyGuestKeyboard(),
      })
      await api.sendMessage(chatId, 'Ou use os botões:', { reply_markup: welcomeKeyboard() })
      return null
    }
    return session
  }

  const showMainMenu = async (chatId, session) => {
    await api.sendMessage(chatId, mainMenuText(session.user), {
      reply_markup: mainMenuKeyboard(session.user.type),
    })
  }

  const greetLinked = async (chatId, session, { justLinked = false } = {}) => {
    await api.sendMessage(chatId, linkedWelcomeText(session.user, { justLinked }), {
      reply_markup: replyNavKeyboard(),
    })
    await showMainMenu(chatId, session)
  }

  const handlePlans = async ({ chatId }) => {
    const session = await sessions.getByChatId(chatId)
    await api.sendMessage(chatId, plansText(session?.user?.type), {
      reply_markup: session
        ? {
            inline_keyboard: [
              ...(session.user.type === 'free'
                ? [[{ text: 'Solicitar Premium', callback_data: 'menu:support' }]]
                : []),
              [{ text: '« Menu', callback_data: 'menu:home' }],
            ],
          }
        : welcomeKeyboard(),
    })
  }

  const notifyAdminsNewTicket = async ({ ticketId, subject, message, userName, userEmail }) => {
    const targets = await services.listAdminTelegramTargets()
    const text = [
      '<b>Novo chamado</b>',
      `#${ticketId} · ${escapeHtml(subject)}`,
      `De: ${escapeHtml(userName || '—')} · ${escapeHtml(userEmail || '')}`,
      '',
      escapeHtml(String(message || '').slice(0, 500)),
    ].join('\n')
    for (const target of targets) {
      try {
        await api.sendMessage(target, text, {
          reply_markup: ticketDetailKeyboard({ ticketId, isAdminView: true }),
        })
      } catch (e) {
        console.error('[telegram-bot] notify admin ticket', target, e?.message || e)
      }
    }
  }

  const notifyUserTicketUpdate = async ({ userId, ticketId, message, statusLabel }) => {
    const chatId = await services.getUserTelegramChatId(userId)
    if (!chatId) return
    const text = [
      `<b>Atualização do chamado #${ticketId}</b>`,
      statusLabel ? `Status: ${escapeHtml(statusLabel)}` : '',
      message ? `\n${escapeHtml(String(message).slice(0, 800))}` : '',
      '',
      'Responda por aqui no bot se precisar.',
    ]
      .filter(Boolean)
      .join('\n')
    try {
      await api.sendMessage(chatId, text, {
        reply_markup: ticketDetailKeyboard({ ticketId, isAdminView: false }),
      })
    } catch (e) {
      console.error('[telegram-bot] notify user ticket', e?.message || e)
    }
  }

  const handleSupportHub = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    await api.sendMessage(chatId, supportHubText(session.user.type), {
      reply_markup: supportHubKeyboard(session.user.type),
    })
  }

  const openTicketView = async ({ chatId, session, ticketId, forceAdmin = false }) => {
    const detail = await services.getTicketDetail({
      ticketId,
      requesterUserId: session.userId,
      requesterType: session.user.type,
    })
    if (!detail.ok) {
      await api.sendMessage(chatId, detail.message || 'Chamado não encontrado.', {
        reply_markup: supportHubKeyboard(session.user.type),
      })
      return
    }
    const isAdminView = forceAdmin || detail.isAdmin
    await api.sendMessage(
      chatId,
      ticketDetailText({
        ticket: detail.ticket,
        messages: detail.messages,
        isAdminView,
      }),
      { reply_markup: ticketDetailKeyboard({ ticketId: detail.ticket.id, isAdminView }) },
    )
  }

  const handleAdminTickets = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    if (session.user.type !== 'admin') {
      await api.sendMessage(chatId, 'Acesso restrito à equipe.')
      return
    }
    const rows = await services.listAdminTickets({ limit: 12 })
    await api.sendMessage(chatId, ticketsText(rows, { admin: true }), {
      reply_markup: ticketsListKeyboard(rows, { admin: true }),
    })
  }

  const handleAdminPremiumStart = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    if (session.user.type !== 'admin') {
      await api.sendMessage(chatId, 'Acesso restrito à equipe.')
      return
    }
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
        'Envie o <b>e-mail</b> do cliente.',
        'Opcional na mesma linha: dias (padrão 30).',
        'Ex.: <code>cliente@email.com 60</code>',
      ].join('\n'),
      { reply_markup: cancelKeyboard() },
    )
  }

  const handleTop10Hub = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    if (!isPremiumOrAdmin(session.user.type)) {
      await api.sendMessage(chatId, premiumUpsell('Top 10'), {
        reply_markup: lockedFeatureKeyboard(),
      })
      return
    }
    await api.sendMessage(chatId, top10HubText(), {
      reply_markup: top10HubKeyboard(),
    })
  }

  const startLoginFlow = async (chatId) => {
    const gate = assertAuthAllowed(chatId)
    if (!gate.ok) {
      await api.sendMessage(chatId, gate.message)
      return
    }
    setPending(chatId, { state: 'awaiting_login_email', data: {} })
    await api.sendMessage(
      chatId,
      ['<b>Entrar</b>', '', 'Envie o <b>e-mail</b> cadastrado.'].join('\n'),
      { reply_markup: cancelKeyboard() },
    )
  }

  const startRegisterFlow = async (chatId) => {
    const gate = assertAuthAllowed(chatId)
    if (!gate.ok) {
      await api.sendMessage(chatId, gate.message)
      return
    }
    setPending(chatId, { state: 'awaiting_register_name', data: {} })
    await api.sendMessage(
      chatId,
      [
        '<b>Criar conta</b>',
        '',
        'Novas contas: plano <b>Free</b>.',
        'Upgrade: administrador ou suporte.',
        '',
        'Envie seu <b>nome</b>.',
      ].join('\n'),
      { reply_markup: cancelKeyboard() },
    )
  }

  const handleStart = async ({ chatId, payload }) => {
    const raw = String(payload || '').trim()
    if (/^link[_-]/i.test(raw) || pairing.normalizeCode(raw)) {
      const code = pairing.normalizeCode(raw.replace(/^link[_-]/i, ''))
      const consumed = await pairing.consumeLinkCode(code)
      if (!consumed.ok) {
        const map = {
          expired: 'Código expirado. Gere outro ou use Entrar.',
          not_found: 'Código não encontrado. Tente de novo ou use Entrar.',
          inactive: 'Conta inativa. Fale com o suporte.',
          invalid: 'Código inválido.',
        }
        await api.sendMessage(chatId, map[consumed.reason] || 'Não foi possível vincular.', {
          reply_markup: replyGuestKeyboard(),
        })
        return
      }
      clearPending(chatId)
      await pairing.linkChatToUser({ chatId, userId: consumed.userId })
      const session = await sessions.getByChatId(chatId)
      await greetLinked(chatId, session, { justLinked: true })
      return
    }

    clearPending(chatId)
    const session = await sessions.getByChatId(chatId)
    if (session) {
      await greetLinked(chatId, session)
      return
    }
    const ensured = await sessions.ensureFromUserChatId(chatId)
    if (ensured) {
      await greetLinked(chatId, ensured, { justLinked: true })
      return
    }
    await api.sendMessage(chatId, welcomeText(), { reply_markup: replyGuestKeyboard() })
    await api.sendMessage(chatId, 'Escolha uma opção:', { reply_markup: welcomeKeyboard() })
  }

  const handleHelp = async ({ chatId }) => {
    const session = await sessions.getByChatId(chatId)
    await api.sendMessage(chatId, helpText(session?.user?.type), {
      reply_markup: session
        ? { inline_keyboard: [[{ text: '« Menu', callback_data: 'menu:home' }]] }
        : welcomeKeyboard(),
    })
  }

  const handleMenu = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    await showMainMenu(chatId, session)
  }

  const handleAccount = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    await api.sendMessage(chatId, accountText(session.user), {
      reply_markup: accountKeyboard(session.user.type),
    })
  }

  const handleLogout = async ({ chatId }) => {
    await sessions.remove(chatId)
    clearPending(chatId)
    await api.sendMessage(
      chatId,
      ['<b>Sessão encerrada</b>', '', 'Seus dados permanecem salvos.', 'Para voltar, use Entrar.'].join(
        '\n',
      ),
      { reply_markup: replyGuestKeyboard() },
    )
  }

  const handleLoginCommand = async ({ chatId }) => {
    const existing = await sessions.getByChatId(chatId)
    if (existing) {
      await api.sendMessage(
        chatId,
        `Já conectado como <b>${escapeHtml(existing.user.name || existing.user.email)}</b>.\nUse Sair na conta para trocar.`,
        { reply_markup: mainMenuKeyboard(existing.user.type) },
      )
      return
    }
    await startLoginFlow(chatId)
  }

  const handleRegisterCommand = async ({ chatId }) => {
    const existing = await sessions.getByChatId(chatId)
    if (existing) {
      await api.sendMessage(chatId, 'Já há uma conta neste chat. Use Sair antes de criar outra.', {
        reply_markup: mainMenuKeyboard(existing.user.type),
      })
      return
    }
    await startRegisterFlow(chatId)
  }

  const handlePasswordCommand = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    clearPending(chatId)
    setPending(chatId, { state: 'awaiting_password_current', data: { userId: session.userId } })
    await api.sendMessage(chatId, ['<b>Trocar senha</b>', '', 'Envie a <b>senha atual</b>.'].join('\n'), {
      reply_markup: cancelKeyboard(),
    })
  }

  const runSearch = async ({ chatId, session, queryText }) => {
    const q = String(queryText || '').trim().slice(0, 120)
    if (!q) {
      await sessions.patch(chatId, { state: 'awaiting_search' })
      await api.sendMessage(chatId, searchPromptText(), { reply_markup: cancelKeyboard() })
      return
    }
    await api.sendMessage(chatId, `Buscando <b>${escapeHtml(q)}</b>…`)
    const result = await services.searchTitles({ userId: session.userId, queryText: q })
    if (!result.ok) {
      await api.sendMessage(chatId, result.message || 'Não foi possível buscar agora.', {
        reply_markup: { inline_keyboard: [[{ text: '« Menu', callback_data: 'menu:home' }]] },
      })
      return
    }
    await sessions.patch(chatId, {
      state: 'linked',
      context: { results: result.items },
      mergeContext: true,
    })
    await api.sendMessage(chatId, formatSearchResults(result.items), {
      reply_markup: searchPickKeyboard(result.items.length),
    })
  }

  const handleSearchCommand = async ({ chatId, args }) => {
    const session = await requireSession(chatId)
    if (!session) return
    await runSearch({ chatId, session, queryText: args })
  }

  const handleHistory = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    const rows = await services.getHistory(session.userId)
    const queries = rows.map((r) => {
      const raw = String(r.query || '').trim()
      // Para lote: usa a 1ª linha limpa como termo de rebusca; se vazio, ignora
      if (r.type === 'bulk' || raw.includes('\n') || raw.length > 70) {
        const first = raw
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)[0]
        if (!first) return raw.slice(0, 80)
        return first
          .replace(/^[🥇🥈🥉\d️⃣🔟.\s-]+/u, '')
          .replace(/\s*\(\d{4}\)\s*$/, '')
          .trim()
          .slice(0, 80)
      }
      return raw.slice(0, 120)
    })
    await sessions.patch(chatId, {
      state: 'linked',
      context: { historyQueries: queries },
      mergeContext: true,
    })
    await api.sendMessage(chatId, historyText(rows), {
      reply_markup: historyKeyboard(rows.length),
    })
  }

  const sendFootballScheduleMessages = async (chatId, date, matches) => {
    const chunks = formatFootballListChunks(date, matches)
    for (let i = 0; i < chunks.length; i += 1) {
      const isLast = i === chunks.length - 1
      await api.sendMessage(chatId, chunks[i], {
        reply_markup: isLast ? footballKeyboard(date) : undefined,
      })
    }
  }

  const handleFootball = async ({ chatId, args }) => {
    const session = await requireSession(chatId)
    if (!session) return
    if (!isPremiumOrAdmin(session.user.type)) {
      await api.sendMessage(chatId, premiumUpsell('Jogos do dia'), {
        reply_markup: lockedFeatureKeyboard(),
      })
      return
    }
    const parts = String(args || '').trim().split(/\s+/).filter(Boolean)
    const cmd = (parts[0] || '').toLowerCase()
    const wantRefresh = cmd === 'atualizar' || cmd === 'refresh'
    const wantGenerate = cmd === 'gerar' || cmd === 'banner' || cmd === 'png'
    const dateArg = wantRefresh || wantGenerate ? parts[1] : parts[0]

    if (wantGenerate) {
      const dateHint = parts[1] || ''
      let dateIso = dateHint
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
        const schedule = await services.getFootballSchedule(dateHint)
        dateIso = schedule.date
      }
      await api.sendMessage(chatId, footballModelPickText(), {
        reply_markup: footballModelKeyboard(dateIso),
      })
      return
    }

    if (wantRefresh) {
      await api.sendMessage(chatId, 'Atualizando agenda…')
      try {
        const { date, matches } = await services.refreshFootball(dateArg)
        await sendFootballScheduleMessages(chatId, date, matches)
      } catch (e) {
        console.error('[telegram-bot] football refresh', e)
        await api.sendMessage(chatId, 'Não foi possível atualizar a agenda.', {
          reply_markup: { inline_keyboard: [[{ text: '« Menu', callback_data: 'menu:home' }]] },
        })
      }
      return
    }

    try {
      const { date, matches } = await services.getFootballSchedule(dateArg)
      await sendFootballScheduleMessages(chatId, date, matches)
    } catch (e) {
      console.error('[telegram-bot] football', e)
      await api.sendMessage(chatId, 'Não foi possível carregar os jogos.', {
        reply_markup: { inline_keyboard: [[{ text: '« Menu', callback_data: 'menu:home' }]] },
      })
    }
  }

  const generateFootballBanner = async ({ chatId, session, dateArg, model = 'informativo' }) => {
    if (!banners?.renderFootballBanner || !api.sendPhotoBuffer) {
      await api.sendMessage(chatId, 'Geração de banner indisponível neste servidor.')
      return
    }
    const modelId = ['informativo', 'promo', 'clean'].includes(model) ? model : 'informativo'
    await api.sendMessage(chatId, 'Gerando banner…')
    try {
      const { date, matches } = await services.getFootballSchedule(dateArg)
      const brand = (await services.getUserBrand(session.userId)) || {}
      const png = await banners.renderFootballBanner({
        dateIso: date,
        matches,
        brandName: brand.brandName,
        primary: brand.primary,
        secondary: brand.secondary,
        model: modelId,
      })
      await api.sendPhotoBuffer(chatId, png, {
        filename: `jogos-${date}-${modelId}.png`,
        caption: `Jogos do dia · ${date}`,
      })
      await api.sendMessage(chatId, 'Banner pronto. Quer outro modelo?', {
        reply_markup: footballModelKeyboard(date),
      })
    } catch (e) {
      console.error('[telegram-bot] football banner', e)
      await api.sendMessage(chatId, 'Falha ao gerar o banner.')
    }
  }

  const generateTitleBanner = async ({ chatId, session, item }) => {
    if (!banners?.renderTitleBanner || !api.sendPhotoBuffer) {
      await api.sendMessage(chatId, 'Geração de banner indisponível neste servidor.')
      return
    }
    await api.sendMessage(chatId, 'Gerando banner…')
    try {
      const brand = (await services.getUserBrand(session.userId)) || {}
      const posterUrl = await services.buildPosterUrl(item.posterPath)
      const png = await banners.renderTitleBanner({
        title: item.title,
        year: item.year,
        overview: item.overview,
        posterUrl,
        brandName: brand.brandName,
        primary: brand.primary,
        secondary: brand.secondary,
      })
      await api.sendPhotoBuffer(chatId, png, {
        filename: 'banner-titulo.png',
        caption: `<b>${escapeHtml(item.title)}</b>${item.year ? ` (${escapeHtml(item.year)})` : ''}`,
        parse_mode: 'HTML',
      })
    } catch (e) {
      console.error('[telegram-bot] title banner', e)
      await api.sendMessage(chatId, 'Falha ao gerar o banner.')
    }
  }

  const sendTrailer = async ({ chatId, session, item }) => {
    await api.sendMessage(chatId, 'Buscando trailer…')
    const found = await services.findTrailerUrl({
      userId: session.userId,
      mediaType: item.mediaType,
      mediaId: item.id,
    })
    if (!found.ok) {
      await api.sendMessage(chatId, found.message || 'Trailer não encontrado.', {
        reply_markup: {
          inline_keyboard: [[{ text: '« Menu', callback_data: 'menu:home' }]],
        },
      })
      return
    }
    await api.sendMessage(
      chatId,
      [`<b>Trailer</b> · ${escapeHtml(item.title)}`, '', found.url].join('\n'),
      {
        disable_web_page_preview: false,
        reply_markup: {
          inline_keyboard: [[{ text: '« Menu', callback_data: 'menu:home' }]],
        },
      },
    )
  }

  const handleTop10 = async ({ chatId, args }) => {
    const session = await requireSession(chatId)
    if (!session) return
    if (!isPremiumOrAdmin(session.user.type)) {
      await api.sendMessage(chatId, premiumUpsell('Top 10'), {
        reply_markup: lockedFeatureKeyboard(),
      })
      return
    }
    if (!banners?.renderTop10Banner || !api.sendPhotoBuffer) {
      await api.sendMessage(chatId, 'Geração de banner indisponível neste servidor.')
      return
    }

    const parts = String(args || '').trim().split(/\s+/).filter(Boolean)
    const maybeModel = (parts[0] || '').toLowerCase()
    const hasModel = maybeModel === 'lista' || maybeModel === 'cartaz'
    const model = hasModel ? maybeModel : 'lista'
    const catRaw = (hasModel ? parts[1] : parts[0] || '').toLowerCase()

    if (!catRaw && !hasModel) {
      await handleTop10Hub({ chatId })
      return
    }

    const mediaType =
      catRaw === 'filme' || catRaw === 'movie'
        ? 'movie'
        : catRaw === 'serie' || catRaw === 'série' || catRaw === 'tv'
          ? 'tv'
          : 'all'
    const label = mediaType === 'movie' ? 'Top 10 Filmes' : mediaType === 'tv' ? 'Top 10 Séries' : 'Top 10'
    await api.sendMessage(chatId, `Gerando ${label} (${model})…`)
    try {
      const trending = await services.getTrending({ userId: session.userId, mediaType })
      if (!trending.ok) {
        await api.sendMessage(chatId, trending.message || 'Não foi possível carregar o ranking.')
        return
      }
      const brand = (await services.getUserBrand(session.userId)) || {}
      const items = []
      for (const it of trending.items) {
        items.push({
          title: it.title,
          year: it.year,
          posterUrl: await services.buildPosterUrl(it.posterPath),
        })
      }
      const png = await banners.renderTop10Banner({
        items,
        categoryLabel: label,
        brandName: brand.brandName,
        primary: brand.primary,
        secondary: brand.secondary || '#DC2626',
        model,
      })
      await api.sendPhotoBuffer(chatId, png, {
        filename: `top10-${model}.png`,
        caption: label,
      })
      await api.sendMessage(chatId, 'Pronto. Quer outro modelo?', {
        reply_markup: top10ModelKeyboard(mediaType),
      })
    } catch (e) {
      console.error('[telegram-bot] top10', e)
      await api.sendMessage(chatId, 'Falha ao gerar o Top 10.')
    }
  }

  const handleSupportStart = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    await sessions.patch(chatId, { state: 'awaiting_ticket_subject', context: {}, mergeContext: false })
    await api.sendMessage(
      chatId,
      ['<b>Novo chamado</b>', '', 'Envie o <b>assunto</b> em uma linha.'].join('\n'),
      { reply_markup: cancelKeyboard() },
    )
  }

  const handleTickets = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    const rows = await services.listTickets(session.userId)
    await api.sendMessage(chatId, ticketsText(rows), {
      reply_markup: ticketsListKeyboard(rows),
    })
  }

  const handleCancel = async ({ chatId }) => {
    clearPending(chatId)
    const session = await sessions.getByChatId(chatId)
    if (session) {
      await sessions.patch(chatId, { state: 'linked', context: {}, mergeContext: false })
      await api.sendMessage(chatId, 'Operação cancelada.', {
        reply_markup: mainMenuKeyboard(session.user.type),
      })
      return
    }
    await api.sendMessage(chatId, 'Operação cancelada.', {
      reply_markup: welcomeKeyboard(),
    })
  }

  const finishAuthSuccess = async (chatId, auth) => {
    clearPending(chatId)
    clearAuthFailures(chatId)
    await pairing.linkChatToUser({ chatId, userId: auth.userId })
    const session = await sessions.getByChatId(chatId)
    await greetLinked(chatId, session, { justLinked: true })
  }

  const handlePendingAuthText = async ({ chatId, text, messageId }) => {
    const pending = getPending(chatId)
    if (!pending) return false

    const gate = assertAuthAllowed(chatId)
    if (!gate.ok) {
      await api.sendMessage(chatId, gate.message)
      clearPending(chatId)
      return true
    }

    const scrubPassword = async () => {
      if (messageId && api.deleteMessage) {
        await api.deleteMessage(chatId, messageId)
      }
    }

    if (pending.state === 'awaiting_login_email') {
      const email = text.trim()
      if (!email.includes('@')) {
        await api.sendMessage(chatId, 'E-mail inválido. Envie novamente.', {
          reply_markup: cancelKeyboard(),
        })
        return true
      }
      setPending(chatId, { state: 'awaiting_login_password', data: { email } })
      await api.sendMessage(
        chatId,
        ['Envie sua <b>senha</b>.', '', '<i>A mensagem da senha será removida quando possível.</i>'].join(
          '\n',
        ),
        { reply_markup: cancelKeyboard() },
      )
      return true
    }

    if (pending.state === 'awaiting_login_password') {
      await scrubPassword()
      const result = await services.loginWithPassword({
        emailRaw: pending.data.email,
        password: text,
      })
      if (!result.ok) {
        recordAuthFailure(chatId)
        clearPending(chatId)
        await api.sendMessage(chatId, result.message, { reply_markup: welcomeKeyboard() })
        return true
      }
      await finishAuthSuccess(chatId, result)
      return true
    }

    if (pending.state === 'awaiting_register_name') {
      const name = text.trim().slice(0, 80)
      if (name.length < 2) {
        await api.sendMessage(chatId, 'Nome muito curto. Envie novamente.', {
          reply_markup: cancelKeyboard(),
        })
        return true
      }
      setPending(chatId, { state: 'awaiting_register_email', data: { name } })
      await api.sendMessage(chatId, `Olá, <b>${escapeHtml(name)}</b>.\nEnvie seu <b>e-mail</b>.`, {
        reply_markup: cancelKeyboard(),
      })
      return true
    }

    if (pending.state === 'awaiting_register_email') {
      const email = text.trim()
      if (!email.includes('@') || email.length < 5) {
        await api.sendMessage(chatId, 'E-mail inválido. Envie novamente.', {
          reply_markup: cancelKeyboard(),
        })
        return true
      }
      setPending(chatId, { state: 'awaiting_register_brand', data: { email } })
      await api.sendMessage(
        chatId,
        'Envie o <b>nome da marca</b> (aparece nas artes).\nPode ser igual ao seu nome.',
        { reply_markup: cancelKeyboard() },
      )
      return true
    }

    if (pending.state === 'awaiting_register_brand') {
      const brandName = text.trim().slice(0, 80)
      if (brandName.length < 2) {
        await api.sendMessage(chatId, 'Nome da marca muito curto. Envie novamente.', {
          reply_markup: cancelKeyboard(),
        })
        return true
      }
      setPending(chatId, { state: 'awaiting_register_password', data: { brandName } })
      await api.sendMessage(
        chatId,
        'Crie uma <b>senha</b> (mínimo 6 caracteres).',
        { reply_markup: cancelKeyboard() },
      )
      return true
    }

    if (pending.state === 'awaiting_register_password') {
      await scrubPassword()
      const result = await services.registerWithPassword({
        emailRaw: pending.data.email,
        password: text,
        name: pending.data.name,
        brandName: pending.data.brandName,
      })
      if (!result.ok) {
        recordAuthFailure(chatId)
        clearPending(chatId)
        await api.sendMessage(chatId, result.message, { reply_markup: welcomeKeyboard() })
        return true
      }
      await finishAuthSuccess(chatId, result)
      return true
    }

    if (pending.state === 'awaiting_password_current') {
      await scrubPassword()
      setPending(chatId, {
        state: 'awaiting_password_new',
        data: { userId: pending.data.userId, currentPassword: text },
      })
      await api.sendMessage(chatId, 'Envie a <b>nova senha</b> (mínimo 6 caracteres).', {
        reply_markup: cancelKeyboard(),
      })
      return true
    }

    if (pending.state === 'awaiting_password_new') {
      await scrubPassword()
      const session = await sessions.getByChatId(chatId)
      const changed = await services.changePassword({
        userId: pending.data.userId,
        currentPassword: pending.data.currentPassword,
        newPassword: text,
      })
      clearPending(chatId)
      if (!changed.ok) {
        await api.sendMessage(chatId, changed.message, {
          reply_markup: session ? accountKeyboard(session.user.type) : undefined,
        })
        return true
      }
      await api.sendMessage(chatId, 'Senha atualizada.', {
        reply_markup: session ? accountKeyboard(session.user.type) : undefined,
      })
      return true
    }

    return false
  }

  const handleTextWhileAwaiting = async ({ chatId, text, messageId }) => {
    if (await handlePendingAuthText({ chatId, text, messageId })) {
      return true
    }

    const session = await sessions.getByChatId(chatId)
    if (!session) {
      await api.sendMessage(chatId, unlinkNeedText(), { reply_markup: replyGuestKeyboard() })
      return true
    }

    if (session.state === 'awaiting_search') {
      await runSearch({ chatId, session, queryText: text })
      return true
    }

    if (session.state === 'awaiting_ticket_subject') {
      const subject = text.trim().slice(0, 120)
      if (subject.length < 3) {
        await api.sendMessage(chatId, 'Assunto muito curto. Envie novamente.', {
          reply_markup: cancelKeyboard(),
        })
        return true
      }
      await sessions.patch(chatId, {
        state: 'awaiting_ticket_message',
        context: { ticketSubject: subject },
        mergeContext: true,
      })
      await api.sendMessage(chatId, 'Descreva o problema ou pedido:', {
        reply_markup: cancelKeyboard(),
      })
      return true
    }

    if (session.state === 'awaiting_ticket_message') {
      const message = text.trim().slice(0, 2000)
      const subject = session.context?.ticketSubject
      if (!subject || message.length < 3) {
        await api.sendMessage(chatId, 'Mensagem inválida. Abra o suporte novamente.', {
          reply_markup: supportHubKeyboard(session.user.type),
        })
        await sessions.patch(chatId, { state: 'linked', context: {}, mergeContext: false })
        return true
      }
      const created = await services.createTicket({
        userId: session.userId,
        subject,
        message,
      })
      await sessions.patch(chatId, { state: 'linked', context: {}, mergeContext: false })
      if (!created.ok) {
        await api.sendMessage(chatId, created.message || 'Não foi possível abrir o chamado.', {
          reply_markup: supportHubKeyboard(session.user.type),
        })
        return true
      }
      await api.sendMessage(
        chatId,
        [
          `Chamado <b>#${created.id}</b> aberto.`,
          'A equipe recebe o aviso neste bot e responde por aqui.',
        ].join('\n'),
        { reply_markup: supportHubKeyboard(session.user.type) },
      )
      void notifyAdminsNewTicket({
        ticketId: created.id,
        subject,
        message,
        userName: created.userName || session.user.name,
        userEmail: created.userEmail || session.user.email,
      })
      return true
    }

    if (session.state === 'awaiting_ticket_reply') {
      const ticketId = session.context?.ticketId
      const asAdmin = Boolean(session.context?.replyAsAdmin)
      const message = text.trim().slice(0, 2000)
      if (!ticketId || message.length < 1) {
        await api.sendMessage(chatId, 'Resposta inválida.', {
          reply_markup: supportHubKeyboard(session.user.type),
        })
        await sessions.patch(chatId, { state: 'linked', context: {}, mergeContext: false })
        return true
      }
      const added = await services.addTicketMessage({
        ticketId,
        userId: session.userId,
        message,
        asAdmin,
      })
      await sessions.patch(chatId, { state: 'linked', context: {}, mergeContext: false })
      if (!added.ok) {
        await api.sendMessage(chatId, added.message || 'Não foi possível responder.', {
          reply_markup: supportHubKeyboard(session.user.type),
        })
        return true
      }
      await api.sendMessage(chatId, `Resposta enviada no chamado <b>#${ticketId}</b>.`, {
        reply_markup: ticketDetailKeyboard({
          ticketId,
          isAdminView: asAdmin,
        }),
      })
      if (added.isAdminReply && added.ticket?.user_id) {
        void notifyUserTicketUpdate({
          userId: added.ticket.user_id,
          ticketId,
          message,
        })
      } else if (!asAdmin) {
        // cliente respondeu → avisa admins
        void notifyAdminsNewTicket({
          ticketId,
          subject: added.ticket?.subject || `Resposta #${ticketId}`,
          message,
          userName: session.user.name,
          userEmail: session.user.email,
        })
      }
      return true
    }

    if (session.state === 'awaiting_admin_premium_email') {
      if (session.user.type !== 'admin') {
        await sessions.patch(chatId, { state: 'linked', context: {}, mergeContext: false })
        return true
      }
      const parts = text.trim().split(/\s+/).filter(Boolean)
      const email = parts[0] || ''
      const days = parts[1] || 30
      const result = await services.setUserPremium({
        adminUserId: session.userId,
        targetEmail: email,
        days,
      })
      await sessions.patch(chatId, { state: 'linked', context: {}, mergeContext: false })
      if (!result.ok) {
        await api.sendMessage(chatId, result.message, {
          reply_markup: supportHubKeyboard(session.user.type),
        })
        return true
      }
      await api.sendMessage(
        chatId,
        [
          '<b>Premium liberado</b>',
          `${escapeHtml(result.user.email)} · ${result.days} dia(s)`,
          `Vence: ${escapeHtml(new Date(result.subscriptionEnd).toLocaleString('pt-BR'))}`,
        ].join('\n'),
        { reply_markup: supportHubKeyboard(session.user.type) },
      )
      const userChat = await services.getUserTelegramChatId(result.user.id)
      if (userChat) {
        try {
          await api.sendMessage(
            userChat,
            [
              '<b>Seu plano Premium foi ativado</b>',
              `Válido por ${result.days} dia(s).`,
              'Use /menu para acessar Jogos e Top 10.',
            ].join('\n'),
            { reply_markup: mainMenuKeyboard('premium') },
          )
        } catch {
          /* noop */
        }
      }
      return true
    }

    return false
  }

  const handleNavAction = async ({ chatId, action }) => {
    clearPending(chatId)
    const session = await sessions.getByChatId(chatId)
    if (session && session.state !== 'linked') {
      await sessions.patch(chatId, { state: 'linked', context: session.context || {}, mergeContext: false })
    }
    switch (action) {
      case 'menu':
        await handleMenu({ chatId })
        return true
      case 'search':
        await handleSearchCommand({ chatId, args: '' })
        return true
      case 'account':
        await handleAccount({ chatId })
        return true
      case 'help':
        await handleHelp({ chatId })
        return true
      case 'login':
        await handleLoginCommand({ chatId })
        return true
      case 'register':
        await handleRegisterCommand({ chatId })
        return true
      case 'plans':
        await handlePlans({ chatId })
        return true
      default:
        return false
    }
  }

  const handleCallback = async ({ chatId, data, callbackQueryId }) => {
    try {
      if (data === 'nav:cancel') {
        await handleCancel({ chatId })
        return
      }
      if (data === 'auth:login') {
        await startLoginFlow(chatId)
        return
      }
      if (data === 'auth:register') {
        await startRegisterFlow(chatId)
        return
      }
      if (data === 'auth:link_help') {
        await api.sendMessage(chatId, linkHelpText(), { reply_markup: welcomeKeyboard() })
        return
      }
      if (data === 'auth:help' || data === 'menu:help') {
        await handleHelp({ chatId })
        return
      }
      if (data === 'auth:plans' || data === 'menu:plans') {
        await handlePlans({ chatId })
        return
      }
      if (data.startsWith('menu:locked:')) {
        const feature =
          data === 'menu:locked:football'
            ? 'Jogos do dia'
            : data === 'menu:locked:top10'
              ? 'Top 10'
              : 'Banner de título'
        await api.sendMessage(chatId, premiumUpsell(feature), {
          reply_markup: lockedFeatureKeyboard(),
        })
        return
      }

      const session = await requireSession(chatId)
      if (!session) return

      if (data === 'menu:home') {
        await handleMenu({ chatId })
      } else if (data === 'menu:account') {
        await handleAccount({ chatId })
      } else if (data === 'menu:password') {
        await handlePasswordCommand({ chatId })
      } else if (data === 'menu:logout') {
        await handleLogout({ chatId })
      } else if (data === 'menu:search') {
        await runSearch({ chatId, session, queryText: '' })
      } else if (data === 'menu:history') {
        await handleHistory({ chatId })
      } else if (data.startsWith('hist:')) {
        const idx = Number(data.slice(5))
        const q = session.context?.historyQueries?.[idx]
        if (!q) {
          await api.sendMessage(chatId, 'Este item do histórico expirou. Abra o histórico de novo.', {
            reply_markup: historyKeyboard(0),
          })
        } else {
          await runSearch({ chatId, session, queryText: q })
        }
      } else if (data === 'menu:football') {
        await handleFootball({ chatId, args: '' })
      } else if (data === 'menu:top10') {
        await handleTop10Hub({ chatId })
      } else if (data === 'menu:support_hub') {
        await handleSupportHub({ chatId })
      } else if (data === 'menu:support') {
        await handleSupportStart({ chatId })
      } else if (data === 'menu:tickets') {
        await handleTickets({ chatId })
      } else if (data === 'admin:tickets') {
        await handleAdminTickets({ chatId })
      } else if (data === 'admin:premium') {
        await handleAdminPremiumStart({ chatId })
      } else if (data.startsWith('tkt:view:') || data.startsWith('tkt:admin:')) {
        const ticketId = data.split(':')[2]
        await openTicketView({
          chatId,
          session,
          ticketId,
          forceAdmin: data.startsWith('tkt:admin:'),
        })
      } else if (data.startsWith('tkt:reply:')) {
        const ticketId = data.slice('tkt:reply:'.length)
        const detail = await services.getTicketDetail({
          ticketId,
          requesterUserId: session.userId,
          requesterType: session.user.type,
        })
        if (!detail.ok) {
          await api.sendMessage(chatId, detail.message)
          return
        }
        await sessions.patch(chatId, {
          state: 'awaiting_ticket_reply',
          context: {
            ticketId: Number(ticketId),
            replyAsAdmin: detail.isAdmin && detail.ticket.user_id !== session.userId,
          },
          mergeContext: false,
        })
        await api.sendMessage(chatId, `Envie a resposta do chamado <b>#${ticketId}</b>:`, {
          reply_markup: cancelKeyboard(),
        })
      } else if (data.startsWith('tkt:status:')) {
        const parts = data.split(':')
        const ticketId = parts[2]
        const status = parts[3]
        const updated = await services.updateTicketStatus({
          ticketId,
          status,
          adminUserId: session.userId,
        })
        if (!updated.ok) {
          await api.sendMessage(chatId, updated.message)
          return
        }
        await api.sendMessage(chatId, `Status do #${ticketId} → <b>${escapeHtml(status)}</b>.`)
        const detail = await services.getTicketDetail({
          ticketId,
          requesterUserId: session.userId,
          requesterType: session.user.type,
        })
        if (detail.ok && detail.ticket?.user_id) {
          void notifyUserTicketUpdate({
            userId: detail.ticket.user_id,
            ticketId,
            statusLabel: status,
          })
        }
        await openTicketView({ chatId, session, ticketId, forceAdmin: true })
      } else if (data.startsWith('top10:cat:')) {
        const mediaType = data.slice('top10:cat:'.length)
        const label =
          mediaType === 'movie' ? 'Top 10 Filmes' : mediaType === 'tv' ? 'Top 10 Séries' : 'Top 10'
        await api.sendMessage(chatId, top10ModelPickText(label), {
          reply_markup: top10ModelKeyboard(mediaType),
        })
      } else if (data.startsWith('top10:gen:')) {
        const rest = data.slice('top10:gen:'.length)
        const [model, mediaType] = rest.split(':')
        const cat =
          mediaType === 'movie' ? 'filme' : mediaType === 'tv' ? 'serie' : 'all'
        await handleTop10({ chatId, args: `${model} ${cat}` })
      } else if (data.startsWith('top10:')) {
        // compat: top10:movie etc. → pede modelo
        const kind = data.slice(6)
        const mediaType = kind === 'movie' || kind === 'tv' ? kind : 'all'
        const label =
          mediaType === 'movie' ? 'Top 10 Filmes' : mediaType === 'tv' ? 'Top 10 Séries' : 'Top 10'
        await api.sendMessage(chatId, top10ModelPickText(label), {
          reply_markup: top10ModelKeyboard(mediaType),
        })
      } else if (data.startsWith('pick:')) {
        const idx = Number(data.slice(5))
        const item = session.context?.results?.[idx]
        if (!item) {
          await api.sendMessage(chatId, 'Resultado expirado. Faça uma nova busca.', {
            reply_markup: historyKeyboard(),
          })
        } else {
          await api.sendMessage(chatId, titleDetailText(item), {
            reply_markup: titleActionsKeyboard(idx, {
              premium: isPremiumOrAdmin(session.user.type),
            }),
          })
        }
      } else if (data.startsWith('send:')) {
        const idx = Number(data.slice(5))
        const item = session.context?.results?.[idx]
        if (!item) {
          await api.sendMessage(chatId, 'Resultado expirado. Faça uma nova busca.')
        } else {
          const posterUrl = await services.buildPosterUrl(item.posterPath)
          const caption = `<b>${escapeHtml(item.title)}</b>${item.year ? ` (${escapeHtml(item.year)})` : ''}`
          if (posterUrl) {
            await api.sendPhoto(chatId, posterUrl, {
              caption,
              reply_markup: titleActionsKeyboard(idx, {
                premium: isPremiumOrAdmin(session.user.type),
              }),
            })
          } else {
            await api.sendMessage(chatId, `${caption}\n\nSem capa disponível.`)
          }
        }
      } else if (data.startsWith('trailer:')) {
        const idx = Number(data.slice(8))
        const item = session.context?.results?.[idx]
        if (!item) {
          await api.sendMessage(chatId, 'Resultado expirado. Faça uma nova busca.')
        } else {
          await sendTrailer({ chatId, session, item })
        }
      } else if (data.startsWith('banner:')) {
        const idx = Number(data.slice(7))
        const item = session.context?.results?.[idx]
        if (!item) {
          await api.sendMessage(chatId, 'Resultado expirado. Faça uma nova busca.')
        } else if (!isPremiumOrAdmin(session.user.type)) {
          await api.sendMessage(chatId, premiumUpsell('Banner de título'), {
            reply_markup: lockedFeatureKeyboard(),
          })
        } else {
          await generateTitleBanner({ chatId, session, item })
        }
      } else if (data.startsWith('fb:refresh:')) {
        const dateIso = data.slice('fb:refresh:'.length)
        await handleFootball({ chatId, args: `atualizar ${dateIso}` })
      } else if (data.startsWith('fb:pick:')) {
        const dateIso = data.slice('fb:pick:'.length)
        await api.sendMessage(chatId, footballModelPickText(), {
          reply_markup: footballModelKeyboard(dateIso),
        })
      } else if (data.startsWith('fb:gen:')) {
        // fb:gen:<model>:<YYYY-MM-DD>  (ou legado fb:gen:<date>)
        const rest = data.slice('fb:gen:'.length)
        const parts = rest.split(':')
        if (parts.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(parts[parts.length - 1])) {
          const dateIso = parts.pop()
          const model = parts.join(':') || 'informativo'
          await generateFootballBanner({ chatId, session, dateArg: dateIso, model })
        } else {
          await generateFootballBanner({ chatId, session, dateArg: rest, model: 'informativo' })
        }
      }
    } finally {
      try {
        await api.answerCallbackQuery(callbackQueryId)
      } catch {
        /* noop */
      }
    }
  }

  return {
    handleStart,
    handleHelp,
    handleMenu,
    handleAccount,
    handlePlans,
    handleLogout,
    handleLoginCommand,
    handleRegisterCommand,
    handlePasswordCommand,
    handleSearchCommand,
    handleHistory,
    handleFootball,
    handleTop10,
    handleSupportStart,
    handleSupportHub,
    handleTickets,
    handleAdminTickets,
    handleCancel,
    handleTextWhileAwaiting,
    handleNavAction,
    handleCallback,
  }
}
