// Dual-source Outdoor Run AQI Advisor:
// 1) WAQI / CPCB physical ground station (token loaded privately from Plan_Config in Google Sheet)
// 2) Open-Meteo satellite model + weather (fallback & side-by-side comparison)
// Takes the stricter (higher) AQI for runner safety; links out to AQI.in.

export const CITIES = [
  { id: 'gurugram', name: 'Gurugram · MG Road Metro', lat: 28.4796, lon: 77.0801, link: 'https://www.aqi.in/dashboard/india/haryana/gurugram' },
  { id: 'delhi', name: 'New Delhi', lat: 28.6139, lon: 77.2090, link: 'https://www.aqi.in/dashboard/india/delhi' },
  { id: 'noida', name: 'Noida', lat: 28.5355, lon: 77.3910, link: 'https://www.aqi.in/dashboard/india/uttar-pradesh/noida' },
  { id: 'bengaluru', name: 'Bengaluru', lat: 12.9716, lon: 77.5946, link: 'https://www.aqi.in/dashboard/india/karnataka/bangalore' },
  { id: 'mumbai', name: 'Mumbai', lat: 19.0760, lon: 72.8777, link: 'https://www.aqi.in/dashboard/india/maharashtra/mumbai' },
];

export function aqiVerdict(aqi) {
  if (aqi === null || aqi === undefined || !Number.isFinite(aqi)) {
    return { level: 'unknown', label: 'Checking AQI…', action: 'Loading live air quality', tone: 'info', color: 'var(--cyan)' };
  }
  if (aqi <= 50) {
    return { level: 'good', label: 'Go Run Outside', action: 'Clean air — ideal for outdoor Zone 2.', tone: 'ok', color: 'var(--green)' };
  }
  if (aqi <= 100) {
    return { level: 'moderate', label: 'OK Outside', action: 'Fine for easy Zone 2; avoid heavy traffic.', tone: 'ok', color: 'var(--green)' };
  }
  if (aqi <= 150) {
    return { level: 'caution', label: 'Short / Park Only', action: 'Keep strictly Zone 2 or move to treadmill.', tone: 'warn', color: 'var(--amber)' };
  }
  if (aqi <= 200) {
    return { level: 'unhealthy', label: 'Treadmill Only', action: 'Unhealthy air — swap outdoor run for treadmill.', tone: 'stop', color: 'var(--rose)' };
  }
  return { level: 'very_unhealthy', label: 'Stay Indoors', action: 'Very unhealthy AQI — treadmill or strength only.', tone: 'stop', color: 'var(--rose)' };
}

function shortStation(raw) {
  if (!raw) return '';
  return String(raw).split(',')[0].trim();
}

export async function fetchLiveAqiCoords({ lat, lon, name, link }, waqiToken = '') {
  const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10`;
  const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m`;
  const waqiUrl = waqiToken
    ? `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${encodeURIComponent(waqiToken)}`
    : null;

  const [aqRes, wxRes, waqiRes] = await Promise.all([
    fetch(aqUrl, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(wxUrl, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    waqiUrl ? fetch(waqiUrl, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null),
  ]);

  const curAq = (aqRes && aqRes.current) || {};
  const curWx = (wxRes && wxRes.current) || {};
  const modelAqi = Number.isFinite(Number(curAq.us_aqi)) ? Math.round(Number(curAq.us_aqi)) : null;

  let groundAqi = null;
  let station = '';
  let groundPm25 = null;
  if (waqiRes && waqiRes.status === 'ok' && waqiRes.data) {
    const rawAqi = Number(waqiRes.data.aqi);
    if (Number.isFinite(rawAqi)) groundAqi = Math.round(rawAqi);
    station = shortStation(waqiRes.data.city && waqiRes.data.city.name);
    const pm = waqiRes.data.iaqi && waqiRes.data.iaqi.pm25 && Number(waqiRes.data.iaqi.pm25.v);
    if (Number.isFinite(pm)) groundPm25 = Math.round(pm);
  }

  // Use the higher (safer) AQI of CPCB ground station vs satellite model for the Go/Treadmill verdict
  const candidates = [groundAqi, modelAqi].filter((v) => v !== null);
  const effectiveAqi = candidates.length ? Math.max(...candidates) : null;

  return {
    city: { name, link: link || 'https://www.aqi.in/dashboard/india/haryana/gurugram' },
    aqi: effectiveAqi,
    groundAqi,
    station,
    modelAqi,
    pm25: groundPm25 ?? (Number.isFinite(Number(curAq.pm2_5)) ? Number(curAq.pm2_5) : null),
    tempC: Number.isFinite(Number(curWx.temperature_2m)) ? Number(curWx.temperature_2m) : null,
    humidity: Number.isFinite(Number(curWx.relative_humidity_2m)) ? Math.round(Number(curWx.relative_humidity_2m)) : null,
    verdict: aqiVerdict(effectiveAqi),
  };
}

export async function fetchLiveAqi(cityId = 'gurugram', waqiToken = '') {
  const city = CITIES.find((c) => c.id === cityId) || CITIES[0];
  return fetchLiveAqiCoords(city, waqiToken);
}

export function locateBrowserCoords() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: Number(pos.coords.latitude.toFixed(4)),
        lon: Number(pos.coords.longitude.toFixed(4)),
        name: 'My Location',
        link: 'https://www.aqi.in/',
      }),
      () => reject(new Error('Location permission denied.')),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  });
}
