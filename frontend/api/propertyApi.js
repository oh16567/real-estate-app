export async function getProperties(params = {}) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`/api/properties?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("failed to fetch");
  return res.json(); // { total, page, pageSize, items }
}