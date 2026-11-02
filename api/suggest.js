module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "missing_api_key" });
  }

  let items = req.body && req.body.items;
  if (!Array.isArray(items)) items = [];
  items = items
    .map(function (s) { return String(s).trim().slice(0, 40); })
    .filter(Boolean)
    .slice(0, 20);
  if (items.length === 0) {
    return res.status(400).json({ error: "no_items" });
  }

  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

  const prompt =
    "คุณคือเชฟผู้เชี่ยวชาญอาหารไทย โดยเฉพาะอาหารโคราช (เช่น แกงบวน ผัดหมี่โคราช ส้มตำโคราช ซุปหน่อไม้ ปลาร้าทรงเครื่อง)\n" +
    "วัตถุดิบที่ผู้ใช้มี: " + items.join(", ") + "\n" +
    "ให้ค้นหาสูตรจากเว็บไซต์สูตรอาหารที่น่าเชื่อถือก่อนตอบ แล้วแนะนำ 3 เมนูที่ทำได้จริงจากวัตถุดิบเหล่านี้ (เพิ่มของพื้นฐานในครัวได้เล็กน้อย) " +
    "ถ้าวัตถุดิบเข้ากับอาหารโคราชได้ ให้ใส่เมนูโคราชอย่างน้อย 1 เมนูและตั้ง korat เป็น true\n" +
    "ทุกส่วนผสมและเครื่องปรุงต้องระบุปริมาณที่ใช้ทำจริง เป็นหน่วยในครัว เช่น กรัม ช้อนโต๊ะ ช้อนชา ต้น ฟอง กลีบ สำหรับจำนวนคนที่ระบุใน servings ห้ามเดาตัวเลขเกินจริง\n" +
    "ตอบเป็น JSON เท่านั้น ไม่มีคำอธิบายอื่น ไม่มี markdown รูปแบบ: " +
    '{"dishes":[{"name":"ชื่อเมนูภาษาไทยที่ตรงกับชื่อที่ใช้ทั่วไป","emoji":"อีโมจิ 1 ตัว","korat":true,"servings":"สำหรับ 2 คน","why":"เหตุผลสั้นๆ 1 ประโยค","ingredients":[{"name":"หมูสับ","amount":"150 กรัม","have":true}],"seasonings":[{"name":"ซอสหอยนางรม","amount":"1 ช้อนโต๊ะ"}],"steps":["ขั้นตอนสั้นๆ 3-6 ข้อ"]}]}' +
    "\nใน ingredients ให้ have เป็น true ถ้าเป็นของที่ผู้ใช้มีอยู่แล้ว และ false ถ้าต้องหาเพิ่ม เขียนเป็นภาษาไทย";

  try {
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent";

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }]
      })
    });

    if (!r.ok) {
      return res.status(502).json({ error: "upstream_error", status: r.status });
    }

    const data = await r.json();
    const cand = data && data.candidates && data.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const text = parts.map(function (p) { return p.text || ""; }).join("");
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    const parsed = JSON.parse(text.slice(s, e + 1));

    const chunks = (cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
    const seen = {};
    const sources = [];
    chunks.forEach(function (c) {
      const w = c.web;
      if (w && w.uri) {
        const t = w.title || "เว็บไซต์";
        if (!seen[t]) {
          seen[t] = 1;
          sources.push({ title: t, uri: w.uri });
        }
      }
    });
    parsed.sources = sources.slice(0, 8);

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: "server_error" });
  }
};

module.exports.config = { maxDuration: 60 };
