/** Mensagens e teclados — UI conversacional profissional (PT-BR). */

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

/** Rótulos do teclado fixo (barra inferior). */
export const NAV = {
  MENU: '☰ Menu',
  SEARCH: '🔎 Buscar',
  ACCOUNT: '👤 Conta',
  HELP: '❓ Ajuda',
  LOGIN: 'Entrar',
  REGISTER: 'Criar conta',
  PLANS: 'Planos',
}

export const isNavLabel = (text) => {
  const t = String(text || '').trim()
  return Object.values(NAV).includes(t)
}

export const resolveNavAction = (text) => {
  const t = String(text || '').trim()
  if (t === NAV.MENU) return 'menu'
  if (t === NAV.SEARCH) return 'search'
  if (t === NAV.ACCOUNT) return 'account'
  if (t === NAV.HELP) return 'help'
  if (t === NAV.LOGIN) return 'login'
  if (t === NAV.REGISTER) return 'register'
  if (t === NAV.PLANS) return 'plans'
  return null
}

/** Teclado fixo após login. */
export const replyNavKeyboard = () => ({
  keyboard: [
    [{ text: NAV.MENU }, { text: NAV.SEARCH }],
    [{ text: NAV.ACCOUNT }, { text: NAV.HELP }],
  ],
  resize_keyboard: true,
  is_persistent: true,
})

/** Teclado fixo antes do login. */
export const replyGuestKeyboard = () => ({
  keyboard: [
    [{ text: NAV.LOGIN }, { text: NAV.REGISTER }],
    [{ text: NAV.PLANS }, { text: NAV.HELP }],
  ],
  resize_keyboard: true,
  is_persistent: true,
})

export const replyKeyboardRemove = () => ({
  remove_keyboard: true,
})

const rowMenu = () => [{ text: '« Menu', callback_data: 'menu:home' }]

const withMenu = (rows) => ({
  inline_keyboard: [...rows, rowMenu()],
})

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

export const cancelKeyboard = () => ({
  inline_keyboard: [[{ text: 'Cancelar', callback_data: 'nav:cancel' }]],
})

export const mainMenuText = (user) => {
  const plan = planLabel(user?.type)
  const lockedHint =
    user?.type === 'free' ? '\nItens com 🔒 exigem Premium.' : ''
  return [
    '<b>Menu principal</b>',
    `Plano: <b>${escapeHtml(plan)}</b>`,
    lockedHint,
    '',
    'Toque em uma opção abaixo.',
  ]
    .filter((line) => line !== undefined)
    .join('\n')
}

export const mainMenuKeyboard = (userType) => {
  const premium = userType === 'premium' || userType === 'admin'
  return {
    inline_keyboard: [
      [{ text: 'Buscar título', callback_data: 'menu:search' }],
      [{ text: 'Histórico', callback_data: 'menu:history' }],
      premium
        ? [
            { text: 'Jogos do dia', callback_data: 'menu:football' },
            { text: 'Top 10', callback_data: 'menu:top10' },
          ]
        : [
            { text: 'Jogos do dia 🔒', callback_data: 'menu:locked:football' },
            { text: 'Top 10 🔒', callback_data: 'menu:locked:top10' },
          ],
      [
        { text: 'Minha conta', callback_data: 'menu:account' },
        { text: 'Planos', callback_data: 'menu:plans' },
      ],
      [
        { text: 'Suporte', callback_data: 'menu:support_hub' },
        { text: 'Ajuda', callback_data: 'menu:help' },
      ],
    ],
  }
}

export const accountKeyboard = (userType) => {
  const rows = [
    [
      { text: 'Planos', callback_data: 'menu:plans' },
      { text: 'Trocar senha', callback_data: 'menu:password' },
    ],
  ]
  if (userType === 'free') {
    rows.push([{ text: 'Solicitar Premium', callback_data: 'menu:support' }])
  }
  rows.push([{ text: 'Sair deste chat', callback_data: 'menu:logout' }])
  rows.push(rowMenu())
  return { inline_keyboard: rows }
}

export const supportHubText = (userType) => {
  if (userType === 'admin') {
    return [
      '<b>Suporte</b>',
      '',
      'Atendimento 100% pelo bot — sem precisar abrir o site.',
      'Escolha uma opção:',
    ].join('\n')
  }
  return [
    '<b>Suporte</b>',
    '',
    'Abra um chamado ou acompanhe as respostas aqui no chat.',
  ].join('\n')
}

