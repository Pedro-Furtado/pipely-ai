#!/bin/sh
set -e

# ═══════════════════════════════════════════════════════════════════════════════
# Pipely AI — Universal Installer
# Works on VPS (production) and local machine (development)
# ═══════════════════════════════════════════════════════════════════════════════

REPO="https://raw.githubusercontent.com/Pedro-Furtado/pipely-ai/main"
DIR="pipely-ai"

# ─── Colors ───────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  BOLD="\033[1m"
  DIM="\033[2m"
  GREEN="\033[32m"
  YELLOW="\033[33m"
  CYAN="\033[36m"
  RED="\033[31m"
  RESET="\033[0m"
  CHECK="${GREEN}✓${RESET}"
  CROSS="${RED}✗${RESET}"
  ARROW="${CYAN}→${RESET}"
  WARN="${YELLOW}!${RESET}"
else
  BOLD="" DIM="" GREEN="" YELLOW="" CYAN="" RED="" RESET=""
  CHECK="[OK]" CROSS="[X]" ARROW="->" WARN="[!]"
fi

header() {
  echo ""
  printf "  ${BOLD}══════════════════════════════════════════${RESET}\n"
  printf "  ${BOLD}  Pipely AI — $1${RESET}\n"
  printf "  ${BOLD}══════════════════════════════════════════${RESET}\n"
  echo ""
}

info()    { printf "  ${ARROW} $1\n"; }
success() { printf "  ${CHECK} $1\n"; }
warn()    { printf "  ${WARN} $1\n"; }
fail()    { printf "  ${CROSS} $1\n"; }
step()    { printf "\n  ${BOLD}[$1/$TOTAL_STEPS] $2${RESET}\n\n"; }

# ─── Detect environment ──────────────────────────────────────────────────────
detect_mode() {
  # If --production or --local passed, use that
  if [ "$1" = "--production" ] || [ "$1" = "--prod" ] || [ "$1" = "-p" ]; then
    MODE="production"
    return
  fi
  if [ "$1" = "--local" ] || [ "$1" = "--dev" ] || [ "$1" = "-d" ]; then
    MODE="local"
    return
  fi

  header "Installer"

  printf "  ${BOLD}How do you want to run Pipely AI?${RESET}\n\n"
  printf "  ${CYAN}1)${RESET} ${BOLD}Production${RESET}  ${DIM}— VPS/server with Docker (recommended)${RESET}\n"
  printf "  ${CYAN}2)${RESET} ${BOLD}Local Dev${RESET}   ${DIM}— your machine with Node.js for development${RESET}\n"
  echo ""
  printf "  Choose [1/2]: "
  read -r CHOICE < /dev/tty

  case "$CHOICE" in
    2) MODE="local" ;;
    *) MODE="production" ;;
  esac
}

# ═══════════════════════════════════════════════════════════════════════════════
# DEPENDENCY CHECKS
# ═══════════════════════════════════════════════════════════════════════════════

check_command() {
  if command -v "$1" >/dev/null 2>&1; then
    VERSION=$($1 --version 2>&1 | head -1)
    success "$2 ${DIM}($VERSION)${RESET}"
    return 0
  else
    return 1
  fi
}

check_docker() {
  if check_command docker "Docker"; then
    return 0
  fi

  warn "Docker not found"
  printf "  Install Docker now? (Y/n): "
  read -r CONFIRM < /dev/tty
  if [ "$CONFIRM" = "n" ] || [ "$CONFIRM" = "N" ]; then
    fail "Docker is required for production mode"
    exit 1
  fi

  info "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  success "Docker installed"
}

check_node() {
  if check_command node "Node.js"; then
    NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -lt 18 ]; then
      fail "Node.js 18+ required (found v$NODE_MAJOR)"
      exit 1
    fi
    return 0
  fi

  fail "Node.js not found"
  echo ""
  info "Install Node.js 22 LTS:"
  echo ""
  printf "  ${DIM}# macOS/Linux:${RESET}\n"
  printf "  curl -fsSL https://fnm.vercel.app/install | bash\n"
  printf "  fnm install 22\n"
  echo ""
  printf "  ${DIM}# Or download from: https://nodejs.org${RESET}\n"
  echo ""
  exit 1
}

