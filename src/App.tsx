import { Toaster } from 'sonner'
import { SetupProvider } from '@/contexts/SetupContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import AppRouter from '@/routes/AppRouter'

export default function App() {
  return (
    <SetupProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <AppRouter />
          <Toaster
            position="top-right"
            theme="dark"
            richColors
            closeButton
          />
        </WorkspaceProvider>
      </AuthProvider>
    </SetupProvider>
  )
}
