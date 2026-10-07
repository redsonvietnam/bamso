# BAMSO Deployment & UAT Runbook

> **Purpose:** reusable Windows deployment/UAT procedure for BAMSO, distilled from the verified local/LAN UAT rehearsal on 2026-10-01/02.
>
> **Canonical scope:** this runbook is the repeatable procedure. Individual rehearsal reports remain evidence records; do not use them as the procedure itself.
>
> **Primary UAT requirement:** real phone QR-camera testing requires HTTPS. Do **not** use `npm run dev` / HTTP-only dev mode as the primary QR UAT path.

---

## 1. Operating model

BAMSO should be treated as two deployment tracks:

| Track | Purpose | Typical runtime |
| --- | --- | --- |
| Local/LAN UAT | Real-device testing, QR camera, kiosk/staff/display flows | `node server.js`, HTTPS `3443`, HTTP `3001` |
| Production | Controlled deployment with real secrets, DB migrations, backup, service/task and operational acceptance | `scripts/start-production.ps1`, production-specific configuration |

**Do not use the UAT certificate or UAT launcher as evidence that production is ready.**

**Do not use `npm run start:production` as a shortcut for local QR UAT.** Production startup is intentionally fail-closed on production configuration/secrets.

---

# 2. Standard local/LAN UAT profile

Use this baseline unless the target PC has an explicitly documented port conflict:

```text
HOST=0.0.0.0
HTTP_PORT=3001
HTTPS_PORT=3443
```

The expected local UAT URL is:

```text
https://<LAN-IP>:3443/get-ticket
```

Example from the verified rehearsal:

```text
https://192.168.1.148:3443/get-ticket
```

Each PC may run its own independent BAMSO instance with its own local runtime/database. No source-code IP replacement should be required just because the PC gets a different LAN IP.

If multiple BAMSO instances run on the same PC, use distinct ports.

---

# 3. Preflight: identify the machine and repository

From the target PC:

```powershell
cd D:\Bamso
```

Verify:

- repository exists;
- `server.js` exists;
- `package.json` exists;
- `certs\` exists;
- required local database/config is present;
- no unrelated project/runtime is occupying the intended UAT ports.

Do not reset, clean, revert, or overwrite an existing dirty worktree.

---

# 4. Do not start QR UAT with `npm run dev`

`npm run dev` is useful for normal development, but it is not the correct acceptance path for phone camera/QR testing.

Reason:

```text
QR camera browser API
        ↓
requires secure context
        ↓
HTTPS UAT
        ↓
port 3443
```

The standard UAT runtime is:

```text
npm run start:https
```

with process-scoped:

```text
HOST=0.0.0.0
HTTP_PORT=3001
HTTPS_PORT=3443
```

Do not persist these values in `.env` merely to run a single UAT session.

---

# 5. Process-scoped environment

Environment variables are process-scoped.

A variable set in one PowerShell/CMD window is **not automatically available to another agent/sandbox/process context**.

This became a real UAT failure mode during the rehearsal.

For interactive PowerShell, prefer a secure input flow for the PFX password rather than putting the secret in source, `.env`, or logs.

Example:

```powershell
$p = Read-Host "HTTPS_PFX_PASSWORD" -AsSecureString
$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($p)

try {
    $env:HTTPS_PFX_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)
    $env:HOST = '0.0.0.0'
    $env:HTTP_PORT = '3001'
    $env:HTTPS_PORT = '3443'

    npm run start:https
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)
}
```

Never print the password or put it in a report.

**Important:** do not reuse `$b` after `ZeroFreeBSTR($b)` has executed.

---

# 6. Certificate decision tree

## 6.1 Existing PFX works

If the existing `certs\bamso.pfx` can be opened with its **known, trusted credential**, use it.

Do not guess the password.

---

## 6.2 `mac verify failure`

If Node reports:

```text
Error: mac verify failure
```

classify it as:

> **PKCS#12/PFX credential or integrity failure**

The error alone does not prove the PFX is corrupt.

First establish:

1. the process actually received `HTTPS_PFX_PASSWORD`;
2. the password is non-empty;
3. the credential is known to belong to the current PFX.

Do not test random/default candidates.

A key lesson from the rehearsal:

```text
HTTPS_PFX_PASSWORD unset
        ≠
PFX password proven wrong
```

and:

```text
non-empty process password
        +
