# Security Analysis

**Date:** January 28, 2026  
**Repository:** Friday Personal Assistant MCP Server  
**Deployment:** Local-only (MCP server in Cursor)

---

## Executive Summary

**Overall Security Rating:** 7/10 (Local) | 4/10 (If Hosted)

This analysis categorizes security issues by deployment context. For local-only usage, focus on preventing accidental damage and data loss. If hosting later, additional protections are required.

---

## 🔴 Critical Issues (Fix Now - Local)

### Command Injection
**Files:** `tools/shortcuts/run-shortcut.ts`, `tools/ytdlp/download.ts`, multiple `Bun.$` usages

**Issue:** User input passed directly to shell commands without sanitization.

**Risk:** Malicious input could execute arbitrary commands on your system.

**Fix:** Validate inputs, use `Bun.spawn()` with arrays instead of template literals.

```typescript
// Validate shortcut name
if (!/^[a-zA-Z0-9_-]+$/.test(shortcutName)) {
    throw new Error("Invalid shortcut name");
}
// Use Bun.spawn instead
const proc = Bun.spawn(["shortcuts", "run", shortcutName], { stdout: "pipe" });
```

---

### Email Header Injection
**Files:** `tools/gmail/send-email.ts`, `lib/utils/gmail.ts`

**Issue:** Email addresses not validated; newlines in headers could inject additional headers.

**Risk:** Could send emails with modified headers or to unintended recipients.

**Fix:** Validate email format, sanitize headers (remove `\r\n`).

```typescript
import { isEmail } from 'validator';
function sanitizeHeader(email: string): string {
    return email.replace(/[\r\n]/g, '').trim();
}
```

---

### Path Traversal
**Files:** `lib/utils/path.ts`, `tools/obsidian/*.ts`

**Issue:** `resolvePath()` accepts absolute paths; path validation can be bypassed.

**Risk:** Could access files outside intended directories.

**Fix:** Always resolve relative to project root, reject `..` sequences, validate resolved path stays within bounds.

```typescript
export const resolvePath = (relativePath: string): string => {
    if (relativePath.includes('..')) throw new Error("Path traversal detected");
    const projectRoot = resolve(import.meta.dir, "../..");
    const resolved = resolve(projectRoot, relativePath);
    if (!resolved.startsWith(projectRoot)) throw new Error("Path outside project");
    return resolved;
};
```

---

## 🟡 Medium Issues (Fix Soon - Local)

### Sensitive Data in Logs
**File:** `lib/utils/logger.ts`

**Issue:** All request data logged in plain text (emails, content, personal info).

**Risk:** If log files are shared/backed up, sensitive data exposed.

**Fix:** Mask sensitive fields (email, body, content, token) before logging.

```typescript
const sensitiveFields = ['to', 'cc', 'bcc', 'body', 'content', 'email', 'token'];
function sanitizeLogData(data: unknown): unknown {
    // Redact sensitive fields
}
```

---

### OAuth Token Storage
**File:** `lib/utils/google-auth.ts`

**Issue:** Tokens stored in plain text JSON files.

**Risk:** If file system compromised, tokens accessible.

**Fix (Local):** Set file permissions to 600. **Fix (Hosted):** Encrypt tokens.

---

### Input Validation Gaps
**Files:** Multiple tool handlers

**Issue:** Missing length limits, format validation, content sanitization.

**Risk:** Invalid inputs causing errors or unexpected behavior.

**Fix:** Add Zod refinements for length limits, format validation, HTML sanitization for email bodies.

---

## ✅ Low Priority (Local)

- **Error message disclosure:** Less critical locally, but sanitize for better UX
- **Command execution patterns:** Some `Bun.$` usages are safe, but prefer `Bun.spawn()` for consistency

---

## 🔴 Critical Issues (If Hosted)

### Rate Limiting
**Issue:** No rate limiting on tool execution.

**Risk:** API quota exhaustion, DoS, resource exhaustion.

**Fix:** Implement per-tool rate limits, request throttling, API quota monitoring.

---

### Access Controls
**Issue:** No authentication/authorization.

**Risk:** Unauthorized access to all tools and data.

**Fix:** Implement authentication, RBAC, API keys, or IP whitelisting.

---

### Compliance (GDPR/CCPA)
**Issues:** No privacy policy, data retention policies, data subject rights mechanisms.

**Risk:** Legal compliance violations, fines.

**Fix:** Privacy policy, data retention/cleanup, export/deletion tools, consent management.

---

### Audit Trail
**Issue:** Logging doesn't meet compliance requirements.

**Risk:** Cannot prove compliance, insufficient audit trail.

**Fix:** Structured logging, log integrity (hashes), centralized logging, retention policies.

---

### Data Encryption at Rest
**Issue:** All data stored unencrypted.

**Risk:** Data breach exposes all sensitive information.

**Fix:** Encrypt sensitive files, use OS-level encryption, secure key management.

---

## 🟡 Medium Issues (If Hosted)

- **Error message disclosure:** Critical - don't expose internal details
- **Dependency vulnerabilities:** Regular audits required
- **Network security:** HTTPS, CORS, security headers required

---

## Positive Security Practices

✅ Proper `.gitignore` (excludes `.env`, `secrets/`, `credentials.json`)  
✅ Environment variables for secrets  
✅ Zod schema validation  
✅ TypeScript type safety  
✅ No hardcoded secrets  
✅ Error handling present

---

## Action Plan

### For Local Usage (Now):
1. **Fix command injection** (critical)
2. **Add email validation** (critical)
3. **Fix path traversal** (critical)
4. **Mask sensitive logs** (medium)
5. **Set token file permissions to 600** (medium)

### If Hosting Later:
1. All local fixes above
2. **Add authentication/authorization** (critical)
3. **Implement rate limiting** (critical)
4. **Add compliance documentation** (critical)
5. **Encrypt data at rest** (high)
6. **Enhance audit logging** (high)
7. **Add dependency scanning to CI/CD** (medium)

---

## Dependency Security

**Action:** Run `bun audit` regularly, keep dependencies updated.

**Key packages to monitor:**
- `googleapis` - Google API client
- `@modelcontextprotocol/sdk` - MCP SDK
- `zod` - Schema validation
- `js-yaml` - YAML parsing

---

*Analysis performed January 28, 2026. Re-audit when adding features or before hosting.*
