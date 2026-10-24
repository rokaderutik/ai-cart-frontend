import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/alert-dialog'

export function ConversationFeedback({
  error,
  pending,
  historyPending,
  busy,
  onRetry,
  onCheck,
  onResubmit,
  canResubmit,
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
      {pending && error?.retryable && (
        <p className="mt-2 text-xs text-muted-foreground">
          One retry is available for this message.
        </p>
      )}
      {(pending || historyPending || error?.resubmitText) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pending && (error?.retryable || error?.resumeAllowed) && (
            <Button size="sm" disabled={busy} onClick={() => void onRetry()}>
              {error?.resumeAllowed
                ? 'Recover original request'
                : 'Retry message'}
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
      {error?.resubmitText && (
        <div className="mt-3">
          <ConfirmDialog
            title="Send this as a new message?"
            description={`This creates a new request and may change your cart. Only continue if you want to send it again: ${error.resubmitText}`}
            actionLabel="Send new message"
            cancelLabel="Cancel"
            onConfirm={() => void onResubmit(error.resubmitText)}
            trigger={
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !canResubmit}
              >
                Send as new message
              </Button>
            }
          />
        </div>
      )}
    </div>
  )
}
