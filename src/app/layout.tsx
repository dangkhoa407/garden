"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";
import { usePathname, useRouter } from "next/navigation";
import { GardenProvider } from "@/context/GardenContext";
import "./globals.css";

function checkIsLoggedIn(): boolean {
  if (typeof window === "undefined") return true;
  const cookieMatch = document.cookie.match(/(?:^|;\s*)growhub_token=([^;]*)/);
  if (cookieMatch && cookieMatch[1] && cookieMatch[1].trim() !== "") return true;
  if (localStorage.getItem("growhub_token")) return true;
  return false;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(true);

  const isLoginPage = pathname === "/login";
  const isAiChatPage = pathname === "/ai-chat";

  useEffect(() => {
    const loggedIn = checkIsLoggedIn();
    setIsLoggedIn(loggedIn);
    setAuthChecked(true);

    if (!loggedIn && !isLoginPage) {
      router.replace("/login");
    } else if (loggedIn && isLoginPage) {
      router.replace("/");
    }
  }, [pathname, isLoginPage, router]);

  // Loading state while checking authentication on client
  if (!authChecked) {
    return (
      <html lang="vi" suppressHydrationWarning>
        <head>
          <title>GrowHub - Smart Garden Conservatory</title>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block"
          />
        </head>
        <body suppressHydrationWarning className="bg-background text-on-background min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-primary text-4xl animate-spin">
              progress_activity
            </span>
            <p className="font-body-sm text-on-surface-variant font-medium">
              Đang kiểm tra quyền truy cập...
            </p>
          </div>
        </body>
      </html>
    );
  }

  // Redirecting state if unauthenticated and trying to access protected page
  if (!isLoggedIn && !isLoginPage) {
    return (
      <html lang="vi" suppressHydrationWarning>
        <head>
          <title>GrowHub - Chuyển hướng đăng nhập</title>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block"
          />
        </head>
        <body suppressHydrationWarning className="bg-background text-on-background min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-primary text-4xl animate-spin">
              progress_activity
            </span>
            <p className="font-body-sm text-on-surface-variant font-medium">
              Vui lòng đăng nhập để tiếp tục...
            </p>
          </div>
        </body>
      </html>
    );
  }

  // Redirecting state if already authenticated and trying to access /login page
  if (isLoggedIn && isLoginPage) {
    return (
      <html lang="vi" suppressHydrationWarning>
        <head>
          <title>GrowHub - Chuyển hướng Dashboard</title>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block"
          />
        </head>
        <body suppressHydrationWarning className="bg-background text-on-background min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-primary text-4xl animate-spin">
              progress_activity
            </span>
            <p className="font-body-sm text-on-surface-variant font-medium">
              Đã đăng nhập! Đang chuyển hướng vào Dashboard...
            </p>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="vi" suppressHydrationWarning className={`light ${isAiChatPage ? "h-full overflow-hidden" : ""}`}>
      <head>
        <title>GrowHub - Smart Garden Conservatory</title>
        <meta
          name="description"
          content="Hệ thống quản lý vườn thông minh GrowHub - Botanical Intelligence Conservatory Dashboard"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block"
        />
      </head>
      <body
        suppressHydrationWarning
        className={`bg-background text-on-background antialiased ${
          isAiChatPage ? "h-full overflow-hidden" : "min-h-screen"
        }`}
      >
        <GardenProvider>
          {isLoginPage ? (
            <main className="w-full min-h-screen">{children}</main>
          ) : isAiChatPage ? (
            /* Fixed Layout exclusively for AI Chat Page */
            <div className="h-full w-full flex flex-col overflow-hidden">
              <Sidebar
                isOpenMobile={isOpenMobile}
                onCloseMobile={() => setIsOpenMobile(false)}
              />
              <Header onOpenMobileMenu={() => setIsOpenMobile(true)} />
              {/* Mobile: fixed inset so chat fills exactly between header and bottom nav */}
              <main className="
                fixed top-14 bottom-16 left-0 right-0 overflow-hidden
                md:static md:bottom-auto md:top-auto md:right-auto md:left-auto
                md:ml-64 md:pt-16 md:px-container-margin-desktop md:pb-md md:flex-1
              ">
                {children}
              </main>
              <MobileNav />
            </div>
          ) : (
            /* Normal Scrollable Layout for All Other Pages */
            <div className="min-h-screen flex flex-col">
              <Sidebar
                isOpenMobile={isOpenMobile}
                onCloseMobile={() => setIsOpenMobile(false)}
              />
              <Header onOpenMobileMenu={() => setIsOpenMobile(true)} />
              <main className="md:ml-64 pt-16 px-container-margin-mobile md:px-container-margin-desktop pb-24 md:pb-xl flex-grow">
                {children}
              </main>
              <MobileNav />
            </div>
          )}
        </GardenProvider>
      </body>
    </html>
  );
}
