<p align="center">
  <img src="unia.png" alt="Unia Logo" width="180" style="filter: drop-shadow(0 0 12px rgba(184, 158, 255, 0.45));" />
</p>

<h1 align="center">Unia</h1>

<p align="center">
  <strong>Unia Desktop Music Player</strong> — Deezer ve YouTube entegrasyonu ile zenginleştirilmiş, Discord Zengin Durum (RPC) ve gelişmiş ses ekolayzırı barındıran modern, şık ve premium bir masaüstü müzik çalar.
</p>

---

## 🚀 Özellikler

- **🎵 YouTube ve Deezer Entegrasyonu**: Deezer API'si üzerinden müzik arayın ve akıllı arama algoritmasıyla YouTube üzerinden yüksek kaliteli ses akışı gerçekleştirin.
- **💾 Arka Plan Yerel Önbelleği (Offline Playback)**: En son dinlediğiniz 10 şarkı arka planda otomatik olarak `.cache/` klasörüne MP3 olarak indirilir. İnternetiniz olmadığında veya tekrar çalındığında diskten anında (caching-hit) çalar.
- **🎛️ 5-Bant Gelişmiş Ekolayzır (EQ)**: Müzik zevkinize göre ses frekanslarını ayarlayın. *Bass Booster, Vocal Booster, Pop, Electronic* presets mevcuttur (Yerel offline dosyalar için geçerlidir).
- **🎮 Discord Rich Presence (RPC)**: Dinlediğiniz şarkıyı, sanatçıyı, albüm kapağını ve çalma süresini Discord profilinizde zengin durum olarak gösterin.
- **🎨 Dinamik Arayüz Yerleşimleri**:
  - Standart Düzen
  - Ters Ayna Düzeni (Mirrored)
  - Side-by-Side (Sol & Sağ)
  - Kompakt Minimalist
  - Sinematik Geniş Ekran
- **🎨 Akıllı Renk Çıkarımı**: Çalan şarkının albüm kapağından baskın renkleri otomatik olarak analiz eder ve arayüz temasını o renk paletine göre dinamik olarak günceller.
- **⏰ Uyku Zamanlayıcısı**: Şarkı bitiminde veya belirlediğiniz süre sonunda (5dk, 15dk, 30dk, 1saat) oynatmayı otomatik durdurun.
- **📂 Yerel Dosya Oynatma**: Bilgisayarınızdaki yerel MP3 dosyalarını kitaplığınıza ekleyin ve ekolayzır desteği ile çalın.

---

## 🛠️ Kurulum ve Çalıştırma

Projeyi yerel bilgisayarınızda çalıştırmak için aşağıdaki adımları izleyin:

### Gereksinimler
- [Node.js](https://nodejs.org/) (v16 veya üzeri tavsiye edilir)
- [Git](https://git-scm.com/)

### Adımlar

1. **Projeyi Klonlayın**:
   ```bash
   git clone https://github.com/xenpian/unia.git
   cd unia
   ```

2. **Bağımlılıkları Yükleyin**:
   ```bash
   npm install
   ```

3. **Uygulamayı Başlatın**:
   ```bash
   npm start
   ```
   *Bu komut Electron uygulamasını başlatır ve otomatik olarak yerel bir API sunucusunu (port 3000) ayağa kaldırır.*

---

## 📂 Klasör Yapısı

```text
unia/
├── android/            # Android native mobil projesi
├── js/                 # Arayüz, tema, player ve state modülleri
│   ├── player.js       # Playback kontrolü, ses akışı ve EQ
│   ├── state.js        # Global uygulama durumu (durum yönetimi)
│   ├── theme.js        # Dinamik renk teması çıkarma motoru
│   └── ui-renderers.js # Slider, şarkı listesi ve profil render işlemleri
├── logo/               # Unia logoları ve ikonları (unia.png, unia.ico)
├── pages/              # Dinamik olarak yüklenen sayfa şablonları (home.html, playlist.html, vb.)
├── src/
│   └── api-router.js   # Önbelleğe alma, YouTube arama ve akış API rotaları
├── db.js               # JSON tabanlı yerel veritabanı (unia_local_db.json)
├── main.js             # Electron ana süreci (main process)
├── preload.js          # Güvenli Electron-Node IPC köprüsü (bridge)
└── renderer.js         # Ön yüz orkestrasyon ve olay yöneticisi
```

---

## 📝 Katkıda Bulunma

1. Bu depoyu çatallayın (fork).
2. Yeni bir özellik dalı (feature branch) oluşturun: `git checkout -b yeni-ozellik`.
3. Değişikliklerinizi taahhüt edin (commit): `git commit -m 'feat: Yeni özellik eklendi'`.
4. Dalınızı uzak depoya gönderin (push): `git push origin yeni-ozellik`.
5. Bir Çekme İsteği (Pull Request) açın.

---

## 📄 Lisans
Bu proje **MIT Lisansı** ile lisanslanmıştır.
