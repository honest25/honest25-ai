export const config = {
  maxDuration: 30,
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

async function callModel(model, messages, context) {
  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), 8000); // 8s hard limit

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "Honest25-AI"
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [
          { role: "system", content: `You are Honest25-AI. Use this context: ${context}` },
          ...messages
        ]
      })
    });

    clearTimeout(timeout);

    const data = await response.json();

    if (data.choices && data.choices[0]) {
      return {
        reply: data.choices[0].message.content,
        modelUsed: model
      };
    }

    throw new Error("Invalid response");
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("POST only");
  }

  const { messages } = req.body;
  const lastQuery = messages[messages.length - 1].content;

  // DuckDuckGo Context
  let context = "";
  try {
    const search = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(lastQuery)}&format=json&no_html=1`
    );
    const sData = await search.json();
    context = sData.AbstractText || "General knowledge mode";
  } catch {
    context = "Search unavailable";
  }

  // FAST (Race)
  const fastModels = [
    "stepfun/step-3.5-flash:free",
    "nvidia/nemotron-nano-9b-v2:free",
    "google/gemma-3-4b-it:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "qwen/qwen3-4b:free"
  ];

  try {
    const fast = await Promise.any(
      fastModels.map(m => callModel(m, messages, context))
    );
    return res.status(200).json(fast);
  } catch {}

  // BALANCED (Race)
  const balancedModels = [
    "google/gemma-3-12b-it:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "z-ai/glm-4.5-air:free",
    "upstage/solar-pro-3:free",
    "nvidia/nemotron-3-nano-30b-a3b:free"
  ];

  try {
    const balanced = await Promise.any(
      balancedModels.map(m => callModel(m, messages, context))
    );
    return res.status(200).json(balanced);
  } catch {}

  // HEAVY (Race)
  const heavyModels = [
    "deepseek/deepseek-r1-0528:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "openai/gpt-oss-120b:free"
  ];

  try {
    const heavy = await Promise.any(
      heavyModels.map(m => callModel(m, messages, context))
    );
    return res.status(200).json(heavy);
  } catch {}

  return res.status(500).json({
    reply: "All models failed.",
    modelUsed: "none"
  });
}

