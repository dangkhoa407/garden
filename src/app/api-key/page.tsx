"use client";

import { useState, useEffect } from "react";

interface KeyItem {
  id: string;
  maskedKey: string;
  status: "active" | "error";
  failCount: number;
  lastUsed?: string;
  lastError?: string;
  priorityOrder: number;
}

interface ApiKeyResponse {
  totalKeys: number;
  activeKeyMask: string;
  keys: KeyItem[];
}

export default function ApiKeyPage() {
  const [newApiKey, setNewApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyData, setKeyData] = useState<ApiKeyResponse>({
    totalKeys: 0,
    activeKeyMask: "",
    keys: [],
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [statusAlert, setStatusAlert] = useState<{
    type: "success" | "error" | "info";
    msg: string;
  } | null>(null);

  // Fetch API Keys list from Node.js Express backend
  const fetchKeys = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/settings/gemini");
      if (res.ok) {
        const data = await res.json();
        setKeyData(data);
      }
    } catch (e) {
      console.error("Failed to load Gemini keys", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  // Add new API Key to rotation pool
  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newApiKey.trim()) {
      setStatusAlert({ type: "error", msg: "Vui lòng nhập API Key trước khi lưu!" });
      return;
    }

    try {
      setIsSaving(true);
      setStatusAlert(null);
      const res = await fetch("/api/settings/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: newApiKey.trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatusAlert({
          type: "success",
          msg: `Đã thêm API Key mới (${data.addedKeyMask}) vào danh sách xoay vòng (Tổng số: ${data.totalKeys} keys)!`,
        });
        setNewApiKey("");
        await fetchKeys();
      } else {
        setStatusAlert({
          type: "error",
          msg: data.error || "Không thể thêm API Key",
        });
      }
    } catch (e) {
      setStatusAlert({ type: "error", msg: "Lỗi kết nối tới Node.js Backend Server" });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete a key
  const handleDeleteKey = async (id: string, maskedKey: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa chìa khóa ${maskedKey}?`)) return;

    try {
      const res = await fetch(`/api/settings/gemini/${id}`, { method: "DELETE" });
      if (res.ok) {
        setStatusAlert({ type: "info", msg: `Đã xóa chìa khóa ${maskedKey} thành công.` });
        await fetchKeys();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Test Rotation Pool or Individual Key
  const handleTestKeyPool = async (specificKey?: string) => {
    try {
      setIsTesting(true);
      setStatusAlert(null);
      const res = await fetch("/api/settings/gemini/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: specificKey || undefined }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStatusAlert({
          type: "success",
          msg: `✅ ${data.message}`,
        });
        await fetchKeys();
      } else {
        setStatusAlert({
          type: "error",
          msg: `❌ Lỗi kiểm tra API Key: ${data.error || "Key bị lỗi và đã được đẩy xuống cuối hàng chờ"}`,
        });
        await fetchKeys();
      }
    } catch (e) {
      setStatusAlert({ type: "error", msg: "Lỗi kết nối tới server" });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-xl max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-primary text-3xl icon-filled">
            vpn_key
          </span>
          <h1 className="font-display-lg text-headline-md font-bold text-on-surface">
            Quản Lý Gemini API Key (Key Rotation & Fallback)
          </h1>
        </div>
        <p className="font-body-lg text-body-lg text-on-surface-variant">
          Thêm nhiều chìa khóa API. Khi một chìa khóa bị lỗi hạn ngạch (quota) hoặc sự cố mạng, hệ thống sẽ tự động đẩy chìa khóa đó xuống cuối danh sách và chuyển ngay sang chìa khóa tiếp theo!
        </p>
      </div>

      {/* Main Add Key Form */}
      <div className="bg-surface-container-lowest rounded-2xl p-lg card-shadow border border-outline-variant/20 space-y-md">
        <div className="border-b border-outline-variant/20 pb-md">
          <h2 className="font-headline-md text-headline-md font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">
              add_circle
            </span>
            Thêm API Key Mới Vào Hàng Chờ
          </h2>
          <p className="font-body-sm text-xs text-on-surface-variant mt-1">
            Mỗi chìa khóa mới sẽ được lưu vào file <code className="bg-surface-container-high px-1.5 py-0.5 rounded text-primary font-mono text-[11px]">data/settings.json</code>.
          </p>
        </div>

        {statusAlert && (
          <div
            className={`p-md rounded-xl text-body-sm font-medium flex items-start gap-2 border ${
              statusAlert.type === "success"
                ? "bg-primary/10 text-primary border-primary/20"
                : statusAlert.type === "error"
                ? "bg-error/10 text-error border-error/20"
                : "bg-surface-container-high text-on-surface border-outline-variant/30"
            }`}
          >
            <span className="material-symbols-outlined text-lg mt-0.5">
              {statusAlert.type === "success"
                ? "check_circle"
                : statusAlert.type === "error"
                ? "error"
                : "info"}
            </span>
            <span>{statusAlert.msg}</span>
          </div>
        )}

        <form onSubmit={handleAddKey} className="space-y-md">
          <div>
            <label className="block font-label-caps text-label-caps text-on-surface-variant mb-2 font-semibold uppercase">
              NHẬP CÁC CHÌA KHÓA GEMINI API KEY MỚI
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder="Dán đoạn mã API Key dạng AIzaSy..."
                className="w-full pl-4 pr-12 py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl text-body-sm font-mono text-on-surface focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-all"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary p-1"
                title={showKey ? "Ẩn API Key" : "Hiển thị API Key"}
              >
                <span className="material-symbols-outlined text-xl">
                  {showKey ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-md pt-xs">
            <button
              type="button"
              onClick={() => handleTestKeyPool()}
              disabled={isTesting || keyData.totalKeys === 0}
              className="bg-surface-container-high border border-outline-variant/30 text-on-surface hover:bg-surface-container-highest disabled:opacity-50 px-5 py-2.5 rounded-xl font-body-sm font-semibold transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">
                {isTesting ? "sync" : "published_with_changes"}
              </span>
              {isTesting ? "Đang thử nghiệm..." : "Thử nghiệm xoay vòng (Test Pool)"}
            </button>

            <button
              type="submit"
              disabled={isSaving || !newApiKey.trim()}
              className="bg-primary text-on-primary hover:bg-primary-container disabled:opacity-50 px-6 py-2.5 rounded-xl font-body-sm font-semibold transition-all shadow-sm active:scale-95 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              {isSaving ? "Đang lưu..." : "Thêm API Key vào danh sách"}
            </button>
          </div>
        </form>
      </div>

      {/* List of Managed API Keys */}
      <div className="bg-surface-container-lowest rounded-2xl p-lg card-shadow border border-outline-variant/20 space-y-md">
        <div className="flex items-center justify-between border-b border-outline-variant/20 pb-md">
          <div>
            <h3 className="font-headline-md text-headline-md font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">
                list_alt
              </span>
              Danh Sách Chìa Khóa API ({keyData.totalKeys} Keys)
            </h3>
            <p className="font-body-sm text-xs text-on-surface-variant mt-1">
              Chìa khóa ở vị trí #1 được ưu tiên sử dụng đầu tiên. Nếu lỗi sẽ bị đẩy xuống cuối!
            </p>
          </div>
        </div>

        {keyData.keys.length === 0 ? (
          <div className="text-center py-xl bg-surface-container-low rounded-xl border border-dashed border-outline-variant">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/50 mb-2">
              vpn_key_off
            </span>
            <p className="font-body-sm text-on-surface-variant font-medium">
              Chưa có chìa khóa API nào trong hệ thống. Hãy dán mã API Key ở trên để thêm!
            </p>
          </div>
        ) : (
          <div className="space-y-sm">
            {keyData.keys.map((k) => (
              <div
                key={k.id}
                className={`p-md rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-md ${
                  k.priorityOrder === 1
                    ? "bg-primary/5 border-primary/30 shadow-xs"
                    : k.status === "error"
                    ? "bg-error/5 border-error/20"
                    : "bg-surface-container-low border-outline-variant/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                      k.priorityOrder === 1
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-high text-on-surface-variant"
                    }`}
                  >
                    #{k.priorityOrder}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-body-sm text-on-surface">
                        {k.maskedKey}
                      </span>
                      {k.priorityOrder === 1 && (
                        <span className="bg-primary/20 text-primary font-label-caps text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">
                          ĐANG ƯU TIÊN SUẤT DÙNG
                        </span>
                      )}
                      {k.status === "error" && (
                        <span className="bg-error/15 text-error font-label-caps text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">
                          ĐÃ ĐẨY XUỐNG CUỐI (LỖI {k.failCount} LẦN)
                        </span>
                      )}
                    </div>
                    {k.lastError && (
                      <p className="text-[11px] text-error mt-0.5">
                        Lỗi gần nhất: {k.lastError}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleDeleteKey(k.id, k.maskedKey)}
                    className="text-on-surface-variant hover:text-error hover:bg-error/10 p-2 rounded-xl transition-colors"
                    title="Xóa chìa khóa này"
                  >
                    <span className="material-symbols-outlined text-lg">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Informational Card */}
      <div className="bg-primary-container/10 rounded-2xl p-md border border-primary/20 flex items-start gap-md">
        <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
          <span className="material-symbols-outlined text-2xl icon-filled">
            published_with_changes
          </span>
        </div>
        <div className="space-y-1">
          <h4 className="font-body-lg font-bold text-on-surface">
            Cơ chế Xoay Vòng Chìa Khóa (Key Rotation Queue):
          </h4>
          <p className="text-body-sm text-on-surface-variant leading-relaxed">
            Hệ thống tự động sử dụng chìa khóa đứng đầu hàng chờ (#1). Nếu chìa khóa đó gặp bất kỳ lỗi nào (hết quota miễn phí, bị giới hạn tần suất 429 hoặc sai key), hệ thống sẽ **tự động đẩy chìa khóa bị lỗi xuống cuối hàng chờ** và ngay lập tức lấy chìa khóa tiếp theo để xử lý cho người dùng mà **không làm gián đoạn trải nghiệm chat!**
          </p>
        </div>
      </div>
    </div>
  );
}
