/**
 * Sanitize and validate names, instructions, etc.
 * Fixes injection bypass by removing spaces and checking before truncating.
 */
function sanitizeName(str, fallback) {
    if (!str) return fallback;
    
    // First remove spaces and invalid characters
    let clean = String(str).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_\- ]/g, '');
    
    // Check for injection keywords BEFORE truncating
    if (/ignore|prompt|instruction|system|forget|bypass|override/i.test(clean)) {
        return fallback;
    }
    
    // Finally truncate to 15 characters
    clean = clean.slice(0, 15);
    
    return clean || fallback;
}

module.exports = {
    sanitizeName
};
