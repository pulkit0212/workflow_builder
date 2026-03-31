import { GoogleGenerativeAI } from "@google/generative-ai";

export type MeetingInsights = {
  speakers: Array<{
    name: string;
    talkTimePercent: number;
    wordCount: number;
    sentiment: string;
  }>;
  sentiment: {
    overall: string;
    score: number;
    timeline: Array<{
      segment: number;
      label: string;
      score: number;
    }>;
  };
  topics: Array<{
    title: string;
    duration: number;
    summary: string;
  }>;
  wordCloud: Array<{
    word: string;
    count: number;
  }>;
  engagementScore: number;
  totalWords: number;
  avgWordsPerMinute: number;
  keyMoments: Array<{
    time: string;
    description: string;
  }>;
};

export type MeetingChapter = {
  title: string;
  startMinute: number;
  endMinute: number;
  summary: string;
};

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

export async function generateInsights(transcript: string, meetingDuration: number): Promise<MeetingInsights> {
  if (!transcript || transcript.length < 50) {
    return getEmptyInsights();
  }

  const client = getClient();
  if (!client) {
    return getEmptyInsights();
  }

  const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a meeting analytics expert.
Analyze this meeting transcript and extract detailed insights.

Meeting duration: ${Math.round(meetingDuration / 60)} minutes
Transcript:
${transcript.substring(0, 12000)}

Return ONLY valid JSON, no markdown, no backticks:
{
  "speakers": [
    {
      "name": "Speaker name or 'Unknown Speaker 1'",
      "talkTimePercent": 45,
      "wordCount": 350,
      "sentiment": "positive"
    }
  ],
  "sentiment": {
    "overall": "positive",
    "score": 75,
    "timeline": [
      { "segment": 1, "label": "positive", "score": 80 },
      { "segment": 2, "label": "neutral", "score": 60 }
    ]
  },
  "topics": [
    {
      "title": "Topic name",
      "duration": 5,
      "summary": "Brief description"
    }
  ],
  "wordCloud": [
    { "word": "project", "count": 12 },
    { "word": "deadline", "count": 8 }
  ],
  "engagementScore": 82,
  "totalWords": 850,
  "avgWordsPerMinute": 120,
  "keyMoments": [
    { "time": "2:30", "description": "Important decision made" }
  ]
}

Rules:
- speakers: list all distinct speakers found
- If no speaker names: use "Speaker 1", "Speaker 2"
- talkTimePercent must sum to 100
- sentiment overall: positive/neutral/negative/mixed
- engagementScore: 0-100
- wordCloud: top 15 meaningful words
- topics: 3-6 main topics discussed
- keyMoments: important decisions or turning points`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned) as MeetingInsights;
  } catch (error) {
    console.error("[Insights] Generation failed:", error instanceof Error ? error.message : error);
    return getEmptyInsights();
  }
}

export async function generateChapters(transcript: string, meetingDuration: number): Promise<MeetingChapter[]> {
  if (!transcript || transcript.length < 100) {
    return [];
  }

  const client = getClient();
  if (!client) {
    return [];
  }

  const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `Split this meeting transcript into logical chapters/sections.

Meeting duration: ${Math.round(meetingDuration / 60)} minutes
Transcript:
${transcript.substring(0, 10000)}

Return ONLY valid JSON array, no markdown:
[
  {
    "title": "Chapter title",
    "startMinute": 0,
    "endMinute": 5,
    "summary": "Brief summary of this section"
  }
]

Rules:
- 3-8 chapters total
- Each chapter = a distinct topic or phase
- startMinute/endMinute are approximate
- Summary max 15 words`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned) as MeetingChapter[];
  } catch (error) {
    console.error("[Chapters] Generation failed:", error instanceof Error ? error.message : error);
    return [];
  }
}

function getEmptyInsights(): MeetingInsights {
  return {
    speakers: [],
    sentiment: { overall: "neutral", score: 50, timeline: [] },
    topics: [],
    wordCloud: [],
    engagementScore: 0,
    totalWords: 0,
    avgWordsPerMinute: 0,
    keyMoments: []
  };
}
