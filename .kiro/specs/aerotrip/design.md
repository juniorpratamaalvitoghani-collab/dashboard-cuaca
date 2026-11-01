# System Design — AeroTrip Studio (Hybrid 60% React : 40% Vanilla)

## 1. Arsitektur Modular
- Lapisan 40% Murni (src/vanilla/):
  - weatherEngine.js: Fungsi ES6 murni untuk computeSynchronizedCityWeather(), evaluateTravelSuitability(), generateSmartPackingList(), analyzeItineraryConflicts(), dan calculateHaversineDistanceKm().
  - weatherEffects.css: Variabel CSS3 dan styling glassmorphism.
- Lapisan 60% Framework (src/components/ & src/App.jsx):
  - Komponen React + Tailwind CSS yang mengelola state interaktif 12 kota, CRUD agenda perjalanan, checklist barang bawaan, dan integrasi peta OpenStreetMap + SVG Radar Jawa-Bali.
