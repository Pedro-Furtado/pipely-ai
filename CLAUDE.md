# Pipely AI

Plataforma de gestao de tarefas e pipelines com automacao via WhatsApp (Evolution Go) e agente de IA (OpenAI).

## Setup Rapido (Um Comando)

**Linux / macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/Pedro-Furtado/pipely-ai/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/Pedro-Furtado/pipely-ai/main/install.ps1 | iex
```

O installer pergunta: **Production** (Docker) ou **Local Dev** (Node.js).
Ambos sobem PostgreSQL + Evolution Go automaticamente.

### Local Dev (o que o installer faz)
1. Verifica portas livres (5433, 8080 — se ocupadas, busca proxima)
2. Clona repo, instala dependencias (root + server + agent)
3. Gera `.env` com portas reais + Evolution Go config
4. Sobe containers: `postgres-pipely` (porta 5433) + `evolution-pipely` (porta 8080)
5. Cria banco separado `evolution_go` pra Evolution Go (evita conflito com Prisma)
6. Roda `db:push` + `db:generate`
7. Mostra summary com URLs, portas e Evolution Go API Key

Depois: `npm run dev:all` (Frontend + Backend + Agent juntos via concurrently)

### Producao (Docker Compose)
```
docker-compose.prod.yml sobe: db + evolution + app
setup.sh gera: DB_PASSWORD, JWT_SECRET, EVOLUTION_API_KEY
init-db.sh cria banco evolution_go via docker-entrypoint-initdb.d
```

### Desinstalar
```bash
# Linux/macOS
curl -fsSL .../install.sh | bash -s -- --uninstall

# Windows
$env:PIPELY_ACTION="uninstall"; irm .../install.ps1 | iex
```
Remove containers (postgres-pipely + evolution-pipely), volumes e pasta do projeto.

## Arquitetura (4 Servicos)

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
- Auto-config WhatsApp no setup do owner (se Evolution Go bundled)

### 3. Agent (Node.js + OpenAI + Evolution Go)
- Porta: 3335 (webhook)
- Cron: poll a cada 60s para processar blocos dinamicos
- Webhook: recebe mensagens WhatsApp via Evolution Go
- LLM + Function Calling (gpt-4o-mini) — 9 tools
- Salva logs de atividade no banco (AgentLog)

### 4. Evolution Go (WhatsApp API — bundled)
- Porta: 8080 (local dev) / rede interna Docker (producao)
- Manager: http://localhost:8080/manager
- Banco separado: `evolution_go` (mesmo PostgreSQL, DB diferente)
- API Key: `pipely-dev-key` (local) / auto-gerada (producao)
- Imagem Docker: `evoapicloud/evolution-go:latest`

## Banco de Dados

PostgreSQL porta dinamica (default 5433). Dois bancos:
- `pipely_ai` — app (Prisma)
- `evolution_go` — Evolution Go (tabelas proprias)

### Models

| Model | Proposito |
|-------|-----------|
| User | Usuarios (email, name, phone, remoteJid, emailVerified) |
| RefreshToken | JWT refresh tokens |
| PasswordResetToken | Reset de senha |
| EmailVerificationToken | Verificacao de email (desativado) |
| InviteToken | Links de convite com expiracao |
| AiConfig | API Key OpenAI por usuario |
| WhatsAppConfig | Credenciais Evolution Go (serverUrl + globalApiKey + webhookUrl) |
| AgentLog | Logs de atividade do agente (type, title, detail, data JSON) |
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
    layout/          # DashboardLayout, Sidebar (config status indicators), NavUser
    pipeline/        # PipelineBoard, SortablePhase, SortableBlock, DraggableCard,
                     # TaskCard, BlockConfigModal
  contexts/          # AuthContext, WorkspaceContext
  data/              # pipeline-templates.ts (4 templates built-in)
  lib/               # utils.ts (cn), country-codes.ts
  pages/
    auth/            # Login, Register, ForgotPassword, ResetPassword, VerifyEmail, Setup
    dashboard/       # Dashboard, Pipeline, Time, Tarefas, Assistente (com logs), WhatsApp,
                     # Conta, Settings
  routes/            # AppRouter, ProtectedRoute, PublicRoute, OwnerOnlyRoute
  services/          # api.ts, team.ts, pipeline.ts, tasks.ts, whatsapp.ts,
                     # notifications.ts, ai.ts, agent-logs.ts

server/
  prisma/schema.prisma
  src/
    lib/             # prisma.ts, logger.ts
    middleware/       # auth.ts, requestLogger.ts, workspace.ts, setupGuard.ts
    routes/          # auth.ts, team.ts, pipeline.ts, tasks.ts, whatsapp.ts,
                     # notifications.ts, ai.ts, agent-logs.ts
    services/        # email.ts (nao usado), token.ts
    types/           # express.d.ts (userId + ownerId)

agent/
  Dockerfile
  src/
    index.ts         # Entry point (cron + HTTP webhook server)
    lib/             # env.ts, logger.ts, prisma.ts, evolution.ts, fragmentation.ts, agent-log.ts
    processor/       # pipeline-scanner.ts, block-processor.ts, reply-processor.ts
    tools/           # definitions.ts (9 tools), executor.ts

templates/           # pipeline-basico.json, pipeline-copywriter.json
install.sh           # Installer Linux/macOS (prod + local dev + uninstall)
install.ps1          # Installer Windows PowerShell
setup.sh             # Gerador de credenciais (producao)
domain.sh            # Configurador de dominio + SSL
init-db.sh           # Cria banco evolution_go no PostgreSQL
docker-compose.prod.yml  # Producao (db + evolution + app)
```