export const supportHubKeyboard = (userType) => {
  const rows = [
    [{ text: 'Abrir chamado', callback_data: 'menu:support' }],
    [{ text: 'Meus chamados', callback_data: 'menu:tickets' }],
  ]
  if (userType === 'admin') {
    rows.push([{ text: 'Fila de atendimento', callback_data: 'admin:tickets' }])
    rows.push([{ text: 'Liberar Premium', callback_data: 'admin:premium' }])
  }
  rows.push(rowMenu())
  return { inline_keyboard: rows }
}

export const ticketsListKeyboard = (rows, { admin = false } = {}) => {
  const buttons = (rows || []).slice(0, 10).map((t) => ({
    text: `#${t.id} · ${String(t.status || '').slice(0, 12)}`,
    callback_data: admin ? `tkt:admin:${t.id}` : `tkt:view:${t.id}`,
  }))
  const kb = []
  for (let i = 0; i < buttons.length; i += 2) {
    kb.push(buttons.slice(i, i + 2))
  }
  if (!admin) kb.push([{ text: 'Abrir chamado', callback_data: 'menu:support' }])
  else kb.push([{ text: 'Atualizar fila', callback_data: 'admin:tickets' }])
  kb.push(rowMenu())
  return { inline_keyboard: kb }
}

export const ticketDetailText = ({ ticket, messages, isAdminView = false }) => {
  const status = escapeHtml(ticket.status || '—')
  const subject = escapeHtml(ticket.subject || '—')
  const who = isAdminView
    ? `${escapeHtml(ticket.user_name || '—')} · ${escapeHtml(ticket.user_email || '')}`
    : ''
  const lines = [
    `<b>Chamado #${ticket.id}</b>`,
    `Status: <b>${status}</b>`,
    `Assunto: ${subject}`,
    who ? `Cliente: ${who}` : '',
    '',
    '<b>Mensagens</b>',
  ].filter(Boolean)

  const msgs = Array.isArray(messages) ? messages.slice(-12) : []
  if (!msgs.length) {
    lines.push('<i>Sem mensagens.</i>')
  } else {
    for (const m of msgs) {
      const role = m.is_admin ? 'Equipe' : 'Cliente'
      const body = escapeHtml(String(m.message || '').slice(0, 400))
      lines.push(`• <b>${role}</b>: ${body}`)
    }
  }
  return lines.join('\n')
}

export const ticketDetailKeyboard = ({ ticketId, isAdminView = false }) => {
  const rows = [[{ text: 'Responder', callback_data: `tkt:reply:${ticketId}` }]]
  if (isAdminView) {
    rows.push([
      { text: 'Em andamento', callback_data: `tkt:status:${ticketId}:in_progress` },
      { text: 'Resolver', callback_data: `tkt:status:${ticketId}:resolved` },
    ])
    rows.push([{ text: 'Fila', callback_data: 'admin:tickets' }])
  } else {
    rows.push([{ text: 'Meus chamados', callback_data: 'menu:tickets' }])
  }
  rows.push(rowMenu())
  return { inline_keyboard: rows }
}

export const ticketsText = (rows, { admin = false } = {}) => {
  if (!rows.length) {
    return admin
      ? ['<b>Fila de atendimento</b>', '', 'Nenhum chamado no momento.'].join('\n')
      : ['<b>Meus chamados</b>', '', 'Nenhum chamado aberto.'].join('\n')
  }
  const lines = rows.map((t) => {
    const client = admin && t.user_email ? ` · ${escapeHtml(t.user_email)}` : ''
    return `#${t.id} · ${escapeHtml(t.status)} · <b>${escapeHtml(t.subject)}</b>${client}`
  })
  return [admin ? '<b>Fila de atendimento</b>' : '<b>Meus chamados</b>', '', ...lines, '', 'Toque em um chamado:'].join(
    '\n',
  )
}

export const lockedFeatureKeyboard = () => ({
  inline_keyboard: [
    [{ text: 'Ver planos', callback_data: 'menu:plans' }],
    [{ text: 'Solicitar Premium', callback_data: 'menu:support' }],
    rowMenu(),
  ],
})

