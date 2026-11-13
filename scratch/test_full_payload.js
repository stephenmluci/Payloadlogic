require('dotenv').config();
const apiKey = process.env.GEMINI_API_KEY;

const models = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
];

const systemInstruction = `You are the official PayloadLogic Help Assistant. Answer concisely. Support email is support@payloadlogic.app.`;

async function testPayload(model) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const body = JSON.stringify({
      system_instruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [{
        role: 'user',
        parts: [{ text: 'How do I contact support?' }]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 300,
      }
    });

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const dur = Date.now() - start;
    const data = await res.json();
    if (res.ok) {
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log(`[SUCCESS] ${model} (${dur}ms):`, text?.trim());
      return true;
    } else {
      console.log(`[FAILED] ${model} (${dur}ms): ${res.status} - ${data.error?.message?.slice(0, 80)}`);
      return false;
    }
  } catch (err) {
    console.log(`[ERROR] ${model} (${Date.now() - start}ms):`, err.message);
    return false;
  }
}

async function run() {
  for (const m of models) {
    await testPayload(m);
  }
}

run();
