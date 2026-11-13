require('dotenv').config();
const apiKey = process.env.GEMINI_API_KEY;

const candidates = [
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
];

async function run() {
  for (const m of candidates) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hello!' }] }]
        })
      });
      clearTimeout(t);
      const data = await res.json();
      const elapsed = Date.now() - start;
      if (res.ok) {
        console.log(`[OK] ${m} responded in ${elapsed}ms: ${data.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 50)}`);
      } else {
        console.log(`[FAIL] ${m} (${res.status}) in ${elapsed}ms: ${data.error?.message}`);
      }
    } catch (e) {
      console.log(`[ERR] ${m}: ${e.name} ${e.message}`);
    }
  }
}

run();
