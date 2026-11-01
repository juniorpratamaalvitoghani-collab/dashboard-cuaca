// ============================================================================
// [BAGIAN 40% MURNI: VANILLA JS ENGINE, SINKRONISASI CUACA 100% AKURAT & GEOSPASIAL]
// Modul logika murni (ES6+) tanpa library eksternal untuk:
// 1. Sinkronisasi 100% antara Kondisi Cuaca, Suhu, Kelembapan, UV, Jam & Kanvas
// 2. Kalkulasi Jarak Geodesik Haversine (km) & Estimasi Waktu Tempuh Antar-Kota
// 3. Algoritma Deteksi Konflik Cuaca pada Itinerary (Outdoor vs Curah Hujan)
// 4. Generator Rekomendasi Barang Bawaan (Smart Packing List)
// ============================================================================

export function deriveConditionFromMetrics(rainProb, tempC, windKmh) {
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

export function deriveWeatherIconType(rainProb, windKmh) {
  if (rainProb >= 75 && windKmh >= 28) return 'storm';
  if (rainProb >= 55) return 'rain';
  if (windKmh >= 24) return 'windy';
  return 'sunny';
}

export function computeSynchronizedCityWeather(baseCity, selectedSlotTime, rainOverride, windOverride, liveFeed) {
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

export function evaluateTravelSuitability(weather) {
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

export function generateSmartPackingList(weather) {
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

export function analyzeItineraryConflicts(itineraryItems, hourlyForecast) {
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
export function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
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

export function convertTemp(tempC, unit) {
  if (unit === 'F') {
    return Math.round((tempC * 9) / 5 + 32) + '°F';
  }
  return Math.round(tempC) + '°C';
}

export function formatRupiah(amount) {
  return 'Rp ' + Number(amount || 0).toLocaleString('id-ID');
}

