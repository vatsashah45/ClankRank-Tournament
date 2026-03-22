import { describe, it, expect } from "vitest";
import { scoreResult } from "../src/scoring.js";

describe("scoreResult", () => {
  it("builds { score, tier } from a numeric score", () => {
    const result = scoreResult(100);
    expect(result.score).toBe(100);
    expect(result.tier).toBe("AAA");
  });

  it("maps score to correct tiers", () => {
    expect(scoreResult(98).tier).toBe("AAA");
    expect(scoreResult(92).tier).toBe("AA");
    expect(scoreResult(85).tier).toBe("A");
    expect(scoreResult(75).tier).toBe("BAA");
    expect(scoreResult(65).tier).toBe("BA");
    expect(scoreResult(50).tier).toBe("B");
    expect(scoreResult(35).tier).toBe("CAA");
    expect(scoreResult(20).tier).toBe("CA");
    expect(scoreResult(10).tier).toBe("C");
  });

  it("clamps score to 0 minimum", () => {
    const result = scoreResult(-50);
    expect(result.score).toBe(0);
    expect(result.tier).toBe("C");
  });

  it("clamps score to 110 maximum", () => {
    const result = scoreResult(999);
    expect(result.score).toBe(110);
    expect(result.tier).toBe("AAA");
  });
});
