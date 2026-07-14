import { isPremiumOrAdmin } from '../lib/config.mjs'
import {
  accountText,
  escapeHtml,
  footballKeyboard,
  formatFootballListChunks,
  formatSearchResults,
  helpText,
  linkHelpText,
  mainMenuKeyboard,
  premiumUpsell,
  searchPickKeyboard,
  titleActionsKeyboard,
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
      await api.sendMessage(chatId, unlinkNeedText(), { reply_markup: welcomeKeyboard() })
      return null
    }
    return session
  }

  const greetLinked = async (chatId, session, { justLinked = false } = {}) => {
    const name = escapeHtml(session.user.name || session.user.email || 'você')
    const intro = justLinked
      ? `Pronto, <b>${name}</b>! Conta conectada com sucesso.`
      : `Olá de novo, <b>${name}</b>!`
    await api.sendMessage(
      chatId,
      `${intro}\n\nO que você quer fazer agora?`,
      { reply_markup: mainMenuKeyboard(session.user.type) },
    )
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
      'Vamos entrar na sua conta.\n\nEnvie seu <b>e-mail</b> (ou /cancelar):',
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
        'Vamos criar sua conta — leva menos de 1 minuto.',
        '',
        'Envie seu <b>nome</b> (como prefere ser chamado):',
        '',
        '<i>Dica: use /cancelar a qualquer momento.</i>',
      ].join('\n'),
    )
  }

  const handleStart = async ({ chatId, payload }) => {
    const raw = String(payload || '').trim()
    if (/^link[_-]/i.test(raw) || pairing.normalizeCode(raw)) {
      const code = pairing.normalizeCode(raw.replace(/^link[_-]/i, ''))
      const consumed = await pairing.consumeLinkCode(code)
      if (!consumed.ok) {
        const map = {
          expired: 'Esse código expirou. Gere outro na Minha Área ou use /entrar.',
          not_found: 'Código não encontrado. Confira e tente de novo, ou use /entrar.',
          inactive: 'Essa conta está inativa. Fale com o suporte.',
          invalid: 'Código inválido.',
        }
        await api.sendMessage(chatId, map[consumed.reason] || 'Não foi possível vincular.', {
          reply_markup: welcomeKeyboard(),
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
    await api.sendMessage(chatId, welcomeText(), { reply_markup: welcomeKeyboard() })
  }

  const handleHelp = async ({ chatId }) => {
    const session = await sessions.getByChatId(chatId)
    await api.sendMessage(chatId, helpText(session?.user?.type), {
      reply_markup: session ? mainMenuKeyboard(session.user.type) : welcomeKeyboard(),
    })
  }

  const handleMenu = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    await api.sendMessage(chatId, 'Escolha uma opção abaixo 👇', {
      reply_markup: mainMenuKeyboard(session.user.type),
    })
  }

  const handleAccount = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    await api.sendMessage(chatId, accountText(session.user), {
      reply_markup: mainMenuKeyboard(session.user.type),
    })
  }

  const handleLogout = async ({ chatId }) => {
    await sessions.remove(chatId)
    clearPending(chatId)
    await api.sendMessage(
      chatId,
      'Você saiu deste chat. Seus dados na conta continuam salvos.\n\nQuando quiser voltar, use /entrar.',
      { reply_markup: welcomeKeyboard() },
    )
  }

  const handleLoginCommand = async ({ chatId }) => {
    const existing = await sessions.getByChatId(chatId)
    if (existing) {
      await api.sendMessage(
        chatId,
        `Você já está conectado como <b>${escapeHtml(existing.user.name || existing.user.email)}</b>.\nUse /sair se quiser trocar de conta.`,
        { reply_markup: mainMenuKeyboard(existing.user.type) },
      )
      return
    }
    await startLoginFlow(chatId)
  }

  const handleRegisterCommand = async ({ chatId }) => {
    const existing = await sessions.getByChatId(chatId)
    if (existing) {
      await api.sendMessage(
        chatId,
        'Este chat já tem uma conta conectada. Use /sair antes de criar outra.',
        { reply_markup: mainMenuKeyboard(existing.user.type) },
      )
      return
    }
    await startRegisterFlow(chatId)
  }

  const handlePasswordCommand = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    clearPending(chatId)
    setPending(chatId, { state: 'awaiting_password_current', data: { userId: session.userId } })
    await api.sendMessage(chatId, 'Envie sua <b>senha atual</b> (depois pedimos a nova). Ou /cancelar:')
  }

  const runSearch = async ({ chatId, session, queryText }) => {
    const q = String(queryText || '').trim().slice(0, 120)
    if (!q) {
      await sessions.patch(chatId, { state: 'awaiting_search' })
      await api.sendMessage(chatId, 'Digite o nome do filme ou série que deseja buscar:')
      return
    }
    await api.sendMessage(chatId, `Buscando <b>${escapeHtml(q)}</b>…`)
    const result = await services.searchTitles({ userId: session.userId, queryText: q })
    if (!result.ok) {
      await api.sendMessage(chatId, result.message || 'Não consegui buscar agora. Tente de novo em instantes.')
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
    if (!rows.length) {
      await api.sendMessage(chatId, 'Ainda não há buscas no histórico.\nQue tal começar com /buscar?', {
        reply_markup: mainMenuKeyboard(session.user.type),
      })
      return
    }
    const lines = rows.map(
      (r, i) =>
        `${i + 1}. ${escapeHtml(r.query)} <i>(${new Date(Number(r.timestamp)).toLocaleString('pt-BR')})</i>`,
    )
    await api.sendMessage(chatId, ['<b>📜 Suas últimas buscas</b>', '', ...lines].join('\n'), {
      reply_markup: mainMenuKeyboard(session.user.type),
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
      await api.sendMessage(chatId, premiumUpsell('Jogos do dia'))
      return
    }
    const parts = String(args || '').trim().split(/\s+/).filter(Boolean)
    const cmd = (parts[0] || '').toLowerCase()
    const wantRefresh = cmd === 'atualizar' || cmd === 'refresh'
    const wantGenerate = cmd === 'gerar' || cmd === 'banner' || cmd === 'png'
    const dateArg = wantRefresh || wantGenerate ? parts[1] : parts[0]

    if (wantGenerate) {
      await generateFootballBanner({ chatId, session, dateArg })
      return
    }

    if (wantRefresh) {
      await api.sendMessage(chatId, 'Atualizando a agenda para você…')
      try {
        const { date, matches } = await services.refreshFootball(dateArg)
        await sendFootballScheduleMessages(chatId, date, matches)
      } catch (e) {
        console.error('[telegram-bot] football refresh', e)
        await api.sendMessage(chatId, 'Não consegui atualizar a agenda agora. Tente novamente em breve.')
      }
      return
    }

    try {
      const { date, matches } = await services.getFootballSchedule(dateArg)
      await sendFootballScheduleMessages(chatId, date, matches)
    } catch (e) {
      console.error('[telegram-bot] football', e)
      await api.sendMessage(chatId, 'Não consegui carregar os jogos agora.')
    }
  }

  const generateFootballBanner = async ({ chatId, session, dateArg }) => {
    if (!banners?.renderFootballBanner || !api.sendPhotoBuffer) {
      await api.sendMessage(chatId, 'A geração de banner ainda não está disponível neste servidor.')
      return
    }
    await api.sendMessage(chatId, 'Montando o banner dos jogos… um momento ✨')
    try {
      const { date, matches } = await services.getFootballSchedule(dateArg)
      const brand = (await services.getUserBrand(session.userId)) || {}
      const png = await banners.renderFootballBanner({
        dateIso: date,
        matches,
        brandName: brand.brandName,
        primary: brand.primary,
        secondary: brand.secondary,
      })
      await api.sendPhotoBuffer(chatId, png, {
        filename: `jogos-${date}.png`,
        caption: `Jogos do dia · ${date}`,
      })
    } catch (e) {
      console.error('[telegram-bot] football banner', e)
      await api.sendMessage(chatId, 'Não consegui gerar o banner. Tente de novo em instantes.')
    }
  }

  const generateTitleBanner = async ({ chatId, session, item }) => {
    if (!banners?.renderTitleBanner || !api.sendPhotoBuffer) {
      await api.sendMessage(chatId, 'A geração de banner ainda não está disponível neste servidor.')
      return
    }
    await api.sendMessage(chatId, 'Gerando seu banner…')
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
      await api.sendMessage(chatId, 'Não consegui gerar o banner deste título.')
    }
  }

  const sendTrailer = async ({ chatId, session, item }) => {
    await api.sendMessage(chatId, 'Procurando o trailer…')
    const found = await services.findTrailerUrl({
      userId: session.userId,
      mediaType: item.mediaType,
      mediaId: item.id,
    })
    if (!found.ok) {
      await api.sendMessage(chatId, found.message || 'Trailer não encontrado.')
      return
    }
    await api.sendMessage(
      chatId,
      [
        `🎬 Trailer de <b>${escapeHtml(item.title)}</b>`,
        '',
        found.url,
      ].join('\n'),
      { disable_web_page_preview: false },
    )
  }

  const handleTop10 = async ({ chatId, args }) => {
    const session = await requireSession(chatId)
    if (!session) return
    if (!isPremiumOrAdmin(session.user.type)) {
      await api.sendMessage(chatId, premiumUpsell('Top 10'))
      return
    }
    if (!banners?.renderTop10Banner || !api.sendPhotoBuffer) {
      await api.sendMessage(chatId, 'A geração de banner ainda não está disponível neste servidor.')
      return
    }
    const raw = String(args || '').trim().toLowerCase()
    const mediaType =
      raw === 'filme' || raw === 'movie'
        ? 'movie'
        : raw === 'serie' || raw === 'série' || raw === 'tv'
          ? 'tv'
          : 'all'
    const label = mediaType === 'movie' ? 'Top 10 Filmes' : mediaType === 'tv' ? 'Top 10 Séries' : 'Top 10'
    await api.sendMessage(chatId, `Montando o ${label}…`)
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
      })
      await api.sendPhotoBuffer(chatId, png, {
        filename: 'top10.png',
        caption: label,
      })
    } catch (e) {
      console.error('[telegram-bot] top10', e)
      await api.sendMessage(chatId, 'Não consegui gerar o Top 10 agora.')
    }
  }

  const handleSupportStart = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    await sessions.patch(chatId, { state: 'awaiting_ticket_subject', context: {}, mergeContext: false })
    await api.sendMessage(
      chatId,
      'Vamos abrir um chamado.\n\nPrimeiro, envie o <b>assunto</b> em uma linha (ou /cancelar):',
    )
  }

  const handleTickets = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    const rows = await services.listTickets(session.userId)
    if (!rows.length) {
      await api.sendMessage(chatId, 'Você ainda não tem chamados.\nUse /suporte quando precisar de ajuda.', {
        reply_markup: mainMenuKeyboard(session.user.type),
      })
      return
    }
    const lines = rows.map(
      (t) => `#${t.id} · ${escapeHtml(t.status)} · <b>${escapeHtml(t.subject)}</b>`,
    )
    await api.sendMessage(chatId, ['<b>💬 Seus chamados</b>', '', ...lines].join('\n'), {
      reply_markup: mainMenuKeyboard(session.user.type),
    })
  }

  const handleCancel = async ({ chatId }) => {
    clearPending(chatId)
    const session = await sessions.getByChatId(chatId)
    if (session) {
      await sessions.patch(chatId, { state: 'linked', context: {}, mergeContext: false })
      await api.sendMessage(chatId, 'Ok, cancelei. O que deseja fazer?', {
        reply_markup: mainMenuKeyboard(session.user.type),
      })
      return
    }
    await api.sendMessage(chatId, 'Ok, cancelei. Quando quiser, use /entrar ou /cadastrar.', {
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
        await api.sendMessage(chatId, 'Esse e-mail não parece válido. Envie de novo ou /cancelar.')
        return true
      }
      setPending(chatId, { state: 'awaiting_login_password', data: { email } })
      await api.sendMessage(chatId, 'Agora envie sua <b>senha</b>:\n\n<i>Por segurança, tento apagar a mensagem da senha em seguida.</i>')
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
        await api.sendMessage(chatId, `${result.message}\n\nUse /entrar para tentar de novo.`, {
          reply_markup: welcomeKeyboard(),
        })
        return true
      }
      await finishAuthSuccess(chatId, result)
      return true
    }

    if (pending.state === 'awaiting_register_name') {
      const name = text.trim().slice(0, 80)
      if (name.length < 2) {
        await api.sendMessage(chatId, 'Nome muito curto. Envie de novo:')
        return true
      }
      setPending(chatId, { state: 'awaiting_register_email', data: { name } })
      await api.sendMessage(chatId, `Prazer, <b>${escapeHtml(name)}</b>!\nAgora envie seu <b>e-mail</b>:`)
      return true
    }

    if (pending.state === 'awaiting_register_email') {
      const email = text.trim()
      if (!email.includes('@') || email.length < 5) {
        await api.sendMessage(chatId, 'E-mail inválido. Tente de novo:')
        return true
      }
      setPending(chatId, { state: 'awaiting_register_brand', data: { email } })
      await api.sendMessage(
        chatId,
        'Qual o <b>nome da sua marca</b> (aparece nas artes)?\n\nPode ser igual ao seu nome.',
      )
      return true
    }

    if (pending.state === 'awaiting_register_brand') {
      const brandName = text.trim().slice(0, 80)
      if (brandName.length < 2) {
        await api.sendMessage(chatId, 'Nome da marca muito curto. Envie de novo:')
        return true
      }
      setPending(chatId, { state: 'awaiting_register_password', data: { brandName } })
      await api.sendMessage(
        chatId,
        'Por fim, crie uma <b>senha</b> (mín. 6 caracteres).\n\n<i>Tento apagar a mensagem da senha em seguida.</i>',
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
        await api.sendMessage(chatId, `${result.message}\n\nUse /cadastrar ou /entrar.`, {
          reply_markup: welcomeKeyboard(),
        })
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
      await api.sendMessage(chatId, 'Agora envie a <b>nova senha</b> (mín. 6 caracteres):')
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
        await api.sendMessage(chatId, `${changed.message}\nUse /senha para tentar de novo.`)
        return true
      }
      await api.sendMessage(chatId, 'Senha atualizada com sucesso ✅', {
        reply_markup: session ? mainMenuKeyboard(session.user.type) : undefined,
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
      await api.sendMessage(chatId, unlinkNeedText(), { reply_markup: welcomeKeyboard() })
      return true
    }

    if (session.state === 'awaiting_search') {
      await runSearch({ chatId, session, queryText: text })
      return true
    }

    if (session.state === 'awaiting_ticket_subject') {
      const subject = text.trim().slice(0, 120)
      if (subject.length < 3) {
        await api.sendMessage(chatId, 'Assunto muito curto. Tente de novo ou /cancelar.')
        return true
      }
      await sessions.patch(chatId, {
        state: 'awaiting_ticket_message',
        context: { ticketSubject: subject },
        mergeContext: true,
      })
      await api.sendMessage(chatId, 'Ótimo. Agora descreva o problema ou pedido (mensagem do chamado):')
      return true
    }

    if (session.state === 'awaiting_ticket_message') {
      const message = text.trim().slice(0, 2000)
      const subject = session.context?.ticketSubject
      if (!subject || message.length < 3) {
        await api.sendMessage(chatId, 'Mensagem inválida. Use /suporte de novo.')
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
        await api.sendMessage(chatId, created.message || 'Não foi possível abrir o chamado.')
        return true
      }
      await api.sendMessage(
        chatId,
        `Chamado <b>#${created.id}</b> aberto. Obrigado! Nossa equipe responde em breve.`,
        { reply_markup: mainMenuKeyboard(session.user.type) },
      )
      return true
    }

    return false
  }

  const handleCallback = async ({ chatId, data, callbackQueryId }) => {
    try {
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
      if (data === 'auth:help') {
        await handleHelp({ chatId })
        return
      }

      const session = await requireSession(chatId)
      if (!session) return

      if (data === 'menu:home' || data === 'menu:account') {
        if (data === 'menu:account') await handleAccount({ chatId })
        else await handleMenu({ chatId })
      } else if (data === 'menu:search') {
        await sessions.patch(chatId, { state: 'awaiting_search' })
        await api.sendMessage(chatId, 'Digite o nome do filme ou série:')
      } else if (data === 'menu:history') {
        await handleHistory({ chatId })
      } else if (data === 'menu:football') {
        await handleFootball({ chatId, args: '' })
      } else if (data === 'menu:top10') {
        await handleTop10({ chatId, args: '' })
      } else if (data === 'menu:support') {
        await handleSupportStart({ chatId })
      } else if (data.startsWith('pick:')) {
        const idx = Number(data.slice(5))
        const item = session.context?.results?.[idx]
        if (!item) {
          await api.sendMessage(chatId, 'Esse resultado expirou. Faça uma nova busca.')
        } else {
          const overview = item.overview ? `\n\n${escapeHtml(item.overview.slice(0, 280))}` : ''
          await api.sendMessage(
            chatId,
            `<b>${escapeHtml(item.title)}</b>${item.year ? ` (${escapeHtml(item.year)})` : ''}${overview}`,
            {
              reply_markup: titleActionsKeyboard(idx, {
                premium: isPremiumOrAdmin(session.user.type),
              }),
            },
          )
        }
      } else if (data.startsWith('send:')) {
        const idx = Number(data.slice(5))
        const item = session.context?.results?.[idx]
        if (!item) {
          await api.sendMessage(chatId, 'Esse resultado expirou. Faça uma nova busca.')
        } else {
          const posterUrl = await services.buildPosterUrl(item.posterPath)
          const caption = `<b>${escapeHtml(item.title)}</b>${item.year ? ` (${escapeHtml(item.year)})` : ''}`
          if (posterUrl) {
            await api.sendPhoto(chatId, posterUrl, { caption })
          } else {
            await api.sendMessage(chatId, `${caption}\n\n(sem capa disponível)`)
          }
        }
      } else if (data.startsWith('trailer:')) {
        const idx = Number(data.slice(8))
        const item = session.context?.results?.[idx]
        if (!item) {
          await api.sendMessage(chatId, 'Esse resultado expirou. Faça uma nova busca.')
        } else {
          await sendTrailer({ chatId, session, item })
        }
      } else if (data.startsWith('banner:')) {
        const idx = Number(data.slice(7))
        const item = session.context?.results?.[idx]
        if (!item) {
          await api.sendMessage(chatId, 'Esse resultado expirou. Faça uma nova busca.')
        } else if (!isPremiumOrAdmin(session.user.type)) {
          await api.sendMessage(chatId, premiumUpsell('Banner de título'))
        } else {
          await generateTitleBanner({ chatId, session, item })
        }
      } else if (data.startsWith('fb:refresh:')) {
        const dateIso = data.slice('fb:refresh:'.length)
        await handleFootball({ chatId, args: `atualizar ${dateIso}` })
      } else if (data.startsWith('fb:gen:')) {
        const dateIso = data.slice('fb:gen:'.length)
        await generateFootballBanner({ chatId, session, dateArg: dateIso })
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
    handleLogout,
    handleLoginCommand,
    handleRegisterCommand,
    handlePasswordCommand,
    handleSearchCommand,
    handleHistory,
    handleFootball,
    handleTop10,
    handleSupportStart,
    handleTickets,
    handleCancel,
    handleTextWhileAwaiting,
    handleCallback,
  }
}
