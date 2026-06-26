# Pipely AI

Plataforma de gestao de tarefas e pipelines com automacao via WhatsApp (Evolution Go) e agente de IA (OpenAI).

## Setup Rapido

```bash
# 1. PostgreSQL
docker run --name postgres-pipely -e POSTGRES_USER=admin -e POSTGRES_PASSWORD=admin123 -e POSTGRES_DB=pipely_ai -p 5433:5432 -d postgres:17

# 2. Instalar dependencias
npm install
cd server && npm install && cd ..
cd agent && npm install && cd ..

# 3. Configurar variaveis
cp .env.example .env
cp server/.env.example server/.env
cp agent/.env.example agent/.env

# 4. Banco + Prisma
cd server && npm run db:push && npm run db:generate && cd ..

# 5. Rodar tudo
npm run dev:all          # Frontend + Backend
cd agent && npm run dev  # Agent (terminal separado)
```

## Arquitetura (3 Servidores)

### 1. Frontend (React 19 + Vite 8 + TypeScript 6 + Tailwind CSS v4)
- Porta: 5173
- UI Components estilo shadcn/ui com Radix UI primitives
- Auth Context + Workspace Context
- Path alias: `@/` → `src/`
- Polling silencioso (5s) para atualizacoes em tempo real no pipeline

### 2. Backend (Node.js + Express 5 + Prisma 7 + PostgreSQL)
- Porta: 3333
- JWT (access 15min + refresh 7d rotativo em httpOnly cookie)
- Middleware de workspace: `X-Workspace-Owner` header para multi-tenant
- Rate limiting: 1000 req/15min

### 3. Agent (Node.js + OpenAI + Evolution Go)
- Porta: 3335 (webhook)
- Cron: poll a cada 60s para processar blocos dinamicos
- Webhook: recebe mensagens WhatsApp via Evolution Go
- LLM + Function Calling (gpt-4o-mini)
- Preparado para Docker (Dockerfile incluso)

## Banco de Dados

PostgreSQL porta 5433. DATABASE_URL: `postgresql://admin:admin123@localhost:5433/pipely_ai`

### Models

| Model | Proposito |
|-------|-----------|
| User | Usuarios (email, name, phone, remoteJid, emailVerified) |
| RefreshToken | JWT refresh tokens |
| PasswordResetToken | Reset de senha |
| EmailVerificationToken | Verificacao de email (desativado) |
| AiConfig | API Key OpenAI por usuario |
| WhatsAppConfig | Credenciais Evolution Go (serverUrl + globalApiKey) |
| Notification | Notificacoes in-app (convites, alertas do agente) |
| TeamMember | Membros do time (owner + user + role + status pending/accepted/rejected) |
| Task | Tarefas (titulo, descricao, prioridade, status, assignee, blockId, processedAt, retryAt) |
| TaskLog | Historico de movimentacao entre blocos (enteredAt, leftAt) |
| Pipeline | Pipelines do usuario (multiplos por conta) |
| PipelinePhase | Fases (nome, cor, posicao) |
| PipelineBlock | Blocos (stage/message, config JSON com prompt/timers/branches) |
| PipelineAutomation | Automacoes por bloco (type, config, isActive) |

### Config JSON do Bloco Dinamico
```json
{
  "prompt": "instrucao para o agente",
  "msg_delay_minutes": 0,
  "delay_minutes": 120,
  "next_block_id": "uuid",
  "no_reply_minutes": 60,
  "no_reply_block_id": "uuid",
  "auto_status": "in_progress",
  "notify_on_entry": true,
  "branches": [
    { "label": "Entendeu", "nextSlug": "uuid", "condition": "responsavel confirmou" },
    { "label": "Ainda nao", "nextSlug": "", "condition": "ainda nao comecou", "retry_minutes": 2880 }
  ]
}
```

## Estrutura de Pastas

