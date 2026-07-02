# Pipely AI

Plataforma de gestao de tarefas e pipelines com automacao via WhatsApp (Evolution Go) e agente de IA (OpenAI).

## Setup Rapido (Um Comando)

```bash
npx pipely-ai
```

Funciona em qualquer OS (Windows, macOS, Linux), local ou VPS.
Requisitos: Node.js 18+ (Docker opcional).

- **Com Docker** → setup completo com containers (app + PostgreSQL + Evolution Go)
- **Sem Docker** → local mode com embedded PostgreSQL (sem containers)

### Docker mode (producao)
1. Detecta OS automaticamente
2. Pede portas interativamente (testa disponibilidade de cada uma, incluindo Docker)
3. Gera chaves unicas (DB_PASSWORD, JWT_SECRET, EVOLUTION_API_KEY)
4. Cria 3 arquivos no diretorio atual: `docker-compose.yml`, `.env`, `init-db.sh`
5. Puxa imagens Docker (app do GHCR + postgres + evolution-go)
6. Sobe containers com `docker compose up -d`
7. Aguarda health check e extrai Setup Key dos logs
8. Mostra resumo com todos endpoints, chaves e proximos passos

### Local mode (sem Docker)
```bash
npx pipely-ai --local
```
1. Baixa bundle pre-compilado do GitHub Releases
2. Instala dependencias
3. Inicia embedded PostgreSQL (porta 5433, dados em `./data/db/`)
4. Cria tabelas via prisma db push
5. Inicia frontend + backend + agent na mesma porta (3333)
6. Dados persistem entre reinicializacoes em `./data/db/`

### Portas configuraveis (defaults)
| Servico | Porta | Descricao |
|---------|-------|-----------|
| Frontend + API (nginx) | 3000 | Acesso principal (frontend + /api + /webhook) |
| Backend direto | 3333 | Acesso direto ao Express (bypassa nginx) |
| Agent Webhook | 3335 | Webhook direto do agent |
| Evolution Go | 8080 | WhatsApp API + Manager |
| PostgreSQL | 5433 | Banco de dados |

### Gerenciar a aplicacao
```bash
docker compose up -d       # Iniciar
docker compose down         # Parar
docker compose logs -f app  # Logs
docker compose pull && docker compose up -d  # Atualizar
cat .env                    # Ver portas e chaves
docker compose down -v      # Reset total (apaga dados)
```

### Dev mode (contribuidores)
Para rodar do codigo-fonte com hot reload:
```bash
git clone ... && cd pipely-ai
npm run dev:all    # Mostra banner com endpoints antes de iniciar
```
`dev:all` roda `scripts/dev-banner.mjs` + concurrently (frontend + server + agent).

### Desinstalar
```bash
docker compose down -v
rm docker-compose.yml .env init-db.sh
```

### Installers legados (ainda funcionam)
```bash
# Linux/macOS
curl -fsSL https://raw.githubusercontent.com/Pedro-Furtado/pipely-ai/main/install.sh | bash

# Windows PowerShell
irm https://raw.githubusercontent.com/Pedro-Furtado/pipely-ai/main/install.ps1 | iex
```

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

cli/
  package.json       # Pacote npm "create-pipely" (zero deps)
  index.js           # CLI: detecta OS, portas, gera keys, sobe Docker
  .gitattributes     # Forca LF (shebang precisa ser LF para npm bin)

scripts/
  dev-banner.mjs     # Banner de endpoints para npm run dev:all

.github/
  workflows/
    docker-publish.yml  # CI/CD: build + push imagem Docker no GHCR

templates/           # pipeline-basico.json, pipeline-copywriter.json
install.sh           # Installer legado Linux/macOS
install.ps1          # Installer legado Windows PowerShell
setup.sh             # Gerador de credenciais (producao legado)
domain.sh            # Configurador de dominio + SSL
init-db.sh           # Cria banco evolution_go no PostgreSQL
Dockerfile           # Multi-stage (frontend + server + agent + nginx)
docker-compose.prod.yml  # Producao legada (db + evolution + app)
nginx.conf           # Reverse proxy (large_client_header_buffers 4 32k)
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

