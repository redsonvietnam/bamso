/**
 * Parses a CCCD (Vietnamese Citizen ID) QR code string to extract the full name.
 * 
 * The current CCCD QR format is:
 * [ID_NUMBER]|[OLD_ID_NUMBER]|[FULL_NAME]|[DATE_OF_BIRTH]|[GENDER]|[ADDRESS]|[ISSUE_DATE]
 *
 * Some older payloads omit OLD_ID_NUMBER and use the legacy format:
 * [ID_NUMBER]|[FULL_NAME]|[DATE_OF_BIRTH]|[GENDER]|[ADDRESS]|[ISSUE_DATE]
 * 
 * Example:
 * 012345678901|NGUYỄN VĂN A|01011990|Nam|Việt Nam|01012021
 * 
 * @param qrString The raw string content from the QR code.
 * @returns The extracted full name, or null if the format is invalid or name not found.
 */
function parseCCCDFields(qrString: string): string[] | null {
    if (typeof qrString !== 'string') return null;

    const normalized = qrString.trim();
    if (!normalized) return null;

    const parts = normalized.split('|').map((part) => part.trim());
    const hasCurrentFormat = parts.length >= 7;
    const hasLegacyFormat = parts.length >= 6;
    const idNumber = parts[0] ?? '';

    // A CCCD number is twelve digits. This prevents malformed payloads from
    // being treated as a customer's name.
    if ((!hasCurrentFormat && !hasLegacyFormat) || !/^\d{12}$/.test(idNumber)) return null;

    return parts;
}

function getNameField(parts: string[]): string | null {
    const fullName = parts.length >= 7 ? parts[2] : parts[1];
    return fullName || null;
}

export function parseCCCDName(qrString: string): string | null {
    const parts = parseCCCDFields(qrString);
    return parts ? getNameField(parts) : null;
}

export function parseFullCCCDData(qrString: string) {
    const parts = parseCCCDFields(qrString);
    if (!parts) return null;

    const nameIndex = parts.length >= 7 ? 2 : 1;
    return {
        idNumber: parts[0] || '',
        fullName: parts[nameIndex] || '',
        dateOfBirth: parts[nameIndex + 1] || '',
        gender: parts[nameIndex + 2] || '',
        nationality: parts[nameIndex + 3] || '',
        issueDate: parts[nameIndex + 4] || '',
    };
}
