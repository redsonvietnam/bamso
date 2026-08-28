import { describe, expect, it } from 'vitest';
import { buildStatsCsv, escapeCsvField, StatsCsvData } from '../stats-csv';

const baseData: StatsCsvData = {
    summary: { total: 10, completed: 7, missed: 1, pending: 2, active: 0, avgWaitTimeSeconds: 120 },
    hourly: [{ hour: '08:00', count: 10 }],
    peakHours: [{ hour: '08:00', count: 10 }],
    services: [{ name: 'Dịch vụ A', code: 'A', total: 10, completed: 7, pending: 2 }],
};

describe('escapeCsvField', () => {
    it('returns plain value unchanged', () => {
        expect(escapeCsvField('Dịch vụ A')).toBe('Dịch vụ A');
    });

    it('quotes field containing comma', () => {
        expect(escapeCsvField('A,B')).toBe('"A,B"');
    });

    it('escapes double quotes by doubling and quoting', () => {
        expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""');
    });

    it('quotes field containing newline', () => {
        expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('neutralizes formula prefix = with leading apostrophe', () => {
        expect(escapeCsvField('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    });

    it('neutralizes formula prefix + with leading apostrophe', () => {
        expect(escapeCsvField('+cmd')).toBe("'+cmd");
    });

    it('neutralizes formula prefix - with leading apostrophe', () => {
        expect(escapeCsvField('-cmd')).toBe("'-cmd");
    });

    it('neutralizes formula prefix @ with leading apostrophe', () => {
        expect(escapeCsvField('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
    });

    it('does not alter normal values', () => {
        expect(escapeCsvField('abc')).toBe('abc');
    });

    it('quotes field with comma and neutralizes formula prefix', () => {
        expect(escapeCsvField('=A,B')).toBe('"\'=A,B"');
    });

    it('handles Vietnamese Unicode normally', () => {
        expect(escapeCsvField('Tiếng Việt Đà Nẵng')).toBe('Tiếng Việt Đà Nẵng');
    });

    it('escapes double quotes and neutralizes formula prefix', () => {
        expect(escapeCsvField('="hi"')).toBe('"\'=""hi"""');
    });
});

describe('buildStatsCsv', () => {
    it('starts with UTF-8 BOM', () => {
        const csv = buildStatsCsv(baseData, '2026-01-01');
        expect(csv.charCodeAt(0)).toBe(0xfeff);
    });

    it('escapes service name containing comma and quote', () => {
        const csv = buildStatsCsv(
            { ...baseData, services: [{ name: 'Dịch, "A"', code: 'A', total: 1, completed: 0, pending: 1 }] },
            'kỳ'
        );
        expect(csv).toContain('"Dịch, ""A"""');
    });

    it('contains summary, hourly, peak hours and service sections', () => {
        const csv = buildStatsCsv(baseData, '2026-01-01 → 2026-01-31');
        expect(csv).toContain('Tóm tắt:');
        expect(csv).toContain('Vé theo giờ:');
        expect(csv).toContain('Giờ cao điểm:');
        expect(csv).toContain('Chi tiết theo dịch vụ:');
        expect(csv).toContain('Dịch vụ A,A,10,7,2,70%');
    });

    it('neutralizes formula-injected service name and code in CSV output', () => {
        const csv = buildStatsCsv(
            {
                ...baseData,
                services: [{ name: '=SUM(A1:A2)', code: '+cmd', total: 1, completed: 0, pending: 1 }],
            },
            'kỳ'
        );
        expect(csv).toContain("'=SUM(A1:A2),'+cmd,1,0,1,0%");
        expect(csv).not.toContain('=SUM(A1:A2),+cmd');
    });
});
