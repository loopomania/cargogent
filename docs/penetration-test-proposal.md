# Red Team Penetration Test Proposal: cargogent.com

**Document type:** Proposal / Statement of Work  
**Target:** cargogent.com (CargoGent — AWB tracking, multi-tenant)  
**Classification:** For internal use; testing only under formal authorization.

---

## 1. Scope and Rules of Engagement

- **In scope:** cargogent.com and its public-facing services (web app, APIs, and any exposed management interfaces identified during recon).
- **Out of scope (unless explicitly authorized):** Third-party services (Neon, Hetzner control plane, email providers), social engineering or physical access, denial-of-service (DoS) or resource-exhaustion attacks intended to disrupt availability.
- **Authorization:** Testing must be performed only after written authorization (signed scope, timing window, and contact for incidents). All testing must be documented; critical findings must be reported immediately via agreed channel.
- **Safe testing:** No modification or deletion of production data beyond what is necessary to demonstrate a finding; no exposure of real user/customer PII in reports.

---

## 2. Reconnaissance and Mapping

| Objective | Activities |
|-----------|------------|
| **DNS / subdomains** | Enumerate subdomains (e.g. `api.cargogent.com`, `n8n.cargogent.com`, `staging.*`); identify CDN/WAF and origin IPs. |
| **Tech fingerprint** | Identify stack from headers and behavior: Caddy, Node/Express, React SPA, n8n (if exposed). Check for disclosure in `/api/health`, `/health`, error pages. |
| **Route mapping** | Map public routes: `/`, `/login`, `/setup-password`, `/api/*`, `/track/*`, `/n8n/*`. Confirm which paths require auth and which return sensitive info (e.g. stack traces, DB status). |
| **CORS / headers** | Document CORS policy (e.g. `Access-Control-Allow-Origin`), security headers (CSP, X-Frame-Options, HSTS, etc.), and cookie attributes if any. |

**Reference (from codebase):** Backend uses `cors()` with no explicit origin restrict; `/api/health` can expose `database: connected|error|not_configured`; Caddy fronts `/api/*` → backend, `/track/*` and `/health` → AWBTrackers, `/n8n/*` → n8n.

---

## 3. Authentication and Session Security

| Test | Description | Rationale |
|------|-------------|-----------|
| **Login brute-force / lockout** | Measure rate limits on `POST /api/auth/login` (per IP and per account); test whether lockout is bypassable (e.g. X-Forwarded-For, different paths). | Login is rate-limited (e.g. 10/15 min); verify no bypass and no user enumeration from timing or error messages. |
| **JWT robustness** | Inspect JWT from login: algorithm, claims (`sub`, `email`, `role`, `tenant_id`), expiry. Test: strip signature, `alg: none`, key confusion (if applicable), expired token reuse, role/tenant tampering (verify server-side validation). | Backend uses symmetric secret and `role` for admin; ensure no algorithm downgrade or claim trust without verification. |
| **Dev-mode bypass** | With no/invalid Bearer token, call admin endpoints (e.g. `GET /api/track/elal/11463874650`, `GET /api/logs`). If 200 with data, check whether `NODE_ENV` or similar is set to development in production. | Code allows unauthenticated admin when `isDev`; production must not have this. |
| **Forgot-password / invite flows** | Test `POST /api/auth/forgot-password` for email enumeration (timing, different messages). Request reset for known account; capture token from email or link. Check token entropy, expiry, single-use, and whether `GET /api/auth/verify-token?token=...` leaks validity to unauthenticated callers. | Reset tokens are JWTs; verify-token endpoint may allow token probing. |
| **Setup-password token** | Use a captured or guessed token with `POST /api/auth/setup-password`. Test reuse after success, expired token, and token binding (e.g. IP/session) if any. | Tokens in query string or body can be logged or leaked; ensure one-time use and expiry. |

---

## 4. Authorization and Access Control

