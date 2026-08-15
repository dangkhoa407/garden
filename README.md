
## VƯỜN RAU THÔNG MINH TÍCH HỢP GENAI

---

### Thông tin đề tài

**Cuộc thi:** Sáng tạo dành cho Thanh thiếu niên, Nhi đồng toàn quốc

**Lĩnh vực:** Updating

**Đơn vị:** `Trường THPT Số 3 Phù Cát`

### Thành viên

| STT | Họ và tên                  | Vai trò              |
| --: | -------------------------- | -------------------- |
|   1 | `NGUYỄN THÀNH ĐĂNG KHOA  ` | Phần mền / AI / IOT  |
|   2 | `BÙI LƯƠNG THÁI BÌNH     ` | Cơ khí / IOT         |
|   3 | `                        ` | Phần mềm / AI        |
|   4 | `[HỌ VÀ TÊN THÀNH VIÊN 4]` | Cơ khí / Tự động hóa |


---

# 1. GIỚI THIỆU

**VƯỜN RAU THÔNG MINH TÍCH HỢP GENAI ** là mô hình vườn rau tự động được phát triển nhằm hỗ trợ theo dõi và chăm sóc cây trồng thông qua sự kết hợp giữa **trí tuệ nhân tạo (AI), Internet of Things (IoT), xử lý ảnh, hệ thống nhúng và cơ cấu cơ khí**.

Hệ thống sử dụng **Raspberry Pi 4** làm bộ xử lý trung tâm. Camera được sử dụng để thu thập hình ảnh cây trồng, trong khi các cảm biến cung cấp dữ liệu về môi trường và độ ẩm đất.

Các bộ điều khiển **ESP32** và **Arduino UNO R3** đảm nhiệm việc điều khiển phần cứng theo các quyết định được đưa ra từ hệ thống.

Các chức năng chính của mô hình:

* Theo dõi tình trạng cây bằng camera.
* Phân tích hình ảnh cây trồng.
* Phát hiện sâu bệnh và khu vực bất thường.
* Theo dõi độ ẩm đất.
* Tự động tưới nước.
* Định lượng và pha dung dịch dinh dưỡng.
* Điều khiển cơ cấu chuyển động.
* Điều khiển cơ cấu phun.
* Theo dõi trạng thái hệ thống thông qua giao diện Web.
* Hỗ trợ giám sát hệ thống từ xa.

---

# 2. MỤC TIÊU

Dự án được xây dựng với mục tiêu tạo ra một mô hình có khả năng thực hiện chu trình:

```text
Thu thập dữ liệu
      ↓
Phân tích
      ↓
Đánh giá tình trạng
      ↓
Đưa ra quyết định
      ↓
Điều khiển thiết bị
      ↓
Theo dõi kết quả
      ↓
Tiếp tục thu thập dữ liệu
```

Thay vì chỉ sử dụng bộ hẹn giờ để tưới nước, hệ thống kết hợp dữ liệu cảm biến và hình ảnh để đưa ra quyết định vận hành.

---

# 3. KIẾN TRÚC HỆ THỐNG

```text
                         ┌──────────────────────┐
                         │      CAMERA USB      │
                         │   Hình ảnh cây trồng │
                         └──────────┬───────────┘
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │        RASPBERRY PI 4        │
                    │                              │
                    │  • Xử lý hình ảnh            │
                    │  • Phân tích AI              │
                    │  • Backend                   │
                    │  • Web Dashboard             │
                    │  • Điều phối hệ thống        │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
          ┌───────────────────┐        ┌───────────────────┐
          │    ARDUINO UNO    │        │       ESP32       │
          │                   │        │                   │
          │ Điều khiển motor  │        │ Độ ẩm đất         │
          │ Vị trí camera     │        │ Bơm nước          │
          │ Công tắc hành     │        │ Bơm định lượng    │
          │ trình             │        │ Relay             │
          │ Cơ cấu phun       │        │                   │
          └─────────┬─────────┘        └─────────┬─────────┘
                    │                            │
                    ▼                            ▼
          ┌───────────────────┐        ┌───────────────────┐
          │  CƠ CẤU CƠ KHÍ    │        │ HỆ THỐNG TƯỚI     │
          │                   │        │                   │
          │ Motor             │        │ Bơm nước          │
          │ L298N             │        │ Bơm dinh dưỡng    │
          │ Ròng rọc          │        │ Bồn pha           │
          │ Dây truyền động   │        │ Đường ống         │
          └───────────────────┘        └───────────────────┘
```

