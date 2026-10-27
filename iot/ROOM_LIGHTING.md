# Cấu hình đèn theo phòng của khuôn viên mới

## Nguyên tắc

- Bản đồ đọc danh sách cơ sở từ
  [campusSources.json](../frontend/src/data/campusSources.json).
- Mọi phòng mặc định nhận hai đèn từ
  [lightingDefaults.json](../frontend/src/data/lightingDefaults.json).
  Phòng mới không cần sửa component.
- Có thể ghi đè `properties.lights` cho từng phòng; xem
  [quy ước dữ liệu](../frontend/src/data/README.md).
- Chưa đăng ký/chạy thiết bị thì chỉ có cấu hình đèn trên bản đồ,
  **không** giả lập trạng thái online hay điện năng tiêu thụ.
- Các bước tạo project dưới đây **không thay đổi database**.
  Chỉ bước đăng ký thiết bị mới ghi DB/đổi khóa.

## 1. Xem trước project

Cần Node.js 24.15+ và dependency frontend đã cài. Từ thư mục `frontend`:

```powershell
node .\scripts\create-lighting-device.ts --campus CS3 --room B101
```

Lệnh tra cơ sở/phòng thực tế, đọc danh sách đèn và kiểm tra GPIO.
Nếu không có phòng hoặc cấu hình sai, lệnh báo lỗi, không tự chọn phòng khác.
Mặc định chỉ xem trước; tên project được tạo từ cơ sở/phòng để tránh trùng
mã phòng giữa các cơ sở.

## 2. Tạo project khi cần

```powershell
node .\scripts\create-lighting-device.ts --campus CS3 --room B101 --write
```

Lệnh tạo thư mục `iot\light-room\cs3-b101` gồm:

| File | Vai trò |
| --- | --- |
| `platformio.ini` | Device ID/Room ID, dùng chung firmware |
| `DeviceLights.h` | Danh sách đèn và chân GPIO của board |
| `diagram.json` | Mạch ESP32, LED, điện trở và nút theo cấu hình |
| `wokwi.toml` | Đường dẫn firmware cho simulator |
| `device.json` | Thông tin đăng ký backend, không chứa khóa |

Không copy khóa hoặc firmware cũ từ A101/A102. Lệnh từ chối nếu thư mục đã
tồn tại để tránh ghi đè cấu hình/credential. Có thể chọn tên khác bằng
`--project ten-project`, nhưng không tạo hai thiết bị cho cùng đèn trong DB.

Đối với đèn khác mẫu, khai báo GPIO trong dữ liệu phòng trước khi tạo project.
Công cụ hỗ trợ danh sách đèn dài/ngắn khác nhau, không cố định vòng lặp hai đèn.
Giới hạn thực tế là số chân ESP32 có thể dùng và giới hạn firmware/API.
GPIO phải khác nhau giữa toàn bộ LED và nút; các chân dành cho flash,
Serial và chân chỉ đọc không được công cụ sử dụng.

## 3. Đăng ký với backend (có ghi database)

### Đăng ký toàn bộ phòng theo dữ liệu

Từ thư mục `frontend`, xem trước rồi chỉ ghi khi đã được nhóm đồng ý:

```powershell
node .\scripts\register-campus-lighting.ts
node .\scripts\register-campus-lighting.ts --write
```

Công cụ tạo project và khóa riêng cho từng phòng, gọi backend Python hiện có
để đăng ký. Khóa chỉ nằm trong `DeviceLocal.h` bị Git bỏ qua, không in ra log.
Chạy lại giữ nguyên khóa/phiên/lịch sử khi đăng ký đã khớp. Nếu khóa hoặc
danh sách đèn không khớp, công cụ dừng thay vì tự ghi đè. Có thể đã có một
phần phòng được đăng ký trước khi lỗi xảy ra; sửa nguyên nhân rồi chạy lại.
Đăng ký toàn bộ không build hay khởi chạy toàn bộ simulator.

### Đăng ký một project

**Chỉ chạy khi đã thống nhất với nhóm và cấu hình đúng database.**
Nếu cùng Device ID đã tồn tại, thao tác đăng ký thay khóa của thiết bị cũ,
kể cả máy mới chưa có `DeviceLocal.h`. Không chạy đồng thời hai simulator
cùng Device ID.

Từ thư mục gốc repository, dùng môi trường Python backend:

```powershell
.\iot\configure-device.ps1 -Project cs3-b101
```

Script đọc cơ sở, phòng, thiết bị và danh sách đèn từ `device.json`.
Không cần gõ lại các ID. Nếu truyền tham số khác metadata, script từ chối
trước khi ghi DB. `DeviceLocal.h` được tạo riêng và bị Git bỏ qua.
Script cũ với `-DeviceId`, `-CampusId`, `-RoomId` vẫn dùng được cho A101/A102.

Đăng ký không chuyển lịch sử IoT cũ sang phòng mới, không sửa dữ liệu lớp/lịch học.
Không tự đổi `nhon-duc` thành `CS1` hoặc `CS3`: đó là những địa chỉ khác nhau.

## 4. Build và chạy

```powershell
pio run --project-dir .\iot\light-room\cs3-b101
code --new-window .\iot\light-room\cs3-b101
```

Trong cửa sổ board, `F1 > Wokwi: Start Simulator`. Backend phải đang chạy
trên cổng 8000 nếu dùng URL local mặc định.
Chọn đúng cơ sở **CS3**, phòng **B101** trên website. Chờ board online và
báo GPIO trước khi điều khiển. Điện năng tự tính theo xác nhận từ board.

Muốn dùng HTTPS public hoặc cần hướng dẫn cài extension, xem
[hướng dẫn cài đặt](../HUONG_DAN_CAI_DAT.md).

## Khi mở rộng hoặc đổi cấu hình

- Thêm phòng: cập nhật GeoJSON; tự có hai đèn trên web.
- Thay số lượng/vị trí đèn một phòng: cập nhật `properties.lights`.
- Thêm cơ sở: thêm thư mục GeoJSON và bản ghi trong `campusSources.json`.
- Đổi mẫu chung: sửa `lightingDefaults.json`; các board đã sinh **không tự
  thay đổi**. Rà soát và đồng bộ firmware, diagram, metadata và đăng ký DB.
- Không xóa bớt đèn đã provision chỉ bằng cách rút khỏi dữ liệu: backend
  hiện không có luồng gỡ đèn/thiết bị; cần xử lý việc thu hồi và lịch sử riêng.
- Không khởi chạy 231 simulator chỉ để hiển thị 462 đèn. Chỉ chạy board
  cần trình diễn; các phòng khác giữ trạng thái chưa đăng ký/offline.
