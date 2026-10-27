# CampusOpt - Mo phong den ESP32 trong VS Code

## Tram the RC522 phan cung that

- [Card reader chi doc](card-reader/README.md): hien UID/du lieu the tren web.
- [Card writer cap MSSV](card-writer/README.md): quan tri nhap MSSV, xac nhan
  quyen ghi va cham lai dung the mau de ghi/kiem tra block 4.
  Chua xac minh sinh vien hay diem danh; khong dung the truong co du lieu san.

Tat ca project den va firmware dung chung nam trong `light-room/`.
Mo `light-room/<ten-project>` de chay Wokwi. Cong cu dang ky van o
`iot/configure-device.ps1`; tham so `-Project` chi la ten project.

Khuon vien moi CS1/CS3: moi phong ke thua hai den tu cau hinh chung.
Xem [tao project Wokwi theo phong](ROOM_LIGHTING.md) de tao board theo
du lieu, khong can copy/chinh ID thu cong tu A101/A102.
Hai project A101/A102 ben duoi la demo cu, khong tu gan vao phong moi.

Huong dan cai extension va chay tren may thanh vien moi:
[WOKWI_SETUP.md](WOKWI_SETUP.md).

Hai project doc lap, moi project mot ESP32 va hai LED vang dai dien den
phong hoc. Day la mo phong, khong do dien that. Firmware co kenh HTTP
dong bo hai chieu voi FastAPI. Neu chua co `DeviceLocal.h`, firmware bao
network disabled va van cho phep thu nut nhan/Serial cuc bo.

## Dong bo voi CampusOpt

- Web yeu cau trang thai, ESP32 nhan lenh, ap dung GPIO va bao xac nhan.
- Nut Wokwi/lenh Serial danh thuc tac vu mang de gui ngay, khong doi poll.
- Board va web poll moi 1 giay sau khi request truoc hoan tat; khong chong request.
  Board bao xac nhan ngay sau khi ap dung lenh thay vi doi them mot chu ky.
- Moi request dung socket rieng (HTTP/1.0, khong keep-alive). Body bi gioi han
  8 giay va 16 KiB: socket con mo nhung thieu du lieu khong duoc cho mai.
  Khong dung `HTTPClient::getString()` cua Arduino ESP32 2.0.17 vi vong doc
  body co the khong timeout khi socket van connected. Body loi duoc dong
  socket va retry; khong xac nhan GPIO tu JSON thieu/loi. Doi lai, HTTPS
  can bat tay lai moi request; uu tien on dinh hon toi uu do tre.
  Wi-Fi duoc cho ket noi
  va chi thu lai moi 15 giay, khong ngat ket noi dang thiet lap moi 3 giay.
  Loi HTTP van duoc bao va retry co backoff; khong bo qua TLS hay gia lap online.
  Main loop giam sat tac vu mang: neu khong tien trien qua 60 giay, in loi
  va tu restart board (khong xoa credential). GPIO tat ngan khi reboot,
  sau do lay lai desired state va bao xac nhan. Loi mang thong thuong van
  retry/backoff, khong reboot neu tac vu van tien trien. Log `IoT health`
  moi 15 giay cho biet uptime, Wi-Fi, buoc mang, tuoi phan hoi va heap.
  Neu uptime/log cung ngung, kiem tra simulator pause, may sleep hoac
  tab mo phong bi dinh chi; firmware khong the phuc hoi khi simulator
  khong thuc thi. Tat simulator thi web phai bao offline, khong gia online.
  Do tre thuc te con phu thuoc gateway, mang va DB. Poll nhanh hon tang tai API/DB;
  can do tai truoc khi mo rong nhieu thiet bi.
- Backend tai su dung danh sach den da khoa trong cung transaction, tranh query
  lai moi heartbeat; lenh web khong query lai snapshot sau commit.
- Web chi to vang theo trang thai **da bao ve**, khong theo lenh vua gui.
- Chi Admin/SuperAdmin duoc gui lenh; user dang nhap duoc xem.
- Khong lien lac qua 30 giay: offline; lenh qua 30 giay: qua han xac nhan.
  Lenh van duoc luu va se ap dung khi board noi lai, khong tu gia vo da tat.
  Backend cho phep doi nguong bang `LIGHTING_OFFLINE_SECONDS` va
  `LIGHTING_COMMAND_TIMEOUT_SECONDS` (so giay duong).
- Neu nut cuc bo xung dot lenh web chua xac nhan, lenh web moi nhat uu tien.
  Sau khi xac nhan, nut cuc bo duoc dong bo nguoc ve web.

