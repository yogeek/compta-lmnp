import { describe, it, expect } from "vitest";

describe("API module", () => {
  it("fiscalApi.exportPdf returns correct URL", async () => {
    const { fiscalApi } = await import("../../src/lib/api");
    const url = fiscalApi.exportPdf(1, 2025, "2031");
    expect(url).toContain("/api/fiscal/export/pdf/1/2025/2031");
  });

  it("fiscalApi.exportZip returns correct URL", async () => {
    const { fiscalApi } = await import("../../src/lib/api");
    const url = fiscalApi.exportZip(1, 2025);
    expect(url).toContain("/api/fiscal/export/zip/1/2025");
  });
});
