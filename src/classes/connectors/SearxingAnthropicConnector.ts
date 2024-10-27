import BaseConnector, {ChatCompletionResult, ChatMessage, ChatMessageRoles, GenerationOptions} from "./BaseConnector";

export default class AnthropicConnector extends BaseConnector {
    override async requestChatCompletion(messages: ChatMessage[], generationOptions: GenerationOptions): Promise<ChatCompletionResult> {
        // convert message format to openai format
        const anthropicMessages = await this.formatMessages(messages);

        const response = await this.executeToolCall(anthropicMessages, generationOptions)

        return {
            resultMessage: response
        };
    }

    private async executeToolCall(messages: ClaudeMessage[], generationOptions: GenerationOptions, depth = 5): Promise<ChatMessage> {
        const response = await this.sendRequest({
            max_tokens: 4096,
            ...generationOptions,
            messages,
            tool_choice: {type: "auto"},
            tools: depth > 0 ? [{
                description: "Get up to date information directly from the internet.",
                name: "internet",
                input_schema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The query to search for"
                        }
                    },
                    required: ["query"]
                }
            }] : []
        })

        const toolCalls = response.content.filter(c => c.type === "tool_use").filter(c => c.name === "internet")
        if(!toolCalls?.length) return {
            role: ChatMessageRoles.ASSISTANT,
            content: response.content.filter(c => c.type === "text").map(c => (c as any).text).join(" ")
        }

        messages.push({
            role: ChatMessageRoles.ASSISTANT,
            content: response.content
        })

        const toolContent: ClaudeMessage["content"] = []

        for(const toolCall of toolCalls) {
            const searxingResponse = await this.requestInternet(toolCall.input["query"])

            toolContent.push({
                type: "tool_result",
                tool_use_id: toolCall.id,
                content: JSON.stringify(searxingResponse),
            })
        }

        messages.push({
            role: ChatMessageRoles.USER,
            content: toolContent
        })

        return this.executeToolCall(messages, generationOptions,  depth - 1)
    }

    private async sendRequest(payload: AnthropicPayload): Promise<AnthropicResponse> {
        const result = await fetch(this.connectionOptions.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env[this.connectionOptions.apiKey]!,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify(payload)
        })

        const response = await result.json();

        if(response.error) throw new Error("Anthropic Error", {cause: response});

        return response as AnthropicResponse;
    }

    private async formatMessages(messages: ChatMessage[]): Promise<ClaudeMessage[]> {
        const result: ClaudeMessage[] = [];
        for(const message of messages) {
            if(message.role === ChatMessageRoles.USER || message.role === ChatMessageRoles.ASSISTANT) {
                const content: ClaudeMessage["content"] = []
                content.push({
                    type: "text" as "text",
                    text: message.content
                })
                for(const attachment of message.attachments || []) {
                    const mediaUrl = await this.getBase64FromUrl(attachment)
                    const [type, data] = mediaUrl.substring(5).split(";base64,") as [string, string]
                    if(!Object.values(ClaudeAllowedMediaTypes).includes(type as any)) {
                        throw new Error("Invalid media type")
                    }
                    content.push({
                        type: "image" as "image",
                        source: {
                            type: "base64" as "base64",
                            media_type: type as typeof ClaudeAllowedMediaTypes[keyof typeof ClaudeAllowedMediaTypes],
                            data: data
                        }
                    })
                }
                result.push({
                    role: message.role,
                    content: content
                })
            }
        }
        return result;
    }

    private getBase64FromUrl(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            fetch(url)
                .then(async res => {
                    const base64 = Buffer.from(await res.arrayBuffer()).toString('base64');
                    resolve(`data:${res.headers.get('content-type')};base64,${base64}`);
                })
                .catch(reject)
        })
    }

    private async requestInternet(prompt: string): Promise<{title: string, url: string, content: string}[]> {
        const searchParams = new URLSearchParams({q: prompt, format: "json"});
        const data = await fetch(`${process.env["SEARXING_ORIGIN"]}/search?${searchParams.toString()}`)
            .then(res => res.json())

        return data.results.slice(0, 5).map((result: any) => ({
            title: result.title,
            url: result.url,
            content: result.content
        }))
    }
}

const ClaudeAllowedMediaTypes = Object.freeze({
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "GIF": "image/gif",
    "WEBP": "image/webp"
} as const)

interface ClaudeMessage {
    role: typeof ChatMessageRoles[keyof typeof ChatMessageRoles];
    content: string | (
        {
            type: "text",
            text: string
        } | {
            type: "image",
            source: {
                type: "base64",
                media_type: typeof ClaudeAllowedMediaTypes[keyof typeof ClaudeAllowedMediaTypes];
                data: string
            }
        } | {
            type: "tool_use",
            id: string,
            name: string,
            input: Record<string, any>,
        } | {
            type: "tool_result",
            tool_use_id: string,
            is_error?: boolean,
            content?: string
        }
    )[]
}

interface AnthropicPayload {
    model: string,
    messages: ClaudeMessage[],
    max_tokens: number,
    metadata?: {
        user_id: string | null
    },
    stop_sequences?: string[],
    system?: string,
    temperature?: number,
    tool_choice?: {
        type: "auto" | "any",
        disable_parallel_tool_use?: boolean
    } | {
        type: "tool",
        name: string,
        disable_parallel_tool_use?: boolean
    },
    tools?: {
        type?: "custom",
        name: string,
        description?: string,
        input_schema: {
            type: "object",
            properties: Record<string, any> | null,
            required?: string[]
        },
        cache_control?: {
            ephemeral: boolean
        }
    }[],
    top_k?: number,
    top_p?: number
}

interface AnthropicResponse {
    id: string,
    type: "message",
    role: "assistant",
    content: ({
        type: "text",
        text: string
    } | {
        type: "tool_use",
        id: string,
        name: string,
        input: Record<string, any>,
    })[],
    model: string,
    stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null,
    stop_sequence: string | null,
    usage: {
        input_tokens: number,
        cache_creation_input_tokens: number | null,
        cache_read_input_tokens: number | null,
        output_tokens: number,
    }
}