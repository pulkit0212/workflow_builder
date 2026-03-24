const defaultGeminiModel = "gemini-2.5-flash";
const rawPreviewLimit = 300;

const meetingSummarizerGeminiJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "key_points", "action_items"],
  propertyOrdering: ["summary", "key_points", "action_items"],
  properties: {
    summary: {
      type: "string",
      description: "A concise factual summary of the meeting in 2 to 4 sentences.",
    },
    key_points: {
      type: "array",
      description: "Short standalone discussion points that capture the main topics covered.",
      items: {
        type: "string",
      },
    },
    action_items: {
      type: "array",
      description: "All clearly assigned tasks or commitments, preserving owners and deadlines exactly when present.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["task", "owner", "deadline"],
        propertyOrdering: ["task", "owner", "deadline"],
        properties: {
          task: {
            type: "string",
            description: "The concrete task or next step.",
          },
          owner: {
            type: "string",
            description: "The exact owner if stated; otherwise an empty string.",
          },
          deadline: {
            type: "string",
            description: "The exact deadline if stated; otherwise an empty string.",
          },
        },
      },
    },
  },
};

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTask(task) {
  return normalizeWhitespace(task).replace(/^[*-]\s*/, "").replace(/\.$/, "");
}

function normalizeOwner(owner) {
  return normalizeWhitespace(owner).replace(/^(owner|assigned to|with)\s+/i, "");
}

function normalizeDeadline(deadline) {
  return normalizeWhitespace(deadline).replace(/^(by|before|on|for)\s+/i, "");
}

function taskSimilarityKey(item) {
  return normalizeTask(item.task)
    .toLowerCase()
    .replace(/\b(the|a|an|please|kindly)\b/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickPreferredActionItem(current, candidate) {
  const currentScore = Number(Boolean(normalizeOwner(current.owner))) + Number(Boolean(normalizeDeadline(current.deadline)));
  const candidateScore =
    Number(Boolean(normalizeOwner(candidate.owner))) + Number(Boolean(normalizeDeadline(candidate.deadline)));

  return candidateScore > currentScore ? candidate : current;
}

function dedupeActionItems(items) {
  const deduped = new Map();

  for (const item of items) {
    const normalizedItem = {
      task: normalizeTask(item.task || ""),
      owner: normalizeOwner(item.owner || ""),
      deadline: normalizeDeadline(item.deadline || ""),
      completed: item.completed ?? false,
    };

    if (!normalizedItem.task) {
      continue;
    }

    const key = taskSimilarityKey(normalizedItem);
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, normalizedItem);
      continue;
    }

    deduped.set(key, pickPreferredActionItem(existing, normalizedItem));
  }

  return [...deduped.values()];
}

function normalizeMeetingSummarizerOutput(output) {
  return {
    summary: normalizeWhitespace(output.summary || ""),
    key_points: Array.isArray(output.key_points)
      ? output.key_points.map((item) => normalizeWhitespace(String(item))).filter(Boolean)
      : [],
    action_items: dedupeActionItems(Array.isArray(output.action_items) ? output.action_items : []),
  };
}

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    const error = new Error("Gemini API key is not configured.");
    error.provider = "gemini";
    error.statusCode = 503;
    error.details = {
      provider: "gemini",
      code: "missing_api_key",
    };
    throw error;
  }

  return apiKey;
}

