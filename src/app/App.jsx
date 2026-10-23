import { BrowserRouter } from 'react-router'
import { AppRoutes } from '@/app/router'
import { ReadinessProvider } from '@/app/ReadinessProvider'
import { SessionProvider } from '@/app/SessionProvider'

export default function App() {
  return (
    <BrowserRouter>
      <ReadinessProvider>
        <SessionProvider>
          <AppRoutes />
        </SessionProvider>
      </ReadinessProvider>
    </BrowserRouter>
  )
}
