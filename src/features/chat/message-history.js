export const MAX_CHAT_ATTEMPTS = 2

/** Backend history records the original attempt, but does not expose retry counts. */
export const chatAttempts = (turn) => turn?.attempts ?? 1

/** Match persisted records to optimistic turns without merging USER and ASSISTANT. */
function sameMessage(left, right) {
  return (
    left.id === right.id ||
    Boolean(
      left?.requestId &&
      left.requestId === right?.requestId &&
      left.role === right.role,
    )
  )
}

/** Pages are chronological; incoming data replaces duplicates in place. */
export function mergeMessages(existing, incoming, position = 'latest') {
  const result = []
  const ordered =
    position === 'older'
      ? [...incoming, ...existing]
      : [...existing, ...incoming]
  for (const message of ordered) {
    const index = result.findIndex((current) => sameMessage(current, message))
    if (index < 0) result.push(message)
    else result[index] = message
  }
  const completed = new Set(
    result
      .filter(
        (message) =>
          message.role === 'ASSISTANT' &&
          message?.requestId &&
          message?.requestStatus !== 'FAILED' &&
          message?.requestStatus !== 'IN_PROGRESS',
      )
      .map((message) => message.requestId),
  )
  return result.map((message) =>
    message.role === 'USER' && completed.has(message?.requestId)
      ? { ...message, requestStatus: 'COMPLETED' }
      : message,
  )
}

export function hasPendingHistory(messages) {
  const latest = messages.findLast((message) => message?.role === 'USER')
  return (
    latest?.requestStatus === 'IN_PROGRESS' &&
    !messages.some(
      (message) =>
        message.role === 'ASSISTANT' &&
        message?.requestId === latest?.requestId &&
        message?.requestStatus !== 'IN_PROGRESS' &&
        message?.requestStatus !== 'FAILED',
    )
  )
}

/** Only the newest unfinished turn may be retried after a reload. No local journal. */
export function restoreRecovery(messages) {
  const normalized = mergeMessages([], messages)
  const latest = normalized.findLast((message) => message.role === 'USER')
  if (
    !latest?.requestId ||
    !['FAILED', 'IN_PROGRESS'].includes(latest?.requestStatus) ||
    typeof latest?.content !== 'string' ||
    !latest.content ||
    latest.content !== latest.content.trim() ||
    latest.content.length > 2000
  )
    return { pendingTurn: null, chatError: null }
  const busy = latest.requestStatus === 'IN_PROGRESS'
  return {
    pendingTurn: {
      requestId: latest.requestId,
      message: latest.content,
      recovered: true,
      attempts: 1,
    },
    chatError: {
      message: busy
        ? 'Your last request was still processing when this conversation was restored. Check its status before continuing.'
        : 'Your last message did not complete. You can ask a different question or retry the original request once.',
      retryable: !busy,
      blocked: busy,
      resumeAllowed: false,
    },
  }
}

/** Resolve a known request against a fresh server page, including newer turns. */
export function resolveTurn(page, turn) {
  if (!turn) return 'none'
  if (
    page.some(
      (message) =>
        message.role === 'ASSISTANT' &&
        message?.requestId === turn.requestId &&
        !['IN_PROGRESS', 'FAILED'].includes(message?.requestStatus),
    )
  )
    return 'completed'
  const index = page.findIndex(
    (message) =>
      message.role === 'USER' && message?.requestId === turn.requestId,
  )
  if (
    index >= 0 &&
    page
      .slice(index + 1)
      .some(
        (message) =>
          message.role === 'USER' && message?.requestId !== turn.requestId,
      )
  )
    return 'stale'
  if (index >= 0 && page[index]?.requestStatus === 'IN_PROGRESS') return 'busy'
  return index >= 0 && page[index]?.requestStatus === 'FAILED'
    ? 'failed'
    : 'retry'
}
