/**
 * Xác định xem cookie auth_token có cần set `secure` không.
 * Chỉ secure khi chạy production VÀ request thực sự đi qua HTTPS
 * (x-forwarded-proto do proxy/LB set). Dùng chung cho mọi route set/clear cookie.
 */
export function isSecureCookie(request: Request): boolean {
    return process.env.NODE_ENV === 'production' && request.headers.get('x-forwarded-proto') === 'https';
}
