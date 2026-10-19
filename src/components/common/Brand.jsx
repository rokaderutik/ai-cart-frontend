import { UtensilsCrossed } from 'lucide-react'
import { Link } from 'react-router'

export function Brand() {
  return (
    <Link
      to="/"
      aria-label="AI Cart home"
      className="inline-flex shrink-0 items-center gap-2.5 rounded-sm"
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-white">
        <UtensilsCrossed className="size-[18px]" aria-hidden="true" />
      </span>
      <span className="text-xl font-semibold tracking-[-0.06em]">
        ai cart<span className="text-primary">.</span>
      </span>
    </Link>
  )
}
