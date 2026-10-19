import { useEffect, useState } from 'react'
import { createReadinessStore } from '@/features/health/readiness-store'
import { ReadinessContext } from '@/features/health/readiness-context'

export function ReadinessProvider({ children, store: providedStore }) {
  const [store] = useState(() => providedStore ?? createReadinessStore())

  useEffect(() => () => store.cancel(), [store])

  return <ReadinessContext value={store}>{children}</ReadinessContext>
}
