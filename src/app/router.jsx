import { Route, Routes } from 'react-router'
import { AppLayout } from '@/layouts/AppLayout'
import { ChatGate } from '@/app/ChatGate'
import { WelcomePage } from '@/pages/WelcomePage'
import { ChatPage } from '@/pages/ChatPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<WelcomePage />} />
        <Route element={<ChatGate />}>
          <Route path="chat" element={<ChatPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
