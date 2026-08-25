export type LlmToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type LlmMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  toolCallId?: string;
  toolCalls?: LlmToolCall[];
};

export type LlmResponse = {
  content: string | null;
  toolCalls: LlmToolCall[];
};

export type LlmTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

type SdkMessage = {
  role: string;
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

function toSdk(messages: LlmMessage[]): SdkMessage[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        tool_call_id: message.toolCallId ?? "",
        content: message.content ?? "",
      };
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

export async function completeChat(messages: LlmMessage[], tools: LlmTool[]): Promise<LlmResponse> {
  const { default: OpenAI, APIConnectionTimeoutError, APIError } = await import("openai");
  const { llmUnavailable } = await import("../errors.js");

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw llmUnavailable();

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
    timeout: 30_000,
    maxRetries: 0,
  });

  try {
    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      temperature: 0.3,
      messages: toSdk(messages) as never,
      tools: tools.length ? (tools as never) : undefined,
    });
    const choice = completion.choices[0]?.message;
    if (!choice) throw llmUnavailable();
    const toolCalls: LlmToolCall[] = [];
    for (const call of choice.tool_calls ?? []) {
      if (call.type === "function" && "function" in call) {
        toolCalls.push({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        });
      }
    }
    return { content: choice.content ?? null, toolCalls };
  } catch (err) {
    if (err instanceof APIConnectionTimeoutError) throw llmUnavailable();
    if (err instanceof APIError && (err.status === undefined || err.status >= 500 || err.status === 429)) {
      throw llmUnavailable();
    }
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "llm_unavailable") {
      throw err;
    }
    throw llmUnavailable();
  }
}
