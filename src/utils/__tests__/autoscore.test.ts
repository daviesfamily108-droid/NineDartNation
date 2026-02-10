import { scoreAtBoardPoint, BoardRadii, SectorOrder } from "../vision.js";
import { scoreFromImagePoint } from "../autoscore.js";
import { applyHomography } from "../vision.js";

function degToRad(d: number) {
  return (d * Math.PI) / 180;
}

describe("scoreAtBoardPoint and image mapping", () => {
  it("triple 20 is 60", () => {
    // triple 20 is at top (sector 20), radius between trebleInner and trebleOuter
    const r = (BoardRadii.trebleInner + BoardRadii.trebleOuter) / 2;
    // top = angle -90 deg -> x=0, y negative
    const p = { x: 0, y: -r };
    const s = scoreAtBoardPoint(p);
    expect(s.base).toBe(60);
    expect(s.mult).toBe(3);
    expect(s.ring).toBe("TRIPLE");
    expect(s.sector).toBe(20);
  });

  it("single 20 is 20 in middle ring", () => {
    const r = (BoardRadii.trebleOuter + BoardRadii.doubleInner) / 2;
    const p = { x: 0, y: -r };
    const s = scoreAtBoardPoint(p);
    expect(s.base).toBe(20);
    expect(s.mult).toBe(1);
    expect(s.ring).toBe("SINGLE");
  });

  it("double 20 is 40", () => {
    const r = (BoardRadii.doubleInner + BoardRadii.doubleOuter) / 2;
    const p = { x: 0, y: -r };
    const s = scoreAtBoardPoint(p);
    expect(s.base).toBe(40);
    expect(s.mult).toBe(2);
    expect(s.ring).toBe("DOUBLE");
  });

  it("inner bull is 50", () => {
    const p = { x: 0, y: 0 };
    const s = scoreAtBoardPoint(p);
    expect(s.base).toBe(50);
    expect(s.ring).toBe("INNER_BULL");
  });

  it("triple 13 is 39", () => {
    const idx = SectorOrder.indexOf(13);
    const angle = (idx / SectorOrder.length) * 360 - 90; // deg
    const r = (BoardRadii.trebleInner + BoardRadii.trebleOuter) / 2;
    const p = {
      x: r * Math.cos(degToRad(angle)),
      y: r * Math.sin(degToRad(angle)),
    };
    const s = scoreAtBoardPoint(p);
    expect(s.base).toBe(39);
    expect(s.mult).toBe(3);
    expect(s.sector).toBe(13);
    expect(s.ring).toBe("TRIPLE");
  });
});
