import { isPremiumOrAdmin } from '../lib/config.mjs'
import {
  accountText,
  escapeHtml,
  footballKeyboard,
  formatFootballListChunks,
  formatSearchResults,
  helpText,
  mainMenuKeyboard,
  searchPickKeyboard,
  titleActionsKeyboard,
  unlinkNeedText,
} from '../lib/format.mjs'

/**
 * @param {object} ctx
 */
export const createHandlers = (ctx) => {
  const { api, sessions, pairing, services, banners } = ctx

  const requireSession = async (chatId) => {
    const session = await sessions.getByChatId(chatId)
    if (!session) {
      await api.sendMessage(chatId, unlinkNeedText())
      return null
    }
    return session
  }

  const handleStart = async ({ chatId, payload }) => {
    const raw = String(payload || '').trim()
    if (/^link[_-]/i.test(raw) || pairing.normalizeCode(raw)) {
      const code = pairing.normalizeCode(raw.replace(/^link[_-]/i, ''))
      const consumed = await pairing.consumeLinkCode(code)
      if (!consumed.ok) {
        const map = {
          expired: 'Código expirado. Gere outro na Minha Área.',
          not_found: 'Código inválido.',
          inactive: 'Conta inativa.',
          invalid: 'Código inválido.',
        }
        await api.sendMessage(chatId, map[consumed.reason] || 'Não foi possível vincular.')
        return
      }
      await pairing.linkChatToUser({ chatId, userId: consumed.userId })
      const session = await sessions.getByChatId(chatId)
      await api.sendMessage(
        chatId,
        `Conta vinculada: <b>${escapeHtml(consumed.name || consumed.email)}</b>.\nUse /menu para começar.`,
        { reply_markup: mainMenuKeyboard(session?.user?.type) },
      )
      return
    }

    const session = await sessions.getByChatId(chatId)
    if (session) {
      await api.sendMessage(chatId, `Bem-vindo de volta, <b>${escapeHtml(session.user.name || session.user.email)}</b>!`, {
        reply_markup: mainMenuKeyboard(session.user.type),
      })
      return
    }
    // Fallback: perfil já tem chat_id (Minha Área) mas ainda sem sessão conversacional
    const ensured = await sessions.ensureFromUserChatId(chatId)
    if (ensured) {
      await api.sendMessage(
        chatId,
        `Conta reconhecida: <b>${escapeHtml(ensured.user.name || ensured.user.email)}</b>.\nUse /menu para começar.`,
        { reply_markup: mainMenuKeyboard(ensured.user.type) },
      )
      return
    }
    await api.sendMessage(chatId, unlinkNeedText())
  }

  const handleHelp = async ({ chatId }) => {
    const session = await sessions.getByChatId(chatId)
    await api.sendMessage(chatId, helpText(session?.user?.type))
  }

  const handleMenu = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    await api.sendMessage(chatId, 'Escolha uma opção:', {
      reply_markup: mainMenuKeyboard(session.user.type),
    })
  }

  const handleAccount = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    await api.sendMessage(chatId, accountText(session.user))
  }

  const handleLogout = async ({ chatId }) => {
    await sessions.remove(chatId)
    await api.sendMessage(
      chatId,
      'Chat desvinculado da sessão do bot.\nO destino de envio na web (chat_id) permanece até você limpar na Minha Área.\nPara vincular de novo, use um novo código.',
    )
  }

  const runSearch = async ({ chatId, session, queryText }) => {
    const q = String(queryText || '').trim().slice(0, 120)
    if (!q) {
      await sessions.patch(chatId, { state: 'awaiting_search' })
      await api.sendMessage(chatId, 'Envie o termo de busca (filme ou série):')
      return
    }
    await api.sendMessage(chatId, `Buscando <b>${escapeHtml(q)}</b>…`)
    const result = await services.searchTitles({ userId: session.userId, queryText: q })
    if (!result.ok) {
      await api.sendMessage(chatId, result.message || 'Falha na busca.')
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
      await api.sendMessage(chatId, 'Histórico vazio.')
      return
    }
    const lines = rows.map(
      (r, i) =>
        `${i + 1}. ${escapeHtml(r.query)} <i>(${new Date(Number(r.timestamp)).toLocaleString('pt-BR')})</i>`,
    )
    await api.sendMessage(chatId, ['<b>Últimas buscas</b>', '', ...lines].join('\n'))
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
      await api.sendMessage(chatId, 'Jogos do dia é exclusivo Premium. Veja /conta.')
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
      await api.sendMessage(chatId, 'Atualizando agenda…')
      try {
        const { date, matches } = await services.refreshFootball(dateArg)
        await sendFootballScheduleMessages(chatId, date, matches)
      } catch (e) {
        console.error('[telegram-bot] football refresh', e)
        await api.sendMessage(chatId, 'Não foi possível atualizar a agenda agora.')
      }
      return
    }

    try {
      const { date, matches } = await services.getFootballSchedule(dateArg)
      await sendFootballScheduleMessages(chatId, date, matches)
    } catch (e) {
      console.error('[telegram-bot] football', e)
      await api.sendMessage(chatId, 'Não foi possível carregar os jogos.')
    }
  }

  const generateFootballBanner = async ({ chatId, session, dateArg }) => {
    if (!banners?.renderFootballBanner || !api.sendPhotoBuffer) {
      await api.sendMessage(chatId, 'Geração de banner indisponível neste servidor.')
      return
    }
    await api.sendMessage(chatId, 'Gerando banner dos jogos…')
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
      await api.sendMessage(chatId, 'Falha ao gerar o banner. Tente de novo em instantes.')
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

  const handleTop10 = async ({ chatId, args }) => {
    const session = await requireSession(chatId)
    if (!session) return
    if (!isPremiumOrAdmin(session.user.type)) {
      await api.sendMessage(chatId, 'Top 10 é exclusivo Premium. Veja /conta.')
      return
    }
    if (!banners?.renderTop10Banner || !api.sendPhotoBuffer) {
      await api.sendMessage(chatId, 'Geração de banner indisponível neste servidor.')
      return
    }
    const raw = String(args || '').trim().toLowerCase()
    const mediaType = raw === 'filme' || raw === 'movie' ? 'movie' : raw === 'serie' || raw === 'série' || raw === 'tv' ? 'tv' : 'all'
    const label = mediaType === 'movie' ? 'Top 10 Filmes' : mediaType === 'tv' ? 'Top 10 Séries' : 'Top 10'
    await api.sendMessage(chatId, `Gerando ${label}…`)
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
      await api.sendMessage(chatId, 'Falha ao gerar o Top 10.')
    }
  }

  const handleSupportStart = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    await sessions.patch(chatId, { state: 'awaiting_ticket_subject', context: {}, mergeContext: false })
    await api.sendMessage(chatId, 'Digite o <b>assunto</b> do chamado (ou /cancelar):')
  }

  const handleTickets = async ({ chatId }) => {
    const session = await requireSession(chatId)
    if (!session) return
    const rows = await services.listTickets(session.userId)
    if (!rows.length) {
      await api.sendMessage(chatId, 'Nenhum chamado. Use /suporte para abrir.')
      return
    }
    const lines = rows.map(
      (t) => `#${t.id} · ${escapeHtml(t.status)} · <b>${escapeHtml(t.subject)}</b>`,
    )
    await api.sendMessage(chatId, ['<b>Seus chamados</b>', '', ...lines].join('\n'))
  }

  const handleCancel = async ({ chatId }) => {
    const session = await sessions.getByChatId(chatId)
    if (!session) {
      await api.sendMessage(chatId, 'Nada para cancelar.')
      return
    }
    await sessions.patch(chatId, { state: 'linked', context: {}, mergeContext: false })
    await api.sendMessage(chatId, 'Fluxo cancelado.', { reply_markup: mainMenuKeyboard(session.user.type) })
  }

  const handleTextWhileAwaiting = async ({ chatId, text }) => {
    const session = await sessions.getByChatId(chatId)
    if (!session) {
      await api.sendMessage(chatId, unlinkNeedText())
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
      await api.sendMessage(chatId, 'Agora envie a <b>mensagem</b> do chamado:')
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
      await api.sendMessage(chatId, `Chamado <b>#${created.id}</b> aberto. Obrigado!`)
      return true
    }

    return false
  }

  const handleCallback = async ({ chatId, data, callbackQueryId }) => {
    const session = await requireSession(chatId)
    if (!session) {
      await api.answerCallbackQuery(callbackQueryId)
      return
    }

    try {
      if (data === 'menu:home' || data === 'menu:account') {
        if (data === 'menu:account') await handleAccount({ chatId })
        else await handleMenu({ chatId })
      } else if (data === 'menu:search') {
        await sessions.patch(chatId, { state: 'awaiting_search' })
        await api.sendMessage(chatId, 'Envie o termo de busca:')
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
          await api.sendMessage(chatId, 'Resultado expirado. Busque de novo.')
        } else {
          const overview = item.overview ? `\n\n${escapeHtml(item.overview.slice(0, 280))}` : ''
          await api.sendMessage(
            chatId,
            `<b>${escapeHtml(item.title)}</b>${item.year ? ` (${escapeHtml(item.year)})` : ''}${overview}`,
            { reply_markup: titleActionsKeyboard(idx) },
          )
        }
      } else if (data.startsWith('send:')) {
        const idx = Number(data.slice(5))
        const item = session.context?.results?.[idx]
        if (!item) {
          await api.sendMessage(chatId, 'Resultado expirado. Busque de novo.')
        } else {
          const posterUrl = await services.buildPosterUrl(item.posterPath)
          const caption = `<b>${escapeHtml(item.title)}</b>${item.year ? ` (${escapeHtml(item.year)})` : ''}`
          if (posterUrl) {
            await api.sendPhoto(chatId, posterUrl, { caption })
          } else {
            await api.sendMessage(chatId, `${caption}\n(sem capa disponível)`)
          }
        }
      } else if (data.startsWith('banner:')) {
        const idx = Number(data.slice(7))
        const item = session.context?.results?.[idx]
        if (!item) {
          await api.sendMessage(chatId, 'Resultado expirado. Busque de novo.')
        } else if (!isPremiumOrAdmin(session.user.type)) {
          await api.sendMessage(chatId, 'Banner de título é exclusivo Premium. Veja /conta.')
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
