export type StatsCsvData = {
    summary: {
        total: number;
        completed: number;
        missed: number;
        pending: number;
        active: number;
        avgWaitTimeSeconds: number;
    };
    hourly: { hour: string; count: number }[];
    peakHours?: { hour: string; count: number }[];
    services: { name: string; code: string; total: number; completed: number; pending: number }[];
};

export function neutralizeFormulaPrefix(value: string): string {
    if (/^[=+\-@]/.test(value)) {
        return `'${value}`;
    }
    return value;
}

export function escapeCsvField(value: string): string {
    const safe = neutralizeFormulaPrefix(value);
    if (/[",\n\r]/.test(safe)) {
        return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
}

export function buildStatsCsv(stats: StatsCsvData, periodLabel: string): string {
    const rows: string[] = [];
    rows.push('Thống kê vé');
    rows.push(`Kỳ: ${escapeCsvField(periodLabel)}`);
    rows.push('');

    rows.push('Tóm tắt:');
    rows.push('Tổng số,Hoàn thành,Đang chờ,Đang phục vụ,Nhỡ lượt,Chờ TB (giây)');
    rows.push(`${stats.summary.total},${stats.summary.completed},${stats.summary.pending},${stats.summary.active},${stats.summary.missed},${stats.summary.avgWaitTimeSeconds}`);
    rows.push('');

    rows.push('Vé theo giờ:');
    rows.push('Giờ,Số lượng');
    for (const h of stats.hourly) {
        rows.push(`${escapeCsvField(h.hour)},${h.count}`);
    }
    rows.push('');

    rows.push('Giờ cao điểm:');
    rows.push('Giờ,Số lượng');
    for (const p of stats.peakHours ?? []) {
        rows.push(`${escapeCsvField(p.hour)},${p.count}`);
    }
    rows.push('');

    rows.push('Chi tiết theo dịch vụ:');
    rows.push('Dịch vụ,Mã,Tổng,Hoàn thành,Đang chờ,Tỷ lệ hoàn thành');
    for (const s of stats.services) {
        const completionRate = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
        rows.push(`${escapeCsvField(s.name)},${escapeCsvField(s.code)},${s.total},${s.completed},${s.pending},${completionRate}%`);
    }

    return `\uFEFF${rows.join('\n')}`;
}
