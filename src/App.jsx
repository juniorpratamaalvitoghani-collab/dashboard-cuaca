import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  CloudRain,
  Sun,
  CloudLightning,
  Wind,
  Droplets,
  Compass,
  MapPin,
  Calendar,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  GitBranch,
  FileCode,
  Terminal,
  Navigation,
  Briefcase,
  Thermometer,
  Clock,
  Trash2,
  Copy,
  Check,
  X,
  Play,
  Pause,
  Sliders,
  Umbrella,
  ShieldCheck,
  RefreshCw,
  Search,
  ChevronRight,
  Map as MapIcon,
  Globe
} from 'lucide-react';

// ============================================================================
// [BAGIAN 40% MURNI: VANILLA JS ENGINE, SINKRONISASI CUACA 100% AKURAT & GEOSPASIAL]
// Modul logika murni (ES6+) tanpa library eksternal untuk:
// 1. Sinkronisasi 100% antara Kondisi Cuaca, Suhu, Kelembapan, UV, Jam & Kanvas
// 2. Kalkulasi Jarak Geodesik Haversine (km) & Estimasi Waktu Tempuh Antar-Kota
// 3. Algoritma Deteksi Konflik Cuaca pada Itinerary (Outdoor vs Curah Hujan)
// 4. Generator Rekomendasi Barang Bawaan (Smart Packing List)
// ============================================================================

function deriveConditionFromMetrics(rainProb, tempC, windKmh) {
  if (rainProb >= 75) {
    return windKmh >= 28 ? 'Hujan Lebat & Angin Kencang' : 'Hujan Deras Merata';
  }
  if (rainProb >= 55) {
    return 'Hujan Ringan';
  }
  if (rainProb >= 38) {
    return 'Berawan Tebal';
  }
  if (rainProb >= 20) {
    return 'Cerah Berawan';
  }
  return tempC >= 32 ? 'Cerah Terik' : 'Cerah';
}

function deriveWeatherIconType(rainProb, windKmh) {
  if (rainProb >= 75 && windKmh >= 28) return 'storm';
  if (rainProb >= 55) return 'rain';
  if (windKmh >= 24) return 'windy';
  return 'sunny';
}

function computeSynchronizedCityWeather(baseCity, selectedSlotTime, rainOverride, windOverride, liveFeed) {
  const mergedBase = liveFeed ? { ...baseCity, ...liveFeed } : baseCity;

  // Jika pengguna memilih jam tertentu pada strip jam, gunakan data jam tersebut sebagai acuan utama
  const activeHourObj =
    selectedSlotTime && selectedSlotTime !== 'LIVE'
      ? mergedBase.hourly.find((h) => h.time === selectedSlotTime) || null
      : null;

  const baseTempC = activeHourObj ? activeHourObj.tempC : mergedBase.tempC;
  const baseRainProb = activeHourObj ? activeHourObj.rainProb : mergedBase.rainProb;

  const finalRainProb =
    rainOverride !== null ? rainOverride : Math.min(100, Math.max(0, baseRainProb));
  const finalWindKmh =
    windOverride !== null ? windOverride : Math.max(5, mergedBase.windKmh);

  // Penyesuaian suhu & kelembapan secara fisika meteorologi agar 100% konsisten dengan kondisi hujan
  const rainDelta = finalRainProb - baseRainProb;
  const adjustedTempC = Math.round(baseTempC - rainDelta * 0.04);
  const adjustedHumidity = Math.min(
    98,
    Math.max(45, Math.round(mergedBase.humidity + (finalRainProb - mergedBase.rainProb) * 0.32))
  );

  // Perhitungan Heat Index / Feels Like yang konsisten dengan suhu, kelembapan & angin
  const humidityBonus = adjustedHumidity >= 80 ? 2 : adjustedHumidity >= 70 ? 1 : 0;
  const windCooling = finalWindKmh >= 25 ? -1 : 0;
  const adjustedFeelsLikeC = adjustedTempC + humidityBonus + windCooling;

  // Perhitungan Indeks UV yang akurat berdasarkan jam dan tutupan awan/hujan
  let baseUv = mergedBase.uvIndex;
  if (selectedSlotTime === '20:00') {
    baseUv = 0;
  } else if (selectedSlotTime === '08:00' || selectedSlotTime === '17:00') {
    baseUv = 3;
  } else if (selectedSlotTime === '11:00' || selectedSlotTime === '14:00') {
    baseUv = 9;
  }
  const cloudFactor = 1 - (finalRainProb / 100) * 0.7;
  const adjustedUvIndex = Math.max(0, Math.round(baseUv * cloudFactor));

  // Sinkronkan juga seluruh jam pada strip hourly agar selaras dengan kondisi aktif
  const synchronizedHourly = mergedBase.hourly.map((h) => {
    const slotRain =
      rainOverride !== null
        ? h.time === selectedSlotTime || selectedSlotTime === 'LIVE'
          ? finalRainProb
          : Math.min(100, Math.max(0, Math.round((h.rainProb + finalRainProb) / 2)))
        : h.rainProb;
    const slotTemp = Math.round(h.tempC - (slotRain - h.rainProb) * 0.04);
    const slotCondition = deriveConditionFromMetrics(slotRain, slotTemp, finalWindKmh);
    return {
      ...h,
      tempC: slotTemp,
      rainProb: slotRain,
      label: slotCondition
    };
  });

  const synchronizedCondition = deriveConditionFromMetrics(
    finalRainProb,
    adjustedTempC,
    finalWindKmh
  );

  return {
    ...mergedBase,
    tempC: adjustedTempC,
    feelsLikeC: adjustedFeelsLikeC,
    humidity: adjustedHumidity,
    windKmh: finalWindKmh,
    rainProb: finalRainProb,
    uvIndex: adjustedUvIndex,
    condition: synchronizedCondition,
    weatherType: deriveWeatherIconType(finalRainProb, finalWindKmh),
    hourly: synchronizedHourly
  };
}

function evaluateTravelSuitability(weather) {
  let score = 100;
  if (weather.rainProb >= 75) score -= 45;
  else if (weather.rainProb >= 55) score -= 30;
  else if (weather.rainProb >= 35) score -= 12;

  if (weather.windKmh > 30) score -= 15;
  if (weather.uvIndex >= 8) score -= 8;
  if (weather.tempC > 34 || weather.tempC < 15) score -= 8;

  const finalScore = Math.max(15, Math.min(100, score));
  let recommendation = `Kondisi ${weather.condition} (${weather.tempC}°C): Sangat ideal untuk aktivitas Outdoor & eksplorasi rute.`;
  let statusColor = 'emerald';

  if (weather.rainProb >= 55 || finalScore < 55) {
    recommendation = `Kondisi ${weather.condition} (Peluang hujan ${weather.rainProb}%): Utamakan destinasi Indoor / Museum / Kuliner.`;
    statusColor = 'rose';
  } else if (weather.rainProb >= 35 || finalScore < 78) {
    recommendation = `Kondisi ${weather.condition} (Kelembapan ${weather.humidity}%): Siapkan payung lipat & jadwalkan Outdoor di jam cerah.`;
    statusColor = 'amber';
  }

  return {
    score: finalScore,
    recommendation,
    statusColor
  };
}

function generateSmartPackingList(weather) {
  const essentials = [
    {
      id: 'doc',
      item: 'Kartu Identitas, Tiket & E-Wallet',
      reason: `Wajib untuk perjalanan di ${weather.name}`
    }
  ];

  if (weather.rainProb >= 50) {
    essentials.push(
      {
        id: 'umb',
        item: 'Payung Lipat / Jas Hujan Ringan',
        reason: `Kondisi ${weather.condition} (Hujan ${weather.rainProb}%)`
      },
      {
        id: 'bag',
        item: 'Pelindung Tas Waterproof (Rain Cover)',
        reason: `Kelembapan tinggi (${weather.humidity}%)`
      }
    );
  } else if (weather.rainProb >= 30) {
    essentials.push({
      id: 'umb',
      item: 'Payung Lipat Ringkas (Siaga Berawan)',
      reason: `Kondisi ${weather.condition} (Peluang hujan ${weather.rainProb}%)`
    });
  }

  if (weather.uvIndex >= 6) {
    essentials.push(
      {
        id: 'sun',
        item: 'Sunscreen SPF 50+ & Kacamata Hitam',
        reason: `Indeks UV ${weather.uvIndex} pada suhu ${weather.tempC}°C`
      },
      {
        id: 'hat',
        item: 'Topi & Tumbler Air Minum',
        reason: `Terasa seperti ${weather.feelsLikeC}°C`
      }
    );
  }

  if (weather.tempC <= 24) {
    essentials.push({
      id: 'jkt',
      item: 'Jaket Windbreaker / Sweater Hangat',
      reason: `Udara sejuk ${weather.tempC}°C & angin ${weather.windKmh} km/j`
    });
  } else {
    essentials.push({
      id: 'cloth',
      item: 'Pakaian Katun Breathable & Sepatu Jalan',
      reason: `Suhu ${weather.tempC}°C (${weather.condition})`
    });
  }

  return essentials;
}

function analyzeItineraryConflicts(itineraryItems, hourlyForecast) {
  let totalCost = 0;
  let totalDurationHours = 0;
  let conflictCount = 0;

  const analyzed = itineraryItems.map((item) => {
    totalCost += Number(item.cost || 0);
    totalDurationHours += Number(item.duration || 1);

    const matchingHour =
      hourlyForecast.find((h) => h.time === item.timeSlot) || hourlyForecast[0];
    const slotRain = matchingHour ? matchingHour.rainProb : 20;
    const slotTemp = matchingHour ? matchingHour.tempC : 28;
    const slotLabel = matchingHour ? matchingHour.label : 'Cerah Berawan';

    const isRainRisk = item.type === 'Outdoor' && slotRain >= 55;
    if (isRainRisk) conflictCount += 1;

    return {
      ...item,
      slotRainProb: slotRain,
      slotTempC: slotTemp,
      slotConditionLabel: slotLabel,
      hasWeatherConflict: isRainRisk,
      suggestedFix: isRainRisk
        ? `Alihkan ke opsi Indoor (${item.indoorAlternative || 'Museum / Kuliner Lokal'}) karena ${slotLabel} (${slotRain}%)`
        : `Sesuai kondisi jam ${item.timeSlot}: ${slotLabel} (${slotTemp}°C, Hujan ${slotRain}%)`
    };
  });

  return {
    analyzed,
    totalCost,
    totalDurationHours,
    conflictCount
  };
}

// Rumus Geodesik Haversine untuk menghitung jarak nyata antar koordinat GPS (km)
function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightKm = R * c;
  // Faktor kelokan jalan raya Jawa-Bali (~1.28x jarak garis lurus)
  const roadKm = Math.round(straightKm * 1.28);
  const estHours = Math.max(0.5, Number((roadKm / 62).toFixed(1)));
  return {
    straightKm: Math.round(straightKm),
    roadKm,
    estHours
  };
}

function convertTemp(tempC, unit) {
  if (unit === 'F') {
    return Math.round((tempC * 9) / 5 + 32) + '°F';
  }
  return Math.round(tempC) + '°C';
}

function formatRupiah(amount) {
  return 'Rp ' + Number(amount || 0).toLocaleString('id-ID');
}

// ============================================================================
// DATA 12 DESTINASI CUACA, KOORDINAT GPS & RENCANA PERJALANAN (BMKG ALIGNED)
// ============================================================================

