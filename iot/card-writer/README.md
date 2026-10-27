# Ghi MSSV bằng YOLO UNO ESP32-S3 + RC522 thật

Project này **có ghi thẻ**, tách khỏi `card-reader` chỉ đọc.
Chỉ dùng thẻ trắng/thẻ mẫu thuộc quyền của bạn. Không dùng thẻ trường
có dữ liệu sẵn hoặc thay đổi UID/khóa thẻ.

## Phạm vi

- Quản trị nhập MSSV gồm đúng **10 chữ số, bắt đầu 245101**, ví dụ `2451010001`.
  `xxxx` là ký hiệu minh họa, không phải dữ liệu có thể ghi.
- Theo lựa chọn hiện tại: chưa thêm hồ sơ sinh viên và chưa chọn sinh viên
  từ database. MSSV đúng định dạng không đồng nghĩa sinh viên hợp lệ.
- Chỉ ghi **khối 4**, 10 byte ASCII MSSV + 6 byte `00`.
  Không ghi block 0 (UID/nhà sản xuất), sector trailer hay đổi khóa.
- Tự nhận diện MIFARE Mini/Classic 1K/4K; loại khác bị từ chối.
  Chỉ biết tần số 13,56 MHz chưa đủ để kết luận thẻ ghi được.
- Thử Key A mặc định `FF FF FF FF FF FF` một lần. Không phá/thử nhiều khóa.
- Chỉ thay khối 4 toàn byte `00` hoặc đang chứa đúng định dạng MSSV trên.
  Nội dung khác bị từ chối, không tự xóa. Một số thẻ mẫu không phải byte `00`;
  xem dữ liệu bằng reader trước, không bỏ kiểm tra để ép ghi.

## Phần cứng

Dùng YOLO UNO ESP32-S3 + RC522 riêng cho writer. Reader vẫn là NodeMCU-32S
với sơ đồ cũ; **không dùng sơ đồ GPIO NodeMCU cho YOLO UNO**.
Chân cấu hình riêng trong `include\WriterConfig.h`, theo nhãn D trên board:

| RC522 | Nhãn YOLO UNO | GPIO ESP32-S3 |
| --- | --- | --- |
| VCC | 3.3V, không phải 5V | Nguồn |
| GND | GND | Mass chung |
| SCK | D13 | 48 |
| MISO | D12 | 47 |
| MOSI | D11 | 38 |
| SDA (SS) | D10 | 21 |
| RST | D9 | 18 |
| IRQ | Bỏ trống | - |

SDA trên RC522 là chân chọn chip SPI (SS), **không nối vào SDA/I2C của YOLO**.
Số trong firmware là GPIO thật, không phải số D. Không dùng GPIO19/20 vì USB.

Module còi có transistor, nguồn 5V và nhận tín hiệu 3.3V:
S → **D8 (GPIO17)**, + → 5V USB, − → GND chung. Rút USB trước khi đấu dây.
Không chạy writer và reader nối hai board vào cùng một RC522.

