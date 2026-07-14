/** Formatação de mensagens e teclados inline (PT-BR) — tom profissional. */

export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

export const planLabel = (userType) => {
  if (userType === 'admin') return 'Admin'
  if (userType === 'premium') return 'Premium'
  if (userType === 'free') return 'Free'
  return 'Visitante'
}

export const welcomeKeyboard = () => ({
  inline_keyboard: [
    [
      { text: 'Entrar', callback_data: 'auth:login' },
      { text: 'Criar conta', callback_data: 'auth:register' },
    ],
    [{ text: 'Ver planos', callback_data: 'auth:plans' }],
    [{ text: 'Código da web', callback_data: 'auth:link_help' }],
    [{ text: 'Ajuda', callback_data: 'auth:help' }],
  ],
})

export const mainMenuKeyboard = (userType) => {
  const premium = userType === 'premium' || userType === 'admin'
  const rows = [
    [{ text: 'Buscar título', callback_data: 'menu:search' }],
    premium
      ? [
          { text: 'Jogos do dia', callback_data: 'menu:football' },
          { text: 'Top 10', callback_data: 'menu:top10' },
        ]
      : [
          { text: 'Jogos do dia 🔒', callback_data: 'menu:locked:football' },
          { text: 'Top 10 🔒', callback_data: 'menu:locked:top10' },
        ],
    [{ text: 'Histórico', callback_data: 'menu:history' }],
    [
      { text: 'Planos', callback_data: 'menu:plans' },
      { text: 'Minha conta', callback_data: 'menu:account' },
    ],
    [{ text: 'Suporte', callback_data: 'menu:support' }],
  ]
  return { inline_keyboard: rows }
}

export const accountKeyboard = (userType) => {
  const rows = [
    [{ text: 'Ver planos', callback_data: 'menu:plans' }, { text: 'Menu', callback_data: 'menu:home' }],
  ]
  if (userType === 'free') {
    rows.unshift([{ text: 'Solicitar Premium', callback_data: 'menu:support' }])
  }
  return { inline_keyboard: rows }
}

export const welcomeText = () =>
  [
    '<b>MediaHub</b>',
    '<i>Assistente de conteúdo para o seu negócio</i>',
    '',
    'Bem-vindo. Por aqui você organiza buscas, capas, artes e a agenda de jogos — <b>sem precisar abrir o site</b>.',
    '',
    '<b>O que você pode fazer</b>',
    '• Buscar títulos e enviar capas',
    '• Receber trailer de um título',
    '• Gerar banners e Top 10 <i>(Premium)</i>',
    '• Consultar a lista completa de jogos <i>(Premium)</i>',
    '• Abrir chamados de suporte',
    '',
    'Para continuar, entre na sua conta ou crie uma nova.',
    'Cadastros novos começam no plano <b>Free</b>.',
  ].join('\n')

export const linkedWelcomeText = (user, { justLinked = false } = {}) => {
  const name = escapeHtml(user.name || user.email || 'você')
  const plan = planLabel(user.type)
  const greeting = justLinked
    ? `Conta conectada com sucesso.`
    : `Bem-vindo de volta.`

  const planLine =
    user.type === 'premium'
      ? `Plano atual: <b>Premium</b>${user.subscriptionEnd ? ` · até ${escapeHtml(formatDateTimeBr(user.subscriptionEnd))}` : ''}`
      : user.type === 'admin'
        ? 'Acesso: <b>Admin</b>'
        : 'Plano atual: <b>Free</b> · buscas com limite diário'

  const next =
    user.type === 'free'
      ? 'Use o menu abaixo. Recursos com 🔒 pedem Premium — veja em Planos.'
      : 'Use o menu abaixo para começar.'

  return [
    `<b>MediaHub</b>`,
    '',
    `${greeting} Olá, <b>${name}</b>.`,
    planLine,
    '',
    next,
  ].join('\n')
}

