require('dotenv').config();
const apiKey = process.env.GEMINI_API_KEY;

async function listModels() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const data = await res.json();
  if (data.models) {
    const generateModels = data.models
      .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => m.name);
    console.log('Available models for generateContent:\n', generateModels.join('\n'));
  } else {
    console.log('No models returned:', data);
  }
}

listModels().catch(console.error);