```
src/
  components/
    ui/              # Button, Input, Label, Card, Alert, AlertDialog, Badge,
                     # Select (Radix), Separator, Spinner, Toast, Dialog,
                     # DropdownMenu, Textarea, EmptyState, Switch (Radix),
                     # Tooltip (Radix), Combobox (busca + selecao),
                     # Chart (ChartContainer, ChartTooltip, ChartLegend — recharts wrapper)
    layout/          # DashboardLayout, Sidebar (tooltip, workspace-aware), NavUser
                     # (notificacoes + workspace switcher integrados)
    pipeline/        # PipelineBoard, SortablePhase, SortableBlock, DraggableCard,
                     # TaskCard, AddMemberModal (deprecated), BlockConfigModal
  contexts/          # AuthContext, WorkspaceContext
  lib/               # utils.ts (cn), country-codes.ts
  pages/
    auth/            # Login, Register, ForgotPassword, ResetPassword, VerifyEmail
    dashboard/       # Dashboard, Pipeline, Time, Tarefas, Assistente, WhatsApp,
                     # Conta, Settings
  routes/            # AppRouter, ProtectedRoute, PublicRoute, OwnerOnlyRoute
  services/          # api.ts, team.ts, pipeline.ts, tasks.ts, whatsapp.ts,
                     # notifications.ts, ai.ts

server/
  prisma/schema.prisma
  src/
    lib/             # prisma.ts, logger.ts
    middleware/       # auth.ts, requestLogger.ts, workspace.ts
    routes/          # auth.ts, team.ts, pipeline.ts, tasks.ts, whatsapp.ts,
                     # notifications.ts, ai.ts
    services/        # email.ts (nao usado), token.ts
    types/           # express.d.ts (userId + ownerId)

agent/
  Dockerfile
  src/
    index.ts         # Entry point (cron + HTTP webhook server)
    lib/             # env.ts, logger.ts, prisma.ts, evolution.ts, fragmentation.ts
    processor/       # pipeline-scanner.ts, block-processor.ts, reply-processor.ts
    tools/           # definitions.ts (6 tools), executor.ts

templates/           # pipeline-copywriter.json (template de exemplo)
```

## Endpoints da API

### Auth (`/api/auth`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | /register | Cria conta (com countryCode → gera remoteJid) |
| POST | /login | Login |
| POST | /logout | Logout |
| POST | /forgot-password | Reset senha |
| POST | /reset-password | Nova senha |
| POST | /refresh-token | Renova token |
| GET | /me | Dados do user (inclui remoteJid) |
| PATCH | /me | Atualiza nome, phone, senha, remoteJid |

### Team (`/api/team`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | /my-teams | Times onde sou membro |
| GET | / | Membros aceitos do meu time |
| GET | /pending | Convites pendentes enviados |
| POST | /invite | Enviar convite (cria notificacao in-app) |
| POST | /respond | Aceitar/recusar convite |
| PATCH | /:memberId | Atualizar role |
| DELETE | /:memberId | Remover membro |

### Pipeline (`/api/pipeline`) — workspace-scoped via `req.ownerId`
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | / | Listar pipelines |
| POST | / | Criar pipeline |
| GET | /:id | Pipeline completo (fases + blocos + tarefas) |
| PATCH | /:id | Renomear |
| DELETE | /:id | Deletar |
| POST | /:id/phases | Criar fase |
| PATCH | /phases/:phaseId | Atualizar fase |
| DELETE | /phases/:phaseId | Deletar fase |
| PATCH | /:id/phases/reorder | Reordenar fases (com validacao de ownership) |
| POST | /phases/:phaseId/blocks | Criar bloco |
| PATCH | /blocks/:blockId | Atualizar bloco (valida phaseId ownership) |
| DELETE | /blocks/:blockId | Deletar bloco |
| PATCH | /phases/:phaseId/blocks/reorder | Reordenar blocos (com validacao) |
| PATCH | /tasks/:taskId/move | Mover tarefa (valida blockId ownership) |
| POST | /blocks/:blockId/automations | Criar automacao |
| PATCH | /automations/:automationId | Atualizar automacao |
| DELETE | /automations/:automationId | Deletar automacao |

### Tasks (`/api/tasks`) — workspace-scoped
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | / | Listar tarefas |
| POST | / | Criar (valida assignee e membro e blockId pertence ao owner) |
| PATCH | /:id | Atualizar (mesmas validacoes) |
| DELETE | /:id | Deletar |

### WhatsApp (`/api/whatsapp`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | /config | Credenciais salvas |
| POST | /config | Salvar URL + API Key (valida com /server/ok) |
| DELETE | /config | Remover |
| GET | /instances | Listar instancias (tempo real) |
| POST | /instances | Criar instancia |
| DELETE | /instances/:id | Deletar (com ownership check) |
| GET | /instances/:id/status | Status (com ownership check) |
| GET | /instances/:id/qr | QR Code (com ownership check) |
| POST | /instances/:id/connect | Conectar (com ownership check) |
| POST | /instances/:id/disconnect | Desconectar (com ownership check) |

