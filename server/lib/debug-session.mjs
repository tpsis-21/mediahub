import fs from 'node:fs'
import path from 'node:path'

/**
 * Ring buffer + NDJSON de debug (dev / DEBUG_AGENT_LOG).
 * @param {{ rootDir: string, sessionId?: string }} opts
 */
export const createDebugSession = ({ rootDir, sessionId = '3ee3aa' }) => {
  const debugAgentLogFootballPath = path.join(rootDir, '..', `debug-${sessionId}.log`)
  const debugAgentLogFootballPathAlt = path.join(rootDir, `debug-${sessionId}.log`)
  let dbgNdjsonAppendWarned = false
  const sessionDebugRingMax = 400
  const sessionDebugRing = []
  const apiBootAt = Date.now()

  const appendDebugNdjsonToSessionFiles = (payload) => {
    try {
      sessionDebugRing.push({ ...payload, _ringOrder: sessionDebugRing.length })
      if (sessionDebugRing.length > sessionDebugRingMax) {
        sessionDebugRing.splice(0, sessionDebugRing.length - sessionDebugRingMax)
      }
    } catch {
      void 0
    }
    const line = `${JSON.stringify(payload)}\n`
    for (const target of [debugAgentLogFootballPath, debugAgentLogFootballPathAlt]) {
      try {
        fs.appendFileSync(target, line)
      } catch (err) {
        if (!dbgNdjsonAppendWarned) {
          dbgNdjsonAppendWarned = true
          console.error(`[debug-${sessionId}] falha ao gravar NDJSON`, target, err?.message || err)
        }
      }
    }
  }

  const appendFootballDebugNdjson = (hypothesisId, location, message, data) => {
    appendDebugNdjsonToSessionFiles({
      sessionId,
      hypothesisId,
      timestamp: Date.now(),
      location,
      message,
      data,
    })
  }

  const clearSessionDebugRing = () => {
    sessionDebugRing.length = 0
  }

  const getSessionDebugSnapshot = () => ({
    sessionId,
    apiBootAt,
    count: sessionDebugRing.length,
    items: sessionDebugRing,
  })

  return {
    appendDebugNdjsonToSessionFiles,
    appendFootballDebugNdjson,
    clearSessionDebugRing,
    getSessionDebugSnapshot,
    apiBootAt,
  }
}
