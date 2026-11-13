require('dotenv').config();
const apiKey = process.env.GEMINI_API_KEY;

const modelsToTest = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
];

async function testOne(model) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Answer in 5 words: How are you?' }] }]
      })
    });
    clearTimeout(timer);
    const data = await res.json();
    const dur = Date.now() - start;
    if (res.ok) {
      console.log(`[PASS] ${model.padEnd(25)} ${dur}ms: ${data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()}`);
    } else {
      console.log(`[FAIL] ${model.padEnd(25)} ${dur}ms: ${res.status} - ${data.error?.message?.slice(0, 80)}`);
    }
  } catch (e) {
    console.log(`[ERR ] ${model.padEnd(25)}: ${e.name} ${e.message}`);
  }
}

async function main() {
  console.log('Testing models:');
  for (const m of modelsToTest) {
    await testOne(m);
  }
}

main();