---

# 4. PHÂN CHIA CHỨC NĂNG

## Raspberry Pi 4

Raspberry Pi là bộ xử lý trung tâm của hệ thống.

Nhiệm vụ:

* Quản lý camera.
* Thu thập hình ảnh.
* Xử lý hình ảnh.
* Giao tiếp với dịch vụ AI.
* Chạy Backend.
* Chạy Web Dashboard.
* Quản lý dữ liệu.
* Điều phối các thiết bị.
* Quản lý kết nối mạng.
* Hỗ trợ truy cập hệ thống từ xa.

---

## ESP32

ESP32 đảm nhiệm phần điều khiển hệ thống tưới và dinh dưỡng.

Nhiệm vụ:

* Đọc cảm biến độ ẩm đất.
* Xác định trạng thái khô/ẩm.
* Điều khiển bơm nước.
* Điều khiển các bơm định lượng.
* Điều khiển relay.
* Tính toán thời gian chạy bơm.
* Thực hiện chu trình pha và tưới.
* Giới hạn thời gian hoạt động của thiết bị.

---

## Arduino UNO R3

Arduino UNO R3 đảm nhiệm các cơ cấu chuyển động.

Nhiệm vụ:

* Điều khiển động cơ.
* Điều khiển vị trí camera.
* Đọc công tắc hành trình.
* Điều khiển cơ cấu phun.
* Điều khiển các chuyển động theo vị trí được xác định.

---

# 5. CAMERA VÀ XỬ LÝ HÌNH ẢNH

Camera USB được kết nối trực tiếp với Raspberry Pi.

Khu vực trồng được chia thành nhiều vị trí quan sát.

Tại mỗi vị trí, camera thu thập hình ảnh và đưa dữ liệu về Raspberry Pi để xử lý.

Quy trình:

```text
Camera
  ↓
Chụp ảnh
  ↓
Raspberry Pi
  ↓
Xử lý ảnh
  ↓
AI phân tích
  ↓
Kết quả
  ↓
Lưu / hiển thị / điều khiển
```

Thông tin có thể được phân tích:

* Tình trạng lá.
* Sâu hại.
* Dấu hiệu bệnh.
* Vùng bị ảnh hưởng.
* Mức độ bất thường.
* Tình trạng sinh trưởng.

---

# 6. PHÁT HIỆN SÂU BỆNH

Khi hệ thống phát hiện dấu hiệu sâu bệnh từ hình ảnh, kết quả được gắn với vị trí camera đã chụp.

Điều này cho phép hệ thống xác định khu vực cần xử lý.

Nguyên tắc:

```text
Phát hiện
    ↓
Xác định vị trí
    ↓
Đánh giá mức độ
    ↓
 ┌───────────────┐
 │               │
 ▼               ▼
Mức thấp       Mức cao
 │               │
 ▼               ▼
Phun điểm      Phun toàn khu vực
```

Cách tiếp cận này nhằm hạn chế việc xử lý toàn bộ khu vực khi vấn đề chỉ xuất hiện tại một vị trí.

---

# 7. HỆ THỐNG ĐO ĐỘ ẨM

Cảm biến độ ẩm đất được kết nối với ESP32.

ESP32 thực hiện nhiều lần lấy mẫu thay vì sử dụng một giá trị duy nhất.

Quy trình:

```text
Đọc cảm biến
     ↓
Lấy nhiều mẫu
     ↓
Tính giá trị
     ↓
So sánh ngưỡng
     ↓
Xác định trạng thái đất
```

Các thông số như:

* Ngưỡng đất khô.
* Ngưỡng đất đủ ẩm.
* Số mẫu.
* Số lần xác nhận.
* Chu kỳ kiểm tra.

được cấu hình trong firmware ESP32.

---

# 8. ĐIỀU KHIỂN TƯỚI

Hệ thống không chỉ dựa vào thời gian để quyết định tưới.

Quy trình tổng quát:

```text
Đọc độ ẩm
    ↓
Đất có khô?
    │
    ├── Không → Tiếp tục giám sát
    │
    └── Có
         ↓
      Camera quét
         ↓
      Phân tích
         ↓
   Xác định nhu cầu
         ↓
     Chu trình tưới
         ↓
      Cập nhật trạng thái
```

