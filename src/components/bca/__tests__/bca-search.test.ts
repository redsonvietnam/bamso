import { describe, expect, it } from "vitest";

interface Service {
  id: string;
  code: string;
  name: string;
  description: string | null;
  color: string;
  prefix: string;
  order: number;
  isActive: boolean;
  allowedModes: string[];
}

function filterServices(services: Service[], keyword: string): Service[] {
  if (!keyword.trim()) return [];
  const q = keyword.trim().toLowerCase();
  return services.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q))
  );
}

function findServiceById(services: Service[], id: string): Service | undefined {
  return services.find((s) => s.id === id);
}

const MOCK_SERVICES: Service[] = [
  {
    id: "svc-1",
    code: "A",
    name: "Dịch vụ A",
    description: "Dịch vụ ưu tiên",
    color: "#FF5733",
    prefix: "A",
    order: 1,
    isActive: true,
    allowedModes: ["quick", "manual", "qr"],
  },
  {
    id: "svc-2",
    code: "B",
    name: "Dịch vụ B",
    description: "Dịch vụ thông thường",
    color: "#337AFF",
    prefix: "B",
    order: 2,
    isActive: true,
    allowedModes: ["quick"],
  },
];

describe("BCA search — filterServices", () => {
  it("returns empty array for empty keyword", () => {
    expect(filterServices(MOCK_SERVICES, "")).toEqual([]);
    expect(filterServices(MOCK_SERVICES, "   ")).toEqual([]);
  });

  it("filters by service name", () => {
    const result = filterServices(MOCK_SERVICES, "Dịch vụ A");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("svc-1");
  });

  it("filters by service code", () => {
    const result = filterServices(MOCK_SERVICES, "B");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("svc-2");
  });

  it("filters by description", () => {
    const result = filterServices(MOCK_SERVICES, "ưu tiên");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("svc-1");
  });

  it("is case-insensitive", () => {
    const result = filterServices(MOCK_SERVICES, "dịch vụ");
    expect(result).toHaveLength(2);
  });

  it("returns empty for no match", () => {
    const result = filterServices(MOCK_SERVICES, "xyz");
    expect(result).toHaveLength(0);
  });

  it("matches partial keywords", () => {
    const result = filterServices(MOCK_SERVICES, "thôn");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("svc-2");
  });
});

describe("BCA search — findServiceById", () => {
  it("finds existing service", () => {
    const result = findServiceById(MOCK_SERVICES, "svc-1");
    expect(result).toBeDefined();
    expect(result?.name).toBe("Dịch vụ A");
  });

  it("returns undefined for non-existent id", () => {
    const result = findServiceById(MOCK_SERVICES, "nonexistent");
    expect(result).toBeUndefined();
  });
});
