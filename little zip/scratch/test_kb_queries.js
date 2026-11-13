require('dotenv').config();
const apiKey = process.env.GEMINI_API_KEY;

// Import knowledge base loader
// Since it's TS, we can mock or read the knowledge base
const fs = require('fs');
const path = require('path');

const kbFile = fs.readFileSync(path.join(__dirname, '../src/lib/helpKnowledgeBase.ts'), 'utf-8');

const systemInstruction = `You are the official PayloadLogic Help Assistant. You help hotshot truck owner-operators and dispatchers use the PayloadLogic platform.

Rules:
- Keep answers short, clear, and practical.
- Focus only on PayloadLogic features and hotshot trucking best practices.
- If you don't know something or the question is outside the product, say so politely and direct them to support@payloadlogic.app.
- Use a professional but friendly tone.
- When explaining features, be specific about how they work inside the app.
- Never invent features that don't exist.

=== PAYLOADLOGIC SUPPORT & CONTACT INFORMATION ===
- Support email: support@payloadlogic.app
- Users can contact support by emailing support@payloadlogic.app at any time.
- Support hours: Monday – Friday, 8am – 7pm EST.
- Response target: within 1 business day for active trial and subscribed fleets.
- If a user asks "how do I contact support?", "what is the support email?", "how can I get help?", "who do I email?", or any similar question, ALWAYS answer clearly: "You can reach our support team by emailing support@payloadlogic.app. We typically respond within 1 business day, Monday–Friday 8am–7pm EST."

=== KEY TOPICS ===
- Creating a Load: Navigate to the Loads tab or click "+ Create Load". Fill in pickup & delivery addresses, cargo weight, dimensions, negotiated rate. Assign a truck, trailer, driver and click "Confirm & Dispatch".
- Target Daily Business Profit (Daily Profit Goal): Set your daily net profit goal (e.g. $300/day) during the initial Fleet Financial Setup modal or any time under Settings -> Target Daily Business Profit. The Suggested Rate and Profit Engine calculate required booking rates based on this goal.
- Deck Space & GCWR: 48ft+ flatbed deck space consolidation tool. Calculates combined gross truck, trailer tare, and cargo weights to ensure GCWR compliance badge is green before dispatching.
- Profit & CPM: Net profit per load calculated factoring fuel, DEF, driver pay, maintenance, and overhead.
- Driver Roster: Manage drivers, CDL/Medical card expirations (30 and 14 day alerts), and cab app access.
`;

const questions = [
  'How do I contact support?',
  'How do I set a daily profit goal?',
  'How do I create a new load?',
];

async function ask(model, q) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: q }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500,
      }
    })
  });
  clearTimeout(timer);
  const dur = Date.now() - start;
  const data = await res.json();
  if (res.ok) {
    console.log(`[PASS] [${model}] (${dur}ms)\nQ: ${q}\nA: ${data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()}\n---`);
  } else {
    console.log(`[FAIL] [${model}] (${dur}ms) ${res.status}: ${data.error?.message}\n---`);
  }
}

async function main() {
  for (const q of questions) {
    console.log(`Testing query: "${q}" with gemini-flash-lite-latest`);
    await ask('gemini-flash-lite-latest', q);
    console.log(`Testing query: "${q}" with gemini-3.5-flash-lite`);
    await ask('gemini-3.5-flash-lite', q);
  }
}

main();