export const welcomeText = () =>
  [
    '<b>MediaHub</b>',
    '<i>Assistente de conteúdo para o seu negócio</i>',
    '',
    'Organize buscas, capas, artes e a agenda de jogos neste chat — sem precisar abrir o site.',
    '',
    '<b>Disponível aqui</b>',
    '• Buscar títulos e enviar capas',
    '• Trailer do título',
    '• Banners e Top 10 <i>(Premium)</i>',
    '• Agenda completa de jogos <i>(Premium)</i>',
    '• Suporte por chamado',
    '',
    'Entre na sua conta ou crie uma nova para começar.',
    'Novos cadastros iniciam no plano <b>Free</b>.',
  ].join('\n')

export const linkedWelcomeText = (user, { justLinked = false } = {}) => {
  const name = escapeHtml(user.name || user.email || 'você')
  const greeting = justLinked ? 'Conta conectada.' : 'Bem-vindo de volta.'
  const planLine =
    user.type === 'premium'
      ? `Plano: <b>Premium</b>${user.subscriptionEnd ? ` · até ${escapeHtml(formatDateTimeBr(user.subscriptionEnd))}` : ''}`
      : user.type === 'admin'
        ? 'Acesso: <b>Admin</b>'
        : 'Plano: <b>Free</b> · limite diário de buscas'

  return [
    '<b>MediaHub</b>',
    '',
    `${greeting} Olá, <b>${name}</b>.`,
    planLine,
    '',
    'Use o <b>menu</b> abaixo ou a barra inferior para navegar.',
  ].join('\n')
}

export const helpText = (userType) => {
  const lines = [
    '<b>Ajuda</b>',
    '',
    'Navegue pelos botões. Comandos opcionais:',
    '',
    '<b>Conta</b>',
    '/entrar · /cadastrar · /conta · /planos',
    '/senha · /sair',
    '',
    '<b>Operação</b>',
    '/menu · /buscar · /historico',
    '/suporte · /tickets · /ajuda',
  ]
  if (userType === 'premium' || userType === 'admin') {
    lines.push('', '<b>Premium</b>', '/futebol · /futebol gerar · /top10')
  } else {
    lines.push('', 'Recursos Premium aparecem no menu com 🔒.')
  }
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
    '<b>Planos</b>',
    userType ? `Atual: <b>${escapeHtml(current)}</b>` : '',
    '',
    '<b>Free</b>',
    '• Busca com limite diário',
    '• Capa e trailer',
    '• Histórico e suporte',
    '',
    '<b>Premium</b>',
    '• Buscas sem o teto do Free',
    '• Jogos do dia + banner',
    '• Top 10 e banner de título',
    '',
    '<b>Admin</b>',
    '• Gestão de planos no painel web',
    '• O bot não altera planos sozinho',
    '',
    'Upgrade: suporte (Solicitar Premium) ou administrador.',
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
      ? '\n\nPara Premium, use <b>Solicitar Premium</b> ou fale com o administrador.'
      : user.type === 'premium'
        ? '\n\nPremium ativo. Dúvidas de renovação: Suporte.'
        : '\n\nAcesso administrativo. Planos são gerenciados no painel web.'

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

export const searchPromptText = () =>
  [
    '<b>Buscar</b>',
    '',
    'Digite o nome do filme ou série.',
  ].join('\n')

export const formatSearchResults = (items) => {
  if (!items.length) {
    return 'Nenhum resultado.\nTente outro termo ou inicie uma nova busca.'
  }
  const lines = items.map((item, i) => {
    const year = item.year ? ` (${item.year})` : ''
    const kind = item.mediaType === 'tv' ? 'série' : 'filme'
    return `${i + 1}. <b>${escapeHtml(item.title)}</b>${escapeHtml(year)} — <i>${kind}</i>`
  })
  return [
    `<b>Resultados</b> · ${items.length}`,
    '',
    ...lines,
    '',
    'Selecione um número:',
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
    { text: '« Menu', callback_data: 'menu:home' },
  ])
  return { inline_keyboard: rows }
}

const formatDateBr = (dateIso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || ''))) return String(dateIso || '')
  const [y, m, d] = String(dateIso).split('-')
  return `${d}/${m}/${y}`
}

