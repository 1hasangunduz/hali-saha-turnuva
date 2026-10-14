# ⚽ Halı Saha Turnuvası

GitHub Pages üzerinde çalışan, Firebase Firestore'a bağlı lig usulü halı saha turnuva sitesi.

- **Takımlar:** herkes takımını ve kadrosunu kaydedebilir, oyuncu ekleyip çıkarabilir.
- **Maçlar:** tek tek eklenebilir ya da Yönetim sayfasından tüm lig fikstürü (herkes herkesle) otomatik oluşturulur.
- **Skor, gol, asist:** maça tıkla → golü atan + asist yapan seç. Skor gollerden hesaplanır; "Maç oynandı" işaretlenince puan tablosuna yansır.
- **Puan durumu ve krallıklar** otomatik hesaplanır (galibiyet 3, beraberlik 1; sıralama puan → averaj → atılan gol).
- **Sıfırlama:** turnuva bitince Yönetim → "Her Şeyi Sıfırla". Silmeden önce JSON yedeği otomatik iner.
- Tüm sayfalar canlı güncellenir; başka biri skor girdiğinde sayfayı yenilemeden görünür.

## Kurulum (bir kerelik, ~5 dk)

1. <https://console.firebase.google.com> → **Add project** (Google Analytics gerekmez).
2. Sol menü **Build → Firestore Database → Create database** → *production mode* → konum olarak `eur3 (europe-west)` seç.
3. Firestore'da **Rules** sekmesi → bu repodaki [`firestore.rules`](firestore.rules) içeriğini yapıştır → **Publish**.
4. **Project settings (⚙️) → General → Your apps → Web (`</>`)** → uygulamayı kaydet → çıkan `firebaseConfig` değerlerini [`js/config.js`](js/config.js) içine yapıştır.
5. Commit + push. GitHub Pages birkaç dakika içinde güncellenir.

> Firebase web config değerleri (apiKey dahil) gizli değildir; tarayıcıya zaten gönderilir. Erişimi `firestore.rules` belirler.

## Yönetici PIN'i

Fikstür oluşturma, takım/maç silme ve sıfırlama PIN ister. PIN'i değiştirmek için:

```sh
echo -n "YENIPIN" | shasum -a 256
```

Çıkan değeri `js/config.js` içindeki `ADMIN_PIN_SHA256` alanına yaz.

⚠️ **PIN yalnızca arayüzde bir engeldir.** Site herkese açık yazılabilir olduğu için teknik bilgisi olan biri tarayıcı konsolundan veriyi değiştirebilir veya silebilir. Firestore kuralları sadece veri biçimini ve boyutunu denetler. Önemli anlarda Yönetim → **Yedeği İndir** ile yedek al.

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
| `js/config.js` | Firebase ayarları + PIN hash'i |
| `firestore.rules` | Firestore güvenlik kuralları |
