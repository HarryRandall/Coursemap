import { describe, expect, it } from "vitest";
import {
  parseSeltReportStatus,
  remainingLabel,
  seltReportChecks,
  seltTokenHandle,
  seltTokenState,
} from "../lib/selt/admin-format";

const NOW = new Date("2026-10-07T00:00:00Z");

describe("SELT admin formatting", () => {
  it("reads token state from revocation first, then expiry", () => {
    expect(
      seltTokenState(
        {
          expiresAt: "2026-10-07T09:30:00Z",
          revokedAt: "2026-10-06T00:00:00Z",
        },
        NOW,
      ),
    ).toEqual({ kind: "revoked" });
    expect(
      seltTokenState(
        { expiresAt: "2026-10-06T23:59:00Z", revokedAt: null },
        NOW,
      ),
    ).toEqual({ kind: "expired" });
    expect(
      seltTokenState(
        { expiresAt: "2026-10-07T09:30:00Z", revokedAt: null },
        NOW,
      ),
    ).toEqual({ kind: "active", remainingMs: 34_200_000 });
  });

  it("rounds remaining time down", () => {
    expect(remainingLabel(34_200_000)).toBe("9 h left");
    expect(remainingLabel(25 * 60_000 + 59_000)).toBe("25 min left");
    expect(remainingLabel(10_000)).toBe("1 min left");
  });

  it("masks tokens by the end of their run id", () => {
    expect(seltTokenHandle("0b7e2d1c-1111-4222-8333-44445555abcd")).toBe(
      "selt_••••abcd",
    );
  });

  it("accepts only known report statuses", () => {
    expect(parseSeltReportStatus("ready")).toBe("ready");
    expect(parseSeltReportStatus("drafts")).toBeNull();
    expect(parseSeltReportStatus(undefined)).toBeNull();
  });

  it("checks counts, rates, duplicates and warnings", () => {
    const survey = {
      label: "Sem 1 2025",
      enrolments: 142,
      respondents: 38,
      response_rate_percent: 27,
    };
    expect(seltReportChecks([survey], []).every((check) => check.passed)).toBe(
      true,
    );
    const failed = seltReportChecks(
      [
        survey,
        { ...survey, respondents: 150 },
        { ...survey, label: "Sem 2 2025", response_rate_percent: 40 },
      ],
      ["Chart value does not match the table."],
    );
    expect(failed.filter((check) => !check.passed)).toHaveLength(4);
  });

  it("does not fail rows whose counts were suppressed", () => {
    expect(
      seltReportChecks(
        [
          {
            label: "Sem 2 2025",
            enrolments: 40,
            respondents: null,
            response_rate_percent: null,
          },
        ],
        [],
      ).every((check) => check.passed),
    ).toBe(true);
  });
});
