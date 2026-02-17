export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { messages } = req.body;
  const userMessage = messages[messages.length - 1].content;

  // DuckDuckGo Context
  let context = "";
  try {
    const ddg = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(userMessage)}&format=json&no_html=1`
    );
    const ddgData = await ddg.json();
    context = ddgData.AbstractText || "";
  } catch (e) {
    context = "";
  }

  // === MODEL TIERS ===
  const FAST = [
    "stepfun/step-3.5-flash:free",
    "nvidia/nemotron-nano-9b-v2:free",
    "google/gemma-3-4b-it:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "qwen/qwen3-4b:free"
  ];

  const BALANCED = [
    "google/gemma-3-12b-it:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "z-ai/glm-4.5-air:free",
    "upstage/solar-pro-3:free",
    "nvidia/nemotron-3-nano-30b-a3b:free"
  ];

  const HEAVY = [
    "deepseek/deepseek-r1-0528:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "openai/gpt-oss-120b:free"
  ];

  async function tryModel(model, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "X-Title": "Honest25-AI"
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: "system",
                content: `You are Honest25-AI. Use this web context if useful: ${context}`
              },
              ...messages
            ],
            max_tokens: 500
          })
        }
      );

      clearTimeout(timer);

      const data = await response.json();
      if (data.choices?.[0]?.message?.content) {
        return {
          reply: data.choices[0].message.content,
          modelUsed: model
        };
      }
    } catch (err) {
      return null;
    }

    return null;
  }

  // ===== EXECUTION ORDER =====

  // FAST MODELS (2s each)
  for (const model of FAST) {
    const result = await tryModel(model, 2000);
    if (result) return res.status(200).json(result);
  }

  // BALANCED MODELS (4s each)
  for (const model of BALANCED) {
    const result = await tryModel(model, 4000);
    if (result) return res.status(200).json(result);
  }

  // HEAVY MODELS (no timeout = final thinking)
  for (const model of HEAVY) {
    const result = await tryModel(model, 15000);
    if (result) return res.status(200).json(result);
  }

  return res.status(500).json({
    reply: "All models failed.",
    modelUsed: "none"
  });
}

