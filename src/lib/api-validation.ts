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
