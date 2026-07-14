/** Formatação de mensagens e teclados inline (PT-BR). */

export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

export const welcomeKeyboard = () => ({
  inline_keyboard: [
    [
      { text: '🔑 Entrar', callback_data: 'auth:login' },
      { text: '✨ Criar conta', callback_data: 'auth:register' },
    ],
    [{ text: '📎 Tenho código da web', callback_data: 'auth:link_help' }],
    [{ text: '❓ Ajuda', callback_data: 'auth:help' }],
  ],
})

export const mainMenuKeyboard = (userType) => {
  const rows = [
    [{ text: '🔍 Buscar título', callback_data: 'menu:search' }],
    [{ text: '📜 Histórico', callback_data: 'menu:history' }],
    [
      { text: '💬 Falar com suporte', callback_data: 'menu:support' },
      { text: '👤 Minha conta', callback_data: 'menu:account' },
    ],
  ]
  if (userType === 'premium' || userType === 'admin') {
    rows.splice(1, 0, [
      { text: '⚽ Jogos do dia', callback_data: 'menu:football' },
      { text: '🏆 Top 10', callback_data: 'menu:top10' },
    ])
  }
  return { inline_keyboard: rows }
}

export const welcomeText = () =>
  [
    '<b>Olá! Bem-vindo ao MediaHub</b>',
    '',
    'Aqui você busca títulos, envia capas, gera artes e acompanha a agenda de jogos — <b>tudo neste chat</b>, sem precisar abrir o site.',
    '',
    'Para começar, escolha uma opção abaixo:',
  ].join('\n')

export const helpText = (userType) => {
  const lines = [
    '<b>Como usar o MediaHub</b>',
    '',
    'Use os botões do /menu ou estes comandos:',
    '',
    '🔑 <b>Conta</b>',
    '/entrar — acessar com e-mail e senha',
    '/cadastrar — criar conta nova',
    '/conta — ver plano e dados',
    '/senha — trocar senha',
    '/sair — sair deste chat',
    '',
    '🎬 <b>Mídia</b>',
    '/buscar &lt;termo&gt; — procurar filme ou série',
    '/historico — suas últimas buscas',
    '',
    '💬 <b>Suporte</b>',
    '/suporte — abrir um chamado',
    '/tickets — ver seus chamados',
  ]
  if (userType === 'premium' || userType === 'admin') {
    lines.push(
      '',
      '⭐ <b>Premium</b>',
      '/futebol — jogos do dia (lista completa)',
      '/futebol gerar — banner PNG dos jogos',
      '/top10 — ranking em banner',
    )
  } else if (!userType) {
    lines.push('', '💡 Depois de entrar, o menu mostra tudo liberado no seu plano.')
  } else {
    lines.push('', '💡 Recursos Premium (jogos, Top 10, banners) liberam no plano Premium — veja /conta.')
  }
  lines.push('', 'Dica: depois de buscar, toque no número do título para capa, trailer ou banner.')
  return lines.join('\n')
}

export const accountText = (user) => {
  const plan =
    user.type === 'admin' ? 'Admin' : user.type === 'premium' ? 'Premium' : 'Free'
  const end = user.subscriptionEnd
    ? new Date(user.subscriptionEnd).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : '—'
  const tips =
    user.type === 'free'
      ? '\n\n💡 Com Premium você libera jogos do dia, Top 10 e banners. Fale com o suporte se quiser migrar.'
      : '\n\nTudo certo — use /menu para continuar.'
  return [
    '<b>👤 Sua conta</b>',
    '',
    `Nome: <b>${escapeHtml(user.name || '—')}</b>`,
    `E-mail: ${escapeHtml(user.email || '—')}`,
    `Plano: <b>${escapeHtml(plan)}</b>`,
    user.type === 'premium' ? `Vencimento: ${escapeHtml(end)}` : '',
    tips,
  ]
    .filter(Boolean)
    .join('\n')
}

export const formatSearchResults = (items) => {
  if (!items.length) {
    return 'Não encontrei nada com esse termo.\nTente outro nome ou use /buscar de novo.'
  }
  const lines = items.map((item, i) => {
    const year = item.year ? ` (${item.year})` : ''
    const kind = item.mediaType === 'tv' ? 'série' : 'filme'
    return `${i + 1}. <b>${escapeHtml(item.title)}</b>${escapeHtml(year)} — <i>${kind}</i>`
  })
  return [
    `Encontrei <b>${items.length}</b> resultado(s):`,
    '',
    ...lines,
    '',
    'Toque no número para ver detalhes e ações.',
  ].join('\n')
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
  rows.push([{ text: '🔍 Nova busca', callback_data: 'menu:search' }, { text: '📋 Menu', callback_data: 'menu:home' }])
  return { inline_keyboard: rows }
}

const formatDateBr = (dateIso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || ''))) return String(dateIso || '')
  const [y, m, d] = String(dateIso).split('-')
  return `${d}/${m}/${y}`
}

/**
 * Formata agenda completa em 1+ mensagens (limite Telegram ~4096).
 * @returns {string[]}
 */
export const formatFootballListChunks = (dateIso, matches, { maxLen = 3500 } = {}) => {
  const list = Array.isArray(matches) ? matches.slice() : []
  if (!list.length) {
    return [
      `Não há jogos cadastrados para <b>${escapeHtml(formatDateBr(dateIso))}</b>.\nSe for Premium, use /futebol atualizar.`,
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
          ? `\n   📡 ${escapeHtml(m.channels.slice(0, 3).join(', '))}`
          : ''
      lines.push(`• ${home} <b>x</b> ${away}${comp}${ch}`)
    }
    lines.push('')
    blocks.push(lines.join('\n'))
  }

  const chunks = []
  let current = header

  const startContinuation = () =>
    `⚽ <b>Jogos</b> (continuação)\n📅 ${escapeHtml(formatDateBr(dateIso))}\n\n`

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
  chunks[chunks.length - 1] = `${chunks[chunks.length - 1].trimEnd()}\n\n🖼 Quer o banner? Use o botão abaixo.`

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

export const titleActionsKeyboard = (index, { premium = false } = {}) => {
  const row1 = [
    { text: '📷 Enviar capa', callback_data: `send:${index}` },
    { text: '🎬 Trailer', callback_data: `trailer:${index}` },
  ]
  const rows = [row1]
  if (premium) {
    rows.push([{ text: '🖼️ Gerar banner', callback_data: `banner:${index}` }])
  }
  rows.push([{ text: '🔍 Nova busca', callback_data: 'menu:search' }, { text: '📋 Menu', callback_data: 'menu:home' }])
  return { inline_keyboard: rows }
}

export const unlinkNeedText = () =>
  [
    'Para usar o bot, preciso saber quem é você.',
    '',
    'Você pode <b>entrar</b> ou <b>criar conta</b> direto daqui — não precisa abrir o site.',
    '',
    'Se preferir, também funciona com o código gerado em Minha Área → Telegram.',
  ].join('\n')

export const linkHelpText = () =>
  [
    '<b>Código da web (opcional)</b>',
    '',
    '1. Abra o MediaHub no navegador → <b>Minha Área → Telegram</b>',
    '2. Gere o código de vínculo',
    '3. Abra o link ou envie aqui: <code>/start link_XXXX</code>',
    '',
    'Ou use /entrar /cadastrar sem sair do Telegram.',
  ].join('\n')

export const premiumUpsell = (featureLabel) =>
  `<b>${escapeHtml(featureLabel)}</b> faz parte do plano Premium.\nVeja seu plano em /conta ou fale com o suporte (/suporte).`
