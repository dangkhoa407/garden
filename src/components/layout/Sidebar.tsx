"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface SidebarProps {
  className?: string;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ className, isOpenMobile, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { label: "Dashboard", href: "/", icon: "dashboard" },
    { label: "Trợ lý AI Garden", href: "/ai-chat", icon: "psychology" },
    { label: "Cấu hình API Key", href: "/api-key", icon: "vpn_key" },
    { label: "Vườn của tôi", href: "/plants", icon: "potted_plant" },
    { label: "Điều khiển thiết bị", href: "/controls", icon: "tune" },
    { label: "Lịch trình", href: "/schedule", icon: "calendar_today" },
    { label: "Quan sát Camera", href: "/camera", icon: "videocam" },
    { label: "Đăng nhập", href: "/login", icon: "login" },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={cn(
          "bg-surface border-r border-outline-variant/20 w-64 flex flex-col h-screen fixed left-0 top-0 py-md px-sm z-50 transition-transform duration-300",
          isOpenMobile ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          className
        )}
      >
        {/* Brand Header */}
        <div className="mb-xl px-sm flex items-center justify-between">
          <div>
            <Link href="/" className="group flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-3xl icon-filled transition-transform group-hover:scale-110">
                energy_savings_leaf
              </span>
              <div>
                <h1 className="font-display-lg text-headline-md font-bold text-primary leading-tight">
                  GrowHub
                </h1>
                <span className="font-label-caps text-[11px] text-on-surface-variant uppercase tracking-wider block">
                  Botanical Intelligence
                </span>
              </div>
            </Link>
          </div>
          {isOpenMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden text-on-surface-variant hover:text-primary p-1"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={cn(
                  "flex items-center gap-3 px-sm py-3 rounded-xl font-body-lg text-body-sm font-medium transition-all duration-150 active:scale-95",
                  isActive
                    ? "text-primary font-bold bg-primary/10 border-r-4 border-primary shadow-xs"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                )}
              >
                <span
                  className={cn(
                    "material-symbols-outlined text-xl",
                    isActive && "icon-filled text-primary"
                  )}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Action button at bottom */}
        <div className="mt-auto pt-sm border-t border-outline-variant/10">
          <button className="w-full bg-primary text-on-primary py-3 px-4 rounded-xl font-body-lg text-body-sm font-semibold hover:bg-primary-container transition-all shadow-sm active:scale-95 flex justify-center items-center gap-2">
            <span className="material-symbols-outlined text-lg">add</span>
            Thêm cây mới
          </button>
        </div>
      </aside>
    </>
  );
}
