export type ValidationResult<T> =
    | { ok: true; value: T }
    | { ok: false; response: Response };

export async function readJsonObject(request: Request): Promise<ValidationResult<Record<string, unknown>>> {
    try {
        const body: unknown = await request.json();
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return {
                ok: false,
                response: Response.json(
                    { error: 'Request body phải là JSON object', code: 'INVALID_BODY' },
                    { status: 400 }
                ),
            };
        }
        return { ok: true, value: body as Record<string, unknown> };
    } catch {
        return {
            ok: false,
            response: Response.json(
                { error: 'Request body không hợp lệ', code: 'INVALID_JSON' },
                { status: 400 }
            ),
        };
    }
}

export function requiredStringFields(
    body: Record<string, unknown>,
    fields: string[]
): string[] {
    return fields.filter((field) => typeof body[field] !== 'string' || body[field].trim() === '');
}

export function requiredPositiveInteger(value: unknown): boolean {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

const SAFE_ERROR_MESSAGES: Record<string, string> = {
    'Không còn số thứ tự': 'Không còn số thứ tự nào đang chờ.',
    'Không thể gọi vé': 'Không thể gọi vé — vui lòng thử lại.',
    'Không tìm thấy phiếu yêu cầu': 'Không tìm thấy phiếu yêu cầu.',
    'không ở trạng thái đang phục vụ để hoàn thành': 'Vé không ở trạng thái có thể hoàn thành.',
    'không ở trạng thái đang phục vụ để bỏ qua': 'Vé không ở trạng thái có thể bỏ qua.',
    'Trạng thái vé đã thay đổi': 'Trạng thái vé đã thay đổi, vui lòng thử lại.',
    'Chỉ có thể khôi phục': 'Chỉ có thể khôi phục vé ở trạng thái nhỡ lượt.',
    'Dịch vụ không tồn tại': 'Dịch vụ không tồn tại hoặc đã ngừng hoạt động.',
};

export function sanitizeApiError(error: unknown): { message: string; isClientError: boolean } {
    const rawMessage = error instanceof Error ? error.message : '';

    for (const [pattern, sanitized] of Object.entries(SAFE_ERROR_MESSAGES)) {
        if (rawMessage.includes(pattern)) {
            return { message: sanitized, isClientError: true };
        }
    }

    return { message: 'Đã xảy ra lỗi hệ thống.', isClientError: false };
}

export function sanitizeQueueError(error: unknown): { message: string; isClientError: boolean } {
    return sanitizeApiError(error);
}
