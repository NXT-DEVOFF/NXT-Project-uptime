#!/usr/bin/bin/bash
# ============================================================================
#  NXT Project Tracker — Script de déploiement automatique Debian 12
#  Version : 1.0.0
#  Usage   : sudo bash deploy.sh
# ============================================================================

set -euo pipefail

# ─── Couleurs ────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Helpers ─────────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC}    $1"; }
success() { echo -e "${GREEN}[OK]${NC}      $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}    $1"; }
error()   { echo -e "${RED}[ERROR]${NC}   $1"; exit 1; }
step()    { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}\n"; }

check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "Ce script doit être exécuté en root (sudo bash deploy.sh)"
    fi
}

prompt() {
    local var="$1" question="$2" default="${3:-}" hidden="${4:-false}"
    if [[ "$hidden" == "true" ]]; then
        echo -ne "${CYAN}${question}:${NC} "
        read -rs VALUE
        echo
    else
        if [[ -n "$default" ]]; then
            echo -ne "${CYAN}${question} [${default}]:${NC} "
        else
            echo -ne "${CYAN}${question}:${NC} "
        fi
        read -r VALUE
        VALUE="${VALUE:-$default}"
    fi
    eval "$var='$VALUE'"
}

confirm() {
    local question="$1"
    echo -ne "${YELLOW}${question} (y/n) [y]:${NC} "
    read -r answer
    answer="${answer:-y}"
    [[ "$answer" =~ ^[YyOo]$ ]]
}

# ─── Variables globales ──────────────────────────────────────────────────────
APP_DIR="/opt/nxt-project"
APP_USER="nxtdeploy"
LOG_DIR="/var/log/nxt"
BACKUP_DIR="/opt/backups"
SSH_PORT=2222
NODE_MAJOR=20

DB_NAME="project_tracker"
DB_USER="nxt_user"
DB_PASS=""

REDIS_PASS=""
REDIS_PORT=6379

DOMAIN=""
HAS_DOMAIN=false
SETUP_SSL=false

BACKEND_PORT=5000
FRONTEND_PORT=3000

GIT_REPO=""

# ============================================================================
#  ÉTAPE 0 — Vérifications préalables
# ============================================================================
step "0 — Vérifications préalables"
check_root

if [[ ! -f /etc/debian_version ]]; then
    error "Ce script est conçu pour Debian uniquement."
fi

DEB_VER=$(cat /etc/debian_version | grep -oP '^\d+' || echo "0")
if [[ "$DEB_VER" -lt 12 ]]; then
    warn "Debian $DEB_VER détecté. Ce script est optimisé pour Debian 12."
fi

success "Environnement validé (Debian $(cat /etc/debian_version))"

# ============================================================================
#  ÉTAPE 1 — Collecte des informations
# ============================================================================
step "1 — Configuration"

prompt DOMAIN "Nom de domaine (ex: tracker.example.com) ou IP publique" ""
prompt GIT_REPO "URL du dépôt Git (laisser vide si déjà cloné)" ""
prompt DB_PASS "Mot de passe pour l'utilisateur MySQL '$DB_USER'" "" true
prompt REDIS_PASS "Mot de passe pour Redis" "" true
prompt SSH_PORT "Port SSH" "2222"
prompt APP_USER "Utilisateur système pour l'application" "nxtdeploy"

if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    HAS_DOMAIN=false
    warn "IP publique détectée — SSL non disponible sans domaine"
else
    HAS_DOMAIN=true
    if confirm "Configurer SSL avec Let's Encrypt pour $DOMAIN ?"; then
        SETUP_SSL=true
    fi
fi

echo ""
echo -e "${BOLD}━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━${NC}"
echo -e "${BOLD}  Récapitulatif de la configuration :${NC}"
echo -e "  Domaine / IP     : $DOMAIN"
echo -e "  Dépôt Git        : ${GIT_REPO:-<déjà cloné>}"
echo -e "  Utilisateur      : $APP_USER"
echo -e "  Port SSH         : $SSH_PORT"
echo -e "  Port Backend      : $BACKEND_PORT"
echo -e "  Port Frontend    : $FRONTEND_PORT"
echo -e "  SSL Let's Encrypt: $SETUP_SSL"
echo -e "${BOLD}━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━ ━━${NC}"

if ! confirm "Confirmer le déploiement ?"; then
    echo "Déploiement annulé."
    exit 0
