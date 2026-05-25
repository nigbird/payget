/**
 * File Upload Security Validation
 * Implements strict allowlist for permitted file types and blocklist for dangerous types
 */

/**
 * Dangerous file extensions that should never be allowed
 * Includes executables, scripts, launchers, and potentially dangerous documents
 */
const DANGEROUS_EXTENSIONS = [
  // Executables
  '.exe', '.bat', '.sh', '.com', '.msi', '.app', '.dmg', '.scr', '.pif', '.cmd',
  // Scripts & Interpreted Languages
  '.js', '.vbs', '.asp', '.jsp', '.php', '.pl', '.py', '.rb', '.go', '.ts',
  '.jsx', '.tsx', '.coffee', '.groovy', '.lua',
  // Launchers & Shortcuts
  '.lnk', '.url', '.desktop', '.ini', '.config',
  // Macro-enabled Office Documents
  '.docm', '.xlsm', '.pptm', '.xlam', '.potm',
  // Archives (can contain executables - context dependent)
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.iso', '.dmg',
  // Library Files
  '.dll', '.so', '.dylib', '.lib',
  // Object/Compiled Files
  '.obj', '.o', '.class', '.pyc',
]

/**
 * Checks if a file extension is on the dangerous extensions blocklist
 * @param ext File extension (with or without leading dot)
 * @returns true if extension is dangerous
 */
export function isDangerousExtension(ext: string): boolean {
  const normalized = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
  return DANGEROUS_EXTENSIONS.includes(normalized)
}

/**
 * Validates a list of file extensions against the dangerous extensions blocklist
 * @param types Array of file extensions (e.g., ['.pdf', '.jpg', '.png'])
 * @returns Object with validation result and list of dangerous extensions
 */
export function validateAllowedFileTypes(
  types: string[]
): {
  valid: boolean
  dangerous: string[]
  invalidFormat: string[]
} {
  const dangerous = types.filter(t => isDangerousExtension(t))
  const invalidFormat = types.filter(
    t => !t.startsWith('.') || t.length < 2 || !t.match(/^.[a-zA-Z0-9]+$/)
  )

  return {
    valid: dangerous.length === 0 && invalidFormat.length === 0,
    dangerous,
    invalidFormat,
  }
}

/**
 * Extracts and validates file extension from filename
 * @param filename Original filename
 * @returns Lowercase extension with leading dot, or empty string if no extension
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.')
  if (parts.length < 2) return ''
  return `.${parts.pop()!.toLowerCase()}`
}

/**
 * Extracts ALL extensions from filename (for double/triple extension check)
 * @param filename Original filename
 * @returns Array of all extensions with leading dots (lowercase)
 */
export function getAllExtensions(filename: string): string[] {
  const parts = filename.split('.')
  if (parts.length < 2) return []
  const extensions: string[] = []
  for (let i = 1; i < parts.length; i++) {
    extensions.push(`.${parts[i].toLowerCase()}`)
  }
  return extensions
}

/**
 * Checks if filename contains ANY dangerous extension anywhere in the name
 * @param filename Original filename
 * @returns true if any dangerous extension is found
 */
export function hasAnyDangerousExtension(filename: string): boolean {
  const allExtensions = getAllExtensions(filename)
  return allExtensions.some(ext => isDangerousExtension(ext))
}

/**
 * Validates that filename extension matches the detected file type extension
 * Prevents mismatched extensions (e.g., .exe disguised as .jpg)
 * @param filename Original filename
 * @param detectedExtension File type detected from magic numbers (e.g., 'png')
 * @returns true if extensions match
 */
export function extensionsMatch(filename: string, detectedExtension: string): boolean {
  const filenameExt = getFileExtension(filename)
  const detectedExt = `.${detectedExtension.toLowerCase()}`
  return filenameExt === detectedExt
}

/**
 * Comprehensive file validation
 * Checks extension against allowed list and dangerous blocklist
 * @param filename Original filename
 * @param mimeType Declared MIME type
 * @param allowedMimeTypes Mapping of allowed MIME types to extensions
 * @returns Validation result
 */
export function validateFileUpload(
  filename: string,
  mimeType: string,
  allowedMimeTypes: Record<string, string>
): {
  valid: boolean
  error?: string
  extension?: string
} {
  // Check MIME type is in allowlist
  const extension = allowedMimeTypes[mimeType]
  if (!extension) {
    return {
      valid: false,
      error: `Unsupported MIME type: ${mimeType}`,
    }
  }

  // Check extension is not dangerous
  if (isDangerousExtension(`.${extension}`)) {
    return {
      valid: false,
      error: `File type not permitted: .${extension}`,
    }
  }

  // Check for ANY dangerous extension anywhere in filename (double/triple extension check)
  if (hasAnyDangerousExtension(filename)) {
    return {
      valid: false,
      error: 'File contains dangerous extensions',
    }
  }

  // Check filename extension matches
  const filenameExt = getFileExtension(filename)
  if (filenameExt && !extensionsMatch(filename, extension)) {
    return {
      valid: false,
      error: 'File extension does not match file type',
    }
  }

  // Check filename extension isn't dangerous
  if (filenameExt && isDangerousExtension(filenameExt)) {
    return {
      valid: false,
      error: 'File extension not permitted',
    }
  }

  return {
    valid: true,
    extension,
  }
}

/**
 * List all dangerous extensions (useful for documentation/UI)
 */
export function getDangerousExtensionsList(): string[] {
  return [...DANGEROUS_EXTENSIONS]
}

/**
 * Sanitizes user input for allowed file types
 * Normalizes formatting and validates against blocklist
 * @param input Comma-separated extensions (e.g., ".pdf, .jpg, .png")
 * @returns Normalized array of valid extensions or null if contains dangerous types
 */
export function sanitizeAllowedFileTypes(input: string): string[] | null {
  const types = input
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)

  const { valid, dangerous, invalidFormat } = validateAllowedFileTypes(types)

  if (!valid) {
    // Return null to indicate validation failed
    return null
  }

  return types
}
