import React from "react";

const FLOOR_MAP = { part:"층 일부", whole:"층 전체", bottom:"바닥층", parking:"주차장방", top:"옥탑방" };

// 값 중 첫 번째로 유효한 것 반환
const pick = (...vals) => {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s !== "" && s.toLowerCase() !== "null" && s.toLowerCase() !== "undefined") {
      return s;
    }
  }
  return "";
};

function formatResidenceSubLine(p) {
  if (p.estate_type !== "residence") return "";

  const dong = pick(p.estate_dong);  // ★ 건물동만 사용, 행정동은 제외
  const ho   = pick(p.estate_ho);

  const dongPart = dong ? `${dong}동` : "";
  let tail = "";

  if (ho) {
    tail = `${ho}호`;
  } else {
    const t = pick(p.floor_etc, p.floor_type1, p.floor_type2);
    if (t) tail = FLOOR_MAP[String(t).trim()] || String(t).trim();
  }

  // 건물명 + (동/호/층)
  return [p.estate_name, dongPart, tail].filter(Boolean).join(" ");
}




export default function PropertyList({
  properties = [],
  loading = false,
  highlightedId = null,     // ★ 추가: 현재 선택된 id
  onSelect = () => {},      // ★ 추가: 클릭 시 선택 콜백
  onHover,
  onLeave,
}) {

  if (loading) return <div style={{ padding: 8 }}>불러오는 중…</div>;
  if (!properties.length) return <div style={{ padding: 8 }}>목록이 없습니다.</div>;

  return (
    <div style={{ marginTop: 8 }}>
      {properties.map((p) => {
        const id = p.id ?? p.estate_no ?? `${p.lat},${p.lng}`;
        // 리스트 map 안 또는 마커 클릭 리스너에서
console.log("dong, ho", p.estate_dong, p.dong, p.estate_ho, p.ho, p.room_no);

        return (
          <div
            key={id}
            onMouseEnter={() => onHover && onHover(id)}
            onMouseLeave={() => onLeave && onLeave()}
            onClick={() => onSelect(id)}  // ★ 클릭하면 선택 콜백
            style={{
              border: "1px solid #eee",
              borderRadius: 8,
              padding: 8,
              marginBottom: 8,
              background:
              highlightedId === id ? "#FFF3D0" : "#fff",  // ★ 선택 시 배경 강조
              transition: "background 0.15s ease",
            }}
            className="list-row"
          >
            <div style={{ fontWeight: 700 }}>No. {p.estate_no}</div>
            <div style={{ fontWeight: 700 }}>{formatResidenceSubLine(p) || p.title || "(제목 없음)"}</div>
            <div style={{ fontSize: 12, color: "#374151" }}>
              {(p.dong ?? "")} {(p.jibun ?? "")} {(p.roadAddress ?? "")}
            </div>
            <div style={{ marginTop: 4 }}>{p.price || ""}</div>
          </div>
        );
      })}
    </div>
  );
}
