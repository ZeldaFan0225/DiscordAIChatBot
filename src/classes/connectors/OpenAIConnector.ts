import BaseConnector, {ChatCompletionResult, ChatMessage, ChatMessageRoles, GenerationOptions, RequestOptions} from "./BaseConnector";

export default class OpenAIConnector extends BaseConnector {
    override async requestChatCompletion(messages: ChatMessage[], generationOptions: GenerationOptions, requestChatCompletion: RequestOptions): Promise<ChatCompletionResult> {
        // convert message format to openai format
        const openAiMessages = messages
            .map(m => this.convertToOpenAiMessage(m))
            .filter(m => m !== null) as OpenAiChatMessage[];

        requestChatCompletion.updatesEmitter?.sendUpdate("Checking message moderation...")
        const validated = await this.passesModeration(openAiMessages)

        if(!validated) throw new Error("Message did not pass moderation")

        requestChatCompletion.updatesEmitter?.sendUpdate("Requesting completion from OpenAI...")

        const response = await this.sendRequest({
            user: requestChatCompletion.userId,
            ...generationOptions,
            messages: openAiMessages
        })

        const result = response.choices[0]?.message;
        if(!result) throw new Error("Failed to get response from OpenAI", {cause: response});

        if(result.audio) {
            if(!result.content) result.content = result.audio.transcript;
        }

        return {
            resultMessage: {
                ...result,
                audio_data_string: result.audio?.data ? `data:audio/${generationOptions["audio"]?.["format"]};base64,${result.audio.data}` : undefined
            }
        };
    }

    protected async passesModeration(messages: OpenAiChatMessage[]): Promise<boolean> {
        const latestMessage = messages.at(-1)
        if(latestMessage?.role !== "user") return true;

        if(!this.connectionOptions.url.startsWith("https://api.openai.com/")) return true;

        const content = typeof latestMessage.content === "string" ?
            latestMessage.content :
            latestMessage.content.filter(c => c.type === "text").map(c => (c as any).text).join(" ");

        const openai_req = await fetch(`https://api.openai.com/v1/moderations`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env[this.connectionOptions.apiKey]}`
            },
            body: JSON.stringify({
                input: content
            })
        })

        const data: OpenAIModerationResponse = await openai_req.json()
        return !data?.results?.[0]?.flagged
    }

    protected async sendRequest(payload: OpenAiCompatiblePayload): Promise<OpenAiCompatibleResponse> {
        const result = await fetch(this.connectionOptions.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env[this.connectionOptions.apiKey]}`
            },
            body: JSON.stringify(payload)
        })

        const response = await result.json();

        if(response.error) throw new Error("OpenAI Error", {cause: response});

        return response as OpenAiCompatibleResponse;
    }

    convertToOpenAiMessage(message: ChatMessage): OpenAiChatMessage | null {
        const openAiMessage: OpenAiChatMessage = {
            content: message.content,
            role: message.role,
            name: message.name
        }
        if(message.role === ChatMessageRoles.USER) {
            if(message.attachments) {
                const imageUrls: {type: "image_url", image_url: {url: string}}[] = message.attachments.map(url => ({
                    type: "image_url" as const,
                    image_url: {
                        url
                    }
                }))

                openAiMessage.content = [...imageUrls, {type: "text" as const, text: message.content}]
            }
        }
        return openAiMessage;
    }
}

interface OpenAIModerationResponse {
    id: string,
    model: string,
    results: {
        categories: Record<string, boolean>,
        category_scores: Record<string, boolean>,
        flagged: boolean
    }[]
}

interface OpenAiCompatiblePayload {
    messages: OpenAiChatMessage[];
    model: string;
    reasoning_effort?: "low" | "medium" | "high";
    frequency_penalty?: number;
    logit_bias?: Record<string, number>;
    /** @deprecated */
    max_tokens?: number;
    max_completion_tokens?: number;
    presence_penalty?: number;
    response_format?:  {type: "text" | "json_object"};
    seed?: number;
    stop?: string | string[];
    temperature?: number;
    top_p?: number;
    user?: string;
    tools?: {
        type: "function";
        function: {
            description: string;
            name: string;
            parameters: Record<string, any>;
        };
    }[];
    tool_choice?: "auto" | "none" | string;
}

interface OpenAiCompatibleResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    system_fingerprint: string;
    choices: {
        index: number;
        message: OpenAiBotMessage;
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    }
}

export type OpenAiChatMessage = OpenAiUserMessage | OpenAiBotMessage | OpenAiSystemMessage | OpenAiToolMessage

interface OpenAiToolMessage extends OpenAiBaseMessage {
    role: "tool";
    content: string;
    tool_call_id: string;
}

interface OpenAiBaseMessage {
    role: string;
    name?: string;
}

interface OpenAiUserMessage extends OpenAiBaseMessage {
    role: "user";
    content: string | ({
        type: "text", text: string
    } | {
        type: "image_url", image_url: {url: string, detail?: "auto" | "low" | "high"}
    })[]
}

export interface OpenAiBotMessage extends OpenAiBaseMessage {
    role: "assistant";
    content: string;
    audio?: {
        expires_at: number;
        transcript: string;
        data: string;
        id: string;
    };
    tool_calls?: {
        id: string;
        type: "function";
        function: {
            name: string;
            arguments: string;
        };
    }[];
}

interface OpenAiSystemMessage extends OpenAiBaseMessage {
    role: "system" | "developer";
    content: string
}
