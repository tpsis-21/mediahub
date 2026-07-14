import { describe, expect, it } from 'vitest'
import { createDispatch } from '../lib/dispatch.mjs'
import { escapeHtml, helpText, formatSearchResults } from '../lib/format.mjs'

describe('telegram-bot format', () => {
  it('escapa HTML', () => {
    expect(escapeHtml('a <b> & c')).toBe('a &lt;b&gt; &amp; c')
  })

  it('ajuda inclui busca', () => {
    expect(helpText('free')).toContain('/buscar')
    expect(helpText('premium')).toContain('/futebol')
  })

  it('formata resultados', () => {
    const text = formatSearchResults([{ title: 'Matrix', year: '1999', mediaType: 'movie' }])
    expect(text).toContain('Matrix')
    expect(text).toContain('1999')
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
      handleLogout: async () => {},
      handleSearchCommand: async (p) => calls.push(['search', p]),
      handleHistory: async () => {},
      handleFootball: async () => {},
      handleTop10: async () => {},
      handleSupportStart: async () => {},
      handleTickets: async () => {},
      handleCancel: async () => {},
      handleTextWhileAwaiting: async () => false,
      handleCallback: async () => {},
    }
    const { handleUpdate, parseCommand } = createDispatch(handlers)
    expect(parseCommand('/buscar Matrix Reloaded')).toEqual({
      cmd: '/buscar',
      args: 'Matrix Reloaded',
    })
    await handleUpdate({
      message: { chat: { id: 1 }, text: '/buscar Matrix' },
    })
    expect(calls[0][0]).toBe('search')
    expect(calls[0][1].args).toBe('Matrix')
  })
})
