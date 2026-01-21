# Log Security Audit Report

**Date:** 2024  
**Scope:** Audit of logging statements for exposure of sensitive data (API keys, secrets, tokens, passwords)  
**Status:** ✅ **CRITICAL ISSUES FIXED**

---

## Executive Summary

This audit identified **critical security vulnerabilities** where API keys and potentially other sensitive data are being logged in plain text. These logs could expose sensitive credentials if log files are accessed, shared, or stored insecurely.

**Overall Assessment:** ⚠️ **HIGH RISK** - Immediate action required to prevent credential exposure.

---

## ✅ Fixed Issues

### 1. **API Keys Logged in Authentication Middleware** (FIXED)

**File:** `app/core/security/auth.middleware.ts`

**Issue:** Full API keys are being logged in multiple places without redaction.

#### Location 1: Line 197 - Invalid API Key Warning
```typescript
logger.warn('Invalid API key', {
  path: req.path,
  method: req.method,
  apiKey,  // ❌ FULL API KEY EXPOSED
  ip: req.ip || req.socket?.remoteAddress,
});
```

#### Location 2: Line 238 - Signature Validation Failure
```typescript
logger.warn('Signature validation failed', {
  path: req.path,
  method: req.method,
  apiKey,  // ❌ FULL API KEY EXPOSED
  ip: req.ip || req.socket?.remoteAddress,
  signatureMatch: false,
  // ...
});
```

#### Location 3: Line 273 - Successful Authentication Debug
```typescript
logger.debug('Authentication successful', {
  path: req.path,
  method: req.method,
  apiKey,  // ❌ FULL API KEY EXPOSED
});
```

**Impact:** 
- API keys could be exposed in log files, log aggregation systems, or error monitoring services
- If logs are accessed by unauthorized parties, they could use the API keys to authenticate
- Violates security best practices for credential handling

**Status:** ✅ **FIXED**
- Created `app/shared/utils/sensitive-data.util.ts` with `maskApiKey()` function
- Updated all three locations to use `maskApiKey(apiKey)` instead of raw `apiKey`
- API keys are now masked as: `"3535***REDACTED***3535"` (first 4 + last 4 chars)

---

### 2. **API Keys Logged in API Keys Helper** (FIXED)

**File:** `app/core/security/api-keys.helper.ts`

**Issue:** Full API keys are logged in several operations.

#### Locations:
- Line 117: Warning about short secret length
- Line 128: Debug log when adding API key
- Line 149: Warning when API key is disabled
- Line 201: Info log when API key is removed
- Line 219: Info log when API key is disabled
- Line 236: Info log when API key is enabled

**Example:**
```typescript
logger.info('Removed API key', { key: apiKey });  // ❌ FULL API KEY EXPOSED
```

**Impact:**
- Less critical than authentication middleware (these are likely internal operations)
- Still poses risk if logs are accessed or shared
- Could expose API keys during key management operations

**Status:** ✅ **FIXED**
- Applied `maskApiKey()` to all 6 logging locations
- All API key logging now uses consistent masking

---

## ✅ Good Practices Found

### 1. **Crash Report System Has Proper Sanitization**

**File:** `dashboard/app/utils/crash-report.ts`

**Good Practice:** The crash report system properly sanitizes sensitive data:

- **Headers:** Lines 272-291 - Headers are sanitized, sensitive keys are redacted:
  ```typescript
  const sensitiveKeys = ['authorization', 'cookie', 'x-shopify-access-token', 'api-key'];
  if (sensitiveKeys.includes(lowerKey)) {
    sanitized[key] = '[REDACTED]';
  }
  ```

- **Request Payload:** Lines 243-267 - Uses `sanitizeObject()` to redact sensitive fields:
  ```typescript
  payload.graphqlVariables = sanitizeObject(error.variables || error.graphqlVariables);
  ```

