# Smart OU – Hướng dẫn cài đặt

Tài liệu này hướng dẫn cài đặt và chạy hệ thống Smart OU trên máy Windows, gồm: website, backend, đèn phòng mô phỏng bằng Wokwi, trạm đọc thẻ và trạm ghi thẻ RC522.

Website triển khai: [Smart OU](https://gppm-2026.truongbinhminh27122006.workers.dev/). Các bước bên dưới dùng để cài một hệ thống riêng, với database và khóa bí mật của bạn.

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
| `CARD_READER_ID`, `CARD_READER_KEY`, `CARD_WRITER_ID`, `CARD_WRITER_KEY` | Khi dùng trạm thẻ | Được tạo tự động bởi script cấu hình trạm (mục 5, 6) |

Tạo `JWT_SECRET`:

```powershell
python -c "import secrets;print(secrets.token_urlsafe(48))"
```

Tạo `HASH_KEY`:

```powershell
python -c "import os,base64;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
```

Không commit file `.env` lên Git. Khi chạy local qua HTTP, đặt `COOKIE_SECURE=false`.

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

### 2.3.1. Tạo quản trị viên đầu tiên trên database riêng

Chỉ thực hiện khi bạn quản trị database mới cài đặt, không chạy trên database dùng chung hoặc hệ thống triển khai của người khác.

1. Sau khi chạy frontend ở mục 3, mở `http://localhost:5173/sign-up` và đăng ký tài khoản bằng email của bạn. Tài khoản mới mặc định có vai trò `User`, chưa có quyền quản trị.
2. Trong SQL Editor của PostgreSQL (ví dụ Neon SQL Editor), chọn **đúng database trong `DATABASE_URL`**. Thay email ví dụ bên dưới bằng email vừa đăng ký, rồi chạy:

   ```sql
   BEGIN;
   DO $$
   DECLARE
       target_email text := 'admin@example.com';
       admin_role_id integer;
   BEGIN
       IF EXISTS (
           SELECT 1 FROM "user" u JOIN role r ON r.id = u.role_id
           WHERE lower(trim(r.name)) IN ('super admin', '1 super admin', 'superadmin')
       ) THEN
           RAISE EXCEPTION 'A Super Admin already exists; ask that administrator to manage accounts.';
       END IF;
       IF (SELECT count(*) FROM "user" WHERE email = target_email) <> 1 THEN
           RAISE EXCEPTION 'Expected exactly one registered account with the specified email.';
       END IF;
       SELECT id INTO admin_role_id FROM role
       WHERE name = 'Super Admin' ORDER BY id LIMIT 1;
       IF admin_role_id IS NULL THEN
           INSERT INTO role (name) VALUES ('Super Admin') RETURNING id INTO admin_role_id;
       END IF;
       UPDATE "user" SET role_id = admin_role_id WHERE email = target_email;
   END;
   $$;
   COMMIT;
   ```

3. Nếu có lỗi, chạy `ROLLBACK;` trước khi thử lại và xử lý nguyên nhân được thông báo. Nếu thành công, đăng xuất rồi đăng nhập lại để nhận quyền mới.
4. Các tài khoản tiếp theo được quản lý qua menu **Tài khoản** bằng Super Admin; không dùng SQL này để cấp quyền hàng loạt.

### 2.4. Chạy backend bằng Docker (tùy chọn)

Yêu cầu thêm: Docker Desktop đang chạy. Có hai cách lấy image.

**Cách 1: Kéo image đã build sẵn từ Docker Hub** (không cần build):

```powershell
docker login -u tbmtmt0609
docker pull tbmtmt0609/gppm-backend:cs3-b101-test3
docker tag tbmtmt0609/gppm-backend:cs3-b101-test3 smartou-backend
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

Khi tự build bằng [.dockerignore](./.dockerignore) hiện tại, tệp `backend\.env` nếu có sẽ được đưa vào image. Hãy tạo cấu hình riêng ở mục 2.1 trước khi build; không dùng database hoặc khóa bí mật của người khác. Image có chứa `.env` mang theo secret: ai có image là có thể lấy chuỗi kết nối database, `JWT_SECRET` và `HASH_KEY`. Không công khai hoặc chia sẻ image chứa secret. Có thể truyền cấu hình riêng khi chạy bằng `docker run --rm --env-file .\backend\.env -p 8000:8000 -e PORT=8000 smartou-backend` (từ thư mục gốc); các biến này ghi đè giá trị tương ứng trong `.env` đã đóng gói.

---

## 3. Cài frontend

Mở một cửa sổ PowerShell mới tại thư mục gốc repository.

```powershell
cd frontend
npm install
$env:API_PROXY_TARGET = "http://localhost:8000"
npm run dev
```

Mở `http://localhost:5173`. Biến `API_PROXY_TARGET` ở trên yêu cầu Vite chuyển các lệnh gọi `/api` về backend local ở cổng 8000; đặt biến trong cùng cửa sổ PowerShell chạy `npm run dev`. Nếu bỏ qua, Vite dùng backend từ xa mặc định trong `vite.config.ts`, không phải backend local. Khi đổi địa chỉ, dừng rồi chạy lại Vite.

Build production:

```powershell
npm run build
```

---

## 4. Thiết lập đèn phòng bằng Wokwi

Các bước này chạy trên máy phát triển và **không thay đổi database**, trừ bước đăng ký thiết bị.

### 4.1. Cài công cụ

1. Cài VS Code và extension **PlatformIO IDE** (chỉ để build firmware).
2. Kiểm tra lệnh `pio` có trong PATH. Nếu không có, mở terminal của PlatformIO trong VS Code.
3. Đăng nhập tài khoản miễn phí tại [wokwi.com](https://wokwi.com) để mô phỏng trên web. Không cần cài extension Wokwi.

### 4.2. Xem trước project

Từ thư mục `frontend`:

```powershell
node .\scripts\create-lighting-device.ts --campus CS3 --room B101
```

Lệnh chỉ xem trước. Nếu phòng không tồn tại hoặc cấu hình sai, lệnh báo lỗi.

### 4.3. Tạo project

```powershell
node .\scripts\create-lighting-device.ts --campus CS3 --room B101 --write
```

Lệnh tạo thư mục `iot\light-room\cs3-b101`, gồm `platformio.ini`, `DeviceLights.h`, `diagram.json`, `wokwi.toml` và `device.json`. Project `cs3-b101` đã có trong repository nên khi dùng project này, **bỏ qua lệnh `--write`**, chuyển sang mục 4.4. Chỉ dùng `--write` khi tạo project cho một phòng có trong GeoJSON nhưng chưa có thư mục tương ứng; lệnh từ chối ghi đè thư mục đã tồn tại.

### 4.4. Đăng ký thiết bị với backend

> **Kiểm tra `DATABASE_URL` trỏ đến đúng cơ sở dữ liệu trước khi chạy.** Bước này ghi dữ liệu vào cơ sở dữ liệu. Nếu Device ID đã tồn tại, đăng ký sẽ thay khóa của thiết bị cũ. Nếu dùng chung cơ sở dữ liệu với người khác, hãy trao đổi với người quản trị hệ thống trước khi thực hiện để tránh gián đoạn thiết bị đang hoạt động.

Để chạy trên **wokwi.com**, trước hết triển khai backend của bạn tại một địa chỉ HTTPS công khai và kiểm tra `/health`. `backend\.env` trên máy cấu hình phải trỏ đến cùng database mà backend triển khai sử dụng.

Lấy chứng chỉ **root CA** đang xác thực HTTPS cho tên miền backend từ nguồn chính thức của CA, lưu dạng PEM trên máy (ví dụ `C:\certs\backend-root-ca.pem`). Không dùng khóa riêng TLS hoặc tắt kiểm tra chứng chỉ. Nếu chưa xác định được CA, kiểm tra chuỗi chứng chỉ của tên miền trong trình duyệt trước khi tiếp tục.

Từ thư mục gốc repository, thay URL và đường dẫn PEM bằng giá trị của hệ thống bạn:

```powershell
cd ..
.\iot\configure-device.ps1 -Project cs3-b101 -ApiUrl "https://YOUR-BACKEND.example.com" -CaCertificate "C:\certs\backend-root-ca.pem"
```

Lệnh `cd ..` ở đây chuyển từ `frontend` (mục 4.2–4.3) về thư mục gốc. Nếu terminal đã ở thư mục gốc, bỏ qua dòng đó. Các lệnh build ở mục 4.5 cũng chạy từ thư mục gốc.

Script đọc thông tin từ `device.json` và tạo `DeviceLocal.h` chứa URL, CA và khóa thiết bị. Tệp này bị Git bỏ qua. Nếu tệp đã tồn tại và cấu hình đúng, không cần đăng ký lại; chỉ build ở mục 4.5. Nếu chủ động thay khóa, thêm `-RotateKey` rồi build lại firmware; firmware dùng khóa cũ sẽ không kết nối được.

Đăng ký hàng loạt là **tùy chọn**, không cần cho demo một phòng. Từ thư mục gốc, chuyển vào `frontend` để xem trước:

```powershell
cd frontend
node .\scripts\register-campus-lighting.ts
```

Chỉ khi cần đăng ký toàn bộ phòng vào database đã kiểm tra, chạy:

```powershell
node .\scripts\register-campus-lighting.ts --write
cd ..
```

Script hàng loạt tạo cấu hình mới với gateway local mặc định, không tự cấu hình HTTPS cho wokwi.com. Trước khi build một phòng để chạy trên web, cập nhật URL/CA trong `DeviceLocal.h` của phòng đó, giữ nguyên khóa; hoặc dùng lệnh cấu hình HTTPS ở trên với `-RotateKey` nếu thực sự muốn thay khóa.

### 4.5. Build firmware

```powershell
pio run --project-dir .\iot\light-room\cs3-b101
```

Lệnh tạo file `.pio\build\esp32\firmware.elf` trong thư mục project. Trên wokwi.com chỉ cần file `firmware.elf`, không cần file `.bin`.

### 4.6. Chạy mô phỏng trên wokwi.com

1. Mở [wokwi.com](https://wokwi.com), chọn **New Project** → **ESP32**.
2. Mở tab `diagram.json`, dán nội dung từ `iot\light-room\cs3-b101\diagram.json`.
3. Thêm file `firmware.elf` từ thư mục `iot\light-room\cs3-b101\.pio\build\esp32` (nút **+** hoặc kéo thả). Không cần merge hay thêm file `.bin`.
4. Bấm **Start the simulation**.

Trên website, chọn **CS3** → **B101**. Khi board báo trực tuyến và đã báo GPIO, có thể điều khiển đèn.

> **Lưu ý quan trọng:** Firmware phải được build sau khi cấu hình HTTPS ở mục 4.4. Trên wokwi.com, board không truy cập được backend chạy trên `localhost`. Gateway `http://host.wokwi.internal:8000` là cấu hình dành cho môi trường có Wokwi Private Gateway được thiết lập riêng, không dùng cho luồng mô phỏng web trong hướng dẫn này.

### 4.7. Công thức điện năng ảo

Điện năng được tính theo thời gian đèn bật:

```
Điện năng (kWh) = Công suất (W) × Thời gian bật (giây) / 3 600 000
```

- Chỉ tính khi đèn ở trạng thái bật.
- Công suất lấy từ cấu hình đèn. Đèn chưa khai báo dùng `LIGHTING_DEFAULT_WATTS` (mặc định 20 W).

### 4.8. Khi mở rộng hoặc đổi cấu hình

- Thêm phòng: cập nhật GeoJSON; phòng tự có hai đèn trên web.
- Thay số lượng hoặc vị trí đèn của một phòng: cập nhật `properties.lights` trong dữ liệu phòng.
- Thêm cơ sở: thêm thư mục GeoJSON và bản ghi trong `campusSources.json`.
- Đổi mẫu chung: sửa `lightingDefaults.json`. Các board đã tạo **không tự thay đổi**; cần đồng bộ lại firmware, diagram, metadata và đăng ký DB.
- Hệ thống hiện chưa hỗ trợ thao tác xóa đèn hoặc thiết bị đã đăng ký với backend. Việc xóa thông tin đèn khỏi tệp GeoJSON **không xóa** bản ghi tương ứng trong cơ sở dữ liệu.
- Khi thử nghiệm hoặc trình diễn, chỉ mở và chạy mô phỏng Wokwi của những phòng cần sử dụng, không cần chạy tất cả các phòng cùng lúc. Các phòng chưa đăng ký thiết bị với backend sẽ chưa có kết nối; thiết bị đã đăng ký nhưng không chạy mô phỏng sẽ ở trạng thái ngoại tuyến (offline).

---

## 5. Thiết lập trạm đọc thẻ RC522

### 5.1. Phần cứng

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

### 5.2. Cài thư viện và nạp firmware

Mở `iot\card-reader` bằng VS Code có PlatformIO. Thư viện được khai báo trong `platformio.ini`:
- `miguelbalboa/MFRC522@1.4.12`
- `bblanchon/ArduinoJson@7.4.2`

Sau khi tạo cấu hình ở mục 5.3, chọn **PlatformIO: Upload** để build và nạp firmware vào board qua USB.

### 5.3. Cấu hình trạm trên máy chạy backend

```powershell
cd iot\card-reader
.\setup.ps1
```

Script hỏi:
- Tên Wi-Fi (2.4 GHz) và mật khẩu.
- Địa chỉ backend trong mạng LAN, ví dụ `http://192.168.1.10:8000`.

Các lệnh trên chạy từ thư mục gốc repository, trong PowerShell đã kích hoạt môi trường Python của backend. Script tạo khóa thiết bị và chạy khởi tạo trạm từ thư mục `backend`. Nếu script đã tạo `DeviceLocal.h` nhưng khởi tạo trạm lỗi, sửa cấu hình backend rồi từ thư mục `backend` chạy `python -m app.cards.router`; không xóa tệp hoặc chạy lại setup để thay khóa.

Với backend local, chạy `uvicorn main:app --host 0.0.0.0 --port 8000` từ thư mục `backend`, cho phép cổng 8000 trên mạng riêng trong tường lửa và dùng IP LAN của máy đó khi script hỏi URL. Board cần truy cập được mạng LAN này.

**Nếu dùng backend HTTPS đã triển khai:** chạy `.\setup.ps1 -SkipWifi` thay cho lệnh setup thông thường (chỉ khi chưa có `DeviceLocal.h`), sau đó điền Wi-Fi và sửa các dòng sau trong `DeviceLocal.h` trước khi Upload:

```cpp
#define READER_API_URL "https://YOUR-BACKEND.example.com"
#define READER_ALLOW_LAN_HTTP false
#define READER_ROOT_CA R"CA(-----BEGIN CERTIFICATE-----
NOI_DUNG_ROOT_CA_PEM
-----END CERTIFICATE-----)CA"
```

Thay toàn bộ nội dung chứng chỉ bằng root CA PEM hợp lệ như mục 4.4. Giữ nguyên `READER_ID` và `READER_DEVICE_KEY` do script tạo; cấu hình ID/key tương ứng (`CARD_READER_ID`, `CARD_READER_KEY`) trên backend triển khai phải khớp với cấu hình local. Khởi tạo trạm trên cùng database và khởi động lại backend sau khi cập nhật biến môi trường.

Sau đó đăng nhập Admin/Super Admin, mở menu **Đọc thẻ** trên website.

### 5.4. Đổi Wi-Fi cho board

Wi-Fi của board được lưu trong firmware, độc lập với Wi-Fi của máy tính. Nếu mang board đến nơi khác hoặc mạng cũ đổi tên/mật khẩu, thực hiện:

1. Mở tệp `iot\card-reader\DeviceLocal.h` đã được tạo ở mục 5.3.
2. Chỉ sửa hai dòng sau thành tên và mật khẩu Wi-Fi mới (giữ dấu ngoặc kép):

   ```cpp
   #define READER_WIFI_SSID "TEN_WIFI_MOI"
   #define READER_WIFI_PASSWORD "MAT_KHAU_WIFI_MOI"
   ```

3. Dùng mạng **2.4 GHz**; board không kết nối được mạng chỉ phát băng tần 5 GHz.
4. Giữ nguyên các cấu hình khác, đặc biệt là `READER_ID` và `READER_DEVICE_KEY`. Không cần chạy lại `setup.ps1` hay đăng ký lại trạm khi chỉ đổi Wi-Fi.
5. Kết nối board với máy tính bằng cáp USB truyền dữ liệu. Mở thư mục `iot\card-reader` trong VS Code, chọn **PlatformIO: Upload** để build và nạp lại firmware. Chỉ lưu tệp cấu hình mà chưa nạp lại thì board vẫn dùng Wi-Fi cũ.
6. Mở **PlatformIO: Serial Monitor** ở tốc độ **115200 baud** để kiểm tra kết nối, rồi thử quét thẻ trên website.

Nếu backend đã triển khai trên Internet và địa chỉ không đổi, giữ nguyên `READER_API_URL`; máy tính và board không cần cùng Wi-Fi. Nếu backend chạy trên máy tính bằng địa chỉ IP nội bộ, board phải truy cập được mạng đó; cập nhật `READER_API_URL` nếu địa chỉ IP của máy chạy backend thay đổi.

Không đưa tệp `DeviceLocal.h` lên GitHub hoặc chia sẻ công khai vì tệp chứa mật khẩu Wi-Fi và khóa thiết bị.

---

## 6. Thiết lập trạm ghi thẻ

Trạm ghi thẻ dùng **ESP32-S3** (YOLO UNO) và module RC522 thật, nạp firmware trong `iot\card-writer` bằng PlatformIO. Mở terminal tại thư mục gốc repository, kích hoạt môi trường Python của backend rồi chạy:

```powershell
cd iot\card-writer
.\setup.ps1
```

Sau khi script tạo cấu hình, mở thư mục `iot\card-writer` trong VS Code và chọn **PlatformIO: Upload** để nạp firmware vào board qua USB.

Chạy setup từ thư mục `iot\card-writer`, trong PowerShell đã kích hoạt môi trường Python của backend. Với HTTPS, dùng `.\setup.ps1 -SkipWifi` khi cấu hình lần đầu, sau đó điền Wi-Fi, URL, CA và tắt HTTP trong `iot\card-writer\DeviceLocal.h` như ví dụ mục 5.3. Đồng bộ `CARD_WRITER_ID`, `CARD_WRITER_KEY` với backend triển khai và khởi động lại backend. Nếu tệp đã tồn tại, sửa cấu hình tại chỗ, không chạy lại setup. Nếu cần chạy lại riêng bước khởi tạo trạm sau lỗi, từ thư mục `backend` chạy `python -m app.cards.writer`.

**Đổi Wi-Fi cho trạm ghi thẻ:** thực hiện tương tự mục 5.4, nhưng sửa tệp `iot\card-writer\DeviceLocal.h` và nạp firmware từ thư mục `iot\card-writer`. Hai trạm có cấu hình riêng; đổi Wi-Fi cho trạm đọc không tự đổi Wi-Fi cho trạm ghi.

Sau khi cấu hình xong, đăng nhập Admin/Super Admin và mở menu **Cấp thẻ** (`/card-writer`) để ghi MSSV lên thẻ.

---

## 7. Xử lý lỗi thường gặp

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| Backend báo thiếu `DATABASE_URL` hoặc `JWT_SECRET` | Chưa có `.env` hoặc chưa điền | Kiểm tra `backend\.env` |
| Frontend không gọi được API | Backend chưa chạy, hoặc sai `CORS_ORIGINS` | Chạy backend ở cổng 8000, kiểm tra `CORS_ORIGINS` |
| Board Wokwi không online | Backend chưa chạy hoặc đăng ký chưa xong | Chạy backend, kiểm tra bước 4.4 |
| `pio` không được nhận diện | PATH chưa có PlatformIO | Dùng terminal của PlatformIO |
| RC522 không đọc được thẻ | Nối dây sai hoặc cấp nguồn 5V | Kiểm tra bảng ở mục 5.1 |
