import { Button } from '@/components/ui/button'

export function ConversationFeedback({
  error,
  pending,
  historyPending,
  busy,
  onRetry,
  onCheck,
}) {
  if (!error && !historyPending) return null
  return (
    <div
      role="alert"
      className="mx-4 mb-4 rounded-xl border border-primary/20 bg-white p-4 text-sm sm:mx-6"
    >
      <p className="leading-relaxed">
        {error?.message ||
          'A previous message is still processing. Check the conversation before continuing.'}
      </p>
      {(pending || historyPending) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pending && error?.retryable && (
            <Button size="sm" disabled={busy} onClick={() => void onRetry()}>
              Retry message
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void onCheck()}
          >
            Check conversation
          </Button>
        </div>
      )}
    </div>
  )
}
