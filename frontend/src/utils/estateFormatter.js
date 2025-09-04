const MAP_FLOOR_TOKEN = {
    part: "층 일부",
    whole: "층 전체",
    bottom: "바닥층",
    parking: "주차장방",
    top: "옥탑방",
  };
  
  const pick = (...vals) =>
    vals.find(v => v !== undefined && v !== null && String(v).trim() !== "") || "";
  
  export function formatEstateLine(p = {}) {
    const {
      estate_type, estate_name, bld_type,
      estate_dong, estate_ho,
      floor_etc, floor_type1, floor_type2,
    } = p;
  
    const namePart = estate_type === "residence"
      ? pick(estate_name, bld_type)
      : pick(estate_name, bld_type);
  
    const dongPart = pick(estate_dong) ? `${String(estate_dong).trim()}동` : "";
  
    let hoOrFloor = "";
    if (pick(estate_ho)) {
      hoOrFloor = `${String(estate_ho).trim()}호`;
    } else {
      const token = pick(floor_etc, floor_type1, floor_type2);
      if (token) {
        const key = String(token).trim();
        hoOrFloor = MAP_FLOOR_TOKEN[key] || key;
      }
    }
  
    return [namePart, dongPart, hoOrFloor].filter(Boolean).join(" ");
  }
  