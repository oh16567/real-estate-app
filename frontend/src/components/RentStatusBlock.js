import React from "react";

const ESTATE_TYPES = [
  { value: "residence", label: "주거용" },
  { value: "business",  label: "업무용" },
  { value: "commerce",  label: "상업용" },
];

const labelOf = (v) => (ESTATE_TYPES.find(o => o.value === v)?.label ?? "");

const yn = v => String(v || "").toLowerCase() === "y";

function sumByUsage(items) {
  let resCnt = 0;
  for (const it of items) if (it.estate_type === "residence") resCnt++;
  const total = items.length;
  const nonCnt = total - resCnt; // 주거외
  return { resCnt, nonCnt, total };
}

export default function RentStatusBlock({
  items,                            // [{unitNo, estate_type, type, deposit, monthly, mgmtFee, note}]
  setItems,
  owner_household, owner_room, owner_bath,
}) {
  const [edit, setEdit] = React.useState(false);
  const { resCnt, nonCnt, total } = React.useMemo(() => sumByUsage(items), [items]);

  const addRow = () => {
    setItems(prev => [...prev, {
      unitNo: "", estate_type: "", type: "", deposit: "", monthly: "", mgmtFee: "", note: ""
    }]);
  };
  const update = (idx, key, val) => {
    setItems(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r));
  };
  const remove = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  return (
    <div className="rent-status-card">
      {/* 상단 요약 */}
      <div className="rent-status-header">
        <div className="left"><strong>임대현황</strong></div>
        <div className="right">
          <span>전체 {total} 가구</span>
          <span className="dot">·</span>
          <span>주거용 {resCnt}</span>
          <span className="dot">·</span>
          <span>주거외 {nonCnt}</span>
          {yn(owner_household) && (
            <span className="owner-badge">주인세대 {owner_room ?? "-"}룸 / {owner_bath ?? "-"}욕실</span>
          )}
        </div>
      </div>

      {/* 수정 버튼 */}
      <div className="rent-status-actions">
        {!edit ? (
          <button type="button" className="btn" onClick={() => setEdit(true)}>수정</button>
        ) : (
          <>
            <button type="button" className="btn" onClick={addRow}>행 추가</button>
            <button type="button" className="btn" onClick={() => setEdit(false)}>저장</button>
          </>
        )}
      </div>

      {/* 표 */}
      <div className="rent-status-tablewrap">
        <table className="rent-status-table">
          <thead>
            <tr>
              <th>호수</th>
              <th>용도</th>
              <th>형태</th>
              <th>보증금</th>
              <th>월세</th>
              <th>관리비</th>
              <th>비고</th>
              {edit && <th className="narrow">삭제</th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={edit ? 8 : 7} className="empty">등록된 임대내역이 없습니다.</td>
              </tr>
            ) : items.map((r, idx) => (
              <tr key={idx}>
                <td>
                  {edit
                    ? <input value={r.unitNo || ""} onChange={e => update(idx, "unitNo", e.target.value)} />
                    : r.unitNo}
                </td>
                <td>
                  {edit ? (
                    <select
                      value={r.estate_type || ""}
                      onChange={e => update(idx, "estate_type", e.target.value)}
                    >
                      <option value="">선택</option>
                      {ESTATE_TYPES.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    labelOf(r.estate_type)
                  )}
                </td>
                <td>
                  {edit
                    ? <input value={r.type || ""} onChange={e => update(idx, "type", e.target.value)} />
                    : r.type}
                </td>
                <td>
                  {edit
                    ? <input value={r.deposit || ""} onChange={e => update(idx, "deposit", e.target.value)} />
                    : r.deposit}
                </td>
                <td>
                  {edit
                    ? <input value={r.monthly || ""} onChange={e => update(idx, "monthly", e.target.value)} />
                    : r.monthly}
                </td>
                <td>
                  {edit
                    ? <input value={r.mgmtFee || ""} onChange={e => update(idx, "mgmtFee", e.target.value)} />
                    : r.mgmtFee}
                </td>
                <td>
                  {edit
                    ? <input value={r.note || ""} onChange={e => update(idx, "note", e.target.value)} />
                    : r.note}
                </td>
                {edit && (
                  <td className="narrow">
                    <button type="button" className="btn danger" onClick={() => remove(idx)}>삭제</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {/* tfoot 없음 */}
        </table>
      </div>
    </div>
  );
}
