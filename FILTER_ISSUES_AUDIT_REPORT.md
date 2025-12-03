# Filter Issues Audit Report

**Date:** 2024  
**Issue:** Filters not working correctly with special characters  
**Test Case:** `options[Plyoboxes]=24"+Plyobox`  
**Expected:** Filter should match products with option value `24"+Plyobox`  
**Actual:** Value is being modified or lost

---

## Critical Issues Found

### 🔴 Issue #1: Plus Sign (+) Removed from Filter Values

**Location:** `app/shared/utils/sanitizer.util.ts:52`

**Problem:**
```typescript
if (/[+\-=&|!(){}[\]^"~*?:\\]/.test(term)) return false;
```

The `sanitizeTermsArray` function **rejects** any term containing a `+` character. This means:
- Input: `24"+Plyobox`
- After quote removal: `24+Plyobox`
- After `sanitizeTermsArray`: **REJECTED** (returns empty array)
- Result: Filter value is lost entirely

**Impact:** 
- Any filter value containing `+` (common in product names like "24"+Plyobox", "Size+Color", etc.) is silently dropped
- Users cannot filter by these values
- No error is returned, making debugging difficult

**Root Cause:**
The sanitization is too aggressive. The `+` character is a valid character in product option values and should be preserved. The regex pattern `/[+\-=&|!(){}[\]^"~*?:\\]/` includes `+` which causes legitimate values to be rejected.

---

### 🔴 Issue #2: Quotes Removed from Filter Values

**Location:** `app/shared/helpers/query.helper.ts:32`

**Problem:**
```typescript
.replace(/[<>\"'`]/g, '') // Remove HTML/script injection chars
```

The `sanitizeQueryValue` function removes all quotes (`"` and `'`) from values. This means:
- Input: `24"+Plyobox`
- After sanitization: `24+Plyobox` (quote removed)
- Result: Original value is modified

**Impact:**
- Product option values that legitimately contain quotes (e.g., `24"+Plyobox`, `Size "Large"`) are modified
- This breaks exact matching in Elasticsearch
- Products won't be found if the stored value contains quotes

**Note:** This is actually acceptable for security, BUT it should be documented and the Elasticsearch index should also store values without quotes for consistency.

---

### 🔴 Issue #3: Option Name Case Sensitivity Mismatch

**Location:** `app/modules/products/products.filter-config.helper.ts:87-111`

**Problem:**
The query parameter uses `Plyoboxes` (capital P), but the filter config stores `variantOptionKey: "plyoboxes"` (lowercase). While `mapOptionKeyToName` does case-insensitive matching, the **storage** of the option key might be case-sensitive.

**Flow:**
1. Query: `options[Plyoboxes]=24"+Plyobox`
2. Parsed: `{ "Plyoboxes": ["24\"+Plyobox"] }`
3. Mapping: `mapOptionKeyToName` does `.toLowerCase()` comparison (line 98)
4. Matches: `variantOptionKey: "plyoboxes"` (lowercase)
5. Returns: `"plyoboxes"` (lowercase)
6. Storage: `result.options["plyoboxes"] = ["24\"+Plyobox"]`

**Potential Issue:**
If the Elasticsearch index stores option pairs with the original case (e.g., `Plyoboxes::24"+Plyobox`), but we're querying with lowercase (`plyoboxes::24"+Plyobox`), the match will fail.

**Impact:**
- Case-sensitive option names won't match
- Need to verify if ES stores option names in original case or normalized case

---

### 🟡 Issue #4: No Validation/Error Reporting for Rejected Values

**Location:** `app/shared/utils/sanitizer.util.ts:41-54`

**Problem:**
When `sanitizeTermsArray` rejects a value (due to special characters), it silently filters it out. There's no:
- Logging of rejected values
- Error message to the user
- Warning in the response

**Impact:**
- Users don't know why their filter isn't working
- Difficult to debug filter issues
- Silent failures are bad UX

---

### 🟡 Issue #5: Inconsistent Sanitization Between Query Parsing and Filter Input

**Location:** Multiple files

**Problem:**
There are **two layers** of sanitization:

1. **First Layer** (`query.helper.ts`):
   - `sanitizeQueryValue` removes quotes
   - Used in `parseCommaSeparated`

2. **Second Layer** (`sanitizer.util.ts`):
   - `sanitizeTermsArray` removes/rejects special characters including `+`
   - Used in `sanitizeFilterInput`

**Flow:**
```
Query: options[Plyoboxes]=24"+Plyobox
  ↓
parseOptionFilters() → sanitizeQueryValue() → "24+Plyobox" (quote removed)
  ↓
buildFilterInput() → { options: { "Plyoboxes": ["24+Plyobox"] } }
  ↓
sanitizeFilterInput() → sanitizeTermsArray() → [] (rejected due to +)
  ↓
Final: { options: { "Plyoboxes": [] } } (empty!)
```

**Impact:**
- Values are sanitized twice with different rules
- First sanitization is lenient, second is strict
- Values that pass first check fail second check
- Inconsistent behavior

---

## Detailed Analysis

### Query Parameter Flow

1. **URL:** `options[Plyoboxes]=24"+Plyobox`

2. **Parse** (`query.helper.ts:124-186`):
   - Extracts: `{ "Plyoboxes": ["24\"+Plyobox"] }`
   - `sanitizeQueryValue` removes quote: `"24+Plyobox"`
   - Result: `{ "Plyoboxes": ["24+Plyobox"] }`

3. **Build Filter Input** (`products.helper.ts:48-51`):
   - Passes through: `{ options: { "Plyoboxes": ["24+Plyobox"] } }`