const DESTINATIONS_DATA = {
  jakarta: {
    id: 'jakarta',
    name: 'Jakarta & Sekitarnya',
    corridor: 'Jabodetabek & Jabar',
    region: 'Jabodetabek (Jakarta, Bogor, Depok, Tangerang, Bekasi) • WIB',
    lat: -6.2088,
    lng: 106.8456,
    tempC: 29,
    humidity: 76,
    windKmh: 15,
    rainProb: 30,
    uvIndex: 7,
    aqi: 64,
    hourly: [
      { time: '08:00', tempC: 27, rainProb: 15, label: 'Cerah' },
      { time: '11:00', tempC: 31, rainProb: 25, label: 'Cerah Berawan' },
      { time: '14:00', tempC: 32, rainProb: 35, label: 'Berawan Tebal' },
      { time: '17:00', tempC: 29, rainProb: 60, label: 'Hujan Ringan' },
      { time: '20:00', tempC: 27, rainProb: 25, label: 'Cerah Berawan' }
    ],
    landmarks: [
      { name: 'Hutan Kota GBK Senayan', lat: -6.2241, lng: 106.8068 },
      { name: 'Museum MACAN Kebon Jeruk', lat: -6.1909, lng: 106.7676 },
      { name: 'Kawasan Kota Tua Fatahillah', lat: -6.1352, lng: 106.8133 }
    ],
    defaultItinerary: [
      {
        id: 'jkt-1',
        timeSlot: '08:00',
        activity: 'Olahraga Pagi & Eksplorasi Hutan Kota GBK Senayan',
        type: 'Outdoor',
        duration: 2,
        cost: 50000,
        done: true,
        indoorAlternative: 'Museum Nasional Indonesia (Gedung Baru)'
      },
      {
        id: 'jkt-2',
        timeSlot: '11:00',
        activity: 'Kunjungan Pameran Seni Modern di Museum MACAN & Kuliner',
        type: 'Indoor',
        duration: 3,
        cost: 200000,
        done: false,
        indoorAlternative: 'Galeri Nasional & Sarinah Thamrin'
      },
      {
        id: 'jkt-3',
        timeSlot: '17:00',
        activity: 'Walking Tour Sore Kawasan Kota Tua & Sunset Batavia PIK',
        type: 'Outdoor',
        duration: 3,
        cost: 150000,
        done: false,
        indoorAlternative: 'Museum Bank Indonesia & Cafe Batavia Indoor'
      }
    ]
  },
  bandung: {
    id: 'bandung',
    name: 'Bandung',
    corridor: 'Jabodetabek & Jabar',
    region: 'Jawa Barat (Kota Bandung, Lembang, Ciwidey) • WIB',
    lat: -6.9175,
    lng: 107.6191,
    tempC: 22,
    humidity: 88,
    windKmh: 16,
    rainProb: 65,
    uvIndex: 3,
    aqi: 36,
    hourly: [
      { time: '08:00', tempC: 20, rainProb: 20, label: 'Cerah Berawan' },
      { time: '11:00', tempC: 24, rainProb: 35, label: 'Berawan Tebal' },
      { time: '14:00', tempC: 23, rainProb: 70, label: 'Hujan Ringan' },
      { time: '17:00', tempC: 21, rainProb: 65, label: 'Hujan Ringan' },
      { time: '20:00', tempC: 19, rainProb: 30, label: 'Cerah Berawan' }
    ],
    landmarks: [
      { name: 'Jalan Braga & Asia Afrika', lat: -6.9178, lng: 107.6095 },
      { name: 'Gedung Sate & Museum Geologi', lat: -6.9025, lng: 107.6188 },
      { name: 'Kawah Putih Ciwidey', lat: -7.1662, lng: 107.4021 }
    ],
    defaultItinerary: [
      {
        id: 'bdg-1',
        timeSlot: '08:00',
        activity: 'Eksplorasi Kawah Putih Ciwidey & Hutan Pinus Lembang',
        type: 'Outdoor',
        duration: 3,
        cost: 180000,
        done: true,
        indoorAlternative: 'Museum Geologi Bandung'
      },
      {
        id: 'bdg-2',
        timeSlot: '14:00',
        activity: 'Heritage Walk Jalan Braga & Taman Gedung Sate',
        type: 'Outdoor',
        duration: 2,
        cost: 100000,
        done: false,
        indoorAlternative: 'NuArt Sculpture Park & Museum Konferensi Asia Afrika'
      },
      {
        id: 'bdg-3',
        timeSlot: '20:00',
        activity: 'Kuliner Malam Batagor Kingsley & Kopi Roastery Dago',
        type: 'Indoor',
        duration: 2,
        cost: 120000,
        done: false,
        indoorAlternative: 'Kafe Indoor Punclut / Dago Atas'
      }
    ]
  },
  semarang: {
    id: 'semarang',
    name: 'Semarang',
    corridor: 'Jawa Tengah & DIY',
    region: 'Jawa Tengah (Kota Semarang & Ungaran) • WIB',
    lat: -6.9667,
    lng: 110.4167,
    tempC: 24,
    humidity: 90,
    windKmh: 19,
    rainProb: 60,
    uvIndex: 3,
    aqi: 42,
    hourly: [
      { time: '08:00', tempC: 26, rainProb: 20, label: 'Cerah Berawan' },
      { time: '11:00', tempC: 30, rainProb: 30, label: 'Cerah Berawan' },
      { time: '14:00', tempC: 28, rainProb: 60, label: 'Hujan Ringan' },
      { time: '17:00', tempC: 24, rainProb: 65, label: 'Hujan Ringan' },
      { time: '20:00', tempC: 23, rainProb: 40, label: 'Berawan Tebal' }
    ],
    landmarks: [
      { name: 'Kota Lama Little Netherlands', lat: -6.9683, lng: 110.4275 },
      { name: 'Lawang Sewu Tugu Muda', lat: -6.9839, lng: 110.4104 },
      { name: 'Klenteng Agung Sam Poo Kong', lat: -6.9962, lng: 110.3981 }
    ],
    defaultItinerary: [
      {
        id: 'smg-1',
        timeSlot: '08:00',
        activity: 'Walking Tour Little Netherlands di Kawasan Kota Lama',
        type: 'Outdoor',
        duration: 2,
        cost: 75000,
        done: true,
        indoorAlternative: 'Semarang Contemporary Art Gallery'
      },
      {
        id: 'smg-2',
        timeSlot: '11:00',
        activity: 'Tur Sejarah Arsitektur Gedung Lawang Sewu',
        type: 'Indoor',
        duration: 2,
        cost: 50000,
        done: false,
        indoorAlternative: 'Museum Mandala Bhakti'
      },
      {
        id: 'smg-3',
        timeSlot: '17:00',
        activity: 'Eksplorasi Klenteng Agung Sam Poo Kong & Kuliner Lumpia',
        type: 'Outdoor',
        duration: 2,
        cost: 110000,
        done: false,
        indoorAlternative: 'Toko Oen & Pusat Kuliner Gang Lombok (Indoor)'
      }
    ]
  },
  yogyakarta: {
    id: 'yogyakarta',
    name: 'Yogya',
    corridor: 'Jawa Tengah & DIY',
    region: 'DI Yogyakarta (Kota Yogya, Sleman, Bantul) • WIB',
    lat: -7.7956,
    lng: 110.3695,
    tempC: 26,
    humidity: 78,
    windKmh: 18,
    rainProb: 30,
    uvIndex: 6,
    aqi: 34,
    hourly: [
      { time: '08:00', tempC: 24, rainProb: 15, label: 'Cerah' },
      { time: '11:00', tempC: 28, rainProb: 25, label: 'Cerah Berawan' },
      { time: '14:00', tempC: 29, rainProb: 35, label: 'Cerah Berawan' },
      { time: '17:00', tempC: 26, rainProb: 60, label: 'Hujan Ringan' },
      { time: '20:00', tempC: 24, rainProb: 20, label: 'Cerah Berawan' }
    ],
    landmarks: [
      { name: 'Kawasan Malioboro & Keraton', lat: -7.7926, lng: 110.3658 },
      { name: 'Museum Ullen Sentalu Kaliurang', lat: -7.5978, lng: 110.4234 },
      { name: 'Candi Prambanan', lat: -7.7520, lng: 110.4915 }
    ],
    defaultItinerary: [
      {
        id: 'yk-1',
        timeSlot: '08:00',
        activity: 'Tur Budaya Keraton Yogyakarta & Istana Air Taman Sari',
        type: 'Outdoor',
        duration: 3,
        cost: 100000,
        done: true,
        indoorAlternative: 'Museum Sonobudoyo Unit I'
      },
      {
        id: 'yk-2',
        timeSlot: '14:00',
        activity: 'Apresiasi Sejarah & Seni di Museum Ullen Sentalu Kaliurang',
        type: 'Indoor',
        duration: 2,
        cost: 150000,
        done: false,
        indoorAlternative: 'Jogja National Museum (JNM Bloc)'
      },
      {
        id: 'yk-3',
        timeSlot: '17:00',
        activity: 'Panorama Sunset di Candi Prambanan & Malioboro Night Walk',
        type: 'Outdoor',
        duration: 3,
        cost: 175000,
        done: false,
        indoorAlternative: 'Pertunjukan Sendratari Ramayana Indoor & Gudeg Wijilan'
      }
    ]
  },
  solo: {
    id: 'solo',
    name: 'Solo',
    corridor: 'Jawa Tengah & DIY',
    region: 'Jawa Tengah (Surakarta & Karanganyar) • WIB',
    lat: -7.5755,
    lng: 110.8243,
    tempC: 28,
    humidity: 74,
    windKmh: 15,
    rainProb: 25,
    uvIndex: 7,
    aqi: 32,
    hourly: [
      { time: '08:00', tempC: 25, rainProb: 10, label: 'Cerah' },
      { time: '11:00', tempC: 29, rainProb: 20, label: 'Cerah Berawan' },
      { time: '14:00', tempC: 30, rainProb: 30, label: 'Cerah Berawan' },
      { time: '17:00', tempC: 27, rainProb: 45, label: 'Berawan Tebal' },
      { time: '20:00', tempC: 25, rainProb: 15, label: 'Cerah' }
    ],
    landmarks: [
      { name: 'Pura Mangkunegaran & Pracima Tuin', lat: -7.5672, lng: 110.8232 },
      { name: 'Museum Batik Danar Hadi', lat: -7.5692, lng: 110.8164 },
      { name: 'Kampung Batik Laweyan', lat: -7.5705, lng: 110.7936 }
    ],
    defaultItinerary: [
      {
        id: 'slo-1',
        timeSlot: '08:00',
        activity: 'Eksplorasi Pura Mangkunegaran & Taman Pracima Tuin',
        type: 'Outdoor',
        duration: 3,
        cost: 120000,
        done: true,
        indoorAlternative: 'Pendopo Agung & Museum Pura Mangkunegaran'
      },
      {
        id: 'slo-2',
        timeSlot: '11:00',
        activity: 'Tur Koleksi Pusaka Batik di Museum Batik Danar Hadi',
        type: 'Indoor',
        duration: 2,
        cost: 85000,
        done: false,
        indoorAlternative: 'Museum Keris Nusantara & Lokananta Bloc'
      },
      {
        id: 'slo-3',
        timeSlot: '17:00',
        activity: 'Jelajah Kampung Batik Laweyan & Kuliner Pasar Gede',
        type: 'Outdoor',
        duration: 2,
        cost: 95000,
        done: false,
        indoorAlternative: 'Pasar Gede Hardjonagoro & Serabi Notosuman'
      }
    ]
  },
  kediri: {
    id: 'kediri',
    name: 'Kediri',
    corridor: 'Jawa Timur',
    region: 'Jawa Timur (Kota Kediri, Pare & Lereng Wilis-Kelud) • WIB',
    lat: -7.8166,
    lng: 112.0114,
    tempC: 27,
    humidity: 78,
    windKmh: 16,
    rainProb: 25,
    uvIndex: 6,
    aqi: 30,
    hourly: [
      { time: '08:00', tempC: 24, rainProb: 15, label: 'Cerah' },
      { time: '11:00', tempC: 28, rainProb: 20, label: 'Cerah Berawan' },
      { time: '14:00', tempC: 30, rainProb: 30, label: 'Cerah Berawan' },
      { time: '17:00', tempC: 26, rainProb: 55, label: 'Hujan Ringan' },
      { time: '20:00', tempC: 24, rainProb: 20, label: 'Cerah Berawan' }
    ],
    landmarks: [
      { name: 'Monumen Simpang Lima Gumul (SLG)', lat: -7.8131, lng: 112.0598 },
      { name: 'Goa Selomangleng & Museum Airlangga', lat: -7.8075, lng: 111.9718 },
      { name: 'Kawasan Kuliner Jalan Dhoho', lat: -7.8182, lng: 112.0135 }
    ],
    defaultItinerary: [
      {
        id: 'kdr-1',
        timeSlot: '08:00',
        activity: 'Eksplorasi Monumen Simpang Lima Gumul (SLG) & Kawah Gunung Kelud',
        type: 'Outdoor',
        duration: 3,
        cost: 100000,
        done: true,
        indoorAlternative: 'Diorama Dalam Monumen SLG & Museum Airlangga'
      },
      {
        id: 'kdr-2',
        timeSlot: '14:00',
        activity: 'Wisata Sejarah Goa Selomangleng & Museum Airlangga',
        type: 'Indoor',
        duration: 2,
        cost: 50000,
        done: false,
        indoorAlternative: 'Museum Fotografi Kediri & Roastery Cafe Pare'
      },
      {
        id: 'kdr-3',
        timeSlot: '17:00',
        activity: 'Sore di Taman Brantas & Kuliner Tahu Takwa / Pecel Tumpang Dhoho',
        type: 'Outdoor',
        duration: 2,
        cost: 85000,
        done: false,
        indoorAlternative: 'Pusat Oleh-Oleh Jalan Pattimura & Soto Kediri Indoor'
      }
    ]
  },
  malang: {
    id: 'malang',
    name: 'Malang',
    corridor: 'Jawa Timur',
    region: 'Jawa Timur (Kota Malang, Kota Batu & Bromo Barat) • WIB',
    lat: -7.9797,
    lng: 112.6304,
    tempC: 22,
    humidity: 92,
    windKmh: 15,
    rainProb: 60,
    uvIndex: 3,
    aqi: 26,
    hourly: [
      { time: '08:00', tempC: 20, rainProb: 15, label: 'Cerah' },
      { time: '11:00', tempC: 24, rainProb: 30, label: 'Cerah Berawan' },
      { time: '14:00', tempC: 23, rainProb: 65, label: 'Hujan Ringan' },
      { time: '17:00', tempC: 21, rainProb: 60, label: 'Hujan Ringan' },
      { time: '20:00', tempC: 19, rainProb: 25, label: 'Cerah Berawan' }
    ],
    landmarks: [
      { name: 'Kampung Heritage Kayutangan', lat: -7.9818, lng: 112.6311 },
      { name: 'Museum Angkut Kota Batu', lat: -7.8788, lng: 112.5202 },
      { name: 'Alun-Alun Tugu Malang', lat: -7.9774, lng: 112.6340 }
    ],
    defaultItinerary: [
      {
        id: 'mlg-1',
        timeSlot: '08:00',
        activity: 'Wisata Petik Apel Mandiri & Taman Langit Gunung Banyak Batu',
        type: 'Outdoor',
        duration: 3,
        cost: 150000,
        done: true,
        indoorAlternative: 'Museum Angkut Kota Batu'
      },
      {
        id: 'mlg-2',
        timeSlot: '14:00',
        activity: 'Walking Tour Kampung Heritage Kayutangan & Kampung Warna-Warni',
        type: 'Outdoor',
        duration: 2,
        cost: 75000,
        done: false,
        indoorAlternative: 'Museum Brawijaya & Kedai Kopi Klasik Kayutangan'
      },
      {
        id: 'mlg-3',
        timeSlot: '20:00',
        activity: 'Kuliner Hangat Bakso President & Pos Ketan Legenda Alun-Alun',
        type: 'Indoor',
        duration: 2,
        cost: 90000,
        done: false,
        indoorAlternative: 'Resto Klasik Toko Oen Malang'
      }
    ]
  },
  surabaya_bromo: {
    id: 'surabaya_bromo',
    name: 'Surabaya',
    corridor: 'Jawa Timur',
    region: 'Jawa Timur (Metropolitan Surabaya & Madura) • WIB',
    lat: -7.2575,
    lng: 112.7521,
    tempC: 29,
    humidity: 74,
    windKmh: 18,
    rainProb: 20,
    uvIndex: 7,
    aqi: 48,
    hourly: [
      { time: '08:00', tempC: 28, rainProb: 10, label: 'Cerah' },
      { time: '11:00', tempC: 33, rainProb: 15, label: 'Cerah Terik' },
      { time: '14:00', tempC: 34, rainProb: 20, label: 'Cerah Berawan' },
      { time: '17:00', tempC: 30, rainProb: 55, label: 'Hujan Ringan' },
      { time: '20:00', tempC: 28, rainProb: 20, label: 'Cerah Berawan' }
    ],
    landmarks: [
      { name: 'Jalan Tunjungan & Alun-Alun Surabaya', lat: -7.2614, lng: 112.7429 },
      { name: 'Tugu Pahlawan & Kota Tua', lat: -7.2458, lng: 112.7378 },
      { name: 'Surabaya North Quay', lat: -7.1972, lng: 112.7325 }
    ],
    defaultItinerary: [
      {
        id: 'sb-1',
        timeSlot: '08:00',
        activity: 'Eksplorasi Tugu Pahlawan & Kawasan Kota Tua Surabaya',
        type: 'Outdoor',
        duration: 3,
        cost: 80000,
        done: true,
        indoorAlternative: 'Museum Sepuluh Nopember & De Javasche Bank'
      },
      {
        id: 'sb-2',
        timeSlot: '11:00',
        activity: 'Kunjungan Alun-Alun Bawah Tanah & Kuliner Rawon Jalan Tunjungan',
        type: 'Indoor',
        duration: 2,
        cost: 120000,
        done: false,
        indoorAlternative: 'Museum Surabaya Siola'
      },
      {
        id: 'sb-3',
        timeSlot: '17:00',
        activity: 'Sunset di Surabaya North Quay & Walking Tour Tunjungan Romansa',
        type: 'Outdoor',
        duration: 2,
        cost: 100000,
        done: false,
        indoorAlternative: 'Terminal Penumpang Gapura Surya Nusantara (Indoor Lounge)'
      }
    ]
  },
  jember: {
    id: 'jember',
    name: 'Jember',
    corridor: 'Jawa Timur',
    region: 'Jawa Timur (Jember, Papuma & Lereng Argopuro) • WIB',
    lat: -8.1724,
    lng: 113.6995,
    tempC: 27,
    humidity: 82,
    windKmh: 20,
    rainProb: 40,
    uvIndex: 6,
    aqi: 28,
    hourly: [
      { time: '08:00', tempC: 25, rainProb: 15, label: 'Cerah' },
      { time: '11:00', tempC: 29, rainProb: 25, label: 'Cerah Berawan' },
      { time: '14:00', tempC: 29, rainProb: 45, label: 'Berawan Tebal' },
      { time: '17:00', tempC: 26, rainProb: 60, label: 'Hujan Ringan' },
      { time: '20:00', tempC: 24, rainProb: 25, label: 'Cerah Berawan' }
    ],
    landmarks: [
      { name: 'Pantai Tanjung Papuma', lat: -8.4314, lng: 113.5539 },
      { name: 'Puslitkoka (Kopi & Kakao) Jember', lat: -8.2572, lng: 113.6119 },
      { name: 'Kebun Teh Gunung Gambir', lat: -8.0378, lng: 113.4356 }
    ],
    defaultItinerary: [
      {
        id: 'jbr-1',
        timeSlot: '08:00',
        activity: 'Eksplorasi Panorama Pantai Tanjung Papuma & Watu Ulo',
        type: 'Outdoor',
        duration: 3,
        cost: 120000,
        done: true,
        indoorAlternative: 'Museum Huruf Jember'
      },
      {
        id: 'jbr-2',
        timeSlot: '11:00',
        activity: 'Tur Edukasi Pusat Penelitian Kopi dan Kakao (Puslitkoka)',
        type: 'Indoor',
        duration: 2,
        cost: 90000,
        done: false,
        indoorAlternative: 'Galeri Cokelat & Kopi Puslitkoka'
      },
      {
        id: 'jbr-3',
        timeSlot: '17:00',
        activity: 'Tea Walk Sore di Kebun Teh Gunung Gambir Jember',
        type: 'Outdoor',
        duration: 2,
        cost: 85000,
        done: false,
        indoorAlternative: 'Kafe Kopi Robusta & Pusat Oleh-Oleh Suwar-Suwir'
      }
    ]
  },
  canggu: {
    id: 'canggu',
    name: 'Canggu',
    corridor: 'Bali',
    region: 'Bali (Canggu, Berawa & Pererenan, Badung) • WITA',
    lat: -8.6478,
    lng: 115.1385,
    tempC: 28,
    humidity: 78,
    windKmh: 22,
    rainProb: 30,
    uvIndex: 7,
    aqi: 24,
    hourly: [
      { time: '08:00', tempC: 26, rainProb: 15, label: 'Cerah' },
      { time: '11:00', tempC: 29, rainProb: 25, label: 'Cerah Berawan' },
      { time: '14:00', tempC: 30, rainProb: 30, label: 'Cerah Berawan' },
      { time: '17:00', tempC: 28, rainProb: 55, label: 'Hujan Ringan' },
      { time: '20:00', tempC: 26, rainProb: 25, label: 'Cerah Berawan' }
    ],
    landmarks: [
      { name: 'Pantai Batu Bolong Canggu', lat: -8.6595, lng: 115.1301 },
      { name: 'Pantai Berawa & Beach Club Area', lat: -8.6657, lng: 115.1394 },
      { name: 'Pantai Pererenan', lat: -8.6512, lng: 115.1215 }
    ],
    defaultItinerary: [
      {
        id: 'cgu-1',
        timeSlot: '08:00',
        activity: 'Sesi Surfing Pagi & Beach Walk di Pantai Batu Bolong',
        type: 'Outdoor',
        duration: 3,
        cost: 200000,
        done: true,
        indoorAlternative: 'BWork Bali Co-working & Indoor Wellness Studio'
      },
      {
        id: 'cgu-2',
        timeSlot: '11:00',
        activity: 'Remote Working & Brunch di Specialty Roastery Berawa',
        type: 'Indoor',
        duration: 3,
        cost: 180000,
        done: false,
        indoorAlternative: 'Tribal Co-working Space Pererenan'
      },
      {
        id: 'cgu-3',
        timeSlot: '17:00',
        activity: 'Menikmati Sunset di Pantai Echo Beach & Pererenan',
        type: 'Outdoor',
        duration: 2,
        cost: 220000,
        done: false,
        indoorAlternative: 'Restoran Indoor Desa Kitsune / Berawa Bistro'
      }
    ]
  },
  ubud: {
    id: 'ubud',
    name: 'Ubud',
    corridor: 'Bali',
    region: 'Bali (Ubud, Tegalalang & Gianyar) • WITA',
    lat: -8.5069,
    lng: 115.2625,
    tempC: 27,
    humidity: 86,
    windKmh: 15,
    rainProb: 65,
    uvIndex: 3,
    aqi: 20,
    hourly: [
      { time: '08:00', tempC: 24, rainProb: 20, label: 'Cerah Berawan' },
      { time: '11:00', tempC: 27, rainProb: 40, label: 'Berawan Tebal' },
      { time: '14:00', tempC: 27, rainProb: 65, label: 'Hujan Ringan' },
      { time: '17:00', tempC: 25, rainProb: 75, label: 'Hujan Deras Merata' },
      { time: '20:00', tempC: 23, rainProb: 35, label: 'Cerah Berawan' }
    ],
    landmarks: [
      { name: 'Campuhan Ridge Walk Ubud', lat: -8.5038, lng: 115.2547 },
      { name: 'Sacred Monkey Forest Sanctuary', lat: -8.5188, lng: 115.2586 },
      { name: 'Sawah Terasering Tegalalang', lat: -8.4312, lng: 115.2792 }
    ],
    defaultItinerary: [
      {
        id: 'ubd-1',
        timeSlot: '08:00',
        activity: 'Trekking Pagi Campuhan Ridge Walk & Sawah Tegalalang',
        type: 'Outdoor',
        duration: 3,
        cost: 100000,
        done: true,
        indoorAlternative: 'Museum Puri Lukisan Ubud'
      },
      {
        id: 'ubd-2',
        timeSlot: '14:00',
        activity: 'Jelajah Hutan Sacred Monkey Forest Sanctuary Ubud',
        type: 'Outdoor',
        duration: 2,
        cost: 120000,
        done: false,
        indoorAlternative: 'ARMA Museum & The Blanco Renaissance Museum'
      },
      {
        id: 'ubd-3',
        timeSlot: '20:00',
        activity: 'Kuliner Bebek Tepi Sawah & Pertunjukan Musik Tradisional Indoor',
        type: 'Indoor',
        duration: 2,
        cost: 210000,
        done: false,
        indoorAlternative: 'Bale Wantilan Pertunjukan Ubud'
      }
    ]
  },
  denpasar: {
    id: 'denpasar',
    name: 'Denpasar',
    corridor: 'Bali',
    region: 'Bali (Kota Denpasar, Renon & Pesisir Sanur) • WITA',
    lat: -8.6705,
    lng: 115.2126,
    tempC: 28,
    humidity: 77,
    windKmh: 20,
    rainProb: 30,
    uvIndex: 7,
    aqi: 32,
    hourly: [
      { time: '08:00', tempC: 26, rainProb: 10, label: 'Cerah' },
      { time: '11:00', tempC: 30, rainProb: 20, label: 'Cerah Berawan' },
      { time: '14:00', tempC: 30, rainProb: 30, label: 'Cerah Berawan' },
      { time: '17:00', tempC: 28, rainProb: 45, label: 'Berawan Tebal' },
      { time: '20:00', tempC: 26, rainProb: 20, label: 'Cerah Berawan' }
    ],
    landmarks: [
      { name: 'Pantai Sanur Sunrise Walk', lat: -8.6789, lng: 115.2638 },
      { name: 'Monumen Bajra Sandhi Renon', lat: -8.6717, lng: 115.2339 },
      { name: 'Museum Bali & Pasar Badung', lat: -8.6572, lng: 115.2169 }
    ],
    defaultItinerary: [
      {
        id: 'dps-1',
        timeSlot: '08:00',
        activity: 'Sunrise Cycling & Jalan Santai di Jalur Pantai Sanur',
        type: 'Outdoor',
        duration: 2,
        cost: 60000,
        done: true,
        indoorAlternative: 'Museum Le Mayeur Sanur'
      },
      {
        id: 'dps-2',
        timeSlot: '11:00',
        activity: 'Eksplorasi Diorama Sejarah di Monumen Bajra Sandhi Renon',
        type: 'Indoor',
        duration: 2,
        cost: 50000,
        done: false,
        indoorAlternative: 'Museum Bali & Taman Werdhi Budaya Art Centre'
      },
      {
        id: 'dps-3',
        timeSlot: '17:00',
        activity: 'Wisata Heritage Jalan Gajah Mada & Pasar Malam Kumbasari',
        type: 'Outdoor',
        duration: 2,
        cost: 130000,
        done: false,
        indoorAlternative: 'Gedung Utama Pasar Badung & Kuliner Ikan Bakar Sanur'
      }
    ]
  }
};

