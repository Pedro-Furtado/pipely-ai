import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ChevronsUpDown,
  LogOut,
  UserCog,
  User,
  Bell,
  ArrowLeft,
  Check,
  CheckCheck,
  Trash2,
  Users,
  Palette,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { notificationService, type Notification } from '@/services/notifications'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type View = 'menu' | 'notifications' | 'theme'

const THEME_COLORS = [
  { name: 'Azul', value: '#3b82f6' },
  { name: 'Violeta', value: '#8b5cf6' },
  { name: 'Rosa', value: '#ec4899' },
  { name: 'Vermelho', value: '#ef4444' },
  { name: 'Laranja', value: '#f97316' },
  { name: 'Amarelo', value: '#eab308' },
  { name: 'Verde', value: '#22c55e' },
  { name: 'Esmeralda', value: '#10b981' },
  { name: 'Ciano', value: '#06b6d4' },
  { name: 'Indigo', value: '#6366f1' },
]

function applyPrimaryColor(color: string) {
  document.documentElement.style.setProperty('--color-primary', color)
  document.documentElement.style.setProperty('--color-ring', color)
}

function getStoredColor(): string {
  return localStorage.getItem('pipely-primary-color') || '#3b82f6'
}

interface NavUserProps {
  collapsed?: boolean
}

