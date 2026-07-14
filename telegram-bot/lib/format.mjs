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

export const formatFootballList = (dateIso, matches, { limit = 40 } = {}) => {
  const list = Array.isArray(matches) ? matches.slice(0, limit) : []
  if (!list.length) {
    return `Nenhum jogo para <b>${escapeHtml(dateIso)}</b>.\nUse /futebol atualizar se for Premium.`
  }
  const lines = list.map((m) => {
    const ch = Array.isArray(m.channels) && m.channels.length ? ` · ${m.channels.slice(0, 2).join(', ')}` : ''
    return `${escapeHtml(m.time)}  ${escapeHtml(m.home)} x ${escapeHtml(m.away)}${escapeHtml(ch)}`
  })
  const more = matches.length > limit ? `\n… +${matches.length - limit} jogos` : ''
  return [
    `<b>Jogos · ${escapeHtml(dateIso)}</b> (${matches.length})`,
    '',
    ...lines,
    more,
    '',
    'Gerar banner PNG: toque em 🖼️ Gerar banner.',
  ]
    .filter((l) => l !== undefined)
    .join('\n')
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
