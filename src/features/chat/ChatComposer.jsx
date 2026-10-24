import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

const suggestions = [
  {
    label: 'Mild & vegetarian',
    message: 'Suggest mild vegetarian mains under 300 rupees.',
  },
  {
    label: 'Takeaway details',
    message: 'What should I know about takeaway packaging?',
  },
  {
    label: 'Help me choose',
    message: 'Suggest vegan mains and explain takeaway packaging.',
  },
]

export function ChatComposer({ disabled, onSend, showSuggestions }) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)
  const restoreFocus = useRef(false)
  useEffect(() => {
    if (!disabled && restoreFocus.current) {
      if (document.activeElement === document.body)
        inputRef.current?.focus({ preventScroll: true })
      restoreFocus.current = false
    }
  }, [disabled])
  const text = draft.trim()
  function submit(event) {
    event.preventDefault()
    if (disabled || !text || text.length > 2000) return
    setDraft('')
    restoreFocus.current = true
    void onSend(text)
  }
  return (
    <div className="border-t bg-background/70 p-4 sm:p-5">
      {showSuggestions && (
        <div
          className="mb-4 flex flex-wrap gap-2"
          aria-label="Suggested questions"
        >
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion.label}
              variant="outline"
              size="sm"
              className="h-auto whitespace-normal rounded-full bg-white py-2 text-xs"
              disabled={disabled}
              onClick={() => void onSend(suggestion.message)}
            >
              <Sparkles className="size-3" aria-hidden="true" />
              {suggestion.label}
            </Button>
          ))}
        </div>
      )}
      <form onSubmit={submit}>
        <label htmlFor="chat-message" className="sr-only">
          Message AI Cart
        </label>
        <textarea
          id="chat-message"
          ref={inputRef}
          rows={3}
          maxLength={2000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={disabled}
          placeholder="What are you in the mood for?"
          aria-describedby="composer-note message-limit"
          className="block w-full resize-none rounded-xl border bg-white px-4 py-3 text-base placeholder:text-muted-foreground disabled:opacity-60 sm:text-sm"
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              event.currentTarget.form.requestSubmit()
            }
          }}
        />
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="text-xs leading-relaxed text-muted-foreground">
            <p id="composer-note">
              {disabled
                ? 'Finish the current request before continuing.'
                : 'Enter to send · Shift + Enter for a new line'}
            </p>
            <p id="message-limit" className="mt-1">
              {draft.length.toLocaleString()} / 2,000 characters
            </p>
          </div>
          <Button
            type="submit"
            disabled={disabled || !text || text.length > 2000}
            size="icon"
            aria-label="Send message"
          >
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  )
}
