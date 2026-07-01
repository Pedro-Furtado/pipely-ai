<p align="center">
  <img src="https://img.shields.io/badge/Pipely_AI-Task_Automation-8b5cf6?style=for-the-badge" alt="Pipely AI" />
</p>

<h1 align="center">Pipely AI</h1>

<p align="center">
  Open-source task management platform with pipeline automation via WhatsApp and AI agent.
  <br />
  Self-hosted. One command to deploy. Zero external dependencies.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/node.js-22-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
</p>

---

## What is Pipely AI?

Pipely AI automates task management through visual pipelines connected to WhatsApp. An AI agent processes tasks, sends messages, waits for responses, and moves tasks through your pipeline — all automatically.

**Key features:**

- Visual drag-and-drop pipeline builder
- AI agent with OpenAI (GPT-4o-mini) + function calling
- WhatsApp automation via Evolution Go
- Conditional routing based on member responses
- Retry scheduling for unanswered tasks
- Schedule-based automation (weekly or specific dates)
- Team members managed by owner (name + phone, contacted via WhatsApp)
- Dashboard with charts and KPIs
- Fully self-hosted — your data stays on your server

---

## Quick Start

One command. Works on **any OS** — local machine or VPS.

**Requirements:** [Docker](https://docs.docker.com/get-docker/) + [Node.js 18+](https://nodejs.org/)

```bash
npx pipely-ai
```

The installer will:

1. Detect your OS (Windows, macOS, Linux)
2. Ask you to configure ports (with availability testing)
3. Auto-generate unique security keys
4. Optionally configure a custom domain + SSL (Linux VPS only)
5. Pull Docker images and start all services
6. Show you all endpoints, keys, and the setup URL

```
  Endpoints:
    Frontend:        http://localhost:3000
    Backend API:     http://localhost:3000/api
    Evolution Go:    http://localhost:8080
    Evolution Mgr:   http://localhost:8080/manager

  Chaves:
    Evolution Key:   a1b2c3d4e5f6...
    Setup Key:       2e5b1c1e-e898-...
```

### What gets created

The CLI generates 3 files in the current directory:

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Container orchestration (app + db + evolution) |
| `.env` | Ports and auto-generated security keys |
| `init-db.sh` | Creates the Evolution Go database on first start |

No project cloning, no dependency installation. Everything runs via Docker images.

---

## First-Time Setup

1. **Open** the Frontend URL shown after install (e.g. `http://localhost:3000/setup`)
2. **Enter the Setup Key** (shown in the install summary and in container logs)
3. **Create your owner account** (name, email, password)
4. **Login** and start using

### Setup Key

The setup key is auto-generated every time the app starts without an owner account. It is also used to **reset your password** if you forget it. View it anytime:

```bash
npx pipely-ai keys
```

---

## Managing the App

All commands work from the directory where you ran `npx pipely-ai`:

```bash
npx pipely-ai status      # View containers, endpoints, domain
npx pipely-ai keys        # View Evolution Key + Setup Key
npx pipely-ai logs        # View app logs (Ctrl+C to exit)
npx pipely-ai logs db     # View database logs
npx pipely-ai stop        # Stop all containers
npx pipely-ai start       # Start containers
npx pipely-ai restart     # Restart containers
npx pipely-ai update      # Pull latest image and recreate
npx pipely-ai help        # Show all commands
```

### Full reset (deletes all data)

```bash
npx pipely-ai stop
docker compose down -v
```

> **Warning:** This is destructive and cannot be undone.

---

## Custom Domain (Optional)

Domain + SSL is configured during installation when you run `npx pipely-ai` on a Linux VPS as root. The installer asks if you want to set up a domain.

### Manual setup

1. Add a DNS **A record** pointing to your VPS IP:

| Type | Name | Value |
|------|------|-------|
| A | pipely | `YOUR_VPS_IP` |

2. Re-run the installer — it will ask for the domain and configure Nginx + SSL automatically.

If you use an external reverse proxy (Caddy, Traefik, Nginx Proxy Manager), configure it to proxy your domain to `localhost:YOUR_APP_PORT`.

---

## Adding Team Members

1. Go to **Time** (Team) page
2. Click **Adicionar membro** (Add member)
3. Enter the member's **name** and **phone number**
4. The AI agent contacts them via WhatsApp automatically

Members don't need accounts or access to the platform — they interact only through WhatsApp.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Docker Compose                         │
│                                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Nginx   │  │  Server  │  │  Agent   │  │Evolution │ │
│  │  :80     │──│  :3333   │  │  :3335   │  │  Go      │ │
│  │ (proxy)  │  │ (API)    │  │ (cron)   │  │  :8080   │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                      │              │            │        │
│                      └──────┬───────┴────────────┘        │
│                             │                             │
│                    ┌────────┴────────┐                    │
│                    │   PostgreSQL    │                    │
│                    │     :5432       │                    │
│                    └─────────────────┘                    │
└──────────────────────────────────────────────────────────┘
```

| Component | Description |
|-----------|-------------|
| **Nginx** | Serves frontend + proxies API requests |
| **Server** | Express 5 REST API with JWT auth |
| **Agent** | AI automation — polls every 60s, processes WhatsApp webhooks |
| **Evolution Go** | WhatsApp API (bundled, auto-configured) |
| **PostgreSQL** | Database (auto-provisioned) |

---

## Pipeline Flow

```
Create Pipeline → Define Phases & Blocks → Configure Prompts/Timers/Branches
                                                      ↓
Agent (cron 60s) → Scans dynamic blocks → LLM generates message → Sends WhatsApp
                                                      ↓
WhatsApp reply → Webhook → Agent analyzes → Moves task / Retries / Notifies
```

### Block Configuration

Each dynamic block can have:

| Feature | Description |
|---------|-------------|
| **Prompt** | Instructions for the AI agent |
| **Message delay** | Wait before sending message |
| **Auto-advance** | Move task after X time |
| **No-reply** | Move task if no response after X time |
| **Conditional routing** | Branch based on member's response |
| **Retry** | Re-ask after X time if condition matches |
| **Schedule** | Move task on specific days/times (weekly or date-based) |
| **Auto-status** | Change task status on block entry |
| **Notification** | Notify owner when task enters block |

---

## Environment Variables

All variables are auto-generated by `npx pipely-ai`. View/edit in `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `FRONTEND_PORT` | App port (Frontend + API via nginx) | `3000` |
| `BACKEND_PORT` | Direct Express API access | `3333` |
| `AGENT_PORT` | Agent webhook port | `3335` |
| `EVOLUTION_PORT` | Evolution Go (WhatsApp) | `8080` |
| `DB_PORT` | PostgreSQL | `5433` |
| `DB_PASSWORD` | PostgreSQL password | *auto-generated* |
| `JWT_SECRET` | JWT signing secret | *auto-generated* |
| `EVOLUTION_API_KEY` | Evolution Go API key | *auto-generated* |
| `POLL_INTERVAL_MS` | Agent poll interval | `60000` |

---

## Integrations

### WhatsApp (Evolution Go — bundled)

Evolution Go comes bundled. No external server needed.

1. Go to **WhatsApp** page
2. Create an instance
3. Scan QR code
4. Done — webhook is auto-configured

### AI (OpenAI)

1. Go to **Assistente de IA** page
2. Enter your OpenAI API key
3. The agent uses GPT-4o-mini for message generation and response analysis

---

## Development (from source)

For contributors who want to modify the code:

```bash
git clone https://github.com/Pedro-Furtado/pipely-ai.git && cd pipely-ai

# Start PostgreSQL + Evolution Go via Docker
docker run --name postgres-pipely \
  -e POSTGRES_USER=pipely \
  -e POSTGRES_PASSWORD=pipely123 \
  -e POSTGRES_DB=pipely_ai \
  -p 5433:5432 -d postgres:17

# Install dependencies
npm install && cd server && npm install && cd ../agent && npm install && cd ..

# Configure
cp .env.example .env && cp server/.env.example server/.env && cp agent/.env.example agent/.env
cd server && npm run db:push && npm run db:generate && cd ..

# Run (shows endpoints banner on startup)
npm run dev:all
```

| Service | Port |
|---------|------|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3333 |
| Agent | http://localhost:3335 |

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4, Radix UI, Recharts |
| **Backend** | Node.js, Express 5, Prisma 7, PostgreSQL |
| **Agent** | OpenAI API (GPT-4o-mini), Function Calling, Evolution Go |
| **Infra** | Docker, Nginx, GitHub Actions (CI/CD) |

---

## Uninstall

Remove all containers, volumes, and configuration:

```bash
npx pipely-ai stop
docker compose down -v
rm docker-compose.yml .env init-db.sh
```

> **Warning:** This is destructive and cannot be undone. All data (database, configuration) will be permanently deleted.

---

## License

MIT — use it however you want.
