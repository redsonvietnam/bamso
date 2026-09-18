# BAMSO-PROD-SMOKE-01 — DEPLOYMENT GUIDE

## STATUS: READY FOR ON-SITE EXECUTION

## RELEASE PINNING

This guide is a procedure, not the canonical release identifier.

Before on-site deployment, verify the checked-out commit against the **explicitly approved canonical release commit** recorded by the R1 GATE. Do not hardcode a historical relay or development commit in this document.

## PURPOSE

Step-by-step guide for deploying BAMSO on the production Windows PC and verifying the core workflow.

---

## PHASE A — PRECHECK (on production PC)

### A1. Open PowerShell as Administrator

```powershell
# Check Windows version
systeminfo | findstr /B /C:"OS Name" /C:"OS Version"

# Check Node.js
node --version
# Expected: v22+ or v24+

# Check npm
npm --version

# Check Python
python --version
# or
python3 --version

# Check machine IP
ipconfig | findstr "IPv4"

# Check project path
cd D:\bamso
git log --oneline -1
```

### A2. Verify Approved Release Commit

Confirm that the current commit matches the exact commit authorized by the R1 GATE for this deployment.

```powershell
git rev-parse HEAD
```

If the commit is not the approved canonical release commit, STOP and report BLOCKER.

---

## PHASE B — DEPLOY

### B1. Install Dependencies

```powershell
cd D:\bamso
npm install
```

### B2. Generate Prisma Client

```powershell
npx prisma generate
```

### B3. Prepare Database

```powershell
npx prisma db push
npx prisma db seed
```

### B4. Prepare .env

Copy `.env.example` to `.env` and configure:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set:

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Required |
| `JWT_SECRET` | `<unique-value-32+chars>` | NOT dev value |
| `DATABASE_URL` | `file:./dev.db?socket_timeout=5&connection_limit=1` | Match `.env.example` |
| `HTTPS_PFX_PASSWORD` | `<certificate-password>` | Set after cert generation |

**DO NOT** commit `.env` or production credentials to Git.

### B5. Generate HTTPS Certificate

```powershell
npm run cert:generate
```

Follow prompts. Enter server IP as SAN (e.g., `192.168.1.100`).

### B6. Set Certificate Password

In `.env`, set:

```
HTTPS_PFX_PASSWORD=<password-you-entered-during-cert-generation>
```

---

## PHASE C — SERVER STARTUP

### C1. Start Server

```powershell
npm run start:https
```

Or use the production wrapper:

```powershell
npm run start:production
```

### C2. Verify HTTPS

Open browser on the server:

```
https://localhost:3443
```

Expected:
- Page loads (may show certificate warning for self-signed cert)
- Login page appears

### C3. Verify Health Endpoint

```powershell
npm run health
```

Expected: `PASS`

Or manually:

```powershell
curl -k https://localhost:3443/api/health
```

Expected: `{"ok":true,"db":"connected"}`

---

## PHASE D — LAN ACCESS

### D1. From Another LAN Device

Open browser on a different PC/tablet on the same network:

```
https://<server-ip>:3443
```

Example: `https://192.168.1.100:3443`

Expected:
- Page loads (may show certificate warning)
- Login page appears
- No connection failure

### D2. Trust Certificate

On each LAN device, you may need to:
1. Click "Advanced" on the certificate warning
2. Click "Proceed to <ip> (unsafe)"
3. Or install the self-signed certificate in the device's trust store

---

## PHASE E — KIOSK + CAMERA

### E1. Open Kiosk on Tablet

On the kiosk tablet, open:

```
https://<server-ip>:3443/kiosk
```

### E2. Login

Use the kiosk account provisioned for this deployment.

- Username: `<provisioned-kiosk-username>`
- Password: `<provisioned-kiosk-password>`

Do not store production credentials in this repository or in screenshots/evidence.

### E3. Open QR Scanner

- Click the QR scanner button
- Allow camera permission when prompted
- Confirm camera stream appears

### E4. Scan CCCD QR

- Hold a real/test CCCD QR code in front of the camera
- Wait for decode
- Confirm customer name is extracted and displayed

**DO NOT** record raw CCCD payload, CCCD number, DOB, gender, nationality, or issue date.

### E5. Create Ticket

- Click "Create Ticket" or similar button
- Confirm ticket number is generated
- Record ticket number

---

## PHASE F — STAFF

### F1. Open Staff Client

On a staff PC, open:

```
https://<server-ip>:3443
```

### F2. Login

Use the staff account provisioned for this deployment.

- Username: `<provisioned-staff-username>`
- Password: `<provisioned-staff-password>`

Do not store production credentials in this repository or in screenshots/evidence.

### F3. Verify Ticket Appears

- Confirm the ticket created in Phase E appears in the queue
- Confirm ticket number matches

### F4. Call Next

- Click "Call Next" button
- Confirm correct ticket number is called
- Confirm ticket state changes

### F5. Complete Ticket

- Click "Complete" or similar button
- Confirm ticket is marked as completed

---

## PHASE G — DISPLAY

### G1. Open Display

On a display screen/TV, open:

```
https://<server-ip>:3443/display
```

### G2. Verify Display Shows Current State

- Confirm display loads
- Confirm current ticket state is shown

### G3. Trigger Call Next

- Have staff click "Call Next" again
- Confirm display updates to show the called ticket
- Confirm update is real-time (within 1-2 seconds)

---

## PHASE H — TTS

### H1. Trigger Call Next

- Have staff click "Call Next"
- Listen for TTS announcement

### H2. Verify TTS

- Confirm announcement plays
- Confirm ticket number is correct
- Confirm voice is intelligible
- Record result: PASS / DEGRADED / FAIL

---

## PHASE I — RESTART

### I1. Stop Server

Press `Ctrl+C` in the server terminal, or:

```powershell
# Find and kill the node process
Get-Process node | Stop-Process
```

### I2. Restart Server

```powershell
npm run start:https
```

### I3. Verify Recovery

- Server starts successfully
- Database persists (tickets still exist)
- Clients can reconnect
- No data loss

---

## EVIDENCE CHECKLIST

After completing all phases, collect:

| Evidence | Location |
|---|---|
| Server startup log | Terminal output |
| Health check result | `npm run health` output |
| LAN access screenshot | Browser screenshot |
| Kiosk QR scan screenshot | Tablet screenshot |
| Ticket number created | Staff client screenshot |
| Staff Call Next screenshot | Staff client screenshot |
| Display update screenshot | Display screen screenshot |
| TTS audio recording | Optional |
| Restart recovery | Terminal output |

---

## FAILURE HANDLING

If something fails:

1. **DO NOT** silently patch around it
2. Record the exact symptom
3. Record the command/output
4. Record the file/script involved
5. Record the likely cause
6. Report to R1 as BLOCKER or NON-BLOCKING OBSERVATION

---

## COMMON ISSUES

### Certificate Warning

Self-signed certificates will show a warning in browsers. This is expected. Click "Advanced" → "Proceed" to continue.

### Camera Permission

Tablets/browsers may block camera access by default. Ensure:
- Camera permission is allowed for the BAMSO URL
- No other app is using the camera

### TTS No Sound

- Check volume is not muted
- Check TTS voice is installed
- Try with Internet connected first
- Fallback: Web Speech API works offline

### Database Locked

If database is locked during backup:
- Backup uses Python sqlite3 API (non-blocking)
- Server continues normally
- Wait for backup to complete if needed