fi

# ============================================================================
#  ÉTAPE 2 — Mise à jour système & paquets de base
# ============================================================================
step "2 — Mise à jour du système"

info "Mise à jour des paquets..."
export DEBIAN_FRONTEND=noninteractive
apt update -y && apt upgrade -y -o Dpkg::Options::="--force-confold"

info "Installation des paquets de base..."
apt install -y \
    curl wget git unzip htop tmux nano ufw \
    software-properties-common apt-transport-https \
    gnupg2 ca-certificates lsb-release \
    logrotate

success "Système mis à jour"

# ============================================================================
#  ÉTAPE 3 — Utilisateur de déploiement
# ============================================================================
step "3 — Création de l'utilisateur $APP_USER"

if id "$APP_USER" &>/dev/null; then
    info "L'utilisateur $APP_USER existe déjà"
else
    info "Création de l'utilisateur $APP_USER..."
    adduser --disabled-password --gecos "" "$APP_USER"
    echo "$APP_USER:$(openssl rand -base64 18)" | chpasswd
    usermod -aG sudo "$APP_USER"

    # Créer le dossier .ssh
    mkdir -p /home/"$APP_USER"/.ssh
    if [[ -f /root/.ssh/authorized_keys ]] && [[ -s /root/.ssh/authorized_keys ]]; then
        cp /root/.ssh/authorized_keys /home/"$APP_USER"/.ssh/authorized_keys
        chown -R "$APP_USER":"$APP_USER" /home/"$APP_USER"/.ssh
        chmod 700 /home/"$APP_USER"/.ssh
        chmod 600 /home/"$APP_USER"/.ssh/authorized_keys
        success "Clés SSH copiées pour $APP_USER"
    else
        # Pas de clé existante — autoriser temporairement le login par mot de passe
        # pour que l'utilisateur puisse se connecter et ajouter sa clé
        touch /home/"$APP_USER"/.ssh/authorized_keys
        chown -R "$APP_USER":"$APP_USER" /home/"$APP_USER"/.ssh
        chmod 700 /home/"$APP_USER"/.ssh
        chmod 600 /home/"$APP_USER"/.ssh/authorized_keys
        warn "Aucune clé SSH trouvée pour root"
        warn "Ajoutez votre clé manuellement :"
        warn "  ssh-copy-id -p $SSH_PORT $APP_USER@$DOMAIN"
        warn "OU connectez-vous par mot de passe puis ajoutez votre clé dans ~/.ssh/authorized_keys"
        # On garde PasswordAuthentication activé temporairement jusqu'à ce que
        # l'utilisateur ait ajouté sa clé SSH
       _sshd_tmp="/etc/ssh/sshd_config.d/temp-password.conf"
        cat > "$_sshd_tmp" <<SSHPASS
# Temporaire — autorise le login par mot de passe jusqu'à l'ajout d'une clé SSH
# Supprimez ce fichier après avoir ajouté votre clé et redémarrez sshd
PasswordAuthentication yes
SSHPASS
        systemctl restart sshd
        warn "Login par mot de passe TEMPORAIREMENT activé pour $APP_USER"
        warn "⚠️  Après avoir ajouté votre clé SSH, exécutez :"
        warn "   sudo rm /etc/ssh/sshd_config.d/temp-password.conf && sudo systemctl restart sshd"
    fi

    success "Utilisateur $APP_USER créé avec accès sudo"
fi

# ============================================================================
#  ÉTAPE 4 — Sécurisation SSH
# ============================================================================
step "4 — Sécurisation SSH"

SSHD_CONFIG="/etc/ssh/sshd_config"
SSHD_CUSTOM="/etc/ssh/sshd_config.d/custom.conf"

info "Configuration SSH..."

# Sauvegarder la config originale
cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.$(date +%s)"

# Écrire la config custom dans sshd_config.d (méthode Debian recommandée)
cat > "$SSHD_CUSTOM" <<SSHCONF
# NXT Deploy - SSH Hardening
Port ${SSH_PORT}
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no
SSHCONF

# S'assurer que le dossier sshd_config.d est inclus
if ! grep -q "Include /etc/ssh/sshd_config.d" "$SSHD_CONFIG"; then
    sed -i '1i Include /etc/ssh/sshd_config.d/*.conf' "$SSHD_CONFIG"
fi

systemctl restart sshd

