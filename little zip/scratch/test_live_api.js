const questions = [
  'How do I contact support?',
  'How do I set a daily profit goal?',
  'How do I create a new load?',
  'Can you explain deck space and GCWR?',
];

async function testApi() {
  for (const q of questions) {
    const start = Date.now();
    try {
      const res = await fetch('http://localhost:3000/api/help-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      const elapsed = Date.now() - start;
      console.log(`=== Query: "${q}" (${elapsed}ms) ===`);
      console.log('Status:', res.status);
      console.log('Answer:\n', data.answer);
      console.log('--------------------------------------------\n');
    } catch (err) {
      console.error(`Error on query "${q}":`, err.message);
    }
  }
}

testApi();
