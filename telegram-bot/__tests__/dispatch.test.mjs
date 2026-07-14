import { describe, expect, it } from 'vitest'
import { createDispatch } from '../lib/dispatch.mjs'
import {
  escapeHtml,
  helpText,
  formatSearchResults,
  formatFootballListChunks,
  welcomeText,
  plansText,
  mainMenuKeyboard,
  resolveNavAction,
  NAV,
} from '../lib/format.mjs'

describe('telegram-bot format', () => {
  it('escapa HTML', () => {
    expect(escapeHtml('a <b> & c')).toBe('a &lt;b&gt; &amp; c')
  })

  it('ajuda inclui entrada sem web', () => {
    expect(helpText(null)).toContain('/entrar')
    expect(helpText(null)).toContain('/cadastrar')
    expect(helpText('free')).toContain('/buscar')
    expect(helpText('premium')).toContain('/futebol')
  })

  it('boas-vindas profissional e planos', () => {
    expect(welcomeText()).toContain('MediaHub')
    expect(welcomeText()).toContain('Free')
    expect(plansText('free')).toContain('Premium')
    expect(plansText('free')).toContain('administrador')
  })

  it('menu tem seções e botão de suporte hub', () => {
    const kb = mainMenuKeyboard('free')
    const flat = kb.inline_keyboard.flat().map((b) => b.callback_data)
    expect(flat).toContain('menu:search')
    expect(flat).toContain('menu:support_hub')
    expect(flat).toContain('menu:locked:football')
    expect(resolveNavAction(NAV.MENU)).toBe('menu')
    expect(resolveNavAction(NAV.SEARCH)).toBe('search')
  })

  it('histórico resume lote e formata datas', () => {
    const bulk = [
      '🥇 Superman (2025)',
      '🥈 F1 (2025)',
      '🥉 How to Train Your Dragon (2025)',
    ].join('\n')
    const text = historyText([
      { query: 'michael', timestamp: Date.parse('2026-07-14T02:20:19Z'), type: 'individual' },
      { query: bulk, timestamp: Date.parse('2026-03-21T16:19:04Z'), type: 'bulk' },
    ])
    expect(text).toContain('michael')
    expect(text).toContain('Lista em lote')
    expect(text).not.toContain('🥇')
    expect(text).toContain('Toque no número')
    const kb = historyKeyboard(2)
    expect(kb.inline_keyboard[0].map((b) => b.callback_data)).toEqual(['hist:0', 'hist:1'])
  })

  it('lista todos os jogos em chunks', () => {
    const matches = Array.from({ length: 80 }, (_, i) => ({
      time: `${String(10 + (i % 10)).padStart(2, '0')}:00`,
      home: `Casa ${i}`,
      away: `Fora ${i}`,
      competition: i % 3 === 0 ? 'Copa Teste' : '',
    }))
    const chunks = formatFootballListChunks('2026-07-14', matches, { maxLen: 1200 })
    expect(chunks.length).toBeGreaterThan(1)
    const joined = chunks.join('\n')
    expect(joined).toContain('80')
    expect(joined).toContain('Casa 79')
    expect(joined).not.toMatch(/\+\d+ jogos/)
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(4096)
    }
  })
})

describe('telegram-bot dispatch parse', () => {
  it('parseia comando com args', async () => {
    const calls = []
    const handlers = {
      handleStart: async (p) => calls.push(['start', p]),
      handleHelp: async () => {},
      handleMenu: async () => {},
      handleAccount: async () => {},
      handlePlans: async () => {},
      handleLogout: async () => {},
      handleLoginCommand: async () => {},
      handleRegisterCommand: async () => {},
      handlePasswordCommand: async () => {},
      handleSearchCommand: async (p) => calls.push(['search', p]),
      handleHistory: async () => {},
      handleFootball: async () => {},
      handleTop10: async () => {},
      handleSupportStart: async () => {},
      handleTickets: async () => {},
      handleCancel: async () => {},
      handleTextWhileAwaiting: async () => false,
      handleNavAction: async () => false,
      handleCallback: async () => {},
    }
    const { handleUpdate, parseCommand } = createDispatch(handlers)
    expect(parseCommand('/buscar Matrix Reloaded')).toEqual({
      cmd: '/buscar',
      args: 'Matrix Reloaded',
    })
    expect(parseCommand('/entrar')).toEqual({ cmd: '/entrar', args: '' })
    await handleUpdate({
      message: { chat: { id: 1 }, text: '/buscar Matrix' },
    })
    expect(calls[0][0]).toBe('search')
    expect(calls[0][1].args).toBe('Matrix')
  })
})
