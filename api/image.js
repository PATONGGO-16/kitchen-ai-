module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "missing_api_key" });
  }

  const name = String((req.body && req.body.name) || "").trim().slice(0, 80);
  let ing = req.body && req.body.ingredients;
  if (!Array.isArray(ing)) ing = [];
  ing = ing.map(function (s) { return String(s).slice(0, 40); }).slice(0, 8);
  if (!name) {
    return res.status(400).json({ error: "no_name" });
  }

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const prompt =
    "A realistic, appetizing top-down food photograph of the finished Thai dish: " + name + ". " +
    (ing.length ? "Main ingredients visible: " + ing.join(", ") + ". " : "") +
    "Served on a plate, natural light, no text, no watermark, no people.";

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
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
      })
    });

    if (!r.ok) {
      const t = await r.text();
      console.error("image failed:", r.status, t.slice(0, 600));
      return res.status(502).json({ error: "upstream_error", status: r.status });
    }

    const data = await r.json();
    const cand = data && data.candidates && data.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    let found = null;
    parts.forEach(function (p) {
      const d = p.inlineData || p.inline_data;
      if (d && d.data) {
        found = { mime: d.mimeType || d.mime_type || "image/png", data: d.data };
      }
    });

    if (!found) {
      console.error("no image in response");
      return res.status(502).json({ error: "no_image" });
    }
    return res.status(200).json(found);
  } catch (err) {
    console.error("server error:", String(err));
    return res.status(500).json({ error: "server_error" });
  }
};

module.exports.config = { maxDuration: 60 };
