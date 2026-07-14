/**
 * Estado temporário para chats ainda sem sessão (login/cadastro).
 * Em memória — reinício do processo perde o fluxo (usuário reinicia com /entrar).
 */

const store = new Map()
const AUTH_FAIL = new Map()

const FAIL_WINDOW_MS = 15 * 60_000
const FAIL_MAX = 8

export const getPending = (chatId) => {
  const key = String(chatId)
  const row = store.get(key)
  if (!row) return null
  if (Date.now() - row.updatedAt > 30 * 60_000) {
    store.delete(key)
    return null
  }
  return row
}

export const setPending = (chatId, { state, data = {} }) => {
  const key = String(chatId)
  const prev = store.get(key) || { data: {} }
  store.set(key, {
    state,
    data: { ...prev.data, ...data },
    updatedAt: Date.now(),
  })
}

export const clearPending = (chatId) => {
  store.delete(String(chatId))
}

export const replacePendingData = (chatId, data) => {
  const key = String(chatId)
  const prev = store.get(key)
  if (!prev) return
  store.set(key, { ...prev, data: data || {}, updatedAt: Date.now() })
}

export const assertAuthAllowed = (chatId) => {
  const key = String(chatId)
  const row = AUTH_FAIL.get(key)
  if (!row) return { ok: true }
  if (Date.now() > row.until) {
    AUTH_FAIL.delete(key)
    return { ok: true }
  }
  if (row.count >= FAIL_MAX) {
    return { ok: false, message: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }
  }
  return { ok: true }
}

export const recordAuthFailure = (chatId) => {
  const key = String(chatId)
  const now = Date.now()
  const row = AUTH_FAIL.get(key)
  if (!row || now > row.until) {
    AUTH_FAIL.set(key, { count: 1, until: now + FAIL_WINDOW_MS })
    return
  }
  row.count += 1
}

export const clearAuthFailures = (chatId) => {
  AUTH_FAIL.delete(String(chatId))
}
