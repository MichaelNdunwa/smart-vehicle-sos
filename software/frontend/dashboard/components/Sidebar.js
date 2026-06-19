"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/",
    label: "Dashboard",
    icon: DashboardIcon
  },
  {
    href: "/vehicle/VH-001",
    label: "Vehicles",
    icon: VehicleIcon
  }
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 flex-shrink-0 flex-col border-r border-border-default bg-surface-card">
      <div className="flex items-center gap-3 border-b border-border-default px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
          <SvgLogo />
        </span>
        <div className="leading-tight">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-500">Smart Vehicle</p>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-500">SOS</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Navigation</p>
        {navItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith("/vehicle");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-brand-50 text-brand-600"
                  : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
              }`}
            >
              <span className="flex-shrink-0">{item.icon({})}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border-default px-5 py-4">
        <p className="text-xs text-text-muted">Smart Vehicle SOS v0.1</p>
      </div>
    </aside>
  );
}

function SvgLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function DashboardIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function VehicleIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 17h14l1-4H4l1 4z" />
      <path d="M5 17v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2" />
      <path d="M15 17v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2" />
      <path d="M1 13l1-4h20l1 4" />
      <circle cx="6" cy="10" r="1" />
      <circle cx="18" cy="10" r="1" />
      <path d="M18 5H6l-2 4h16l-2-4z" />
    </svg>
  );
}
