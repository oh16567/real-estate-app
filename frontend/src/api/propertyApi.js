import { API_BASE } from "./base";

export async function getProperties(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const path = qs ? `/api/properties?${qs}` : "/api/properties"; // ← path 선언 필수
  const url = `${API_BASE}${path}`;                              // ← 절대경로로 호출

  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error("failed to fetch");
  return res.json();
}
