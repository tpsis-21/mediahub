/** Formatação de mensagens e teclados inline (PT-BR). */

export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

export const mainMenuKeyboard = (userType) => {
  const rows = [
    [{ text: '🔍 Buscar', callback_data: 'menu:search' }],
    [{ text: '📜 Histórico', callback_data: 'menu:history' }],
    [{ text: '🎫 Suporte', callback_data: 'menu:support' }, { text: '👤 Conta', callback_data: 'menu:account' }],
  ]
  if (userType === 'premium' || userType === 'admin') {
    rows.splice(1, 0, [
      { text: '⚽ Jogos do dia', callback_data: 'menu:football' },
      { text: '🏆 Top 10', callback_data: 'menu:top10' },
    ])
  }
  return { inline_keyboard: rows }
}

export const helpText = (userType) => {
  const lines = [
    '<b>MediaHub — comandos</b>',
    '',
    '/menu — atalhos',
    '/buscar &lt;termo&gt; — procurar título',
    '/historico — últimas buscas',
    '/conta — plano e vínculo',
    '/suporte — abrir chamado',
    '/tickets — meus chamados',
    '/sair — desvincular este chat',
    '/ajuda — esta mensagem',
  ]
  if (userType === 'premium' || userType === 'admin') {
    lines.splice(
      5,
      0,
      '/futebol [AAAA-MM-DD] — jogos do dia',
      '/futebol gerar — banner PNG dos jogos',
      '/top10 [filme|serie|all] — ranking em banner',
    )
  }
  lines.push('', 'Após buscar, use 🖼️ Banner no título escolhido.')
  return lines.join('\n')
}

export const accountText = (user) => {
  const plan =
    user.type === 'admin' ? 'Admin' : user.type === 'premium' ? 'Premium' : 'Free'
  const end = user.subscriptionEnd
    ? new Date(user.subscriptionEnd).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : '—'
  return [
    '<b>Sua conta</b>',
    `Nome: ${escapeHtml(user.name || '—')}`,
    `E-mail: ${escapeHtml(user.email || '—')}`,
    `Plano: <b>${escapeHtml(plan)}</b>`,
    user.type === 'premium' ? `Vencimento: ${escapeHtml(end)}` : '',
    `Chat vinculado: <code>${escapeHtml(user.telegramChatId || 'este')}</code>`,
  ]
    .filter(Boolean)
    .join('\n')
}

export const formatSearchResults = (items) => {
  if (!items.length) return 'Nenhum resultado. Tente outro termo.'
  const lines = items.map((item, i) => {
    const year = item.year ? ` (${item.year})` : ''
    const kind = item.mediaType === 'tv' ? 'série' : 'filme'
    return `${i + 1}. <b>${escapeHtml(item.title)}</b>${escapeHtml(year)} — ${kind}`
  })
  return ['<b>Resultados</b>', '', ...lines, '', 'Toque em um número para ver detalhes.'].join('\n')
}

export const searchPickKeyboard = (count) => {
  const buttons = []
  for (let i = 0; i < count; i += 1) {
    buttons.push({ text: String(i + 1), callback_data: `pick:${i}` })
  }
  const rows = []
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(buttons.slice(i, i + 5))
  }
  return { inline_keyboard: rows }
}

/**
 * Formata agenda completa em 1+ mensagens (limite Telegram ~4096).
 * Agrupa por horário.
 * @returns {string[]}
 */
const formatDateBr = (dateIso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || ''))) return String(dateIso || '')
  const [y, m, d] = String(dateIso).split('-')
  return `${d}/${m}/${y}`
}

export const formatFootballListChunks = (dateIso, matches, { maxLen = 3500 } = {}) => {
  const list = Array.isArray(matches) ? matches.slice() : []
  if (!list.length) {
    return [
      `Nenhum jogo para <b>${escapeHtml(formatDateBr(dateIso))}</b>.\nUse /futebol atualizar se for Premium.`,
    ]
  }

  list.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))

  const byTime = new Map()
  for (const m of list) {
    const t = String(m.time || '--:--').trim() || '--:--'
    if (!byTime.has(t)) byTime.set(t, [])
    byTime.get(t).push(m)
  }

  const header = [
    `⚽ <b>Jogos do dia</b>`,
    `📅 ${escapeHtml(formatDateBr(dateIso))} · <b>${list.length}</b> confronto(s)`,
    '',
  ].join('\n')

  const blocks = []
  for (const [time, items] of byTime) {
    const lines = [`⏱ <b>${escapeHtml(time)}</b>`]
    for (const m of items) {
      const home = escapeHtml(String(m.home || '').trim())
      const away = escapeHtml(String(m.away || '').trim())
      const comp =
        typeof m.competition === 'string' && m.competition.trim()
          ? `\n   <i>${escapeHtml(m.competition.trim())}</i>`
          : ''
      const ch =
        Array.isArray(m.channels) && m.channels.length
          ? `\n   📺 ${escapeHtml(m.channels.slice(0, 3).join(', '))}`
          : ''
      lines.push(`• ${home} <b>x</b> ${away}${comp}${ch}`)
    }
    lines.push('')
    blocks.push(lines.join('\n'))
  }

  const chunks = []
  let current = header

  const startContinuation = () =>
    `⚽ <b>Jogos</b> (cont.)\n📅 ${escapeHtml(formatDateBr(dateIso))}\n\n`

  for (const block of blocks) {
    if (current.length + block.length > maxLen && current.length > header.length) {
      chunks.push(current.trimEnd())
      current = startContinuation()
    }
    if (block.length > maxLen) {
      const lines = block.split('\n')
      for (const line of lines) {
        if (current.length + line.length + 1 > maxLen) {
          chunks.push(current.trimEnd())
          current = startContinuation()
        }
        current += `${line}\n`
      }
      continue
    }
    current += block
  }

  if (current.trim()) {
    chunks.push(current.trimEnd())
  }

  const total = chunks.length
  if (total > 1) {
    for (let i = 0; i < total; i += 1) {
      chunks[i] = `${chunks[i].trimEnd()}\n\n📄 Parte ${i + 1}/${total}`
    }
  }
  chunks[chunks.length - 1] = `${chunks[chunks.length - 1].trimEnd()}\n\n🖼 Banner PNG: use o botão abaixo.`

  return chunks
}

/** Compat: junta todos os chunks (testes / debug). */
export const formatFootballList = (dateIso, matches, opts = {}) => {
  const chunks = formatFootballListChunks(dateIso, matches, opts)
  return chunks.join('\n\n———\n\n')
}

export const footballKeyboard = (dateIso) => ({
  inline_keyboard: [
    [
      { text: '🔄 Atualizar', callback_data: `fb:refresh:${dateIso}` },
      { text: '🖼️ Gerar banner', callback_data: `fb:gen:${dateIso}` },
    ],
    [{ text: '📋 Menu', callback_data: 'menu:home' }],
  ],
})

export const titleActionsKeyboard = (index) => ({
  inline_keyboard: [
    [
      { text: '📷 Enviar capa', callback_data: `send:${index}` },
      { text: '🖼️ Banner', callback_data: `banner:${index}` },
    ],
    [{ text: '◀️ Voltar', callback_data: 'menu:search' }],
  ],
})

export const unlinkNeedText = () =>
  [
    'Olá! Para usar o MediaHub neste chat, vincule sua conta.',
    '',
    '1. Abra a web → <b>Minha Área → Telegram</b>',
    '2. Toque em <b>Gerar código de vínculo</b>',
    '3. Abra o link ou envie aqui: <code>/start link_XXXX</code>',
  ].join('\n')
