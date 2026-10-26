#!/usr/bin/env bash

# Phryvos Installer Script
# Installs Phryvos on Linux, macOS, and Android (Termux)

set -e

REPO_URL="https://github.com/Krishna-chthonic/Phryvos-k9.git"
INSTALL_DIR="${HOME}/.phryvos"

# Terminal Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
cat << "EOF"
   ____  __                               
  / __ \/ /_  ______  ______  ______  _____
 / /_/ / __ \/ ___/ / / / / / / __ \/ ___/
/ ____/ / / / /  / /_/ / /_/ / /_/ (__  ) 
/_/   /_/ /_/_/   \__, /\__,_/\____/____/  
                 /____/                    
EOF
echo -e "${NC}"
echo -e "${BLUE}=== Phryvos Installer ===${NC}\n"

# 1. Environment & Dependency Checks
echo -e "${BLUE}[1/4] Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo "Please install Node.js (version 20 or higher) and try again."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${YELLOW}Warning: Node.js version $(node -v) detected. Version 20+ is recommended.${NC}"
fi

# Check Git
if ! command -v git >/dev/null 2>&1; then
    echo -e "${RED}Error: Git is not installed.${NC}"
    exit 1
fi
echo -e "${GREEN}✔ Node.js $(node -v) and Git detected.${NC}"

# 2. Setup Source Files
echo -e "\n${BLUE}[2/4] Setting up Phryvos codebase...${NC}"

# Check if current directory is already the Phryvos repo
if [ -f "./bin/phryvos.mjs" ] && [ -f "./package.json" ]; then
    SOURCE_DIR="$(pwd)"
    echo -e "${GREEN}✔ Using current directory: ${SOURCE_DIR}${NC}"
else
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "Existing installation found in ${INSTALL_DIR}. Updating..."
        cd "$INSTALL_DIR"
        git pull || true
    else
        echo -e "Cloning Phryvos into ${INSTALL_DIR}..."
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
    SOURCE_DIR="$INSTALL_DIR"
fi

# 3. Install & Build
echo -e "\n${BLUE}[3/4] Installing dependencies & building...${NC}"
cd "$SOURCE_DIR"

# Ensure proot/glibc PATH priority if available
if [ -f "/usr/bin/node" ]; then
    export PATH="/usr/bin:/usr/sbin:/sbin:/bin:/usr/local/bin:$PATH"
fi

npm install --legacy-peer-deps
echo -e "${GREEN}✔ Dependencies installed.${NC}"

echo -e "Building Next.js application..."
npm run build
echo -e "${GREEN}✔ Build completed successfully.${NC}"

# 4. Link CLI Binary
echo -e "\n${BLUE}[4/4] Linking 'phryvos-k9' command to PATH...${NC}"
chmod +x "${SOURCE_DIR}/bin/phryvos.mjs"

BIN_DIR=""
if [ -n "$PREFIX" ] && [ -d "$PREFIX/bin" ]; then
    BIN_DIR="$PREFIX/bin"
elif [ -w "/usr/local/bin" ]; then
    BIN_DIR="/usr/local/bin"
else
    mkdir -p "$HOME/.local/bin"
    BIN_DIR="$HOME/.local/bin"
fi

ln -sf "${SOURCE_DIR}/bin/phryvos.mjs" "${BIN_DIR}/phryvos-k9"
ln -sf "${SOURCE_DIR}/bin/phryvos.mjs" "${BIN_DIR}/phryvos"
echo -e "${GREEN}✔ Linked executables to ${BIN_DIR}/phryvos-k9${NC}"

# Check if BIN_DIR is in user's PATH
if ! command -v phryvos-k9 >/dev/null 2>&1; then
    echo -e "${YELLOW}Notice: ${BIN_DIR} is not in your PATH.${NC}"
    echo -e "Add this line to your ~/.bashrc or ~/.zshrc:"
    echo -e "  export PATH=\"${BIN_DIR}:\$PATH\""
fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✨ Phryvos K9 installed successfully!${NC}"
echo -e "${GREEN}========================================${NC}\n"
echo -e "Usage:"
echo -e "  ${CYAN}phryvos-k9 start${NC}     - Start Phryvos K9 in the background"
echo -e "  ${CYAN}phryvos-k9 status${NC}    - Check server status"
echo -e "  ${CYAN}phryvos-k9 logs${NC}      - View server logs"
echo -e "  ${CYAN}phryvos-k9 stop${NC}      - Stop Phryvos K9"
echo -e "  ${CYAN}phryvos-k9 update${NC}    - Check for latest updates\n"
