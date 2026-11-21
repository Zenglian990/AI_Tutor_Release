/**
 * Sanitize and validate names, instructions, etc.
 * Fixes injection bypass by removing spaces and checking before truncating.
 */
function sanitizeName(str, fallback) {
    if (!str) return fallback;
    
    // First remove invalid characters
    let clean = String(str).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_\- ]/g, '');
    
    // Check for injection keywords BEFORE truncating, also checking stripped-space version to avoid space-insertion bypass
    const condensed = clean.replace(/[\s_\-]+/g, '').toLowerCase();
    const injectionPatterns = /(ignore|prompt|instruction|system|forget|bypass|override|disregard|jailbreak)/i;
    
    if (injectionPatterns.test(clean) || injectionPatterns.test(condensed)) {
        return fallback;
    }
    
    // Finally truncate to 15 characters
    clean = clean.slice(0, 15).trim();
    
    return clean || fallback;
}

module.exports = {
    sanitizeName
};
