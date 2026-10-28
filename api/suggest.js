module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("GEMINI_API_KEY is missing");
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
    "แนะนำ 3 เมนูที่ทำได้จริงจากวัตถุดิบเหล่านี้ (เพิ่มของพื้นฐานในครัวได้เล็กน้อย) " +
    "ถ้าวัตถุดิบเข้ากับอาหารโคราชได้ ให้ใส่เมนูโคราชอย่างน้อย 1 เมนูและตั้ง korat เป็น true\n" +
    "ตอบเป็น JSON เท่านั้น ไม่มีคำอธิบายอื่น ไม่มี markdown รูปแบบ: " +
    '{"dishes":[{"name":"ชื่อเมนู","emoji":"อีโมจิ 1 ตัว","korat":true,"why":"เหตุผลสั้นๆ 1 ประโยค","ingredients_used":["..."],"extra":["..."],"steps":["ขั้นตอนสั้นๆ 3-5 ข้อ"]}]}' +
    "\nเขียนเป็นภาษาไทย";

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
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!r.ok) {
      return res.status(502).json({ error: "upstream_error", status: r.status });
    }

    const data = await r.json();
    const parts =
      data && data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts;
    let text = parts && parts[0] && parts[0].text ? parts[0].text : "";
    text = text.replace(/```json|```/g, "").trim();

    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);
  } catch (e) {
    console.error("suggest error:", e);
    return res.status(500).json({ error: "server_error", detail: String(e) });

  }
};