mac verify failure
        → credential does not validate this PFX
          OR the PFX/container has an integrity problem
```

---

## 6.3 PFX repair procedure

For **LOCAL/UAT only**, the canonical certificate generator is:

```text
scripts\generate-uat-cert.ps1
```

Do not use the legacy `scripts\generate-cert.ps1` path for this UAT procedure, and do not use a hardcoded/default PFX password.

Repair sequence:

1. Check whether `HTTPS_PFX_PASSWORD` is present in the **same process/session** that will start UAT.
2. If the current PFX validates with its known credential, **do not regenerate it**.
3. If the credential is missing/invalid and cannot be recovered, preserve the current PFX before replacement.
4. Run `scripts\generate-uat-cert.ps1`; when `-Password` is omitted it uses `Read-Host -AsSecureString`.
5. Include the current LAN IPv4 in the certificate SAN; the generator also includes `127.0.0.1`, `localhost`, and `BAMSO-Internal`.
6. Set `HTTPS_PFX_PASSWORD` only in the current UAT process/session. Never put the secret in source, markdown, Git, or logs.
7. Start with `npm run start:https`.
8. Verify HTTPS startup, `/api/health`, `/get-ticket`, listener state, and then LAN access.
9. Only after transport/TLS is healthy proceed to phone/browser/camera acceptance.

Before replacement, the generator preserves an existing artifact as:

```text
certs\bamso.pfx.pre-uat-<timestamp>.bak
```

The original certificate is never silently overwritten. Do not guess or restore an old password merely because it appeared in historical tooling.

---

# 7. LAN certificate requirements

For phone UAT, the certificate must match the address the phone actually opens.

At minimum determine whether the certificate covers:

- `localhost`;
- the machine's LAN IP;
- any intended LAN hostname.

For IP-based access, the LAN IP should be present in the certificate SAN.

Example from the verified rehearsal:

```text
LAN IP: 192.168.1.148
SAN: 192.168.1.148
```

A certificate can be cryptographically valid and still be unsuitable for the phone if its identity does not match the LAN URL.

**Certificate trust and firewall reachability are separate acceptance gates.**

A self-signed certificate may still trigger a browser trust warning even when:

- HTTPS is listening;
- SAN is correct;
- the LAN route is open.

Do not confuse a trust warning with a firewall failure.

---

# 8. Start UAT runtime

From a clean UAT PowerShell session:

```powershell
$env:HOST='0.0.0.0'
$env:HTTP_PORT='3001'
$env:HTTPS_PORT='3443'
npm run start:https
```

Provide `HTTPS_PFX_PASSWORD` in the same process scope when required.

Expected runtime characteristics:

```text
HTTP   3001
HTTPS  3443
HOST   0.0.0.0
```

If a stale BAMSO dev runtime blocks startup:

1. identify the PID;
2. confirm it belongs to `D:\Bamso`;
3. stop only that BAMSO process;
4. retry.

Do not blindly kill unrelated Node processes.

---

# 9. Runtime verification gate

Do not declare UAT ready from startup output alone.

Verify all applicable items:

### Listener

```text
0.0.0.0:3443 LISTENING
0.0.0.0:3001 LISTENING
```

### Process

Verify PID + command correspond to:

```text
node server.js
```

from the BAMSO repository.

### Endpoint

Verify:

```text
https://localhost:3443/get-ticket
```

and confirm a meaningful BAMSO response.

### LAN identity

Determine the actual LAN IPv4 and form:

```text
https://<LAN-IP>:3443/get-ticket
```

### Build/sanity after UAT-only source changes

If source code was modified:

```text
npm run build
```

and relevant tests should be rerun.

Avoid changing source merely to work around a certificate/firewall issue.

---

# 10. Windows Firewall — standard UAT procedure

A successful local listener does **not** prove a phone on the LAN can connect.

Expected failure pattern:

```text
localhost works
LAN access fails
```

This is commonly a Windows Firewall inbound-policy issue.

## 10.1 Critical lesson: agent elevation is separate

An agent/sandbox may run as:

```text
Medium Mandatory Level
Administrator token: FALSE
```

even when the user has a separate elevated PowerShell window.

The agent does **not** inherit the user's elevated token.

Therefore:

> A user saying "PowerShell is Administrator" does not prove the agent execution context is Administrator.

---

## 10.2 Create the narrow UAT rule from elevated PowerShell

Run in an actual **Administrator PowerShell**:

```powershell
New-NetFirewallRule `
  -DisplayName "BAMSO UAT HTTPS 3443 LAN" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 3443 `
  -RemoteAddress <LAN-SUBNET> `
  -Action Allow `
  -Profile Any
