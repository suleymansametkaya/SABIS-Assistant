# SABIS Ogrenci Yardim Eklentisi (SABIS-Note-Assistant)

Sakarya Universitesi ogrencileri icin gelistirilmis Chrome/Edge uzantisi.
Not asistani, odev takibi ve kisa sinav takibini tek eklentide birlestirir.

---

## Ozellikler

### 1) Not Asistani (Ders / Transkript)
- Ders sayfalarinda bos not hucrelerine giris alani ekler.
- Girilen notlarla ders ortalamasini canli hesaplar.
- Transkript ekraninda AKTS ve GPA hesaplamalarini gunceller.

### 2) Odev Takibi
- SABIS duyurularindan odevleri toplar.
- Odevleri Yaklasan / Uzun Sureli / Suresi Gecen olarak gruplar.
- Popup icinden tek tikla yenileme yapar.

### 3) Kisa Sinav Takibi
- `esinav.sabis.sakarya.edu.tr` sinav listesini ceker.
- Kisa sinavlari Yaklasan / Uzun Sureli / Suresi Gecen olarak filtreler.
- "Katil" butonu sinav katilim sayfasini acar.

### 4) Tek Popup, Cok Mod
- Popup icinde Odevler / Kisa Sinavlar sekmeleri vardir.
- Not asistanini popup icinden ac/kapat yapabilirsin.

---

## Kurulum (Gelistirici Mod)

1) Depoyu indirin veya `git clone` yapin.
2) Tarayicida `chrome://extensions` acin.
3) Gelistirici Modu acin.
4) "Paketlenmemis uzanti yukle" ile proje kok klasorunu secin.

Not: `.pem` ve `.crx` dosyalari gerekmez.

---

## Kullanim

- Eklenti ikonuna tiklayinca popup acilir.
- Popup icinde "Odevler" ve "Kisa Sinavlar" sekmeleri vardir.
- "SABIS'i ac" ana sayfayi acar.
- "Ayarlar" ile esik gun degerlerini degistirebilirsin.
- Not asistanini popup icinden aktif/pasif yapabilirsin.

---

## Ekran Goruntuleri

| Once | Sonra |
|:--:|:--:|
| ![Once 1](assets/images/before1.png) | ![Sonra 1](assets/images/after1.png) |
| ![Once 2](assets/images/before2.png) | ![Sonra 2](assets/images/after2.png) |

---

## Dizin Yapisi (Ozet)

- `manifest.json`
- `assets/`
  - `icons/` (uzanti ikonlari)
  - `images/` (ekran goruntuleri)
- `src/content/` (not asistani + background)
- `src/homework/` (odev + sinav takip popup, offscreen, collector)

---

## Katki ve Destek

- Projeyi begenirsen star verebilirsin.
- Yeni ozellikler icin PR gonderebilirsin.
- Hata/istekler icin issue acabilirsin.

---

## Iletisim

- ozdemirosmantahir@gmail.com
- suleymansametkaya@gmail.com
