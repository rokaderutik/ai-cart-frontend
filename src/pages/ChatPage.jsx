import { LoaderCircle, MessageCircle, Plus, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { useSession } from '@/features/session/useSession'
import { ConversationHistory } from '@/features/chat/ConversationHistory'
import { CartSummary } from '@/features/cart/CartSummary'

export function ChatPage() {
  const {
    status,
    messages,
    nextBefore,
    cart,
    error,
    notice,
    retry,
    newSession,
  } = useSession()

  const ready = status === 'ready'
  
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
            <Button variant="outline" disabled={!ready}>
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
          notice || 'Your conversation and cart are ready.'
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
          className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
          aria-busy="true"
        >
          <div className="h-80 rounded-2xl border bg-white/70" />
          <div className="h-56 rounded-2xl border bg-white/70" />
        </div>
      ) : (
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section
            aria-label="Conversation"
            className="min-w-0 rounded-2xl border bg-white/40"
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
            <div className="min-h-72 p-4 sm:p-6">
              {messages.length ? (
                <ConversationHistory
                  messages={messages}
                  hasEarlier={nextBefore != null}
                />
              ) : (
                <div className="mx-auto max-w-sm py-12 text-center">
                  <MessageCircle
                    className="mx-auto mb-5 size-9 text-primary/60"
                    aria-hidden="true"
                  />
                  <h2 className="display-heading text-2xl">
                    Good taste starts here.
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Your session is ready. Soon you can ask about dishes,
                    explore the details, and build your meal.
                  </p>
                </div>
              )}
            </div>
            <div className="border-t p-4 sm:p-5">
              <label htmlFor="chat-message" className="sr-only">
                Message AI Cart
              </label>
              <textarea
                id="chat-message"
                rows={2}
                disabled
                placeholder="What are you in the mood for?"
                aria-describedby="composer-note"
                className="block w-full resize-none rounded-xl border bg-white px-4 py-3 text-sm placeholder:text-muted-foreground disabled:opacity-70"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p
                  id="composer-note"
                  className="text-xs leading-relaxed text-muted-foreground"
                >
                  Messaging and cart editing will be available soon.
                </p>
                <Button disabled size="icon" aria-label="Send message">
                  <Send className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </section>
          <aside className="min-w-0 lg:sticky lg:top-6">
            <CartSummary cart={cart} />
          </aside>
        </div>
      )}
    </div>
  )
}