```

Example:

```powershell
New-NetFirewallRule `
  -DisplayName "BAMSO UAT HTTPS 3443 LAN" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 3443 `
  -RemoteAddress 192.168.1.0/24 `
  -Action Allow `
  -Profile Any
```

Prefer the actual active LAN subnet instead of blindly assuming `192.168.1.0/24`.

Do **not**:

- disable Windows Firewall globally;
- create `Any/Any` inbound rules;
- open unrelated ports;
- change domain/group policy;
- bypass endpoint security controls.

Only port `3443` needs to be reachable by the phone for the HTTPS QR UAT path. Do not expose `3001` unless a demonstrated test requires it.

---

## 10.3 If `Access is denied`

First verify the shell itself is elevated:

```powershell
([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
```

Expected:

```text
True
```

If the actual elevated shell still cannot create the rule, investigate effective policy / GPO / endpoint security.

Do not attempt to bypass the policy.

---

# 11. Phone acceptance gate

After firewall and HTTPS are ready, use a real phone on the same LAN.

Open:

```text
https://<LAN-IP>:3443/get-ticket
```

Acceptance sequence:

```text
LAN reachable
    ↓
TLS connection
    ↓
certificate identity matches LAN IP/hostname
    ↓
browser trust handled
    ↓
HTTPS secure context
    ↓
camera permission
    ↓
QR scanner
```

Test the actual camera, not just the page.

Record separately:

| Gate | Result |
| --- | --- |
| TCP 3443 reachable from phone | PASS/FAIL |
| HTTPS handshake | PASS/FAIL |
| Certificate SAN matches LAN URL | PASS/FAIL |
| Certificate trusted/accepted | PASS/FAIL/WARNING |
| Secure context | PASS/FAIL |
| Camera permission | PASS/FAIL |
| QR decode | PASS/FAIL |
| `/get-ticket` | PASS/FAIL |

Only after these gates pass should the run be called:

```text
QR CAMERA UAT READY
```

---

# 12. Recommended independent-PC procedure

For PC A / PC B / PC C, use the same procedure.

Example:

```text
PC A: 192.168.x.148
PC B: 192.168.x.149
PC C: 192.168.x.150
```

Each PC:

```text
own BAMSO process
own local/UAT database/runtime
own certificate/SAN
own firewall rule
same application code
same UAT ports
```

No IP string should be hardcoded into application source merely because a PC changed.

If multiple BAMSO instances must coexist on one physical PC, give each instance distinct ports.

---

# 13. Production deployment gates

The UAT runbook must not be mistaken for production approval.

Before production deployment, the separate production gates must be completed:

### Secrets

- unique production `JWT_SECRET`;
- real production `HTTPS_PFX_PASSWORD`;
- no source-code secret fallback.

### Database

The production database target must be identified first.

The current migration set identified during the rehearsal was:

```text
20260923180827_adopt_actual_database_schema
20260923191500_reconcile_legacy_schema
20260925072000_remove_ticket_phone
```

These require DB/schema/data review and explicit approval before:

```text
npx prisma migrate deploy
```

Do not use:

```text
prisma db push
prisma migrate dev
```

as a production shortcut.

### Backup

Before destructive or data-changing production migration:

1. establish a real backup destination;
2. execute a backup;
3. verify backup integrity;
4. establish retention/off-machine policy.

### Service/runtime

Production service/task must be intentionally installed/started and separately verified.

### LAN/TLS

Verify from actual production client devices:

- server reachability;
- certificate identity/trust;
- `/api/health`;
- SSE behavior where applicable.

### Hardware

Real kiosk camera/QR and actual display hardware require physical acceptance.

---

# 14. Known failure modes and standard response

| Symptom | Standard interpretation | Action |
| --- | --- | --- |
| `npm run start:https` says another Next dev server is running | stale dev runtime | identify and stop only the relevant BAMSO dev PID |
| `mac verify failure` | PFX credential/integrity problem | verify process scope; never guess password |
| `HTTPS_PFX_PASSWORD` is unset | credential was not injected into this process | inject securely into the exact UAT process |
| PFX credential cannot be recovered | current PFX cannot be safely reused | preserve old PFX and generate a new UAT certificate |
| 3443 listens locally but phone cannot connect | likely inbound firewall/network path | inspect firewall/profile/policy |
| `New-NetFirewallRule` Access Denied | shell/policy elevation problem | use actual elevated PowerShell; if still denied, inspect policy |
| certificate warning on phone | trust problem, not necessarily firewall | install/trust certificate as permitted for UAT |
| page loads but camera unavailable | browser/camera acceptance issue | check secure context, permission, device and camera selection |
| LAN IP differs on another PC | normal deployment variance | do not edit source; regenerate/verify certificate SAN and firewall subnet |
| agent says Administrator but firewall access denied | agent token may still be non-admin | inspect agent execution token separately |

---

# 15. UAT acceptance report template

Use this template after every meaningful deployment rehearsal:

```text
MISSION STATUS: PASS / BLOCKED

HOST:
LAN IP:

RUNTIME:
- HOST:
- HTTP:
- HTTPS:
- PID:
- COMMAND:

CERTIFICATE:
- PFX source:
- old PFX preserved:
- new UAT certificate:
- SAN covers LAN IP:
- credential exposed: NO

FIREWALL:
- inbound 3443:
- remote subnet:
- profile:
- rule enabled:

APPLICATION:
- https://localhost:3443/get-ticket:
- https://<LAN-IP>:3443/get-ticket:

PHONE:
- LAN reachability:
- HTTPS:
- certificate trust:
- secure context:
- camera permission:
- QR decode:

QR CAMERA UAT:
READY / BLOCKED

FILES MODIFIED:

SAFETY:
- production touched: NO
- migration run: NO
- Git commit: NO
- Git push: NO
```

---

# 16. What to keep as historical evidence

Do not overwrite historical rehearsal reports just to make them look like the current state.

Keep:

```text
docs/DEPLOYMENT-UAT-RUNBOOK.md
```

as the reusable standard.

Keep dated rehearsal / readiness reports separately for evidence.

Update `HANDOFF.md` only with a concise pointer to this runbook when needed; avoid duplicating the whole procedure.

---

# 17. Golden path

For a fresh Windows PC, the default decision path is:

```text
1. Clone/restore BAMSO
        ↓
2. Verify Node + repo
        ↓
3. Determine LAN IP
        ↓
4. Verify certificate artifact
        ↓
5. Existing PFX + known credential?
       / \
     YES  NO
      |    |
      |    └─ preserve old PFX
      |       → generate UAT cert
      ↓
6. Start UAT:
   HOST=0.0.0.0
   HTTP_PORT=3001
   HTTPS_PORT=3443
        ↓
7. Verify localhost /get-ticket
        ↓
8. Verify 3443 listener
        ↓
9. Configure narrow inbound firewall rule
        ↓
10. Verify LAN URL from another device
        ↓
11. Verify phone/browser/camera acceptance
        ↓
12. Capture server-side evidence for any system error
```

---

# 18. UAT rebuild / restart standard

This section is the canonical repeatable procedure after a source or generated-build change. Do not make an acceptance decision from a stale process or stale `.next` output.

## 18.1 Runtime truth from the repository

The current runtime contract is:

| Concern | Repository source of truth |
| --- | --- |
| Production build | `npm run build` (`next build`) |
| Clean rebuild option | `npm run rebuild` (`npm run clean` then `npm run build`) |
| UAT start command | `npm run start:https` |
| UAT entrypoint | `node server.js` |
| UAT HTTPS | `HTTPS_PORT=3443` |
| UAT HTTP redirect | `HTTP_PORT=3001` |
| UAT bind | `HOST=0.0.0.0` |
| Health helper | `npm run health` → `scripts/check-health.ps1 -IgnoreCert` |
| Production wrapper | `npm run start:production` → `scripts/start-production.ps1`; do not substitute it for this UAT flow |

`server.js` prefers `certs\\bamso.pfx` (or `HTTPS_PFX_PATH`) and requires `HTTPS_PFX_PASSWORD` for that PFX. In production mode it also requires a valid `JWT_SECRET`. `DATABASE_URL` is required by the production startup contract. Never print the values of any of these variables.

## 18.2 Rebuild and restart

Run the following from a dedicated PowerShell window. Keep the window containing the successful runtime open.

```powershell
Set-Location -LiteralPath 'D:\\Bamso'
if ((Get-Location).Path -ne 'D:\\Bamso') { throw 'Wrong working directory' }

# Confirm presence and expected values without printing secrets.
$required = 'NODE_ENV','HOST','HTTP_PORT','HTTPS_PORT','DATABASE_URL','HTTPS_PFX_PASSWORD','JWT_SECRET'
foreach ($name in $required) {
    $item = Get-Item -Path "Env:$name" -ErrorAction SilentlyContinue
    if (-not $item -or [string]::IsNullOrEmpty($item.Value)) { throw "$name is missing" }
}
if ($env:NODE_ENV -ne 'production') { throw 'NODE_ENV must be production' }
if ($env:HOST -ne '0.0.0.0') { throw 'HOST must be 0.0.0.0' }
if ([int]$env:HTTP_PORT -ne 3001) { throw 'HTTP_PORT must be 3001' }
if ([int]$env:HTTPS_PORT -ne 3443) { throw 'HTTPS_PORT must be 3443' }

# Identify listeners first. Stop only a verified BAMSO process; never blanket-kill node.exe.
Get-NetTCPConnection -State Listen -LocalPort 3001,3443 -ErrorAction SilentlyContinue |
    Select-Object LocalAddress,LocalPort,OwningProcess

# If a listed PID is stale BAMSO, verify its command/path, then stop that PID only:
# Get-CimInstance Win32_Process -Filter "ProcessId = <PID>" |
#     Select-Object ProcessId,CommandLine,ExecutablePath
# Stop-Process -Id <verified-BAMSO-PID> -Force

# Use npm run rebuild only when a clean build is required; otherwise npm run build is sufficient.
npm run build

$env:NODE_ENV = 'production'
$env:HOST = '0.0.0.0'
$env:HTTP_PORT = '3001'
$env:HTTPS_PORT = '3443'
# DATABASE_URL, JWT_SECRET, and HTTPS_PFX_PASSWORD must already be present in this same process scope.
npm run start:https
```

If the build output is known to be stale or inconsistent, replace `npm run build` with `npm run rebuild`. Do not run Prisma migrations, reset the database, change schema, or change database targets as part of a routine restart.

## 18.3 Post-rebuild verification

In a second PowerShell window, verify the process and both listeners:

```powershell
Set-Location -LiteralPath 'D:\\Bamso'
Get-NetTCPConnection -State Listen -LocalPort 3001,3443 |
    Select-Object LocalAddress,LocalPort,OwningProcess
npm run health
```

The expected listeners are `0.0.0.0:3443` and `0.0.0.0:3001`. Confirm the owning PID resolves to `node server.js` started from `D:\\Bamso`. The health helper checks `https://localhost:3443/api/health`; also open `https://localhost:3443/get-ticket` in a browser or use the approved local diagnostic probe.

Determine the active LAN IPv4, then verify transport and application response from the PC using:

```powershell
ipconfig
Test-NetConnection -ComputerName <LAN-IP> -Port 3443
```

Open `https://<LAN-IP>:3443/get-ticket` from the PC. A certificate-validation bypass, if used only for diagnosis, proves transport/content and does not prove browser trust. Check the certificate SAN separately and confirm it contains the exact LAN IP used in the URL.

## 18.4 UAT acceptance checklist

Complete these gates separately. Never put secret values into this checklist:

- [ ] working directory is `D:\\Bamso`;
- [ ] `NODE_ENV=production`;
- [ ] `HOST=0.0.0.0`;
- [ ] `HTTP_PORT=3001`;
- [ ] `HTTPS_PORT=3443`;
- [ ] `DATABASE_URL` is set in the current process scope;
- [ ] `JWT_SECRET` is set in the current process scope;
- [ ] `HTTPS_PFX_PASSWORD` is set in the current process scope;
- [ ] `certs\\bamso.pfx` exists and validates with the known credential;
- [ ] if the PFX was replaced, the previous artifact was preserved as `*.pre-uat-<timestamp>.bak`;
- [ ] current LAN IPv4 is known;
- [ ] current PFX SAN includes the exact phone-facing LAN IPv4;
- [ ] source change followed by `npm run build` or `npm run rebuild`;
- [ ] old runtime stopped only after PID/command/path verification;
- [ ] new runtime PID and command verified as `node server.js` from `D:\\Bamso`;
- [ ] HTTPS `3443` listening on `0.0.0.0`;
- [ ] HTTP `3001` listening and redirecting where certificates are loaded;
- [ ] `npm run start:https` is the active UAT start command;
- [ ] `/api/health` = HTTP 200 locally;
- [ ] `/get-ticket` = HTTP 200 locally;
- [ ] LAN `https://<LAN-IP>:3443/get-ticket` is reachable from the PC;
- [ ] Windows Firewall allows only the required inbound UAT path;
- [ ] phone reaches `https://<LAN-IP>:3443/get-ticket`;
- [ ] certificate trust is handled on the phone;
- [ ] browser reports a secure context;
- [ ] camera permission is granted;
- [ ] QR scan and auto-submit succeed.

Local health passing does not prove LAN reachability, certificate trust, phone browser readiness, or camera acceptance. Browser/device evidence is a separate acceptance layer from source, test, and build evidence.

## 18.5 Phone “system error” troubleshooting

When a phone displays “lỗi hệ thống” / “system error”, do not infer the cause from that UI message alone. Capture this evidence immediately:

1. exact timestamp, including timezone;
2. URL and route;
3. action/button that was pressed;
4. HTTP status or browser network error, if visible;
5. server-side log lines around that timestamp (`logs/app.log` in production mode, plus the runtime console if applicable);
6. request ID/correlation ID, if present;
7. active process PID;
8. current runtime build command and start command;
9. LAN URL and certificate/trust state.

Do not include passwords, tokens, connection strings, or private key material in the evidence bundle. First correlate the phone timestamp with the server log and request ID, then diagnose the route/API failure. If the API succeeds but the UI still fails, inspect the phone browser/client runtime artifact separately.

## 18.6 Standard decision tree

```text
Phone cannot open site
  ├─ PC localhost health fails
  │    └─ server/env/runtime issue
  ├─ PC passes, LAN fails
  │    └─ firewall/network/bind issue
  ├─ LAN opens, phone certificate error
  │    └─ certificate/trust issue
  ├─ phone opens page, action returns "system error"
  │    └─ inspect server/API logs at exact timestamp
  └─ API succeeds, UI still fails
       └─ browser/client/runtime artifact issue
```

The UAT certificate must include the phone-facing LAN IP in its SAN. Windows Firewall may require a genuinely elevated Administrator PowerShell; an agent process can report a different, non-elevated token even when the user has an elevated terminal open. A firewall policy denial must be investigated, not bypassed by disabling the firewall globally.

---

# 19. Fast Path — Canonical UAT Restart

After any source/build change, the canonical UAT entrypoint is:

```text
cd D:\\Bamso
npm run build
scripts\\restart-uat.bat
```

The restart helper delegates to `scripts\\start-uat.ps1 -Restart`. It:

1. loads only the required runtime environment values;
2. validates DATABASE_URL, JWT_SECRET, certificate/PFX, and the current `.next/BUILD_ID`;
3. verifies the existing UAT runtime before stopping it;
4. stops only a verified BAMSO listener;
5. starts `node server.js`;
6. verifies runtime BUILD_ID matches the current build;
7. verifies a referenced CSS asset returns HTTP 200;
8. runs the local health check.

- Do **not** run migrations for a routine UAT restart.
- Do **not** use `npm run dev` for phone QR acceptance.
- If no UAT listener exists, `scripts\\stop-uat.ps1` exits successfully; it is safe to treat this as an already-stopped state.
- Do **not** blindly kill `node.exe`; the stop helper verifies BAMSO ownership first.

# 20. What `HTTPS_PFX_PASSWORD` actually is

`HTTPS_PFX_PASSWORD` is the password protecting `certs\\bamso.pfx`.

It is:

- process-scoped;
- not stored in source code or this runbook;
- required by the Node process that opens the PFX.

A PowerShell child process does not propagate its environment variables back to its parent process. Therefore:

```text
powershell -File generate-uat-cert.ps1
        ↓
child process sets/uses password
        ↓
parent PowerShell does NOT automatically receive HTTPS_PFX_PASSWORD
```

Running `powershell -File generate-uat-cert.ps1` therefore does **not** automatically set `HTTPS_PFX_PASSWORD` in the parent shell.

After generating a new PFX in a child process, the operator must enter the **same password again** in the server-starting process.

Never print, log, or commit the password.

# 21. SecureString input — empty-looking prompt is normal

The UAT certificate generator uses:

```powershell
Read-Host -AsSecureString
```

SecureString input does not necessarily echo characters.

Therefore:

- seeing a blank prompt does **not** mean input is broken;
- type the password normally and press Enter;
- an actual empty submission results in:

```text
HTTPS_PFX_PASSWORD is required
```

Do not print or debug the password. Do not add temporary password logging to the generator or server.

# 22. PFX recovery lessons

The observed recovery sequence was:

```text
mac verify failure
        ↓
do not guess password
        ↓
validate current PFX credential
        ↓
if credential unavailable:
    backup PFX
    generate UAT PFX
    include current LAN IP in SAN
    set new password
        ↓
start runtime with SAME password
```

The exact distinction is:

- `mac verify failure` = PFX credential/integrity mismatch at the Node boundary;
- `HTTPS_PFX_PASSWORD is required` = the runtime process received no usable password.

`mac verify failure` alone does **not** prove that the PFX is corrupted. First distinguish missing process credentials from a credential that does not validate the current PFX; only then consider replacement/recovery.

# 23. Stale runtime / fresh-start gate

After a source or generated-build change, use this sequence:

```text
source changed
    ↓
npm run build
    ↓
scripts\\restart-uat.bat
    ↓
preflight current runtime
    ↓
stop only verified BAMSO PID
    ↓
start node server.js
    ↓
compare runtime BUILD_ID with .next/BUILD_ID
    ↓
verify CSS asset HTTP 200
    ↓
/api/health
    ↓
/get-ticket
    ↓
LAN
    ↓
phone
```

The runtime writes its Next build identity to `logs/app.log` as `BAMSO Next build identity: <BUILD_ID>`. The UAT start helper compares that identity with the current `.next/BUILD_ID` and fails closed on mismatch.

Why this gate exists:

- an old PID may still serve an older build;
- successful startup alone does not prove the latest `.next` output is loaded;
- a stale CSS chunk can reveal a source/build/runtime mismatch;
- never blindly kill unrelated `node.exe` processes.

Before stopping anything, verify the PID belongs to BAMSO and resolves to the expected repository/runtime. `scripts/start-uat.ps1 -Restart` performs this preflight before it invokes the stop helper.

# 24. Common mistakes from UAT rehearsal

| Mistake | Symptom | Correct action |
| --- | --- | --- |
| Start with unknown old PFX password | `mac verify failure` | regenerate UAT PFX |
| Generate PFX in child PowerShell then expect parent env to contain password | server says password required | enter same password in server process |
| Press Enter at hidden SecureString prompt | `HTTPS_PFX_PASSWORD is required` | type password even though characters are invisible |
| Leave stale BAMSO PID running | source/build mismatch | stop verified old BAMSO PID |
| Run `npm run dev` | QR phone UAT not representative | use `npm run start:https` |
| Run migration during UAT restart | unnecessary DB risk | do not migrate for routine restart |

# 25. Do this next time — 60-second checklist

```text
[ ] cd D:\\Bamso
[ ] Check whether PFX/password are known
[ ] If yes: skip certificate generation
[ ] If source changed: build first
[ ] Stop only stale BAMSO PID
[ ] Set production-like UAT env
[ ] Enter PFX password in SAME process
[ ] npm run start:https
[ ] /api/health = 200
[ ] /get-ticket = 200
[ ] LAN works
[ ] Phone works
```

## Current UAT helper contract

The helper now exists and is the canonical path for routine UAT restart. Do not duplicate its orchestration in ad-hoc shell commands.

- `scripts\\restart-uat.bat` is the operator-facing entrypoint.
- `scripts\\start-uat.ps1 -Restart` is the implementation entrypoint.
- Preflight happens before the existing runtime is stopped.
- `scripts\\stop-uat.ps1` is safe when no listener exists and refuses unverified processes.
- Runtime BUILD_ID and a referenced CSS asset are checked after startup.

# 26. Standardized UAT rules

- Source changed → rebuild required.
- Runtime process changed → restart required.
- `npm run dev` is not an HTTPS production-like acceptance runtime.
- Routine UAT restart does not run migrations or alter DB/schema.
- Self-signed certificate trust and Windows Firewall reachability are separate checks.
- A local health pass does not equal phone/LAN pass.
- Do not report phone QR acceptance without an actual phone/device test.
