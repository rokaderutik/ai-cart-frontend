import { useId } from 'react'
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/format'

export function CartSummary({
  cart,
  disabled,
  error,
  pending,
  needsRefresh,
  busy,
  onUpdate,
  onRetry,
  onRefresh,
}) {
  const heading = useId()
  return (
    <section
      aria-labelledby={heading}
      className="rounded-2xl border bg-white p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id={heading}
          className="flex items-center gap-2 text-base font-semibold"
        >
          <ShoppingBag className="size-4 text-primary" aria-hidden="true" />{' '}
          Your cart
        </h2>
        <span className="text-xs text-muted-foreground">
          {cart.items.reduce((count, item) => count + item.quantity, 0)} items
        </span>
      </div>
      {cart.items.length === 0 ? (
        <div className="py-10 text-center">
          <ShoppingBag
            className="mx-auto mb-3 size-8 text-primary/40"
            aria-hidden="true"
          />
          <p className="text-sm font-medium">
            A little room for something good.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Add a recommendation or ask AI Cart to add a dish.
          </p>
        </div>
      ) : (
        <ul className="my-5 divide-y">
          {cart.items.map((item) => (
            <li key={item.itemId} className="py-4 first:pt-0">
              <div className="flex items-start justify-between gap-3 text-sm">
                <p className="min-w-0 font-medium [overflow-wrap:anywhere]">
                  {item.name}
                </p>
                <span className="shrink-0">{formatPrice(item.lineTotal)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatPrice(item.unitPrice)} each
                {item.available === false ? ' · Currently unavailable' : ''}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div
                  role="group"
                  aria-label={`Quantity for ${item.name}`}
                  className="flex items-center rounded-lg border"
                >
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={
                      disabled ||
                      (item.available === false && item.quantity > 1)
                    }
                    aria-label={`Decrease ${item.name}`}
                    onClick={() =>
                      void onUpdate(item.itemId, item.quantity - 1)
                    }
                  >
                    <Minus className="size-3.5" aria-hidden="true" />
                  </Button>
                  <span
                    className="min-w-7 text-center text-sm"
                    aria-label={`Quantity: ${item.quantity}`}
                  >
                    {item.quantity}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={
                      disabled || !item.available || item.quantity >= 20
                    }
                    aria-label={`Increase ${item.name}`}
                    onClick={() =>
                      void onUpdate(item.itemId, item.quantity + 1)
                    }
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  className="text-xs text-muted-foreground"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => void onUpdate(item.itemId, 0)}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" /> Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-between border-t pt-4 text-sm font-semibold">
        <span>Total</span>
        <span>{formatPrice(cart.total)}</span>
      </div>
      {(error || pending || needsRefresh) && (
        <div
          role="alert"
          className="mt-4 rounded-xl border bg-background p-3 text-xs leading-relaxed"
        >
          <p>{error || 'The latest cart needs to be confirmed.'}</p>
          {pending && (
            <p className="mt-2">
              We couldn’t confirm the update. Retry the same quantity before
              making another change.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {pending ? (
              <Button size="sm" disabled={busy} onClick={() => void onRetry()}>
                Retry cart update
              </Button>
            ) : needsRefresh ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void onRefresh()}
              >
                Refresh cart
              </Button>
            ) : null}
          </div>
        </div>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Your cart is saved with this conversation. Checkout is not available.
      </p>
    </section>
  )
}
