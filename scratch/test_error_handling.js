async function testCases() {
  const tests = [
    {
      name: 'Normal question: contact support',
      body: JSON.stringify({ question: 'How do I contact support?' }),
      contentType: 'application/json',
    },
    {
      name: 'Normal question: daily profit goal',
      body: JSON.stringify({ question: 'How do I set a daily profit goal?' }),
      contentType: 'application/json',
    },
    {
      name: 'Empty question validation',
      body: JSON.stringify({ question: '' }),
      contentType: 'application/json',
    },
    {
      name: 'Missing question field',
      body: JSON.stringify({ other: 123 }),
      contentType: 'application/json',
    },
    {
      name: 'Empty body string',
      body: '',
      contentType: 'application/json',
    },
    {
      name: 'Malformed JSON string',
      body: '{ bad json',
      contentType: 'application/json',
    },
  ];

  for (const t of tests) {
    console.log(`\n=== Running Test: "${t.name}" ===`);
    try {
      const res = await fetch('http://localhost:3000/api/help-chat', {
        method: 'POST',
        headers: { 'Content-Type': t.contentType },
        body: t.body,
      });

      console.log('HTTP Status:', res.status);
      console.log('Content-Type Header:', res.headers.get('content-type'));

      const raw = await res.text();
      try {
        const json = JSON.parse(raw);
        console.log('Valid JSON parsed successfully: YES');
        console.log('Answer preview:', json.answer ? json.answer.slice(0, 100).replace(/\n/g, ' ') : 'N/A');
        if (json.error) console.log('Error field:', json.error);
      } catch (err) {
        console.error('FAIL: Not valid JSON! Raw text was:', raw.slice(0, 100));
      }
    } catch (err) {
      console.error('Network Error:', err.message);
    }
  }
}

testCases();