### AI (`/api/ai`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | /config | Tem key? (preview mascarado: sk-••••••••) |
| POST | /config | Salvar OpenAI key (valida prefixo sk-) |
| DELETE | /config | Remover key |

### Notificacoes (`/api/notifications`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | / | Listar (ultimas 50) |
| GET | /unread-count | Contagem nao lidas |
| PATCH | /:id/read | Marcar como lida |
| PATCH | /read-all | Marcar todas |
| DELETE | /:id | Deletar |

## Agent — Automacao de Pipeline

### Fluxo de Processamento (Cron)
```
Tick (1 min) → scanPipelines() → para cada owner com blocos dinamicos:
  → filtra tarefas com retryAt futuro (ignora ate hora chegar)
  → auto-status (muda status da tarefa ao entrar no bloco)
  → no-reply check (move tarefa se sem resposta apos X min)
  → silent block (timer de auto-avanco sem mensagem)
  → msg-delay check (espera X min antes de enviar)
  → verify task still in block (evita envio se moveu)
  → UMA tarefa por assignee (prioridade: urgent > high > medium > low)
  → LLM + function calling → envia mensagem personalizada
  → marca processedAt, limpa retryAt
```

### Fluxo de Resposta (Webhook)
```
WhatsApp → Evolution Go → POST /webhook → Agent:
  → Parsear mensagem (formato Evolution Go: data.Info + data.Message)
  → Resolver remoteJid (com variantes BR ±9)
  → Verificar: e membro do time? tem tarefas ativas? bloco espera resposta?
  → Pega apenas a tarefa mais antiga processada (1 por vez)
  → LLM analisa resposta contra branches configurados
  → Executa acoes: move_task, retry_task, send_message, notification
```

### Function Calling Tools
| Tool | Descricao |
|------|-----------|
| send_whatsapp_message | Envia array de mensagens sequenciais com delays |
| move_task | Move tarefa para outro bloco + cria log (limpa retryAt) |
| retry_task | Agenda reprocessamento apos X minutos (seta retryAt, limpa processedAt) |
| update_task_status | Altera status (todo/in_progress/done) |
| create_notification | Cria notificacao in-app |
| log_action | Registra acao no console |

### Regras do Agente
- So responde a membros aceitos do time
- So responde se tarefa esta em bloco com branches ou no_reply
- So move tarefa se branch configurado bate com a resposta
- Branch com retry_minutes → usa retry_task em vez de move_task
- Nunca inventa destinos — usa apenas IDs dos branches
- Nunca menciona termos internos (pipeline, bloco, estagio)
- Tom de colega de trabalho, nao assistente virtual
- Emojis de prioridade: 🟢 baixa, 🔵 media, 🟡 alta, 🔴 urgente
- Formato: "Prioridade: alta 🟡"
- Mensagens fragmentadas com typing indicator entre cada parte
- UMA tarefa por vez por assignee (evita confusao na conversa)
- Prioridade de processamento: urgent > high > medium > low

### Controle de Reprocessamento
- `processedAt` = null → tarefa pendente (agent processa)
- `processedAt` = date → ja processada (agent ignora)
- `retryAt` = date futuro → tarefa aguardando retry (scanner ignora ate hora chegar)
- `retryAt` = date passado/null → tarefa disponivel para processamento
- Move tarefa → reseta `processedAt` e `retryAt` (agent processa de novo no novo bloco)
- retry_task → seta `retryAt = now + X min`, limpa `processedAt` (agent reprocessa apos tempo)
- Timers (no_reply, delay, msg_delay) checam a cada tick independente de processedAt

## Workspace (Multi-Tenant)

### Como funciona
- Header `X-Workspace-Owner` em toda request Axios
- Middleware `resolveWorkspace` valida membership e define `req.ownerId`
- Rotas de pipeline e tasks usam `req.ownerId` (nao `req.userId`)
- Rotas pessoais (auth, team, whatsapp, ai, notifications) usam `req.userId`

### Acesso por tipo
| Area | Dono | Membro |
|------|------|--------|
| Dashboard | ✅ | ✅ |
| Tarefas | ✅ todas | ✅ so as dele |
| Pipeline | ✅ | ❌ redirect |
| Time | ✅ | ❌ redirect |
| WhatsApp | ✅ | ❌ redirect |
| Assistente IA | ✅ | ❌ redirect |
| Minha Conta | ✅ | ✅ |

