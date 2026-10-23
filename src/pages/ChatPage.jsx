import { LoaderCircle, MessageCircle, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { useSession } from '@/features/session/useSession'
import { ConversationHistory } from '@/features/chat/ConversationHistory'
import { ChatComposer } from '@/features/chat/ChatComposer'
import { ConversationFeedback } from '@/features/chat/ConversationFeedback'
import {
  conversationLocked,
  hasPendingHistory,
} from '@/features/chat/conversation-actions'
import { CartWorkspace } from '@/features/cart/CartWorkspace'

const activityCopy = {
  chat: 'AI Cart is preparing your reply…',
  cart: 'Updating your cart…',
  reconcile: 'Checking your conversation and cart…',
  refresh: 'Refreshing your cart…',
}

export function ChatPage() {
  const session = useSession()
  const {
    status,
    messages,
    nextBefore,
    cart,
    error,
    notice,
    retry,
    newSession,
    activity,
  } = session
  const ready = status === 'ready'
  const locked = conversationLocked(session)
  return (
    <div className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8 lg:px-12">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-primary">
            Your table is waiting
          </p>
          <h1 className="display-heading text-3xl sm:text-4xl">
            Let’s find your{' '}
            <span className="italic text-primary">next favorite.</span>
          </h1>
        </div>
        <ConfirmDialog
          title="Start a new conversation?"
          description="This permanently deletes this session’s conversation and cart. Your new session will start empty."
          actionLabel="Start new session"
          onConfirm={() => void newSession()}
          trigger={
            <Button variant="outline" disabled={!ready || Boolean(activity)}>
              <Plus aria-hidden="true" /> New Session
            </Button>
          }
        />
      </div>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="mb-5 text-sm text-muted-foreground"
      >
        {status === 'loading' || status === 'idle' ? (
          <span className="flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{' '}
            Opening your conversation and restoring your cart…
          </span>
        ) : status === 'resetting' ? (
          'Ending your previous session…'
        ) : ready ? (
          activityCopy[activity] ||
          notice ||
          'Your conversation and cart are ready.'
        ) : (
          'Your conversation could not be opened.'
        )}
      </div>
      {status === 'failed' ? (
        <div role="alert" className="rounded-2xl border bg-white p-6">
          <h2 className="font-semibold">We couldn’t open your conversation</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-5" onClick={() => void retry()}>
            Try again
          </Button>
        </div>
      ) : !ready ? (
        <div
          className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
          aria-busy="true"
        >
          <div className="h-80 rounded-2xl border bg-white/70" />
          <div className="h-56 rounded-2xl border bg-white/70" />
        </div>
      ) : (
        <CartWorkspace
          cart={cart}
          disabled={locked}
          error={session.cartError}
          pending={session.pendingCart}
          needsRefresh={session.cartNeedsRefresh}
          busy={Boolean(activity)}
          onUpdate={session.updateQuantity}
          onRetry={session.retryCart}
          onRefresh={session.refreshCart}
        >
          <section
            aria-label="Conversation"
            className="min-w-0 overflow-hidden rounded-2xl border bg-white/40"
          >
            <div className="border-b px-5 py-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />{' '}
                Your dining companion
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Anonymous session · saved in this browser tab for up to 24 hours
              </p>
            </div>
            {messages.length ? (
              <ConversationHistory
                messages={messages}
                hasEarlier={nextBefore != null}
                cart={cart}
                disabled={locked}
                onAdd={session.updateQuantity}
                sending={activity === 'chat'}
              />
            ) : (
              <div className="mx-auto min-h-72 max-w-sm px-5 py-12 text-center">
                <MessageCircle
                  className="mx-auto mb-5 size-9 text-primary/60"
                  aria-hidden="true"
                />
                <h2 className="display-heading text-2xl">
                  Good taste starts here.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Tell us what sounds good, ask about the restaurant, or start
                  with a suggestion below.
                </p>
              </div>
            )}
            <ConversationFeedback
              error={session.chatError}
              pending={session.pendingTurn}
              historyPending={hasPendingHistory(messages)}
              busy={Boolean(activity)}
              onRetry={session.retryMessage}
              onCheck={session.checkConversation}
            />
            {session.cartNeedsRefresh && (
              <div className="mx-4 mb-4 rounded-xl border bg-white p-4 text-sm sm:mx-6">
                <p>Confirm your latest cart before sending another message.</p>
                <Button
                  className="mt-3"
                  variant="outline"
                  size="sm"
                  disabled={Boolean(activity)}
                  onClick={() => void session.refreshCart()}
                >
                  Refresh cart
                </Button>
              </div>
            )}
            {session.pendingCart && (
              <p className="mx-4 mb-4 text-xs text-muted-foreground sm:mx-6">
                Confirm the pending update in your cart before continuing.
              </p>
            )}
            <ChatComposer
              disabled={locked}
              onSend={session.submitMessage}
              showSuggestions={messages.length === 0}
            />
          </section>
        </CartWorkspace>
      )}
    </div>
  )
}
