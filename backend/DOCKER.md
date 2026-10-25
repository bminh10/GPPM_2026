# Docker image cho backend

Image chứa FastAPI backend, dependencies và `backend\.env` (DATABASE_URL Neon,
JWT_SECRET, HASH_KEY, ...), nên Render không cần khai báo Environment. Vì image
chứa secret, repository Docker Hub **phải để Private**. Biến Environment trên
Render (nếu có) sẽ ghi đè giá trị trong `.env`. Image không chứa `DeviceLocal.h`,
firmware hay frontend.

## Build và đẩy image lên Docker Hub

Đăng nhập Docker Hub trước. Username Docker Hub là `tbmtmt0609`.

Nếu CMD đang ở thư mục gốc `D:\GPPM_2026`:

```cmd
docker login
docker build -f backend\Dockerfile -t tbmtmt0609/gppm-backend:cs3-b101-test .
docker push tbmtmt0609/gppm-backend:cs3-b101-test
```

Nếu CMD đang ở `D:\GPPM_2026\backend`:

```cmd
docker login
docker build -f Dockerfile -t tbmtmt0609/gppm-backend:cs3-b101-test ..
docker push tbmtmt0609/gppm-backend:cs3-b101-test
```

Build context phải là thư mục gốc repo (`.` ở lệnh đầu hoặc `..` ở lệnh
thứ hai), vì Dockerfile copy thư mục `backend\` vào image.

Nếu Docker báo lỗi không kết nối được engine, hãy mở Docker Desktop rồi chạy
lại lệnh build. Không đưa `DeviceLocal.h` lên image registry.

## Tạo Web Service trên Render

1. Tạo hoặc chọn Render PostgreSQL và bảo đảm database đã có schema ứng dụng
   cùng dữ liệu người dùng cần thiết. Repository hiện không có migration khởi
   tạo đầy đủ toàn bộ schema gốc; Docker image không tự tạo/xóa bảng nghiệp vụ.
2. Trong **New Web Service**, chọn **Existing Image** và nhập:
   `docker.io/tbmtmt0609/gppm-backend:cs3-b101-test`.
3. Chọn region phù hợp với PostgreSQL. Có thể để Docker Command trống; image
   đã chạy Uvicorn trên `0.0.0.0:$PORT` (mặc định local là 10000).
4. Trong Environment, đặt:
   - `DATABASE_URL`: **Internal Database URL** của Render PostgreSQL.
   - `JWT_SECRET`: secret ngẫu nhiên mạnh.
   - `HASH_KEY`: khóa AES hợp lệ dạng URL-safe Base64, giải mã thành đúng 32 byte.
   - `CORS_ORIGINS`: origin chính xác của website frontend, không thêm path.
   - `COOKIE_SECURE=true` khi frontend/backend dùng HTTPS.
5. Đặt Health Check Path là `/health`, deploy và kiểm tra:
   `https://<backend-service>.onrender.com/health` trả `{"status":"OK"}`.

Không dùng SQLite hoặc file database trong container. Free Web Service có thể
sleep; Render PostgreSQL Free có thời hạn lưu trữ theo giới hạn hiện hành của
Render, nên chỉ phù hợp kiểm thử.

## Đưa CS3-B101 lên database Render để điều khiển từ Wokwi.com

Database local và database Render là hai database riêng. Firmware trên
Wokwi.com phải gọi URL HTTPS của backend Render; `host.wokwi.internal` chỉ dành
cho Wokwi chạy local qua gateway, không dùng được từ simulator trên web.

Sau khi đã có database Render với schema ứng dụng:

1. Dùng **External Database URL** của PostgreSQL Render từ máy quản trị để seed
   phòng CS1/CS3 từ dữ liệu bản đồ. Từ CMD:

   ```cmd
   cd /d D:\GPPM_2026\backend
   set "DATABASE_URL=<EXTERNAL_DATABASE_URL>"
   python scripts\seed_map_campuses_and_rooms.py
   ```

   Lệnh này thêm/cập nhật bản ghi campus/phòng theo GeoJSON; không tạo lớp học
   hay lịch học.
2. Từ một PowerShell tại thư mục gốc repository, provision thiết bị vào đúng
   database Render. Dùng External Database URL trong phiên terminal riêng tư:

   ```powershell
   $env:DATABASE_URL = Read-Host "Render External Database URL"
   .\iot\configure-device.ps1 -Project cs3-b101 -ApiUrl "https://<backend-service>.onrender.com" -CaCertificate "C:\certificates\trusted-root-ca.pem" -RotateKey
   ```

   Lệnh tạo/đảm bảo các bảng lighting, đăng ký `esp32-cs3-b101` cùng
   `light-1`/`light-2`, và cập nhật khóa tương ứng trong file local bị Git bỏ
   qua `iot\light-room\cs3-b101\DeviceLocal.h`. `-RotateKey` là cần thiết nếu
   file này đã tồn tại. `-CaCertificate` phải trỏ đến PEM **root CA đáng tin
   cậy** xác thực được chứng chỉ HTTPS của Render; không dùng leaf certificate
   hay tắt kiểm tra TLS. Sau provision chỉ dùng firmware build mới. Không chạy
   lệnh này lặp đi lặp lại hoặc trên nhầm `DATABASE_URL`, vì sẽ thay khóa thiết
   bị đã đăng ký.
3. Đảm bảo URL API trong `DeviceLocal.h` là HTTPS Render, sau đó build:

   ```cmd
   pio run -d D:\GPPM_2026\iot\light-room\cs3-b101 -e esp32
   ```

4. Trong project Wokwi.com, mở `diagram.json`, nhấn `F1` →
   **Upload Firmware and Start Simulation…**, rồi chọn
   `iot\light-room\cs3-b101\.pio\build\esp32\firmware.elf`. Không chia sẻ
   project chứa firmware/credential công khai.
5. Website frontend cũng phải dùng đúng backend Render và có origin trong
   `CORS_ORIGINS`. Đăng nhập Admin/SuperAdmin, mở **Bản đồ** → **CS3** → **B** →
   **B101**. Chờ đèn báo online/đã xác nhận rồi thử công tắc; trạng thái web chỉ
   xác nhận sau khi ESP32 mô phỏng báo lại GPIO.

Nếu schema ứng dụng hoặc dữ liệu tài khoản chưa được đưa vào PostgreSQL Render,
hãy chuẩn bị/khôi phục chúng trước các bước seed/provision. Seed phòng và
provision đèn không tự di chuyển tài khoản hay dữ liệu nghiệp vụ từ database
local.
