import { describe, expect, it } from "vitest";
import { estimateWaitTime } from "@/lib/queue-estimate";

describe("ThemeBuilderPanel preview logic", () => {
  it("estimateWaitTime returns 0 minutes when 0 tickets ahead", () => {
    const result = estimateWaitTime(0, 300);
    expect(result).toEqual({ minutes: 0, available: true });
  });

  it("estimateWaitTime returns null when avgServiceTime is null", () => {
    const result = estimateWaitTime(3, null);
    expect(result).toEqual({ minutes: null, available: false });
  });

  it("estimateWaitTime calculates correct minutes for multiple tickets", () => {
    const result = estimateWaitTime(3, 300);
    expect(result).toEqual({ minutes: 15, available: true });
  });

  it("estimateWaitTime rounds up to at least 1 minute", () => {
    const result = estimateWaitTime(1, 30);
    expect(result).toEqual({ minutes: 1, available: true });
  });
});
