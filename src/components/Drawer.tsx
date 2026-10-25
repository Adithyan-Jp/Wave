import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../utils/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** Side sheet. Stays mounted so its contents keep their state; `inert` removes it from tab order while closed. */
export function Drawer({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={cn("fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] transition-opacity duration-200", open ? "opacity-100" : "pointer-events-none opacity-0")}
      />
      <aside
        inert={!open}
        aria-hidden={!open}
        aria-label={title}
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-[min(440px,100vw)] flex-col border-l border-white/10 bg-[#0b0b0d]/95 backdrop-blur-2xl transition-transform duration-300 ease-out",
          // the shadow is only drawn while open, otherwise it bleeds into the page from just off-screen
          open ? "translate-x-0 shadow-[-30px_0_80px_-30px_rgba(0,0,0,0.9)]" : "translate-x-full shadow-none",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-5">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </aside>
    </>
  );
}
