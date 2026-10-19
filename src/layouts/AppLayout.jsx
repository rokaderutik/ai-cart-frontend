import { ArrowUpRight, Sparkles } from 'lucide-react'
import { Outlet } from 'react-router'
import { Brand } from '@/components/common/Brand'

export function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-white p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <header className="border-b border-border/80">
        <div className="mx-auto flex h-20 max-w-[1240px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
          <Brand />
          <nav aria-label="Main navigation" className="flex items-center gap-8">
            <a
              href="/#how-it-works"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              How it works{' '}
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
            <span className="hidden items-center gap-2 border-l pl-8 text-xs text-muted-foreground sm:flex">
              <Sparkles className="size-3.5 text-primary" aria-hidden="true" />{' '}
              A little help choosing
            </span>
          </nav>
        </div>
      </header>
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <footer className="mt-8 border-t border-border/80">
        <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-3 px-5 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-8 lg:px-12">
          <p className="flex items-center gap-2">
            <span className="font-semibold text-foreground">ai cart.</span>{' '}
            Thoughtfully chosen. Happily enjoyed.
          </p>
          <p>Good food starts with a conversation.</p>
        </div>
      </footer>
    </div>
  )
}
