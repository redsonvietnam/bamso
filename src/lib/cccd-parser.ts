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

    // Split the string by the pipe '|' delimiter
    const parts = qrString.split('|');

    // A valid CCCD QR code should have exactly 6 parts
    if (parts.length === 6) {
        const fullName = parts[1].trim();
        return fullName || null;
    }

    return null;
}

/**
 * Parses the entire CCCD QR code string into a structured object.
 * Useful for internal testing or if more information is needed in the future,
 * though for privacy reasons, we primarily use the name.
 * 
 * @param qrString The raw string content from the QR code.
 * @returns An object containing the extracted fields, or null if invalid.
 */
export function parseFullCCCDData(qrString: string) {
    if (!qrString) return null;

    const parts = qrString.split('|');

    if (parts.length === 6) {
        return {
            idNumber: parts[0].trim(),
            fullName: parts[1].trim(),
            dateOfBirth: parts[2].trim(),
            gender: parts[3].trim(),
            nationality: parts[4].trim(),
            issueDate: parts[5].trim(),
        };
    }

    return null;
}
