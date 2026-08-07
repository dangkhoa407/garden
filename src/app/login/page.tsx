"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If already logged in, redirect directly to dashboard "/"
    const cookieMatch = document.cookie.match(/(?:^|;\s*)growhub_token=([^;]*)/);
    const hasToken = (cookieMatch && cookieMatch[1] && cookieMatch[1].trim() !== "") || (typeof window !== "undefined" && localStorage.getItem("growhub_token"));
    if (hasToken) {
      router.replace("/");
    }
  }, [router]);

  const savePermanentSession = (token: string, user: any) => {
    // Permanent cookie (10 years Max-Age = 315360000 seconds)
    document.cookie = `growhub_token=${token}; Max-Age=315360000; path=/; SameSite=Lax`;
    document.cookie = `growhub_user=${encodeURIComponent(JSON.stringify(user))}; Max-Age=315360000; path=/; SameSite=Lax`;
    if (typeof window !== "undefined") {
      localStorage.setItem("growhub_user", JSON.stringify(user));
      localStorage.setItem("growhub_token", token);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        savePermanentSession(data.token, data.user);
        router.replace("/");
      } else {
        setErrorMsg(data.error || "Tài khoản hoặc mật khẩu không chính xác!");
      }
    } catch (err) {
      // Fallback offline login check if Express backend is offline
      if (username.trim() === "admin" && password.trim() === "admin") {
        const mockUser = { username: "admin", role: "Administrator" };
        savePermanentSession("admin-offline-token", mockUser);
        router.replace("/");
      } else {
        setErrorMsg("Tài khoản hoặc mật khẩu không chính xác!");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen flex flex-col md:flex-row bg-background">
      {/* Left Imagery */}
      <section className="hidden md:flex md:w-1/2 relative bg-surface-container-high min-h-screen overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?q=80&w=1200&auto=format&fit=crop"
          alt="Modern Greenhouse Conservatory"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary-container/80 via-black/30 to-transparent" />
        <div className="absolute bottom-12 left-12 p-md max-w-lg text-white">
          <h2 className="font-display-lg text-display-lg font-bold mb-2 drop-shadow-md">
            Hệ Thống Quản Lý Vườn Nội Bộ
          </h2>
          <p className="font-body-lg text-body-lg opacity-90 leading-relaxed">
            Giám sát vi khí hậu, quản lý dữ liệu cây trồng và điều khiển tự động hóa GrowHub.
          </p>
        </div>
      </section>

      {/* Right Form */}
      <section className="w-full md:w-1/2 flex items-center justify-center p-container-margin-mobile md:p-container-margin-desktop bg-surface min-h-screen">
        <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl p-lg shadow-lg border border-primary/10">
          {/* Header */}
          <div className="text-center mb-lg">
            <Link href="/" className="inline-flex items-center justify-center gap-2 mb-sm text-primary group">
              <span className="material-symbols-outlined text-4xl icon-filled transition-transform group-hover:scale-110">
                potted_plant
              </span>
              <h1 className="font-headline-md text-headline-md font-bold">GrowHub</h1>
            </Link>
            <h2 className="font-display-lg text-headline-md text-on-surface mb-xs font-bold">
              Đăng Nhập Hệ Thống
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Dành riêng cho nhân viên quản trị hệ thống nội bộ
            </p>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="mb-md p-3 bg-error/10 border border-error/30 rounded-xl text-error text-body-sm flex items-center gap-2 animate-in fade-in duration-200">
              <span className="material-symbols-outlined text-base">error</span>
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-md">
            {/* Username */}
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface-variant mb-1 font-semibold" htmlFor="username">
                TÀI KHOẢN
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-outline">
                  <span className="material-symbols-outlined text-lg">person</span>
                </div>
                <input
                  id="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nhập tài khoản"
                  className="w-full pl-10 pr-3 py-2.5 bg-surface-container-low border border-outline-variant rounded-xl focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary focus:border-primary font-body-sm text-body-sm text-on-surface placeholder-on-surface-variant/50 transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block font-label-caps text-label-caps text-on-surface-variant mb-1 font-semibold" htmlFor="password">
                MẬT KHẨU
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-outline">
                  <span className="material-symbols-outlined text-lg">lock</span>
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3 py-2.5 bg-surface-container-low border border-outline-variant rounded-xl focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary focus:border-primary font-body-sm text-body-sm text-on-surface placeholder-on-surface-variant/50 transition-colors"
                />
              </div>
            </div>

            {/* Remember */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-primary focus:ring-primary border-outline-variant rounded bg-surface-container-low cursor-pointer"
                />
                <label htmlFor="remember-me" className="ml-2 block font-body-sm text-body-sm text-on-surface-variant cursor-pointer">
                  Lưu đăng nhập vĩnh viễn (Cookie 10 năm)
                </label>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl shadow-sm text-body-lg font-semibold text-on-primary bg-primary hover:bg-primary-container focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                  Đang xác thực...
                </>
              ) : (
                "Đăng nhập hệ thống"
              )}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
