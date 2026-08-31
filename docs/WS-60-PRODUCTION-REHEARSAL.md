# WS-60 — PRODUCTION REHEARSAL & ON-SITE ACCEPTANCE CHECKLIST

## STATUS: READY FOR ON-SITE EXECUTION

## BASE HEAD: `3d4e285`

## PURPOSE

This checklist verifies that BAMSO can be deployed and operated on a real Windows PC in a LAN environment. Each item must be checked ON-SITE with real hardware and network.

## VERIFICATION LEVELS

- **CODE-VERIFIED**: Verified from source code, scripts, or unit tests
- **LOCAL-VERIFIED**: Verified on this dev machine (not production)
- **ON-SITE REQUIRED**: Must be verified on the actual production machine

---

## PART A: INFRASTRUCTURE (ON-SITE REQUIRED)

### A1. Windows PC

- [ ] Windows 10/11 PC available
- [ ] PC has sufficient disk space (>= 10 GB free)
- [ ] PC has sufficient RAM (>= 8 GB)
- [ ] PC is connected to LAN via Ethernet (not WiFi)

### A2. Node.js

- [ ] Node.js 22+ installed (`node --version`)
- [ ] Node.js added to PATH
- [ ] npm available (`npm --version`)

### A3. Python

- [ ] Python 3.x installed (`python --version`)
- [ ] Python added to PATH
- [ ] sqlite3 module available (`python -c "import sqlite3; print(sqlite3.sqlite_version)"`)

### A4. Static IP

- [ ] Static IP assigned to PC (e.g., 192.168.1.100)
- [ ] Subnet mask correct (e.g., 255.255.255.0)
- [ ] Default gateway configured
- [ ] DNS configured
- [ ] IP not conflicting with other devices

### A5. Network Connectivity

- [ ] PC can ping gateway
- [ ] PC can ping other LAN devices
- [ ] Other LAN devices can ping PC
- [ ] No firewall blocking LAN traffic (except BAMSO-specific rules)

---

## PART B: BAMSO DEPLOYMENT (ON-SITE REQUIRED)

### B1. Code Deployment

- [ ] Repository cloned to production machine
- [ ] Branch: `main` at commit `3d4e285`
- [ ] `npm install` completed successfully
- [ ] `npx prisma generate` completed
- [ ] `npx prisma db push` completed (or database exists)

### B2. Environment Configuration

- [ ] `.env` file created from `.env.example`
- [ ] `NODE_ENV=production` set
- [ ] `JWT_SECRET` set to unique value (>= 32 chars, NOT dev value)
- [ ] `DATABASE_URL` correct
- [ ] `RATE_LIMIT_DISABLED` removed or set to `false`
- [ ] `DEMO_MODE_ENABLED` removed or set to `false`
- [ ] `.env` file permissions: only BAMSO account can read

### B3. Seed / Default Passwords

- [ ] Seed run: `npx prisma db seed`
- [ ] Default passwords changed via Admin panel:
  - [ ] admin password changed
  - [ ] canbo1 password changed
  - [ ] staff2 password changed
  - [ ] kiosk1 password changed
  - [ ] display1 password changed

### B4. HTTPS Certificate

- [ ] Certificate generated: `npm run cert:generate`
- [ ] Certificate includes server IP as SAN
- [ ] Certificate files in `certs/` directory
- [ ] `certs/` directory permissions: restricted
- [ ] Certificate password set via `HTTPS_PFX_PASSWORD`

### B5. Database

- [ ] `prisma/dev.db` exists
- [ ] Database has correct schema
- [ ] Database has seed data
- [ ] `prisma/dev.db` permissions: BAMSO account only

---

## PART C: PROCESS MANAGEMENT (ON-SITE REQUIRED)

### C1. Task Scheduler

- [ ] Task Scheduler installer run: `npm run install:service`
- [ ] Task "BAMSO Production Server" registered
- [ ] Task triggers at system boot
- [ ] Task triggers daily at 06:00
- [ ] Task restarts on failure (3 attempts)

### C2. Backup Task

- [ ] Backup task installer run: `npm run backup:install-task`
- [ ] Task "BAMSO Daily Backup" registered
- [ ] Task triggers daily at 02:00
- [ ] First backup created successfully
- [ ] Backup files in `backups/` directory

### C3. Firewall

- [ ] Firewall script run: `scripts/setup-firewall.ps1`
- [ ] TCP 3443 allowed from LAN subnet
- [ ] TCP 3000 allowed from LAN subnet
- [ ] TCP 3443 blocked from WAN
- [ ] TCP 3000 blocked from WAN

---

## PART D: APPLICATION VERIFICATION (ON-SITE REQUIRED)

### D1. Server Startup

- [ ] Server starts: `npm run start:production`
- [ ] No startup errors
- [ ] HTTPS listening on port 3443
- [ ] HTTP redirect on port 3000
- [ ] `logs/app.log` created

### D2. Health Check

- [ ] `curl https://localhost:3443/api/health` returns 200
- [ ] Response: `{ "ok": true, "db": "connected" }`
- [ ] `npm run health` passes

### D3. Login

