"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Service } from "@prisma/client";
import { apiClient } from "@/lib/api-client";

export function BcaCategoryGrid() {
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const data = await apiClient.get<Service[]>("/api/services");
        setServices(data);
      } catch {
        // Services unavailable — show empty state
      } finally {
        setIsLoading(false);
      }
    };
    fetchServices();
  }, []);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center gap-2">
        <span className="h-6 w-1.5 rounded-full bg-bca-red" />
        <h2 className="text-lg font-bold uppercase tracking-wide text-foreground">
          Danh mục thủ tục hành chính
        </h2>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex h-[104px] items-center justify-center rounded-lg border border-border bg-white p-4"
            >
              <div className="h-5 w-24 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : services.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          Hiện chưa có dịch vụ nào đang hoạt động.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {services.map((service) => (
            <Link
              key={service.id}
              href={`/?service=${service.id}`}
              className="group flex h-full min-h-[104px] flex-col items-center justify-center gap-3 rounded-lg border border-border bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-bca-red/50 hover:shadow-md"
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full text-white font-bold text-lg"
                style={{ backgroundColor: service.color }}
              >
                {service.prefix}
              </div>
              <p className="text-sm font-medium leading-snug text-foreground group-hover:text-bca-red">
                {service.name}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
