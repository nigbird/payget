/**
 * A robust JSON parser that handles common issues in non-standard provider responses,
 * such as literal control characters (newlines, tabs) inside string literals.
 */
export function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch (e: any) {
    if (e instanceof SyntaxError && (e.message.includes('control character') || e.message.includes('Bad control character'))) {
      // If JSON.parse fails because of control characters, it usually means 
      // there are literal newlines or tabs inside a string literal.
      // We attempt to escape them and try again.
      
      // This regex matches JSON string literals correctly, including escaped quotes.
      // We then replace literal control characters within those strings.
      const fixedText = text.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
        return match.replace(/[\x00-\x1F]/g, (char) => {
          switch (char) {
            case '\n': return '\\n';
            case '\r': return '\\r';
            case '\t': return '\\t';
            case '\b': return '\\b';
            case '\f': return '\\f';
            default: return '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');
          }
        });
      });
      
      try {
        return JSON.parse(fixedText);
      } catch (secondError: any) {
        // If it still fails, we'll log both the original error and the fixed text
        console.error('Failed to parse JSON even after escaping control characters.', {
          originalError: e.message,
          retryError: secondError.message,
          rawText: text,
          fixedText: fixedText
        });
        throw secondError;
      }
    }
    
    // For other syntax errors, we just re-throw
    throw e;
  }
}
