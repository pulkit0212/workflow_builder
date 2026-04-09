import { auth } from "@clerk/nextjs/server";
import { apiError, apiSuccess } from "@/lib/api-responses";
import { transcriptionProviderSchema } from "@/features/tools/meeting-summarizer/schema";
import { transcribeAudio } from "@/lib/ai/transcription";
import { ToolExecutionError } from "@/lib/ai/tool-execution-error";

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return apiError("Unauthorized.", 401);
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return apiError("Audio upload must be sent as form data.", 400);
  }

  const providerInput = formData.get("provider");
  const parsedProvider = transcriptionProviderSchema.safeParse(providerInput);

  if (!parsedProvider.success) {
    return apiError("Invalid transcription provider.", 400, parsedProvider.error.flatten());
  }

  const audio = formData.get("audio");

  if (!(audio instanceof File) || audio.size === 0) {
    return apiError("An audio recording is required.", 400);
  }

  try {
    const result = await transcribeAudio({
      provider: parsedProvider.data,
      fileName: audio.name,
      mimeType: audio.type,
      size: audio.size,
      fileBuffer: await audio.arrayBuffer()
    });

    return apiSuccess({
      success: true,
      transcript: result.transcript,
      provider: result.provider,
      transcriptionProvider: result.provider,
      metadata: "metadata" in result ? result.metadata ?? null : null
    });
  } catch (error) {
    if (error instanceof ToolExecutionError) {
      return apiError(error.message, error.statusCode, error.details);
    }

    return apiError(
      error instanceof Error ? error.message : "Failed to generate transcript.",
      500
    );
  }
}
