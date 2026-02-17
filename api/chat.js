export const config = { maxDuration: 60 }; // Vercel timeout buffer

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { messages } = await req.json();
  const query = messages[messages.length - 1].content;

  // DuckDuckGo context for better answers
  let context = '';
  try {
    const searchRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
    const data = await searchRes.json();
    context = data.AbstractText || '';
    if (data.RelatedTopics?.length) context += '\nRelated: ' + data.RelatedTopics.slice(0, 2).map(t => t.Text).join('; ');
  } catch {}

  // Your tiered stack + ultimate free fallback
  const modelStack = [
    'stepfun/step-3.5-flash:free',
    'nvidia/nemotron-nano-9b-v2:free',
    'google/gemma-3-4b-it:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'qwen/qwen3-4b:free',
    'google/gemma-3-12b-it:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
    'z-ai/glm-4.5-air:free',
    'upstage/solar-pro-3:free',
    'nvidia/nemotron-3-nano-30b-a3b:free',
    'deepseek/deepseek-r1-0528:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'nousresearch/hermes-3-llama-3.1-405b:free',
    'qwen/qwen3-next-80b-a3b-instruct:free',
    'openai/gpt-oss-120b:free',
    'openrouter/free' // Always-available emergency
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let replied = false;
  let modelUsed = '';

  for (const model of modelStack) {
    if (replied) break;

    // Live status to UI
    res.write(`data: ${JSON.stringify({ status: `Trying ${model.replace(/:free$/, '').split('/').pop()} (fast provider)...` })}\n\n`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s max for first token

      const apiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'X-Title': 'Honest25-AI',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: `You are Honest25-AI, a helpful assistant. ${context ? 'Context: ' + context : ''} Respond naturally and concisely.` },
            ...messages,
          ],
          stream: true,
          provider: { // Latency optimization per attempt
            sort: 'latency', // Prefer low-latency providers
            preferredMaxLatency: { p90: 3 } // Aim for <3s p90 latency
          }
        }),
      });

      clearTimeout(timeoutId);

      if (!apiRes.ok) throw new Error(`Status: ${apiRes.status}`);

      const reader = apiRes.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) {
                res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
                replied = true;
                modelUsed = model;
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      console.error(`Fallback triggered for ${model}: ${err.message}`);
      if (!replied) {
        res.write(`data: ${JSON.stringify({ status: `Slow – jumping to next...` })}\n\n`);
      }
    }
  }

  if (replied) {
    res.write(`data: ${JSON.stringify({ done: true, modelUsed: modelUsed.replace(/:free$/, '') })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ content: 'All models overloaded. Please try again shortly.' })}\n\n`);
  }

  res.end();
}
