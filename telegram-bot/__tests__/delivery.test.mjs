import { describe, expect, it, vi } from 'vitest'
import { createDispatch } from '../lib/dispatch.mjs'
import { createDeliveryHandlers, DELIVERY_BOT_COMMANDS } from '../handlers/delivery.mjs'
import { isTelegramConversationalEnabled } from '../lib/config.mjs'

describe('telegram delivery mode', () => {
  it('comandos delivery são enxutos', () => {
    expect(DELIVERY_BOT_COMMANDS.map((c) => c.command)).toEqual(['start', 'ajuda', 'sair'])
  })

  it('conversational fica off por padrão', () => {
    expect(isTelegramConversationalEnabled()).toBe(false)
  })

  it('/start link_ consome pairing e ack', async () => {
    const sent = []
    const api = {
      sendMessage: async (chatId, text) => {
        sent.push({ chatId, text })
      },
      answerCallbackQuery: async () => {},
    }
    const pairing = {
      normalizeCode: (raw) => String(raw || '').replace(/^LINK[_-]?/i, '').toUpperCase(),
      consumeLinkCode: async () => ({
        ok: true,
        userId: 'u1',
        name: 'Ana',
        email: 'a@b.com',
      }),
      linkChatToUser: vi.fn(async () => {}),
      unlinkChat: vi.fn(async () => {}),
    }
    const sessions = {
      getByChatId: async () => ({
        user: { name: 'Ana', email: 'a@b.com' },
      }),
      ensureFromUserChatId: async () => null,
      remove: async () => {},
    }
    const handlers = createDeliveryHandlers({ api, sessions, pairing })
    const { handleUpdate } = createDispatch(handlers)
    await handleUpdate({
      message: { chat: { id: 99 }, text: '/start link_ABCD' },
    })
    expect(pairing.linkChatToUser).toHaveBeenCalled()
    expect(sent[0].text).toContain('vinculada')
  })

  it('texto livre aponta para a web', async () => {
    const sent = []
    const handlers = createDeliveryHandlers({
      api: { sendMessage: async (_c, text) => sent.push(text) },
      sessions: {
        getByChatId: async () => null,
        ensureFromUserChatId: async () => null,
      },
      pairing: { normalizeCode: () => '', unlinkChat: async () => {} },
    })
    const { handleUpdate } = createDispatch(handlers)
    await handleUpdate({ message: { chat: { id: 1 }, text: 'buscar matrix' } })
    expect(sent.join('\n')).toContain('interface web')
  })
})
