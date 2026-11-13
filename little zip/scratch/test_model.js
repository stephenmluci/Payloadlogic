require('dotenv').config();
const apiKey = process.env.GEMINI_API_KEY;

async function testFetchModels() {
  const models = [
    'gemini-2.5-flash-lite',
    'gemini-flash-latest',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
  ];

  for (const model of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hello, what is your model name?' }] }]
        })
      });
      const data = await res.json();
      if (res.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.log('SUCCESS with', model, ':', data.candidates[0].content.parts[0].text);
        return model;
      } else {
        console.log('FAILED with', model, ':', data.error?.message || res.status);
      }
    } catch (e) {
      console.log('ERROR with', model, ':', e.message);
    }
  }
}

testFetchModels().catch(console.error);
