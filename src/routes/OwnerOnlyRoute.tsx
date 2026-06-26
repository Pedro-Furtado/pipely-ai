import { Navigate, Outlet } from 'react-router-dom'
import { useWorkspace } from '@/contexts/WorkspaceContext'

export default function OwnerOnlyRoute() {
  const { isOwner, loading } = useWorkspace()

  if (loading) return null

  if (!isOwner) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