Ánh xạ SPI được đối chiếu với
[định nghĩa chân chính thức của OhStem](https://github.com/AITT-VN/ohstem_arduino_board/blob/main/ohstem_esp32-2.0.11/variants/yolo_uno/pins_arduino.h).

## Cấu hình lần đầu

Từ gốc repository, dùng môi trường Python backend:

```powershell
.\iot\card-writer\setup.ps1
```

Script dùng lại công cụ setup với vai trò writer, tạo **khóa riêng khác reader**,
lưu trong `backend\.env` và `iot\card-writer\DeviceLocal.h` bị Git bỏ qua.
Hỏi Wi-Fi 2.4 GHz và IP LAN backend. Không dùng localhost/host.wokwi.internal.
Nếu đã có header, sửa trường mạng tại máy; script không ghi đè hoặc xoay khóa.
Chưa muốn nhập Wi-Fi: dùng `-SkipWifi`, sau đó điền header trước khi nạp.

Khởi tạo bảng `card_writer_station`, `card_write_job`, không thêm bảng sinh viên,
không sửa dữ liệu reader/đèn. Restart backend để nạp router và khóa mới:

```powershell
Set-Location .\backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

HTTP chỉ cho LAN phát triển tin cậy: khóa, UID và MSSV chưa mã hóa trên đường
truyền. Khi triển khai phải dùng HTTPS với root CA hợp lệ, NTP, đặt
`READER_ALLOW_LAN_HTTP=false`. Không có `setInsecure`.
Các macro `READER_*` trong header là tên cấu hình giao tiếp dùng chung;
giá trị ID/key phải là của **writer**, không copy key reader sang writer.

## Build và nạp writer

Từ gốc repository:

```powershell
pio device list
pio run --project-dir .\iot\card-writer --environment yolo-uno
pio run --project-dir .\iot\card-writer --environment yolo-uno --target upload --upload-port COM6
pio device monitor --port COM6 --baud 115200
```

Environment mặc định là `yolo-uno`, không còn là `nodemcu-32s`.
PlatformIO dùng target ESP32-S3-DevKitC-1 cho toolchain, ánh xạ GPIO riêng cho
YOLO UNO, USB CDC bật để xem Serial qua USB-C. Không phải cấu hình chân DevKitC.
Giữ platform/thư viện đã pin như reader để tránh đổi giao thức.

Tài liệu OhStem có thông tin flash không đồng nhất (16MB ở phần giới thiệu,
4MB ở bảng thông số và mặc định board Arduino). Firmware này chỉ dùng partition
4MB bảo thủ, không bật/không phụ thuộc PSRAM; không khai thác toàn bộ flash board.
Xem [thông số OhStem](https://docs.ohstem.vn/en/latest/yolo_uno/yolo_uno_khoi_lenh/gioi_thieu_yolo_uno.html).

Thay COM6 bằng cổng USB của **YOLO UNO**, không lấy cổng NodeMCU reader.
Đừng chọn nhầm board reader:
nạp writer vào board reader sẽ đổi chức năng của board đó.
Đóng Serial Monitor đang chiếm đúng cổng trước khi nạp.

Nếu lần đầu không kết nối được uploader: giữ **BOOT**, nhấn/thả **RESET**,
chờ khoảng 2 giây rồi thả BOOT; chạy `pio device list` để chọn lại cổng.
Theo [hướng dẫn bootloader OhStem](https://docs.ohstem.vn/en/latest/yolo_uno/arduino_yolo_uno/upload_code.html).
Sau upload, nếu cần nhấn RESET để chạy ứng dụng; cổng USB CDC có thể đổi số COM.
Mở lại Monitor trên cổng mới, mong đợi log `CampusOpt writer: YOLO UNO ESP32-S3`.

Khi chuyển từ writer NodeMCU sang YOLO UNO, giữ `DeviceLocal.h` của writer
(Wi-Fi/API/ID/key), không chạy setup lần nữa và không lấy header reader.
Tắt/rút USB board writer cũ, chỉ để **một** writer dùng ID/key này hoạt động.

## Cấp từng thẻ trên web

1. Đăng nhập Admin/Super Admin → menu **Cấp thẻ** (`/card-writer`).
2. Chạm thẻ mẫu vào writer để gửi UID/loại thẻ lên web. Bước này chưa ghi.
   Ô xác nhận chỉ mở khi web đã nhận UID. Nếu ô bị khóa, kiểm tra Wi-Fi,
   địa chỉ backend và log writer trước; nhập MSSV không thay thế bước lấy UID.
3. Nhập MSSV thật, ví dụ `2451010001`, tick xác nhận quyền ghi đúng thẻ.
4. Bấm ủy quyền, kiểm tra lại UID và MSSV trong hộp xác nhận.
5. **Nhấc thẻ ra rồi chạm lại đúng thẻ**, giữ yên đến khi có kết quả.
   Lệnh chờ tối đa 120 giây. Sai UID không được nhận lệnh ghi.
6. Chỉ khi UI báo **Đã ghi và đọc lại đúng MSSV** mới coi cấp thẻ thành công.
7. Đưa sang trạm reader: dữ liệu ASCII khối 4 hiện MSSV và 6 dấu chấm
   cho 6 byte `00`. Reader có thể điểm danh khi quản trị mở phiên tại cơ sở;
   vẫn chưa xác minh danh tính sinh viên.
8. Lặp lại với thẻ/MSSV tiếp theo; không tự tăng MSSV.

Còi writer (mỗi nhịp 100 ms, nghỉ 100 ms):
- 1 nhịp khi quét UID thẻ tương thích và API xác nhận nhận UID. Bước này **chưa ghi**.
- Sau ủy quyền và chạm lại: 1 nhịp khi ghi/đọc lại thành công và API xác nhận kết quả.
- 2 nhịp khi lỗi đọc UID, loại thẻ không hỗ trợ hoặc lỗi đọc/ghi đã báo về API.
- 3 nhịp khi không gửi được/không xác nhận được thao tác với hệ thống.
  Khi mất Wi-Fi vẫn nhận lần chạm thẻ tương thích để báo 3 nhịp, không ghi offline.
  Nếu đồng thời lỗi thao tác thẻ và lỗi gửi kết quả, lỗi gửi ưu tiên 3 nhịp.
- Poll nền không phát còi. Khi đang giữ kết quả chưa xác nhận hoặc đã dừng vì
  lệnh ghi không xác định, không nhận thẻ mới; phải xử lý lệnh trước.

Một nhịp chỉ báo thành công của **bước đang thực hiện**, không xác minh sinh viên.
Reader có quy tắc riêng: 1 nhịp khi API xác nhận thêm log điểm danh mới trong phiên mở,
không phải xác minh sinh viên; xem [hướng dẫn reader](../card-reader/README.md).

## Khi có lỗi hoặc mất mạng

- `Writer RC522 version: 0x92` cho thấy đọc được thanh ghi phiên bản module,
  không chứng minh đã ghi thẻ. Nếu tiếp theo báo `transport -1 (connection refused)`,
  chưa có phản hồi HTTP từ backend; không phải lỗi khóa thẻ.
  Kiểm tra backend đang chạy `--host 0.0.0.0 --port 8000`, URL là IP LAN hiện tại,
  hai thiết bị có thể liên lạc và firewall cho phép backend trên mạng riêng.
  Không tắt firewall toàn hệ thống, không mở cổng ra Internet.
  Firmware in IP/gateway/RSSI và URL đích, không in mật khẩu hay key.
- HTTP 401/403: kiểm tra ID/key writer; 404: kiểm tra URL/router;
  503: kiểm tra setup và log backend. Không sửa middleware để bỏ xác thực.
- API chỉ cấp mỗi lệnh một lần, khóa theo trạm; không tự ghi lại khi retry.
- Sau khi ghi, nếu API chưa nhận kết quả, firmware chỉ gửi lại **kết quả**,
  không ghi lại thẻ. Giữ board chạy để nó xác nhận; chưa chuyển sang thẻ khác.
- Nếu response cấp lệnh bị mất, firmware dừng ghi và báo không xác định.
  Không coi đó là thành công.
- Nếu mất nguồn sau khi nhận lệnh, UI có thể kẹt ở trạng thái chưa xác định:
  **thẻ có thể đã thay đổi**. Restart writer, đọc lại thẻ bằng reader.
  Sau 120 giây từ lúc nhận lệnh, quản trị có thể bấm xử lý kết quả chưa xác định,
  xác nhận đã dừng/restart writer và kiểm tra thẻ, rồi đóng lệnh.
- Hủy chỉ chắc chắn có tác dụng với lệnh chưa được writer nhận.
  Không có rollback phần cứng sau khi block đã ghi.
- Lỗi ghi/đọc lại: không tự thử ghi lần nữa; kiểm tra trước khi tạo lệnh mới.
- Lịch sử lệnh lưu admin, UID, MSSV, thời điểm và kết quả để truy vết; chưa có
  ràng buộc một MSSV một thẻ, chưa thu hồi thẻ cũ và chưa chống sao chép thẻ.

## Kiểm thử phần mềm

```powershell
g++ -std=c++11 -Wall -Wextra -Werror .\iot\card-writer\test\payload_test.cpp -o "$env:TEMP\writer-test.exe"
& "$env:TEMP\writer-test.exe"
Remove-Item -LiteralPath "$env:TEMP\writer-test.exe"
```

Build và test không chứng minh thẻ/module thực tế đọc ghi được. Cần thử với
thẻ mẫu được phép ghi và kiểm tra read-back bằng trạm reader.
Thư viện/giấy phép giống trạm reader; xem
[lưu ý giấy phép](../card-reader/README.md). Đây chưa phải giải pháp bảo mật thẻ
hoàn chỉnh: khóa mặc định và MSSV dạng rõ có thể bị đọc/sao chép.