warn "SSH configuré sur le port $SSH_PORT — root login désactivé"
warn "Testez la connexion avant de fermer cette session :"
echo -e "  ${CYAN}ssh -p $SSH_PORT $APP_USER@$DOMAIN${NC}"

# ============================================================================
#  ÉTAPE 5 — MariaDB
# ============================================================================
step "5 — Installation & configuration MariaDB"

info "Installation de MariaDB..."
apt install -y mariadb-server mariadb-client
systemctl enable mariadb
systemctl start mariadb

info "Sécurisation de MariaDB..."
# Essayer sans mot de passe d'abord (première installation)
# puis avec le mot de passe si le script a déjà été lancé
MYSQL_ROOT_CMD=""
if mysql -u root -e "SELECT 1;" &>/dev/null; then
    MYSQL_ROOT_CMD="mysql -u root"
    info "Connexion root MySQL sans mot de passe — première installation"
elif [[ -f /root/.mysql_root_pass ]]; then
    PREV_PASS=$(cat /root/.mysql_root_pass)
    if mysql -u root -p"${PREV_PASS}" -e "SELECT 1;" &>/dev/null; then
        MYSQL_ROOT_CMD="mysql -u root -p${PREV_PASS}"
        info "Connexion root MySQL avec mot de passe existant — re-run détecté"
    fi
fi

if [[ -z "$MYSQL_ROOT_CMD" ]]; then
    warn "Impossible de se connecter à MySQL root — sécurité déjà appliquée ou mot de passe inconnu"
    warn "Si vous connaissez le mot de passe root, mettez-le dans /root/.mysql_root_pass"
    warn "Ou réinitialisez : sudo systemctl stop mariadb && sudo mysqld_safe --skip-grant-tables &"
fi

if [[ -n "$MYSQL_ROOT_CMD" ]]; then
    $MYSQL_ROOT_CMD <<MYSQLSECURE
-- Supprimer les utilisateurs anonymes
DELETE FROM mysql.user WHERE User='';
-- Supprimer le login root distant
DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
-- Supprimer la base test
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
-- Recharger
FLUSH PRIVILEGES;
MYSQLSECURE

    info "Définition du mot de passe root MariaDB..."
    ROOT_DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)
    $MYSQL_ROOT_CMD <<ROOTPASS
ALTER USER 'root'@'localhost' IDENTIFIED BY '${ROOT_DB_PASS}';
FLUSH PRIVILEGES;
ROOTPASS

    # Sauvegarder le mot de passe root pour les re-runs
    echo "$ROOT_DB_PASS" > /root/.mysql_root_pass
    chmod 600 /root/.mysql_root_pass
    info "Mot de passe root MySQL sauvegardé dans /root/.mysql_root_pass"
fi

info "Création de la base et de l'utilisateur..."
if [[ -n "$MYSQL_ROOT_CMD" ]]; then
    $MYSQL_ROOT_CMD <<DBSETUP
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT SELECT, INSERT, UPDATE, DELETE ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
DBSETUP
else
    # Tenter avec l'utilisateur nxt_user directement (si déjà créé)
    if mysql -u "$DB_USER" -p"$DB_PASS" -e "USE ${DB_NAME}; SELECT 1;" &>/dev/null; then
        info "Base ${DB_NAME} déjà accessible avec ${DB_USER}"
    else
        error "Impossible de créer la base — mot de passe root MySQL inconnu. Créez manuellement la base et l'utilisateur, puis relancez le script."
    fi
fi

# Optimisations MariaDB
cat > /etc/mysql/mariadb.conf.d/99-nxt-custom.cnf <<MYCNF
[mysqld]
# NXT Project Tracker — Optimisations production
max_connections          = 50
innodb_buffer_pool_size = 256M
innodb_log_file_size    = 64M
query_cache_size        = 32M
slow_query_log          = 1
slow_query_log_file     = /var/log/mysql/slow.log
long_query_time         = 2
local_infile            = 0
skip_name_resolve       = 1
MYCNF

mkdir -p /var/log/mysql
touch /var/log/mysql/slow.log
chown mysql:mysql /var/log/mysql
chown mysql:mysql /var/log/mysql/slow.log
systemctl restart mariadb

success "MariaDB installé et configuré"

# ============================================================================
#  ÉTAPE 6 — Redis
# ============================================================================
step "6 — Installation & configuration Redis"

info "Installation de Redis..."
apt install -y redis-server
systemctl enable redis-server