### Khoi tao (chay mot lan cho moi thiet bi)

Backend can `DATABASE_URL`, `JWT_SECRET`, `HASH_KEY` nhu luong auth hien co.
Tu thu muc goc repo, chay:

```powershell
$env:PYTHONIOENCODING = "utf-8"
.\iot\configure-device.ps1 -Project a101 -DeviceId esp32-a101 -CampusId nhon-duc -RoomId A101
.\iot\configure-device.ps1 -Project a102 -DeviceId esp32-a102 -CampusId nhon-duc -RoomId A102
```

Script tao hai bang moi `lighting_device` va `room_light` trong DB dang
cau hinh, khong sua bang phong/lop/lich hoc. Khong can co A101/A102 trong
bang phong cua truong: day la ID mo hinh GeoJSON demo.
Moi board co key ngau nhien rieng: DB chi luu SHA-256, firmware doc key
tu `DeviceLocal.h` trong project. File nay va firmware da build bi Git
bo qua, KHONG chia se len kenh cong khai hay chay `pio run -v` khi co key.
Neu file da ton tai, script dung lai; chi dung `-RotateKey` khi co y dinh
doi key (can build/restart board sau do).

Chay backend va frontend nhu binh thuong, build lai hai firmware, sau do
Start Simulator trong hai cua so VS Code. Extension Wokwi VS Code co
gateway Wi-Fi tich hop; firmware dung `host.wokwi.internal:8000` de goi
backend local. Khong dung localhost cua board lam dia chi may tinh.
Neu log HTTP am/khong ket noi: kiem tra gateway, backend va firewall;
khong tat firewall hay mo cong DB ra Internet.

Tren web, chon A101/A102. Sau khi ESP32 bao trang thai, cong tac moi cho
dieu khien. Neu chua start Wokwi, web se bao offline, khong gia lap thanh cong.

### Trien khai HTTPS (khong phu thuoc may local)

1. Trien khai FastAPI voi DB PostgreSQL ben vung, tao bang/dang ky thiet bi
   tren **DB cua moi truong trien khai**, khong dung SQLite tam cho production.
2. Dung domain HTTPS va chuoi chung chi hop le; khong can port forwarding
   vao ESP32. Hai board chu dong goi API qua Internet.
3. Tai root CA PEM tu nha cung cap CA/hosting dang tin cay va kiem tra
   chuoi chung chi. Root CA la cong khai, khong phai private key.
4. Chay configure voi `DATABASE_URL` cua dung moi truong va URL HTTPS:

```powershell
# DATABASE_URL can duoc cau hinh rieng trong environment truoc lenh nay.
.\iot\configure-device.ps1 -Project a101 -DeviceId esp32-a101 -CampusId nhon-duc -RoomId A101 -ApiUrl "https://api.example.org" -CaCertificate "C:\certificates\root-ca.pem" -RotateKey
```

Lam tuong tu cho A102, build lai va khoi dong lai simulator.
Script nhung root CA vao config, tat HTTP local. Firmware doi NTP dong bo
dong ho truoc TLS, kiem tra chung chi/hostname, **khong dung setInsecure**.
URL la goc API, khong them `/iot/device` vao config.

Frontend: `VITE_API_URL` tro ve URL API trien khai; backend: CORS_ORIGINS
dung origin frontend, cookie auth secure khi HTTPS. Neu frontend/backend
khac site, can cau hinh SameSite va bien phap CSRF phu hop, nen uu tien
cung site/reverse proxy cho trien khai.

Server co the chay cloud trong khi Wokwi chay tren may ban: KHONG can
de gateway local/tunnel hoat dong de goi HTTPS public. Tuy nhien **hai
simulator van phai dang chay**. Deploy website khong tu khoi chay Wokwi.
Tat VS Code/simulator thi thiet bi offline; muon chay lien tuc can may
chay simulator lien tuc hoac ESP32 vat ly voi firmware/Wi-Fi phu hop.

Can thu tren URL trien khai that de xac nhan DNS, NTP, CA, gioi han hosting
va gateway. Build thanh cong hay test local khong chung minh cac dieu nay.

## Chuan bi

- VS Code + extension **PlatformIO IDE** va **Wokwi Simulator**.
- Kich hoat Wokwi qua `F1 > Wokwi: Request a new License` neu chua co.
  Quyen su dung tuy thuoc license/tai khoan, khong luu license vao Git.
