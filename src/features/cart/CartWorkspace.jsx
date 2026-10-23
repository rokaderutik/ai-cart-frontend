import { ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { formatPrice } from '@/lib/format'
import { CartSummary } from './CartSummary'

export function CartWorkspace({ children, ...props }) {
  const count = props.cart.items.reduce(
    (total, item) => total + item.quantity,
    0,
  )
  return (
    <>
      <div className="sticky top-2 z-10 mb-4 flex items-center justify-between gap-3 rounded-xl border bg-white/95 p-3 shadow-sm lg:hidden">
        <p className="flex items-center gap-2 text-sm font-medium">
          <ShoppingBag className="size-4 text-primary" aria-hidden="true" />
          {count} items · {formatPrice(props.cart.total)}
        </p>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              View cart
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle className="display-heading mt-2 pr-9 text-3xl">
              Your meal, so far.
            </DialogTitle>
            <DialogDescription className="mb-6 mt-3 text-sm text-muted-foreground">
              Manage your dishes and quantities.
            </DialogDescription>
            <CartSummary {...props} />
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {children}
        <aside className="sticky top-6 hidden min-w-0 lg:block">
          <CartSummary {...props} />
        </aside>
      </div>
    </>
  )
}
