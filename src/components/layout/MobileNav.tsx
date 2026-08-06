"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();

  const items = [
    { label: "Dashboard", href: "/", icon: "dashboard" },
    { label: "Trợ lý AI", href: "/ai-chat", icon: "psychology" },
    { label: "Cây trồng", href: "/plants", icon: "potted_plant" },
    { label: "Điều khiển", href: "/controls", icon: "tune" },
    { label: "Camera", href: "/camera", icon: "videocam" },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-md shadow-[0_-2px_10px_rgba(0,0,0,0.05)] border-t border-outline-variant/10 flex justify-around items-center h-16 z-40">
      {items.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-0.5 text-on-surface-variant transition-colors px-2 py-1",
              isActive && "text-primary font-bold"
            )}
          >
            <div
              className={cn(
                "p-1 rounded-full transition-colors",
                isActive && "bg-secondary-container text-on-secondary-container"
              )}
            >
              <span
                className={cn(
                  "material-symbols-outlined text-xl",
                  isActive && "icon-filled"
                )}
              >
                {item.icon}
              </span>
            </div>
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