function buildMeetingSummarizerPrompt(transcript) {
  return [
    "You analyze meeting transcripts for an AI workflow product.",
    "Selected provider context: gemini.",
    "Return a concise, factual summary of the meeting.",
    "Extract key discussion points as short standalone strings.",
    "Scan the full transcript from start to finish before answering.",
    "Pay special attention to recap, wrap-up, closing, and last-mile planning sections near the end of the meeting.",
    "Extract action items from explicit commitments and clearly implied next steps.",
    'Treat phrases like "I\'ll", "I will", "we will", "can you", "please", "need to", "follow up", "send", "share", "review", "finalize", "by Friday", "next week", and "tomorrow afternoon" as strong action-item signals when they refer to concrete work.',
    'Treat direct assignments like "Rahul will", "Maya can take", "Neha owns", "Arjun to review", and "assigned to Maya" as clear action items.',
    "Prefer completeness over being overly selective when tasks are clearly assigned or committed.",
    "If a person commits to doing something, include it as an action item.",
    "Capture all clearly assigned tasks, not just the first few.",
    "Look for tasks repeated or clarified during recap sections and include them once in the final action_items list.",
    'Set "owner" and "deadline" only when they are clearly stated in the transcript.',
    'If a deadline is stated, preserve it exactly as written in the transcript.',
    'If owner or deadline are not clear, return empty strings for those fields.',
    "Do not invent attendees, decisions, dates, or owners.",
    "Return valid JSON only.",
    "Do not include markdown.",
    "Do not include commentary before or after the JSON.",
    "Use this exact JSON schema and key names:",
    "{",
    '  "summary": "string",',
    '  "key_points": ["string"],',
    '  "action_items": [',
    "    {",
    '      "task": "string",',
    '      "owner": "string",',
    '      "deadline": "string"',
    "    }",
    "  ]",
    "}",
    "Requirements:",
    "- summary: 2 to 4 sentences",
    "- key_points: 3 to 6 items when enough information exists",
    "- action_items: include every clear task commitment you can find",
    "- action_items: preserve chronological clarity when it helps",
    "- action_items: deduplicate repeated or near-duplicate tasks",
    "- action_items: include tasks mentioned in recap or closing discussion even if they appear late in the transcript",
    "- action_items: [] if no clear actions are present",
    "",
    "Meeting transcript:",
    transcript,
    "",
    "Focus on extraction quality:",
    "- Keep the summary concise and factual.",
    "- Capture the main discussion points, not side chatter.",
    "- Include every clearly assigned action item.",
    "- Preserve owner names and deadlines exactly as written when present.",
  ].join("\n");
}

function createRawPreview(value) {
  return value.trim().slice(0, rawPreviewLimit);
}

function getGeminiText(payload) {
  const text = (payload.candidates || [])
    .flatMap((candidate) => (candidate.content && candidate.content.parts) || [])
    .map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    const error = new Error("Gemini returned an empty response.");
    error.provider = "gemini";
    error.statusCode = 502;
    throw error;
  }

  return text;
}

function parseGeminiApiResponse(rawResponseText) {
  try {
    return JSON.parse(rawResponseText);
  } catch {
    const error = new Error("Gemini returned invalid JSON.");
    error.provider = "gemini";
    error.statusCode = 502;
    error.details = {
      provider: "gemini",
      stage: "summarization",
      rawPreview: createRawPreview(rawResponseText),
    };
    throw error;
  }
}

function parseGeminiStructuredOutput(rawStructuredText) {
  let parsed;

  try {
    parsed = JSON.parse(rawStructuredText);
  } catch {
    const error = new Error("Gemini returned invalid structured output.");
    error.provider = "gemini";
    error.statusCode = 502;
    error.details = {
      provider: "gemini",
      stage: "summarization",
      rawPreview: createRawPreview(rawStructuredText),
    };
    throw error;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.summary !== "string" ||
    !Array.isArray(parsed.key_points) ||
    !Array.isArray(parsed.action_items)
  ) {
    const error = new Error("Gemini returned invalid structured output.");
    error.provider = "gemini";
    error.statusCode = 502;
    error.details = {
      provider: "gemini",
      stage: "summarization",
      rawPreview: createRawPreview(rawStructuredText),
    };
    throw error;
  }

  return normalizeMeetingSummarizerOutput(parsed);
}

async function summarizeMeetingWithGemini(transcript) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${defaultGeminiModel}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": getGeminiApiKey(),
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: buildMeetingSummarizerPrompt(transcript),
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: meetingSummarizerGeminiJsonSchema,
      },
    }),
  });

  if (!response.ok) {
    let payload = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const providerMessage = payload && payload.error ? payload.error.message : "Gemini request failed.";
    const statusCode = response.status || (payload && payload.error ? payload.error.code : 502);
    const isQuotaLike = statusCode === 429;
    const error = new Error(
      isQuotaLike ? "Gemini quota or rate limit exceeded. Please retry later or check billing." : "Gemini request failed."
    );
    error.provider = "gemini";
    error.statusCode = statusCode;
    error.details = {
      provider: "gemini",
      status: statusCode,
      code: isQuotaLike ? "rate_limit_exceeded" : (payload && payload.error ? payload.error.status : null),
      ...(isQuotaLike ? {} : { providerMessage }),
    };
    throw error;
  }

  const rawResponseText = await response.text();
  const payload = parseGeminiApiResponse(rawResponseText);
  const rawStructuredText = getGeminiText(payload);

  return {
    provider: "gemini",
    model: defaultGeminiModel,
    tokensUsed: payload.usageMetadata && payload.usageMetadata.totalTokenCount ? payload.usageMetadata.totalTokenCount : 0,
    output: parseGeminiStructuredOutput(rawStructuredText),
  };
}

module.exports = {
  summarizeMeetingWithGemini,
};