- PlatformIO Core (`pio`) co trong PATH. Neu terminal khong nhan `pio`,
  mo terminal cua PlatformIO hoac dung PlatformIO: Build.

## Build tu thu muc goc repository (PowerShell)

```powershell
$env:PYTHONIOENCODING = "utf-8"
pio run --project-dir .\iot\light-room\a101
pio run --project-dir .\iot\light-room\a102
```

Lan dau can Internet de tai toolchain ESP32; cac lan sau dung cache.
Firmware duoc sinh trong `.pio/build/esp32/` cua tung project.
Khong commit `.pio/`.

## Mo va chay hai board

1. Mo **thu muc `iot/light-room/a101`** trong mot cua so VS Code rieng.
2. Build nhu tren, hoac bam PlatformIO: Build.
3. `F1 > Wokwi: Start Simulator`. Wokwi doc `wokwi.toml` va `diagram.json`.
4. Mo **thu muc `iot/light-room/a102`** trong cua so VS Code khac, lam tuong tu.
   Moi cua so mot mo phong; khong ghep hai board vao mot diagram.
5. Bam nut xanh la de dao trang thai `light-1`; nut xanh duong cho `light-2`.
   Den khoi dong o trang thai tat. Nhan giu nut chi doi trang thai mot lan.

Co the mo hai cua so bang terminal tu goc repository:

```powershell
code --new-window .\iot\light-room\a101
code --new-window .\iot\light-room\a102
```

Neu Wokwi bao khong tim thay firmware, build dung project truoc roi chay lai.
Khong can board that, khong bam Upload va khong can chon cong COM.

## Kiem thu logic firmware (tuy chon)

Neu may co `g++`, chay tu goc repository:

```powershell
g++ -std=c++11 -I .\iot\light-room\firmware\test\host -I .\iot\light-room\firmware\include .\iot\light-room\firmware\test\host\main_test.cpp -o "$env:TEMP\campusopt-light-test.exe"
& "$env:TEMP\campusopt-light-test.exe"
Remove-Item "$env:TEMP\campusopt-light-test.exe"
```

Test dung GPIO/Serial gia lap tren may tinh de kiem tra bat/tat doc lap,
lenh sai, gioi han buffer va chong doi nut. Khong thay the kiem tra hien thi
mach trong Wokwi.

## Dieu khien bang Serial Monitor cua Wokwi

Gui tung lenh, ket thuc bang Enter/newline:

```text
status
light-1 on
light-2 on
light-1 off
light-2 toggle
```

Moi lan doi trang thai, firmware in mot dong JSON voi `source: simulated`,
`device_id`, `room_id`, `light_id`, `on`, `uptime_ms`.
JSON nay la log cuc bo; kenh HTTP rieng gui GPIO/revision ve FastAPI.
`uptime_ms` la thoi gian
tu luc board khoi dong, khong phai timestamp UTC hay dien nang.

## Cau hinh va mo rong

| Project | Device ID | Phong | LED 1 | LED 2 |
| --- | --- | --- | --- | --- |
| a101 | esp32-a101 | A101 | light-1 | light-2 |
| a102 | esp32-a102 | A102 | light-1 | light-2 |

- Firmware dung chung: [main.cpp](./light-room/firmware/src/main.cpp).
- Board/framework dung chung: [platformio-common.ini](./platformio-common.ini).
- Device ID/phong: `build_flags` trong `platformio.ini` tung project.
- So den va GPIO: [LightConfig.h](./light-room/firmware/include/LightConfig.h).
  Vong lap tu duyet danh sach, khong co logic rieng cho A101/A102.
  Khi them den, cap nhat ca `diagram.json` de mach khop voi GPIO.
- LED 1: GPIO 18 -> dien tro 220 ohm -> LED A; LED C -> GND.
- LED 2: GPIO 19 -> dien tro 220 ohm -> LED A; LED C -> GND.
- Nut 1/2: GPIO 25/26 -> nut -> GND, dung INPUT_PULLUP.
- ID `light-1`/`light-2` khop hai den A101 va A102 tren web.

API: `/iot/device/connect` tao session moi, `/iot/device/sync` gui sequence
tang dan va toan bo danh sach den. Server tra desired state/revision;
board ap dung va bao lai o vong tiep theo. Credential nam trong header
X-Device-Id/X-Device-Key, khong dung cookie nguoi dung cho ESP32.
Session/sequence cu bi tu choi. Lenh web dung expected_revision de tranh
ghi de trang thai tu giao dien cu; DB lock device truoc light cho nhieu worker.
Firmware dung task mang rieng de HTTP khong chan viec doc nut nhan.