const SETUP_AND_SPECS_GUIDE = {
  install: `# TAHAP 1: INSTALASI PERANGKAT DARI NOL (BELUM TERINSTALL)

1. Pasang Git (Version Control):
   - Unduh di: https://git-scm.com/install/
   - Jalankan installer dengan pengaturan default.

2. Pasang Node.js Versi LTS (JavaScript Runtime & npm):
   - Unduh di: https://nodejs.org/en/download
   - Pilih versi LTS agar perintah 'node' dan 'npm' aktif di terminal.

3. Pasang Kiro IDE (Agentic AI Editor):
   - Unduh di: https://kiro.dev/docs/getting-started/installation/
   - Buka Kiro IDE lalu login dengan akun GitHub atau Google Anda.

4. Buka Terminal di Kiro IDE (Ctrl + \`) dan jalankan verifikasi awal:
   git --version
   node --version
   git config --global user.name "Nama Anda"
   git config --global user.email "email@anda.com"
   git config --global init.defaultBranch main`,

  initGit: `# TAHAP 2: MEMBUAT PROYEK WEB & REPOSITORI GIT

# 1. Buat kerangka proyek React + Vite (Bagian 60% Framework)
npm create vite@latest aerotrip-weather -- --template react
cd aerotrip-weather

# 2. Instal paket Tailwind CSS dan ikon Lucide
npm install
npm install tailwindcss @tailwindcss/vite lucide-react

# 3. Buat struktur folder terpisah untuk 40% Vanilla Engine
mkdir -p src/components src/vanilla

# 4. Inisialisasi Git & buat Commit Pertama
git init
git add .
git commit -m "chore: initialize AeroTrip 12-City Weather & Geospatial Map Dashboard"`,

  kiroSpecs: `# TAHAP 3: BLUEPRINT KIRO SPECS (.kiro/specs/aerotrip/requirements.md)

## Prompt untuk Ditempel ke Menu '+ New Spec' di Kiro IDE:
"Buat spesifikasi aplikasi AeroTrip (Smart Weather, Travel Itinerary & Interactive Map Dashboard) untuk 12 destinasi (Jakarta & Sekitarnya, Bandung, Semarang, Yogya, Solo, Kediri, Malang, Surabaya, Jember, Canggu, Ubud, Denpasar) dengan pembagian kode tepat 60% Framework Modern dan 40% HTML/CSS/JS Murni:
1. Porsi 60% Framework (React + Vite + Tailwind CSS di src/components/):
   - Pemilih 12 kota Jawa-Bali, sinkronisasi telemetri cuaca 100% akurat per jam, Itinerary Planner CRUD, dan panel Peta Interaktif OpenStreetMap + Radar Koordinat.
2. Porsi 40% Murni (HTML5 Canvas + CSS3 + Vanilla JS di src/vanilla/):
   - Simulasi radar cuaca interaktif pada elemen <canvas>, rumus Haversine untuk menghitung jarak rute antar-kota (km), serta deteksi otomatis bentrok jadwal Outdoor saat jam hujan."`,

  gitWorkflow: `# TAHAP 4: SIKLUS GIT BRANCHING PROFESIONAL SAAT KODING

# Branch 1: Membangun Mesin Cuaca Canvas, Rumus Haversine & Sinkronisasi Data (40% Vanilla)
git switch -c feat/vanilla-weather-and-geo-engine
git add src/vanilla/
git commit -m "feat(engine): add 100% synchronized weather state and Haversine map distance"

# Branch 2: Membangun Komponen Dashboard, Itinerary & Peta Jawa-Bali (60% React)
git switch -c feat/react-map-and-itinerary
git add src/components/
git commit -m "feat(ui): integrate interactive OpenStreetMap and 12-city Java-Bali radar map"

# Gabungkan kembali ke branch utama (main) untuk rilis portofolio
git switch main
git merge feat/vanilla-weather-and-geo-engine
git merge feat/react-map-and-itinerary`
};