## Endpoints da API

### Auth (`/api/auth`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | /setup-status | Verifica se owner existe |
| POST | /setup | Cria owner (auto-config WhatsApp se bundled) |
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
| GET | /config | Credenciais salvas + isBundled flag |
| POST | /config | Salvar URL + API Key (valida com /server/ok) |
| DELETE | /config | Remover |
| GET | /instances | Listar instancias (tempo real) |
| POST | /instances | Criar instancia (auto-webhook em bundled mode) |
| DELETE | /instances/:id | Deletar (com ownership check) |
| GET | /instances/:id/status | Status (com ownership check) |
| GET | /instances/:id/qr | QR Code (com ownership check) |
| POST | /instances/:id/connect | Conectar (auto-webhook + subscribe MESSAGE) |
| POST | /instances/:id/disconnect | Desconectar (com ownership check) |
| GET | /webhook | Webhook URL salvo localmente |
| POST | /webhook | Salvar webhook URL |

### AI (`/api/ai`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | /config | Tem key? (preview mascarado: sk-••••••••) |
| POST | /config | Salvar OpenAI key (valida prefixo sk-) |
| DELETE | /config | Remover key |

### Agent Logs (`/api/agent-logs`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | / | Listar logs (paginado, filtravel por type) |
| DELETE | / | Limpar todos os logs |

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
  → valida bloco destino existe antes de mover (evita FK error)
  → silent block (timer de auto-avanco sem mensagem)
  → msg-delay check (espera X min antes de enviar)
  → verify task still in block (evita envio se moveu)
  → UMA tarefa por assignee (prioridade: urgent > high > medium > low)
  → LLM + function calling → envia mensagem/botoes/poll/lista
  → salva AgentLog de cada acao
  → marca processedAt, limpa retryAt
```

### Fluxo de Resposta (Webhook)
```
WhatsApp → Evolution Go → POST /webhook → Agent:
  → Parsear mensagem (formato Evolution Go: data.Info + data.Message)
  → Resolver remoteJid (com variantes BR ±9)
  → Verificar: e membro do time? tem tarefas ativas? bloco espera resposta?
  → Pega apenas a tarefa mais antiga processada (1 por vez)
  → Salva AgentLog "reply_received"
  → LLM analisa resposta contra branches configurados
  → Executa acoes: move_task, retry_task, send_message, notification
  → Salva AgentLog de cada acao + erros
