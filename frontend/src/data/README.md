# Den phong theo du lieu

Nguon khuon vien nam trong [campusSources.json](./campusSources.json):
moi co so tham chieu thu muc chua `building.geojson` va `room-3d.geojson`.
Them co so bang du lieu, khong them nhanh dieu kien vao component.

## Cau hinh den

[lightingDefaults.json](./lightingDefaults.json) la mau dung chung:
mac dinh moi phong co hai den `light-1`, `light-2`. Khong can them thu cong
462 doi tuong den vao 231 phong. Phong moi cung tu nhan mau nay.

- Khong co `properties.lights`: ke thua mau mac dinh.
- `properties.lights: []`: chu dong khong lap den trong phong.
- `properties.lights: [...]`: thay the toan bo mau bang danh sach rieng.
  Moi den can `id`, `name`, `position: [longitude, latitude]` nam trong polygon.
- Vi tri mac dinh dung `offset: [x, y]` trong khoang (0, 1) cua bounding box.
  Neu diem do nam ngoai polygon lom, he thong tim diem ben trong gan nhat.
  Khong tim duoc diem phu hop thi bao loi; hay khai bao vi tri rieng.
- ID den chi can duy nhat trong phong. Dia chi API la
  `(campusId, room.id, light.id)`, khong phai ten hien thi hay ma phong tu DB lich hoc.
- `ledPin`, `buttonPin` phuc vu cong cu sinh firmware/diagram. Den rieng co
  cung ID voi mau se ke thua GPIO; ID moi can khai bao GPIO rieng, khong trung nhau.

Vi du ghi de tren mot feature phong:

```json
{
  "lights": [
    {
      "id": "light-1",
      "name": "Den bang",
      "position": [100.5208, -0.0097],
      "ledPin": 18,
      "buttonPin": 25
    }
  ]
}
```

Toa do chi la vi du, phai doi thanh diem nam trong polygon phong thuc te.
Thay doi mau chung anh huong tat ca phong ke thua; khong tu sua thiet bi
hay du lieu da dang ky trong database.

## Ket noi Wokwi va dien nang

Den tren ban do khong gia vo online: chua dang ky thi hien
"Chua dang ky thiet bi", cong tac khong dieu khien duoc.
Xem [huong dan tao board theo phong](../../../iot/ROOM_LIGHTING.md).
Khong tu dong dang ky hang tram board hay doi key tren database chung.

Khoi Dien nang doc API `/lighting/energy`, khong tinh tich luy tren trinh duyet.
Backend tu gan cong suat mac dinh `LIGHTING_DEFAULT_WATTS=20` cho meter moi;
cong suat khong lay tu GeoJSON hay LED mo phong. Khong can nhap so dien.
Ngay chua co du lieu khac ngay co xac nhan tat den (0 kWh).
Du lieu IoT cu van giu nguyen trong DB, khong tu doi phong `nhon-duc/A101`
thanh phong cua khuon vien moi.

## Kiem tra

Tu `frontend`, voi Node.js 24.15+:

```powershell
node --test .\scripts\room-lighting.test.ts
```

Test doc toan bo phong hien tai, kiem tra moi phong hai den, ID/vi tri khong
trung va nam trong polygon, ghi de mac dinh, polygon lom va cau hinh board.
