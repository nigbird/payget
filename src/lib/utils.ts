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
 * Validates an email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates an Ethiopian phone number format after normalization
 */
export function isValidPhoneNumber(phone: string): boolean {
  // Normalized format should be +251 followed by 9 digits (9 or 7)
  const normalized = normalizePhoneNumber(phone);
  return /^\+251[79]\d{8}$/.test(normalized);
}
