# Trạm đọc thẻ RC522 + ESP32 NodeMCU-32S

Chỉ đọc thẻ thật và gửi kết quả lên trang **Đọc thẻ** (`/card-reader`).
Có thể ghi nhận điểm danh theo phiên toàn cơ sở; chưa xác minh sinh viên.
Không cấp thẻ hay ghi MSSV. Không gọi lệnh ghi
thẻ, không thử danh sách khóa hoặc phá khóa. Chỉ kiểm tra trên thẻ bạn sở hữu
hoặc được cho phép đọc. Tránh đưa UID/dữ liệu thẻ thật lên repository.

## Nối dây (rút USB trước)

| RC522 | ESP32 |
| --- | --- |
| VCC | 3V3, không dùng 5V |
| GND | GND |
| SCK | GPIO18 |
| MISO | GPIO19 |
| MOSI | GPIO23 |
| SDA / SS | GPIO21, dùng làm chọn chip SPI |
| RST | GPIO22 |
| IRQ | Bỏ trống |

| Còi active có transistor, nguồn 5V, tín hiệu tương thích 3.3V | ESP32 |
| --- | --- |
| S | GPIO25 |
| + | 5V khi cấp nguồn board qua USB |
| − | GND chung |

Chỉ áp dụng cho module còi có thông số như trên; không cấp còi trực tiếp
từ GPIO. Đấu theo nhãn chân, không theo màu dây. Cấu hình chân nằm trong
`include\ReaderConfig.h`. `BUZZER_ACTIVE_HIGH` mặc định true; đổi false nếu
module thực tế kích mức thấp. USB phải là cáp có truyền dữ liệu.

## Cấu hình trên máy chạy backend

Backend cần `.env` đã cấu hình database và dependency theo dự án.
Từ thư mục gốc repository:

```powershell
.\iot\card-reader\setup.ps1
```

Script hỏi SSID/password Wi-Fi và URL API LAN, tạo khóa riêng trong
`backend\.env` và `DeviceLocal.h` (đều không commit), khởi tạo duy nhất
bảng `card_reader_scan`, ba bảng `card_attendance_*` và dòng cấu hình cho trạm.
Không tạo/sửa bảng sinh viên.
Nếu đã có cấu hình riêng, script từ chối ghi đè: chỉnh trường mạng trong
`DeviceLocal.h` trên máy, không gửi mật khẩu qua chat.

ESP32 chỉ hỗ trợ Wi-Fi 2.4 GHz ở cấu hình này. Máy tính và ESP32 cần mạng
liên lạc được với nhau. **Không dùng localhost hay host.wokwi.internal**
trên board thật; dùng IP LAN của máy tính, ví dụ `http://192.168.1.10:8000`.
Chạy `ipconfig` trên máy để xem IPv4 của adapter Wi-Fi đang dùng.
Không mở database ra Internet, không tắt firewall toàn hệ thống; nếu cần,
chỉ cho phép backend trong mạng riêng tin cậy.

Restart backend sau setup để nhận khóa mới:

