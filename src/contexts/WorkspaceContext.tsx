import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/services/api'

interface WorkspaceContextData {
  activeOwnerId: string
  isOwner: boolean
  loading: boolean
}

const WorkspaceContext = createContext<WorkspaceContextData>({} as WorkspaceContextData)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth()
  const [activeOwnerId, setActiveOwnerId] = useState(() => localStorage.getItem('workspaceOwnerId') || '')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isAuthenticated && user) {
      resolveWorkspace()
    }
  }, [isAuthenticated, user])

  async function resolveWorkspace() {
    if (!user) return

    try {
      if (user.isOwner) {
        // Owner always uses their own workspace
        setActiveOwnerId(user.id)
        localStorage.setItem('workspaceOwnerId', user.id)
      } else {
        // Member uses the owner's workspace (from their team membership)
        const res = await api.get('/api/team/my-teams')
        if (res.data.success && res.data.data?.length > 0) {
          const ownerId = res.data.data[0].ownerId
          setActiveOwnerId(ownerId)
          localStorage.setItem('workspaceOwnerId', ownerId)
        }
      }
    } catch { /* silent */ }
    finally {
      setLoading(false)
    }
  }

  const isOwner = user?.isOwner ?? false

  return (
    <WorkspaceContext.Provider value={{ activeOwnerId, isOwner, loading }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