Điều này giúp hệ thống có thể kết hợp thông tin từ cảm biến và hình ảnh trước khi thực hiện chu trình chăm sóc.

---

# 9. HỆ THỐNG ĐỊNH LƯỢNG DINH DƯỠNG

Hệ thống sử dụng nhiều bơm định lượng để đưa từng thành phần dung dịch vào bồn pha.

Thời gian chạy bơm được tính dựa trên lưu lượng đã hiệu chuẩn.

Công thức:

```text
Thời gian chạy bơm = Thể tích cần bơm / Lưu lượng bơm
```

Ví dụ:

```text
Thể tích cần bơm = 10 ml
Lưu lượng        = 1 ml/s

Thời gian         = 10 giây
```

Các thông số thực tế được khai báo trong chương trình điều khiển ESP32.

---

# 10. CHU TRÌNH PHA DUNG DỊCH

Chu trình tổng quát:

```text
Xác định lượng dinh dưỡng
          ↓
Bơm thành phần 1
          ↓
Bơm thành phần 2
          ↓
Bơm thành phần 3
          ↓
Bơm thành phần 4
          ↓
Bồn pha
          ↓
Bổ sung nước
          ↓
Trộn dung dịch
          ↓
Tưới cây
```

Các tỷ lệ và tổng thể tích được cấu hình trong firmware.

---

# 11. THÔNG SỐ ĐIỀU KHIỂN ESP32

Firmware của hệ thống chứa các thông số hiệu chỉnh cho phần cảm biến, bơm và tưới.

Một số nhóm thông số:

```text
Ngưỡng đất khô
Ngưỡng tái kích hoạt khi đất đủ ẩm
Số mẫu ADC
Số lần xác nhận đất khô
Chu kỳ kiểm tra cảm biến
Lưu lượng từng bơm
Tổng lượng dung dịch
Thời gian tưới trước
Thời gian tưới sau
Thời gian tối đa của một lần định lượng
Thời gian kiểm tra bơm
Thời gian kiểm tra bơm nước
```

Các thông số này giúp hiệu chỉnh hệ thống theo điều kiện thực tế của mô hình.

---

# 12. HỆ THỐNG CƠ KHÍ

Cơ cấu cơ khí được sử dụng để di chuyển camera và cơ cấu phun.

Các thành phần chính:

* Động cơ DC.
* Module L298N.
* Ròng rọc.
* Dây truyền động.
* Cơ cấu trượt.
* Giá đỡ camera.
* Công tắc hành trình.

Công tắc hành trình được sử dụng để xác định giới hạn chuyển động và tạo điểm tham chiếu cho cơ cấu.

---

# 13. DASHBOARD

Hệ thống có giao diện Web được xây dựng bằng:

* Next.js
* React
* TypeScript

Dashboard cung cấp giao diện theo dõi các thành phần của hệ thống.

Các thông tin có thể hiển thị:

```text
Độ ẩm đất
Trạng thái camera
Trạng thái bơm
Trạng thái tưới
Trạng thái dinh dưỡng
Cảnh báo sâu bệnh
Lịch sử hoạt động
Trạng thái thiết bị
```

Dashboard được triển khai trực tiếp trên Raspberry Pi.

---

# 14. CÔNG NGHỆ SỬ DỤNG

| Thành phần               | Công nghệ         |
| ------------------------ | ----------------- |
| Máy tính trung tâm       | Raspberry Pi 4    |
| Vi điều khiển            | ESP32             |
| Vi điều khiển            | Arduino UNO R3    |
| Frontend                 | Next.js / React   |
| Ngôn ngữ Frontend        | TypeScript        |
| Backend                  | Node.js           |
| API                      | Express           |
| Giao tiếp thời gian thực | WebSocket         |
| Xử lý ảnh                | OpenCV            |
| AI                       | Google Gemini     |
| Firmware                 | C/C++             |
| Quản lý tiến trình       | PM2               |
| Remote Access            | Cloudflare Tunnel |
| Quản lý mã nguồn         | Git / GitHub      |

---

# 15. CẤU TRÚC SOURCE CODE

```text
garden/
│
├── code_esp/
│   └── Firmware ESP32
│
├── code_nuoc_phan/
│   └── Điều khiển nước và dinh dưỡng
│
├── server/
│   └── Backend Node.js
│
├── src/
│   └── Ứng dụng Next.js
│
├── sketch_aug6a/
│   └── Firmware Arduino
│
├── public/
│   └── Tài nguyên giao diện
│
├── ecosystem.config.js
│   └── Cấu hình PM2
│
├── package.json
│   └── Dependency và script
│
├── package-lock.json
│   └── Khóa phiên bản dependency
│
└── README.md
    └── Tài liệu dự án
```