info "Configuration de Redis..."
REDIS_CONF="/etc/redis/redis.conf"
cp "$REDIS_CONF" "${REDIS_CONF}.bak.$(date +%s)"

# Appliquer les paramètres sécurisés
sed -i "s/^bind .*/bind 127.0.0.1 ::1/" "$REDIS_CONF"
sed -i "s/^# requirepass .*/requirepass ${REDIS_PASS}/" "$REDIS_CONF"
if ! grep -q "^requirepass" "$REDIS_CONF"; then
    echo "requirepass ${REDIS_PASS}" >> "$REDIS_CONF"
fi
sed -i 's/^protected-mode.*/protected-mode yes/' "$REDIS_CONF"

# Limiter la mémoire
if ! grep -q "^maxmemory" "$REDIS_CONF"; then
    echo "maxmemory 128mb" >> "$REDIS_CONF"
    echo "maxmemory-policy allkeys-lru" >> "$REDIS_CONF"
fi

# Désactiver les commandes dangereuses
cat >> "$REDIS_CONF" <<REDISECURE
# Commandes dangereuses désactivées
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command DEBUG ""
REDISECURE

systemctl restart redis-server

# Vérifier
if redis-cli -a "$REDIS_PASS" ping 2>/dev/null | grep -q PONG; then
    success "Redis installé et fonctionnel"
else
    error "Redis ne répond pas — vérifiez la configuration"
fi

# ============================================================================
#  ÉTAPE 7 — Node.js & PM2
# ============================================================================
step "7 — Installation de Node.js ${NODE_MAJOR}.x & PM2"

info "Ajout du dépôt NodeSource..."
curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -

info "Installation de Node.js..."
apt install -y nodejs

NODE_VER=$(node --version)
NPM_VER=$(npm --version)
info "Node.js $NODE_VER — npm $NPM_VER"

info "Installation de PM2..."
npm install -g pm2

success "Node.js & PM2 installés"

# ============================================================================
#  ÉTAPE 8 — Clonage & setup du projet
# ============================================================================
step "8 — Déploiement du code"

mkdir -p "$APP_DIR"
mkdir -p "$LOG_DIR"
mkdir -p "$BACKUP_DIR"

if [[ -n "$GIT_REPO" ]]; then
    info "Clonage depuis $GIT_REPO..."
    git clone "$GIT_REPO" "$APP_DIR"
else
    info "Aucun dépôt Git fourni — le projet doit déjà être présent dans $APP_DIR"
    if [[ ! -d "$APP_DIR/backend" ]]; then
        error "Le répertoire $APP_DIR/backend n'existe pas. Fournissez l'URL du dépôt Git."
    fi
fi

chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" "$LOG_DIR"
chown -R "$APP_USER":"$APP_USER" "$BACKUP_DIR"

# Installer les dépendances backend
info "Installation des dépendances backend..."
cd "$APP_DIR/backend"
# Ignorer les scripts lifecycle (husky, etc.) inutiles en production
sudo -u "$APP_USER" npm install --omit=dev --ignore-scripts
# Puis lancer les scripts npm nécessaires manuellement si besoin

# Installer les dépendances frontend
info "Installation des dépendances frontend..."
cd "$APP_DIR/frontend"
sudo -u "$APP_USER" npm install

# Construire le frontend
info "Build du frontend..."
sudo -u "$APP_USER" npm run build

if [[ ! -d "$APP_DIR/frontend/dist" ]]; then
    error "Le build frontend a échoué — dist/ introuvable"
fi

success "Code déployé et frontend construit"

# ============================================================================
#  ÉTAPE 9 — Fichiers .env
# ============================================================================
step "9 — Configuration des variables d'environnement"

if [[ "$HAS_DOMAIN" == true ]]; then
    FRONTEND_URL="https://$DOMAIN"
    API_URL="https://$DOMAIN/api"
else
    FRONTEND_URL="http://$DOMAIN"
    API_URL="http://$DOMAIN/api"
fi

# Backend .env
cat > "$APP_DIR/backend/.env" <<BACKENV
# ── Généré automatiquement par deploy.sh ──
# Database Configuration
DB_HOST=localhost
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}
DB_NAME=${DB_NAME}

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=${REDIS_PORT}
REDIS_PASSWORD=${REDIS_PASS}

# Server Configuration
HOST=127.0.0.1
PORT=${BACKEND_PORT}

