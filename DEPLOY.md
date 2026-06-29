# 🚀 Déploiement NXT Project Tracker sur VPS Debian 12

> Guide complet pour déployer l'application NXT Project Tracker sur un VPS Debian 12 (Bookworm).
> Inclut : configuration système, MySQL, Redis, Node.js, Nginx, SSL, PM2, sécurité.

---

## 📋 Table des matières

1. [Prérequis VPS](#1--prérequis-vps)
2. [Connexion initiale & sécurité de base](#2--connexion-initiale--sécurité-de-base)
3. [Mise à jour du système](#3--mise-à-jour-du-système)
4. [Installation de MySQL](#4--installation-de-mysql)
5. [Installation de Redis](#5--installation-de-redis)
6. [Installation de Node.js](#6--installation-de-nodejs)
7. [Installation de Python (optionnel)](#7--installation-de-python-optionnel)
8. [Clonage & configuration du projet](#8--clonage--configuration-du-projet)
9. [Configuration de la base de données](#9--configuration-de-la-base-de-données)
10. [Construction & démarrage avec PM2](#10--construction--démarrage-avec-pm2)
11. [Configuration de Nginx (reverse proxy)](#11--configuration-de-nginx-reverse-proxy)
12. [SSL avec Let's Encrypt](#12--ssl-avec-lets-encrypt)
13. [Configuration du pare-feu (UFW)](#13--configuration-du-pare-feu-ufw)
14. [Vérifications & tests](#14--vérifications--tests)
15. [Sauvegardes automatiques](#15--sauvegardes-automatiques)
16. [Maintenance & surveillance](#16--maintenance--surveillance)
17. [Dépannage](#17--dépannage)

---

## 1 — Prérequis VPS

| Composant | Minimum recommandé |
|-----------|-------------------|
| **OS** | Debian 12 (Bookworm) |
| **RAM** | 1 Go minimum (2 Go recommandé) |
| **CPU** | 1 vCPU minimum |
| **Stockage** | 20 Go SSD |
| **Réseau** | Accès SSH, IP publique |
| **Domaine** | Un nom de domaine pointé vers l'IP du VPS (optionnel mais recommandé pour SSL) |

---

## 2 — Connexion initiale & sécurité de base

### Connexion SSH

```bash
ssh root@VOTRE_IP_VPS
```

### Créer un utilisateur de déploiement

```bash
# Créer l'utilisateur
adduser nxtdeploy

# Ajouter au groupe sudo
usermod -aG sudo nxtdeploy

# Copier la clé SSH (depuis votre machine locale)
ssh-copy-id nxtdeploy@VOTRE_IP_VPS
```

### Sécuriser SSH

```bash
sudo nano /etc/ssh/sshd_config
```

Modifier les valeurs suivantes :

```ini
Port 2222                         # Changer le port par défaut
PermitRootLogin no                # Désactiver le login root
PasswordAuthentication no         # Forcer l'authentification par clé
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
```

```bash
# Redémarrer SSH
sudo systemctl restart sshd
```

> ⚠️ **Important** : Gardez votre session SSH actuelle ouverte et testez la connexion sur un nouveau terminal avant de fermer la session en cours.

```bash
# Se connecter avec le nouvel utilisateur et le nouveau port
ssh -p 2222 nxtdeploy@VOTRE_IP_VPS
```

---

## 3 — Mise à jour du système

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git unzip htop tmux nano ufw software-properties-common apt-transport-headers
```

---

## 4 — Installation de MySQL

### Installer MariaDB (recommandé sur Debian 12)

```bash
sudo apt install -y mariadb-server mariadb-client
sudo systemctl enable mariadb
sudo systemctl start mariadb
```

### Sécuriser l'installation

```bash
sudo mysql_secure_installation
```

Répondre :
- `Switch to unix_socket authentication?` → **N**
- `Change the root password?` → **Y** (définir un mot de passe fort)
- `Remove anonymous users?` → **Y**
- `Disallow root login remotely?` → **Y**
- `Remove test database?` → **Y**
- `Reload privilege tables?` → **Y**

### Créer la base de données et l'utilisateur

```bash
sudo mysql -u root -p
```

```sql
-- Créer la base de données
CREATE DATABASE IF NOT EXISTS project_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Créer un utilisateur dédié (remplacer par un mot de passe fort)
CREATE USER 'nxt_user'@'localhost' IDENTIFIED BY 'VOTRE_MOT_DE_PASSE_FORT_ICI';

-- Accorder les privilèges
GRANT SELECT, INSERT, UPDATE, DELETE ON project_tracker.* TO 'nxt_user'@'localhost';

-- Appliquer les changements
FLUSH PRIVILEGES;
EXIT;
```

### Configurer MariaDB pour la production

```bash
sudo nano /etc/mysql/mariadb.conf.d/50-server.cnf
```

```ini
[mysqld]
# Optimisations de base
max_connections        = 50
innodb_buffer_pool_size = 256M
innodb_log_file_size    = 64M
query_cache_size        = 32M
slow_query_log          = 1
slow_query_log_file     = /var/log/mysql/slow.log
long_query_time         = 2

# Sécurité
local_infile            = 0
skip_name_resolve       = 1
```

```bash
sudo systemctl restart mariadb
```

---

## 5 — Installation de Redis

```bash
sudo apt install -y redis-server
```

### Configurer Redis pour la production

```bash
sudo nano /etc/redis/redis.conf
```

Modifier les valeurs suivantes :

```ini
# Bind uniquement sur localhost
bind 127.0.0.1 ::1

# Port (garder le défaut ou changer)
port 6379

# Activer l'authentification (générer un mot de passe fort)
requirepass VOTRE_MOT_DE_PASSE_REDIS_FORT

# Désactiver les commandes dangereuses
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command DEBUG ""

# Persistence
save 900 1
save 300 10
save 60 10000

# Limiter la mémoire (adapter à votre VPS)
maxmemory 128mb
maxmemory-policy allkeys-lru

# Désactiver le mode protégé (car on utilise un mot de passe)
protected-mode yes
```

```bash
sudo systemctl enable redis-server
sudo systemctl restart redis-server
```

### Vérifier Redis

```bash
redis-cli -a VOTRE_MOT_DE_PASSE_REDIS_FORT ping
# Doit répondre : PONG
```

---

## 6 — Installation de Node.js

### Installer Node.js 20.x LTS via NodeSource

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Vérifier l'installation

```bash
node --version   # v20.x.x
npm --version    # 10.x.x
```

### Installer PM2 globalement

```bash
sudo npm install -g pm2
```

---

## 7 — Installation de Python (optionnel)

Les scripts Python du projet sont optionnels. Si vous en avez besoin :

```bash
sudo apt install -y python3 python3-pip python3-venv
python3 --version  # Python 3.11+ sur Debian 12
```

---

## 8 — Clonage & configuration du projet

### Cloner le dépôt

```bash
# Créer le répertoire de l'application
sudo mkdir -p /opt/nxt-project
sudo chown nxtdeploy:nxtdeploy /opt/nxt-project

cd /opt/nxt-project

# Cloner le projet (adapter l'URL)
git clone https://github.com/VOTRE-UTILISATEUR/NXT-Project-uptime.git .
```

### Installer les dépendances

```bash
# Backend
cd /opt/nxt-project/backend
npm install --production

# Frontend
cd /opt/nxt-project/frontend
npm install
```

### Installer les dépendances Python (optionnel)

```bash
cd /opt/nxt-project/python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
```

### Configurer les variables d'environnement

#### Backend (.env)

```bash
cd /opt/nxt-project/backend
cp .env.example .env
nano .env
```

Contenu de production :

```ini
# Database Configuration
DB_HOST=localhost
DB_USER=nxt_user
DB_PASSWORD=VOTRE_MOT_DE_PASSE_FORT_ICI
DB_NAME=project_tracker

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=VOTRE_MOT_DE_PASSE_REDIS_FORT

# Server Configuration
HOST=127.0.0.1
PORT=5000

# CORS Configuration (URL du frontend avec Nginx)
FRONTEND_URL=https://votredomaine.com

# Node Environment
NODE_ENV=production
```

> 🔒 **Sécurité** : Le backend écoute sur `127.0.0.1` car Nginx agira comme reverse proxy. Il ne sera pas directement accessible depuis l'extérieur.

#### Frontend (.env)

```bash
cd /opt/nxt-project/frontend
cp .env.example .env
nano .env
```

Contenu de production :

```ini
VITE_API_URL=https://votredomaine.com/api
```

> **Note** : Si vous n'avez pas de domaine, utilisez `http://VOTRE_IP_PUBLIQUE/api`.

### Sécuriser les fichiers .env

```bash
# Restreindre les permissions
chmod 600 /opt/nxt-project/backend/.env
chmod 600 /opt/nxt-project/frontend/.env

# Vérifier
ls -la /opt/nxt-project/backend/.env /opt/nxt-project/frontend/.env
# Devrait afficher : -rw-------
```

---

## 9 — Configuration de la base de données

### Importer le schéma

```bash
# Avec l'utilisateur dédié
mysql -u nxt_user -p project_tracker < /opt/nxt-project/db/init.sql
```

### Importer les données d'exemple (optionnel)

```bash
mysql -u nxt_user -p project_tracker < /opt/nxt-project/db/sample_data.sql
```

### Vérifier

```bash
mysql -u nxt_user -p -e "USE project_tracker; SHOW TABLES; SELECT COUNT(*) FROM projects;"
```

---

## 10 — Construction & démarrage avec PM2

### Construire le frontend

```bash
cd /opt/nxt-project/frontend
npm run build
```

### Vérifier que le build a réussi

```bash
ls -la /opt/nxt-project/frontend/dist/
# Devrait afficher les fichiers compilés (index.html, assets/, etc.)
```

### Configurer PM2 pour la production

Le fichier `ecosystem.config.js` existe déjà. Modifions-le pour la production :

```bash
cd /opt/nxt-project
nano ecosystem.config.js
```

Remplacer par :

```javascript
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
        PORT: 5000,
        HOST: '127.0.0.1'
      },
      // Logs
      error_file: '/var/log/nxt/backend-error.log',
      out_file: '/var/log/nxt/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Redémarrages
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 5000
    },
    {
      name: 'nxt-frontend',
      script: 'npx',
      args: 'serve -s -l 127.0.0.1:3000 dist',
      cwd: './frontend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production'
      },
      // Logs
      error_file: '/var/log/nxt/frontend-error.log',
      out_file: '/var/log/nxt/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
```

### Créer le répertoire de logs

```bash
sudo mkdir -p /var/log/nxt
sudo chown nxtdeploy:nxtdeploy /var/log/nxt
```

### Démarrer les applications

```bash
cd /opt/nxt-project

# Démarrer en mode production
pm2 start ecosystem.config.js --env production
```

### Vérifier le statut

```bash
pm2 list
pm2 logs --lines 20
```

Les deux processus doivent être en statut **online**.

### Configurer le démarrage automatique

```bash
# Générer le script de démarrage
pm2 startup systemd -u nxtdeploy --hp /home/nxtdeploy

# Exécuter la commande affichée par pm2 startup (elle contient sudo env PATH=...)

# Sauvegarder la liste des processus
pm2 save
```

> 📌 Après un redémarrage du VPS, PM2 relancera automatiquement vos applications.

---

## 11 — Configuration de Nginx (reverse proxy)

### Installer Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

### Créer la configuration du site

```bash
sudo nano /etc/nginx/sites-available/nxt-project
```

**Sans SSL (configuration initiale)** :

```nginx
# NXT Project Tracker - Reverse Proxy
server {
    listen 80;
    server_name votredomaine.com www.votredomaine.com;

    # Sécurité headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self';" always;

    # Frontend (port 3000)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API (port 5000)
    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Rate limiting spécifique pour l'API
        limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
        limit_req zone=api burst=20 nodelay;
    }

    # Bloquer l'accès direct aux fichiers sensibles
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

    # Logs d'accès
    access_log /var/log/nginx/nxt-project-access.log;
    error_log /var/log/nginx/nxt-project-error.log;
}
```

> **Sans domaine** : Remplacer `server_name votredomaine.com www.votredomaine.com;` par `server_name VOTRE_IP_PUBLIQUE;`

### Activer le site

```bash
sudo ln -s /etc/nginx/sites-available/nxt-project /etc/nginx/sites-enabled/

# Supprimer la configuration par défaut
sudo rm /etc/nginx/sites-enabled/default
```

### Tester et appliquer

```bash
sudo nginx -t
# Must show: syntax is ok / test is successful

sudo systemctl reload nginx
```

---

## 12 — SSL avec Let's Encrypt

> 📌 **Un domaine est requis** pour obtenir un certificat SSL.

### Installer Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Obtenir le certificat

```bash
sudo certbot --nginx -d votredomaine.com -d www.votredomaine.com
```

Options recommandées :
- `Redirect HTTP to HTTPS?` → **Y** (redirection automatique)

### Vérifier le renouvellement automatique

```bash
sudo certbot renew --dry-run
```

Certbot installe automatiquement un timer systemd pour le renouvellement :

```bash
sudo systemctl status certbot.timer
```

### La configuration Nginx après SSL

Certbot modifie automatiquement votre config. Le résultat ressemble à :

```nginx
server {
    listen 80;
    server_name votredomaine.com www.votredomaine.com;
    # Redirection HTTP → HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name votredomaine.com www.votredomaine.com;

    ssl_certificate /etc/letsencrypt/live/votredomaine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/votredomaine.com/privkey.pem;

    # ... reste de la configuration (identique à l'étape 11)
}
```

### Mettre à jour le frontend pour HTTPS

```bash
cd /opt/nxt-project/frontend
nano .env
```

```ini
VITE_API_URL=https://votredomaine.com/api
```

Reconstruire le frontend :

```bash
cd /opt/nxt-project/frontend
npm run build
pm2 restart nxt-frontend
```

Mettre à jour le backend :

```bash
cd /opt/nxt-project/backend
nano .env
```

```ini
FRONTEND_URL=https://votredomaine.com
```

```bash
pm2 restart nxt-backend
```

---

## 13 — Configuration du pare-feu (UFW)

### Règles de base

```bash
# Politique par défaut : bloquer tout
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Autoriser SSH (adapter le port si changé)
sudo ufw allow 2222/tcp comment 'SSH custom port'

# Autoriser HTTP et HTTPS
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'

# Activer le pare-feu
sudo ufw enable
```

### Vérifier

```bash
sudo ufw status verbose
```

Résultat attendu :

```
Status: active
To                         Action      From
--                         ------      ----
2222/tcp                   ALLOW IN    Anywhere                   # SSH custom port
80/tcp                     ALLOW IN    Anywhere                   # HTTP
443/tcp                    ALLOW IN    Anywhere                   # HTTPS
```

> ⚠️ **Les ports 3000, 5000, 3306 et 6379 ne doivent PAS être ouverts.** Ils sont accessibles uniquement en local via Nginx.

---

## 14 — Vérifications & tests

### Tester le backend

```bash
# Health check
curl http://127.0.0.1:5000/api/health
# Doit retourner : {"status":"OK",...}

# Liste des projets
curl http://127.0.0.1:5000/api/projects
```

### Tester via Nginx

```bash
# Depuis le VPS
curl http://127.0.0.1/api/health

# Depuis l'extérieur (ssi port 80 ouvert)
curl http://votredomaine.com/api/health
```

### Tester le frontend

```bash
curl -I http://127.0.0.1:3000
# Doit retourner 200 OK
```

### Vérifier SSL

```bash
curl -I https://votredomaine.com
# Doit retourner 200 OK avec TLS
```

### Vérifier la redirection HTTP → HTTPS

```bash
curl -I http://votredomaine.com
# Doit retourner 301/302 vers https://
```

### Vérifier tous les services

```bash
echo "=== Services Status ==="
sudo systemctl is-active nginx
sudo systemctl is-active mariadb
sudo systemctl is-active redis-server
pm2 list
```

---

## 15 — Sauvegardes automatiques

### Script de sauvegarde

```bash
sudo mkdir -p /opt/backups
sudo chown nxtdeploy:nxtdeploy /opt/backups

nano /opt/nxt-project/backup.sh
```

```bash
#!/bin/bash
# Sauvegarde NXT Project Tracker
set -e

BACKUP_DIR="/opt/backups"
DATE=$(date +%Y-%m-%d_%H%M%S)
RETENTION_DAYS=7

# Créer le répertoire
mkdir -p "$BACKUP_DIR"

# 1. Sauvegarder MySQL
echo "[Backup] Export de la base de données..."
mysqldump -u nxt_user -p'VOTRE_MOT_DE_PASSE_BDD' project_tracker > "$BACKUP_DIR/db_$DATE.sql"

# 2. Sauvegarder les fichiers .env
echo "[Backup] Sauvegarde des configurations..."
cp /opt/nxt-project/backend/.env "$BACKUP_DIR/backend_env_$DATE"
cp /opt/nxt-project/frontend/.env "$BACKUP_DIR/frontend_env_$DATE"

# 3. Compresser
echo "[Backup] Compression..."
tar -czf "$BACKUP_DIR/nxt_backup_$DATE.tar.gz" \
  "$BACKUP_DIR/db_$DATE.sql" \
  "$BACKUP_DIR/backend_env_$DATE" \
  "$BACKUP_DIR/frontend_env_$DATE"

# 4. Nettoyer les fichiers temporaires
rm "$BACKUP_DIR/db_$DATE.sql" "$BACKUP_DIR/backend_env_$DATE" "$BACKUP_DIR/frontend_env_$DATE"

# 5. Supprimer les sauvegardes anciennes
find "$BACKUP_DIR" -name "nxt_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "[Backup] Sauvegarde terminée : nxt_backup_$DATE.tar.gz"
```

```bash
chmod +x /opt/nxt-project/backup.sh
```

### Automatiser avec cron

```bash
crontab -e
```

Ajouter (sauvegarde quotidienne à 3h du matin) :

```cron
0 3 * * * /opt/nxt-project/backup.sh >> /var/log/nxt/backup.log 2>&1
```

---

## 16 — Maintenance & surveillance

### Commandes PM2 utiles

```bash
# Voir les processus
pm2 list

# Logs en temps réel
pm2 logs

# Logs d'un processus spécifique
pm2 logs nxt-backend
pm2 logs nxt-frontend

# Redémarrer
pm2 restart nxt-backend
pm2 restart nxt-frontend

# Statut détaillé
pm2 describe nxt-backend

# Monitoring interactif
pm2 monit

# Réinitialiser les compteurs
pm2 reset
```

### Surveillance système

```bash
# Charge système
htop

# Espace disque
df -h

# Mémoire
free -m

# Ports en écoute
ss -tlnp

# Connexions actives
ss -tnp
```

### Mise à jour de l'application

```bash
cd /opt/nxt-project

# 1. Récupérer les dernières modifications
git pull origin main

# 2. Mettre à jour les dépendances backend
cd backend
npm install --production

# 3. Mettre à jour les dépendances et reconstruire le frontend
cd ../frontend
npm install
npm run build

# 4. Redémarrer les services
cd /opt/nxt-project
pm2 restart nxt-backend
pm2 restart nxt-frontend
```

### Audit de sécurité npm

```bash
cd /opt/nxt-project/backend && npm audit --production
cd /opt/nxt-project/frontend && npm audit --production
```

### Rotation des logs PM2

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

## 17 — Dépannage

### Le backend ne démarre pas

```bash
# Vérifier les logs
pm2 logs nxt-backend --lines 50

# Vérifier la connexion MySQL
mysql -u nxt_user -p -e "SELECT 1;"

# Vérifier la connexion Redis
redis-cli -a VOTRE_MOT_DE_PASSE_REDIS ping

# Vérifier le fichier .env
cat /opt/nxt-project/backend/.env
```

### Erreur « ECONNREFUSED » MySQL

```bash
# Vérifier que MariaDB tourne
sudo systemctl status mariadb

# Vérifier le socket
ls -la /run/mysqld/mysqld.sock

# Tester la connexion
mysql -u nxt_user -p -h 127.0.0.1 project_tracker
```

### Erreur Redis « NOAUTH »

```bash
# Vérifier le mot de passe dans .env
grep REDIS /opt/nxt-project/backend/.env

# Tester manuellement
redis-cli -a VOTRE_MOT_DE_PASSE_REDIS ping

# Vérifier la config Redis
grep requirepass /etc/redis/redis.conf
```

### Erreur 502 Bad Gateway (Nginx)

```bash
# Vérifier que PM2 tourne
pm2 list

# Vérifier les logs Nginx
sudo tail -20 /var/log/nginx/nxt-project-error.log

# Vérifier que les ports sont accessibles localement
curl http://127.0.0.1:5000/api/health
curl http://127.0.0.1:3000

# Vérifier la config Nginx
sudo nginx -t
```

### Le frontend affiche une page blanche

```bash
# Vérifier que le build existe
ls -la /opt/nxt-project/frontend/dist/

# Vérifier VITE_API_URL dans le frontend .env
cat /opt/nxt-project/frontend/.env

# Reconstruire le frontend
cd /opt/nxt-project/frontend
npm run build
pm2 restart nxt-frontend
```

### Problèmes de permissions

```bash
# Vérifier les propriétaires
ls -la /opt/nxt-project/

# Corriger si nécessaire
sudo chown -R nxtdeploy:nxtdeploy /opt/nxt-project/
chmod 600 /opt/nxt-project/backend/.env
chmod 600 /opt/nxt-project/frontend/.env
```

### Redis ne démarre pas

```bash
# Vérifier la configuration
sudo redis-server --test-memory 100
sudo redis-server /etc/redis/redis.conf --test-config

# Vérifier les logs
sudo journalctl -u redis-server --since "1 hour ago"
```

---

## 📐 Architecture de déploiement

```
                    Internet
                       │
                   [Firewall UFW]
                    │         │
                   :80       :443
                    │         │
                  ┌──────────────┐
                  │    Nginx     │  ← Reverse Proxy + SSL termination
                  │  (Debian 12) │
                  └──┬────────┬─┘
                     │        │
              /      │        │      /api
               ┌─────┴────┐  ┌┴──────────┐
               │ Frontend │  │  Backend   │
               │  :3000   │  │  :5000     │
               │  (serve) │  │  (Express) │
               └──────────┘  └──┬──────┬─┘
                                 │      │
                    ┌────────────┘      └───────────┐
                    │                               │
              ┌─────┴──────┐                  ┌──────┴──────┐
              │  MariaDB   │                  │   Redis     │
              │  :3306     │                  │   :6379     │
              └────────────┘                  └─────────────┘
```

---

## ✅ Checklist de déploiement

- [ ] VPS Debian 12 accessible via SSH
- [ ] Utilisateur non-root créé avec accès sudo
- [ ] SSH sécurisé (clé uniquement, port modifié, root désactivé)
- [ ] Système mis à jour (`apt upgrade`)
- [ ] MariaDB installé et sécurisé
- [ ] Base `project_tracker` créée avec utilisateur dédié
- [ ] Schéma importé (`db/init.sql`)
- [ ] Redis installé et configuré (mot de passe, bind localhost)
- [ ] Node.js 20.x LTS installé
- [ ] PM2 installé globalement
- [ ] Projet cloné dans `/opt/nxt-project`
- [ ] Dépendances installées (`npm install --production`)
- [ ] Fichiers `.env` configurés (backend + frontend)
- [ ] Permissions `.env` à 600
- [ ] Frontend construit (`npm run build`)
- [ ] Applications démarrées via PM2 (`--env production`)
- [ ] PM2 startup configuré pour le reboot
- [ ] Nginx configuré comme reverse proxy
- [ ] Certificat SSL Let's Encrypt installé (si domaine)
- [ ] Pare-feu UFW configuré (SSH + HTTP + HTTPS uniquement)
- [ ] Sauvegardes automatiques configurées (cron)
- [ ] Health check OK : `curl https://votredomaine.com/api/health`

---

## 🔗 Ports & services récapitulatif

| Service | Port | Accès | Bind |
|---------|------|-------|------|
| Nginx (HTTP) | 80 | Public | `0.0.0.0` |
| Nginx (HTTPS) | 443 | Public | `0.0.0.0` |
| Frontend (serve) | 3000 | Local uniquement | `127.0.0.1` |
| Backend (Express) | 5000 | Local uniquement | `127.0.0.1` |
| MariaDB | 3306 | Local uniquement | `127.0.0.1` |
| Redis | 6379 | Local uniquement | `127.0.0.1` |
| SSH | 2222 | Public | `0.0.0.0` |

---

> 📝 **Dernière mise à jour** : Juin 2026
> 📦 **Version projet** : 1.0.0
> 🖥️ **Testé sur** : Debian 12 Bookworm / VPS 1 Go RAM
