type GeminiContentPart = {
  text: string;
} | {
  inlineData: {
    mimeType: string;
    data: string;
  };
};

type GeminiGenerateContentParams = {
  prompt: string;
  model?: string;
  parts?: GeminiContentPart[];
};

type GeminiCandidatePayload = {
  content?: {
    parts?: Array<{
      text?: string;
    }>;
  };
};

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  return apiKey;
}

function stripMarkdownCodeFence(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function extractText(payload: { candidates?: GeminiCandidatePayload[] }) {
  return (payload.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

async function generateGeminiRawResponse({ prompt, model = "gemini-2.5-flash", parts }: GeminiGenerateContentParams) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": getGeminiApiKey()
    },
    body: JSON.stringify({
      contents: [
        {
          parts:
            parts && parts.length > 0
              ? [
                  {
                    text: prompt
                  },
                  ...parts
                ]
              : [
                  {
                    text: prompt
                  }
                ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    let payload: unknown = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const error = new Error("Gemini request failed.");
    (error as Error & { statusCode?: number; details?: unknown }).statusCode = response.status || 502;
    (error as Error & { statusCode?: number; details?: unknown }).details = payload;
    throw error;
  }

  return response.json() as Promise<{ candidates?: GeminiCandidatePayload[] }>;
}

export async function generateGeminiJson<T>(params: GeminiGenerateContentParams): Promise<T> {
  const payload = await generateGeminiRawResponse(params);
  const rawText = extractText(payload);

  if (!rawText) {
    throw new Error("Gemini returned an empty response.");
  }

  const normalized = stripMarkdownCodeFence(rawText);

  try {
    return JSON.parse(normalized) as T;
  } catch {
    const error = new Error("Gemini returned invalid JSON.");
    (error as Error & { statusCode?: number; details?: unknown }).statusCode = 502;
    (error as Error & { statusCode?: number; details?: unknown }).details = {
      rawPreview: normalized.slice(0, 500)
    };
    throw error;
  }
}

export async function generateGeminiText(params: GeminiGenerateContentParams) {
  const payload = await generateGeminiRawResponse(params);
  const rawText = extractText(payload);

  if (!rawText) {
    throw new Error("Gemini returned an empty response.");
  }

  return rawText;
}

export function toBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString("base64");
}
