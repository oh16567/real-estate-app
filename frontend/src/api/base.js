// CRA에서는 REACT_APP_ 접두사만 빌드 시 주입됩니다.
const envBase = process.env.REACT_APP_API_BASE_URL;

// 최종 API_BASE 결정: .env > 현재 호스트(origin) > 고정 IP
export const API_BASE = (envBase || window.location.origin || "http://210.114.19.130:5000").replace(/\/$/, "");