```

### Function Calling Tools (9 tools)
| Tool | Descricao |
|------|-----------|
| send_whatsapp_message | Envia array de mensagens sequenciais com delays (max 15) |
| send_whatsapp_buttons | Envia mensagem com botoes interativos (max 3 botoes) |
| send_whatsapp_poll | Envia enquete com opcoes (max 12 opcoes) |
| send_whatsapp_list | Envia lista com secoes e opcoes selecionaveis |
| move_task | Move tarefa para outro bloco + cria log (valida bloco existe) |
| retry_task | Agenda reprocessamento apos X minutos (seta retryAt, limpa processedAt) |
| update_task_status | Altera status (todo/in_progress/done) |
| create_notification | Cria notificacao in-app |
| log_action | Registra acao no console |

### Agent Logs (AgentLog types)
| Type | Descricao |
|------|-----------|
| processing | Inicio de processamento de bloco |
| message_sent / message_error | Mensagem texto enviada/erro |
| buttons_sent / buttons_error | Botoes enviados/erro |
| poll_sent / poll_error | Enquete enviada/erro |
| list_sent / list_error | Lista enviada/erro |
| task_moved / move_error | Tarefa movida/erro |
| task_retry / retry_error | Retry agendado/erro |
| task_processed | Tarefa marcada como processada |
| agent_response | Resumo do LLM |
| reply_received | Resposta recebida do WhatsApp |
| reply_processed | Resposta processada pelo LLM |
| auto_advance | Auto-avanco por timer |
| no_reply | Movida por falta de resposta |
| status_changed | Status da tarefa alterado |
| notification_sent / notification_error | Notificacao criada/erro |
| error | Erro generico |

### Regras do Agente
- So responde a membros aceitos do time
- So responde se tarefa esta em bloco com branches ou no_reply
- So move tarefa se branch configurado bate com a resposta
- Valida que bloco destino existe antes de mover (evita FK constraint)
- Branch com retry_minutes → usa retry_task em vez de move_task
- Nunca inventa destinos — usa apenas IDs dos branches
- Nunca menciona termos internos (pipeline, bloco, estagio)
- Tom de colega de trabalho, nao assistente virtual
- Emojis de prioridade: 🟢 baixa, 🔵 media, 🟡 alta, 🔴 urgente
- Formato: "Prioridade: alta 🟡"
- Mensagens fragmentadas com typing indicator entre cada parte
- UMA tarefa por vez por assignee (evita confusao na conversa)
- Prioridade de processamento: urgent > high > medium > low
- Pode usar botoes, polls ou listas quando apropriado

### Controle de Reprocessamento
- `processedAt` = null → tarefa pendente (agent processa)
- `processedAt` = date → ja processada (agent ignora)
- `retryAt` = date futuro → tarefa aguardando retry (scanner ignora ate hora chegar)
- `retryAt` = date passado/null → tarefa disponivel para processamento
- Move tarefa → reseta `processedAt` e `retryAt` (agent processa de novo no novo bloco)
- retry_task → seta `retryAt = now + X min`, limpa `processedAt` (agent reprocessa apos tempo)
- Timers (no_reply, delay, msg_delay) checam a cada tick independente de processedAt

## Pipeline Templates

4 templates built-in em `src/data/pipeline-templates.ts`:
- **Basico** — Pedidos → Tarefa (com adiamento e retry)
- **Projeto** — Briefing → Execucao → Revisao → Entrega
- **Demandas** — Entrada → Andamento → Conclusao
- **Conteudo** — Briefing → Producao → Revisao → Publicacao

Templates usam refs `__slug__` que sao mapeados para IDs reais na criacao.
Import de JSON tambem faz remapeamento de IDs (next_block_id, no_reply_block_id, branches.nextSlug).
Export inclui block.id pra permitir re-import correto.

## Pipeline Import/Export

- **Export**: gera JSON com phases, blocks (incluindo id e slug), configs
- **Import**: cria pipeline, mapeia oldId→newId, remapeia configs automaticamente
- Suporta refs por UUID (export) e `__slug__` (templates)
- Botao "Importar" disponivel sempre (header + empty state)
- Botao "Templates" abre modal com cards dos 4 templates

## Sidebar — Indicadores de Configuracao

- WhatsApp e Assistente de IA mostram dot amber quando nao configurados
- Badge "Configurar" ao lado do label (sidebar aberta)
- Tooltip "(nao configurado)" quando sidebar colapsada
- Verifica automaticamente via API ao carregar

## WhatsApp — Modos de Operacao

### Bundled (producao + local dev com Docker)
- Evolution Go roda como container junto com PostgreSQL
- WhatsApp auto-configurado ao criar conta owner
- Webhook auto-configurado ao conectar instancia
- Manager acessivel via botao na pagina
- Esconde config manual, Settings, webhook alert

### Manual (sem Docker ou Evolution Go externa)
- User configura URL + API Key manualmente
- Webhook precisa ser configurado manualmente (input na pagina)
- Localhost: mostra aviso pra usar ngrok
- Producao: botao "Configurar automaticamente"

## Assistente de IA — Pagina

- Card de API Key (configurar/alterar/remover)
- Tabela de logs do agente com:
  - Colunas: Data, Tipo (badge colorido), Evento, Detalhe
  - Filtros: Todos, Mensagens, Movidas, Respostas, Erros, Auto-avanco
  - Paginacao (20 por pagina)
  - Auto-refresh 30s
  - Click expande detalhe
  - Botao limpar logs

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
- Agent: valida bloco destino existe antes de mover (evita FK constraint)

## Evolution Go API (endpoints usados)

### Envio de Mensagens
| Endpoint | Descricao |
|----------|-----------|
| POST /send/text | Texto simples |
| POST /send/button | Botoes interativos (max 3) |
| POST /send/poll | Enquete com opcoes (max 12) |
| POST /send/list | Lista com secoes |
| POST /send/media | Imagem, video, audio, documento |
| POST /send/location | Localizacao |
| POST /send/contact | Cartao de contato |

### Instancias
| Endpoint | Descricao |
|----------|-----------|
| POST /instance/create | Criar instancia |
| POST /instance/connect | Conectar (aceita webhookUrl + subscribe) |
| GET /instance/all | Listar todas |
| GET /instance/status | Status da instancia |
| GET /instance/qr | QR Code |
| POST /instance/disconnect | Desconectar |
| DELETE /instance/delete/:id | Deletar |

### Webhook (configurado no connect)
```json
{
  "webhookUrl": "http://app:3335/webhook",
  "subscribe": ["MESSAGE"],
  "immediate": true
}
```

Eventos disponiveis: ALL, MESSAGE, SEND_MESSAGE, READ_RECEIPT, PRESENCE, CONNECTION, CALL, GROUP, etc.

## Comandos

```bash
# Tudo junto (Frontend + Backend + Agent)
npm run dev:all

