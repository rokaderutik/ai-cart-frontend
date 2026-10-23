import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'

export function ChatProgress() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 10_000)
    return () => clearTimeout(timer)
  }, [])
  return (
    <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
      <LoaderCircle
        className="size-4 shrink-0 animate-spin text-primary"
        aria-hidden="true"
      />
      {slow
        ? 'Good recommendations can take a moment. Thanks for waiting while we prepare your reply.'
        : 'AI Cart is preparing your reply…'}
    </p>
  )
}
