# Backend Deployment — Oracle Cloud Always Free VM

## Why Oracle Cloud Instead of Render

The backend was originally considered for Render.com. However, Render's free tier **force-redirects all HTTP traffic to HTTPS** with a `301 Moved Permanently` response:

```bash
# Render rejects plain HTTP:
curl http://smart-vehicle-sos.onrender.com/api/trip/active
# → <a href="https://...">Moved Permanently</a>
```

The **SIM808 GSM hardware module** communicates using plain HTTP (`AT+HTTPPARA` commands). It cannot reliably follow 301 redirects. This makes Render incompatible with the hardware.

**Oracle Cloud Always Free** solves this:
- Serves plain HTTP on any port with no redirects
- Never sleeps (unlike Render's free tier which spins down after 15 min)
- Truly free forever — no trial period
- Full Linux VM — runs Node.js + Express + Socket.IO unchanged

---

## Architecture

```
SIM808 (Arduino/GSM)
     │
     │  Plain HTTP POST
     │  http://141.148.66.227:4000
     ▼
┌──────────────────────────────────────────┐
│  Oracle Cloud VM (Always Free)           │
│  Ubuntu 22.04 — VM.Standard.E2.1.Micro  │
│  Node.js + Express + Socket.IO           │
│  Managed by PM2                          │
└────────────┬─────────────────────────────┘
             │  SQL (pg / DATABASE_URL)
             ▼
┌─────────────────┐
│  Supabase       │  PostgreSQL (free tier)
└─────────────────┘
             ▲
             │  WebSocket (Socket.IO) + REST
┌────────────┴──────────────────────────┐
│  Browser Clients (Vercel)             │
│  frontend/dashboard (Next.js)         │
│  frontend/passenger (Next.js)         │
└───────────────────────────────────────┘
```

---

## Oracle Cloud VM Specs

| Field | Value |
|---|---|
| Shape | VM.Standard.E2.1.Micro (Always Free) |
| OS | Ubuntu 22.04 LTS |
| RAM | 1 GB |
| CPU | 1 OCPU (AMD) |
| Public IP | 141.148.66.227 |
| Username | `ubuntu` |

> **Note on A1.Flex**: The preferred shape is `VM.Standard.A1.Flex` (ARM, 4 OCPUs, 24 GB RAM, also free) but it was unavailable due to high demand. `E2.1.Micro` is sufficient for this project.

---

## Part 1 — Oracle Cloud Console Setup

### 1.1 VM Creation Settings

| Section | Field | Value |
|---|---|---|
| **Name** | Instance name | `smart-vehicle-sos-backend` |
| **Image** | OS | Ubuntu 22.04 |
| **Shape** | Shape | VM.Standard.E2.1.Micro |
| **Networking** | Primary network | Create new virtual cloud network |
| **Networking** | Subnet | Create new public subnet |
| **Networking** | Public IPv4 | Toggle ON (auto-assign) |
| **SSH keys** | Method | Generate a key pair for me |
| **SSH keys** | Action | Download private key (save as `oracle-vm.key`) |
| **Security** | Shielded / Confidential | Leave both OFF |

### 1.2 Assign Public IP (if not assigned during creation)

If the VM was created without a public IP:

1. Oracle Console → **Compute → Instances** → click your instance
2. Scroll to **Resources** → **Attached VNICs** → click the VNIC
3. Scroll to **Resources** → **IPv4 Addresses**
4. Click **⋮** next to the private IP → **Edit**
5. Set **Public IP type** to `Ephemeral public IP` → **Update**

### 1.3 Open Port 4000 in Oracle Security List

Oracle Cloud has a cloud-level firewall (Security List) separate from the OS firewall.

1. **Networking → Virtual Cloud Networks** → click your VCN
2. **Security Lists → Default Security List**
3. **Add Ingress Rules**:

| Field | Value |
|---|---|
| Source CIDR | `0.0.0.0/0` (allow from anywhere) |
| IP Protocol | TCP |
| Destination Port Range | `4000` |

4. Click **Add Ingress Rules**

---

## Part 2 — First SSH Connection

### 2.1 Fix private key permissions

SSH requires the private key file to be readable only by you. If permissions are too open, SSH will refuse to use it.

```bash
chmod 400 ~/Downloads/oracle-vm.key
# chmod 400 = owner can read only, no one else can do anything
```

### 2.2 SSH into the VM

```bash
ssh -i ~/Downloads/oracle-vm.key ubuntu@141.148.66.227
# -i = identity file (your private key)
# ubuntu = default username for Oracle Cloud Ubuntu images
# 141.148.66.227 = your VM's public IP
```

Type `yes` when prompted to add the host fingerprint. You are now inside the VM.

---

## Part 3 — Server Setup (inside the VM)

### 3.1 Update the system

```bash
sudo apt update && sudo apt upgrade -y
# apt update  = fetch latest package list
# apt upgrade = install available upgrades
# -y          = auto-confirm (don't prompt)
```

### 3.2 Install Node.js 20 (LTS)

Ubuntu's default `apt` repository has an outdated version of Node.js. We use NodeSource to get Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
# Downloads and runs the NodeSource setup script
# This adds the NodeSource repository to apt

sudo apt install -y nodejs git
# Installs Node.js 20, npm (included), and git

node --version   # Verify — should show v20.x.x
npm --version    # Verify npm is installed
```

### 3.3 Install PM2 (process manager)

PM2 keeps your Node.js app running after you close the SSH session and restarts it automatically if it crashes or the server reboots.

```bash
sudo npm install -g pm2
# -g = install globally (available system-wide as a command)
```

### 3.4 Clone the project

```bash
git clone https://github.com/<your-username>/smart-vehicle-sos.git
# Downloads your entire repo to ~/smart-vehicle-sos/

cd smart-vehicle-sos/software/backend
# Navigate to the backend folder
```

> **If your repo is private**, use a GitHub Personal Access Token:
> ```bash
> git clone https://oauth2:<YOUR_TOKEN>@github.com/<your-username>/smart-vehicle-sos.git
> ```

### 3.5 Create the `.env` file

The `.env` file holds sensitive config values that must NOT be committed to Git.

```bash
nano .env
# nano is a simple terminal text editor
```

Paste the following (replace values with your own):

```env
DATABASE_URL="postgresql://postgres.rhxrrqoxofwrwbuxwkgn:<YOUR_SUPABASE_PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
CORS_ORIGIN=https://your-dashboard.vercel.app,https://your-passenger.vercel.app
PORT=4000
```

**Save and exit nano:** `Ctrl+O` → Enter → `Ctrl+X`

**What each variable does:**
- `DATABASE_URL` — Supabase PostgreSQL connection string (session-mode pooler, port 5432)
- `CORS_ORIGIN` — comma-separated list of allowed browser origins for CORS
- `PORT` — the port Express listens on inside the VM

### 3.6 Install Node.js dependencies

```bash
npm install
# Reads package.json and installs all listed dependencies into node_modules/
```

### 3.7 Run database migrations

```bash
npm run db:migrate
# Runs scripts/migrate.js — creates all tables in Supabase
# Safe to run multiple times (uses CREATE TABLE IF NOT EXISTS)
```

### 3.8 Start the backend with PM2

```bash
pm2 start src/server.js --name backend
# Starts server.js as a background process named "backend"
# Keeps running after the SSH session is closed

pm2 save
# Saves the current PM2 process list to disk
# PM2 will restore this list after a reboot

pm2 startup
# Generates a systemd command to auto-start PM2 on boot
# Copy-paste and run the exact command it outputs
```

**Useful PM2 commands:**

```bash
pm2 status           # check if backend is running
pm2 logs backend     # view live logs
pm2 restart backend  # restart after .env or code changes
pm2 stop backend     # stop the server
```

### 3.9 Open port 4000 in Ubuntu's OS firewall

Oracle Cloud has TWO layers of firewall — the cloud Security List (Part 1) and the OS-level `iptables` firewall inside Ubuntu. Both must allow port 4000.

```bash
sudo iptables -I INPUT -p tcp --dport 4000 -j ACCEPT
# -I INPUT   = insert at the top of the INPUT chain
# -p tcp     = TCP protocol
# --dport 4000 = destination port
# -j ACCEPT  = allow the traffic

sudo netfilter-persistent save
# Saves rules so they survive a reboot
# If not installed: sudo apt install -y iptables-persistent
```

---

## Part 4 — Verify Everything Works

From your **local terminal** (not the VM):

```bash
curl http://141.148.66.227:4000/health
```

Expected response:

```json
{"status":"ok","service":"smart-vehicle-sos-backend","database":"connected"}
```

---

## Part 5 — Update Frontend (Vercel)

In Vercel → each project → **Settings → Environment Variables**:

| Project | Variable | Value |
|---|---|---|
| `frontend/dashboard` | `NEXT_PUBLIC_API_URL` | `http://141.148.66.227:4000` |
| `frontend/passenger` | `NEXT_PUBLIC_API_URL` | `http://141.148.66.227:4000` |

After saving, **redeploy both projects** on Vercel.

---

## Part 6 — Update Arduino Code

In `hardware/arduino/smart_vehicle_sos/smart_vehicle_sos.ino`, update the backend base URL to:

```
http://141.148.66.227:4000
```

---

## Final Hosting Summary

| Component | Platform | URL |
|---|---|---|
| `frontend/passenger` | Vercel | `https://your-passenger.vercel.app` |
| `frontend/dashboard` | Vercel | `https://your-dashboard.vercel.app` |
| **Backend** | **Oracle Cloud VM** | `http://141.148.66.227:4000` |
| Database | Supabase | PostgreSQL (session-mode pooler) |
| SIM808 hardware | → Oracle VM | `http://141.148.66.227:4000/api/*` |

**Total cost: $0.00** ✅
