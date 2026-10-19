import { BrowserRouter } from 'react-router'
import { AppRoutes } from '@/app/router'
import { ReadinessProvider } from '@/app/ReadinessProvider'

export default function App() {
  return (
    <BrowserRouter>
      <ReadinessProvider>
        <AppRoutes />
      </ReadinessProvider>
    </BrowserRouter>
  )
}
