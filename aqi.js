// Live AQI + Weather Outdoor Run Advisor (Open-Meteo Air Quality + Weather APIs).
// Zero API key, HTTPS, CORS-enabled, links directly to aqicn.org for station verification.

export const CITIES = [
  { id: 'delhi', name: 'New Delhi', lat: 28.6139, lon: 77.2090, aqicn: 'https://aqicn.org/city/delhi/' },
  { id: 'gurugram', name: 'Gurugram', lat: 28.4595, lon: 77.0266, aqicn: 'https://aqicn.org/city/india/gurugram/' },
  { id: 'noida', name: 'Noida', lat: 28.5355, lon: 77.3910, aqicn: 'https://aqicn.org/city/india/noida/' },
  { id: 'bengaluru', name: 'Bengaluru', lat: 12.9716, lon: 77.5946, aqicn: 'https://aqicn.org/city/india/bangalore/' },
  { id: 'mumbai', name: 'Mumbai', lat: 19.0760, lon: 72.8777, aqicn: 'https://aqicn.org/city/india/mumbai/' },
];

export function aqiVerdict(aqi) {
  if (aqi === null || aqi === undefined || !Number.isFinite(aqi)) {
    return { level: 'unknown', label: 'Checking AQI…', action: 'Loading air quality', tone: 'info', color: 'var(--cyan)' };
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

export async function fetchLiveAqi(cityId = 'delhi') {
  const city = CITIES.find((c) => c.id === cityId) || CITIES[0];
  const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${city.lat}&longitude=${city.lon}&current=us_aqi,pm2_5,pm10`;
  const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,relative_humidity_2m`;

  const [aqResp, wxResp] = await Promise.all([
    fetch(aqUrl, { cache: 'no-store' }),
    fetch(wxUrl, { cache: 'no-store' }),
  ]);
  if (!aqResp.ok) throw new Error('AQI fetch failed');
  const aq = await aqResp.json();
  const wx = wxResp.ok ? await wxResp.json() : {};
  const curAq = aq.current || {};
  const curWx = wx.current || {};
  const usAqi = Number.isFinite(Number(curAq.us_aqi)) ? Math.round(Number(curAq.us_aqi)) : null;

  return {
    city,
    aqi: usAqi,
    pm25: Number.isFinite(Number(curAq.pm2_5)) ? Number(curAq.pm2_5) : null,
    pm10: Number.isFinite(Number(curAq.pm10)) ? Number(curAq.pm10) : null,
    tempC: Number.isFinite(Number(curWx.temperature_2m)) ? Number(curWx.temperature_2m) : null,
    humidity: Number.isFinite(Number(curWx.relative_humidity_2m)) ? Math.round(Number(curWx.relative_humidity_2m)) : null,
    verdict: aqiVerdict(usAqi),
  };
}
