import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Workflow,
  Users,
  MessageCircle,
  ClipboardList,
  Bot,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import NavUser from '@/components/layout/NavUser'
import { whatsappService } from '@/services/whatsapp'
import { aiService } from '@/services/ai'

const ownerNavItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Pipeline', icon: Workflow, path: '/pipeline' },
  { label: 'Time', icon: Users, path: '/time' },
  { label: 'Tarefas', icon: ClipboardList, path: '/tarefas' },
  { label: 'Assistente de IA', icon: Bot, path: '/assistente', configKey: 'ai' as const },
  { label: 'WhatsApp', icon: MessageCircle, path: '/whatsapp', configKey: 'whatsapp' as const },
]

const memberNavItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Tarefas', icon: ClipboardList, path: '/tarefas' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true')
  const { isOwner } = useWorkspace()
  const navItems = isOwner ? ownerNavItems : memberNavItems
  const [configStatus, setConfigStatus] = useState<{ whatsapp: boolean; ai: boolean }>({ whatsapp: true, ai: true })

  useEffect(() => {
    if (!isOwner) return
    async function checkConfigs() {
      try {
        const [wpRes, aiRes] = await Promise.all([
          whatsappService.getConfig(),
          aiService.getConfig(),
        ])
        setConfigStatus({
          whatsapp: !!(wpRes.data?.serverUrl),
          ai: !!(aiRes.data?.hasKey),
        })
      } catch { /* silent */ }
    }
    checkConfigs()
  }, [isOwner])

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-zinc-800 px-3">
        <button
          type="button"
          onClick={() => { if (collapsed) { setCollapsed(false); localStorage.setItem('sidebarCollapsed', 'false') } }}
          className={cn('flex items-center gap-2.5', collapsed && 'mx-auto cursor-pointer')}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/80 to-primary shadow-sm">
            <Zap size={16} className="text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold text-zinc-50 truncate">
              Pipely AI
            </span>
          )}
        </button>
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setCollapsed(true); localStorage.setItem('sidebarCollapsed', 'true') }}
            className="shrink-0"
          >
            <ChevronLeft size={16} />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <TooltipProvider>
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => {
            const needsConfig = 'configKey' in item && item.configKey && !configStatus[item.configKey]
            return (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>
                  <div>
                    <NavLink
                      to={item.path}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-50',
                          collapsed && 'justify-center px-0'
                        )
                      }
                    >
                      <div className="relative shrink-0">
                        <item.icon size={18} />
                        {needsConfig && (
                          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-500" />
                        )}
                      </div>
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          {needsConfig && (
                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                              Configurar
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </div>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent>
                    {item.label}{needsConfig ? ' (nao configurado)' : ''}
                  </TooltipContent>
                )}
              </Tooltip>
            )
          })}
        </nav>
      </TooltipProvider>

      {/* Footer */}
      <div className="p-2">
        <Separator className="mb-2" />
        <NavUser collapsed={collapsed} />
      </div>
    </aside>
  )
}
