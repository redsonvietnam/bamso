import { describe, expect, it } from "vitest";

const MODE_SHORT_LABELS: Record<string, string> = {
    quick: 'Nhanh',
    manual: 'Thủ công',
    qr: 'QR',
};

function getModeLabel(mode: string): string {
    return MODE_SHORT_LABELS[mode] || mode;
}

function parseModes(modes: string[] | null | undefined): string[] {
    if (!modes || !Array.isArray(modes) || modes.length === 0) {
        return [];
    }
    return modes;
}

describe("ServicesPanel mode display logic", () => {
    it("displays quick mode label", () => {
        expect(getModeLabel("quick")).toBe("Nhanh");
    });

    it("displays manual mode label", () => {
        expect(getModeLabel("manual")).toBe("Thủ công");
    });

    it("displays QR mode label", () => {
        expect(getModeLabel("qr")).toBe("QR");
    });

    it("handles multiple modes", () => {
        const modes = ["quick", "manual", "qr"];
        const parsed = parseModes(modes);
        expect(parsed).toEqual(["quick", "manual", "qr"]);
        expect(parsed.map(getModeLabel)).toEqual(["Nhanh", "Thủ công", "QR"]);
    });

    it("handles empty modes gracefully", () => {
        expect(parseModes(null)).toEqual([]);
        expect(parseModes(undefined)).toEqual([]);
        expect(parseModes([])).toEqual([]);
    });

    it("handles unknown mode gracefully", () => {
        expect(getModeLabel("unknown")).toBe("unknown");
    });
});
