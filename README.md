# ⚽ Halı Saha Turnuvası

GitHub Pages üzerinde çalışan, Firebase Firestore'a bağlı lig usulü halı saha turnuva sitesi.

- **Takımlar:** herkes takımını ve kadrosunu kaydedebilir, oyuncu ekleyip çıkarabilir.
- **Maçlar:** tek tek eklenebilir ya da Yönetim sayfasından tüm lig fikstürü (herkes herkesle) otomatik oluşturulur.
- **Skor, gol, asist:** maça tıkla → golü atan + asist yapan seç. Skor gollerden hesaplanır; "Maç oynandı" işaretlenince puan tablosuna yansır.
- **Puan durumu ve krallıklar** otomatik hesaplanır (galibiyet 3, beraberlik 1; sıralama puan → averaj → atılan gol).
- **Sıfırlama:** turnuva bitince (yönetici girişiyle) Yönetim → "Her Şeyi Sıfırla". Silmeden önce JSON yedeği otomatik iner.
- Tüm sayfalar canlı güncellenir; başka biri skor girdiğinde sayfayı yenilemeden görünür.

## Kurulum (bir kerelik, ~5 dk)

1. <https://console.firebase.google.com> → **Add project** (Google Analytics gerekmez).
2. **Build → Firestore Database → Create database** → *production mode* → konum `eur3 (europe-west)`.
3. **Build → Authentication → Get started → Sign-in method → Google** → Enable.
   **Settings → Authorized domains** listesine `<kullanıcı>.github.io` ekle.
4. [`firestore.rules`](firestore.rules) içindeki yönetici e-postasını kendi Gmail adresinle değiştir,
   içeriği Firestore **Rules** sekmesine yapıştır → **Publish**.
5. **Project settings (⚙️) → General → Your apps → Web (`</>`)** → çıkan `firebaseConfig` değerlerini
   ve aynı yönetici e-postasını (`ADMIN_EMAIL`) [`js/config.js`](js/config.js) içine yaz.
6. Commit + push. GitHub Pages birkaç dakika içinde güncellenir.

> Firebase web config değerleri (apiKey dahil) gizli değildir; tarayıcıya zaten gönderilir. Erişimi `firestore.rules` belirler.

## Yetkiler

| İşlem | Kim |
|---|---|
| Takım kaydı, oyuncu ekleme, maç ekleme, skor/gol/asist girme | Herkes (veri biçimi kurallarla denetlenir) |
| Takım/maç silme, fikstürü değiştirerek oluşturma, turnuva adı, **sıfırlama** | Yalnızca yönetici Google hesabı (kurallarla zorunlu) |

Herkes yazabildiği için biri skorları ya da kadroları bozabilir; önemli anlarda Yönetim → **Yedeği İndir** ile yedek al.

## Yerelde çalıştırma

```sh
python3 -m http.server 8000   # http://localhost:8000
npm test                      # puan tablosu / krallık / fikstür testleri (Node 20+)
```

## Yapı

| Dosya | Görev |
|---|---|
| `index.html`, `css/style.css` | Sayfa iskeleti ve stil |
| `js/app.js` | Sayfalar, formlar, modallar, yönlendirme |
| `js/db.js` | Firestore okuma/yazma |
| `js/stats.js` | Puan tablosu, krallıklar, fikstür üretimi (saf fonksiyonlar) |
| `js/config.js` | Firebase ayarları + yönetici e-postası |
| `firestore.rules` | Firestore güvenlik kuralları |
