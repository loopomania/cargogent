# Workflow Requirements

## 1. Create User (Admin Flow)

### Overview
An administrator creates a new system user from the User Management dashboard. The system sends a branded invitation email via n8n so the new user can set their own password securely.

### Actors
- **Admin** — triggers the flow from the dashboard
- **New User** — receives the invitation and completes onboarding

### Steps
1. Admin opens **Users → Create User** and enters:
   - **Name** (display name, required)
   - **Email address** (username, required, must be unique)
2. Admin clicks **Send Invite**.
3. Backend creates the user record with a placeholder (unusable) password hash and `role = user`.
4. Backend signs a **24-hour JWT** with `{ sub, email, name, flow_type: "invite" }`.
5. Backend calls the **n8n webhook** (`N8N_INVITE_WEBHOOK_URL`) with `{ email, name, inviteUrl, flow_type: "invite" }`.
   - If the webhook is not configured, falls back to direct SMTP.
6. n8n sends a branded **Welcome email** to the new user containing a **Set Password** button/link.
7. User clicks the link → arrives at `/setup-password?token=<jwt>`.
8. Frontend calls `GET /api/auth/verify-token`:
   - **Expired / Invalid** → redirect to `/invite-expired`.
   - **Valid** → show the Set Password form.
9. User enters **New Password** + **Confirm Password** (must match; live guideline checklist shown).
10. Frontend calls `POST /api/auth/setup-password`.
11. Backend:
    - Saves hashed password.
    - Auto-generates a 16-char **API Access Key** and emails it to the user.
12. User is redirected to `/login`.

### Requirements
| # | Requirement |
|---|-------------|
| R1 | Name field is required in the create-user form |
| R2 | Token expires after **24 hours** |
| R3 | Clicking an expired or already-used link must show the **Invite Expired** page |
| R4 | Set Password form requires two matching password fields |
| R5 | Password must satisfy: ≥8 chars, upper, lower, number, special char |
| R6 | Live guideline checklist is shown while typing |
| R7 | Submit is disabled until all rules pass |
| R8 | API Access Key is generated automatically on first invite completion (not on password-reset) |
| R9 | Invitation email is sent via n8n webhook; SMTP is the fallback for local dev |
| R10 | After password is set, user lands on `/login` |

---

## 2. Forgot Password (Self-Service Flow)

### Overview
A user who has forgotten their password requests a reset from the Login page. The same n8n workflow sends a password-reset email.

### Actors
- **User** — initiates the flow from the Login page

### Steps
1. User clicks **"Forgot password?"** on the Login page.
2. User is taken to `/forgot-password`.
3. User enters their email address and clicks **Send Reset Link**.
4. Backend receives `POST /api/auth/forgot-password`:
   - **Always returns 200** with a generic message (prevents email enumeration).
   - If the email is found: signs a **24-hour JWT** with `{ sub, email, name, flow_type: "reset" }`.
   - Calls the n8n webhook with `{ email, name, inviteUrl, flow_type: "reset" }`.
5. n8n branches on `flow_type: "reset"` and sends a **Password Reset email** with a reset button/link.
6. User clicks the link → `/setup-password?token=<jwt>`.
7. Frontend calls `GET /api/auth/verify-token`:
   - **Expired / Invalid** → `/invite-expired` page with a prompt to request a new link.
   - **Valid** → show Set Password form (same UI as invite flow, same password rules).
8. User sets new password.
9. Backend saves the hash. **No API key is generated** (this is a reset, not an onboarding).
10. User is redirected to `/login`.

### Requirements
| # | Requirement |
|---|-------------|
| R1 | "Forgot password?" link is visible on the Login page |
| R2 | Forgot Password page shows a single email field |
| R3 | API **never leaks** whether an email is registered (always 200 + generic message) |
| R4 | Rate-limited to **5 requests per 15 minutes** per IP |
| R5 | Token expires after **24 hours** |
| R6 | Expired/used link shows **Invite Expired** page with a "return to login" prompt |
| R7 | Same Set Password form (two fields + live guidelines) as the invite flow |
| R8 | **No API key is generated** on password reset |
| R9 | After password is set, user lands on `/login` |

---

## n8n Workflow: `workflow-user-email`

Single webhook (`POST /webhook/user-email`) shared by both flows.

| Field received | Value |
|---|---|
| `email` | Recipient email address |
| `name` | Recipient display name (may be empty) |
| `inviteUrl` | The `/setup-password?token=…` URL |
| `flow_type` | `"invite"` or `"reset"` |

The workflow branches on `flow_type`:
- **`invite`** → Sends a **Welcome / Onboarding** email template.
- **`reset`** → Sends a **Password Reset** email template.

Both templates contain the `inviteUrl` as a prominent CTA button.

---

## Shared: Set Password Page (`/setup-password`)

Used by both flows — behaviour differs only in:
- Title/copy: "Welcome — set your password" vs "Reset your password"
- Post-submit: invite auto-generates API key, reset does not

### Password Guidelines (live validation)
- ✅ At least 8 characters
- ✅ One uppercase letter (A–Z)
- ✅ One lowercase letter (a–z)
- ✅ One number (0–9)
- ✅ One special character (!@#$…)
- ✅ Passwords match
