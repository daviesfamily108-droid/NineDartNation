import React, { useState } from "react";
import ResizableModal from "./ui/ResizableModal";

export default function Footer() {
  const [show, setShow] = useState(false);
  const year = new Date().getFullYear();
  return (
    <>
      <div className="w-full text-center text-xs text-gray-500 py-2 select-none">
        © {year} Nine Dart Nation —{" "}
        <button className="underline" onClick={() => setShow(true)}>
          Legal Notice
        </button>
      </div>
      {show ? (
        <ResizableModal
          storageKey="ndn:modal:legal"
          className="w-[640px]"
          defaultWidth={640}
          defaultHeight={420}
          minWidth={420}
          minHeight={220}
          initialFitHeight
        >
          <div className="p-4 space-y-3">
            <div className="text-lg font-semibold">
              Privacy & Copyright Notice
            </div>
            <div className="text-sm">⚠️ IMPORTANT LEGAL NOTICE</div>
            <div className="text-sm">
              Copyright Protection: All code, assets, and intellectual property
              in Nine Dart Nation are protected by copyright law. Unauthorized
              copying, modification, or distribution of this software is
              strictly prohibited.
            </div>
            <div className="text-sm">
              Legal Consequences: Any attempt to edit, reverse-engineer, or
              redistribute this code will result in immediate legal action,
              including but not limited to copyright infringement lawsuits and
              potential criminal charges.
            </div>
            <div className="text-sm">
              Privacy: Your personal data and gameplay information are
              protected. Any unauthorized access or data collection violates
              privacy laws and will be prosecuted to the full extent of the law.
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button className="btn" onClick={() => setShow(false)}>
                Close
              </button>
            </div>
          </div>
        </ResizableModal>
      ) : null}
    </>
  );
}
