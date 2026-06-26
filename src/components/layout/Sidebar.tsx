import { useState } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import NavUser from '@/components/layout/NavUser'

const ownerNavItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Pipeline', icon: Workflow, path: '/pipeline' },
  { label: 'Time', icon: Users, path: '/time' },
  { label: 'Tarefas', icon: ClipboardList, path: '/tarefas' },
  { label: 'Assistente de IA', icon: Bot, path: '/assistente' },
  { label: 'WhatsApp', icon: MessageCircle, path: '/whatsapp' },
]

const memberNavItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Tarefas', icon: ClipboardList, path: '/tarefas' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true')
  const { isOwner } = useWorkspace()
  const navItems = isOwner ? ownerNavItems : memberNavItems

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-zinc-800 px-3">
        {!collapsed && (
          <span className="text-sm font-semibold text-zinc-50 truncate">
            Pipely AI
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { const next = !collapsed; setCollapsed(next); localStorage.setItem('sidebarCollapsed', String(next)) }}
          className={cn('shrink-0', collapsed && 'mx-auto')}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </Button>
      </div>

      {/* Navigation */}
      <TooltipProvider>
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => (
            <Tooltip key={item.path}>
              <TooltipTrigger asChild>
                <div>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-zinc-800 text-zinc-50'
                          : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-50',
                        collapsed && 'justify-center px-0'
                      )
                    }
                  >
                    <item.icon size={18} className="shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                </div>
              </TooltipTrigger>
              {collapsed && <TooltipContent>{item.label}</TooltipContent>}
            </Tooltip>
          ))}
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