# CORS Configuration
FRONTEND_URL=${FRONTEND_URL}

# Node Environment
NODE_ENV=production
BACKENV

# Frontend .env
cat > "$APP_DIR/frontend/.env" <<FRONTENV
# ── Généré automatiquement par deploy.sh ──
VITE_API_URL=${API_URL}
FRONTENV

# Sécuriser les permissions
chmod 600 "$APP_DIR/backend/.env"
chmod 600 "$APP_DIR/frontend/.env"
chown "$APP_USER":"$APP_USER" "$APP_DIR/backend/.env"
chown "$APP_USER":"$APP_USER" "$APP_DIR/frontend/.env"

success "Fichiers .env configurés et sécurisés (chmod 600)"

# ============================================================================
#  ÉTAPE 10 — Import de la base de données
# ============================================================================
step "10 — Import du schéma de base de données"

if [[ -f "$APP_DIR/db/init.sql" ]]; then
    info "Import du schéma..."
    mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$APP_DIR/db/init.sql"
    success "Schéma importé"

    if [[ -f "$APP_DIR/db/sample_data.sql" ]]; then
        if confirm "Importer les données d'exemple (sample_data.sql) ?"; then
            mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$APP_DIR/db/sample_data.sql"
            success "Données d'exemple importées"
        fi
    fi
else
    warn "Fichier db/init.sql introuvable — import ignoré"
fi

# ============================================================================
#  ÉTAPE 11 — PM2
# ============================================================================
step "11 — Configuration & démarrage PM2"

# Écrire le fichier ecosystem.config.js optimisé pour la production
cat > "$APP_DIR/ecosystem.config.js" <<ECOSYS
module.exports = {
  apps: [
    {
      name: 'nxt-backend',
      script: './backend/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production',
        PORT: ${BACKEND_PORT},
        HOST: '127.0.0.1'
      },
      error_file: '${LOG_DIR}/backend-error.log',
      out_file: '${LOG_DIR}/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 5000
    },
    {
      name: 'nxt-frontend',
      script: 'npx',
      args: 'serve -s -l 127.0.0.1:${FRONTEND_PORT} dist',
      cwd: './frontend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production'
      },
      error_file: '${LOG_DIR}/frontend-error.log',
      out_file: '${LOG_DIR}/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
ECOSYS

chown "$APP_USER":"$APP_USER" "$APP_DIR/ecosystem.config.js"

info "Démarrage des processus PM2..."
cd "$APP_DIR"
sudo -u "$APP_USER" pm2 start ecosystem.config.js --env production

sleep 3

# Vérifier
PM2_STATUS=$(sudo -u "$APP_USER" pm2 jlist 2>/dev/null | grep -c '"status":"online"' || echo "0")
if [[ "$PM2_STATUS" -ge 2 ]]; then
    success "Les 2 processus PM2 sont en ligne"
else
    warn "Tous les processus ne sont pas online — vérifiez avec : pm2 list"
    sudo -u "$APP_USER" pm2 list
fi

# Configurer le démarrage automatique
info "Configuration du démarrage automatique PM2..."
PM2_STARTUP=$(sudo -u "$APP_USER" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" 2>&1 | grep "sudo env" || true)
if [[ -n "$PM2_STARTUP" ]]; then
    eval "$PM2_STARTUP"
fi
sudo -u "$APP_USER" pm2 save

# Logrotate pour PM2
sudo -u "$APP_USER" pm2 install pm2-logrotate 2>/dev/null || true
sudo -u "$APP_USER" pm2 set pm2-logrotate:max_size 10M 2>/dev/null || true
sudo -u "$APP_USER" pm2 set pm2-logrotate:retain 7 2>/dev/null || true
sudo -u "$APP_USER" pm2 set pm2-logrotate:compress true 2>/dev/null || true

success "PM2 configuré avec auto-restart au reboot"

# ============================================================================
#  ÉTAPE 12 — Nginx
# ============================================================================
step "12 — Installation & configuration Nginx"

info "Installation de Nginx..."
apt install -y nginx
systemctl enable nginx

# Configuration du site
cat > /etc/nginx/sites-available/nxt-project <<NGINXCONF
# NXT Project Tracker — Reverse Proxy
upstream frontend {
    server 127.0.0.1:${FRONTEND_PORT};
}

upstream backend {
    server 127.0.0.1:${BACKEND_PORT};
}

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # Sécurité headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # Limite de taille upload
        client_max_body_size 100k;
    }

    # Bloquer l'accès aux fichiers sensibles
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~ \.env {
        deny all;
        access_log off;
        log_not_found off;
    }

    # Logs
    access_log /var/log/nginx/nxt-access.log;
    error_log /var/log/nginx/nxt-error.log;
}
NGINXCONF

