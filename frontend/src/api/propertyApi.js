import { API_BASE } from "./base";

export async function getProperties(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const path = qs ? `/api/properties?${qs}` : "/api/properties"; // ← path 선언 필수
  const url = `${API_BASE}${path}`;                              // ← 절대경로로 호출

  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error("failed to fetch");
  return res.json();
}

export async function saveRentItems(pid, items, memo) {
  const r = await fetch(`/api/properties/${pid}/rent-items`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, memo: memo ?? "" }),
  });
  const ct = r.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  const data = isJson ? await r.json() : await r.text();

  if (!r.ok) {
    throw new Error(isJson ? (data?.error || `HTTP ${r.status}`) : `HTTP ${r.status}: ${String(data).slice(0,200)}`);
  }
  if (!isJson) throw new Error("Invalid response: not JSON");
  return data;
}

export async function getPhotoStorage(){
  const r = await fetch("/api/properties/photo-storage");
  const text = await r.text();
  try { return JSON.parse(text); } catch {
    throw new Error("photo-storage not JSON: " + text.slice(0,120));
  }
}

export async function setPhotoStorage(storage){
  return fetch("/api/properties/photo-storage",{
    method:"PUT", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ storage })
  }).then(r=>r.json());
}
// export async function uploadServerPhoto(propertyId, file){
//   const fd = new FormData(); fd.append("file", file);
//   return fetch(`/api/properties/${propertyId}/photos`, { method:"POST", body: fd }).then(r=>r.json());
// }

export async function uploadServerPhoto(propertyId, file){
  const fd = new FormData(); fd.append("file", file);
  const r = await fetch(`/api/properties/${propertyId}/photos`, { method:"POST", body: fd });
  if (!r.ok) throw new Error("uploadServerPhoto failed");
  return r.json();
}

// ===================== Gemini 구글드라이브 공유폴더 업로더 ===================== 

// ===================== Gemini 구글드라이브 공유폴더 업로더 ===================== 

export async function listServerPhotos(propertyId){
  return fetch(`/api/properties/${propertyId}/photos`).then(r=>r.json());
}
export async function deleteServerPhoto(propertyId, photoId){
  return fetch(`/api/properties/${propertyId}/photos/${photoId}`, { method:"DELETE" }).then(r=>r.json());
}

// propertyApi.js 공통 헬퍼
async function getJSON(url, opts){
  const r = await fetch(url, opts);
  const ct = r.headers.get("content-type")||"";
  const text = await r.text();
  if (!r.ok || !ct.includes("application/json")) {
    throw new Error(`API ${url} invalid: ` + text.slice(0,120));
  }
  return JSON.parse(text);
}

// 사용 예
// export async function getPhotoStorage(){
//   return getJSON("/api/properties/photo-storage");
// }