| Test | Description | Rationale |
|------|-------------|-----------|
| **Horizontal privilege** | As a low-privilege (e.g. customer) user, obtain JWT and call admin endpoints: `GET /api/track/:airline/:awb`, `GET /api/logs`, `GET /api/users`, `POST /api/users`, `DELETE /api/users/:id`. Expect 403. | Backend enforces `requireAdmin`; confirm role is taken from verified JWT only. |
| **Vertical privilege** | Attempt to escalate by forging JWT (e.g. `role: admin` or `tenant_id` change) and verify server rejects invalid signatures or unknown keys. | Ensure no local/dev secret used in prod and no claim override. |
| **Direct AWBTrackers access** | Compare `GET /track/elal/11463874650` (via Caddy → AWBTrackers) vs `GET /api/track/elal/11463874650` (via backend with auth). Confirm `/track/*` is either intended public or adequately locked down. | Design may expose tracking without auth on `/track/*`; document risk. |
| **n8n exposure** | If `/n8n` or `/n8n/*` is reachable, check default credentials, unauthenticated access to workflows, and exposure of webhook URLs or secrets. | n8n can hold sensitive automation; often misconfigured in production. |

---

## 5. API and Input Security

| Test | Description | Rationale |
|------|-------------|-----------|
| **IDOR (users)** | As admin, list users (`GET /api/users`). Call `GET /api/users/:id`, `DELETE /api/users/:id`, `POST /api/users/:id/reset`, `POST /api/users/:id/key` with other users’ IDs; verify authorization checks. | Ensure actions are scoped to allowed operations (e.g. no delete of last admin). |
| **Logs API** | As admin, test `GET /api/logs?page=1&limit=1000`. Try negative page/limit, huge limit, and check for information disclosure (e.g. PII, internal IDs). | Logs are admin-only; pagination should be bounded. |
| **Track API injection** | On `GET /api/track/:airline/:awb` and `GET /api/track/:awb`, try path/query injection (e.g. `../`, encoded chars, very long awb/hawb). Ensure backend/AWBTrackers do not interpret as path traversal or SSRF. | Params are passed to AWBTrackers; validate for injection and SSRF. |
| **SQL / NoSQL** | If any API accepts free-form input that reaches the DB (e.g. search, filters), test parameterized handling and error messages. | Logs use parameterized queries; confirm no raw concatenation elsewhere. |

---

## 6. Infrastructure and Configuration

| Test | Description | Rationale |
|------|-------------|-----------|
| **Secrets and env** | Check for leaked secrets in client bundles (e.g. Vite build), `/api/health` or debug endpoints, and error messages. | Avoid exposure of `JWT_SECRET`, `DATABASE_URL`, or API keys. |
| **TLS** | Verify TLS version, certificate validity, and HSTS for cargogent.com. | Ensure no downgrade or self-signed in production. |
| **Dependency and server disclosure** | Inspect `Server`, `X-Powered-By`, and stack traces for versions (Node, Caddy, n8n). | Reduces value of version-specific exploits. |

---

## 7. Deliverables and Reporting

- **Pre-test:** Signed scope and authorization; optional kickoff call to confirm boundaries and contacts.
- **During test:** Immediate escalation path for critical issues (e.g. full auth bypass, data breach).
- **Report:** Executive summary; list of findings with severity (Critical/High/Medium/Low/Info), affected asset, steps to reproduce, impact, evidence (sanitized), and remediation guidance. Append raw request/response samples and tool output in an annex.
- **Retest (optional):** After remediation, retest critical/high findings and close or re-open as agreed.

---

## 8. Attack Surface Summary (from codebase)

| Asset | Notes |
|-------|--------|
| **Frontend** | React SPA; auth state and token in localStorage; 401 triggers redirect to `/login?timeout=1`. |
| **Backend** | Express; `POST /api/auth/login` (rate-limited), `POST /api/auth/forgot-password` (rate-limited), `GET /api/auth/verify-token`, `POST /api/auth/setup-password`; `GET /api/track/*` and `GET /api/logs`, `GET/POST/DELETE /api/users/*` behind authOptional + requireAdmin. |
| **Caddy** | Routes `/api/*` → backend, `/track/*` and `/health` → AWBTrackers, `/n8n/*` → n8n; default `:80` (and localhost TLS). |
| **Auth model** | JWT (Bearer) with `sub`, `email`, `role`, `tenant_id`; 30m expiry; admin required for track and user management. |
| **Sensitive config** | `JWT_SECRET`, `DATABASE_URL`, SMTP, `N8N_INVITE_WEBHOOK_URL`; `NODE_ENV` must be `production` in prod to avoid dev bypass. |

---

*This proposal is for authorized penetration testing only. Unauthorized access to computer systems is illegal.*