### Docker (producao / uso normal)
```bash
npx create-pipely          # Setup completo (portas, keys, containers)
docker compose up -d        # Iniciar
docker compose down          # Parar
docker compose logs -f app   # Logs
docker compose pull && docker compose up -d  # Atualizar imagem
cat .env                     # Ver portas e chaves
```

### Dev mode (codigo-fonte)
```bash
npm run dev:all              # Frontend + Backend + Agent (com banner de endpoints)
npm run dev                  # Frontend (porta 5173)
npm run dev:server           # Backend (porta 3333)
npm run dev:agent            # Agent (porta 3335)
```

### Database (dentro de server/)
```bash
npm run db:push              # Sync schema
npm run db:generate          # Gera client
npm run db:studio            # UI visual
```

### CLI (publicar no npm)
```bash
cd cli && npm publish        # Publica create-pipely no npm
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
- Docker (PostgreSQL + Evolution Go + App)
- GitHub Actions (CI/CD: build + push imagem GHCR)

## CI/CD

- **GitHub Actions**: `.github/workflows/docker-publish.yml`
- Trigger: push para `main` ou `workflow_dispatch` manual
- Build: multi-stage Dockerfile (frontend vite build + server tsc + agent tsc)
- Push: `ghcr.io/pedro-furtado/pipely-ai:latest` + tag SHA do commit
- Auth: `GITHUB_TOKEN` automatico (precisa write permission no package)
- Permissao GHCR: Settings → Actions → Workflow permissions → Read and write
- Se package criado antes do workflow: vincular repo em Package Settings → Manage Actions access

## Docker Image (GHCR)

- Imagem: `ghcr.io/pedro-furtado/pipely-ai:latest`
- Multi-stage: frontend (vite build) + server (tsc) + agent (tsc) + nginx
- Frontend build usa `npx vite build` direto (sem tsc — evita erros strict TS)
- Server/Agent build usam `tsc; test -f dist/index.js` (ignora erros TS)
- EXPOSE 80 3333 3335
- start.sh: prisma db push → server → agent → banner endpoints → nginx
- nginx.conf: large_client_header_buffers 4 32k (evita cookie overflow em localhost)

## CLI (pipely-ai)

- Pacote npm: `pipely-ai` (cli/ directory)
- Zero dependencias — usa apenas Node.js built-in modules
- Detecta OS via `process.platform`
- Dois modos: Docker (com containers) e Local (embedded PostgreSQL)
- **Docker mode**: gera docker-compose.yml + .env + init-db.sh, sobe containers
- **Local mode**: baixa bundle do GitHub Releases, inicia embedded-postgres (porta 5433), frontend+API na porta 3333
- Embedded PostgreSQL via `embedded-postgres` npm package (instalado no bundle, importado dinamicamente pelo CLI)
- Dados locais em `./data/db/` (persistente), config em `./.env`
- Bundle compilado por `.github/workflows/build-local.yml` (trigger: tags v*)
- Testa portas com `net.createServer` + `docker ps`
- Gera chaves com `crypto.randomBytes`
- Health check via HTTP GET /health
- Publicar: `cd cli && npm publish`
- .gitattributes forca LF no index.js (shebang quebra com CRLF)

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
- **Portas configuraveis**: CLI testa disponibilidade + checa containers Docker
- **Polling 5s**: pausa quando modal aberto, silent refresh sem loading
- **Dockerfile frontend**: `npx vite build` direto (tsc falha em strict mode, vite usa esbuild)
- **npm bin CRLF**: .gitattributes forca LF, senao npm remove bin entry no publish
- **nginx localhost cookies**: `large_client_header_buffers 4 32k` evita 400 Bad Request
- **Local mode embedded PostgreSQL**: mesmo adapter-pg que Docker, zero diferenca de schema/runtime
- **SPA fallback local**: `fs.readFileSync` + `res.send` (res.sendFile falha no Windows com espacos no path)
- **setupGuard bypass**: paths nao-/api/ passam direto (frontend static files em local mode)
- **Prisma 7 adapter API**: PrismaLibSql/PrismaPg sao factories, recebem config direto (nao client pre-criado)
