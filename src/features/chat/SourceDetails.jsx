import { BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function SourceDetails({ source, label }) {
  const title =
    typeof source?.title === 'string' ? source.title : 'Supporting source'
  const snippet = typeof source?.snippet === 'string' ? source.snippet : null
  const content = typeof source?.content === 'string' ? source.content : snippet
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="link"
          size="sm"
          className="h-auto max-w-full justify-start whitespace-normal px-0 py-1 text-left text-xs"
          aria-label={`View source: ${title}`}
        >
          <BookOpen className="size-3.5 shrink-0" aria-hidden="true" />
          {label || title}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <p className="mb-6 mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
          Behind the recommendation
        </p>
        <DialogTitle className="display-heading pr-7 text-3xl [overflow-wrap:anywhere]">
          {title}
        </DialogTitle>
        <DialogDescription className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Supporting restaurant information used for this answer.
        </DialogDescription>
        {snippet && content !== snippet && (
          <p className="mt-6 rounded-xl border bg-white p-4 text-sm leading-relaxed [overflow-wrap:anywhere]">
            {snippet}
          </p>
        )}
        <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
          {content || 'No additional detail available.'}
        </div>
      </DialogContent>
    </Dialog>
  )
}
