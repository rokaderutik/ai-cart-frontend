import { ArrowLeft, MessageCircle, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export function ChatPage() {
  return (
    <section
      className="mx-auto flex max-w-2xl flex-col items-center px-5 py-20 text-center sm:py-28"
      aria-labelledby="chat-title"
    >
      <Badge
        variant="outline"
        className="mb-7 gap-1.5 rounded-full bg-[#edf3e9] px-3 py-1 text-[#496a36]"
      >
        <span className="size-1.5 rounded-full bg-[#496a36]" /> Service
        connected
      </Badge>
      <span className="mb-6 flex size-16 items-center justify-center rounded-2xl border bg-white text-primary">
        <MessageCircle className="size-7" aria-hidden="true" />
      </span>
      <h1 id="chat-title" className="display-heading text-4xl sm:text-5xl">
        A good conversation
        <br />
        is on the <span className="italic text-primary">menu.</span>
      </h1>
      <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
        You’re connected and ready. We’re still preparing the chat
        experience—messaging will arrive in a later phase.
      </p>
      <Card className="mb-8 mt-8 w-full max-w-md border-dashed bg-white/50 py-0 shadow-none">
        <CardContent className="flex items-start gap-3 p-5 text-left">
          <Sparkles
            className="mt-0.5 size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Soon, you’ll be able to discover dishes, explore their sources, and
            build your cart right here.
          </p>
        </CardContent>
      </Card>
      <Button variant="outline" asChild className="bg-white">
        <Link to="/">
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to welcome
        </Link>
      </Button>
    </section>
  )
}