export const helpText = (userType) => {
  const lines = [
    '<b>Central de ajuda — MediaHub</b>',
    '',
    'Navegue pelos botões do /menu ou use os comandos:',
    '',
    '<b>Conta</b>',
    '/entrar — acessar com e-mail e senha',
    '/cadastrar — criar conta (plano Free)',
    '/conta — dados e plano',
    '/planos — o que cada plano libera',
    '/senha — alterar senha',
    '/sair — desconectar este chat',
    '',
    '<b>Operação</b>',
    '/buscar &lt;termo&gt; — filme ou série',
    '/historico — últimas buscas',
    '/suporte — abrir chamado',
    '/tickets — meus chamados',
  ]
  if (userType === 'premium' || userType === 'admin') {
    lines.push(
      '',
      '<b>Premium</b>',
      '/futebol — agenda completa do dia',
      '/futebol gerar — banner PNG',
      '/top10 — ranking em banner',
    )
  } else {
    lines.push('', 'Itens Premium aparecem no menu com 🔒 até a liberação do plano.')
  }
  lines.push('', 'Dica: após buscar, toque no número do título para capa, trailer ou banner.')
  return lines.join('\n')
}

const formatDateTimeBr = (value) => {
  try {
    return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  } catch {
    return String(value || '—')
  }
}

export const plansText = (userType) => {
  const current = planLabel(userType)
  return [
    '<b>Planos MediaHub</b>',
    userType ? `Seu plano agora: <b>${escapeHtml(current)}</b>` : '',
    '',
    '<b>Free</b>',
    '• Busca de títulos (limite diário)',
    '• Envio de capa e link de trailer',
    '• Histórico e suporte',
    '• Ideal para começar',
    '',
    '<b>Premium</b>',
    '• Buscas sem o teto do Free',
    '• Agenda completa de jogos + banner',
    '• Top 10 e banner de título',
    '• Recursos avançados alinhados ao painel web',
    '',
    '<b>Admin</b>',
    '• Gestão de usuários e planos no painel web',
    '• O bot não altera planos sozinho — só o administrador',
    '',
    'Para upgrade: abra /suporte com o assunto <i>Solicitar Premium</i>, ou peça ao administrador no painel.',
  ]
    .filter(Boolean)
    .join('\n')
}

export const accountText = (user) => {
  const plan = planLabel(user.type)
  const end =
    user.type === 'premium' && user.subscriptionEnd
      ? formatDateTimeBr(user.subscriptionEnd)
      : null

  const tips =
    user.type === 'free'
      ? [
          '',
          '<b>Como evoluir</b>',
          'Abra Planos ou fale com o suporte pedindo Premium.',
          'Quem define o plano é o administrador do sistema.',
        ].join('\n')
      : user.type === 'premium'
        ? [
            '',
            'Seu Premium está ativo. Em caso de dúvidas sobre renovação, use /suporte.',
          ].join('\n')
        : [
            '',
            'Você tem acesso administrativo. Gerencie planos no painel web.',
          ].join('\n')

  return [
    '<b>Minha conta</b>',
    '',
    `Nome: <b>${escapeHtml(user.name || '—')}</b>`,
    `E-mail: ${escapeHtml(user.email || '—')}`,
    `Plano: <b>${escapeHtml(plan)}</b>`,
    end ? `Vencimento: ${escapeHtml(end)}` : '',
    tips,
  ]
    .filter(Boolean)
    .join('\n')
}

