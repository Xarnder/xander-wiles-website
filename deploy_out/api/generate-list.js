export const config = {
  runtime: 'edge', // Edge runtime is great for this, requires less cold start time
};

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { topic } = await request.json();

    if (!topic) {
      return new Response(JSON.stringify({ error: 'Topic is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = "AIzaSyC47DG6Ha_xz2WOLkUElNPYcVu_LBt7_5Y";
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API Key not configured in environment variables.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const prompt = `Generate a list of exactly 30 short, specific, and common examples for the following topic: "${topic}".
The output must be strictly one item per line, with no extra text. Do not use numbers, bullet points, asterisks, preflight formatting, preambles, or any Markdown formatting. Simply provide the list of exactly 30 items separated by new lines.`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      }
    };

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.error?.message || JSON.stringify(errorData);
      return new Response(JSON.stringify({ error: `Google API Error: ${errorMessage}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      return new Response(JSON.stringify({ error: "Failed to parse response from Gemini" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Clean up response: Split by newlines, remove empty strings, remove any potential bullet marks or numbers
    const rawWords = generatedText.split('\n');
    const cleanedWords = rawWords
        .map(w => w.replace(/^[-*•\d\.\s]+/, '').trim())
        .filter(w => w.length > 0);

    return new Response(JSON.stringify({ words: cleanedWords }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Gemini API Error:", error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
