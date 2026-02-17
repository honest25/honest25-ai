export const config = {
  maxDuration: 30,
};

async function callModel(model, messages, context) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "Honest25-AI"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `You are Honest25-AI. Use this context: ${context}` },
          ...messages
        ]
      })
    });

    const data = await res.json();
    clearTimeout(timeout);

    if (data.choices?.[0]?.message?.content) {
      return {
        success: true,
        reply: data.choices[0].message.content,
        model
      };
    }

    return { success: false };

  } catch (e) {
    return { success: false };
  }
}

async function raceModels(models, messages, context) {
  return new Promise(async (resolve) => {
    let resolved = false;

    models.forEach(async (model) => {
      if (resolved) return;

      const result = await callModel(model, messages, context);

      if (result.success && !resolved) {
        resolved = true;
        resolve(result);
      }
    });

    setTimeout(() => {
      if (!resolved) resolve({ success: false });
    }, 7000);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Use POST");

  const { messages } = await req.json();
  const userQuery = messages[messages.length - 1].content;

  // DuckDuckGo Search
  const searchRes = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(userQuery)}&format=json&no_html=1`
  );
  const searchData = await searchRes.json();
  const context = searchData.AbstractText || "No search snippet found.";

  // 🔥 FAST MODELS (RACE)
  const fastModels = [
    "stepfun/step-3.5-flash:free",
    "nvidia/nemotron-nano-9b-v2:free",
    "google/gemma-3-4b-it:free"
  ];

  let result = await raceModels(fastModels, messages, context);

  // 🧠 BALANCED
  if (!result.success) {
    const balancedModels = [
      "google/gemma-3-12b-it:free",
      "mistralai/mistral-small-3.1-24b-instruct:free",
      "z-ai/glm-4.5-air:free"
    ];
    result = await raceModels(balancedModels, messages, context);
  }

  // 🔥 HEAVY FINAL
  if (!result.success) {
    const heavyModels = [
      "deepseek/deepseek-r1-0528:free",
      "meta-llama/llama-3.3-70b-instruct:free"
    ];
    result = await raceModels(heavyModels, messages, context);
  }

  if (result.success) {
    return res.status(200).json({
      reply: result.reply,
      modelUsed: result.model
    });
  }

  res.status(500).json({
    reply: "All Honest25-AI models are currently busy."
  });
}