export const formatSearchResults = (items) => {
  if (!items.length) {
    return 'Nenhum resultado para este termo.\nTente outro nome ou use /buscar novamente.'
  }
  const lines = items.map((item, i) => {
    const year = item.year ? ` (${item.year})` : ''
    const kind = item.mediaType === 'tv' ? 'série' : 'filme'
    return `${i + 1}. <b>${escapeHtml(item.title)}</b>${escapeHtml(year)} — <i>${kind}</i>`
  })
  return [
    `Resultados: <b>${items.length}</b>`,
    '',
    ...lines,
    '',
    'Toque no número para detalhes e ações.',
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
  rows.push([
    { text: 'Nova busca', callback_data: 'menu:search' },
    { text: 'Menu', callback_data: 'menu:home' },
  ])
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
      `Não há jogos para <b>${escapeHtml(formatDateBr(dateIso))}</b>.\nSe for Premium, use /futebol atualizar.`,
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
    `<b>Jogos do dia</b>`,
    `${escapeHtml(formatDateBr(dateIso))} · <b>${list.length}</b> confronto(s)`,
    '',
  ].join('\n')

  const blocks = []
  for (const [time, items] of byTime) {
    const lines = [`<b>${escapeHtml(time)}</b>`]
    for (const m of items) {
      const home = escapeHtml(String(m.home || '').trim())
      const away = escapeHtml(String(m.away || '').trim())
      const comp =
        typeof m.competition === 'string' && m.competition.trim()
          ? `\n   <i>${escapeHtml(m.competition.trim())}</i>`
          : ''
      const ch =
        Array.isArray(m.channels) && m.channels.length
          ? `\n   ${escapeHtml(m.channels.slice(0, 3).join(', '))}`
          : ''
      lines.push(`• ${home} <b>x</b> ${away}${comp}${ch}`)
    }
    lines.push('')
    blocks.push(lines.join('\n'))
  }

  const chunks = []
  let current = header

  const startContinuation = () =>
    `<b>Jogos</b> (continuação)\n${escapeHtml(formatDateBr(dateIso))}\n\n`

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
      chunks[i] = `${chunks[i].trimEnd()}\n\nParte ${i + 1}/${total}`
    }
  }
  chunks[chunks.length - 1] = `${chunks[chunks.length - 1].trimEnd()}\n\nBanner PNG: use o botão abaixo.`

  return chunks
}

export const formatFootballList = (dateIso, matches, opts = {}) => {
  const chunks = formatFootballListChunks(dateIso, matches, opts)
  return chunks.join('\n\n———\n\n')
}

export const footballKeyboard = (dateIso) => ({
  inline_keyboard: [
    [
      { text: 'Atualizar', callback_data: `fb:refresh:${dateIso}` },
      { text: 'Gerar banner', callback_data: `fb:gen:${dateIso}` },
    ],
    [{ text: 'Menu', callback_data: 'menu:home' }],
  ],
})

export const titleActionsKeyboard = (index, { premium = false } = {}) => {
  const rows = [
    [
      { text: 'Enviar capa', callback_data: `send:${index}` },
      { text: 'Trailer', callback_data: `trailer:${index}` },
    ],
  ]
  if (premium) {
    rows.push([{ text: 'Gerar banner', callback_data: `banner:${index}` }])
  } else {
    rows.push([{ text: 'Banner 🔒', callback_data: 'menu:locked:banner' }])
  }
  rows.push([
    { text: 'Nova busca', callback_data: 'menu:search' },
    { text: 'Menu', callback_data: 'menu:home' },
  ])
  return { inline_keyboard: rows }
}

export const unlinkNeedText = () =>
  [
    '<b>Acesso necessário</b>',
    '',
    'Para usar o MediaHub neste chat, entre ou crie sua conta.',
    'Não é obrigatório abrir o site.',
    '',
    'Cadastros novos iniciam no plano <b>Free</b>. O administrador define upgrades.',
  ].join('\n')

export const linkHelpText = () =>
  [
    '<b>Vínculo pelo site (opcional)</b>',
    '',
    '1. Abra o MediaHub → <b>Minha Área → Telegram</b>',
    '2. Gere o código',
    '3. Abra o link ou envie <code>/start link_XXXX</code>',
    '',
    'Preferência recomendada: /entrar ou Criar conta neste bot.',
  ].join('\n')

export const premiumUpsell = (featureLabel) =>
  [
    `<b>${escapeHtml(featureLabel)}</b> faz parte do plano Premium.`,
    '',
    'No Free você busca títulos, envia capas e usa o suporte.',
    'Para liberar este recurso, abra /planos ou peça upgrade em /suporte.',
  ].join('\n')
