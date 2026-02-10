import React from "react";
import Calibrator from "./Calibrator.js";

export default function CameraSetup() {
  return (
    <div className="card ndn-game-shell relative overflow-hidden">
      <h2 className="text-3xl font-bold text-brand-700 mb-4">Camera Setup</h2>
      <div className="ndn-shell-body">
        <Calibrator />
      </div>
    </div>
  );
}
