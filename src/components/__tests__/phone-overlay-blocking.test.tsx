import React from "react";
import { render, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

it("ndn-overlay does not block clicks to underlying header buttons", () => {
  let clicked = false;

  const HeaderButton = () => (
    <button
      data-testid="cal-btn"
      onClick={() => {
        clicked = true;
      }}
      style={{ zIndex: 20 }}
    >
      Calibrate
    </button>
  );

  const { getByTestId } = render(
    <div>
      <div style={{ position: "relative", width: 300, height: 80 }}>
        <HeaderButton />
        {/* Full-screen overlay sitting on top but using ndn-overlay so it should not intercept clicks */}
        <div
          data-testid="overlay"
          className="ndn-overlay"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.2)",
          }}
        >
          {/* Interactive child inside overlay (should accept pointer events) */}
          <div
            className="ndn-overlay-interactive"
            data-testid="overlay-child"
            style={{ position: "absolute", right: 4, top: 4 }}
          >
            control
          </div>
        </div>
      </div>
    </div>,
  );

  // Click the header button underneath the overlay
  fireEvent.click(getByTestId("cal-btn"));
  expect(clicked).toBe(true);
});
