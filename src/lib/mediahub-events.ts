/**
 * Barramento tipado dos eventos `mediahub:*` (window CustomEvent).
 * Mantém o mesmo canal DOM para não quebrar listeners legados ainda misturados.
 */

export const MEDIAHUB_EVENTS = {
  openAuthModal: 'mediahub:openAuthModal',
  openAdminModal: 'mediahub:openAdminModal',
  openUserAreaModal: 'mediahub:openUserAreaModal',
  openTop10BannerModal: 'mediahub:openTop10BannerModal',
  openFootballBannerModal: 'mediahub:openFootballBannerModal',
  openSupportModal: 'mediahub:openSupportModal',
  historyUpdated: 'mediahub:historyUpdated',
  ticketsSettingsChanged: 'mediahub:ticketsSettingsChanged',
} as const

export type MediaHubEventName = (typeof MEDIAHUB_EVENTS)[keyof typeof MEDIAHUB_EVENTS]

type MediaHubEventMap = {
  [MEDIAHUB_EVENTS.openAuthModal]: undefined
  [MEDIAHUB_EVENTS.openAdminModal]: undefined
  [MEDIAHUB_EVENTS.openUserAreaModal]: undefined
  [MEDIAHUB_EVENTS.openTop10BannerModal]: undefined
  [MEDIAHUB_EVENTS.openFootballBannerModal]: undefined
  [MEDIAHUB_EVENTS.openSupportModal]: undefined
  [MEDIAHUB_EVENTS.historyUpdated]: undefined
  [MEDIAHUB_EVENTS.ticketsSettingsChanged]: { enabled: boolean }
}

type Handler<E extends MediaHubEventName> = (
  detail: MediaHubEventMap[E],
  event: CustomEvent<MediaHubEventMap[E]>,
) => void

const isBrowser = () => typeof window !== 'undefined'

export function emitMediaHubEvent<E extends MediaHubEventName>(
  name: E,
  ...args: MediaHubEventMap[E] extends undefined ? [] : [detail: MediaHubEventMap[E]]
): void {
  if (!isBrowser()) return
  const detail = (args[0] ?? undefined) as MediaHubEventMap[E]
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

export function onMediaHubEvent<E extends MediaHubEventName>(name: E, handler: Handler<E>): () => void {
  if (!isBrowser()) return () => undefined

  const listener = ((event: Event) => {
    const custom = event as CustomEvent<MediaHubEventMap[E]>
    handler(custom.detail as MediaHubEventMap[E], custom)
  }) as EventListener

  window.addEventListener(name, listener)
  return () => window.removeEventListener(name, listener)
}

/** Atalhos de UI mais usados */
export const mediaHubUi = {
  openAuth: () => emitMediaHubEvent(MEDIAHUB_EVENTS.openAuthModal),
  openAdmin: () => emitMediaHubEvent(MEDIAHUB_EVENTS.openAdminModal),
  openUserArea: () => emitMediaHubEvent(MEDIAHUB_EVENTS.openUserAreaModal),
  openTop10: () => emitMediaHubEvent(MEDIAHUB_EVENTS.openTop10BannerModal),
  openFootball: () => emitMediaHubEvent(MEDIAHUB_EVENTS.openFootballBannerModal),
  openSupport: () => emitMediaHubEvent(MEDIAHUB_EVENTS.openSupportModal),
  historyUpdated: () => emitMediaHubEvent(MEDIAHUB_EVENTS.historyUpdated),
  ticketsSettingsChanged: (enabled: boolean) =>
    emitMediaHubEvent(MEDIAHUB_EVENTS.ticketsSettingsChanged, { enabled }),
}
