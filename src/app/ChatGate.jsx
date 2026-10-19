import { useState } from 'react'
import { Outlet } from 'react-router'
import { useHealth } from '@/features/health/useHealth'
import { READINESS_FRESH_MS } from '@/features/health/readiness-store'
import { WelcomePage } from '@/pages/WelcomePage'

export function ChatGate() {
  const [enteredAt] = useState(Date.now)
  const { status, readyAt } = useHealth()
  const readyForEntry =
    status === 'ready' && readyAt > enteredAt - READINESS_FRESH_MS

  return readyForEntry ? <Outlet /> : <WelcomePage />
}
