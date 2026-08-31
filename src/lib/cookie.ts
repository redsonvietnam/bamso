/**
 * Xác định xem cookie auth_token có cần set `secure` không.
 *
 * In production, cookies are secure when:
 * - Running behind a proxy with x-forwarded-proto: https, OR
 * - Running with direct HTTPS (server.js on port 3443)
 *
 * For direct HTTPS, we check the request URL protocol or
 * the presence of the HTTPS server environment.
 */
export function isSecureCookie(request: Request): boolean {
    if (process.env.NODE_ENV !== 'production') return false;

    // Behind proxy with x-forwarded-proto header
    if (request.headers.get('x-forwarded-proto') === 'https') return true;

    // Direct HTTPS: check request URL
    const url = new URL(request.url);
    if (url.protocol === 'https:') return true;

    // Direct HTTPS: check if HTTPS_PORT is configured (server.js mode)
    if (process.env.HTTPS_PORT || process.env.HTTPS_PFX_PATH) return true;

    return false;
}
