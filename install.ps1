# ═══════════════════════════════════════════════════════════════════════════════
# Pipely AI — Windows Installer (PowerShell)
# Works for Production (Docker) and Local Development (Node.js)
# ═══════════════════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

$REPO = "https://raw.githubusercontent.com/Pedro-Furtado/pipely-ai/main"
$DIR = "pipely-ai"

# ─── Colors ───────────────────────────────────────────────────────────────────
function Write-Header($text) {
    Write-Host ""
    Write-Host "  ══════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "    Pipely AI — $text" -ForegroundColor Cyan
    Write-Host "  ══════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step($num, $total, $text) {
    Write-Host ""
    Write-Host "  [$num/$total] $text" -ForegroundColor White
    Write-Host ""
}

function Write-Ok($text) { Write-Host "  [OK] $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  [!] $text" -ForegroundColor Yellow }
function Write-Fail($text) { Write-Host "  [X] $text" -ForegroundColor Red }
function Write-Info($text) { Write-Host "  -> $text" -ForegroundColor Cyan }

# ─── Helpers ──────────────────────────────────────────────────────────────────
function Test-Command($cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Get-CommandVersion($cmd) {
    try {
        $v = & $cmd --version 2>&1 | Select-Object -First 1
        return "$v"
    } catch { return "" }
}

# ─── Detect mode ─────────────────────────────────────────────────────────────
function Get-Mode {
    param([string]$arg)

    if ($arg -in "--production", "--prod", "-p") { return "production" }
    if ($arg -in "--local", "--dev", "-d") { return "local" }

    Write-Header "Installer"

    Write-Host "  How do you want to run Pipely AI?" -ForegroundColor White
    Write-Host ""
    Write-Host "  1) " -NoNewline -ForegroundColor Cyan
    Write-Host "Production" -NoNewline -ForegroundColor White
    Write-Host "  — VPS/server with Docker (recommended)" -ForegroundColor DarkGray
    Write-Host "  2) " -NoNewline -ForegroundColor Cyan
    Write-Host "Local Dev" -NoNewline -ForegroundColor White
    Write-Host "   — your machine with Node.js for development" -ForegroundColor DarkGray
    Write-Host ""
    $choice = Read-Host "  Choose [1/2]"

    if ($choice -eq "2") { return "local" }
    return "production"
}

# ═══════════════════════════════════════════════════════════════════════════════
# PRODUCTION MODE
# ═══════════════════════════════════════════════════════════════════════════════

function Install-Production {
    $totalSteps = 5
    Write-Header "Production Setup"

    # ── Step 1: Check dependencies ────────────────────────────────────────────
    Write-Step 1 $totalSteps "Checking dependencies"

    if (Test-Command "docker") {
        Write-Ok "Docker ($(Get-CommandVersion 'docker'))"
    } else {
        Write-Fail "Docker not found"
        Write-Host ""
        Write-Info "Install Docker Desktop from: https://docker.com/products/docker-desktop"
        exit 1
    }

    try {
        $composeVersion = docker compose version --short 2>&1
        Write-Ok "Docker Compose ($composeVersion)"
    } catch {
        Write-Fail "Docker Compose not found (included with Docker Desktop)"
        exit 1
    }

    # ── Step 2: Download files ────────────────────────────────────────────────
    Write-Step 2 $totalSteps "Downloading files"

    if (Test-Path $DIR) {
        Write-Warn "Directory '$DIR' already exists"
        $confirm = Read-Host "  Reinstall? (y/N)"
        if ($confirm -notin "y", "Y") {
            Write-Info "Cancelled"
            exit 0
        }
    }

    New-Item -ItemType Directory -Path $DIR -Force | Out-Null
    Set-Location $DIR

    Invoke-WebRequest "$REPO/docker-compose.prod.yml" -OutFile "docker-compose.yml" -UseBasicParsing
    Write-Ok "docker-compose.yml"
    Invoke-WebRequest "$REPO/setup.sh" -OutFile "setup.sh" -UseBasicParsing
    Write-Ok "setup.sh"
    Invoke-WebRequest "$REPO/domain.sh" -OutFile "domain.sh" -UseBasicParsing
    Write-Ok "domain.sh"

    # ── Step 3: Configure environment ─────────────────────────────────────────
    Write-Step 3 $totalSteps "Configuring environment"

    if (Test-Path ".env") {
        Write-Warn ".env already exists"
        $confirm = Read-Host "  Overwrite? (y/N)"
        if ($confirm -notin "y", "Y") {
            Write-Ok "Keeping existing .env"
        } else {
            New-ProdEnv
        }
    } else {
        New-ProdEnv
    }

    $envContent = Get-Content ".env" -Raw
    $appUrl = ($envContent | Select-String "APP_URL=(.+)").Matches[0].Groups[1].Value
    $appPort = ($envContent | Select-String "APP_PORT=(.+)").Matches[0].Groups[1].Value

    # ── Step 4: Domain + SSL ──────────────────────────────────────────────────
    Write-Step 4 $totalSteps "Domain & SSL (optional)"
    Write-Info "Skipped on Windows — configure domain on your VPS with ./domain.sh"

    # ── Step 5: Start services ────────────────────────────────────────────────
    Write-Step 5 $totalSteps "Starting services"

    docker compose up -d
    Write-Ok "Containers started"
    Write-Host ""
    Write-Info "Waiting for services to initialize..."
    Start-Sleep -Seconds 10

    # Extract setup key
    $logs = docker compose logs app 2>&1 | Out-String
    $cleanLogs = $logs -replace '\x1b\[[0-9;]*m', ''
    $setupKey = ""
    if ($cleanLogs -match '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})') {
        $setupKey = $Matches[1]
    }

    # ── Done ──────────────────────────────────────────────────────────────────
    Write-Header "Ready!"

    if ($appUrl -match "://.*\.") {
        Write-Host "  URL:        " -NoNewline; Write-Host "$appUrl" -ForegroundColor Green
        Write-Host "  Setup:      " -NoNewline; Write-Host "$appUrl/setup" -ForegroundColor Green
    } else {
        Write-Host "  URL:        " -NoNewline; Write-Host "${appUrl}:${appPort}" -ForegroundColor Green
        Write-Host "  Setup:      " -NoNewline; Write-Host "${appUrl}:${appPort}/setup" -ForegroundColor Green
    }
    if ($setupKey) {
        Write-Host "  Setup Key:  " -NoNewline; Write-Host "$setupKey" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "  Next steps:" -ForegroundColor White
    Write-Host "  1. Open the Setup URL above"
    Write-Host "  2. Enter the Setup Key"
    Write-Host "  3. Create your owner account"
    Write-Host ""
    Write-Host "  Commands:" -ForegroundColor White
    Write-Host "  cd $DIR" -ForegroundColor DarkGray
    Write-Host "  docker compose logs -f app   # View logs" -ForegroundColor DarkGray
    Write-Host "  docker compose down          # Stop" -ForegroundColor DarkGray
    Write-Host "  docker compose up -d         # Start" -ForegroundColor DarkGray
    Write-Host "  cat .env                     # View config" -ForegroundColor DarkGray
    Write-Host ""
}

function New-ProdEnv {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $dbPassword = [Convert]::ToBase64String($bytes).Substring(0, 32) -replace '[^a-zA-Z0-9]', 'x'

    $bytes = New-Object byte[] 64
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $jwtSecret = [Convert]::ToBase64String($bytes).Substring(0, 64) -replace '[^a-zA-Z0-9]', 'x'

    Write-Info "Detecting public IP..."
    try {
        $publicIp = (Invoke-WebRequest -Uri "https://ifconfig.me" -UseBasicParsing -TimeoutSec 5).Content.Trim()
        Write-Ok "Detected: $publicIp"
        $useIp = Read-Host "  Use this IP? (Y/n)"
        if ($useIp -in "n", "N") {
            $publicIp = Read-Host "  Enter your VPS IP or domain"
        }
    } catch {
        Write-Warn "Could not detect IP automatically"
        $publicIp = Read-Host "  Enter your VPS IP or domain"
    }
    if (-not $publicIp) { $publicIp = "localhost" }

    $appPort = Read-Host "  Port (default 80)"
    if (-not $appPort) { $appPort = "80" }

    $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss") + " UTC"
    @"
# Pipely AI — Generated $timestamp

DB_USER=pipely
DB_PASSWORD=$dbPassword
DB_NAME=pipely_ai

JWT_SECRET=$jwtSecret

APP_URL=http://$publicIp
APP_PORT=$appPort
POLL_INTERVAL_MS=60000
"@ | Set-Content ".env" -Encoding UTF8

    Write-Ok "Environment configured"
}

# ═══════════════════════════════════════════════════════════════════════════════
# LOCAL DEVELOPMENT MODE
# ═══════════════════════════════════════════════════════════════════════════════

function Install-Local {
    $totalSteps = 5
    Write-Header "Local Development Setup"

    # ── Step 1: Check dependencies ────────────────────────────────────────────
    Write-Step 1 $totalSteps "Checking dependencies"

    if (Test-Command "node") {
        $nodeVersion = (node -v) -replace 'v', ''
        $nodeMajor = [int]($nodeVersion.Split('.')[0])
        if ($nodeMajor -lt 18) {
            Write-Fail "Node.js 18+ required (found v$nodeVersion)"
            exit 1
        }
        Write-Ok "Node.js (v$nodeVersion)"
    } else {
        Write-Fail "Node.js not found"
        Write-Host ""
        Write-Info "Install Node.js 22 LTS from: https://nodejs.org"
        exit 1
    }

    if (Test-Command "npm") {
        Write-Ok "npm ($(Get-CommandVersion 'npm'))"
    } else {
        Write-Fail "npm not found (should come with Node.js)"
        exit 1
    }

    $hasDocker = Test-Command "docker"
    if ($hasDocker) {
        Write-Ok "Docker ($(Get-CommandVersion 'docker'))"
    } else {
        Write-Warn "Docker not found — you'll need to set up PostgreSQL manually"
    }

    $hasGit = Test-Command "git"
    if ($hasGit) {
        Write-Ok "Git ($(Get-CommandVersion 'git'))"
    } else {
        Write-Warn "Git not found — will need to clone manually"
    }

    # ── Step 2: Get source code ───────────────────────────────────────────────
    Write-Step 2 $totalSteps "Getting source code"

    $projectDir = "."
    if ((Test-Path "package.json") -and (Select-String -Path "package.json" -Pattern "pipely" -Quiet)) {
        Write-Ok "Already in Pipely AI directory"
    } elseif ((Test-Path "$DIR/package.json")) {
        Write-Ok "Found existing $DIR directory"
        Set-Location $DIR
        $projectDir = $DIR
    } else {
        if ($hasGit) {
            Write-Info "Cloning repository..."
            git clone https://github.com/Pedro-Furtado/pipely-ai.git $DIR
            Set-Location $DIR
            $projectDir = $DIR
            Write-Ok "Repository cloned"
        } else {
            Write-Fail "Git is required to clone the repository"
            Write-Host ""
            Write-Info "Install Git from: https://git-scm.com"
            Write-Info "Or clone manually: git clone https://github.com/Pedro-Furtado/pipely-ai.git"
            exit 1
        }
    }

    # ── Step 3: Install dependencies ──────────────────────────────────────────
    Write-Step 3 $totalSteps "Installing dependencies"

    if (Test-Path "node_modules") {
        Write-Ok "Root dependencies (already installed)"
    } else {
        Write-Info "Installing root dependencies..."
        $ErrorActionPreference = "Continue"
        npm install 2>&1 | Out-Null
        $ErrorActionPreference = "Stop"
        Write-Ok "Root dependencies"
    }

    if (Test-Path "server/node_modules") {
        Write-Ok "Server dependencies (already installed)"
    } else {
        Write-Info "Installing server dependencies..."
        $ErrorActionPreference = "Continue"
        Push-Location server; npm install 2>&1 | Out-Null; Pop-Location
        $ErrorActionPreference = "Stop"
        Write-Ok "Server dependencies"
    }

    if (Test-Path "agent/node_modules") {
        Write-Ok "Agent dependencies (already installed)"
    } else {
        Write-Info "Installing agent dependencies..."
        $ErrorActionPreference = "Continue"
        Push-Location agent; npm install 2>&1 | Out-Null; Pop-Location
        $ErrorActionPreference = "Stop"
        Write-Ok "Agent dependencies"
    }

    # ── Step 4: Configure environment ─────────────────────────────────────────
    Write-Step 4 $totalSteps "Configuring environment"

    Copy-EnvIfNeeded ".env.example" ".env" "Root .env"
    Copy-EnvIfNeeded "server/.env.example" "server/.env" "Server .env"
    Copy-EnvIfNeeded "agent/.env.example" "agent/.env" "Agent .env"

    # ── Step 5: Database setup ────────────────────────────────────────────────
    Write-Step 5 $totalSteps "Database setup"

    $dbUser = "pipely"
    $dbPass = "pipely123"
    $dbPort = "5433"
    $dbName = "pipely_ai"
    $containerName = "postgres-pipely"

    if ($hasDocker) {
        $running = docker ps -q -f "name=$containerName" 2>$null
        $exists = docker ps -aq -f "name=$containerName" 2>$null

        if ($running) {
            Write-Ok "PostgreSQL container already running"
        } elseif ($exists) {
            Write-Info "Starting existing PostgreSQL container..."
            docker start $containerName | Out-Null
            Write-Ok "PostgreSQL container started"
        } else {
            Write-Info "Creating PostgreSQL container..."
            docker run --name $containerName `
                -e "POSTGRES_USER=$dbUser" `
                -e "POSTGRES_PASSWORD=$dbPass" `
                -e "POSTGRES_DB=$dbName" `
                -p "${dbPort}:5432" `
                -d postgres:17 | Out-Null
            Write-Ok "PostgreSQL container created (port $dbPort)"
            Write-Info "Waiting for database to be ready..."
            Start-Sleep -Seconds 3
        }
    } else {
        Write-Warn "Set up PostgreSQL manually with these credentials:"
        Write-Host ""
        Write-Host "  User:     $dbUser" -ForegroundColor DarkGray
        Write-Host "  Password: $dbPass" -ForegroundColor DarkGray
        Write-Host "  Database: $dbName" -ForegroundColor DarkGray
        Write-Host "  Port:     $dbPort" -ForegroundColor DarkGray
        Write-Host ""
    }

    Write-Info "Syncing database schema..."
    $ErrorActionPreference = "Continue"
    Push-Location server; npm run db:push 2>&1 | Out-Null; Pop-Location
    $ErrorActionPreference = "Stop"
    Write-Ok "Schema synced"

    Write-Info "Generating Prisma client..."
    $ErrorActionPreference = "Continue"
    Push-Location server; npm run db:generate 2>&1 | Out-Null; Pop-Location
    $ErrorActionPreference = "Stop"
    Write-Ok "Prisma client generated"

    # ── Done ──────────────────────────────────────────────────────────────────
    Write-Header "Ready!"

    Write-Host "  Services:" -ForegroundColor White
    Write-Host "  Frontend   " -NoNewline; Write-Host "http://localhost:5173" -ForegroundColor Green
    Write-Host "  Backend    " -NoNewline; Write-Host "http://localhost:3333" -ForegroundColor Green
    Write-Host "  Agent      " -NoNewline; Write-Host "http://localhost:3335" -ForegroundColor Green
    Write-Host "  Database   " -NoNewline; Write-Host "localhost:5433" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Start development:" -ForegroundColor White
    Write-Host ""
    if ($projectDir -ne ".") {
        Write-Host "  cd $projectDir" -ForegroundColor DarkGray
    }
    Write-Host "  npm run dev:all" -NoNewline -ForegroundColor Cyan
    Write-Host "          # Frontend + Backend + Agent" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Useful commands:" -ForegroundColor White
    Write-Host "  npm run dev              # Frontend only" -ForegroundColor DarkGray
    Write-Host "  npm run dev:server       # Backend only" -ForegroundColor DarkGray
    Write-Host "  cd server; npm run db:studio  # Database UI" -ForegroundColor DarkGray
    Write-Host ""
}

function Copy-EnvIfNeeded($src, $dest, $label) {
    if (Test-Path $dest) {
        Write-Ok "$label (already exists)"
    } elseif (Test-Path $src) {
        Copy-Item $src $dest
        Write-Ok "$label"
    } else {
        Write-Warn "$label — no .env.example found, skipping"
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# UNINSTALL
# ═══════════════════════════════════════════════════════════════════════════════

function Invoke-Uninstall {
    Write-Header "Uninstall"

    Write-Host "  This will permanently remove Pipely AI:" -ForegroundColor Red
    Write-Host ""

    $hasLocalDir = $false
    $hasProdDir = $false
    $hasContainer = $false
    $hasProdContainers = $false
    $localPath = ""

    # Detect local dev install
    if ((Test-Path "$DIR/package.json") -and (Select-String -Path "$DIR/package.json" -Pattern "pipely" -Quiet)) {
        $hasLocalDir = $true
        $localPath = (Resolve-Path $DIR).Path
        Write-Warn "Directory: $localPath"
    } elseif ((Test-Path "package.json") -and (Select-String -Path "package.json" -Pattern "pipely" -Quiet)) {
        $hasLocalDir = $true
        $localPath = (Get-Location).Path
        Write-Warn "Directory: $localPath"
    }

    # Detect production install
    if ((Test-Path "$DIR/docker-compose.yml") -and -not (Test-Path "$DIR/package.json")) {
        $hasProdDir = $true
        Write-Warn "Production directory: $(Resolve-Path $DIR)"
    }

    # Detect Docker containers
    if (Test-Command "docker") {
        $container = docker ps -aq -f "name=postgres-pipely" 2>$null
        if ($container) {
            $hasContainer = $true
            Write-Warn "Docker container: postgres-pipely"
        }

        if ($hasProdDir -or ((Test-Path "docker-compose.yml") -and (docker compose ps -q 2>$null))) {
            $hasProdContainers = $true
            Write-Warn "Production containers (app + db)"
        }
    }

    if (-not $hasLocalDir -and -not $hasProdDir -and -not $hasContainer -and -not $hasProdContainers) {
        Write-Info "Nothing to uninstall."
        return
    }

    Write-Host ""
    $confirm = Read-Host "  Are you sure? This cannot be undone. (y/N)"
    if ($confirm -notin "y", "Y") {
        Write-Info "Cancelled."
        return
    }
    Write-Host ""

    # Stop and remove production containers
    if ($hasProdContainers) {
        if ($hasProdDir) {
            Write-Info "Stopping production containers..."
            Push-Location $DIR
            $ErrorActionPreference = "Continue"
            docker compose down -v 2>$null
            $ErrorActionPreference = "Stop"
            Pop-Location
            Write-Ok "Production containers removed"
        } elseif (Test-Path "docker-compose.yml") {
            Write-Info "Stopping production containers..."
            $ErrorActionPreference = "Continue"
            docker compose down -v 2>$null
            $ErrorActionPreference = "Stop"
            Write-Ok "Production containers removed"
        }
    }

    # Remove dev PostgreSQL container
    if ($hasContainer) {
        Write-Info "Removing PostgreSQL container..."
        $ErrorActionPreference = "Continue"
        docker rm -f postgres-pipely 2>$null | Out-Null
        $ErrorActionPreference = "Stop"
        Write-Ok "Container postgres-pipely removed"
    }

    # Remove project directory
    if ($hasLocalDir) {
        if (Test-Path $DIR) {
            Write-Info "Removing directory $DIR..."
            Remove-Item -Recurse -Force $DIR
            Write-Ok "Directory removed"
        } else {
            Write-Warn "You are inside the project directory."
            Write-Info "Run this from the parent directory, then delete manually:"
            Write-Host "  cd .. ; Remove-Item -Recurse -Force $(Split-Path -Leaf (Get-Location))" -ForegroundColor DarkGray
        }
    }

    if ($hasProdDir) {
        Write-Info "Removing production directory $DIR..."
        Remove-Item -Recurse -Force $DIR
        Write-Ok "Directory removed"
    }

    Write-Host ""
    Write-Ok "Pipely AI has been uninstalled."
    Write-Host ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

# Handle --uninstall before mode detection
if ($args[0] -in "--uninstall", "--remove") {
    Invoke-Uninstall
    exit 0
}

$mode = Get-Mode $args[0]

switch ($mode) {
    "production" { Install-Production }
    "local"      { Install-Local }
}
