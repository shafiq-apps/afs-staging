import crypto from 'crypto';
import { OTPCode, PINCode } from '@/types/auth';

type AuthStores = {
  otpStore: Map<string, OTPCode>;
  pinStore: Map<string, PINCode>;
};

const globalAuth = globalThis as typeof globalThis & {
  __adminAuthStores__?: AuthStores;
};

// OTP and PIN storage (in-memory, should be moved to Redis in production)
const stores =
  globalAuth.__adminAuthStores__ ?? {
    otpStore: new Map<string, OTPCode>(),
    pinStore: new Map<string, PINCode>(),
  };

globalAuth.__adminAuthStores__ = stores;

const { otpStore, pinStore } = stores;

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const PIN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

export function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export function generatePIN(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// Normalize email to lowercase for consistent storage/retrieval
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function cleanupIfExpired<T extends { expiresAt: number }>(
  store: Map<string, T>,
  key: string,
  expiresAt: number,
  ttlMs: number
): void {
  setTimeout(() => {
    const current = store.get(key);

    // Do not delete if a newer code replaced the old one.
    if (!current || current.expiresAt !== expiresAt) {
      return;
    }

    if (Date.now() >= current.expiresAt) {
      store.delete(key);
    }
  }, ttlMs + 1000);
}

export function storeOTP(email: string, code: string, isSuperAdmin: boolean = false): void {
  const normalizedEmail = normalizeEmail(email);
  const key = `otp:${normalizedEmail}`;
  const record: OTPCode = {
    code,
    email: normalizedEmail,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
    isSuperAdmin,
  };

  otpStore.set(key, record);

  // Clean up expired OTPs safely
  cleanupIfExpired(otpStore, key, record.expiresAt, OTP_EXPIRY_MS);
  
  // Debug logging
  console.log(`[OTP Store] Stored OTP for: ${normalizedEmail}, Code: ${code}, Key: ${key}`);
}

export function verifyOTP(email: string, code: string): { valid: boolean; isSuperAdmin: boolean } {
  const normalizedEmail = normalizeEmail(email);
  const key = `otp:${normalizedEmail}`;
  const stored = otpStore.get(key);
  
  // Debug logging
  console.log(`[OTP Verify] Attempting verification for: ${normalizedEmail}, Key: ${key}`);
  console.log(`[OTP Verify] Stored OTP exists: ${!!stored}`);
  if (stored) {
    console.log(`[OTP Verify] Stored code: ${stored.code}, Provided code: ${code}, Match: ${stored.code === code}`);
    console.log(`[OTP Verify] Expires at: ${new Date(stored.expiresAt).toISOString()}, Now: ${new Date().toISOString()}, Expired: ${Date.now() > stored.expiresAt}`);
    console.log(`[OTP Verify] Attempts: ${stored.attempts}/${MAX_ATTEMPTS}`);
  }

  if (!stored) {
    return { valid: false, isSuperAdmin: false };
  }

  // Check if expired
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(key);
    return { valid: false, isSuperAdmin: false };
  }

  // Check attempts
  if (stored.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(key);
    return { valid: false, isSuperAdmin: false };
  }

  // Verify code
  if (stored.code !== code) {
    stored.attempts++;
    return { valid: false, isSuperAdmin: stored.isSuperAdmin };
  }

  // Valid OTP
  const isSuperAdmin = stored.isSuperAdmin;
  otpStore.delete(key);
  return { valid: true, isSuperAdmin };
}

export function storePIN(email: string, code: string): void {
  const normalizedEmail = normalizeEmail(email);
  const key = `pin:${normalizedEmail}`;
  const record: PINCode = {
    code,
    email: normalizedEmail,
    expiresAt: Date.now() + PIN_EXPIRY_MS,
    attempts: 0,
  };

  pinStore.set(key, record);

  // Clean up expired PINs safely
  cleanupIfExpired(pinStore, key, record.expiresAt, PIN_EXPIRY_MS);
  
  // Debug logging
  console.log(`[PIN Store] Stored PIN for: ${normalizedEmail}, Code: ${code}, Key: ${key}`);
}

export function verifyPIN(email: string, code: string): boolean {
  const normalizedEmail = normalizeEmail(email);
  const key = `pin:${normalizedEmail}`;
  const stored = pinStore.get(key);
  
  // Debug logging
  console.log(`[PIN Verify] Attempting verification for: ${normalizedEmail}, Key: ${key}`);
  console.log(`[PIN Verify] Stored PIN exists: ${!!stored}`);
  if (stored) {
    console.log(`[PIN Verify] Stored code: ${stored.code}, Provided code: ${code}, Match: ${stored.code === code}`);
    console.log(`[PIN Verify] Expires at: ${new Date(stored.expiresAt).toISOString()}, Now: ${new Date().toISOString()}, Expired: ${Date.now() > stored.expiresAt}`);
    console.log(`[PIN Verify] Attempts: ${stored.attempts}/${MAX_ATTEMPTS}`);
  }

  if (!stored) {
    return false;
  }

  // Check if expired
  if (Date.now() > stored.expiresAt) {
    pinStore.delete(key);
    return false;
  }

  // Check attempts
  if (stored.attempts >= MAX_ATTEMPTS) {
    pinStore.delete(key);
    return false;
  }

  // Verify code
  if (stored.code !== code) {
    stored.attempts++;
    return false;
  }

  // Valid PIN
  pinStore.delete(key);
  return true;
}

export function clearOTP(email: string): void {
  const normalizedEmail = normalizeEmail(email);
  otpStore.delete(`otp:${normalizedEmail}`);
}

export function clearPIN(email: string): void {
  const normalizedEmail = normalizeEmail(email);
  pinStore.delete(`pin:${normalizedEmail}`);
}