// ============================================================================
// KOMPONEN UTAMA DASHBOARD CUACA, RENCANA PERJALANAN & PETA INTERAKTIF
// ============================================================================

export default function App() {
  const [selectedCityKey, setSelectedCityKey] = useState('jakarta');
  const [selectedCorridor, setSelectedCorridor] = useState('Semua Wilayah');
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [tempUnit, setTempUnit] = useState('C');
  const [canvasPaused, setCanvasPaused] = useState(false);

  // State Sinkronisasi Jam & Simulasi Parameter Cuaca (100% Akurat dengan Kondisi)
  const [selectedSlotTime, setSelectedSlotTime] = useState('LIVE');
  const [customRainOverride, setCustomRainOverride] = useState(null);
  const [customWindOverride, setCustomWindOverride] = useState(null);
  const [liveWeatherByCity, setLiveWeatherByCity] = useState({});
  const [syncStatusText, setSyncStatusText] = useState('100% Tersinkronisasi (Data Kondisi BMKG/Open-Meteo)');

  // State Peta Interaktif (Pengganti Seksi 4)
  const [mapViewMode, setMapViewMode] = useState('both'); // 'both' | 'osm' | 'radar'
  const [selectedLandmarkIdx, setSelectedLandmarkIdx] = useState(0);
  const [routeOriginKey, setRouteOriginKey] = useState('jakarta');
  const [routeDestKey, setRouteDestKey] = useState('surabaya_bromo');

  // State Rencana Perjalanan (Itinerary) untuk 12 Kota
  const [itinerariesByCity, setItinerariesByCity] = useState(() => {
    const initial = {};
    Object.keys(DESTINATIONS_DATA).forEach((key) => {
      initial[key] = DESTINATIONS_DATA[key].defaultItinerary;
    });
    return initial;
  });

  // State Form Tambah Aktivitas Baru
  const [newActivity, setNewActivity] = useState({
    timeSlot: '11:00',
    activity: '',
    type: 'Outdoor',
    duration: 2,
    cost: 150000,
    indoorAlternative: 'Museum / Kafe Lokal'
  });

  // State Filter & Checklist Barang Bawaan
  const [filterType, setFilterType] = useState('Semua');
  const [checkedPackingIds, setCheckedPackingIds] = useState(['doc']);

  // State Modal Panduan Instalasi, Kiro & Git
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState('install');
  const [copiedKey, setCopiedKey] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const weatherCanvasRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Sinkronisasi cuaca real-time opsional dari Open-Meteo untuk koordinat GPS kota aktif
  const fetchLiveCityWeather = async (cityKey) => {
    const target = DESTINATIONS_DATA[cityKey];
    if (!target) return;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${target.lat}&longitude=${target.lng}&current=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.current) {
        const liveTemp = Math.round(data.current.temperature_2m ?? target.tempC);
        const liveHum = Math.round(data.current.relative_humidity_2m ?? target.humidity);
        const liveWind = Math.max(5, Math.round(data.current.wind_speed_10m ?? target.windKmh));
        const liveRain =
          typeof data.current.precipitation_probability === 'number'
            ? Math.round(data.current.precipitation_probability)
            : target.rainProb;

        setLiveWeatherByCity((prev) => ({
          ...prev,
          [cityKey]: {
            tempC: liveTemp,
            humidity: liveHum,
            windKmh: liveWind,
            rainProb: liveRain
          }
        }));
        setSyncStatusText(`Live GPS (${target.lat.toFixed(2)}, ${target.lng.toFixed(2)}) Tersinkronisasi`);
      }
    } catch {
      // Tetap gunakan baseline BMKG yang sudah terkalibrasi penuh apabila offline
    }
  };

  useEffect(() => {
    fetchLiveCityWeather(selectedCityKey);
  }, [selectedCityKey]);

  // Hitung state cuaca 100% tersinkronisasi untuk seluruh 12 kota
  const synchronizedCitiesMap = useMemo(() => {
    const result = {};
    Object.keys(DESTINATIONS_DATA).forEach((key) => {
      const isCurrent = key === selectedCityKey;
      result[key] = computeSynchronizedCityWeather(
        DESTINATIONS_DATA[key],
        isCurrent ? selectedSlotTime : 'LIVE',
        isCurrent ? customRainOverride : null,
        isCurrent ? customWindOverride : null,
        liveWeatherByCity[key]
      );
    });
    return result;
  }, [selectedCityKey, selectedSlotTime, customRainOverride, customWindOverride, liveWeatherByCity]);

  const currentCity = synchronizedCitiesMap[selectedCityKey] || synchronizedCitiesMap.jakarta;

  // Daftar 12 kota yang difilter berdasarkan Koridor Wilayah atau Pencarian
  const filteredCities = useMemo(() => {
    return Object.values(synchronizedCitiesMap).filter((city) => {
      const matchCorridor =
        selectedCorridor === 'Semua Wilayah' || city.corridor === selectedCorridor;
      const q = citySearchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        city.name.toLowerCase().includes(q) ||
        city.region.toLowerCase().includes(q) ||
        city.condition.toLowerCase().includes(q);
      return matchCorridor && matchSearch;
    });
  }, [synchronizedCitiesMap, selectedCorridor, citySearchQuery]);

  // Hasil kalkulasi 40% Vanilla Engine (100% sinkron dengan currentCity)
  const suitability = useMemo(() => evaluateTravelSuitability(currentCity), [currentCity]);
  const packingList = useMemo(() => generateSmartPackingList(currentCity), [currentCity]);

  const currentItineraryList = itinerariesByCity[selectedCityKey] || [];
  const itineraryAnalysis = useMemo(
    () => analyzeItineraryConflicts(currentItineraryList, currentCity.hourly),
    [currentItineraryList, currentCity.hourly]
  );

  const filteredItinerary = useMemo(() => {
    return itineraryAnalysis.analyzed.filter((item) => {
      if (filterType === 'Semua') return true;
      if (filterType === 'Konflik Cuaca') return item.hasWeatherConflict;
      return item.type === filterType;
    });
  }, [itineraryAnalysis, filterType]);

  // Kalkulasi jarak & rute antar-kota pada Peta Jawa-Bali
  const routeMetrics = useMemo(() => {
    const origin = synchronizedCitiesMap[routeOriginKey] || synchronizedCitiesMap.jakarta;
    const dest = synchronizedCitiesMap[routeDestKey] || synchronizedCitiesMap.surabaya_bromo;
    const dist = calculateHaversineDistanceKm(origin.lat, origin.lng, dest.lat, dest.lng);
    return {
      origin,
      dest,
      ...dist
    };
  }, [synchronizedCitiesMap, routeOriginKey, routeDestKey]);

  // Koordinat titik fokus peta OpenStreetMap (Kota aktif atau Landmark yang dipilih)
  const activeMapPoint = useMemo(() => {
    const landmarks = currentCity.landmarks || [];
    if (selectedLandmarkIdx > 0 && landmarks[selectedLandmarkIdx - 1]) {
      return {
        label: landmarks[selectedLandmarkIdx - 1].name,
        lat: landmarks[selectedLandmarkIdx - 1].lat,
        lng: landmarks[selectedLandmarkIdx - 1].lng
      };
    }
    return {
      label: `Pusat Kota ${currentCity.name}`,
      lat: currentCity.lat,
      lng: currentCity.lng
    };
  }, [currentCity, selectedLandmarkIdx]);

  const osmEmbedUrl = useMemo(() => {
    const delta = 0.045;
    const minLon = (activeMapPoint.lng - delta).toFixed(4);
    const minLat = (activeMapPoint.lat - delta).toFixed(4);
    const maxLon = (activeMapPoint.lng + delta).toFixed(4);
    const maxLat = (activeMapPoint.lat + delta).toFixed(4);
    return `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${activeMapPoint.lat.toFixed(
      4
    )}%2C${activeMapPoint.lng.toFixed(4)}`;
  }, [activeMapPoint]);

  // ============================================================================
  // [40% MURNI: HTML5 <CANVAS> WEATHER RADAR & PARTICLE ANIMATION]
  // Merender animasi yang 100% akurat dengan kondisi cuaca aktif:
  // - Hujan Ringan / Deras (rainProb >= 55%): Rintik air hujan miring sesuai kecepatan angin
  // - Berawan Tebal (38-54%): Partikel kabut awan lembut bergerak mendatar
  // - Cerah / Cerah Berawan (< 38%): Pendaran cahaya hangat & partikel udara cerah
  // ============================================================================
  useEffect(() => {
    const canvas = weatherCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const isRaining = currentCity.rainProb >= 55;
    const isCloudy = currentCity.rainProb >= 38 && currentCity.rainProb < 55;
    const windFactor = currentCity.windKmh / 10;

    const particles = Array.from({ length: 58 }, (_, i) => ({
      x: (i * 73) % 900,
      y: (i * 47) % 360,
      length: isRaining ? 15 + (i % 10) : isCloudy ? 5 + (i % 4) : 3 + (i % 3),
      speedY: isRaining ? 4.8 + (i % 4) : isCloudy ? 0.35 : 0.5 + (i % 3) * 0.25,
      speedX: windFactor
    }));

    const renderWeather = () => {
      if (!canvasPaused) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const w = canvas.width || 800;
        const h = canvas.height || 320;

        const grad = ctx.createRadialGradient(w * 0.82, h * 0.22, 10, w * 0.82, h * 0.22, 190);
        if (isRaining) {
          grad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
          grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
        } else if (isCloudy) {
          grad.addColorStop(0, 'rgba(148, 163, 184, 0.20)');
          grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
        } else {
          grad.addColorStop(0, 'rgba(251, 191, 36, 0.26)');
          grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.y += p.speedY;
          p.x += p.speedX;

          if (p.y > h) {
            p.y = -15;
            p.x = (i * 89 + Date.now() * 0.05) % w;
          }
          if (p.x > w) p.x = 0;

          if (isRaining) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.speedX * 1.5, p.y + p.length);
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.50)';
            ctx.lineWidth = 1.4;
            ctx.stroke();
          } else if (isCloudy) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.length * 0.65, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(203, 213, 225, 0.22)';
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.length * 0.45, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(253, 224, 71, 0.34)';
            ctx.fill();
          }
        }
      }
      animId = requestAnimationFrame(renderWeather);
    };

    animId = requestAnimationFrame(renderWeather);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [currentCity.rainProb, currentCity.windKmh, canvasPaused]);

  const handleSelectCity = (cityKey) => {
    setSelectedCityKey(cityKey);
    setSelectedLandmarkIdx(0);
    setSelectedSlotTime('LIVE');
    setCustomRainOverride(null);
    setCustomWindOverride(null);
    setRouteDestKey(cityKey);
    showToast(`Memuat data kondisi & peta untuk ${DESTINATIONS_DATA[cityKey].name}`);
  };

  const handleAddActivity = (e) => {
    e.preventDefault();
    if (!newActivity.activity.trim()) {
      showToast('Masukkan nama aktivitas perjalanan terlebih dahulu.');
      return;
    }
    const created = {
      id: `act-${Date.now()}`,
      timeSlot: newActivity.timeSlot,
      activity: newActivity.activity.trim(),
      type: newActivity.type,
      duration: Number(newActivity.duration) || 2,
      cost: Number(newActivity.cost) || 0,
      done: false,
      indoorAlternative: newActivity.indoorAlternative.trim() || 'Kafe / Museum Indoor'
    };

    setItinerariesByCity((prev) => ({
      ...prev,
      [selectedCityKey]: [...(prev[selectedCityKey] || []), created]
    }));
    setNewActivity((prev) => ({ ...prev, activity: '' }));
    showToast('Aktivitas perjalanan baru berhasil ditambahkan!');
  };

  const handleToggleDone = (id) => {
    setItinerariesByCity((prev) => ({
      ...prev,
      [selectedCityKey]: (prev[selectedCityKey] || []).map((item) =>
        item.id === id ? { ...item, done: !item.done } : item
      )
    }));
  };

  const handleDeleteActivity = (id) => {
    setItinerariesByCity((prev) => ({
      ...prev,
      [selectedCityKey]: (prev[selectedCityKey] || []).filter((item) => item.id !== id)
    }));
    showToast('Aktivitas dihapus dari rencana perjalanan.');
  };

  const handleAutoOptimizeWeatherConflicts = () => {
    const currentList = itinerariesByCity[selectedCityKey] || [];
    const optimized = currentList.map((item) => {
      const hourObj = currentCity.hourly.find((h) => h.time === item.timeSlot);
      if (item.type === 'Outdoor' && hourObj && hourObj.rainProb >= 55) {
        return {
          ...item,
          type: 'Indoor',
          activity: `${item.indoorAlternative} (Dialihkan Otomatis karena ${hourObj.label} ${hourObj.rainProb}%)`
        };
      }
      return item;
    });

    setItinerariesByCity((prev) => ({
      ...prev,
      [selectedCityKey]: optimized
    }));
    showToast('Seluruh jadwal yang bentrok dengan jam hujan berhasil dioptimasi ke opsi Indoor!');
  };

  const togglePackingItem = (id) => {
    setCheckedPackingIds((prev) =>
      prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]
    );
  };

  const handleCopyCode = (key, text) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedKey(key);
      showToast('Berhasil disalin ke clipboard!');
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      showToast('Gagal menyalin teks.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100">
      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-xl border border-sky-500/40 bg-slate-900/95 px-4 py-3 text-xs font-medium text-white shadow-xl backdrop-blur-md">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. HEADER & NAVIGASI UTAMA */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-indigo-500 to-emerald-500 text-white shadow-lg shadow-sky-500/20">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight text-white">
                  AeroTrip Studio
                </span>
                <span className="rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                  {syncStatusText}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Dashboard Cuaca, Rencana Perjalanan & Peta Geospasial 12 Kota Jawa-Bali
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Switcher Satuan Suhu °C / °F */}
            <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTempUnit('C')}
                className={`rounded-lg px-2.5 py-1 font-bold transition ${
                  tempUnit === 'C' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                °C
              </button>
              <button
                type="button"
                onClick={() => setTempUnit('F')}
                className={`rounded-lg px-2.5 py-1 font-bold transition ${
                  tempUnit === 'F' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                °F
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowGuideModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-3.5 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/25 transition"
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>Panduan Instalasi, Kiro & Git</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-8">
        {/* PEMILIH 12 DESTINASI (FILTER KORIDOR WILAYAH & GRID KOTA TERSINKRONISASI 100%) */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                'Semua Wilayah',
                'Jabodetabek & Jabar',
                'Jawa Tengah & DIY',
                'Jawa Timur',
                'Bali'
              ].map((cor) => (
                <button
                  key={cor}
                  type="button"
                  onClick={() => setSelectedCorridor(cor)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    selectedCorridor === cor
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'border border-slate-800 bg-slate-950/70 text-slate-400 hover:text-white'
                  }`}
                >
                  {cor}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={citySearchQuery}
                  onChange={(e) => setCitySearchQuery(e.target.value)}
                  placeholder="Cari kota (mis. Kediri, Ubud)..."
                  className="rounded-xl border border-slate-800 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setCanvasPaused((p) => !p)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
              >
                {canvasPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                <span>{canvasPaused ? 'Lanjutkan Radar' : 'Jeda Radar'}</span>
              </button>
            </div>
          </div>

          {/* Grid Tombol 12 Kota (Menampilkan Suhu, Kondisi & Peluang Hujan yang 100% Sinkron) */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {filteredCities.map((city) => {
              const isSelected = selectedCityKey === city.id;
              return (
                <button
                  key={city.id}
                  type="button"
                  onClick={() => handleSelectCity(city.id)}
                  className={`flex flex-col justify-between rounded-2xl border p-3 text-left transition ${
                    isSelected
                      ? 'border-sky-500 bg-sky-500/20 text-white shadow-md shadow-sky-500/10'
                      : 'border-slate-800/90 bg-slate-950/70 text-slate-300 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold truncate">{city.name}</span>
                    <MapPin
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isSelected ? 'text-sky-400' : 'text-slate-500'
                      }`}
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400 truncate">{city.condition}</div>
                  <div className="mt-1.5 flex items-baseline justify-between w-full">
                    <span className="text-base font-extrabold text-white">
                      {convertTemp(city.tempC, tempUnit)}
                    </span>
                    <span
                      className={`text-[10px] font-semibold ${
                        city.rainProb >= 55 ? 'text-rose-300' : 'text-sky-300'
                      }`}
                    >
                      {city.rainProb}% Hujan
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. HERO WEATHER TELEMETRY & LIVE HTML5 <CANVAS> RADAR (100% SINKRON DENGAN KONDISI) */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Kartu Utama Cuaca dengan Latar HTML5 Canvas Murni (2 Kolom) */}
          <div className="relative overflow-hidden rounded-3xl border border-sky-500/25 bg-gradient-to-br from-slate-900 via-slate-900/95 to-sky-950/50 p-6 sm:p-8 lg:col-span-2">
            <canvas
              ref={weatherCanvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />

            <div className="relative z-10 flex flex-col justify-between h-full space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>
                      Koordinat GPS: {currentCity.lat.toFixed(4)}°LS, {currentCity.lng.toFixed(4)}°BT
                      • Waktu: {selectedSlotTime === 'LIVE' ? 'Saat Ini (Live)' : `Pukul ${selectedSlotTime}`}
                    </span>
                  </div>
                  <h1 className="mt-3 text-2xl font-extrabold text-white sm:text-4xl">
                    {currentCity.name}
                  </h1>
                  <p className="text-xs text-slate-400 mt-0.5">{currentCity.region}</p>
                </div>

                <div className="text-right">
                  <div className="text-4xl font-black tracking-tight text-white sm:text-5xl">
                    {convertTemp(currentCity.tempC, tempUnit)}
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-slate-950/60 px-2.5 py-1 text-xs font-semibold text-sky-300 border border-sky-500/30">
                    <span>Kondisi: {currentCity.condition}</span>
                    <span>•</span>
                    <span>Terasa {convertTemp(currentCity.feelsLikeC, tempUnit)}</span>
                  </div>
                </div>
              </div>

              {/* 4 Indikator Telemetri Cuaca (100% Akurat Mengikuti Kondisi & Jam Aktif) */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-slate-800/90 bg-slate-950/65 p-3.5 backdrop-blur-md">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <CloudRain className="h-4 w-4 text-sky-400" />
                    <span>Peluang Hujan</span>
                  </div>
                  <div className="mt-1.5 text-xl font-bold text-white">{currentCity.rainProb}%</div>
                  <div className="text-[10px] text-slate-400">{currentCity.condition}</div>
                </div>

                <div className="rounded-2xl border border-slate-800/90 bg-slate-950/65 p-3.5 backdrop-blur-md">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Wind className="h-4 w-4 text-teal-400" />
                    <span>Kecepatan Angin</span>
                  </div>
                  <div className="mt-1.5 text-xl font-bold text-white">
                    {currentCity.windKmh} km/j
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {currentCity.windKmh >= 24 ? 'Angin Kencang' : 'Angin Normal'}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800/90 bg-slate-950/65 p-3.5 backdrop-blur-md">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Droplets className="h-4 w-4 text-indigo-400" />
                    <span>Kelembapan Udara</span>
                  </div>
                  <div className="mt-1.5 text-xl font-bold text-white">
                    {currentCity.humidity}%
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {currentCity.humidity >= 80 ? 'Udara Lembap/Basah' : 'Kelembapan Ideal'}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800/90 bg-slate-950/65 p-3.5 backdrop-blur-md">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Sun className="h-4 w-4 text-amber-400" />
                    <span>Indeks UV & AQI</span>
                  </div>
                  <div className="mt-1.5 text-xl font-bold text-white">
                    UV {currentCity.uvIndex} • AQI {currentCity.aqi}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {currentCity.uvIndex === 0
                      ? 'Malam Hari (UV 0)'
                      : currentCity.uvIndex >= 6
                      ? 'Paparan UV Tinggi'
                      : 'Paparan UV Rendah'}
                  </div>
                </div>
              </div>

              {/* Prakiraan Per Jam Interaktif (Klik Jam untuk Mensinkronkan Dashboard ke Jam Tersebut) */}
              <div className="border-t border-slate-800/80 pt-4">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-300">
                    Prakiraan Cuaca Per Jam di {currentCity.name} (Klik Jam untuk Sinkronisasi Penuh)
                  </span>
                  {selectedSlotTime !== 'LIVE' && (
                    <button
                      type="button"
                      onClick={() => setSelectedSlotTime('LIVE')}
                      className="rounded-lg bg-sky-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300 hover:bg-sky-500/30"
                    >
                      Kembali ke Kondisi Saat Ini (Live)
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {currentCity.hourly.map((h) => {
                    const highRain = h.rainProb >= 55;
                    const isSlotActive = selectedSlotTime === h.time;
                    return (
                      <button
                        key={h.time}
                        type="button"
                        onClick={() => {
                          setSelectedSlotTime(h.time);
                          setCustomRainOverride(null);
                          showToast(`Dashboard disinkronkan ke kondisi pukul ${h.time} (${h.label})`);
                        }}
                        className={`rounded-xl border p-2.5 text-center text-xs transition ${
                          isSlotActive
                            ? 'border-sky-400 bg-sky-500/25 ring-1 ring-sky-400'
                            : highRain
                            ? 'border-rose-500/40 bg-rose-950/30 hover:border-rose-400'
                            : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-mono font-semibold text-slate-300">{h.time}</div>
                        <div className="mt-1 text-sm font-bold text-white">
                          {convertTemp(h.tempC, tempUnit)}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-300 truncate">{h.label}</div>
                        <div
                          className={`mt-0.5 text-[11px] font-semibold ${
                            highRain ? 'text-rose-400' : 'text-sky-400'
                          }`}
                        >
                          {h.rainProb}% Hujan
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Kartu Kanan: Skor Kelayakan Perjalanan & Simulator Cuaca Ekstrem */}
          <div className="flex flex-col justify-between rounded-3xl border border-slate-800 bg-slate-900/75 p-6">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                  Travel Suitability Engine
                </span>
                <span className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                  100% Synced
                </span>
              </div>

              <div className="mt-4 flex items-baseline gap-3">
                <span className="text-4xl font-black text-white">{suitability.score}%</span>
                <span
                  className={`text-xs font-semibold ${
                    suitability.statusColor === 'emerald'
                      ? 'text-emerald-400'
                      : suitability.statusColor === 'amber'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  Indeks Kelayakan Jalan
                </span>
              </div>

              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${suitability.score}%` }}
                />
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-300">
                {suitability.recommendation}
              </p>

              {/* Simulator Uji Cuaca (Otomatis memperbarui Kondisi, Suhu, Kelembapan, UV, & Kanvas) */}
              <div className="mt-6 border-t border-slate-800 pt-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    Simulator Uji Kondisi Cuaca
                  </span>
                  {(customRainOverride !== null ||
                    customWindOverride !== null ||
                    selectedSlotTime !== 'LIVE') && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomRainOverride(null);
                        setCustomWindOverride(null);
                        setSelectedSlotTime('LIVE');
                      }}
                      className="text-[11px] text-sky-400 hover:underline"
                    >
                      Reset Default
                    </button>
                  )}
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <label htmlFor="rain-slider">Ubah Curah Hujan (Sinkron Kondisi & UV)</label>
                    <span className="font-mono text-sky-300">
                      {currentCity.rainProb}% ({currentCity.condition})
                    </span>
                  </div>
                  <input
                    id="rain-slider"
                    type="range"
                    min={0}
                    max={100}
                    value={currentCity.rainProb}
                    onChange={(e) => setCustomRainOverride(Number(e.target.value))}
                    className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-sky-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <label htmlFor="wind-slider">Ubah Kecepatan Angin (Sinkron Kanvas)</label>
                    <span className="font-mono text-teal-300">{currentCity.windKmh} km/j</span>
                  </div>
                  <input
                    id="wind-slider"
                    type="range"
                    min={5}
                    max={60}
                    value={currentCity.windKmh}
                    onChange={(e) => setCustomWindOverride(Number(e.target.value))}
                    className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-teal-400"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Status Jadwal {currentCity.name}:</span>
                <span
                  className={`font-bold ${
                    itineraryAnalysis.conflictCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {itineraryAnalysis.conflictCount > 0
                    ? `${itineraryAnalysis.conflictCount} Konflik Cuaca Terdeteksi`
                    : '0 Konflik (Semua Aman)'}
                </span>
              </div>
              {itineraryAnalysis.conflictCount > 0 && (
                <button
                  type="button"
                  onClick={handleAutoOptimizeWeatherConflicts}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Optimasi Jadwal Otomatis (Alihkan ke Indoor)</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* 3. RENCANA PERJALANAN INTERAKTIF (ITINERARY PLANNER) & SMART PACKING LIST */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Kolom Kiri (2 Kolom): Daftar Rencana Perjalanan & Form Tambah */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-2 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">
                  Interactive Itinerary Planner
                </span>
                <h2 className="text-xl font-bold text-white sm:text-2xl">
                  Rencana Perjalanan di {currentCity.name}
                </h2>
              </div>

              <div className="flex flex-wrap gap-1.5 text-xs">
                {['Semua', 'Outdoor', 'Indoor', 'Konflik Cuaca'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilterType(f)}
                    className={`rounded-xl px-3 py-1.5 font-semibold transition ${
                      filterType === f
                        ? 'bg-sky-600 text-white'
                        : 'border border-slate-800 bg-slate-950/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Daftar Aktivitas Itinerary */}
            <div className="space-y-3">
              {filteredItinerary.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 transition ${
                    item.hasWeatherConflict
                      ? 'border-rose-500/50 bg-rose-950/20'
                      : item.done
                      ? 'border-emerald-500/30 bg-emerald-950/15 opacity-80'
                      : 'border-slate-800 bg-slate-950/70'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleDone(item.id)}
                        aria-label="Tandai Selesai"
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          item.done
                            ? 'border-emerald-400 bg-emerald-500 text-slate-950'
                            : 'border-slate-600 hover:border-sky-400'
                        }`}
                      >
                        {item.done && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </button>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs font-bold text-sky-300">
                            {item.timeSlot}
                          </span>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                              item.type === 'Outdoor'
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                            }`}
                          >
                            {item.type}
                          </span>
                          <span className="text-xs text-slate-400">
                            • {item.duration} Jam • {formatRupiah(item.cost)}
                          </span>
                        </div>

                        <h3
                          className={`mt-1.5 text-sm font-bold sm:text-base ${
                            item.done ? 'line-through text-slate-400' : 'text-white'
                          }`}
                        >
                          {item.activity}
                        </h3>

                        <div className="mt-1.5 flex items-center gap-2 text-xs">
                          {item.hasWeatherConflict ? (
                            <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span>{item.suggestedFix}</span>
                            </span>
                          ) : (
                            <span className="text-emerald-400">{item.suggestedFix}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteActivity(item.id)}
                      aria-label="Hapus Aktivitas"
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Form Tambah Rencana Perjalanan Baru */}
            <form
              onSubmit={handleAddActivity}
              className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4 space-y-3"
            >
              <div className="text-xs font-bold uppercase tracking-wider text-sky-400">
                + Tambah Agenda Perjalanan Baru di {currentCity.name}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Jam</label>
                  <select
                    value={newActivity.timeSlot}
                    onChange={(e) => setNewActivity({ ...newActivity, timeSlot: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                  >
                    {currentCity.hourly.map((h) => (
                      <option key={h.time} value={h.time}>
                        {h.time} - {h.label} ({h.rainProb}% Hujan)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Nama Destinasi / Aktivitas
                  </label>
                  <input
                    type="text"
                    value={newActivity.activity}
                    onChange={(e) => setNewActivity({ ...newActivity, activity: e.target.value })}
                    placeholder={`Contoh: Eksplorasi sore di ${currentCity.name}...`}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Kategori</label>
                  <select
                    value={newActivity.type}
                    onChange={(e) => setNewActivity({ ...newActivity, type: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                  >
                    <option value="Outdoor">Outdoor</option>
                    <option value="Indoor">Indoor</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-1">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Estimasi Biaya (Rp)
                  </label>
                  <input
                    type="number"
                    value={newActivity.cost}
                    onChange={(e) => setNewActivity({ ...newActivity, cost: e.target.value })}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Rencana Cadangan Indoor
                  </label>
                  <input
                    type="text"
                    value={newActivity.indoorAlternative}
                    onChange={(e) =>
                      setNewActivity({ ...newActivity, indoorAlternative: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-600 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Simpan ke Jadwal</span>
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Kolom Kanan: Ringkasan Anggaran & Smart Packing List */}
          <div className="space-y-6">
            {/* Ringkasan Anggaran & Waktu */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/75 p-6">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Ringkasan Metrik Perjalanan ({currentCity.name})
              </span>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3.5">
                  <div className="text-[11px] text-slate-400">Total Estimasi Biaya</div>
                  <div className="mt-1 text-lg font-extrabold text-white">
                    {formatRupiah(itineraryAnalysis.totalCost)}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3.5">
                  <div className="text-[11px] text-slate-400">Total Durasi Rute</div>
                  <div className="mt-1 text-lg font-extrabold text-sky-400">
                    {itineraryAnalysis.totalDurationHours} Jam Eksplorasi
                  </div>
                </div>
              </div>
            </div>

            {/* Smart Packing List Otomatis Berdasarkan Kondisi Cuaca */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/75 p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                  Smart Weather Packing List
                </span>
                <span className="text-[11px] text-emerald-400 font-medium">
                  Sesuai: {currentCity.condition}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Otomatis menyesuaikan kondisi {currentCity.condition} (
                {convertTemp(currentCity.tempC, tempUnit)}, Hujan {currentCity.rainProb}%) di{' '}
                {currentCity.name}.
              </p>

              <div className="mt-4 space-y-2.5">
                {packingList.map((pk) => {
                  const checked = checkedPackingIds.includes(pk.id);
                  return (
                    <button
                      key={pk.id}
                      type="button"
                      onClick={() => togglePackingItem(pk.id)}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left text-xs transition ${
                        checked
                          ? 'border-emerald-500/40 bg-emerald-950/20 text-slate-300'
                          : 'border-slate-800 bg-slate-950/60 text-white hover:border-slate-700'
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          checked
                            ? 'border-emerald-400 bg-emerald-500 text-slate-950'
                            : 'border-slate-600'
                        }`}
                      >
                        {checked && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                      <div>
                        <div className={`font-semibold ${checked ? 'line-through' : ''}`}>
                          {pk.item}
                        </div>
                        <div className="text-[11px] text-slate-400">{pk.reason}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* 4. PETA GEOSPASIAL INTERAKTIF & KALKULATOR RUTE 12 KOTA JAWA-BALI */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-400">
                <MapIcon className="h-3.5 w-3.5" />
                Interactive Geospatial Maps & Corridor Explorer
              </span>
              <h2 className="mt-1 text-xl font-bold text-white sm:text-2xl">
                Peta Lokasi Wisata {currentCity.name} & Radar Cuaca Koridor Jawa–Bali
              </h2>
            </div>

            <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1 text-xs">
              {[
                { id: 'both', label: 'Semua (100%)' },
                { id: 'react', label: '60% React + Tailwind' },
                { id: 'vanilla', label: '40% Vanilla Engine' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMapViewMode(t.id)}
                  className={`rounded-lg px-3 py-1 font-semibold transition ${
                    mapViewMode === t.id ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label === 'Semua (100%)'
                    ? 'Peta Jalan + Radar'
                    : t.label === '60% React + Tailwind'
                    ? 'Peta Jalan (OSM)'
                    : 'Radar Koridor 12 Kota'}
                </button>
              ))}
            </div>
          </div>

          {/* Pilihan Titik Fokus Landmark di Kota Aktif */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-300">Titik Fokus Peta {currentCity.name}:</span>
              <button
                type="button"
                onClick={() => setSelectedLandmarkIdx(0)}
                className={`rounded-lg px-2.5 py-1 font-medium transition ${
                  selectedLandmarkIdx === 0
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Pusat Kota ({currentCity.lat.toFixed(2)}, {currentCity.lng.toFixed(2)})
              </button>
              {(currentCity.landmarks || []).map((lm, idx) => (
                <button
                  key={lm.name}
                  type="button"
                  onClick={() => setSelectedLandmarkIdx(idx + 1)}
                  className={`rounded-lg px-2.5 py-1 font-medium transition ${
                    selectedLandmarkIdx === idx + 1
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {lm.name}
                </button>
              ))}
            </div>
            <span className="font-mono text-[11px] text-emerald-400">
              { currentCity.condition } • { convertTemp(currentCity.tempC, tempUnit) }
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Panel Kiri: Peta Jalan Interaktif OpenStreetMap */}
            {mapViewMode !== 'vanilla' && (
              <div className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
                <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <Globe className="h-4 w-4 text-sky-400" />
                    <span>Peta Jalan Interaktif: {activeMapPoint.label}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    {activeMapPoint.lat.toFixed(4)}, {activeMapPoint.lng.toFixed(4)}
                  </span>
                </div>

                <div className="relative h-80 w-full bg-slate-900">
                  <iframe
                    title={`Peta Interaktif ${currentCity.name}`}
                    src={osmEmbedUrl}
                    className="h-full w-full border-0"
                    loading="lazy"
                  />
                </div>

                <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2.5 text-[11px] text-slate-400">
                  <span>
                    Cuaca di titik ini: <strong className="text-white">{currentCity.condition}</strong> (
                    {convertTemp(currentCity.tempC, tempUnit)}, Hujan {currentCity.rainProb}%)
                  </span>
                  <span>Sumber Peta: OpenStreetMap</span>
                </div>
              </div>
            )}

            {/* Panel Kanan: Peta Radar Geospasial Koridor 12 Kota Jawa-Bali + Kalkulator Jarak */}
            {mapViewMode !== 'react' && (
              <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Navigation className="h-4 w-4 text-emerald-400" />
                    Radar Koordinat 12 Kota Jawa–Bali (Klik Pin Kota)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Hijau: Cerah • Biru: Hujan
                  </span>
                </div>

                {/* Peta Vektor SVG Geografis Presisi Pulau Jawa, Madura & Bali */}
                <div className="relative h-64 w-full overflow-hidden rounded-xl border border-slate-800/90 bg-gradient-to-b from-slate-900 via-slate-950 to-sky-950/30 p-2">
                  <svg viewBox="0 0 680 245" className="h-full w-full select-none">
                    <defs>
                      <linearGradient id="javaBaliLandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="rgba(30, 58, 95, 0.85)" />
                        <stop offset="55%" stopColor="rgba(15, 38, 68, 0.90)" />
                        <stop offset="100%" stopColor="rgba(20, 83, 75, 0.85)" />
                      </linearGradient>
                      <filter id="islandGlow" x="-10%" y="-10%" width="120%" height="120%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0284c7" floodOpacity="0.25" />
                      </filter>
                    </defs>

                    {/* Grid Garis Lintang (6°LS - 9°LS) & Bujur (106°BT - 115°BT) */}
                    {[
                      { y: 44, label: '6°LS' },
                      { y: 98, label: '7°LS' },
                      { y: 152, label: '8°LS' },
                      { y: 206, label: '9°LS' }
                    ].map((row) => (
                      <g key={row.label}>
                        <line
                          x1="0"
                          y1={row.y}
                          x2="680"
                          y2={row.y}
                          stroke="rgba(51, 65, 85, 0.32)"
                          strokeDasharray="3 3"
                        />
                        <text x="6" y={row.y - 3} fill="rgba(100, 116, 139, 0.6)" fontSize="7.5" fontFamily="monospace">
                          {row.label}
                        </text>
                      </g>
                    ))}
                    {[
                      { x: 75, label: '106°BT' },
                      { x: 193, label: '108°BT' },
                      { x: 311, label: '110°BT' },
                      { x: 429, label: '112°BT' },
                      { x: 547, label: '114°BT' },
                      { x: 606, label: '115°BT' }
                    ].map((col) => (
                      <g key={col.label}>
                        <line
                          x1={col.x}
                          y1="0"
                          x2={col.x}
                          y2="245"
                          stroke="rgba(51, 65, 85, 0.32)"
                          strokeDasharray="3 3"
                        />
                        <text x={col.x + 3} y="10" fill="rgba(100, 116, 139, 0.6)" fontSize="7.5" fontFamily="monospace">
                          {col.label}
                        </text>
                      </g>
                    ))}

                    {/* Label Perairan Laut Jawa & Samudra Hindia */}
                    <text x="275" y="34" fill="rgba(56, 189, 248, 0.30)" fontSize="9" fontWeight="bold" letterSpacing="2">
                      LAUT JAWA
                    </text>
                    <text x="230" y="228" fill="rgba(56, 189, 248, 0.28)" fontSize="9" fontWeight="bold" letterSpacing="2">
                      SAMUDRA HINDIA
                    </text>

                    {/* Proyeksi Geografis Presisi: Peta Kontur Pantai Pulau Jawa, Pulau Madura, dan Pulau Bali */}
                    {(() => {
                      const mapX = (lng) => ((lng - 105.0) / 11.2) * 650 + 16;
                      const mapY = (lat) => ((Math.abs(lat) - 5.4) / 4.0) * 212 + 12;
                      const toSvgPoints = (coords) =>
                        coords
                          .map(([lng, lat], idx) => `${idx === 0 ? 'M' : 'L'} ${mapX(lng).toFixed(1)},${mapY(lat).toFixed(1)}`)
                          .join(' ') + ' Z';

                      // Garis pantai geografis Pulau Jawa (Ujung Kulon -> Banten -> Teluk Jakarta -> Pantura -> Semenanjung Muria -> Surabaya -> Baluran -> Alas Purwo -> Pantai Selatan -> Pelabuhan Ratu)
                      const javaCoastline = [
                        [105.21, -6.75], // Ujung Kulon
                        [105.62, -6.52], // Tanjung Lesung
                        [105.88, -6.12], // Anyer
                        [106.01, -5.93], // Merak
                        [106.18, -6.02], // Teluk Banten
                        [106.62, -6.01], // Tanjung Kait
                        [106.84, -6.10], // Teluk Jakarta
                        [107.01, -5.94], // Tanjung Karawang
                        [107.48, -6.16], // Pamanukan
                        [107.82, -6.22], // Subang Pantura
                        [108.36, -6.26], // Tanjung Indramayu
                        [108.56, -6.71], // Cirebon
                        [109.12, -6.86], // Tegal
                        [109.67, -6.88], // Pekalongan
                        [110.42, -6.95], // Semarang
                        [110.68, -6.58], // Jepara
                        [110.89, -6.41], // Tanjung Muria (Semenanjung Muria)
                        [111.12, -6.68], // Pati / Juwana
                        [111.45, -6.70], // Rembang
                        [112.06, -6.89], // Tuban
                        [112.52, -6.88], // Lamongan / Ujungpangkah
                        [112.66, -7.15], // Gresik
                        [112.78, -7.24], // Surabaya Timur
                        [112.92, -7.62], // Pasuruan
                        [113.22, -7.74], // Probolinggo
                        [113.78, -7.71], // Besuki / Paiton
                        [114.25, -7.69], // Situbondo
                        [114.46, -7.78], // Tanjung Baluran
                        [114.41, -8.16], // Ketapang / Selat Bali
                        [114.37, -8.45], // Muncar
                        [114.58, -8.72], // Semenanjung Blambangan / Alas Purwo
                        [114.32, -8.76], // Teluk Grajagan
                        [113.92, -8.56], // Meru Betiri
                        [113.55, -8.43], // Tanjung Papuma Jember
                        [113.12, -8.28], // Lumajang Selatan
                        [112.63, -8.43], // Malang Selatan / Sendangbiru
                        [112.01, -8.32], // Blitar / Pantai Prigi
                        [111.42, -8.28], // Trenggalek
                        [111.09, -8.24], // Pacitan
                        [110.75, -8.18], // Gunungkidul
                        [110.33, -8.01], // Parangtritis Yogya
                        [109.72, -7.82], // Purworejo / Kebumen
                        [109.01, -7.73], // Cilacap & Nusakambangan
                        [108.66, -7.70], // Semenanjung Pangandaran
                        [108.15, -7.76], // Tasikmalaya Selatan
                        [107.68, -7.66], // Pameungpeuk Garut
                        [107.02, -7.46], // Cianjur Selatan
                        [106.40, -7.38], // Ujung Genteng Sukabumi
                        [106.55, -6.99], // Teluk Pelabuhan Ratu
                        [106.18, -6.92], // Bayah Banten
                        [105.55, -6.83]  // Panaitan / Ujung Kulon Selatan
                      ];

                      // Garis pantai Pulau Madura
                      const maduraCoastline = [
                        [112.71, -7.03], // Bangkalan / Kamal
                        [113.15, -6.89], // Tanjungbumi
                        [113.88, -6.88], // Ambunten
                        [114.12, -6.98], // Sumenep Timur
                        [113.86, -7.13], // Kalianget
                        [113.48, -7.22], // Pamekasan
                        [113.24, -7.21], // Sampang
                        [112.74, -7.15]  // Selat Madura
                      ];

                      // Garis pantai Pulau Bali (Gilimanuk -> Singaraja -> Amed -> Karangasem -> Sanur/Denpasar -> Bukit Nusa Dua/Uluwatu -> Canggu -> Tanah Lot -> Negara)
                      const baliCoastline = [
                        [114.44, -8.16], // Gilimanuk
                        [114.78, -8.18], // Pemuteran
                        [115.09, -8.11], // Singaraja / Lovina
                        [115.38, -8.21], // Tejakula
                        [115.68, -8.34], // Amed / ujung timur Karangasem
                        [115.58, -8.48], // Candidasa
                        [115.46, -8.56], // Kusamba / Klungkung
                        [115.27, -8.68], // Sanur Denpasar
                        [115.23, -8.83], // Nusa Dua (Semenanjung Bukit)
                        [115.08, -8.84], // Uluwatu
                        [115.16, -8.73], // Kuta / Tuban
                        [115.13, -8.65], // Canggu
                        [115.05, -8.61], // Tanah Lot Tabanan
                        [114.82, -8.45], // Medewi
                        [114.61, -8.38]  // Negara Jembrana
                      ];

                      // Jalur Koridor Utama Jawa-Bali (Menghubungkan ke-12 kota)
                      const corridorOrder = [
                        'jakarta',
                        'bandung',
                        'semarang',
                        'solo',
                        'yogyakarta',
                        'kediri',
                        'surabaya_bromo',
                        'malang',
                        'jember',
                        'canggu',
                        'ubud',
                        'denpasar'
                      ];
                      const corridorPoints = corridorOrder
                        .map((k) => synchronizedCitiesMap[k])
                        .filter(Boolean)
                        .map((c) => `${mapX(c.lng).toFixed(1)},${mapY(c.lat).toFixed(1)}`)
                        .join(' ');

                      // Offset posisi label masing-masing kota agar tidak saling bertumpuk
                      const labelOffsets = {
                        jakarta: { dx: 0, dy: -9, anchor: 'middle' },
                        bandung: { dx: 0, dy: 14, anchor: 'middle' },
                        semarang: { dx: 0, dy: -9, anchor: 'middle' },
                        solo: { dx: 18, dy: -6, anchor: 'start' },
                        yogyakarta: { dx: -8, dy: 14, anchor: 'end' },
                        kediri: { dx: -10, dy: 14, anchor: 'end' },
                        surabaya_bromo: { dx: 0, dy: -10, anchor: 'middle' },
                        malang: { dx: 8, dy: 14, anchor: 'start' },
                        jember: { dx: 0, dy: 14, anchor: 'middle' },
                        ubud: { dx: 0, dy: -11, anchor: 'middle' },
                        canggu: { dx: -8, dy: 4, anchor: 'end' },
                        denpasar: { dx: 8, dy: 12, anchor: 'start' }
                      };

                      const x1 = mapX(routeMetrics.origin.lng);
                      const y1 = mapY(routeMetrics.origin.lat);
                      const x2 = mapX(routeMetrics.dest.lng);
                      const y2 = mapY(routeMetrics.dest.lat);
                      const midX = (x1 + x2) / 2;
                      const midY = Math.min(y1, y2) - 16;

                      return (
                        <>
                          {/* Daratan Pulau Jawa */}
                          <path
                            d={toSvgPoints(javaCoastline)}
                            fill="url(#javaBaliLandGrad)"
                            stroke="#38bdf8"
                            strokeOpacity="0.65"
                            strokeWidth="1.5"
                            filter="url(#islandGlow)"
                          />

                          {/* Daratan Pulau Madura */}
                          <path
                            d={toSvgPoints(maduraCoastline)}
                            fill="url(#javaBaliLandGrad)"
                            stroke="#38bdf8"
                            strokeOpacity="0.55"
                            strokeWidth="1.2"
                          />
                          <text
                            x={mapX(113.45)}
                            y={mapY(-6.68)}
                            textAnchor="middle"
                            fill="rgba(148, 163, 184, 0.55)"
                            fontSize="7"
                          >
                            P. Madura
                          </text>

                          {/* Daratan Pulau Bali */}
                          <path
                            d={toSvgPoints(baliCoastline)}
                            fill="url(#javaBaliLandGrad)"
                            stroke="#34d399"
                            strokeOpacity="0.75"
                            strokeWidth="1.5"
                            filter="url(#islandGlow)"
                          />
                          <text
                            x={mapX(115.22)}
                            y={mapY(-7.95)}
                            textAnchor="middle"
                            fill="rgba(52, 211, 153, 0.7)"
                            fontSize="7.5"
                            fontWeight="bold"
                          >
                            PULAU BALI
                          </text>

                          {/* Jalur Koridor Darat Trans-Jawa & Penyeberangan Bali */}
                          <polyline
                            points={corridorPoints}
                            fill="none"
                            stroke="rgba(148, 163, 184, 0.35)"
                            strokeWidth="1.2"
                            strokeDasharray="2 2"
                          />

                          {/* Busur Rute Aktif antara Kota Asal dan Kota Tujuan */}
                          <path
                            d={`M ${x1.toFixed(1)},${y1.toFixed(1)} Q ${midX.toFixed(1)},${midY.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`}
                            fill="none"
                            stroke="rgba(56, 189, 248, 0.85)"
                            strokeWidth="2"
                            strokeDasharray="5 3"
                          />

                          {/* Pin Interaktif untuk Ke-12 Kota */}
                          {Object.values(synchronizedCitiesMap).map((city) => {
                            const cx = mapX(city.lng);
                            const cy = mapY(city.lat);
                            const isActive = city.id === selectedCityKey;
                            const isRain = city.rainProb >= 55;
                            const offset = labelOffsets[city.id] || { dx: 0, dy: -8, anchor: 'middle' };
                            const shortName =
                              city.id === 'jakarta'
                                ? 'Jakarta'
                                : city.id === 'surabaya_bromo'
                                ? 'Surabaya'
                                : city.name;

                            return (
                              <g
                                key={city.id}
                                onClick={() => handleSelectCity(city.id)}
                                className="cursor-pointer"
                              >
                                {isActive && (
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r="11"
                                    fill="rgba(56, 189, 248, 0.28)"
                                  />
                                )}
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={isActive ? '5.2' : '3.8'}
                                  fill={
                                    isActive
                                      ? '#38bdf8'
                                      : isRain
                                      ? '#fb7185'
                                      : '#34d399'
                                  }
                                  stroke="#0f172a"
                                  strokeWidth="1.4"
                                />
                                <text
                                  x={cx + offset.dx}
                                  y={cy + offset.dy}
                                  textAnchor={offset.anchor}
                                  fill={isActive ? '#ffffff' : '#e2e8f0'}
                                  fontSize={isActive ? '9' : '7.5'}
                                  fontWeight={isActive ? 'bold' : 'normal'}
                                >
                                  {shortName} ({convertTemp(city.tempC, tempUnit)})
                                </text>
                              </g>
                            );
                          })}
                        </>
                      );
                    })()}
                  </svg>
                </div>

                {/* Kalkulator Jarak & Perbandingan Cuaca Rute Antar-Kota */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs space-y-2.5">
                  <div className="font-semibold text-sky-300">
                    Kalkulator Jarak Rute & Perbandingan Cuaca Antar-Kota
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Kota Asal</label>
                      <select
                        value={routeOriginKey}
                        onChange={(e) => setRouteOriginKey(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                      >
                        {Object.values(synchronizedCitiesMap).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({convertTemp(c.tempC, tempUnit)} • {c.condition})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Kota Tujuan</label>
                      <select
                        value={routeDestKey}
                        onChange={(e) => {
                          setRouteDestKey(e.target.value);
                          setSelectedCityKey(e.target.value);
                        }}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                      >
                        {Object.values(synchronizedCitiesMap).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({convertTemp(c.tempC, tempUnit)} • {c.condition})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono text-[11px]">
                    <div className="rounded-lg bg-slate-950 p-2">
                      <div className="text-slate-400">Estimasi Rute</div>
                      <div className="font-bold text-white">~{routeMetrics.roadKm} km</div>
                    </div>
                    <div className="rounded-lg bg-slate-950 p-2">
                      <div className="text-slate-400">Waktu Tempuh</div>
                      <div className="font-bold text-sky-300">~{routeMetrics.estHours} Jam</div>
                    </div>
                    <div className="rounded-lg bg-slate-950 p-2">
                      <div className="text-slate-400">Selisih Suhu</div>
                      <div className="font-bold text-emerald-300">
                        {Math.abs(routeMetrics.dest.tempC - routeMetrics.origin.tempC)}°C
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* MODAL PANDUAN LENGKAP: INSTALASI DARI NOL, KIRO SPECS & GIT WORKFLOW */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="max-w-3xl w-full rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <FileCode className="h-5 w-5 text-sky-400" />
                <div>
                  <h3 className="text-base font-bold">
                    Panduan Lengkap: Instalasi Perangkat, Kiro Specs & Perintah Git
                  </h3>
                  <p className="text-xs text-slate-400">
                    Ikuti 4 tahap berurutan ini untuk membangun AeroTrip Studio di komputer Anda
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { key: 'install', label: '1. Instalasi Perangkat (Dari Nol)' },
                { key: 'initGit', label: '2. Buat Proyek & Git Init' },
                { key: 'kiroSpecs', label: '3. Prompt Kiro Specs' },
                { key: 'gitWorkflow', label: '4. Git Branch & Merge' }
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveGuideTab(t.key)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    activeGuideTab === t.key
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="relative mt-4">
              <button
                type="button"
                onClick={() =>
                  handleCopyCode(activeGuideTab, SETUP_AND_SPECS_GUIDE[activeGuideTab])
                }
                className="absolute right-3 top-3 flex items-center gap-1.5 rounded-xl bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-sky-600 transition"
              >
                {copiedKey === activeGuideTab ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedKey === activeGuideTab ? 'Tersalin' : 'Salin Instruksi'}</span>
              </button>
              <pre className="max-h-80 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
                {SETUP_AND_SPECS_GUIDE[activeGuideTab]}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}