# Separados
npm run dev              # Frontend (porta 5173)
npm run dev:server       # Backend (porta 3333)
npm run dev:agent        # Agent (porta 3335)

# Database (dentro de server/)
npm run db:push          # Sync schema
npm run db:generate      # Gera client
npm run db:studio        # UI visual

# Build
npm run build            # Frontend producao
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
- OpenAI API (gpt-4o-mini) + function calling (9 tools)
- Evolution Go (WhatsApp API — bundled)
- Docker (PostgreSQL + Evolution Go)

## Decisoes Tecnicas

- **Prisma 7**: adapter obrigatorio, config em prisma.config.ts, generated em server/generated/
- **Express 5 + ESM**: http.createServer() necessario no Windows
- **Tailwind v4**: @theme no CSS, sem tailwind.config.js, scrollbar customizada
- **TypeScript 6**: ignoreDeprecations: "6.0" para paths
- **@dnd-kit**: 3 niveis DnD com optimistic update (sem flash)
- **Evolution Go bundled**: roda como container Docker, banco separado `evolution_go`
- **Evolution Go API**: webhook configurado no connect (nao no create)
- **RemoteJid BR**: resolve variantes ±9 apos DDD
- **Agent logs**: salva no banco via AgentLog model, exibido na pagina Assistente
- **Pipeline import**: remapeia IDs (next_block_id, no_reply_block_id, branches.nextSlug)
- **Portas dinamicas**: installer verifica portas livres antes de usar
- **Polling 5s**: pausa quando modal aberto, silent refresh sem loading
