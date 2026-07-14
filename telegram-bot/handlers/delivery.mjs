/**
 * Handlers do modo delivery: vínculo + desvínculo.
 * Conteúdo (capas/banners/vídeos) é enviado pela web via /api/telegram/send*.
 */
import { getAppUrl } from '../lib/config.mjs'
import { escapeHtml } from '../lib/format.mjs'

const tipText = () => {
  const app = getAppUrl()
  const where = app
    ? `Abra o MediaHub: ${escapeHtml(app)}`
    : 'Abra o MediaHub no navegador (Minha Área → Telegram).'
  return [
    '<b>MediaHub · entrega no Telegram</b>',
    '',
    'Este chat recebe capas, banners e arquivos quando você solicitar o envio no site.',
    'Busca, planos, marca e suporte ficam na interface web.',
    '',
    where,
    '',
    'Para vincular: use <b>Gerar código</b> na Minha Área e abra o link do bot.',
    'Para desvincular: /sair',
  ].join('\n')
}

const linkedText = (user, { justLinked = false } = {}) => {
  const name = escapeHtml(user?.name || user?.email || 'você')
  return [
    '<b>MediaHub</b>',
    '',
    justLinked ? `Conta vinculada. Olá, <b>${name}</b>.` : `Já vinculado. Olá, <b>${name}</b>.`,
    '',
    'Pode voltar ao site e usar <b>Enviar no Telegram</b>.',
    'Os conteúdos solicitados chegam neste chat.',
    '',
    tipText().split('\n').slice(4).join('\n'),
  ].join('\n')
}

export const createDeliveryHandlers = ({ api, sessions, pairing }) => {
  const replyTip = async (chatId) => {
    await api.sendMessage(chatId, tipText(), {
      reply_markup: { remove_keyboard: true },
      disable_web_page_preview: false,
    })
  }

  const handleStart = async ({ chatId, payload }) => {
    const raw = String(payload || '').trim()
    if (/^link[_-]/i.test(raw) || pairing.normalizeCode(raw)) {
      const code = pairing.normalizeCode(raw.replace(/^link[_-]/i, ''))
      const consumed = await pairing.consumeLinkCode(code)
      if (!consumed.ok) {
        const map = {
          expired: 'Código expirado. Gere outro na Minha Área do site.',
          not_found: 'Código não encontrado. Gere outro na Minha Área.',
          inactive: 'Conta inativa. Fale com o suporte no site.',
          invalid: 'Código inválido.',
        }
        await api.sendMessage(chatId, map[consumed.reason] || 'Não foi possível vincular.', {
          reply_markup: { remove_keyboard: true },
        })
        return
      }
      await pairing.linkChatToUser({ chatId, userId: consumed.userId })
      const session = await sessions.getByChatId(chatId)
      await api.sendMessage(chatId, linkedText(session?.user || consumed, { justLinked: true }), {
        reply_markup: { remove_keyboard: true },
      })
      return
    }

    const session = (await sessions.getByChatId(chatId)) || (await sessions.ensureFromUserChatId(chatId))
    if (session) {
      await api.sendMessage(chatId, linkedText(session.user), {
        reply_markup: { remove_keyboard: true },
      })
      return
    }
    await replyTip(chatId)
  }

  const handleLogout = async ({ chatId }) => {
    if (typeof pairing.unlinkChat === 'function') {
      await pairing.unlinkChat({ chatId })
    } else {
      await sessions.remove(chatId)
    }
    await api.sendMessage(
      chatId,
      [
        '<b>Telegram desvinculado</b>',
        '',
        'Este chat não recebe mais envios da sua conta.',
        'Para voltar a receber, gere um novo código na Minha Área do site.',
      ].join('\n'),
      { reply_markup: { remove_keyboard: true } },
    )
  }

  const noopHint = async ({ chatId }) => replyTip(chatId)

  const handleCallback = async ({ chatId, callbackQueryId }) => {
    try {
      await api.answerCallbackQuery(callbackQueryId)
    } catch {
      /* noop */
    }
    await replyTip(chatId)
  }

  const handleTextWhileAwaiting = async ({ chatId }) => {
    await replyTip(chatId)
    return true
  }

  const handleNavAction = async ({ chatId }) => {
    await replyTip(chatId)
    return true
  }

  const handlePhoto = async () => false

  return {
    handleStart,
    handleHelp: noopHint,
    handleMenu: noopHint,
    handleAccount: noopHint,
    handlePlans: noopHint,
    handleLogout,
    handleLoginCommand: noopHint,
    handleRegisterCommand: noopHint,
    handlePasswordCommand: noopHint,
    handleRecoverCommand: noopHint,
    handleBrandCommand: noopHint,
    handleSearchCommand: noopHint,
    handleHistory: noopHint,
    handleFootball: noopHint,
    handleTop10: noopHint,
    handleSupportStart: noopHint,
    handleSupportHub: noopHint,
    handleTickets: noopHint,
    handleAdminTickets: noopHint,
    handleAdminCommand: noopHint,
    handleCancel: noopHint,
    handleTextWhileAwaiting,
    handleNavAction,
    handleCallback,
    handlePhoto,
  }
}

/** Comandos exibidos no BotFather / setMyCommands (modo delivery). */
export const DELIVERY_BOT_COMMANDS = [
  { command: 'start', description: 'Status do vínculo / início' },
  { command: 'ajuda', description: 'Como receber envios do site' },
  { command: 'sair', description: 'Desvincular este chat' },
]
