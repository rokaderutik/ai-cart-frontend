import { ShoppingBag } from 'lucide-react'
import { formatPrice } from '@/lib/format'

export function CartSummary({ cart }) {
  return (
    <section
      aria-labelledby="cart-heading"
      className="rounded-2xl border bg-white p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="cart-heading"
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
            Your dishes will appear here.
          </p>
        </div>
      ) : (
        <ul className="my-5 divide-y">
          {cart.items.map((item) => (
            <li key={item.itemId} className="py-4 first:pt-0">
              <div className="flex items-start justify-between gap-3 text-sm">
                <p className="min-w-0 break-words font-medium">{item.name}</p>
                <span className="shrink-0">{formatPrice(item.lineTotal)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.quantity} × {formatPrice(item.unitPrice)}
                {item.available === false ? ' · Currently unavailable' : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-between border-t pt-4 text-sm font-semibold">
        <span>Total</span>
        <span>{formatPrice(cart.total)}</span>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Cart editing and ordering through conversation will be available soon.
      </p>
    </section>
  )
}
