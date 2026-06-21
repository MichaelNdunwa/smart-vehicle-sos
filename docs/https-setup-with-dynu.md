# HTTPS Setup — Nginx + Let's Encrypt + Dynu

## The Problem

The Vercel frontends are served over **HTTPS**. Browsers enforce the **Mixed Content** policy — they block any HTTP request made from an HTTPS page:

```
Mixed Content: The page at 'https://smart-vehicle-sos-dashboard-view.vercel.app/'
was loaded over HTTPS, but requested an insecure resource
'http://141.148.66.227:4000/api/dashboard'. This request has been blocked.

```

The backend on the Oracle VM runs on plain HTTP port 4000. This works for the SIM808 hardware but not for browser clients on Vercel.

## The Solution

Put **Nginx** (a web server/reverse proxy) in front of the Node.js backend with a free **Let's Encrypt SSL certificate**, accessed via a free **Dynu subdomain**. This gives the backend a proper `https://` URL for Vercel, while port 4000 remains open for the SIM808.

```
Vercel dashboard/passenger (HTTPS)
     │
     │  https://smart-vehicle-sos.dynu.net
     ▼
┌─────────────────────────────────────────────┐
│  Nginx (port 443, SSL termination)          │
│  Certificate: Let's Encrypt (free)          │
│  Domain: smart-vehicle-sos.dynu.net         │
└────────────────┬────────────────────────────┘
                 │  proxy_pass to localhost:4000
                 ▼
┌─────────────────────────────────────────────┐
│  Node.js Backend (Express + Socket.IO)      │
│  Listening on port 4000                     │
└─────────────────────────────────────────────┘
                 ▲
                 │  http://141.148.66.227:4000
                 │  (plain HTTP, bypasses Nginx)
        SIM808 Hardware

```

---

## Part 1 — Free Domain via Dynu

Let's Encrypt cannot issue certificates for bare IP addresses — a domain name is required. **Dynu** provides highly reliable free subdomains.