---

# 16. CÀI ĐẶT TRÊN RASPBERRY PI

## 16.1. Cài Git

```bash
sudo apt update
sudo apt install git -y
```

Kiểm tra:

```bash
git --version
```

---

## 16.2. Clone project

```bash
git clone https://github.com/dangkhoa407/garden.git
```

Di chuyển vào project:

```bash
cd garden
```

---

# 17. CÀI NODE.JS VÀ NPM

Kiểm tra:

```bash
node -v
npm -v
```

Nếu chưa cài, cài Node.js phiên bản LTS phù hợp với môi trường Raspberry Pi.

Sau khi cài:

```bash
node -v
npm -v
```

---

# 18. CÀI DEPENDENCY

Trong thư mục project:

```bash
npm install
```

Dependency được khai báo trong:

```text
package.json
```

Phiên bản cụ thể được khóa trong:

```text
package-lock.json
```

---

# 19. CÀI MÔI TRƯỜNG PYTHON

Kiểm tra:

```bash
python3 --version
```

Tạo virtual environment:

```bash
python3 -m venv venv
```

Kích hoạt:

```bash
source venv/bin/activate
```

Cài các thư viện cần thiết:

```bash
pip install pyserial
pip install websockets
pip install urllib3
pip install python-telegram-bot
pip install google-genai
pip install numpy
pip install opencv-python-headless
```

---

# 20. KIỂM TRA CAMERA

Cài công cụ V4L:

```bash
sudo apt install v4l-utils -y
```

Kiểm tra thiết bị:

```bash
ls /dev/video*
```

Kiểm tra chi tiết:

```bash
v4l2-ctl --list-devices
```

Nếu camera được nhận, thiết bị sẽ xuất hiện dưới dạng `/dev/videoX`.

---

# 21. NẠP CODE ARDUINO

Mở thư mục:

```text
sketch_aug6a/
```

Sử dụng Arduino IDE.

Chọn:

```text
Board: Arduino UNO
```

Sau đó chọn đúng cổng USB và upload firmware.

Kiểm tra:

* Động cơ.
* Cơ cấu camera.
* Công tắc hành trình.
* Cơ cấu phun.

---

# 22. NẠP CODE ESP32

Mở firmware trong:

```text
code_esp/
```

hoặc thư mục firmware tương ứng.

Trong Arduino IDE chọn board ESP32 và đúng cổng USB.

Sau khi upload, kiểm tra lần lượt:

```text
Cảm biến độ ẩm
      ↓
Bơm định lượng
      ↓
Relay
      ↓
Bơm nước
```

Không nên chạy toàn bộ hệ thống ngay trong lần kiểm tra đầu tiên.

---

# 23. CHẠY DEVELOPMENT

Chạy môi trường phát triển:

```bash
npm run dev
```

Nếu project sử dụng script chạy đồng thời:

```bash
npm run dev:all
```

Dashboard thường được truy cập tại:

```text
http://localhost:3000
```

Nếu truy cập từ thiết bị khác trong cùng mạng:

```text
http://IP_RASPBERRY_PI:3000
```

Lấy IP:

```bash
hostname -I
```

---

# 24. BUILD PRODUCTION

Build project:

```bash
npm run build
```

Nếu build thành công:

```bash
npm start
```

---

# 25. CHẠY BẰNG PM2

Project có file:

```text
ecosystem.config.js
```

Khởi động:

```bash
pm2 start ecosystem.config.js
```

Kiểm tra:

```bash
pm2 status
```

Xem log:

```bash
pm2 logs
```

Restart:

```bash
pm2 restart all
```

---

# 26. TỰ ĐỘNG KHỞI ĐỘNG SAU KHI RASPBERRY PI REBOOT

Chạy:

```bash
pm2 startup
```

PM2 sẽ cung cấp một câu lệnh `sudo`.

Thực hiện câu lệnh đó, sau đó:

```bash
pm2 save
```

Kiểm tra:

```bash
pm2 status
```

Sau khi Raspberry Pi khởi động lại, các process đã lưu sẽ được PM2 tự động chạy.

---

