"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Service } from "@prisma/client";
import { Search } from "lucide-react";
import { apiClient } from "@/lib/api-client";

const SIX_DIEU = [
  "Đối với tự mình, phải cần, kiệm, liêm, chính",
  "Đối với đồng sự, phải thân ái giúp đỡ",
  "Đối với Chính phủ, phải tuyệt đối trung thành",
  "Đối với nhân dân, phải kính trọng, lễ phép",
  "Đối với công việc, phải tận tụy",
  "Đối với địch, phải cương quyết, khôn khéo",
];

export function BcaSearchBlock() {
  const [keyword, setKeyword] = useState("");
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const data = await apiClient.get<Service[]>("/api/services");
        setServices(data);
      } catch {
        // Services unavailable
      } finally {
        setIsLoading(false);
      }
    };
    fetchServices();
  }, []);

  const filtered = useMemo(() => {
    if (!keyword.trim()) return [];
    const q = keyword.trim().toLowerCase();
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
    );
  }, [keyword, services]);

  const showResults = keyword.trim().length > 0;

  return (
    <section
      className="relative min-h-[300px] w-full overflow-hidden bg-cover bg-bottom"
      style={{ backgroundImage: "url(/brand/bca/sen.png)" }}
    >
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_1.15fr] lg:items-center">
        {/* 6 Điều Bác Hồ dạy CAND */}
        <div className="rounded-lg border border-bca-red/20 bg-white/90 p-5 shadow-lg backdrop-blur-sm">
          <h4 className="mb-3 text-sm font-bold uppercase tracking-widest text-bca-red">
            6 Điều Bác Hồ dạy Công an nhân dân
          </h4>
          <ul className="space-y-1.5 text-sm text-foreground">
            {SIX_DIEU.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-0.5 text-bca-red">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Search box — BCA red button */}
        <div>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex items-stretch overflow-hidden rounded shadow-lg"
          >
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Nhập tên dịch vụ cần tìm..."
              aria-label="Tìm kiếm dịch vụ"
              className="h-12 flex-1 bg-white px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              className="flex h-12 w-14 shrink-0 items-center justify-center bg-bca-red text-white transition hover:bg-bca-red-dark"
              aria-label="Tìm kiếm"
            >
              <Search className="h-5 w-5" />
            </button>
          </form>

          {/* Search results */}
          {showResults && (
            <div className="mt-3 rounded-lg border border-border bg-white shadow-md">
              {isLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Đang tải...
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Không tìm thấy dịch vụ phù hợp.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map((service) => (
                    <li key={service.id}>
                      <Link
                        href={`/?service=${service.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition hover:bg-bca-red/5"
                      >
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white font-bold text-sm"
                          style={{ backgroundColor: service.color }}
                        >
                          {service.prefix}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {service.name}
                          </p>
                          {service.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {service.description}
                            </p>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
