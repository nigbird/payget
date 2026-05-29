import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalizes an Ethiopian phone number to +251XXXXXXXXX format
 * Supports: +251 9..., +251 09..., 09.... 07...,+251 7...., 25107.....
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');
  
  // Remove 251 prefix if present
  if (digits.startsWith('251')) {
    digits = digits.substring(3);
  }
  
  // Remove leading 0 if present
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  
  // Standardize to +251 followed by the 9 digits
  return '+251' + digits;
}

/**
 * Validates a name (at least 2 characters, max 50 characters)
 */
export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 50;
}

/**
 * Validates an email (max 50 characters)
 */
/**
 * Masks an email address for logging (e.g. u***r@example.com)
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Masks a phone number for logging (e.g. +251*******89)
 */
export function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****';
  return `${phone.slice(0, 4)}*******${phone.slice(-2)}`;
}

/**
 * Masks a general identifier (email or phone)
 */
export function maskIdentifier(identifier: string): string {
  if (isValidEmail(identifier)) return maskEmail(identifier);
  if (isValidPhoneNumber(identifier)) return maskPhone(identifier);
  return '***';
}

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length > 50) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}

/**
 * Validates an Ethiopian phone number format
 * Valid formats:
 * - +2519XXXXXXXXX (13 digits total: +251 followed by 9 digits including 9)
 * - 2519XXXXXXXXX (12 digits total: 251 followed by 9 digits including 9)
 * - 09XXXXXXXX (10 digits: 09 followed by 8 digits)
 * - 9XXXXXXXX (9 digits: 9 followed by 8 digits)
 */
export function isValidPhoneNumber(phone: string): boolean {
  const cleaned = phone.trim();
  const normalized = cleaned.replace(/[\s\-()]/g, '');

  if (/^\+2519\d{8}$/.test(normalized)) {
    return true
  }

  if (/^2519\d{8}$/.test(normalized)) {
    return true
  }

  if (/^09\d{8}$/.test(normalized)) {
    return true
  }

  if (/^9\d{8}$/.test(normalized)) {
    return true
  }

  return false
}