```powershell
Set-Location .\backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

HTTP gửi UID và khóa thiết bị không mã hóa, chỉ dành cho LAN phát triển tin cậy.
Triển khai thật phải dùng HTTPS, cấu hình `READER_ROOT_CA`, tắt
`READER_ALLOW_LAN_HTTP`; firmware kiểm chứng CA và đợi NTP, không dùng
`setInsecure`. Không đọc dữ liệu cá nhân trên mạng công cộng.

## Build, nạp, xem Serial

Từ gốc repository, đóng Serial Monitor khác đang chiếm cổng:

```powershell
pio run --project-dir .\iot\card-reader
pio device list
pio run --project-dir .\iot\card-reader --target upload --upload-port COM5
pio device monitor --port COM5 --baud 115200
```

Thay COM5 bằng cổng thực tế. Nếu không thấy cổng, kiểm tra cáp/driver CH340
từ nhà cung cấp đáng tin cậy. Một số board cần giữ BOOT lúc uploader kết nối.
Firmware này chạy phần cứng thật, không dùng Wokwi Start Simulator.

Chạy frontend, đăng nhập **Admin/Super Admin**, mở menu **Đọc thẻ**.
Thử thẻ, nhấc ra rồi chạm lại để quét lần kế tiếp. Trang hỏi API mỗi giây,
không cần tải lại. Kết quả lưu qua restart backend nhưng chỉ là lần quét cuối,
không phải báo thiết bị đang online.

Trang hiển thị riêng **Mã số sinh viên trên thẻ** khi đọc thành công khối 4
với đúng định dạng writer: 10 chữ số ASCII bắt đầu `245101` và 6 byte `00`.
Ví dụ `2451010001` được giữ nguyên số 0, không hiển thị phần đệm.
Dữ liệu không đúng định dạng hoặc đọc lỗi sẽ báo chưa đọc được MSSV,
không lấy MSSV từ UID hay giữ MSSV của lần quét trước. Đây chỉ là dữ liệu
trên thẻ, chưa xác minh sinh viên hợp lệ.
Thay đổi hiển thị MSSV chỉ cần backend/frontend. Quy tắc còi điểm danh mới
cần nạp lại reader như phần bên dưới.

## Phiên điểm danh toàn cơ sở

Với trạm đã cấu hình từ trước, khởi tạo thêm bảng một lần (không tạo phiên
hay log giả, không thay khóa):

```powershell
Set-Location .\backend
python -m app.cards.attendance
```

Restart backend nếu không dùng reload, cập nhật frontend và Upload firmware
**card-reader / nodemcu-32s** (không phải writer YOLO).

Quản trị mở trang **Đọc thẻ**, phần **Điểm danh bằng thẻ · Toàn cơ sở**:
1. Chọn cơ sở từ database; nếu chưa có, tạo tại Quản lý dữ liệu.
2. Chọn tự kết thúc sau 1–1440 phút, hoặc tắt để kết thúc thủ công.
3. Nhấn **Bắt đầu điểm danh bằng thẻ**, xác nhận cơ sở.
4. Quét thẻ có MSSV đúng định dạng: lưu MSSV, giờ nhận server, reader và phiên.
   Không lưu tên/hồ sơ sinh viên. Mỗi MSSV một log/phiên, kể cả quét bằng UID khác;
   lượt sau báo **Đã điểm danh**, không cập nhật thời gian ghi nhận đầu tiên.
5. Nhấn **Kết thúc điểm danh**, hoặc để hết thời lượng.
   Chưa mở, đã kết thúc và đúng thời điểm hết hạn đều báo
   **Đã quá giờ điểm danh**, không thêm log điểm danh.
6. Chọn phiên trong lịch sử để xem log (50 phiên gần nhất; log phân trang 50 dòng).

Luôn có thể chuyển cơ sở trên giao diện để xem trạng thái và lịch sử riêng của
cơ sở đó, kể cả khi phiên khác đang mở. Chuyển mục đang xem không kết thúc phiên
hoặc chuyển các lượt quét sang cơ sở mới. Lịch sử hiển thị 50 phiên gần nhất
**của cơ sở đang chọn**; đổi cơ sở sẽ bỏ lựa chọn log và trang phân trang cũ.

Một reader chỉ mở một phiên tại một thời điểm. Nếu nhấn bắt đầu khi cùng reader
đang bận, hệ thống thông báo rõ reader và cơ sở đang sử dụng, yêu cầu đợi phiên
đó kết thúc hoặc hết giờ. Backend kiểm tra lại trong transaction để không có
hai phiên cùng chiếm bộ đọc. Không tự xếp hàng, tự đóng phiên khác hoặc tự mở
phiên sau khi đợi. Khi reader rảnh, quản trị nhấn bắt đầu lại.
Hiện bản demo dùng reader cấu hình `CARD_READER_ID` chung cho các cơ sở;
chưa có giao diện gán nhiều reader độc lập.

Cơ sở được gắn khi quản trị mở phiên, không hard-code firmware. Mở phiên mới
cho phép cùng MSSV được ghi nhận lại. Không bắt buộc có bảng sinh viên.

Thời gian do server quyết định khi nhận scan; không tin giờ ESP32/trình duyệt.
Điều kiện hết hạn được kiểm tra ngay trong transaction nhận scan, không phụ thuộc
trình duyệt đang mở hoặc tác vụ scheduler. Phiên/lịch sử lưu trong database,
giữ qua restart. Kết quả ngoài giờ vẫn nằm trong bản chẩn đoán **lần quét cuối**,
nhưng không được thêm vào bảng log điểm danh. Không sửa thẻ.
Mất phản hồi không tự retry scan; kiểm tra log rồi quét lại, chống trùng theo MSSV.

Đây là ghi nhận thẻ mang MSSV đã quét, không chứng minh đúng người sở hữu,
không chống cho mượn/sao chép, không biết ai vắng khi thiếu danh sách sinh viên.

## Dữ liệu và còi

- Đọc UID 4/7/10 byte, nhận diện loại thẻ.
- Với MIFARE Classic, thử **khối 4**, Key A mặc định `FF FF FF FF FF FF`,
  đúng một lần; đọc được thì gửi 16 byte HEX. Có thể sửa `DATA_BLOCK` cho
  kiểm thử có chủ đích; không mặc định khối 4 chứa MSSV.
- Loại khác: gửi UID, ghi rõ chưa hỗ trợ đọc bộ nhớ.
- Thẻ trường đã đổi khóa có thể đọc UID nhưng không đọc được khối dữ liệu:
  đây không phải kết luận thẻ giả/không hợp lệ.
- UI hiển thị byte thô và ASCII (byte không in được thành dấu chấm),
  không tự nhận đó là MSSV hoặc tên sinh viên.
- Serial Monitor 115200 baud in UID, loại thẻ, trạng thái, khối đọc,
  HEX/ASCII và JSON trước khi gửi mạng, sau đó in kết quả xác nhận API.
  Không có Wi-Fi vẫn xem được kết quả đọc tại Serial. Không chia sẻ log
  chứa UID/dữ liệu thẻ cá nhân lên kênh công khai.
- Một tiếng ngắn: API xác nhận **đã thêm log điểm danh mới** trong phiên mở.
  Đọc MSSV đúng định dạng nhưng ngoài giờ không phát tín hiệu thành công này.
- Hai tiếng ngắn: đọc UID nhưng không đọc được khối/không hỗ trợ,
  dữ liệu không chứa MSSV đúng định dạng, đã điểm danh, ngoài giờ,
  hoặc phát hiện thẻ mà không đọc được UID.
- Ba tiếng ngắn: không gửi/không xác nhận được với API, ưu tiên hơn lỗi đọc khối.
- Lỗi đọc hoặc sai định dạng không phải kết luận thẻ giả/không thuộc sinh viên.
- Cần cập nhật/restart backend, khởi tạo bảng và Upload lại firmware
  **card-reader** để áp dụng quy tắc còi này; không nạp firmware writer.
  Backend cũ không trả kết quả điểm danh sẽ báo 3 nhịp, không báo thành công giả.
- Mỗi tiếng 100 ms, nghỉ 100 ms giữa các tiếng.
- Mất mạng không xếp hàng offline, không tự báo thành công; Serial yêu cầu
  chạm lại khi có mạng. Trong lúc HTTP đang chạy, trạm chưa nhận lần quét mới.

API nhận dùng khóa thiết bị, trang xem yêu cầu quản trị để tránh lộ UID.
Chỉ lưu một bản quét cuối mỗi trạm, không tạo lịch sử mỗi giây. Dữ liệu này
không cập nhật hồ sơ sinh viên. Log điểm danh riêng chỉ thêm khi phiên mở
và MSSV chưa được ghi nhận trong phiên đó.

## Giới hạn kiểm chứng

Build/test phần mềm không chứng minh dây nối, khả năng tương thích thẻ,
Wi-Fi hay đọc thực tế. Phải thử trực tiếp board/thẻ và xem Serial.
Thư viện MFRC522 1.4.12 công bố Unlicense; ArduinoJson dùng MIT,
PlatformIO Core Apache-2.0; Arduino ESP32 core có nghĩa vụ LGPL khi phân phối.
Cần kiểm tra license của các gói thực tế trước khi nộp bài, đây không phải
kiểm toán đầy đủ giấy phép. Không cần Wokwi cho trạm đọc phần cứng này.
