# 📱 App Android ViewWeb (Smart Garden System Viewer)

Ứng dụng Android Native (Kotlin) hiển thị website/hệ thống quản lý thông qua WebView với giao diện nhập địa chỉ URL hiện đại, đẹp mắt.

## ✨ Tính năng nổi bật
1. **Giao diện chào mừng & Nhập địa chỉ**:
   - Dòng chữ tiêu đề đúng yêu cầu: `HÃY NHẬP ĐỊA CHỈ TRUY CẬP VÀO HỆ THỐNG`.
   - Card giao diện bo góc, đổ bóng Emerald Green & Slate Dark hiện đại.
   - Nút chọn nhanh giao thức (`http://`, `:3000`, `https://`) giúp nhập IP nhanh trên điện thoại.
2. **Ghi nhớ địa chỉ**:
   - Tự động lưu địa chỉ URL đã nhập (SharedPreferences) để lần sau mở App là tự động kết nối ngay.
3. **Cấu hình WebView tối ưu**:
   - Cho phép chạy JavaScript, DOM Storage, LocalStorage.
   - Cho phép `usesCleartextTraffic` (truy cập cả HTTP lẫn HTTPS, vô cùng quan trọng khi dùng IP nội bộ như `http://192.168.1.xxx:3000`).
   - Bỏ qua lỗi SSL khi chạy server thử nghiệm local.
4. **Thanh công cụ điều hướng**:
   - Nút Quay lại (Back), Tải lại (Refresh), và nút **"Đổi địa chỉ URL"** để dễ dàng đổi IP server bất kỳ lúc nào.
   - Thanh ProgressBar thể hiện trạng thái tải trang mượt mà.

---

## 🚀 Cách mở và biên dịch ứng dụng bằng Android Studio

1. **Mở dự án**:
   - Mở ứng dụng **Android Studio**.
   - Chọn **Open** (hoặc *File -> Open*).
   - Trỏ tới thư mục: `Code web/android_app`.

2. **Chạy thử trên thiết bị / Giả lập**:
   - Kết nối điện thoại Android qua USB (bật *USB Debugging*) hoặc tạo Android Emulator.
   - Nhấn nút **Run (tam giác xanh)** hoặc phím tắt `Shift + F10`.

3. **Xuất file cài đặt APK**:
   - Trên menu Android Studio, chọn **Build -> Build Bundle(s) / APK(s) -> Build APK(s)**.
   - Sau khi build xong, nhấn **locate** để lấy file `app-debug.apk` và cài trực tiếp lên điện thoại Android!
