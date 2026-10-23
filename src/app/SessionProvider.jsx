import { useEffect, useState } from 'react'
import { SessionContext } from '@/features/session/session-context'
import { createSessionStore } from '@/features/session/session-store'

export function SessionProvider({ children, store: providedStore }) {
  const [store] = useState(() => providedStore ?? createSessionStore())
  useEffect(() => () => store.cancel(), [store])
  return <SessionContext value={store}>{children}</SessionContext>
}