1. Go to [dynu.com](https://www.dynu.com) and create a free account.
2. In the **Control Panel**, click on **DDNS Services** → click **+ Add**.
3. In **Option 1**, type a subdomain name (e.g. `smart-vehicle-sos`) and select `dynu.net` from the dropdown → click **Add**.
4. Clear whatever is in the **IPv4 Address** field and set it to your Oracle server's IP: `141.148.66.227` → click **Save**.

**Verify DNS from your local terminal:**

```bash
nslookup smart-vehicle-sos.dynu.net
# Should return: 141.148.66.227

```

> **Note: What if nslookup says "command not found"?**
> If your system is missing the `nslookup` tool, you can easily install the standard DNS utilities package.
> * **On Ubuntu/Debian/WSL:** Run `sudo apt update && sudo apt install dnsutils -y`
> * **Alternative without installing anything:** Just run `ping smart-vehicle-sos.dynu.net` and look at the IP address in the first line of the output.
> 
> 

---

## Part 2 — Open Ports 80 and 443 in Oracle Security List

Let's Encrypt uses port 80 to verify domain ownership. Port 443 is standard HTTPS.

1. Oracle Console → **Networking → Virtual Cloud Networks** → your VCN
2. **Security Lists → Default Security List → Add Ingress Rules**

Add two rules:

| Source CIDR | Protocol | Destination Port |
| --- | --- | --- |
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

---

## Part 3 — Install Nginx on the Oracle VM

SSH into the VM:

```bash
ssh -i ~/Downloads/oracle-vm.key ubuntu@141.148.66.227

```

Install Nginx:

```bash
sudo apt update
sudo apt install -y nginx
# nginx is a high-performance web server and reverse proxy

```

Open ports 80 and 443 in Ubuntu's OS-level firewall:

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
# These rules survive reboots

```

Verify Nginx is reachable from outside:

```bash
# From your local terminal (not the VM):
curl -v http://smart-vehicle-sos.dynu.net
# Should return the default nginx welcome page (HTTP 200)

```

---

## Part 4 — Get a Free SSL Certificate via Let's Encrypt

**Certbot** is the official Let's Encrypt client. It automatically proves domain ownership by placing a temporary file on port 80, then issues and installs the certificate.

```bash
# Install Certbot with the Nginx plugin
sudo apt install -y certbot python3-certbot-nginx

# Request a certificate for your domain
sudo certbot --nginx -d smart-vehicle-sos.dynu.net

```

Certbot will prompt for:

* Your email address (for expiry reminders)
* Agreement to the Let's Encrypt Terms of Service → type `Y`

On success you will see:

```
Successfully received certificate.
Certificate is saved at:
  /etc/letsencrypt/live/smart-vehicle-sos.dynu.net/fullchain.pem
Key is saved at:
  /etc/letsencrypt/live/smart-vehicle-sos.dynu.net/privkey.pem

```

> **Certificate renewal**: Let's Encrypt certificates expire after 90 days. Certbot automatically installs a cron job that renews them. No manual action needed.

---

## Part 5 — Configure Nginx as a Reverse Proxy

Edit the default Nginx site config:

```bash
sudo nano /etc/nginx/sites-available/default

```

Replace the entire contents with:

```nginx
# HTTPS server — used by Vercel frontends and browsers
server {
    listen 443 ssl;
    server_name smart-vehicle-sos.dynu.net;

    ssl_certificate /etc/letsencrypt/live/smart-vehicle-sos.dynu.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/smart-vehicle-sos.dynu.net/privkey.pem;

    location / {
        proxy_pass http://localhost:4000;
        # Forward requests to the Node.js backend

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        # These two headers are required for WebSocket / Socket.IO to work through the proxy

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Pass the original client IP to the backend
    }
}

# HTTP server — redirects browsers to HTTPS
# (SIM808 uses port 4000 directly and never hits this)
server {
    listen 80;
    server_name smart-vehicle-sos.dynu.net;
    return 301 https://$host$request_uri;
}

```

**Save:** `Ctrl+O` → Enter → `Ctrl+X`

Test the config and restart Nginx:

```bash
sudo nginx -t
# Output: nginx: configuration file /etc/nginx/nginx.conf syntax is ok
# Output: nginx: configuration file /etc/nginx/nginx.conf test is successful

sudo systemctl restart nginx

```

---

## Part 6 — Update Vercel Environment Variables

In Vercel → each project → **Settings → Environment Variables**, update `NEXT_PUBLIC_API_URL`:

| Project | Variable | Value |
| --- | --- | --- |
| `frontend/dashboard` | `NEXT_PUBLIC_API_URL` | `https://smart-vehicle-sos.dynu.net` |
| `frontend/passenger` | `NEXT_PUBLIC_API_URL` | `https://smart-vehicle-sos.dynu.net` |

**Redeploy both projects** on Vercel after saving.

Also update `CORS_ORIGIN` in the backend `.env` on the VM:

```bash
nano ~/smart-vehicle-sos/software/backend/.env
# Ensure CORS_ORIGIN includes both Vercel URLs
pm2 restart backend

```

---

## Part 7 — Verify

```bash
# HTTPS endpoint (for Vercel frontends)
curl https://smart-vehicle-sos.dynu.net/health
# Expected: {"status":"ok","service":"smart-vehicle-sos-backend","database":"connected"}

# HTTP endpoint (for SIM808 — direct IP, bypasses Nginx)
curl http://141.148.66.227:4000/health
# Expected: same response

```

---

## Final URL Summary

| Client | URL | Protocol |
| --- | --- | --- |
| `frontend/dashboard` (Vercel) | `https://smart-vehicle-sos.dynu.net` | HTTPS ✅ |
| `frontend/passenger` (Vercel) | `https://smart-vehicle-sos.dynu.net` | HTTPS ✅ |
| SIM808 hardware | `http://141.148.66.227:4000` | HTTP ✅ |

## Full Hosting Summary

| Component | Platform | URL |
| --- | --- | --- |
| `frontend/passenger` | Vercel | `https://your-passenger.vercel.app` |
| `frontend/dashboard` | Vercel | `https://your-dashboard.vercel.app` |
| Backend (HTTPS via Nginx) | Oracle Cloud VM | `https://smart-vehicle-sos.dynu.net` |
| Backend (HTTP direct) | Oracle Cloud VM | `http://141.148.66.227:4000` |
| Database | Supabase | PostgreSQL (session-mode pooler) |

**Total cost: $0.00** ✅