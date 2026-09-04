"use client";

/**
 * ChatbotWidget -- Global floating AI assistance button + drawer.
 *
 * Renders a fixed FAB that persists across all pages. Clicking opens
 * the AssistanceBot slide-over drawer.
 *
 * Mount this once in app/layout.tsx so it's available everywhere.
 */

import { useState, type CSSProperties } from "react";
import { HelpCircle } from "lucide-react";
import AssistanceBot from "./AssistanceBot";

const c = { primary: "#006633", accent: "#D4AF37", white: "#fff" };

const s: Record<string, CSSProperties> = {
  fab: {
    position: "fixed",
    bottom: 24,
    left: 24,
    zIndex: 1050,
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: `linear-gradient(135deg, ${c.primary} 0%, #008844 100%)`,
    color: c.white,
    border: `2.5px solid ${c.accent}`,
    boxShadow: "0 4px 20px rgba(0,102,51,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "transform 0.2s, box-shadow 0.2s",
  },
};

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open && (
        <button
          style={s.fab}
          onClick={() => setOpen(true)}
          title="مددگار بوٹ"
          aria-label="Open help bot"
        >
          <HelpCircle size={24} />
        </button>
      )}

      <AssistanceBot isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
