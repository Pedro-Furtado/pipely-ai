import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react'
import { api } from '@/services/api'

interface SetupContextData {
  hasOwner: boolean | null
  isChecking: boolean
  markSetupDone: () => void
}

const SetupContext = createContext<SetupContextData>({} as SetupContextData)

export function SetupProvider({ children }: { children: ReactNode }) {
  const [hasOwner, setHasOwner] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    api.get('/api/auth/setup-status')
      .then((res) => {
        setHasOwner(res.data.data?.hasOwner ?? false)
      })
      .catch(() => {
        setHasOwner(false)
      })
      .finally(() => {
        setIsChecking(false)
      })
  }, [])

  function markSetupDone() {
    setHasOwner(true)
  }

  return (
    <SetupContext.Provider value={{ hasOwner, isChecking, markSetupDone }}>
      {children}
    </SetupContext.Provider>
  )
}

export function useSetup() {
  return useContext(SetupContext)
}
