import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  MEDIAHUB_EVENTS,
  emitMediaHubEvent,
  mediaHubUi,
  onMediaHubEvent,
} from '../mediahub-events'

describe('mediahub-events', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('emitMediaHubEvent dispara CustomEvent com nome tipado', () => {
    emitMediaHubEvent(MEDIAHUB_EVENTS.openAuthModal)
    expect(window.dispatchEvent).toHaveBeenCalledOnce()
    const event = (window.dispatchEvent as ReturnType<typeof vi.fn>).mock.calls[0][0] as CustomEvent
    expect(event.type).toBe('mediahub:openAuthModal')
  })

  it('ticketsSettingsChanged envia detail.enabled', () => {
    mediaHubUi.ticketsSettingsChanged(true)
    const event = (window.dispatchEvent as ReturnType<typeof vi.fn>).mock.calls[0][0] as CustomEvent
    expect(event.type).toBe(MEDIAHUB_EVENTS.ticketsSettingsChanged)
    expect(event.detail).toEqual({ enabled: true })
  })

  it('onMediaHubEvent registra e remove listener', () => {
    const off = onMediaHubEvent(MEDIAHUB_EVENTS.historyUpdated, () => undefined)
    expect(window.addEventListener).toHaveBeenCalledWith(
      MEDIAHUB_EVENTS.historyUpdated,
      expect.any(Function),
    )
    off()
    expect(window.removeEventListener).toHaveBeenCalledWith(
      MEDIAHUB_EVENTS.historyUpdated,
      expect.any(Function),
    )
  })
})