export default function NavUser({ collapsed = false }: NavUserProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('menu')
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loadingNotifs, setLoadingNotifs] = useState(false)
  const [activeColor, setActiveColor] = useState(getStoredColor)
  const ref = useRef<HTMLDivElement>(null)

  // Apply stored color on mount
  useEffect(() => {
    applyPrimaryColor(activeColor)
  }, [])

  const loadUnreadCount = useCallback(async () => {
    try {
      const res = await notificationService.unreadCount()
      if (res.success && res.data) setUnreadCount(res.data.count)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    loadUnreadCount()
    const interval = setInterval(loadUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [loadUnreadCount])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setView('menu')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function openNotifications() {
    setView('notifications')
    setLoadingNotifs(true)
    try {
      const res = await notificationService.list()
      if (res.success && res.data) setNotifications(res.data)
    } catch {
      toast.error('Erro ao carregar notificacoes')
    } finally {
      setLoadingNotifs(false)
    }
  }

  async function handleMarkRead(id: string) {
    await notificationService.markRead(id)
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  async function handleMarkAllRead() {
    await notificationService.markAllRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  async function handleDeleteNotif(id: string) {
    const n = notifications.find((notif) => notif.id === id)
    await notificationService.remove(id)
    setNotifications((prev) => prev.filter((notif) => notif.id !== id))
    if (n && !n.read) setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  async function handleLogout() {
    try {
      await logout()
      toast.success('Voce saiu da sua conta')
      navigate('/login')
    } catch {
      toast.error('Erro ao sair. Tente novamente.')
    }
  }

  function handleNavigate(path: string) {
    setOpen(false)
    setView('menu')
    navigate(path)
  }

  function handleClose() {
    setOpen(false)
    setView('menu')
  }

  function formatTime(date: string): string {
    const diff = Date.now() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'agora'
    if (minutes < 60) return `${minutes}min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
  }

  return (
    <>
      <div ref={ref} className="relative">
        {/* Trigger */}
        <button
          type="button"
          onClick={() => {
            if (open) handleClose()
            else setOpen(true)
          }}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-zinc-800',
            collapsed && 'justify-center px-0'
          )}
        >
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
            <User size={14} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-0.5 text-[9px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 truncate">
                <p className="truncate text-sm font-medium text-zinc-50">
                  {user?.name}
                </p>
                <p className="truncate text-xs text-zinc-400">{user?.email}</p>
              </div>
              <ChevronsUpDown size={14} className="shrink-0 text-zinc-400" />
            </>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className={cn(
              'absolute z-50 rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl',
              collapsed ? 'bottom-0 left-full ml-2' : 'bottom-full left-0 mb-2',
              view === 'notifications' ? 'w-80' : 'min-w-[220px]'
            )}
          >
            {view === 'menu' ? (
              /* ── Menu view ── */
              <div className="p-1">
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-medium text-zinc-50">
                    {user?.name}
                  </p>
                  <p className="truncate text-xs text-zinc-400">{user?.email}</p>
                </div>

                <div className="my-1 h-px bg-zinc-800" />

                <button
                  type="button"
                  onClick={openNotifications}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
                >
                  <Bell size={16} />
                  <span>Notificacoes</span>
                  {unreadCount > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500/20 px-1 text-[10px] font-medium text-blue-400">
                      {unreadCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleNavigate('/conta')}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
                >
                  <UserCog size={16} />
                  <span>Minha conta</span>
                </button>

                <button
                  type="button"
                  onClick={() => setView('theme')}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-50"
                >
                  <Palette size={16} />
                  <span>Cor do tema</span>
                </button>

                <div className="my-1 h-px bg-zinc-800" />

                <button
                  type="button"
                  onClick={() => {
                    handleClose()
                    setShowLogoutDialog(true)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-red-400/10 hover:text-red-400"
                >
                  <LogOut size={16} />
                  <span>Sair</span>
                </button>
              </div>
            ) : (
              /* ── Notifications view ── */
              view === 'notifications' ? (
              <>
                <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setView('menu')}
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50"
                    >
                      <ArrowLeft size={14} />
                    </button>
                    <span className="text-sm font-medium text-zinc-200">Notificacoes</span>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                      title="Marcar todas como lidas"
                    >
                      <CheckCheck size={14} />
                    </button>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto">
                  {loadingNotifs ? (
                    <div className="flex justify-center py-8">
                      <Spinner />
                    </div>
                  ) : notifications.length === 0 ? (
                    <p className="py-8 text-center text-xs text-zinc-600">
                      Nenhuma notificacao
                    </p>
                  ) : (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={cn(
                          'group relative border-b border-zinc-800/50 px-3 py-2.5',
                          !notif.read && 'bg-zinc-800/20'
                        )}
                      >
                        <div className="flex gap-2.5">
                          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800">
                            {notif.type === 'team_invite' ? (
                              <Users size={11} className="text-blue-400" />
                            ) : notif.type === 'team_invite_response' ? (
                              <Users size={11} className="text-green-400" />
                            ) : (
                              <Bell size={11} className="text-zinc-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-[11px] font-medium text-zinc-200">{notif.title}</p>
                              <span className="shrink-0 text-[10px] text-zinc-600">
                                {formatTime(notif.createdAt)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-zinc-500">{notif.message}</p>

                          </div>
                        </div>

                        {/* Hover actions */}
                        <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          {!notif.read && (
                            <button
                              type="button"
                              onClick={() => handleMarkRead(notif.id)}
                              className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                            >
                              <Check size={10} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteNotif(notif.id)}
                            className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>

                        {!notif.read && (
                          <div className="absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-blue-500" />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              /* ── Theme view ── */
              <>
                <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setView('menu')}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50"
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <span className="text-sm font-medium text-zinc-200">Cor do tema</span>
                </div>
                <div className="grid grid-cols-5 gap-2 p-3">
                  {THEME_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => {
                        applyPrimaryColor(color.value)
                        setActiveColor(color.value)
                        localStorage.setItem('pipely-primary-color', color.value)
                      }}
                      className="group flex flex-col items-center gap-1"
                      title={color.name}
                    >
                      <div
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all',
                          activeColor === color.value
                            ? 'border-white scale-110'
                            : 'border-transparent hover:scale-105'
                        )}
                        style={{ backgroundColor: color.value }}
                      >
                        {activeColor === color.value && <Check size={14} className="text-white" />}
                      </div>
                      <span className="text-[9px] text-zinc-500 group-hover:text-zinc-300">{color.name}</span>
                    </button>
                  ))}
                </div>
              </>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deseja sair?</AlertDialogTitle>
            <AlertDialogDescription>
              Voce sera desconectado da sua conta e redirecionado para a tela de login.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              Sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
