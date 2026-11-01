# Requirements Specification — AeroTrip Studio (12 Kota Jawa-Bali)

## 1. Ikhtisar Proyek
AeroTrip Studio adalah aplikasi web Dashboard Cuaca, Rencana Perjalanan (Itinerary Planner), & Peta Geospasial untuk 12 destinasi utama di Jawa dan Bali (Jakarta & Sekitarnya, Bandung, Semarang, Yogya, Solo, Kediri, Malang, Surabaya, Jember, Canggu, Ubud, Denpasar) dengan komposisi 60% Modern Framework (React + Vite + Tailwind CSS) dan 40% HTML5/CSS3/Vanilla JS Murni.

## 2. Kebutuhan Fungsional (Notasi EARS)
- REQ-01 (100% Weather Synchronization): WHEN pengguna memilih salah satu dari 12 kota, mengklik jam pada prakiraan per jam, atau menggeser simulator cuaca, THE SYSTEM SHALL menyinkronkan suhu, kondisi cuaca, peluang hujan, kelembapan, indeks UV, dan animasi kanvas secara serempak.
- REQ-02 (HTML5 Canvas Weather Radar): WHILE kondisi cuaca kota aktif ditampilkan, THE SYSTEM SHALL merender animasi partikel hujan, awan, atau cerah secara real-time pada elemen <canvas> HTML5 sesuai persentase hujan dan kecepatan angin.
- REQ-03 (Travel Suitability & Conflict Engine): WHEN terdapat agenda perjalanan bertipe Outdoor pada jam dengan peluang hujan >= 55%, THE SYSTEM SHALL menandai jadwal tersebut sebagai konflik cuaca dan menyediakan tombol optimasi otomatis ke alternatif Indoor.
- REQ-04 (Interactive Geospatial Map & Haversine Route): WHEN pengguna membuka seksi Peta Geospasial, THE SYSTEM SHALL menampilkan peta jalan OpenStreetMap beserta Radar Koordinat SVG berbentuk kontur Pulau Jawa, Madura, dan Bali lengkap dengan kalkulator jarak Haversine (km).
