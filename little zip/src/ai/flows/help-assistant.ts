/**
 * @fileOverview Official PayloadLogic Help & Guides AI Assistant powered by Gemini.
 */

import { getKnowledgeBaseContextString, findKnowledgeBaseFallback } from '@/lib/helpKnowledgeBase';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface HelpAssistantInput {
  question: string;
  history?: ChatMessage[];
}

export interface HelpAssistantOutput {
  answer: string;
}

// Models in priority order — tested for lowest latency and highest availability.
// gemini-flash-lite-latest and gemini-3.5-flash-lite provide sub-1.5s response times.
const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
];

export async function askHelpAssistant(input: HelpAssistantInput): Promise<HelpAssistantOutput> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;

  if (!apiKey) {
    // If no API key configured, use the internal knowledge base matcher
    const localMatch = findKnowledgeBaseFallback(input.question);
    if (localMatch) {
      return { answer: localMatch };
    }
    return {
      answer: 'The AI Help Assistant is temporarily unavailable because an API key has not been configured. Please reach out to our team at support@payloadlogic.app.',
    };
  }

  const knowledgeBase = getKnowledgeBaseContextString();

  const systemInstruction = `You are the official PayloadLogic Help Assistant. You help hotshot trucking owner-operators, fleet managers, and dispatchers use the PayloadLogic platform effectively.

Rules:
- Keep answers concise, clear, and practical.
- Focus specifically on PayloadLogic features and hotshot trucking best practices.
- Use a helpful, professional, and friendly tone.
- When explaining features, provide the exact in-app steps and navigation paths.
- Never invent features that do not exist.

=== PAYLOADLOGIC SUPPORT & CONTACT INFORMATION ===
- Support email: support@payloadlogic.app
- Support hours: Monday – Friday, 8:00 AM – 7:00 PM EST.
- Target response time: Within 1 business day for active trial and subscribed fleets.
- If a user asks "how do I contact support?", "what is the support email?", "how can I get help?", or anything similar, ALWAYS answer clearly: "You can reach our support team by emailing support@payloadlogic.app. We typically respond within 1 business day, Monday–Friday 8am–7pm EST."

=== CORE APP FEATURES & NAVIGATION ===
1. Creating & Dispatching Loads:
   - Navigate to the Loads tab or click "+ Create Load".
   - Fill in pickup and delivery addresses with appointment windows.
   - Enter cargo weight, length, and cargo type.
   - Specify negotiated rate (gross pay) to see instant rate-per-mile metrics.
   - Select power unit (truck), trailer, and driver from the company roster.
   - Confirm GCWR compliance badge is green, then click "Confirm & Dispatch".

2. Daily Profit Goal (Target Daily Business Profit):
   - Set during initial onboarding in the "Fleet Financial Setup" modal.
   - Can be updated anytime under Settings -> "Target Daily Business Profit".
   - Enter your target daily net profit (e.g. $300/day).
   - This goal directly powers the Profit Engine and Suggested Rate calculator, telling you the exact minimum rate to book per load to hit your target.
   - Also tracks daily progress on your Command Center dashboard.

3. Deck Space Consolidation & GCWR Compliance:
   - Designed for up to 40ft hotshot flatbed and gooseneck trailers.
   - Visual deck planner lets dispatchers combine multiple partial shipments on a single trailer deck.
   - Automated GCWR (Gross Combined Weight Rating) checker calculates combined truck weight, trailer tare, and cargo weights to ensure axle and legal gross weight limits are met before rolling.

4. Real-Time Profit Tracking & Cost-Per-Mile (CPM):
   - Tracks net profit after fuel, DEF, driver compensation (flat or % of gross), tolls, and maintenance overhead.
   - Computes Cost-Per-Mile (CPM) for both loaded and empty deadhead miles.

5. Fleet & Driver Management:
   - Maintain company driver and contractor rosters.
   - Automated compliance alerts trigger 30 days and 14 days before CDL or Medical Examiner Certificates expire.
   - Drivers have a specialized mobile Cab Dashboard for milestone tracking, Google Maps routing, and electronic proof-of-delivery (ePOD) signatures and photo capture.

6. Invoicing & Document Archiving:
   - One-click PDF invoice generation upon delivery completion.
   - Automatically attaches signed Bill of Lading (BOL) and ePODs for factoring companies and brokers.

=== COMPLETE PAYLOADLOGIC KNOWLEDGE BASE ===
${knowledgeBase}
`;

  // Build messages array for Gemini API
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  // Add conversation history if present (last 8 messages for context)
  if (input.history && input.history.length > 0) {
    for (const msg of input.history.slice(-8)) {
      contents.push({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  // Add current question
  contents.push({
    role: 'user',
    parts: [{ text: input.question }],
  });

  const requestBody = JSON.stringify({
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    contents,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  });

  // Try each model in order until one succeeds
  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: AbortSignal.timeout(5000), // 5-second timeout per model prevents indefinite hangs
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.warn(`Gemini model ${model} returned ${response.status}:`, errData?.error?.message || '');
        // For unauthorized API keys, don't keep hammering
        if (response.status === 401 || response.status === 403) {
          const localFallback = findKnowledgeBaseFallback(input.question);
          if (localFallback) {
            return { answer: localFallback };
          }
          return {
            answer: 'The AI assistant credentials are being verified. For immediate support, please contact support@payloadlogic.app.',
          };
        }
        continue; // Try next model on 404/429/500/503
      }

      const data = await response.json();
      const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!answer) {
        console.warn(`Gemini model ${model} returned empty answer`);
        continue; // Try next model
      }

      return { answer: answer.trim() };
    } catch (err: any) {
      console.warn(`Gemini model ${model} attempt failed (${err?.name}):`, err?.message);
      // Continue to try next model
    }
  }

  // All AI models failed/timed out — check local knowledge base before giving up
  console.warn('All Gemini models failed or timed out for question:', input.question);
  const localMatch = findKnowledgeBaseFallback(input.question);
  if (localMatch) {
    return { answer: localMatch };
  }

  return {
    answer: "I couldn't connect to the AI service right now. Please explore the Help Topics on the left or reach out directly to our team at support@payloadlogic.app — we respond within 1 business day, Monday–Friday 8am–7pm EST.",
  };
}
