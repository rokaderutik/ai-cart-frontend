import { useContext, useEffect, useSyncExternalStore } from 'react'
import { SessionContext } from './session-context'

export function useSession() {
  const store = useContext(SessionContext)
  if (!store) throw new Error('useSession must be used inside SessionProvider')
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => {
    void store.ensureSession()
  }, [store])
  return {
    ...snapshot,
    retry: store.retry,
    newSession: store.newSession,
    submitMessage: store.submitMessage,
    retryMessage: store.retryMessage,
    updateQuantity: store.updateQuantity,
    retryCart: store.retryCart,
    refreshCart: store.refreshCart,
    checkConversation: store.checkConversation,
  }
}