# 27. CẬP NHẬT SOURCE CODE

Di chuyển tới project:

```bash
cd ~/garden
```

Cập nhật:

```bash
git pull
```

Nếu dependency thay đổi:

```bash
npm install
```

Build:

```bash
npm run build
```

Restart:

```bash
pm2 restart all
```

Kiểm tra:

```bash
pm2 status
pm2 logs
```

---

# 28. TRUY CẬP TỪ XA

Hệ thống có thể sử dụng Cloudflare Tunnel để truy cập Dashboard từ Internet.

Kiến trúc:

```text
Thiết bị người dùng
       │
       │ HTTPS
       ▼
Cloudflare
       │
       │ Tunnel
       ▼
Raspberry Pi
       │
       ├── Frontend
       │
       └── Backend
```

Phương pháp này cho phép truy cập hệ thống từ xa mà không cần mở trực tiếp cổng dịch vụ trên router.

---

# 29. BIẾN MÔI TRƯỜNG

Các thông tin như API key và token không được đưa trực tiếp vào source code.

Có thể sử dụng:

```text
.env
.env.local
```

Ví dụ:

```env
GOOGLE_API_KEY=YOUR_API_KEY
TELEGRAM_BOT_TOKEN=YOUR_TOKEN
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

Không commit API key thật lên GitHub.

---

# 30. KIỂM TRA SAU KHI CÀI ĐẶT

Kiểm tra Raspberry Pi:

```bash
hostname
hostname -I
```

Kiểm tra Git:

```bash
git --version
```

Kiểm tra Node.js:

```bash
node -v
npm -v
```

Kiểm tra Python:

```bash
python3 --version
```

Kiểm tra camera:

```bash
v4l2-ctl --list-devices
```

Kiểm tra PM2:

```bash
pm2 status
```

Kiểm tra log:

```bash
pm2 logs
```

---

# 31. TRÌNH TỰ TEST HỆ THỐNG

Để tránh lỗi khi chạy đồng thời nhiều thiết bị, hệ thống nên được kiểm tra theo từng lớp:

```text
Raspberry Pi
     ↓
Mạng
     ↓
Camera
     ↓
Backend
     ↓
Dashboard
     ↓
Arduino
     ↓
ESP32
     ↓
Cảm biến
     ↓
Bơm
     ↓
Động cơ
     ↓
Công tắc hành trình
     ↓
Chu trình tự động
```

Sau khi từng thành phần hoạt động ổn định mới thực hiện kiểm tra toàn bộ hệ thống.

---

# 32. AN TOÀN KHI VẬN HÀNH

Hệ thống có các thiết bị sử dụng nguồn điện, động cơ và bơm.

Khi lắp đặt và kiểm tra cần:

* Kiểm tra đúng điện áp của từng thiết bị.
* Kiểm tra cực tính nguồn.
* Kiểm tra dây tín hiệu.
* Kiểm tra GND chung khi cần thiết.
* Kiểm tra relay trước khi kết nối tải.
* Kiểm tra từng bơm riêng biệt.
* Kiểm tra động cơ trước khi lắp tải cơ khí.
* Kiểm tra công tắc hành trình.
* Thiết lập thời gian hoạt động tối đa cho bơm.
* Có phương án ngắt nguồn khẩn cấp.

---

# 33. NGUYÊN TẮC THIẾT KẾ

Hệ thống được chia thành các module độc lập:

```text
        CAMERA / SENSOR
               │
               ▼
         DATA COLLECTION
               │
               ▼
             AI / LOGIC
               │
               ▼
         DECISION PROCESS
               │
               ▼
        HARDWARE CONTROL
               │
               ▼
          PHYSICAL ACTION