### Frontend
- `WorkspaceContext` gerencia workspace ativo (localStorage)
- `OwnerOnlyRoute` redireciona membro para /dashboard
- Sidebar muda nav items baseado em `isOwnWorkspace`
- NavUser mostra workspace switcher quando tem mais de 1

## Seguranca

### Validacoes implementadas
- Workspace: string vazia no header tratada com trim()
- WhatsApp instances: ownership verificado via getVerifiedInstance()
- Pipeline: reorder valida que phases/blocks pertencem ao pipeline/phase
- Pipeline: updateBlock valida phaseId de destino
- Pipeline: moveTask valida blockId de destino
- Tasks: assigneeId valida que e membro aceito do time
- Tasks: blockId valida pertencimento ao pipeline do owner
- AI config: preview mascarado sem expor caracteres reais

## UI Components

| Componente | Base | Descricao |
|-----------|------|-----------|
| Button | cva | 6 variants, 4 sizes |
| Card | — | Header, Title, Description, Content, Footer |
| Input | — | Com prop error |
| Label | — | Label de form |
| Alert | cva | 4 variants |
| AlertDialog | Context | Modal confirmacao, controlado/nao-controlado |
| Dialog | Portal | Modal generico, X fechar, Escape |
| DropdownMenu | Context | Posicionamento auto, keepOpen prop |
| Select | Radix | Radix primitives, dark theme, scroll |
| Switch | Radix | Toggle on/off |
| Tooltip | Radix | Tooltip com delay 200ms |
| Combobox | Portal | Input de busca + selecao filtrada |
| Badge | cva | 4 variants |
| Separator | — | Horizontal/vertical |
| Spinner | cva/Lucide | 4 sizes |
| Textarea | — | Com prop error |
| Toast | Sonner | Dark theme |
| EmptyState | — | Icone + titulo + descricao + children |
| Chart | recharts | ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegendContent |

## Decisoes Tecnicas

- **Prisma 7**: adapter obrigatorio, config em prisma.config.ts, generated em server/generated/
- **Express 5 + ESM**: http.createServer() necessario no Windows
- **Tailwind v4**: @theme no CSS, sem tailwind.config.js, scrollbar customizada
- **TypeScript 6**: ignoreDeprecations: "6.0" para paths
- **@dnd-kit**: 3 niveis DnD com optimistic update (sem flash)
- **Evolution Go**: formato de webhook diferente da v2 (data.Info + data.Message)
- **RemoteJid BR**: resolve variantes ±9 apos DDD
- **Agent separado**: preparado para Docker, credenciais do banco por owner
- **Polling 5s**: pausa quando modal aberto, silent refresh sem loading

## Comandos

```bash
# Frontend (porta 5173)
npm run dev

# Backend (porta 3333)
npm run dev:server
# ou
npm run dev:all      # Frontend + Backend

# Agent (porta 3335 — terminal separado)
cd agent && npm run dev

# Database (dentro de server/)
npm run db:push      # Sync schema
npm run db:generate  # Gera client
npm run db:studio    # UI visual

# Build
npm run build        # Frontend producao
```

## Dashboard
- KPI cards: total tarefas, em andamento, concluidas (%), membros do time
- Area chart: timeline 14 dias (tarefas criadas por dia) — recharts
- Donut chart: distribuicao por status (a fazer / em andamento / concluido)
- Bar chart: distribuicao por prioridade (baixa/media/alta/urgente)
- Lista de tarefas recentes (5 ultimas) com badges
- Alerta de tarefas urgentes pendentes
- Dados computados client-side via GET /api/tasks + /api/pipeline + /api/team

## Stack
- React 19 + TypeScript 6 + Vite 8
- Tailwind CSS v4 + class-variance-authority + clsx + tailwind-merge
- Radix UI (Select, Switch, Tooltip)
- Recharts (graficos do dashboard)
- React Router v7 + Axios
- @dnd-kit/core + @dnd-kit/sortable
- Lucide React + Sonner
- Node.js + Express 5 + Prisma 7 + PostgreSQL
- JWT + bcryptjs
- OpenAI API (gpt-4o-mini) + function calling
- Evolution Go (WhatsApp API)
- Docker (PostgreSQL porta 5433)
