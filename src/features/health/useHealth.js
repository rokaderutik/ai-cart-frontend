import { useContext, useEffect, useSyncExternalStore } from 'react'
import { ReadinessContext } from '@/features/health/readiness-context'

export function useHealth() {
  const store = useContext(ReadinessContext)
  if (!store) throw new Error('useHealth must be used inside ReadinessProvider')
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)

  useEffect(() => {
    void store.ensureReady()
  }, [store])

  return { ...state, retry: store.retry }
}
