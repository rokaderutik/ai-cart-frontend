import { Bot, BookOpen, UserRound } from 'lucide-react'
import { formatPrice } from '@/lib/format'

function MessageEvidence({ metadata }) {
  const recommendations = Array.isArray(metadata?.recommendations)
    ? metadata.recommendations
    : []
  const sources = Array.isArray(metadata?.sources) ? metadata.sources : []
  return (
    <>
      {recommendations.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {recommendations.map((item, index) => (
            <div
              key={item?.id ?? index}
              className="min-w-0 rounded-xl border bg-background/60 p-4"
            >
              <p className="text-sm font-semibold">
                {item?.name || 'Recommended dish'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {item?.description}
              </p>
              <p className="mt-3 text-xs font-medium">
                {Number.isFinite(item?.price)
                  ? formatPrice(item.price)
                  : 'Price unavailable'}
                {item?.available === false ? ' · Unavailable' : ''}
              </p>
            </div>
          ))}
        </div>
      )}
      {sources.length > 0 && (
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer rounded py-1 font-medium text-primary">
            <BookOpen className="mr-1 inline size-3.5" aria-hidden="true" />{' '}
            Supporting sources ({sources.length})
          </summary>
          <div className="mt-2 space-y-3">
            {sources.map((source, index) => (
              <div
                key={source?.sourceId ?? index}
                className="rounded-lg border p-3"
              >
                <p className="font-semibold">{source?.title || 'Source'}</p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed text-muted-foreground">
                  {source?.content ||
                    source?.snippet ||
                    'No additional detail available.'}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  )
}

export function ConversationHistory({ messages, hasEarlier }) {
  return (
    <div className="space-y-6">
      {hasEarlier && (
        <p className="text-center text-xs text-muted-foreground">
          Showing your most recent messages.
        </p>
      )}
      {messages.map((message) => {
        const assistant = message.role === 'ASSISTANT'
        const Icon = assistant ? Bot : UserRound
        return (
          <article
            key={message.id}
            aria-label={assistant ? 'Assistant message' : 'Your message'}
            className="flex min-w-0 gap-3"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-white text-primary">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-xs font-semibold">
                {assistant ? 'AI Cart' : 'You'}
              </p>
              <div className="rounded-2xl rounded-tl-sm border bg-white p-4 sm:p-5">
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                  {message.content}
                </p>
                {assistant && <MessageEvidence metadata={message?.metadata} />}
                {message?.requestStatus === 'IN_PROGRESS' && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    This request was still processing when history was restored.
                  </p>
                )}
                {message?.requestStatus === 'FAILED' && (
                  <p className="mt-3 text-xs text-destructive">
                    This request did not complete.
                  </p>
                )}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