```

Việc phân tách các tầng giúp quá trình phát triển và kiểm tra dễ dàng hơn.

Ví dụ:

* Có thể thay đổi giao diện Web mà không thay đổi firmware ESP32.
* Có thể thay đổi bơm mà không cần thay đổi toàn bộ hệ thống.
* Có thể nâng cấp mô hình AI mà không cần thiết kế lại phần cơ khí.
* Có thể kiểm tra từng module độc lập.

---

# 34. ĐIỂM KỸ THUẬT CỦA MÔ HÌNH

### Xử lý tại Raspberry Pi

Raspberry Pi đảm nhiệm các tác vụ có yêu cầu xử lý cao hơn như camera, AI, backend và giao diện Web.

### Điều khiển thời gian thực tại ESP32

Các tác vụ đọc cảm biến và điều khiển bơm được đưa xuống ESP32.

### Điều khiển cơ cấu tại Arduino

Arduino xử lý các tác vụ điều khiển chuyển động và cơ cấu cơ khí.

### Phân tách phần mềm và phần cứng

Web Dashboard không trực tiếp điều khiển toàn bộ phần cứng ở mức thấp.

Các bộ điều khiển chuyên dụng đảm nhiệm phần thực thi.

---

# 35. KHẢ NĂNG MỞ RỘNG

Kiến trúc của hệ thống cho phép bổ sung:

* Cảm biến nhiệt độ.
* Cảm biến độ ẩm không khí.
* Cảm biến ánh sáng.
* Cảm biến mực nước.
* Nhiều khu vực tưới.
* Nhiều camera.
* Các loại cây trồng khác.
* Mô hình AI chuyên biệt.
* Hệ thống lưu trữ dữ liệu dài hạn.
* Ứng dụng điện thoại.
* Các cơ cấu tự động khác.

---

# 36. HƯỚNG PHÁT TRIỂN

Các hướng phát triển tiếp theo của đề tài:

1. Xây dựng tập dữ liệu riêng cho các loại rau phổ biến.
2. Cải thiện khả năng nhận diện sâu bệnh.
3. Theo dõi quá trình sinh trưởng theo thời gian.
4. Bổ sung dữ liệu môi trường.
5. Xây dựng hệ thống dự đoán nhu cầu nước.
6. Tự động hiệu chuẩn lưu lượng bơm.
7. Cải thiện độ chính xác của cơ cấu phun.
8. Xây dựng hệ thống quản lý nhiều khu vực trồng.
9. Lưu trữ và phân tích dữ liệu dài hạn.
10. Phát triển ứng dụng điều khiển trên thiết bị di động.

---

# 37. Ý NGHĨA CỦA ĐỀ TÀI

Đề tài hướng tới việc đưa các công nghệ:

```text
AI
+
IoT
+
Computer Vision
+
Embedded System
+
Automation
+
Web Technology
```

vào một mô hình nông nghiệp có khả năng hoạt động thực tế.

Giá trị chính của mô hình nằm ở việc kết nối các thành phần thành một hệ thống hoàn chỉnh:

```text
CẢM BIẾN
    ↓
THU THẬP DỮ LIỆU
    ↓
PHÂN TÍCH
    ↓
RA QUYẾT ĐỊNH
    ↓
ĐIỀU KHIỂN
    ↓
TÁC ĐỘNG LÊN CÂY TRỒNG
    ↓
THU THẬP DỮ LIỆU MỚI
```

---

# 38. THÔNG TIN DỰ ÁN

**Tên đề tài:** Hệ thống vườn rau thông minh ứng dụng AI và IoT

**Tên tiếng Anh:** Smart Garden – AI & IoT Based Automated Vegetable Monitoring and Care System

**Cuộc thi:** Sáng tạo dành cho Thanh thiếu niên, Nhi đồng toàn quốc

**Trường:** `[TÊN TRƯỜNG]`

**Đơn vị:** `[ĐƠN VỊ / TỈNH / THÀNH PHỐ]`

**Nhóm thực hiện:** `[TÊN NHÓM]`

### Thành viên

| STT | Họ và tên     | Phụ trách            |
| --: | ------------- | -------------------- |
|   1 | `[HỌ VÀ TÊN]` | Phát triển hệ thống  |
|   2 | `[HỌ VÀ TÊN]` | Phần cứng / IoT      |
|   3 | `[HỌ VÀ TÊN]` | Phần mềm / AI        |
|   4 | `[HỌ VÀ TÊN]` | Cơ khí / Tự động hóa |

---

# 39. SOURCE CODE

Repository chính thức:

https://github.com/dangkhoa407/garden

---

# 40. GHI CHÚ

Repository này được sử dụng để lưu trữ:

* Mã nguồn phần mềm.
* Firmware ESP32.
* Firmware Arduino.
* Backend.
* Frontend.
* Cấu hình triển khai.
* Tài liệu kỹ thuật.
* Các thành phần phục vụ quá trình phát triển mô hình.

---

## SMART GARDEN

**Hệ thống giám sát và chăm sóc cây trồng tự động dựa trên AI, IoT và hệ thống nhúng.**