export const isUsefulCompetition = (value) => {
  const t = String(value || '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\.(png|jpe?g|webp|gif)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t || t.length < 3 || t.length > 48) return false
  if (/onefootball|todos os jogos|ver detalhes|futebolnatv|upload\/ligas/i.test(t)) return false
  return true
}

export const cleanCompetitionLabel = (value) => {
  if (!isUsefulCompetition(value)) return ''
  return String(value || '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const formatFootballListChunks = (dateIso, matches, { maxLen = 3500 } = {}) => {
  const list = Array.isArray(matches) ? matches.slice() : []
  if (!list.length) {
    return [
      `Não há jogos para <b>${escapeHtml(formatDateBr(dateIso))}</b>.\nUse Atualizar se necessário.`,
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
    `${escapeHtml(formatDateBr(dateIso))} · <b>${list.length}</b> confrontos`,
    '',
  ].join('\n')

  const blocks = []
  for (const [time, items] of byTime) {
    const lines = [`<b>${escapeHtml(time)}</b>`]
    for (const m of items) {
      const home = escapeHtml(String(m.home || '').trim())
      const away = escapeHtml(String(m.away || '').trim())
      const comp = cleanCompetitionLabel(m.competition)
      const compLine = comp ? `\n   <i>${escapeHtml(comp)}</i>` : ''
      lines.push(`• ${home} × ${away}${compLine}`)
    }
    lines.push('')
    blocks.push(lines.join('\n'))
  }

  const chunks = []
  let current = header
  const startContinuation = () =>
    `<b>Jogos</b> · ${escapeHtml(formatDateBr(dateIso))} <i>(cont.)</i>\n\n`

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

  if (current.trim()) chunks.push(current.trimEnd())

  const total = chunks.length
  if (total > 1) {
    for (let i = 0; i < total; i += 1) {
      chunks[i] = `${chunks[i].trimEnd()}\n\nParte ${i + 1}/${total}`
    }
  }
  chunks[chunks.length - 1] = `${chunks[chunks.length - 1].trimEnd()}\n\nGere o banner pelos botões abaixo.`

  return chunks
}

export const formatFootballList = (dateIso, matches, opts = {}) =>
  formatFootballListChunks(dateIso, matches, opts).join('\n\n———\n\n')

export const footballKeyboard = (dateIso) => ({
  inline_keyboard: [
    [
      { text: 'Atualizar', callback_data: `fb:refresh:${dateIso}` },
      { text: 'Gerar banner', callback_data: `fb:pick:${dateIso}` },
    ],
    rowMenu(),
  ],
})

export const footballModelKeyboard = (dateIso) => ({
  inline_keyboard: [
    [{ text: 'Informativo', callback_data: `fb:gen:informativo:${dateIso}` }],
    [{ text: 'Destaque', callback_data: `fb:gen:promo:${dateIso}` }],
    [{ text: 'Compacto', callback_data: `fb:gen:clean:${dateIso}` }],
    [{ text: '« Voltar', callback_data: `menu:football` }],
  ],
})

export const footballModelPickText = () =>
  ['<b>Banner de jogos</b>', '', 'Escolha o modelo:'].join('\n')

export const top10HubText = () =>
  ['<b>Top 10</b>', '', '1) Escolha a categoria', '2) Depois escolha o modelo'].join('\n')

export const top10HubKeyboard = () => ({
  inline_keyboard: [
    [
      { text: 'Geral', callback_data: 'top10:cat:all' },
      { text: 'Filmes', callback_data: 'top10:cat:movie' },
    ],
    [{ text: 'Séries', callback_data: 'top10:cat:tv' }],
    rowMenu(),
  ],
})

export const top10ModelKeyboard = (mediaType) => ({
  inline_keyboard: [
    [
      { text: 'Lista', callback_data: `top10:gen:lista:${mediaType}` },
      { text: 'Cartaz', callback_data: `top10:gen:cartaz:${mediaType}` },
    ],
    [{ text: '« Voltar', callback_data: 'menu:top10' }],
  ],
})

export const top10ModelPickText = (categoryLabel) =>
  [`<b>${escapeHtml(categoryLabel)}</b>`, '', 'Escolha o modelo do banner:'].join('\n')

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
    { text: '« Menu', callback_data: 'menu:home' },
  ])
  return { inline_keyboard: rows }
}

export const titleDetailText = (item) => {
  const overview = item.overview ? `\n\n${escapeHtml(item.overview.slice(0, 280))}` : ''
  return `<b>${escapeHtml(item.title)}</b>${item.year ? ` (${escapeHtml(item.year)})` : ''}${overview}`
}

