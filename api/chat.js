export default async function handler(req, res) {
  const { messages } = await req.json();
  const lastQuery = messages[messages.length - 1].content;

  // 1. Quick Search via DuckDuckGo
  const search = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(lastQuery)}&format=json&no_html=1`);
  const searchData = await search.json();
  const context = searchData.AbstractText || "Search for: " + lastQuery;

  // 2. Your Model List (Prioritizing Speed + Reliability)
  const modelList = [
    "arcee-ai/trinity-large-preview:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "deepseek/deepseek-r1-0528:free",
    "stepfun/step-3.5-flash:free",
    "google/gemma-3-27b-it:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "mistralai/mistral-small-3.1-24b-instruct:free"
  ];

  // 3. OpenRouter API Call with Built-in Fallback
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "models": modelList, // OpenRouter handles the 'jump' if delay occurs
      "messages": [
        { "role": "system", "content": `You are Honest25-AI. Context: ${context}` },
        ...messages
      ]
    })
  });

  const data = await response.json();
  res.status(200).json(data);
}
