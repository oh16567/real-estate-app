const MAP_FLOOR_TOKEN = {
  part: "층 일부",
  whole: "층 전체",
  bottom: "바닥층",
  parking: "주차장방",
  top: "옥탑방",
};

const pick = (...vals) =>
  vals.find(
    (v) => v !== undefined && v !== null && String(v).trim() !== ""
  ) || "";

// 리스트/AddressSearch 공통 제목 라인
// - 기본: estate_name (없으면 bld_type)
// - 동: estate_dong 이 있으면 "동" 붙여서
// - 호:
//   · 있으면 "호" 붙여서
//   · 없으면
//      - 상업용/업무용 : 층분할(floor_type1) + 호수대체(floor_etc)
//      - 그 외        : 층대체(floor_type2) + 호수대체(floor_etc)
export function formatEstateLine(p = {}) {
  const {
    estate_type,
    estate_name,
    bld_type,
    estate_dong,
    estate_ho,
    floor_etc,
    floor_type1,
    floor_type2,
  } = p;

  // 건물명: estate_name -> bld_type
  const namePart = pick(estate_name, bld_type);

  // 동
  const dong = pick(estate_dong);
  const dongPart = dong ? `${String(dong).trim()}동` : "";

  // 호/층
  const ho = pick(estate_ho);
  let tail = "";

  if (ho) {
    // 호가 있으면 무조건 "호"
    tail = `${String(ho).trim()}호`;
  } else {
    const type = String(estate_type || "").trim();
    if (type === "business" || type === "commerce") {
      // 상업용/업무용: 층 분할 여부(floor_type1) + 호수 대체(floor_etc)
      const t1 = pick(floor_type1);
      const t1Label = t1
        ? MAP_FLOOR_TOKEN[String(t1).trim()] || String(t1).trim()
        : "";
      const etc = pick(floor_etc);
      tail = [t1Label, etc].filter(Boolean).join(" ");
    } else {
      // 그 외: 층 대체(floor_type2) + 호수 대체(floor_etc)
      const t2 = pick(floor_type2);
      const t2Label = t2
        ? MAP_FLOOR_TOKEN[String(t2).trim()] || String(t2).trim()
        : "";
      const etc = pick(floor_etc);
      tail = [t2Label, etc].filter(Boolean).join(" ");
    }
  }

  return [namePart, dongPart, tail].filter(Boolean).join(" ");
  }