- [ ] Admin login works (https://<ip>:3443)
- [ ] Staff login works
- [ ] Kiosk login works
- [ ] Display login works
- [ ] Invalid credentials rejected

### D4. Queue Operations

- [ ] Create service (Admin)
- [ ] Create ticket (Kiosk/Staff)
- [ ] Call next ticket (Staff)
- [ ] Complete ticket (Staff)
- [ ] Skip ticket (Staff)
- [ ] Recall ticket (Staff)

### D5. LAN Access

- [ ] Kiosk tablet can access https://<ip>:3443
- [ ] Staff PC can access https://<ip>:3443
- [ ] Display screen can access https://<ip>:3443
- [ ] All clients trust the self-signed certificate

### D6. Camera QR (CCCD)

- [ ] Camera opens on kiosk tablet
- [ ] QR code scans successfully
- [ ] Customer name extracted from CCCD QR
- [ ] Ticket created with customer name

### D7. Staff Calling

- [ ] Staff sees ticket list
- [ ] Staff can call next ticket
- [ ] TTS announcement plays
- [ ] Display updates via SSE

### D8. Display

- [ ] Display shows current ticket
- [ ] Display updates in real-time (SSE)
- [ ] Display shows called ticket number

### D9. TTS

- [ ] TTS works with Internet (Edge/Google)
- [ ] TTS works without Internet (Web Speech fallback)
- [ ] TTS voice is appropriate
- [ ] TTS speed is appropriate

---

## PART E: OPERATIONS (ON-SITE REQUIRED)

### E1. Restart Recovery

- [ ] Server restarts cleanly
- [ ] Database persists after restart
- [ ] Clients reconnect after restart
- [ ] No data loss

### E2. Reboot Recovery

- [ ] PC reboots cleanly
- [ ] Task Scheduler starts BAMSO automatically
- [ ] BAMSO is accessible after reboot
- [ ] Backup task runs after reboot

### E3. Logging

- [ ] `logs/app.log` contains startup messages
- [ ] `logs/app.log` contains timestamps
- [ ] `logs/app.log` contains log levels
- [ ] No secrets in logs
- [ ] No raw CCCD data in logs

### E4. Backup

- [ ] `npm run backup` creates backup
- [ ] Backup file is non-zero size
- [ ] `npm run backup:status` reports PASS
- [ ] Old backups cleaned up by retention

### E5. Monitoring

- [ ] `npm run ops:status` reports all green
- [ ] `npm run health` passes
- [ ] `npm run backup:status` passes

### E6. Security

- [ ] No secrets in `.env` committed to Git
- [ ] No certificates in Git
- [ ] No database in Git
- [ ] No backup files in Git
- [ ] No logs in Git
- [ ] Firewall blocks WAN access
- [ ] `.env` not readable by other users
- [ ] Database not readable by other users
- [ ] Certificate not readable by other users

---

## PART F: FAILURE SCENARIOS (ON-SITE REQUIRED)

### F1. Server Crash

- [ ] Kill server process manually
- [ ] Task Scheduler restarts server
- [ ] Server is accessible after restart
- [ ] No data loss

### F2. Database Locked

- [ ] Start backup while server running
- [ ] Backup completes without error
- [ ] Server continues normally

### F3. Certificate Expired

- [ ] Generate new certificate
- [ ] Replace old certificate
- [ ] Restart server
- [ ] HTTPS works with new certificate

### F4. Disk Full

- [ ] Fill disk to near capacity
- [ ] Server handles gracefully (logs error)
- [ ] Free disk space
- [ ] Server recovers

---

## CODE-VERIFIED ITEMS (from WS-55B through WS-59)

These items have been verified from source code, scripts, or unit tests:

- [x] HTTPS server implementation (`server.js`)
- [x] Certificate generation (`scripts/generate-cert.ps1`)
- [x] Production security checks (`server.js` — JWT secret, PFX password)
- [x] Cookie security (`src/lib/cookie.ts`)
- [x] Firewall script (`scripts/setup-firewall.ps1`)
- [x] Backup script (`scripts/backup-db.py`)
- [x] Restore script (`scripts/restore-db.py`)
- [x] Backup integrity verification (sqlite3.backup + PRAGMA integrity_check)
- [x] Backup retention (30 days)
- [x] Startup wrapper (`scripts/start-production.ps1`)
- [x] Task Scheduler installer (`scripts/install-bamso-task.ps1`)
- [x] Graceful shutdown (SIGTERM/SIGINT handlers)
- [x] Health endpoint (`GET /api/health`)
- [x] Logger with timestamps (`src/lib/logger.ts`)
- [x] File logging (`logs/app.log` in server.js)
- [x] Health check script (`scripts/check-health.ps1`)
- [x] Backup status script (`scripts/check-backup.ps1`)
- [x] Operational status script (`scripts/ops-status.ps1`)
- [x] Log rotation script (`scripts/rotate-logs.ps1`)
- [x] 363 tests pass
- [x] 0 typecheck errors
- [x] 0 lint warnings
- [x] Build passes

---

## ON-SITE EXECUTION LOG

| Date | Item | Result | Notes |
|---|---|---|---|
| | | | |

---

## SIGN-OFF

| Role | Name | Date | Signature |
|---|---|---|---|
| Developer (C1) | | | |
| Decision-maker (R1) | | | |
| IT Operator | | | |