4. **Apply Filter Config** (`products.filter-config.helper.ts:118-293`):
   - Maps `"Plyoboxes"` → `"plyoboxes"` (lowercase)
   - Result: `{ options: { "plyoboxes": ["24+Plyobox"] } }`

5. **Sanitize Filter Input** (`sanitizer.util.ts:143-234`):
   - Calls `sanitizeTermsArray(["24+Plyobox"])`
   - `sanitizeTermsArray` checks: `/[+\-=&|!(){}[\]^"~*?:\\]/.test("24+Plyobox")` → `true`
   - **REJECTS** the value (returns empty array)
   - Result: `{ options: { "plyoboxes": [] } }` ❌

6. **Elasticsearch Query** (`products.repository.ts:217-232`):
   - No values to filter by
   - Query returns all products (no filtering applied)

---

## Root Cause Summary

| Issue | Location | Severity | Impact |
|-------|----------|----------|--------|
| Plus sign rejected | `sanitizer.util.ts:52` | 🔴 Critical | Filter values with `+` are silently dropped |
| Quotes removed | `query.helper.ts:32` | 🟡 Medium | Values modified, but acceptable for security |
| Case sensitivity | Multiple | 🟡 Medium | May cause mismatches if ES uses original case |
| No error reporting | `sanitizer.util.ts` | 🟡 Medium | Silent failures, poor UX |
| Double sanitization | Multiple | 🟡 Medium | Inconsistent behavior |

---

## Recommendations

### Priority 1: Fix Plus Sign Rejection

**File:** `app/shared/utils/sanitizer.util.ts`

**Current Code (Line 52):**
```typescript
if (/[+\-=&|!(){}[\]^"~*?:\\]/.test(term)) return false;
```

**Fix:**
Remove `+` from the rejection pattern. The `+` character is valid in product option values.

```typescript
// Remove + from the pattern - it's a valid character in product values
if (/[\-=&|!(){}[\]^"~*?:\\]/.test(term)) return false;
```

**Alternative (More Secure):**
If `+` must be restricted for ES security, escape it instead of rejecting:
```typescript
// Escape + for ES instead of rejecting
term = term.replace(/\+/g, '\\+');
```

---

### Priority 2: Add Logging for Rejected Values

**File:** `app/shared/utils/sanitizer.util.ts`

**Add:**
```typescript
if (/[+\-=&|!(){}[\]^"~*?:\\]/.test(term)) {
  Logger.warn('Filter value rejected due to special characters', { term, filterKey });
  return false;
}
```

---

### Priority 3: Document Quote Removal

**File:** `app/shared/helpers/query.helper.ts`

**Add comment:**
```typescript
/**
 * Sanitize query parameter value - remove dangerous characters
 * 
 * NOTE: Quotes are removed for security. Ensure Elasticsearch index
 * also stores values without quotes for consistent matching.
 */
export function sanitizeQueryValue(value: string): string {
```

---

### Priority 4: Verify Case Normalization in ES

**Action Required:**
- Check if Elasticsearch stores option pairs with original case or normalized case
- If original case: Update mapping to normalize option names
- If normalized case: Ensure all queries use normalized case

**Location to Check:**
- Product indexing code
- Option pair generation: `optionPairs` field format

---

### Priority 5: Unify Sanitization Logic

**Recommendation:**
- Decide on a single sanitization strategy
- Apply it once, not twice
- Document what characters are allowed/rejected and why

**Options:**
1. **Lenient:** Only remove truly dangerous chars (null bytes, control chars, HTML tags)
2. **Strict:** Remove all special chars except alphanumeric, spaces, hyphens, underscores
3. **ES-Safe:** Escape special chars for ES instead of removing them

---

## Test Cases to Verify Fix

1. **Plus Sign:**
   - Query: `options[Plyoboxes]=24"+Plyobox`
   - Expected: Filter applied with value `24+Plyobox` (quote removed, plus preserved)

2. **Quotes:**
   - Query: `options[Size]="Large"`
   - Expected: Filter applied with value `Large` (quotes removed)

3. **Case Sensitivity:**
   - Query: `options[Plyoboxes]=value` vs `options[plyoboxes]=value`
   - Expected: Both should work (case-insensitive matching)

4. **Special Characters:**
   - Query: `options[Color]=Red&Blue`
   - Expected: Should work or be properly escaped

5. **Multiple Values:**
   - Query: `options[Size]=M,L,XL`
   - Expected: All three values filtered

---

## Additional Observations

### From API Response Analysis

Looking at the actual API response:
```json
{
  "appliedFilters": {
    "options": {
      "plyoboxes": ["24 Plyobox"]
    }
  }
}
```

**Observations:**
1. Option name is lowercase: `plyoboxes` ✅ (correct normalization)
2. Value is `24 Plyobox` (quote and plus removed) ❌ (should be `24+Plyobox`)
3. The value was modified, not just sanitized

**This confirms:**
- Quote removal is working (expected)
- Plus sign removal is the issue (unexpected)
- The filter is being applied, but with wrong value

---

## Conclusion

The **primary issue** is that filter values containing `+` are being rejected by `sanitizeTermsArray`. This is a critical bug that prevents legitimate filter values from working.

**Immediate Action Required:**
1. Remove `+` from the rejection pattern in `sanitizeTermsArray`
2. Add logging to track rejected values
3. Test with the provided query parameter
4. Verify Elasticsearch queries are working correctly

**Secondary Actions:**
1. Document quote removal behavior
2. Verify case normalization consistency
3. Consider unifying sanitization logic

---

**End of Audit Report**

