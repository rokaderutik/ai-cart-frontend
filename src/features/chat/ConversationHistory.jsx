import { useEffect, useRef } from 'react'
import { Bot, BookOpen, UserRound } from 'lucide-react'
import { SourceDetails } from './SourceDetails'
import { RecommendationCard } from './RecommendationCard'
import { ChatProgress } from './ChatProgress'

function MessageContent({ message, cart, disabled, onAdd }) {
  const metadata = message?.metadata
  const sources = Array.isArray(metadata?.sources) ? metadata.sources : []
  const sections = Array.isArray(metadata?.sections)
    ? metadata.sections.filter(
        (section) => typeof section?.text === 'string' && section.text.trim(),
      )
    : []
  const recommendations = Array.isArray(metadata?.recommendations)
    ? metadata.recommendations
    : []
  const assistant = message.role === 'ASSISTANT'
  return (
    <>
      {assistant && sections.length ? (
        <div className="space-y-4">
          {sections.map((section, index) => (
            <div key={index}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                {section.text}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-4">
                {(Array.isArray(section?.sourceIds)
                  ? section.sourceIds
                  : []
                ).map((id) => {
                  const source = sources.find(
                    (candidate) => candidate?.sourceId === id,
                  )
                  return source ? (
                    <SourceDetails key={id} source={source} />
                  ) : null
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
          {message.content}
        </p>
      )}
      {assistant && recommendations.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {recommendations.map((item, index) => (
            <RecommendationCard
              key={item?.id ?? index}
              item={item}
              position={index + 1}
              quantity={
                cart?.items?.find((line) => line.itemId === item?.id)
                  ?.quantity ?? 0
              }
              disabled={disabled}
              onAdd={onAdd}
              sources={sources}
            />
          ))}
        </div>
      )}
      {assistant && sources.length > 0 && (
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer rounded py-1 font-medium text-primary">
            <BookOpen className="mr-1 inline size-3.5" aria-hidden="true" />{' '}
            Supporting sources ({sources.length})
          </summary>
          <div className="mt-2 flex flex-col items-start gap-1">
            {sources.map((source, index) => (
              <SourceDetails key={source?.sourceId ?? index} source={source} />
            ))}
          </div>
        </details>
      )}
      {assistant && metadata?.actionResult?.outcome === 'CART_UPDATED' && (
        <p className="mt-3 rounded-lg bg-[#edf3e9] px-3 py-2 text-xs font-medium text-[#496a36]">
          Cart updated · quantity {metadata.actionResult.quantity ?? 0}
        </p>
      )}
      {message?.requestStatus === 'IN_PROGRESS' && (
        <p className="mt-3 text-xs text-muted-foreground">Awaiting a reply.</p>
      )}
      {message?.requestStatus === 'FAILED' && (
        <p className="mt-3 text-xs text-destructive">
          This request did not complete.
        </p>
      )}
    </>
  )
}

export function ConversationHistory({
  messages,
  hasEarlier,
  cart,
  disabled,
  onAdd,
  sending,
}) {
  const scrollRef = useRef(null)
  const followLatest = useRef(true)
  useEffect(() => {
    const element = scrollRef.current
    if (element && followLatest.current)
      element.scrollTop = element.scrollHeight
  }, [messages, sending])
  return (
    <div
      ref={scrollRef}
      onScroll={() => {
        const element = scrollRef.current
        followLatest.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 100
      }}
      tabIndex={0}
      role="region"
      aria-label="Messages"
      className="max-h-[65svh] min-h-72 space-y-6 overflow-y-auto p-4 focus-visible:outline-primary sm:p-6"
    >
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
                <MessageContent
                  message={message}
                  cart={cart}
                  disabled={disabled}
                  onAdd={onAdd}
                />
              </div>
            </div>
          </article>
        )
      })}
      {sending && <ChatProgress />}
    </div>
  )
}
