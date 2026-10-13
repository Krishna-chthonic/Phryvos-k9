"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  Folder,
  GraduationCap,
  ListChecks,
  Lock,
  MessageSquare,
  Settings2,
  SquareKanban,
  Target,
} from "lucide-react";

const NAV = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/vault", label: "Files", icon: Folder },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/projects", label: "Projects", icon: SquareKanban },
  { href: "/exams", label: "Exams", icon: GraduationCap },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings2 },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [locking, setLocking] = useState(false);

  async function lock() {
    setLocking(true);
    await fetch("/api/auth/lock", { method: "POST" });
    router.replace("/unlock");
  }

  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="px-4 py-4">
        <div className="text-sm font-semibold tracking-tight text-zinc-900">
          phryvos k9
        </div>
        <div className="text-[11px] text-zinc-500">personal vault</div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-zinc-100 font-medium text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-200 p-2">
        <button
          onClick={lock}
          disabled={locking}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50"
        >
          <Lock className="h-4 w-4" />
          Lock vault
        </button>
      </div>
    </aside>
  );
}
