import { ArrowDown, ListChecks, MessageCircle, ShoppingBag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { MealIllustration } from '@/components/common/MealIllustration'
import { HealthStatus } from '@/features/health/HealthStatus'
import { Separator } from '@/components/ui/separator'

const steps = [
  {
    number: '01',
    icon: MessageCircle,
    title: 'Tell us what sounds good',
    description:
      'A craving, a preference, or “surprise me.” Start with what’s on your mind.',
  },
  {
    number: '02',
    icon: ListChecks,
    title: 'Find your kind of delicious',
    description:
      'Explore thoughtful suggestions, with the menu details behind every choice.',
  },
  {
    number: '03',
    icon: ShoppingBag,
    title: 'Make it your meal',
    description:
      'Build your cart naturally, with a conversation or a simple click.',
  },
]

export function WelcomePage() {
  return (
    <div className="mx-auto max-w-[1240px] px-5 sm:px-8 lg:px-12">
      <section
        aria-labelledby="welcome-title"
        className="grid items-center gap-12 pb-14 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pb-16 lg:pt-16"
      >
        <div className="max-w-[535px]">
          <div className="mb-6 flex items-center gap-2.5 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" /> A little
            guidance. A great meal.
          </div>
          <h1
            id="welcome-title"
            className="display-heading text-[clamp(2.8rem,6vw,4.8rem)] leading-[1.04]"
          >
            Good food starts
            <br className="hidden sm:block" /> with a{' '}
            <span className="italic text-primary">conversation.</span>
          </h1>
          <p className="mb-7 mt-6 max-w-[390px] text-sm leading-[1.85] text-muted-foreground sm:text-[15px]">
            Less scrolling. More savoring. Meet your thoughtful dining
            companion, here to help you find a meal that feels just right.
          </p>
          <HealthStatus />
        </div>
        <MealIllustration />
      </section>
      <Separator />
      <section
        id="how-it-works"
        aria-labelledby="how-title"
        className="scroll-mt-8 py-10 sm:py-12"
      >
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2
              id="how-title"
              className="text-xs font-semibold uppercase tracking-[0.14em]"
            >
              A simpler way to choose
            </h2>
            <Badge
              variant="outline"
              className="rounded-full bg-transparent text-[9px] font-normal text-muted-foreground"
            >
              Made for your appetite
            </Badge>
          </div>
          <ArrowDown
            className="hidden size-4 text-muted-foreground sm:block"
            aria-hidden="true"
          />
        </div>
        <div className="grid gap-7 sm:grid-cols-3 sm:gap-6 lg:gap-12">
          {steps.map(({ number, icon: Icon, title, description }) => (
            <article key={number}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg border bg-white/60">
                  <Icon className="size-3.5 text-primary" aria-hidden="true" />
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  / {number}
                </span>
              </div>
              <h3 className="text-sm font-semibold tracking-[-0.02em]">
                {title}
              </h3>
              <p className="mt-2 max-w-[285px] text-xs leading-[1.8] text-muted-foreground">
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
