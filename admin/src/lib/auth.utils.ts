import crypto from 'crypto';
import { OTPCode, PINCode } from '@/types/auth';

// OTP and PIN storage (in-memory, should be moved to Redis in production)
const otpStore = new Map<string, OTPCode>();
const pinStore = new Map<string, PINCode>();

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const PIN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

export function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export function generatePIN(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export function storeOTP(email: string, code: string, isSuperAdmin: boolean = false): void {
  const key = `otp:${email}`;
  otpStore.set(key, {
    code,
    email,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
    isSuperAdmin,
  });

  // Clean up expired OTPs
  setTimeout(() => {
    otpStore.delete(key);
  }, OTP_EXPIRY_MS);
}

export function verifyOTP(email: string, code: string): { valid: boolean; isSuperAdmin: boolean } {
  const key = `otp:${email}`;
  const stored = otpStore.get(key);

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
  const key = `pin:${email}`;
  pinStore.set(key, {
    code,
    email,
    expiresAt: Date.now() + PIN_EXPIRY_MS,
    attempts: 0,
  });

  // Clean up expired PINs
  setTimeout(() => {
    pinStore.delete(key);
  }, PIN_EXPIRY_MS);
}

export function verifyPIN(email: string, code: string): boolean {
  const key = `pin:${email}`;
  const stored = pinStore.get(key);

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
  otpStore.delete(`otp:${email}`);
}

export function clearPIN(email: string): void {
  pinStore.delete(`pin:${email}`);
}