- **Sanitization Function:** Lines 485-508 - Recursively sanitizes objects:
  ```typescript
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'api_key', 'accessToken', 'access_token', 'auth', 'authorization'];
  ```

**Recommendation:** Use this sanitization pattern as a reference for fixing other logging issues.

---

### 2. **Logger Utilities Are Flexible**

**Files:** 
- `app/shared/utils/logger.util.ts`
- `dashboard/app/utils/logger.ts`

**Good Practice:** Logger utilities don't automatically sanitize, which is fine if callers handle sanitization. However, this means each logging call must be careful.

**Recommendation:** Consider adding optional automatic sanitization for common sensitive fields, or create a wrapper that sanitizes before logging.

---

## 📋 Recommendations

### ✅ Completed Actions

1. **✅ Created API Key Masking Utility**
   - Created `app/shared/utils/sensitive-data.util.ts`
   - Includes `maskApiKey()`, `maskSecret()`, and `maskSensitiveFields()` functions
   - Provides consistent masking across the codebase

2. **✅ Fixed Authentication Middleware**
   - Updated all 3 locations to use `maskApiKey(apiKey)`
   - Lines 197, 238, and 273 in `app/core/security/auth.middleware.ts` are now secure

3. **✅ Fixed API Keys Helper**
   - Updated all 6 locations to use `maskApiKey(apiKey)`
   - All API key management operations now use masked keys

### Medium-Term Improvements

1. **Add Automatic Sanitization to Logger**
   - Consider adding a `sanitizeLogData()` function that automatically redacts common sensitive fields
   - Integrate with existing logger utilities

2. **Create Logging Guidelines**
   - Document which fields should never be logged
   - Create a checklist for developers when adding new logging statements

3. **Add Pre-commit Hooks**
   - Consider adding a pre-commit hook that scans for common patterns of sensitive data logging
   - Use tools like `gitleaks` or similar to detect secrets in code

### Long-Term Improvements

1. **Centralized Sensitive Data Handling**
   - Create a centralized utility for handling all sensitive data operations
   - Include masking, hashing, and validation functions

2. **Log Review Process**
   - Establish a regular review process for log outputs
   - Ensure logs are stored securely and access is restricted

3. **Security Training**
   - Educate team on secure logging practices
   - Include examples of what should and shouldn't be logged

---

## 🔍 Additional Findings

### Potential Issues to Review

1. **Error Objects May Contain Sensitive Data**
   - When logging error objects, ensure they don't contain sensitive data from request bodies or headers
   - Review: `dashboard/app/graphql.server.ts` line 163 - logs `responseBody` which might contain sensitive data

2. **Request Body Logging**
   - Some error handlers log full request bodies
   - Ensure GraphQL variables and request bodies are sanitized before logging
   - Review: `dashboard/app/routes/app.api.graphql.tsx` - logs GraphQL responses

3. **Environment Variable Logging**
   - Ensure no code logs environment variables directly
   - Review startup/bootstrap code for any env var logging

---

## 📊 Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 3 | ✅ **FIXED** |
| 🟡 Medium | 6 | ✅ **FIXED** |
| ✅ Good Practices | 2 | Keep as reference |

---

## ✅ Verification Checklist

- [x] No API keys are logged in plain text
- [x] All authentication-related logs use masked API keys
- [x] API key management operations use masked keys
- [x] Crash reports continue to properly sanitize sensitive data
- [ ] Error logs don't expose request bodies with sensitive data (review recommended)
- [ ] No environment variables are logged (review recommended)
- [ ] All new logging statements follow sanitization guidelines (documentation recommended)

---

## 📝 Notes

- The crash report system (`dashboard/app/utils/crash-report.ts`) serves as a good reference for proper sanitization
- Consider creating a shared utility module for sensitive data handling
- Regular security audits should include log review
- Log aggregation systems (e.g., Datadog, Splunk) should have access controls to prevent unauthorized access

---

**Report Generated:** 2024  
**Next Review:** After fixes are applied

