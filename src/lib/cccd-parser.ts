/**
 * Parses a CCCD (Vietnamese Citizen ID) QR code string to extract the full name.
 * 
 * The expected format of the QR code string is:
 * [ID_NUMBER]|[FULL_NAME]|[DATE_OF_BIRTH]|[GENDER]|[NATIONALITY]|[ISSUE_DATE]
 * 
 * Example:
 * 012345678901|NGUYỄN VĂN A|01011990|Nam|Việt Nam|01012021
 * 
 * @param qrString The raw string content from the QR code.
 * @returns The extracted full name, or null if the format is invalid or name not found.
 */
export function parseCCCDName(qrString: string): string | null {
    if (!qrString) return null;

    const parts = qrString.split('|');

    if (parts.length >= 3) {
        const fullName = parts[1].trim();
        return fullName || null;
    }

    return null;
}

export function parseFullCCCDData(qrString: string) {
    if (!qrString) return null;

    const parts = qrString.split('|');

    if (parts.length >= 3) {
        return {
            idNumber: parts[0]?.trim() || '',
            fullName: parts[1]?.trim() || '',
            dateOfBirth: parts[2]?.trim() || '',
            gender: parts[3]?.trim() || '',
            nationality: parts[4]?.trim() || '',
            issueDate: parts[5]?.trim() || '',
        };
    }

    return null;
}
