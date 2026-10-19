import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-xl px-5 py-28 text-center">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        404 · A small detour
      </p>
      <h1 className="display-heading text-5xl">This page isn’t on the menu.</h1>
      <p className="mb-7 mt-5 text-sm text-muted-foreground">
        Let’s head back and find something good.
      </p>
      <Button asChild>
        <Link to="/">
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to home
        </Link>
      </Button>
    </section>
  )
}
