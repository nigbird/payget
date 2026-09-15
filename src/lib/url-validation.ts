import { isObviouslyUnsafeCallbackHost } from '@/lib/ip-guard'

export const URL_VALIDATION = {
  website: { maxLength: 255 },
  callback: { maxLength: 2048 }
} as const

const ALLOWED_PROTOCOLS = ['https:', 'http:']

export function validateUrl(
  url: string, 
  type: 'website' | 'callback'
): { valid: true } | { valid: false; error: string } {
  const trimmedUrl = url.trim()
  
  if (!trimmedUrl) {
    return { valid: true }
  }

  const { maxLength } = URL_VALIDATION[type]
  
  if (trimmedUrl.length > maxLength) {
    return { 
      valid: false, 
      error: `URL must be at most ${maxLength} characters long` 
    }
  }

  try {
    const parsedUrl = new URL(trimmedUrl)
    
    if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
      return {
        valid: false,
        error: 'URL must start with https:// or http://'
      }
    }

    // The server delivers webhook requests to this URL, so reject anything
    // that's obviously a loopback/private/link-local address up front. The
    // authoritative check — covering hostnames that merely *resolve* to such
    // an address — happens at delivery time (see src/lib/ssrf-guard.ts).
    if (type === 'callback' && isObviouslyUnsafeCallbackHost(parsedUrl.hostname)) {
      return {
        valid: false,
        error: 'Callback URL must not point to a local or private address'
      }
    }

    return { valid: true }
  } catch {
    return { 
      valid: false, 
      error: 'Please enter a valid URL' 
    }
  }
}
