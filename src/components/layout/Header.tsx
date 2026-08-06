"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onOpenMobileMenu?: () => void;
}

export function Header({ title = "GARDEN OVERVIEW", subtitle, onOpenMobileMenu }: HeaderProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    // Clear cookies & localStorage
    document.cookie = "growhub_token=; Max-Age=0; path=/";
    document.cookie = "growhub_user=; Max-Age=0; path=/";
    if (typeof window !== "undefined") {
      localStorage.removeItem("growhub_token");
      localStorage.removeItem("growhub_user");
    }
    setShowDropdown(false);
    router.push("/login");
  };

  return (
    <header className="fixed top-0 right-0 left-0 md:left-64 h-14 bg-background/90 backdrop-blur-md z-30 border-b border-outline-variant/10 px-container-margin-mobile md:px-container-margin-desktop flex justify-between items-center transition-all">
      <div className="flex items-center gap-md">
        {/* Mobile menu trigger button */}
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden text-primary p-1.5 hover:bg-surface-container rounded-lg transition-colors"
          aria-label="Open Navigation Menu"
        >
          <span className="material-symbols-outlined text-xl">menu</span>
        </button>

        <div>
          <h2 className="font-label-caps text-xs text-secondary font-bold uppercase tracking-wider">
            {title}
          </h2>
          {subtitle && (
            <p className="font-body-sm text-[11px] text-on-surface-variant hidden sm:block">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-sm">
        {/* Search bar */}
        <div className="relative hidden md:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-base">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm cây, thiết bị..."
            className="bg-surface-container-low border border-outline-variant/30 rounded-full py-1.5 pl-9 pr-3 text-xs font-body-sm focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-all w-48 lg:w-56"
          />
        </div>

        {/* Notifications */}
        <button className="relative text-on-surface-variant hover:text-primary hover:bg-surface-container-high p-1.5 rounded-full transition-colors">
          <span className="material-symbols-outlined text-xl">notifications</span>
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error animate-pulse" />
        </button>

        {/* User Avatar Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center justify-center w-8 h-8 rounded-full overflow-hidden border border-primary/40 bg-surface-container-high hover:bg-primary/10 transition-colors focus:outline-none"
            aria-label="User profile menu"
            title="Tài khoản admin"
          >
            <span className="material-symbols-outlined text-primary text-xl">
              person
            </span>
          </button>

          {/* Dropdown Menu */}
          {showDropdown && (
            <div className="absolute right-0 mt-2 w-56 bg-surface rounded-2xl shadow-xl border border-outline-variant/30 py-2 z-[100] animate-in fade-in zoom-in-95 duration-150">
              <div className="px-4 py-2.5 border-b border-outline-variant/15">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="font-body-sm font-bold text-on-surface">admin</p>
                </div>
                <p className="font-label-caps text-[10px] text-primary font-semibold uppercase mt-0.5">
                  Quản trị viên hệ thống
                </p>
              </div>

              <div className="py-1">
                <Link
                  href="/api-key"
                  onClick={() => setShowDropdown(false)}
                  className="flex items-center gap-3 px-4 py-2 text-body-sm text-on-surface hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined text-lg text-primary">key</span>
                  <span>Cấu hình API Key</span>
                </Link>
                <Link
                  href="/plants"
                  onClick={() => setShowDropdown(false)}
                  className="flex items-center gap-3 px-4 py-2 text-body-sm text-on-surface hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined text-lg text-primary">potted_plant</span>
                  <span>Quản lý cây trồng</span>
                </Link>
                <Link
                  href="/ai-chat"
                  onClick={() => setShowDropdown(false)}
                  className="flex items-center gap-3 px-4 py-2 text-body-sm text-on-surface hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined text-lg text-primary">smart_toy</span>
                  <span>Trợ lý AI Chat</span>
                </Link>
              </div>

              <div className="border-t border-outline-variant/15 pt-1 mt-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-body-sm text-error hover:bg-error/10 transition-colors font-medium text-left"
                >
                  <span className="material-symbols-outlined text-lg">logout</span>
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
