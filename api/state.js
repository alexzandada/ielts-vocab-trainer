const TABLE = "app_state";
const ROW_ID = "singleton";

async function supabaseFetch(path, options = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...options.headers,
  };

  return fetch(url, {
    ...options,
    headers,
  });
}

module.exports = async function handler(req, res) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(503).json({ error: "Supabase is not configured" });
    return;
  }

  if (req.method === "GET") {
    const response = await supabaseFetch(`${TABLE}?id=eq.${ROW_ID}&select=*`);
    const rows = await response.json();
    res.status(200).json(rows[0] || { id: ROW_ID, progress: {}, settings: {} });
    return;
  }

  if (req.method === "POST") {
    const payload = {
      id: ROW_ID,
      progress: req.body.progress || {},
      settings: req.body.settings || {},
      updatedAt: new Date().toISOString(),
    };
    const response = await supabaseFetch(`${TABLE}?on_conflict=id`, {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(payload),
    });
    const rows = await response.json();
    res.status(200).json(rows[0] || payload);
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method not allowed" });
};
