import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface WorkspaceContextData {
  activeOwnerId: string
  isOwner: boolean
  loading: boolean
}

const WorkspaceContext = createContext<WorkspaceContextData>({} as WorkspaceContextData)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isAuthenticated && user) {
      setLoading(false)
    }
  }, [isAuthenticated, user])

  const activeOwnerId = user?.id || ''
  const isOwner = true // Single owner mode

  return (
    <WorkspaceContext.Provider value={{ activeOwnerId, isOwner, loading }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