export const unlinkNeedText = () =>
  [
    '<b>Acesso necessário</b>',
    '',
    'Entre ou crie sua conta para continuar.',
    'Não é obrigatório abrir o site.',
    '',
    'Novos cadastros: plano <b>Free</b>.',
  ].join('\n')

export const linkHelpText = () =>
  [
    '<b>Código da web</b> <i>(opcional)</i>',
    '',
    '1. MediaHub → Minha Área → Telegram',
    '2. Gere o código',
    '3. Abra o link ou envie <code>/start link_XXXX</code>',
    '',
    'Recomendado: Entrar ou Criar conta neste bot.',
  ].join('\n')

export const premiumUpsell = (featureLabel) =>
  [
    `<b>${escapeHtml(featureLabel)}</b> — recurso Premium`,
    '',
    'No Free: busca, capa, trailer e suporte.',
    'Para liberar: Ver planos ou Solicitar Premium.',
  ].join('\n')

export const formatHistoryWhen = (timestamp) => {
  try {
    const d = new Date(Number(timestamp))
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/** Resumo limpo de uma busca (evita dump de lote com emojis). */
export const summarizeHistoryQuery = (query, type) => {
  const raw = String(query || '').trim()
  if (!raw) return '—'

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const isBulk =
    type === 'bulk' ||
    lines.length > 1 ||
    raw.length > 70 ||
    /[🥇🥈🥉]|[4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🔟]|^\d+\.\s/m.test(raw)

  if (isBulk) {
    const items = lines.length > 1 ? lines.length : Math.max(2, (raw.match(/\n/g) || []).length + 1)
    let preview = (lines[0] || raw)
      .replace(/^[🥇🥈🥉\d️⃣🔟.\s-]+/u, '')
      .replace(/\(\d{4}\)/g, '')
      .trim()
      .slice(0, 36)
    if (preview.length >= 36) preview = `${preview}…`
    const nLabel = lines.length > 1 ? lines.length : 'vários'
    return {
      title: `Lista em lote · ${nLabel} itens`,
      preview: preview || '',
      kind: 'bulk',
    }
  }

  const title = raw.length > 42 ? `${raw.slice(0, 40)}…` : raw
  return { title, preview: '', kind: 'individual' }
}

export const historyText = (rows) => {
  if (!rows.length) {
    return ['<b>Histórico</b>', '', 'Ainda não há buscas registradas.'].join('\n')
  }
  const lines = rows.map((r, i) => {
    const when = formatHistoryWhen(r.timestamp)
    const sum = summarizeHistoryQuery(r.query, r.type)
    const head = `${i + 1}. <b>${escapeHtml(sum.title)}</b>`
    const meta = when ? ` · <i>${escapeHtml(when)}</i>` : ''
    const sub = sum.preview ? `\n    <i>${escapeHtml(sum.preview)}</i>` : ''
    return `${head}${meta}${sub}`
  })
  return [
    '<b>Histórico</b>',
    `<i>${rows.length} busca(s) recente(s)</i>`,
    '',
    ...lines,
    '',
    'Toque no número para buscar de novo.',
  ].join('\n')
}

export const historyKeyboard = (count = 0) => {
  const n = Math.min(Math.max(0, Number(count) || 0), 10)
  const buttons = []
  for (let i = 0; i < n; i += 1) {
    buttons.push({ text: String(i + 1), callback_data: `hist:${i}` })
  }
  const rows = []
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(buttons.slice(i, i + 5))
  }
  rows.push([{ text: 'Nova busca', callback_data: 'menu:search' }])
  rows.push(rowMenu())
  return { inline_keyboard: rows }
}

export const BOT_COMMANDS = [
  { command: 'start', description: 'Início / boas-vindas' },
  { command: 'menu', description: 'Menu principal' },
  { command: 'buscar', description: 'Buscar filme ou série' },
  { command: 'historico', description: 'Últimas buscas' },
  { command: 'conta', description: 'Minha conta e plano' },
  { command: 'planos', description: 'Comparar planos' },
  { command: 'suporte', description: 'Suporte e chamados' },
  { command: 'ajuda', description: 'Central de ajuda' },
  { command: 'entrar', description: 'Entrar na conta' },
  { command: 'sair', description: 'Sair deste chat' },
]
