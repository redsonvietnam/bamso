import { describe, it, expect } from 'vitest';
import { parseCCCDName, parseFullCCCDData } from '../cccd-parser';

describe('cccd-parser', () => {
    const validQr = '012345678901|NGUYỄN VĂN A|01011990|Nam|Việt Nam|01012021';
    const validQrWithSpaces = ' 012345678901 | NGUYỄN VĂN A | 01011990 | Nam | Việt Nam | 01012021 ';

    describe('parseCCCDName', () => {
        it('should return the correct full name from a valid QR string', () => {
            expect(parseCCCDName(validQr)).toBe('NGUYỄN VĂN A');
        });

        it('should handle extra spaces in the QR string', () => {
            expect(parseCCCDName(validQrWithSpaces)).toBe('NGUYỄN VĂN A');
        });

        it('should return null if the string is empty', () => {
            expect(parseCCCDName('')).toBeNull();
        });

        it('should return null if the string is null or undefined', () => {
            // @ts-expect-error: Testing null/undefined handling
            expect(parseCCCDName(null)).toBeNull();
            // @ts-expect-error: Testing null/undefined handling
            expect(parseCCCDName(undefined)).toBeNull();
        });



        it('should return null if the format is invalid (not enough parts)', () => {
            expect(parseCCCDName('012345678901|NGUYỄN VĂN A')).toBeNull();
        });

        it('should return null if the name field is empty', () => {
            expect(parseCCCDName('012345678901||01011990|Nam|Việt Nam|01012021')).toBeNull();
        });
    });

    describe('parseFullCCCDData', () => {
        it('should return the full structured data from a valid QR string', () => {
            const expected = {
                idNumber: '012345678901',
                fullName: 'NGUYỄN VĂN A',
                dateOfBirth: '01011990',
                gender: 'Nam',
                nationality: 'Việt Nam',
                issueDate: '01012021',
            };
            expect(parseFullCCCDData(validQr)).toEqual(expected);
        });

        it('should return null if the format is invalid', () => {
            expect(parseFullCCCDData('invalid-string')).toBeNull();
        });

        it('should return null if the string is empty', () => {
            expect(parseFullCCCDData('')).toBeNull();
        });
    });
});