check_npm() {
  if check_command npm "npm"; then
    return 0
  fi
  fail "npm not found (should come with Node.js)"
  exit 1
}

check_git() {
  if check_command git "Git"; then
    return 0
  fi
  warn "Git not found — will download files via curl instead"
  return 1
}

check_docker_compose() {
  if docker compose version >/dev/null 2>&1; then
    VERSION=$(docker compose version --short 2>&1)
    success "Docker Compose ${DIM}($VERSION)${RESET}"
    return 0
  fi
  fail "Docker Compose not found (included with Docker Desktop)"
  exit 1
}

# ═══════════════════════════════════════════════════════════════════════════════
# PRODUCTION MODE
# ═══════════════════════════════════════════════════════════════════════════════

install_production() {
  TOTAL_STEPS=5
  header "Production Setup"

  # ── Step 1: Check dependencies ──────────────────────────────────────────────
  step 1 "Checking dependencies"
  check_docker
  check_docker_compose

  # ── Step 2: Create directory & download files ───────────────────────────────
  step 2 "Downloading files"

  if [ -d "$DIR" ]; then
    warn "Directory '$DIR' already exists"
    printf "  Reinstall? (y/N): "
    read -r CONFIRM < /dev/tty
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
      info "Cancelled"
      exit 0
    fi
    echo ""
  fi

  mkdir -p "$DIR"
  cd "$DIR"

  curl -fsSL "$REPO/docker-compose.prod.yml" -o docker-compose.yml
  success "docker-compose.yml"
  curl -fsSL "$REPO/setup.sh" -o setup.sh
  success "setup.sh"
  curl -fsSL "$REPO/domain.sh" -o domain.sh
  success "domain.sh"
  chmod +x setup.sh domain.sh

  # ── Step 3: Configure environment ──────────────────────────────────────────
  step 3 "Configuring environment"

  if [ -f ".env" ]; then
    warn ".env already exists"
    printf "  Overwrite? (y/N): "
    read -r CONFIRM < /dev/tty
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
      success "Keeping existing .env"
    else
      generate_prod_env
    fi
  else
    generate_prod_env
  fi

  APP_URL=$(grep APP_URL .env | cut -d= -f2)
  APP_PORT=$(grep APP_PORT .env | cut -d= -f2)

  # ── Step 4: Domain + SSL (optional) ────────────────────────────────────────
  step 4 "Domain & SSL (optional)"

  printf "  Configure custom domain with SSL? (y/N): "
  read -r SETUP_DOMAIN < /dev/tty

  if [ "$SETUP_DOMAIN" = "y" ] || [ "$SETUP_DOMAIN" = "Y" ]; then
    printf "  Enter your domain (e.g. pipely.yourdomain.com): "
    read -r DOMAIN < /dev/tty
    if [ -n "$DOMAIN" ]; then
      ./domain.sh "$DOMAIN" "$APP_PORT"
      APP_URL="https://$DOMAIN"
    fi
  else
    info "Skipped — you can set this up later with ./domain.sh"
  fi

  # ── Step 5: Start services ─────────────────────────────────────────────────
  step 5 "Starting services"

  docker compose up -d
  success "Containers started"
  echo ""
  info "Waiting for services to initialize..."
  sleep 10

  # ── Extract setup key ───────────────────────────────────────────────────────
  SETUP_KEY=$(docker compose logs app 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -A2 "SETUP KEY" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')

  # ── Done ────────────────────────────────────────────────────────────────────
  show_prod_summary "$APP_URL" "$APP_PORT" "$SETUP_KEY"
}

generate_prod_env() {
  DB_PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
  JWT_SECRET=$(head -c 48 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 64)

  info "Detecting public IP..."
  PUBLIC_IP=$(curl -s4 --max-time 5 ifconfig.me 2>/dev/null || echo "")

  if [ -z "$PUBLIC_IP" ]; then
    warn "Could not detect IP automatically"
    printf "  Enter your VPS IP or domain: "
    read -r PUBLIC_IP < /dev/tty
    [ -z "$PUBLIC_IP" ] && PUBLIC_IP="localhost"
  else
    success "Detected: $PUBLIC_IP"
    printf "  Use this IP? (Y/n): "
    read -r USE_IP < /dev/tty
    if [ "$USE_IP" = "n" ] || [ "$USE_IP" = "N" ]; then
      printf "  Enter your VPS IP or domain: "
      read -r PUBLIC_IP < /dev/tty
    fi
  fi

  printf "  Port (default 80): "
  read -r APP_PORT < /dev/tty
  [ -z "$APP_PORT" ] && APP_PORT="80"

  cat > .env <<EOF
# Pipely AI — Generated $(date -u +"%Y-%m-%d %H:%M:%S UTC")

DB_USER=pipely
DB_PASSWORD=$DB_PASSWORD
DB_NAME=pipely_ai

JWT_SECRET=$JWT_SECRET

APP_URL=http://$PUBLIC_IP
APP_PORT=$APP_PORT
POLL_INTERVAL_MS=60000
EOF

  success "Environment configured"
}

show_prod_summary() {
  APP_URL="$1"
  APP_PORT="$2"
  SETUP_KEY="$3"

  header "Ready!"

  if echo "$APP_URL" | grep -q "://.*\."; then
    printf "  ${BOLD}URL:${RESET}        ${GREEN}${APP_URL}${RESET}\n"
    printf "  ${BOLD}Setup:${RESET}      ${GREEN}${APP_URL}/setup${RESET}\n"
  else
    printf "  ${BOLD}URL:${RESET}        ${GREEN}${APP_URL}:${APP_PORT}${RESET}\n"
    printf "  ${BOLD}Setup:${RESET}      ${GREEN}${APP_URL}:${APP_PORT}/setup${RESET}\n"
  fi

  if [ -n "$SETUP_KEY" ]; then
    printf "  ${BOLD}Setup Key:${RESET}  ${YELLOW}${SETUP_KEY}${RESET}\n"
  fi

  echo ""
  printf "  ${BOLD}Next steps:${RESET}\n"
  echo "  1. Open the Setup URL above"
  echo "  2. Enter the Setup Key"
  echo "  3. Create your owner account"
  echo ""
  printf "  ${BOLD}Commands:${RESET}\n"
  printf "  ${DIM}cd $DIR${RESET}\n"
  printf "  ${DIM}docker compose logs -f app   # View logs${RESET}\n"
  printf "  ${DIM}docker compose down          # Stop${RESET}\n"
  printf "  ${DIM}docker compose up -d         # Start${RESET}\n"
  printf "  ${DIM}cat .env                     # View config${RESET}\n"
  echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# LOCAL DEVELOPMENT MODE
# ═══════════════════════════════════════════════════════════════════════════════

install_local() {
  TOTAL_STEPS=5
  header "Local Development Setup"

  # ── Step 1: Check dependencies ──────────────────────────────────────────────
  step 1 "Checking dependencies"
  check_node
  check_npm
  HAS_DOCKER=true
  if ! command -v docker >/dev/null 2>&1; then
    HAS_DOCKER=false
    warn "Docker not found — you'll need to set up PostgreSQL manually"
  else
    success "Docker ${DIM}($(docker --version | head -1))${RESET}"
  fi

  HAS_GIT=true
  check_git || HAS_GIT=false

  # ── Step 2: Get source code ─────────────────────────────────────────────────
  step 2 "Getting source code"

  if [ -f "package.json" ] && grep -q "pipely" package.json 2>/dev/null; then
    success "Already in Pipely AI directory"
    PROJECT_DIR="."
  elif [ -d "$DIR" ] && [ -f "$DIR/package.json" ]; then
    success "Found existing $DIR directory"
    cd "$DIR"
    PROJECT_DIR="$DIR"
  else
    if [ "$HAS_GIT" = "true" ]; then
      info "Cloning repository..."
      git clone https://github.com/Pedro-Furtado/pipely-ai.git "$DIR"
      cd "$DIR"
      PROJECT_DIR="$DIR"
      success "Repository cloned"
    else
      fail "Git is required to clone the repository"
      echo ""
      info "Install Git or clone manually:"
      printf "  ${DIM}git clone https://github.com/Pedro-Furtado/pipely-ai.git${RESET}\n"
      exit 1
    fi
  fi

  # ── Step 3: Install dependencies ───────────────────────────────────────────
  step 3 "Installing dependencies"

  if [ -d "node_modules" ]; then
    success "Root dependencies (already installed)"
  else
    info "Installing root dependencies..."
    npm install
    success "Root dependencies"
  fi

  if [ -d "server/node_modules" ]; then
    success "Server dependencies (already installed)"
  else
    info "Installing server dependencies..."
    (cd server && npm install)
    success "Server dependencies"
  fi

  if [ -d "agent/node_modules" ]; then
    success "Agent dependencies (already installed)"
  else
    info "Installing agent dependencies..."
    (cd agent && npm install)
    success "Agent dependencies"
  fi

  # ── Step 4: Configure environment ──────────────────────────────────────────
  step 4 "Configuring environment"

  DB_USER="pipely"
  DB_PASS="pipely123"
  DB_PORT="5433"
  DB_NAME="pipely_ai"

  copy_env_if_needed ".env.example" ".env" "Root .env"
  copy_env_if_needed "server/.env.example" "server/.env" "Server .env"
  copy_env_if_needed "agent/.env.example" "agent/.env" "Agent .env"

  # ── Step 5: Database setup ─────────────────────────────────────────────────
  step 5 "Database setup"

  if [ "$HAS_DOCKER" = "true" ]; then
    CONTAINER_NAME="postgres-pipely"
    RUNNING=$(docker ps -q -f name="$CONTAINER_NAME" 2>/dev/null || echo "")
    EXISTS=$(docker ps -aq -f name="$CONTAINER_NAME" 2>/dev/null || echo "")

    if [ -n "$RUNNING" ]; then
      success "PostgreSQL container already running"
    elif [ -n "$EXISTS" ]; then
      info "Starting existing PostgreSQL container..."
      docker start "$CONTAINER_NAME" >/dev/null
      success "PostgreSQL container started"
    else
      info "Creating PostgreSQL container..."
      docker run --name "$CONTAINER_NAME" \
        -e POSTGRES_USER="$DB_USER" \
        -e POSTGRES_PASSWORD="$DB_PASS" \
        -e POSTGRES_DB="$DB_NAME" \
        -p "$DB_PORT":5432 \
        -d postgres:17 >/dev/null
      success "PostgreSQL container created (port $DB_PORT)"
      info "Waiting for database to be ready..."
      sleep 3
    fi
  else
    warn "Set up PostgreSQL manually with these credentials:"
    echo ""
    printf "  ${DIM}User:     $DB_USER${RESET}\n"
    printf "  ${DIM}Password: $DB_PASS${RESET}\n"
    printf "  ${DIM}Database: $DB_NAME${RESET}\n"
    printf "  ${DIM}Port:     $DB_PORT${RESET}\n"
    echo ""
  fi

  info "Syncing database schema..."
  (cd server && npm run db:push 2>&1) | tail -1
  success "Schema synced"

  info "Generating Prisma client..."
  (cd server && npm run db:generate 2>&1) | tail -1
  success "Prisma client generated"

  # ── Done ────────────────────────────────────────────────────────────────────
  show_local_summary "$PROJECT_DIR"
}

copy_env_if_needed() {
  SRC="$1"
  DEST="$2"
  LABEL="$3"

  if [ -f "$DEST" ]; then
    success "$LABEL (already exists)"
  elif [ -f "$SRC" ]; then
    cp "$SRC" "$DEST"
    success "$LABEL"
  else
    warn "$LABEL — no .env.example found, skipping"
  fi
}

show_local_summary() {
  PROJECT_DIR="$1"

  header "Ready!"

  printf "  ${BOLD}Services:${RESET}\n"
  printf "  ${GREEN}Frontend${RESET}   http://localhost:5173\n"
  printf "  ${GREEN}Backend${RESET}    http://localhost:3333\n"
  printf "  ${GREEN}Agent${RESET}      http://localhost:3335\n"
  printf "  ${GREEN}Database${RESET}   localhost:5433\n"
  echo ""
  printf "  ${BOLD}Start development:${RESET}\n"
  echo ""
  if [ "$PROJECT_DIR" != "." ]; then
    printf "  ${DIM}cd $PROJECT_DIR${RESET}\n"
  fi
  printf "  ${CYAN}npm run dev:all${RESET}          ${DIM}# Frontend + Backend + Agent${RESET}\n"
  echo ""
  printf "  ${BOLD}Useful commands:${RESET}\n"
  printf "  ${DIM}npm run dev              # Frontend only${RESET}\n"
  printf "  ${DIM}npm run dev:server       # Backend only${RESET}\n"
  printf "  ${DIM}cd server && npm run db:studio  # Database UI${RESET}\n"
  echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# UNINSTALL
# ═══════════════════════════════════════════════════════════════════════════════

uninstall() {
  header "Uninstall"

  printf "  ${RED}${BOLD}This will permanently remove Pipely AI:${RESET}\n"
  echo ""

  # Detect what exists
  HAS_LOCAL_DIR=false
  HAS_PROD_DIR=false
  HAS_CONTAINER=false
  HAS_PROD_CONTAINERS=false

  if [ -d "$DIR" ] && [ -f "$DIR/package.json" ] && grep -q "pipely" "$DIR/package.json" 2>/dev/null; then
    HAS_LOCAL_DIR=true
    printf "  ${WARN} Directory: ${BOLD}$(pwd)/$DIR${RESET}\n"
  elif [ -f "package.json" ] && grep -q "pipely" package.json 2>/dev/null; then
    HAS_LOCAL_DIR=true
    printf "  ${WARN} Directory: ${BOLD}$(pwd)${RESET}\n"
  fi

  if [ -d "$DIR" ] && [ -f "$DIR/docker-compose.yml" ] && ! [ -f "$DIR/package.json" ]; then
    HAS_PROD_DIR=true
    printf "  ${WARN} Production directory: ${BOLD}$(pwd)/$DIR${RESET}\n"
  fi

  if command -v docker >/dev/null 2>&1; then
    if docker ps -aq -f name="postgres-pipely" 2>/dev/null | grep -q .; then
      HAS_CONTAINER=true
      printf "  ${WARN} Docker container: ${BOLD}postgres-pipely${RESET}\n"
    fi

    if [ "$HAS_PROD_DIR" = "true" ] || ([ -f "docker-compose.yml" ] && docker compose ps -q 2>/dev/null | grep -q .); then
      HAS_PROD_CONTAINERS=true
      printf "  ${WARN} Production containers (app + db)\n"
    fi
  fi

  if [ "$HAS_LOCAL_DIR" = "false" ] && [ "$HAS_PROD_DIR" = "false" ] && [ "$HAS_CONTAINER" = "false" ] && [ "$HAS_PROD_CONTAINERS" = "false" ]; then
    info "Nothing to uninstall."
    exit 0
  fi

  echo ""
  printf "  ${RED}Are you sure? This cannot be undone. (y/N):${RESET} "
  read -r CONFIRM < /dev/tty
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    info "Cancelled."
    exit 0
  fi
  echo ""

  # Stop and remove production containers
  if [ "$HAS_PROD_CONTAINERS" = "true" ]; then
    if [ "$HAS_PROD_DIR" = "true" ]; then
      info "Stopping production containers..."
      (cd "$DIR" && docker compose down -v 2>/dev/null) || true
      success "Production containers removed"
    elif [ -f "docker-compose.yml" ]; then
      info "Stopping production containers..."
      docker compose down -v 2>/dev/null || true
      success "Production containers removed"
    fi
  fi

  # Remove dev PostgreSQL container
  if [ "$HAS_CONTAINER" = "true" ]; then
    info "Removing PostgreSQL container..."
    docker rm -f postgres-pipely >/dev/null 2>&1 || true
    success "Container postgres-pipely removed"
  fi

  # Remove project directory
  if [ "$HAS_LOCAL_DIR" = "true" ]; then
    if [ -d "$DIR" ]; then
      info "Removing directory $DIR..."
      rm -rf "$DIR"
      success "Directory removed"
    else
      warn "You are inside the project directory."
      info "Run this from the parent directory, then delete manually:"
      printf "  ${DIM}cd .. && rm -rf $(basename "$(pwd)")${RESET}\n"
    fi
  fi

  if [ "$HAS_PROD_DIR" = "true" ]; then
    info "Removing production directory $DIR..."
    rm -rf "$DIR"
    success "Directory removed"
  fi

  echo ""
  success "Pipely AI has been uninstalled."
  echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

# Handle --uninstall before mode detection
if [ "$1" = "--uninstall" ] || [ "$1" = "--remove" ]; then
  uninstall
  exit 0
fi

detect_mode "$1"

case "$MODE" in
  production) install_production ;;
  local)      install_local ;;
esac
