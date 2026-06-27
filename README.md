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
- Multi-member team management with invite links
- Dashboard with charts and KPIs
- Fully self-hosted — your data stays on your server

---

## Quick Start

One command to install. Works on **VPS (production)** and **local machine (development)**.

```bash
curl -fsSL https://raw.githubusercontent.com/Pedro-Furtado/pipely-ai/main/install.sh | sh
```

The installer will ask you to choose:

| Mode | What it does |
|------|-------------|
| **Production** | Installs Docker, generates credentials, starts containers, shows setup URL |
| **Local Dev** | Checks Node.js, clones repo, installs dependencies, sets up PostgreSQL, runs Prisma |

You can also skip the prompt:

```bash
# Production directly
curl -fsSL https://raw.githubusercontent.com/Pedro-Furtado/pipely-ai/main/install.sh | sh -s -- --prod

# Local development directly
curl -fsSL https://raw.githubusercontent.com/Pedro-Furtado/pipely-ai/main/install.sh | sh -s -- --local
```

### What the installer checks

| Dependency | Production | Local Dev |
|------------|-----------|-----------|
| Docker | Required (auto-installs) | Optional (for PostgreSQL) |
| Node.js 18+ | — | Required |
| Git | — | Required (to clone repo) |

After install, the script shows you the exact next steps.

---

## Custom Domain (Optional)

Use your own domain like `pipely.yourdomain.com` with automatic SSL.

### 1. Create DNS record

Go to your domain provider (Cloudflare, Hostinger, GoDaddy, etc.) and add an **A record**:

| Type | Name | Value |
|------|------|-------|
| A | pipely | `YOUR_VPS_IP` |

### 2. Run one command

```bash
curl -fsSL https://raw.githubusercontent.com/Pedro-Furtado/pipely-ai/main/domain.sh | sh -s pipely.yourdomain.com 3002
```

Replace `pipely.yourdomain.com` with your domain and `3002` with your app port.

This will:
- Configure Nginx reverse proxy
- Install and configure SSL (Let's Encrypt)
- Update your `.env` with the HTTPS URL
- Restart the app

Your app is now live at `https://pipely.yourdomain.com`.

---

## First-Time Setup

1. **Open** `http://YOUR_IP:PORT/setup`
2. **Enter the setup key** (shown in container logs)
3. **Create your owner account** (name, email, password)
4. **Login** and start using

### Setup Key

The setup key is auto-generated on first start and shown in the logs:

```
═══════════════════════════════════════════════════════════
  PIPELY AI — SETUP KEY (auto-generated)

  2e5b1c1e-e898-4e01-bc7e-7ae3f5ef1699

  Use this key at /setup to create your owner account.
═══════════════════════════════════════════════════════════
```

View it anytime:

```bash
docker compose -f docker-compose.prod.yml logs app | grep "SETUP KEY" -A2
```

---

## Adding Team Members

1. Go to **Time** (Team) page
2. Click **Convidar** (Invite)
3. Click **Gerar link** (Generate link)
4. Copy the link and send it to your team member (WhatsApp, email, etc.)
5. Member opens the link, creates an account, and automatically joins your team

No email server required. Links expire after the configured time.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Docker Container                  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  Nginx   │  │  Server  │  │  Agent   │          │
│  │  :80     │──│  :3333   │  │  :3335   │          │
│  │ (proxy)  │  │ (API)    │  │ (cron)   │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│                      │              │                │
│                      └──────┬───────┘                │
│                             │                        │
│                    ┌────────┴────────┐               │
│                    │   PostgreSQL    │               │
│                    │     :5432       │               │
│                    └─────────────────┘               │
└─────────────────────────────────────────────────────┘
```

| Component | Description |
|-----------|-------------|
| **Nginx** | Serves frontend + proxies API requests |
| **Server** | Express 5 REST API with JWT auth |
| **Agent** | AI automation — polls every 60s, processes WhatsApp webhooks |
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
| **Auto-status** | Change task status on block entry |
| **Notification** | Notify member when task enters block |

---

## Environment Variables

All variables are auto-generated by `setup.sh`. You can view/edit them in `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_USER` | PostgreSQL username | `pipely` |
| `DB_PASSWORD` | PostgreSQL password | *auto-generated* |
| `DB_NAME` | Database name | `pipely_ai` |
| `JWT_SECRET` | JWT signing secret | *auto-generated* |
| `APP_URL` | Your domain or IP | *detected* |
| `APP_PORT` | Port to expose | `80` |
| `POLL_INTERVAL_MS` | Agent poll interval | `60000` |

---

## Integrations

### WhatsApp (Evolution Go)

1. Go to **WhatsApp** page
2. Enter your Evolution Go server URL and API key
3. Create and connect an instance
4. Scan QR code

### AI (OpenAI)

1. Go to **Assistente de IA** page
2. Enter your OpenAI API key
3. The agent uses GPT-4o-mini for message generation and response analysis

---

## Commands

```bash
# View logs
docker compose -f docker-compose.prod.yml logs app

# View logs (follow)
docker compose -f docker-compose.prod.yml logs -f app

# Stop
docker compose -f docker-compose.prod.yml down

# Start
docker compose -f docker-compose.prod.yml up -d

# Restart
docker compose -f docker-compose.prod.yml restart app

# Update to latest version
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# View credentials
cat .env
```

---

## Local Development

The fastest way:

```bash
curl -fsSL https://raw.githubusercontent.com/Pedro-Furtado/pipely-ai/main/install.sh | sh -s -- --local
```

Or manually:

```bash
git clone https://github.com/Pedro-Furtado/pipely-ai.git && cd pipely-ai

# PostgreSQL
docker run --name postgres-pipely \
  -e POSTGRES_USER=pipely \
  -e POSTGRES_PASSWORD=pipely123 \
  -e POSTGRES_DB=pipely_ai \
  -p 5433:5432 -d postgres:17

# Install & configure
npm install && cd server && npm install && cd .. && cd agent && npm install && cd ..
cp .env.example .env && cp server/.env.example server/.env && cp agent/.env.example agent/.env
cd server && npm run db:push && npm run db:generate && cd ..

# Run
npm run dev:all          # Frontend + Backend
cd agent && npm run dev  # Agent (separate terminal)
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
| **Infra** | Docker, Nginx |

---

## License

MIT — use it however you want.
