import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/format'
import { SourceDetails } from './SourceDetails'

export function RecommendationCard({
  item,
  position,
  quantity,
  disabled,
  onAdd,
  sources,
}) {
  const name = typeof item?.name === 'string' ? item.name : 'Recommended dish'
  const available = item?.available === true && Number.isInteger(item?.id)
  const tags = Array.isArray(item?.dietaryTags)
    ? item.dietaryTags.filter((tag) => typeof tag === 'string')
    : []
  const source = sources.find(
    (candidate) =>
      candidate?.sourceType === 'MENU' && candidate?.title === name,
  )
  return (
    <article
      aria-label={`Recommendation ${position}: ${name}`}
      className="flex min-w-0 flex-col rounded-xl border bg-background/60 p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {position}
        </span>
        {!available && <Badge variant="outline">Unavailable</Badge>}
      </div>
      <h3 className="text-sm font-semibold [overflow-wrap:anywhere]">{name}</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
        {typeof item?.description === 'string' ? item.description : ''}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="outline"
            className="bg-white text-[10px] font-normal capitalize"
          >
            {tag.replaceAll('_', ' ').toLowerCase()}
          </Badge>
        ))}
        {Number.isInteger(item?.spiceLevel) &&
          item.spiceLevel >= 0 &&
          item.spiceLevel <= 5 && (
            <Badge
              variant="outline"
              className="bg-white text-[10px] font-normal"
            >
              Spice {item.spiceLevel}/5
            </Badge>
          )}
      </div>
      <div className="mt-auto pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold">
            {Number.isFinite(item?.price)
              ? formatPrice(item.price)
              : 'Price unavailable'}
          </span>
          {quantity > 0 && (
            <span className="text-xs text-muted-foreground">
              {quantity} in cart
            </span>
          )}
        </div>
        <Button
          className="w-full"
          variant="outline"
          disabled={disabled || !available || quantity >= 20}
          onClick={() => onAdd(item.id, quantity + 1)}
          aria-label={`Add ${name}`}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {quantity >= 20
            ? 'Maximum 20 in cart'
            : quantity > 0
              ? 'Add one more'
              : 'Add to cart'}
        </Button>
        {source && (
          <div className="mt-2">
            <SourceDetails source={source} />
          </div>
        )}
      </div>
    </article>
  )
}