ln -sf /etc/nginx/sites-available/nxt-project /etc/nginx/sites-enabled/nxt-project
rm -f /etc/nginx/sites-enabled/default

nginx -t || error "Configuration Nginx invalide"
systemctl reload nginx

success "Nginx configuré comme reverse proxy"

# ============================================================================
#  ÉTAPE 13 — SSL Let's Encrypt
# ============================================================================
if [[ "$SETUP_SSL" == true ]]; then
    step "13 — SSL Let's Encrypt"

    info "Installation de Certbot..."
    apt install -y certbot python3-certbot-nginx

    info "Obtention du certificat SSL pour $DOMAIN..."
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect

    # Vérifier le renouvellement auto
    certbot renew --dry-run 2>/dev/null && success "Renouvellement SSL automatique configuré"

    # Mettre à jour les .env pour HTTPS
    sed -i 's|http://|https://|g' "$APP_DIR/backend/.env"
    sed -i 's|http://|https://|g' "$APP_DIR/frontend/.env"

    # Reconstruire le frontend avec la bonne URL
    info "Rebuild du frontend avec URL HTTPS..."
    cd "$APP_DIR/frontend"
    sudo -u "$APP_USER" npm run build
    sudo -u "$APP_USER" pm2 restart nxt-frontend
    sudo -u "$APP_USER" pm2 restart nxt-backend

    success "SSL configuré — https://$DOMAIN"
else
    info "SSL ignoré (pas de domaine ou choix de l'utilisateur)"
fi

# ============================================================================
#  ÉTAPE 14 — Pare-feu UFW
# ============================================================================
step "14 — Configuration du pare-feu UFW"

# Réinitialiser (attention : peut bloquer si SSH pas dans les règles)
info "Configuration du pare-feu..."
ufw --force reset

ufw default deny incoming
ufw default allow outgoing

ufw allow "${SSH_PORT}/tcp" comment "SSH"
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"

ufw --force enable

success "Pare-feu actif — SSH:$SSH_PORT, HTTP:80, HTTPS:443"

# ============================================================================
#  ÉTAPE 15 — Script de sauvegarde
# ============================================================================
step "15 — Script de sauvegarde automatique"

cat > "$APP_DIR/backup.sh" <<BACKUPSCRIPT
#!/bin/bash
# ── NXT Project Tracker — Sauvegarde automatique ──
set -e

BACKUP_DIR="${BACKUP_DIR}"
DATE=\$(date +%Y-%m-%d_%H%M%S)
RETENTION_DAYS=7

mkdir -p "\$BACKUP_DIR"

echo "[\$(date)] Début de la sauvegarde..."

# Base de données
mysqldump -u ${DB_USER} -p'${DB_PASS}' ${DB_NAME} > "\$BACKUP_DIR/db_\$DATE.sql"

# Configurations
cp ${APP_DIR}/backend/.env "\$BACKUP_DIR/backend_env_\$DATE"
cp ${APP_DIR}/frontend/.env "\$BACKUP_DIR/frontend_env_\$DATE"

# Compression
tar -czf "\$BACKUP_DIR/nxt_backup_\$DATE.tar.gz" \\
  "\$BACKUP_DIR/db_\$DATE.sql" \\
  "\$BACKUP_DIR/backend_env_\$DATE" \\
  "\$BACKUP_DIR/frontend_env_\$DATE"

# Nettoyage fichiers temporaires
rm "\$BACKUP_DIR/db_\$DATE.sql" "\$BACKUP_DIR/backend_env_\$DATE" "\$BACKUP_DIR/frontend_env_\$DATE"

# Suppression anciennes sauvegardes
find "\$BACKUP_DIR" -name "nxt_backup_*.tar.gz" -mtime +\$RETENTION_DAYS -delete

echo "[\$(date)] Sauvegarde terminée : nxt_backup_\$DATE.tar.gz"
BACKUPSCRIPT

chmod +x "$APP_DIR/backup.sh"
chown "$APP_USER":"$APP_USER" "$APP_DIR/backup.sh"

