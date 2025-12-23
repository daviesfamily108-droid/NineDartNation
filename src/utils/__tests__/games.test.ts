import {
  getStartOptionsForGame,
  getModeOptionsForGame,
  getModeValueOptionsForGame,
  labelForMode,
} from "../games";

describe("games mappings", () => {
  test("X01 start options include 301/501/701", () => {
    const s = getStartOptionsForGame("X01");
    expect(s).toContain(301);
    expect(s).toContain(501);
    expect(s).toContain(701);
  });

  test("Other games have default start options", () => {
    const s = getStartOptionsForGame("Cricket");
    expect(Array.isArray(s)).toBeTruthy();
    // For non-X01 we expect empty array for starts by default
    expect(s.length).toBe(0);
  });

  test("Mode options return a list including all and bestof/firstto", () => {
    const mAll = getModeOptionsForGame("all");
    expect(mAll).toContain("all");
    expect(mAll).toContain("bestof");
    expect(mAll).toContain("firstto");
    const m = getModeOptionsForGame("X01");
    expect(m).toContain("all");
    expect(m).toContain("bestof");
  });

  test("Mode value options for X01 bestof and firstto", () => {
    const valsBestOf = getModeValueOptionsForGame("X01", "bestof");
    expect(valsBestOf).toContain(1);
    expect(valsBestOf).toContain(3);
    const valsFirstTo = getModeValueOptionsForGame("X01", "firstto");
    expect(valsFirstTo).toContain(1);
    expect(valsFirstTo.length).toBeGreaterThan(0);
  });

  test("Baseball supports innings mode with numeric options", () => {
    const modes = getModeOptionsForGame("Baseball");
    expect(modes).toContain("innings");
    const vals = getModeValueOptionsForGame("Baseball", "innings");
    expect(vals).toContain(9);
  });

  test("Golf supports holes 9/18", () => {
    const modes = getModeOptionsForGame("Golf");
    expect(modes).toContain("holes");
    const vals = getModeValueOptionsForGame("Golf", "holes");
    expect(vals).toContain(9);
    expect(vals).toContain(18);
  });

  test("labelForMode returns friendly labels", () => {
    expect(labelForMode("holes")).toBe("Holes");
    expect(labelForMode("innings")).toBe("Innings");
    expect(labelForMode("practice")).toBe("Practice");
  });
});
