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
});
