# Smart OU – Hướng dẫn cài đặt

Tài liệu này hướng dẫn cài đặt và chạy hệ thống Smart OU trên máy Windows, gồm: website, backend, đèn phòng mô phỏng bằng Wokwi, trạm đọc thẻ và trạm ghi thẻ RC522.

Video demo sản phẩm: [LINK VIDEO DEMO]

---

## 1. Yêu cầu

| Thành phần | Phiên bản | Ghi chú |
| --- | --- | --- |
| Windows 10/11 | — | Các lệnh mẫu dùng PowerShell |
| Python | 3.12 | Backend chạy trên Python 3.12 |
| Node.js | 24.15 trở lên | Dùng cho frontend và công cụ tạo project đèn |
| PostgreSQL | — | Dùng Neon hoặc PostgreSQL bất kỳ |
| VS Code | Mới nhất | Dùng để build firmware ESP32 |
| Extension PlatformIO IDE | Mới nhất | Build firmware ESP32 |
| Trình duyệt web và tài khoản Wokwi | — | Mô phỏng đèn phòng trên [wokwi.com](https://wokwi.com) |

---

## 2. Cài backend

Mở PowerShell tại thư mục gốc repository.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2.1. Tạo file `.env`

Sao chép `backend\.env.example` thành `backend\.env`, rồi điền các giá trị:

| Biến | Bắt buộc | Mô tả |
| --- | --- | --- |
| `DATABASE_URL` | Có | Chuỗi kết nối PostgreSQL, ví dụ `postgresql://user:pass@host:5432/dbname` |
| `JWT_SECRET` | Có | Chuỗi bí mật ngẫu nhiên |
| `HASH_KEY` | Có | Khóa mã hóa (base64) |
| `CORS_ORIGINS` | Có | Địa chỉ frontend, mặc định `http://localhost:5173` |
| `REDIS_URL` | Không | Cache phân tích; không có Redis thì hệ thống tự dùng database |
| `COOKIE_SECURE` | Không | Đặt `true` khi chạy HTTPS |
| `PRACTICAL_SUBJECT_CODES` | Không | Mã môn có buổi thực hành hằng tuần, cách nhau bằng dấu phẩy |
| `LIGHTING_OFFLINE_SECONDS` | Không | Mặc định `30` |
| `LIGHTING_COMMAND_TIMEOUT_SECONDS` | Không | Mặc định `30` |
| `LIGHTING_DEFAULT_WATTS` | Không | Công suất mặc định của đèn chưa khai báo, mặc định `20` W |
| `CARD_READER_ID`, `CARD_READER_KEY`, `CARD_WRITER_ID`, `CARD_WRITER_KEY` | Khi dùng trạm thẻ | Được tạo tự động bởi script cấu hình trạm (mục 6) |

Tạo `JWT_SECRET`:

```powershell
python -c "import secrets;print(secrets.token_urlsafe(48))"
```

Tạo `HASH_KEY`:

```powershell
python -c "import os,base64;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
```

Không commit file `.env` lên Git.

### 2.2. Khởi tạo dữ liệu

Khi backend khởi động, các bảng sẽ được tạo tự động. Sau đó nạp cơ sở và phòng:

```powershell
python scripts\seed_map_campuses_and_rooms.py
```

### 2.3. Chạy backend

```powershell
uvicorn main:app --reload --port 8000
```

Kiểm tra: mở `http://localhost:8000/docs`. Nếu hiện trang Swagger là backend đã chạy.

### 2.4. Chạy backend bằng Docker (tùy chọn)

Yêu cầu thêm: Docker Desktop đang chạy. Có hai cách lấy image.

**Cách 1: Kéo image đã build sẵn từ Docker Hub** (không cần build):

```powershell
docker login -u tbmtmt0609
docker pull tbmtmt0609/gppm-backend:cs3-b101-test
docker tag tbmtmt0609/gppm-backend:cs3-b101-test smartou-backend
```

Image Docker Hub là repository **Private**. Cần đăng nhập bằng tài khoản được nhóm cấp quyền. Nếu chưa có quyền, dùng cách 2.

**Cách 2: Tự build từ source** (lệnh chạy từ thư mục gốc repository):

```powershell
docker build -f backend\Dockerfile -t smartou-backend .
```

**Chạy container** (dùng image ở cách 1 hoặc cách 2):

```powershell
docker run --rm -p 8000:8000 -e PORT=8000 smartou-backend
```

Container dùng cổng `PORT` (mặc định `10000`). Lệnh trên map cổng `8000` để khớp với Wokwi và frontend local. Kiểm tra `http://localhost:8000/health` trả `{"status":"OK"}`.

Image đã chứa sẵn `backend\.env` (theo [.dockerignore](d:/GPPM_2026/.dockerignore)), nên không cần `--env-file`. Điều này nghĩa là image mang theo secret: ai có image là có chuỗi kết nối database, `JWT_SECRET` và `HASH_KEY`. Không chia sẻ image cho người ngoài nhóm. Chi tiết đẩy image và triển khai Render xem [backend\DOCKER.md](d:/GPPM_2026/backend/DOCKER.md).

---

## 3. Cài frontend

Mở một cửa sổ PowerShell mới tại thư mục gốc repository.

```powershell
cd frontend
npm install
npm run dev
```

Mở `http://localhost:5173`. Frontend cần backend đang chạy ở cổng 8000.

Build production:

```powershell
npm run build
```

---

## 4. Tạo tài khoản đăng nhập

[CẦN XÁC NHẬN: cách tạo tài khoản Admin/Super Admin đầu tiên]

Các chức năng quản trị (điều khiển đèn, đọc thẻ, cấp thẻ) yêu cầu tài khoản Admin hoặc Super Admin.

---

## 5. Thiết lập đèn phòng bằng Wokwi

Các bước này chạy trên máy phát triển và **không thay đổi database**, trừ bước đăng ký thiết bị.

### 5.1. Cài công cụ

1. Cài VS Code và extension **PlatformIO IDE** (chỉ để build firmware).
2. Kiểm tra lệnh `pio` có trong PATH. Nếu không có, mở terminal của PlatformIO trong VS Code.
3. Đăng nhập tài khoản miễn phí tại [wokwi.com](https://wokwi.com) để mô phỏng trên web. Không cần cài extension Wokwi.

### 5.2. Xem trước project

Từ thư mục `frontend`:

```powershell
node .\scripts\create-lighting-device.ts --campus CS3 --room B101
```

Lệnh chỉ xem trước. Nếu phòng không tồn tại hoặc cấu hình sai, lệnh báo lỗi.

### 5.3. Tạo project

```powershell
node .\scripts\create-lighting-device.ts --campus CS3 --room B101 --write
```

Lệnh tạo thư mục `iot\light-room\cs3-b101`, gồm `platformio.ini`, `DeviceLights.h`, `diagram.json`, `wokwi.toml` và `device.json`. Lệnh từ chối nếu thư mục đã tồn tại để tránh ghi đè.

### 5.4. Đăng ký thiết bị với backend

> **Chỉ chạy khi đã thống nhất với nhóm và đúng database.** Bước này ghi database. Nếu Device ID đã tồn tại, đăng ký sẽ thay khóa của thiết bị cũ.

Từ thư mục gốc repository, với backend đang dùng đúng `DATABASE_URL`:

```powershell
.\iot\configure-device.ps1 -Project cs3-b101
```

Script đọc thông tin từ `device.json`. Khóa được lưu trong `DeviceLocal.h`, file này bị Git bỏ qua.

Để đăng ký toàn bộ phòng theo dữ liệu, xem trước trước rồi mới ghi:

```powershell
node .\scripts\register-campus-lighting.ts
node .\scripts\register-campus-lighting.ts --write
```

### 5.5. Build firmware

```powershell
pio run --project-dir .\iot\light-room\cs3-b101
```

Lệnh tạo file `.pio\build\esp32\firmware.bin` và `firmware.elf` trong thư mục project.

### 5.6. Chạy mô phỏng trên wokwi.com

1. Mở [wokwi.com](https://wokwi.com), chọn **New Project** → **ESP32**.
2. Mở tab `diagram.json`, dán nội dung từ `iot\light-room\cs3-b101\diagram.json`.
3. Thêm file `firmware.bin` và `firmware.elf` từ thư mục `.pio\build\esp32` (nút **+** hoặc kéo thả).
4. Bấm **Start the simulation**.

Trên website, chọn **CS3** → **B101**. Khi board báo trực tuyến và đã báo GPIO, có thể điều khiển đèn.

> **Lưu ý quan trọng:** Firmware kết nối tới `http://host.wokwi.internal:8000`. Địa chỉ này chỉ trỏ tới máy của bạn khi chạy bằng extension VS Code. Trên wokwi.com, board không truy cập được backend chạy trên `localhost`. Muốn mô phỏng trên web, backend phải có địa chỉ công khai (HTTPS) và firmware phải được build với địa chỉ đó, hoặc dùng extension VS Code.

### 5.7. Công thức điện năng ảo

Điện năng được tính theo thời gian đèn bật:

```
Điện năng (kWh) = Công suất (W) × Thời gian bật (giây) / 3 600 000
```

- Chỉ tính khi đèn ở trạng thái bật.
- Công suất lấy từ cấu hình đèn. Đèn chưa khai báo dùng `LIGHTING_DEFAULT_WATTS` (mặc định 20 W).

---

## 6. Thiết lập trạm đọc thẻ RC522

### 6.1. Phần cứng

Trạm đọc thẻ dùng **ESP32 NodeMCU-32S** và module **RC522**. Nối dây theo bảng:

| RC522 | ESP32 |
| --- | --- |
| SDA (SS) | GPIO 21 |
| SCK | GPIO 18 |
| MOSI | GPIO 23 |
| MISO | GPIO 19 |
| RST | GPIO 22 |
| 3.3V | 3V3 |
| GND | GND |

Rút USB trước khi nối dây. RC522 chỉ dùng nguồn **3.3V**, không cấp 5V.

### 6.2. Cài thư viện và nạp firmware

Mở `iot\card-reader` bằng VS Code có PlatformIO. Thư viện được khai báo trong `platformio.ini`:
- `miguelbalboa/MFRC522@1.4.12`
- `bblanchon/ArduinoJson@7.4.2`

Build và nạp bằng PlatformIO: Upload.

### 6.3. Cấu hình trạm trên máy chạy backend

```powershell
cd iot\card-reader
.\setup.ps1
```

Script hỏi:
- Tên Wi-Fi (2.4 GHz) và mật khẩu.
- Địa chỉ backend trong mạng LAN, ví dụ `http://192.168.1.10:8000`.

Script tạo khóa thiết bị và chạy khởi tạo trạm từ thư mục `backend`. Nếu lỗi, sửa cấu hình backend rồi chạy lại.

Sau đó đăng nhập Admin/Super Admin, mở menu **Đọc thẻ** trên website.

---

## 7. Thiết lập trạm ghi thẻ

Trạm ghi thẻ dùng **ESP32-S3** (YOLO UNO) và module RC522 thật, nạp firmware trong `iot\card-writer` bằng PlatformIO.

```powershell
cd iot\card-writer
.\setup.ps1
```

Sau khi cấu hình xong, đăng nhập Admin/Super Admin và mở menu **Cấp thẻ** (`/card-writer`) để ghi MSSV lên thẻ.

---

## 8. Xử lý lỗi thường gặp

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| Backend báo thiếu `DATABASE_URL` hoặc `JWT_SECRET` | Chưa có `.env` hoặc chưa điền | Kiểm tra `backend\.env` |
| Frontend không gọi được API | Backend chưa chạy, hoặc sai `CORS_ORIGINS` | Chạy backend ở cổng 8000, kiểm tra `CORS_ORIGINS` |
| Board Wokwi không online | Backend chưa chạy hoặc đăng ký chưa xong | Chạy backend, kiểm tra bước 5.4 |
| `pio` không được nhận diện | PATH chưa có PlatformIO | Dùng terminal của PlatformIO |
| RC522 không đọc được thẻ | Nối dây sai hoặc cấp nguồn 5V | Kiểm tra bảng ở mục 6.1 |
