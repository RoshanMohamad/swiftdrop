import { describe, expect, it } from "@jest/globals";
import pino from "pino";
import { REDACT_PATHS } from "../src/shared/logger.js";

function capture(payload: Record<string, unknown>) {
  const lines: string[] = [];
  const logger = pino(
    { redact: { paths: REDACT_PATHS, censor: "[REDACTED]" } },
    { write: (line: string) => void lines.push(line) },
  );
  logger.info(payload, "test");
  return lines.join("");
}

describe("logger redaction (CLAUDE.md: password, phone, address, authorization)", () => {
  const sensitive = {
    password: "hunter2-secret",
    authorization: "Bearer abc.def.ghi",
    phone: "+94771234567",
    address: "12 Temple Road, Kandy",
    recipientAddress: "12 Temple Road, Kandy",
    recipientPhone: "+94771234568",
    recipientName: "Kamal Perera",
    pickupAddress: "5 Galle Road, Colombo 03",
    pickupContactName: "Nimal Silva",
    pickupContactPhone: "+94711112222",
  };

  it("redacts every sensitive key at the top level", () => {
    const output = capture({ ...sensitive, keep: "visible-value" });
    for (const value of Object.values(sensitive))
      expect(output).not.toContain(value);
    expect(output).toContain("visible-value");
    expect(output).toContain("[REDACTED]");
  });

  it("redacts them one level down, such as inside a parcel or request object", () => {
    const output = capture({ parcel: sensitive, keep: "visible-value" });
    for (const value of Object.values(sensitive))
      expect(output).not.toContain(value);
    expect(output).toContain("visible-value");
  });
});