Kiem thu backend (SQLite tam, khong dong vao DB that):

```powershell
Set-Location .\backend
python -m unittest discover -s tests -p test_lighting.py -v
```

Neu thieu thu vien test, cai `pip install -r requirements-dev.txt`.

## Dien nang phong va Dashboard

Truoc khi chay backend phien ban co dien nang, chay mot lan tren DB dich:

```powershell
Set-Location .\backend
python -m app.lighting.energy --init-db
```

Lenh idempotent nay chi tao `light_energy_meter` va `light_energy_interval`,
khong sua bang truong hoc, khong xoay key hay reset board. Moi truong moi
van can provision thiet bi nhu huong dan o tren (provision cung tao bang dien nang).

Nguoi dung chi bat/tat den: dien nang tu tich luy khi ESP32 xac nhan bat,
tat thi ngung. Khong can nhap W hay bam bat dau trong UI. Backend tu tao
bo theo doi cho den da provision khi nhan bao cao, dung cong suat
**gia dinh** mac dinh `LIGHTING_DEFAULT_WATTS=20` (W, lon hon 0, toi da 10000).
Lenh init-db cung bo sung bo theo doi cho den hien co; khong ghi de cong
suat da luu. Doi bien moi truong chi ap dung cho bo theo doi moi.
Neu can cau hinh ky thuat rieng, API admin `/lighting/rooms/{campus}/{room}/lights/{light}/power`
van nhan `{"watts":18}`, nhung khong la buoc bat buoc cho nguoi dung.
Khong dung cong suat LED Wokwi lam so do thuc te; khong tao lich su truoc
luc bat dau theo doi.

- UI phong hien dien nang hom nay, cong suat hien tai va chi tiet tung den.
- Dashboard hien tong, trung binh/phong co du lieu, bang phong va bieu do
  7/30 ngay; bo loc co so IoT rieng, khong dong nhat ID GeoJSON voi ID so
  cua du lieu lich hoc. Chi tinh cac den da cau hinh, khong goi la tong dien truong.
- Cong thuc: `kWh = W * giay bat / 3600000`. Chi bao cao GPIO duoc chap nhan
  moi doi trang thai tinh dien; lenh web pending khong tu bat dau tinh.
- Gia dinh trang thai cu giu nguyen giua hai xac nhan, toi da nguong
  `LIGHTING_OFFLINE_SECONDS` sau xac nhan cuoi. Qua nguong do: thoi gian
  khong xac dinh, khong cong dien nang. Reconnect can xac nhan lai GPIO.
  Khong the khoi phuc chinh xac thoi diem bam nut trong luc mang mat.
- Luu khoang trang thai da dong va cong suat tai thoi diem do; doi W chi
  anh huong tu luc luu, khong viet lai lich su. Heartbeat cung trang thai
  chi gia han xac nhan; GET tong hop khong ghi DB, khong cong trung.
- Ngay theo Asia/Ho_Chi_Minh (UTC+7); API `/lighting/energy?days=7`
  ho tro 1-90 ngay, `campus_id` va `room_id` (room can campus).
  Ngay chua co du lieu tra `null`, khac ngay co xac nhan tat den (0 kWh).
  Trung binh = tong / so phong co thoi gian duoc ghi nhan trong dung ky;
  du lieu thieu duoc danh dau, khong coi phong chua co du lieu la 0.
- UI cap nhat dien nang moi 5 giay; refresh/restart backend khong mat lich su.
  Khong doi dong ho server nguoc hay thay nguong offline giua dot do:
  phan chua dong duoc uoc tinh theo nguong dang cau hinh.

Tieu de UI la "Dien nang"; tooltip giai thich day la uoc tinh tu cong suat
va thoi gian, khong phai so do cong to. Khong dung so nay de tuyen bo
tiet kiem dien thuc te khi chua co du lieu doi chung.

## Tai lieu

- [Wokwi for VS Code](https://docs.wokwi.com/vscode/getting-started)
- [PlatformIO + Wokwi](https://docs.wokwi.com/vscode/platformio)

Firmware cua nhom theo MIT cua repository. Wokwi la cong cu mo phong rieng,
khong nen mo ta no la phan mem ma nguon mo; xac nhan dieu kien cong cu voi
ban to chuc neu the le yeu cau toan bo cong cu phat trien phai ma nguon mo.
