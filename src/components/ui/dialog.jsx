import { Dialog as DialogPrimitive } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description

/** shadcn-style sheet using Radix focus trapping, Escape, and focus restoration. */
export function DialogContent({ children, className }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l bg-background p-6 shadow-xl focus:outline-none',
          className,
        )}
      >
        <DialogPrimitive.Close
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full border bg-white"
          aria-label="Close panel"
        >
          <X className="size-4" aria-hidden="true" />
        </DialogPrimitive.Close>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
