/**
 * Roteia Updates do Telegram para handlers.
 */
import { resolveNavAction } from './format.mjs'

export const createDispatch = (handlers) => {
  const parseCommand = (text) => {
    const raw = String(text || '').trim()
    if (!raw.startsWith('/')) return null
    const [cmdPart, ...rest] = raw.split(/\s+/)
    const cmd = cmdPart.replace(/@\w+$/i, '').toLowerCase()
    return { cmd, args: rest.join(' ').trim() }
  }

  const handleUpdate = async (update) => {
    if (!update || typeof update !== 'object') return

    if (update.callback_query) {
      const cq = update.callback_query
      const chatId = cq.message?.chat?.id
      if (chatId == null) return
      await handlers.handleCallback({
        chatId: String(chatId),
        data: String(cq.data || ''),
        callbackQueryId: String(cq.id),
      })
      return
    }

    const message = update.message || update.edited_message
    if (!message?.chat?.id) return
    const chatId = String(message.chat.id)
    const text = typeof message.text === 'string' ? message.text : ''
    const messageId = message.message_id

    if (Array.isArray(message.photo) && message.photo.length && typeof handlers.handlePhoto === 'function') {
      const best = message.photo[message.photo.length - 1]
      const consumed = await handlers.handlePhoto({
        chatId,
        fileId: best?.file_id,
      })
      if (consumed) return
    }

    if (!text) {
      return
    }

    const command = parseCommand(text)
    if (command) {
      switch (command.cmd) {
        case '/start':
          await handlers.handleStart({ chatId, payload: command.args })
          return
        case '/ajuda':
        case '/help':
          await handlers.handleHelp({ chatId })
          return
        case '/menu':
          await handlers.handleMenu({ chatId })
          return
        case '/conta':
        case '/account':
          await handlers.handleAccount({ chatId })
          return
        case '/marca':
        case '/brand':
          await handlers.handleBrandCommand({ chatId })
          return
        case '/planos':
        case '/plans':
          await handlers.handlePlans({ chatId })
          return
        case '/entrar':
        case '/login':
          await handlers.handleLoginCommand({ chatId })
          return
        case '/cadastrar':
        case '/register':
          await handlers.handleRegisterCommand({ chatId })
          return
        case '/recuperar':
        case '/recover':
        case '/esquecisenha':
          await handlers.handleRecoverCommand({ chatId })
          return
        case '/senha':
        case '/password':
          await handlers.handlePasswordCommand({ chatId })
          return
        case '/sair':
        case '/logout':
          await handlers.handleLogout({ chatId })
          return
        case '/buscar':
        case '/search':
          await handlers.handleSearchCommand({ chatId, args: command.args })
          return
        case '/historico':
        case '/history':
          await handlers.handleHistory({ chatId })
          return
        case '/futebol':
        case '/football':
          await handlers.handleFootball({ chatId, args: command.args })
          return
        case '/top10':
        case '/ranking':
          await handlers.handleTop10({ chatId, args: command.args })
          return
        case '/suporte':
        case '/support':
          await handlers.handleSupportHub({ chatId })
          return
        case '/tickets':
          await handlers.handleTickets({ chatId })
          return
        case '/admin':
          await handlers.handleAdminCommand({ chatId, args: command.args })
          return
        case '/cancelar':
        case '/cancel':
          await handlers.handleCancel({ chatId })
          return
        default:
          await handlers.handleHelp({ chatId })
          return
      }
    }

    const nav = resolveNavAction(text)
    if (nav && typeof handlers.handleNavAction === 'function') {
      const consumedNav = await handlers.handleNavAction({ chatId, action: nav })
      if (consumedNav) return
    }

    const consumed = await handlers.handleTextWhileAwaiting({ chatId, text, messageId })
    if (!consumed) {
      await handlers.handleMenu({ chatId })
    }
  }

  return { handleUpdate, parseCommand }
}
