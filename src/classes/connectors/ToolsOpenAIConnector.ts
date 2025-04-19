import BaseConnector, {ChatCompletionResult, ChatMessage, ConnectionOptions, GenerationOptions, RequestOptions} from "./BaseConnector";

export default class ToolsOpenAIConnector extends BaseConnector {
    private collectedAttachments: any[] = [];

    constructor(options: ConnectionOptions) {
        super(options);
    }

    override async requestChatCompletion(messages: ChatMessage[], generationOptions: GenerationOptions, requestOptions: RequestOptions): Promise<ChatCompletionResult> {
        // Reset attachments for new request
        this.collectedAttachments = [];

        // convert message format to openai format
        const openAiMessages = messages
            .map(m => this.convertToOpenAiMessage(m))
            .filter(m => m !== null) as OpenAiChatMessage[];

        requestOptions.updatesEmitter?.sendUpdate("Checking message moderation...")
        const validated = await this.passesModeration(openAiMessages)

        if(!validated) throw new Error("Message did not pass moderation")

        requestOptions.updatesEmitter?.sendUpdate("Message passed moderation check")
        const response = await this.executeToolCall(openAiMessages, generationOptions, requestOptions)

        if (response.audio) {
            if (!response.content) {
                response.content = response.audio.transcript;
            }
        }

        return {
            resultMessage: {
                ...response,
                attachments: this.collectedAttachments,
                audio_data_string: response.audio?.data ? `data:audio/${generationOptions["audio"]?.["format"]};base64,${response.audio.data}` : undefined
            }
        };
    }

    private async executeToolCall(messages: OpenAiChatMessage[], generationOptions: GenerationOptions, requestOptions: RequestOptions, depth = 5): Promise<OpenAiBotMessage> {
        requestOptions.updatesEmitter?.sendUpdate("Requesting completion from OpenAI...")
        const response = await this.sendRequest({
            ...generationOptions,
            messages,
            tool_choice: depth === 0 ? "none" : "auto",
            tools: this.availableTools.map(tool => ({
                type: "function",
                function: tool.toOpenAiToolDefinition()
            }))
        })

        const toolCalls = response.choices[0]!.message.tool_calls
        if(!toolCalls?.length) return response.choices[0]!.message;

        messages.push(response.choices[0]!.message)

        requestOptions.updatesEmitter?.sendUpdate("Processing tool calls...")
        for(const toolCall of toolCalls) {
            const tool = this.availableTools.find(t => t.name === toolCall.function.name)
            if(!tool) continue;

            requestOptions.updatesEmitter?.sendUpdate(`Executing tool: ${tool.name}...`)
            const toolResponse = await tool.handleToolCall(JSON.parse(toolCall.function.arguments))

            if (toolResponse.attachments) {
                this.collectedAttachments.push(...toolResponse.attachments);
            }

            messages.push({
                role: "tool",
                content: JSON.stringify(toolResponse.result),
                tool_call_id: toolCall.id
            })
        }

        return this.executeToolCall(messages, generationOptions, requestOptions, depth - 1)
    }

    private async passesModeration(messages: OpenAiChatMessage[]): Promise<boolean> {
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

    private async sendRequest(payload: OpenAiCompatiblePayload): Promise<OpenAiCompatibleResponse> {
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

    private convertToOpenAiMessage(message: ChatMessage): OpenAiChatMessage | null {
        const openAiMessage: OpenAiChatMessage = {
            content: message.content,
            role: message.role,
            name: message.name
        }
        if(message.role === "user") {
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
    tool_choice?: "auto" | "none" | string;
    tools?: {
        type: "function",
        function: {
            description: string,
            name: string,
            parameters?: Record<string, any>
        }
    }[]
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

type OpenAiChatMessage = OpenAiUserMessage | OpenAiBotMessage | OpenAiSystemMessage | OpenAiToolMessage

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

interface OpenAiBotMessage extends OpenAiBaseMessage {
    role: "assistant";
    content: string;
    audio?: {
        expires_at: number;
        transcript: string;
        data: string;
        id: string;
    };
    tool_calls?: {
        id: string,
        type: "function",
        function: {
            name: string,
            arguments: string
        }
    }[],
}

interface OpenAiToolMessage extends OpenAiBaseMessage {
    role: "tool";
    content: string;
    tool_call_id: string;
}

interface OpenAiSystemMessage extends OpenAiBaseMessage {
    role: "system";
    content: string
}
