import { Routes, Route, Navigate } from 'react-router-dom'
import { useSetup } from '@/contexts/SetupContext'
import { Spinner } from '@/components/ui/spinner'
import ProtectedRoute from '@/routes/ProtectedRoute'
import PublicRoute from '@/routes/PublicRoute'
import OwnerOnlyRoute from '@/routes/OwnerOnlyRoute'
import DashboardLayout from '@/components/layout/DashboardLayout'
import Login from '@/pages/auth/Login'
import Register from '@/pages/auth/Register'
import Setup from '@/pages/auth/Setup'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import ResetPassword from '@/pages/auth/ResetPassword'
import Dashboard from '@/pages/dashboard/Dashboard'
import Pipeline from '@/pages/dashboard/Pipeline'
import Time from '@/pages/dashboard/Time'
import Tarefas from '@/pages/dashboard/Tarefas'
import Assistente from '@/pages/dashboard/Assistente'
import WhatsApp from '@/pages/dashboard/WhatsApp'
import Conta from '@/pages/dashboard/Conta'
import Settings from '@/pages/dashboard/Settings'
import NotFound from '@/pages/NotFound'

export default function AppRouter() {
  const { hasOwner, isChecking } = useSetup()

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Spinner size="lg" />
      </div>
    )
  }

  // No owner yet — only setup route available
  if (!hasOwner) {
    return (
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route element={<PublicRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/setup" element={<Navigate to="/login" replace />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          {/* Available in all workspaces */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tarefas" element={<Tarefas />} />
          <Route path="/conta" element={<Conta />} />

          {/* Owner only — redirects to /dashboard if member workspace */}
          <Route element={<OwnerOnlyRoute />}>
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/time" element={<Time />} />
            <Route path="/assistente" element={<Assistente />} />
            <Route path="/whatsapp" element={<WhatsApp />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
