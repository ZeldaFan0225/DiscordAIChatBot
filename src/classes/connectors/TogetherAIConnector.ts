import BaseConnector, {ChatCompletionResult, ChatMessage, GenerationOptions} from "./BaseConnector";

export default class TogetherAIConnector extends BaseConnector {
    override async requestChatCompletion(messages: ChatMessage[], generationOptions: GenerationOptions): Promise<ChatCompletionResult> {
        // convert message format to openai format
        const openAiMessages = messages
            .map(m => this.convertToOpenAiMessage(m))
            .filter(m => m !== null) as TogetherAIChatMessage[];

        const response = await this.sendRequest({
            ...generationOptions,
            messages: openAiMessages
        })

        const result = response.choices[0]?.message;
        if(!result) throw new Error("Failed to get response from OpenAI", {cause: response});

        return {
            resultMessage: result
        };
    }

    private async sendRequest(payload: TogetherAIPayload): Promise<TogetherAIResponse> {
        const result = await fetch(this.connectionOptions.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env[this.connectionOptions.apiKey]}`
            },
            body: JSON.stringify(payload)
        })

        const response = await result.json();

        if(response.error) throw new Error("TogetherAI Error", {cause: response});

        return response as TogetherAIResponse;
    }

    private convertToOpenAiMessage(message: ChatMessage): TogetherAIChatMessage | null {
        // IDE is crying but typescript isn't, idfk what is wrong with it
        // @ts-ignore
        const openAiMessage: OpenAiChatMessage = {
            content: message.content,
            role: message.role,
            name: message.name
        }
        return openAiMessage;
    }
}

interface TogetherAIPayload {
    messages: TogetherAIChatMessage[];
    model: string;
    frequency_penalty?: number;
    logit_bias?: Record<string, number>;
    max_tokens?: number;
    presence_penalty?: number;
    response_format?:  {type: "text" | "json_object", schema: Record<any, any>};
    stop?: string | string[];
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repetition_penalty?: number;
    min_p?: number;
    safety_model?: string;
}

interface TogetherAIResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    system_fingerprint: string;
    choices: {
        message: TogetherAIBotMessage;
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    }
}

type TogetherAIChatMessage = TogetherAIUserMessage | TogetherAIBotMessage | TogetherAISystemMessage

interface TogetherAiBaseMessage {
    role: string;
}

interface TogetherAIUserMessage extends TogetherAiBaseMessage {
    role: "user";
    content: string;
}

interface TogetherAIBotMessage extends TogetherAiBaseMessage {
    role: "assistant";
    content: string;
}

interface TogetherAISystemMessage extends TogetherAiBaseMessage {
    role: "system";
    content: string;
}