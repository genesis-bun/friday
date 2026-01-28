# Security Analysis

**Date:** January 28, 2026  
**Repository:** Friday Personal Assistant MCP Server  
**Deployment:** Local-only (MCP server in Cursor)

---

## Executive Summary

**Overall Security Rating:** 8/10 (Local) | 4/10 (If Hosted)

**Last Updated:** January 28, 2026 - Critical security fixes implemented

This analysis categorizes security issues by deployment context. For local-only usage, focus on preventing accidental damage and data loss. If hosting later, additional protections are required.

---

## 🔴 Critical Issues (Fix Now - Local)

### ✅ Command Injection - FIXED
**Files:** `tools/shortcuts/run-shortcut.ts`

**Status:** ✅ **RESOLVED**

**Implementation:**
- Created `lib/utils/validation.ts` with `validateShortcutName()` and `validateInputText()` functions
- Updated `tools/shortcuts/run-shortcut.ts` to validate all inputs before execution
- Uses `Bun.$` template literals (required for shortcuts command to work properly)
- **Safeguards in place:**
  1. **Input validation before execution:** `validateShortcutName()` ensures only alphanumeric, dashes, underscores (blocks `;`, `$`, `` ` ``, `&`, `|`, etc.)
  2. **Input text validation:** `validateInputText()` removes control characters and enforces length limits
  3. **Bun.$ automatic escaping:** Bun's template literals automatically escape special characters in interpolated values
  4. **Length limits:** Shortcut names limited to 100 chars, input text to 10,000 chars
- Input validation prevents command injection via malicious shortcut names or input text

---

### ✅ Email Header Injection - FIXED
**Files:** `tools/gmail/send-email.ts`, `lib/utils/gmail.ts`

**Status:** ✅ **RESOLVED**

**Implementation:**
- Added `sanitizeEmailHeader()`, `validateEmailAddress()`, and `validateEmailList()` functions to `lib/utils/gmail.ts`
- Added Zod refinements to `tools/gmail/send-email.ts` for email format validation and sanitization
- All email fields (to, cc, bcc, replyTo, subject) are now validated and sanitized before use
- Headers are sanitized to remove `\r\n` characters preventing header injection

---

### ✅ Path Traversal - FIXED
**Files:** `lib/utils/path.ts`, `tools/obsidian/*.ts`, `lib/utils/notes.ts`

**Status:** ✅ **RESOLVED**

**Implementation:**
- Added `resolveVaultPath()` function to `lib/utils/path.ts` that restricts paths to vault directory
- Rejects paths containing `..` sequences
- Validates that resolved paths stay within the base directory using path normalization
- Updated all Obsidian tools (`list-notes.ts`, `consult-vault.ts`) to use `resolveVaultPath()`
- Updated all note operations in `lib/utils/notes.ts` (`writeNote`, `deleteNote`, `readNote`, `moveNote`) to use `resolveVaultPath()`
- Absolute paths are now validated to ensure they stay within the vault directory

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

### ✅ Input Validation Gaps - PARTIALLY FIXED
**Files:** Multiple tool handlers

**Status:** ⚠️ **PARTIALLY RESOLVED**

**Completed:**
- Email validation with Zod refinements (length limits, format validation, sanitization)
- Shortcut name and input text validation
- Path validation for vault operations

**Remaining:**
- HTML sanitization for email bodies (if HTML content needs sanitization)
- Additional input validation for other tool handlers as needed

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
✅ Input validation for command execution  
✅ Email validation and sanitization  
✅ Path traversal protection for vault operations

---

## Action Plan

### ✅ For Local Usage (Completed):
1. ✅ **Fix command injection** (critical) - **DONE**
2. ✅ **Add email validation** (critical) - **DONE**
3. ✅ **Fix path traversal** (critical) - **DONE**
4. **Mask sensitive logs** (medium) - Pending
5. **Set token file permissions to 600** (medium) - Pending

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

## Implementation Status

**Last Updated:** January 28, 2026

### ✅ Completed Fixes
- Command injection protection in `tools/shortcuts/run-shortcut.ts`
- Email validation and header sanitization in `lib/utils/gmail.ts` and `tools/gmail/send-email.ts`
- Path traversal protection via `resolveVaultPath()` in `lib/utils/path.ts`
- Input validation utilities in `lib/utils/validation.ts`

### ⏳ Pending Fixes (Medium Priority)
- Sensitive data masking in logs
- OAuth token file permissions (set to 600)

### 📋 Future Fixes (If Hosting)
- Rate limiting
- Authentication/authorization
- Compliance documentation
- Data encryption at rest
- Enhanced audit logging

---

*Analysis performed January 28, 2026. Critical security fixes implemented. Re-audit when adding features or before hosting.*