# Cron job — sauvegarde quotidienne à 3h00
(crontab -u "$APP_USER" -l 2>/dev/null; echo "0 3 * * * ${APP_DIR}/backup.sh >> ${LOG_DIR}/backup.log 2>&1") | crontab -u "$APP_USER" -

success "Sauvegarde automatique configurée (3h00 quotidien, rétention 7j)"

# ============================================================================
#  ÉTAPE 16 — Vérifications finales
# ============================================================================
step "16 — Vérifications finales"

FAIL=0

# MariaDB
if systemctl is-active --quiet mariadb; then
    success "MariaDB           → ACTIF"
else
    error "MariaDB           → INACTIF" || true; FAIL=$((FAIL+1))
fi

# Redis
if systemctl is-active --quiet redis-server; then
    success "Redis             → ACTIF"
else
    warn "Redis             → INACTIF"; FAIL=$((FAIL+1))
fi

# Nginx
if systemctl is-active --quiet nginx; then
    success "Nginx             → ACTIF"
else
    warn "Nginx             → INACTIF"; FAIL=$((FAIL+1))
fi

# Backend health check
if curl -sf "http://127.0.0.1:${BACKEND_PORT}/api/health" > /dev/null 2>&1; then
    success "Backend API       → OK (health check)"
else
    warn "Backend API       → FAIL (health check)"; FAIL=$((FAIL+1))
fi

# Frontend
if curl -sf "http://127.0.0.1:${FRONTEND_PORT}" > /dev/null 2>&1; then
    success "Frontend          → OK"
else
    warn "Frontend          → FAIL"; FAIL=$((FAIL+1))
fi

# Nginx proxy
if curl -sf "http://127.0.0.1/api/health" > /dev/null 2>&1; then
    success "Nginx proxy       → OK"
else
    warn "Nginx proxy       → FAIL"; FAIL=$((FAIL+1))
fi

# UFW
if ufw status | grep -q "Status: active"; then
    success "Pare-feu UFW      → ACTIF"
else
    warn "Pare-feu UFW      → INACTIF"; FAIL=$((FAIL+1))
fi

# PM2 auto-startup
if systemctl is-enabled pm2-"$APP_USER" &>/dev/null; then
    success "PM2 auto-startup  → CONFIGURÉ"
else
    warn "PM2 auto-startup  → NON CONFIGURÉ"; FAIL=$((FAIL+1))
fi

# SSL
if [[ "$SETUP_SSL" == true ]]; then
    if curl -sf "https://$DOMAIN/api/health" > /dev/null 2>&1; then
        success "SSL HTTPS         → OK"
    else
        warn "SSL HTTPS         → FAIL"; FAIL=$((FAIL+1))
    fi
fi

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [[ $FAIL -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}  ✅  DÉPLOIEMENT RÉUSSI — Toutes les vérifications sont passées${NC}"
else
    echo -e "${YELLOW}${BOLD}  ⚠️  DÉPLOIEMENT TERMINÉ AVEC $FAIL AVERTISSEMENT(S)${NC}"
    echo -e "  Consultez les logs : pm2 logs, journalctl -u mariadb, etc."
fi

echo ""
echo -e "${BOLD}  🌐 URL de l'application :${NC}"
if [[ "$SETUP_SSL" == true ]]; then
    echo -e "  ${CYAN}https://${DOMAIN}${NC}"
else
    echo -e "  ${CYAN}http://${DOMAIN}${NC}"
fi

echo ""
echo -e "${BOLD}  📋 Commandes utiles :${NC}"
echo -e "  pm2 list                    # Voir les processus"
echo -e "  pm2 logs                    # Voir les logs"
echo -e "  pm2 restart nxt-backend     # Redémarrer le backend"
echo -e "  pm2 monit                   # Monitoring interactif"
echo -e "  sudo ufw status             # État du pare-feu"
echo -e "  sudo nginx -t               # Tester la config Nginx"
echo -e "  sudo systemctl status mariadb  # État MySQL"
echo ""

echo -e "${BOLD}  🔐 Identifiants à conserver :${NC}"
echo -e "  Utilisateur BDD   : ${DB_USER}"
echo -e "  Utilisateur Redis : mot de passe configuré"
echo -e "  Utilisateur SSH   : ${APP_USER} (port ${SSH_PORT})"
echo ""

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
