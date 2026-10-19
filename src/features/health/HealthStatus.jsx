import {
  ArrowRight,
  Check,
  LoaderCircle,
  RotateCw,
  TriangleAlert,
} from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useHealth } from '@/features/health/useHealth'
import { cn } from '@/lib/utils'

const messages = {
  idle: {
    title: 'Preparing AI Cart…',
    description: 'Just a moment while we get everything ready for you.',
  },
  checking: {
    title: 'Preparing AI Cart…',
    description: 'Just a moment while we get everything ready for you.',
  },
  waking: {
    title: 'Waking up the service…',
    description:
      'Our service is waking up after a period of inactivity. AI Cart runs on Render’s free tier, so the first connection may take a little longer.',
  },
  waiting: {
    title: 'Still getting things ready…',
    description:
      'Thanks for your patience. We’re still waiting for the service to become available.',
  },
  ready: {
    title: 'AI Cart is ready',
    description: 'Everything is connected. Your next great meal starts here.',
  },
  failed: {
    title: 'A little longer than expected',
    description:
      'The service is taking longer than expected. Please try again.',
  },
  configuration: {
    title: 'Connection setup needed',
    description:
      'The service connection is not configured correctly. Please contact the application owner.',
  },
}

export function HealthStatus() {
  const { status, retry } = useHealth()
  const message = messages[status]
  const ready = status === 'ready'
  const failed = ['failed', 'configuration'].includes(status)
  const Icon = ready ? Check : failed ? TriangleAlert : LoaderCircle

  return (
    <Card className="gap-0 rounded-2xl border-border bg-white/90 py-0 shadow-[0_4px_24px_#48381e04]">
      <CardContent className="p-5 sm:p-6">
        <div
          className="flex items-start gap-3.5"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span
            className={cn(
              'relative flex size-10 shrink-0 items-center justify-center rounded-full bg-[#faf0e7] text-primary',
              ready && 'bg-[#edf3e9] text-[#496a36]',
              failed && 'bg-[#fff1ed] text-[#a13820]',
            )}
          >
            {!ready && !failed && (
              <span className="wake-orbit absolute inset-0 rounded-full border border-primary/15 border-t-primary/70" />
            )}
            <Icon
              aria-hidden="true"
              className={cn('size-[18px]', !ready && !failed && 'wake-dot')}
            />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-sm font-semibold">{message.title}</h2>
            <p className="mt-1.5 max-w-sm text-xs leading-[1.7] text-muted-foreground">
              {message.description}
            </p>
          </div>
        </div>
        {failed && (
          <Alert className="sr-only">
            <AlertDescription>{message.description}</AlertDescription>
          </Alert>
        )}
        <div className="mt-5">
          {ready ? (
            <Button
              asChild
              className="h-11 w-full justify-between rounded-lg px-4"
            >
              <Link to="/chat">
                Continue to chat{' '}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : status === 'failed' ? (
            <Button
              onClick={() => void retry()}
              className="h-11 w-full rounded-lg"
            >
              Try again <RotateCw className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              disabled
              className="h-11 w-full justify-between rounded-lg px-4"
            >
              Continue to chat{' '}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
        <p className="mt-3 text-center text-[10px] leading-relaxed text-muted-foreground">
          {ready
            ? 'You’re all set. Let’s find something you’ll love.'
            : failed
              ? 'We’ll be here when you’re ready to try again.'
              : 'We’ll make chat available as soon as the service is ready.'}
        </p>
      </CardContent>
    </Card>
  )
}
