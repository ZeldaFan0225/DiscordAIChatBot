import BaseConnector, { ChatCompletionResult, ChatMessage, ChatMessageRoles, GenerationOptions, RequestOptions } from "./BaseConnector";

export default class ToolsAnthropicConnector extends BaseConnector {
    async requestChatCompletion(messages: ChatMessage[], generationOptions: GenerationOptions, requestOptions: RequestOptions): Promise<ChatCompletionResult> {
        requestOptions.updatesEmitter?.sendUpdate("Formatting messages for Claude...")
        const systemInstruction = messages.find(m => m.role === ChatMessageRoles.SYSTEM)?.content;

        const response = await this.executeToolCall(await this.formatMessages(messages), systemInstruction, generationOptions, requestOptions);

        return {
            resultMessage: {
                role: ChatMessageRoles.ASSISTANT,
                content: response.content
            }
        };
    }

    private async executeToolCall(messages: ClaudeMessage[], systemInstruction: string | undefined, generationOptions: GenerationOptions, requestOptions: RequestOptions, depth = 5): Promise<{ content: string }> {
        requestOptions.updatesEmitter?.sendUpdate("Requesting completion from Claude...");
        const response = await fetch(this.connectionOptions.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env[this.connectionOptions.apiKey]!,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
                messages,
                system: systemInstruction,
                ...generationOptions,
                tools: depth === 0 ? undefined : this.availableTools.map(tool => tool.toAnthropicToolDefinition())
            })
        });

        const data = await response.json();
        
        if (!data || !data.content?.length) {
            throw new Error("Failed to get response from Anthropic API", { cause: data });
        }

        let responseContent = "";
        let hasToolCalls = false;

        // Process each content item
        for (const item of data.content) {
            if (item.type === "text") {
                responseContent += item.text;
            } else if (item.type === "tool_use" && depth > 0) {
                hasToolCalls = true;
                const tool = this.availableTools.find(t => t.name === item.name);
                if (tool) {
                    requestOptions.updatesEmitter?.sendUpdate(`Executing tool: ${tool.name}...`);
                    const toolResponse = await tool.handleToolCall(item.input);
                    responseContent += `\n\nTool Result (${tool.name}):\n${JSON.stringify(toolResponse)}`;
                }
            }
        }

        if (!hasToolCalls || depth === 0) {
            return { content: responseContent };
        }

        messages.push({
            role: "assistant",
            content: [{ type: "text", text: responseContent }]
        });

        return this.executeToolCall(messages, systemInstruction, generationOptions, requestOptions, depth - 1);
    }

    private async formatMessages(messages: ChatMessage[]): Promise<ClaudeMessage[]> {
        const result: ClaudeMessage[] = [];
        for (const message of messages) {
            if (message.role === ChatMessageRoles.USER || message.role === ChatMessageRoles.ASSISTANT) {
                const content: ClaudeMessage["content"] = [];
                content.push({
                    type: "text",
                    text: message.content
                });

                if (message.attachments?.length) {
                    for (const attachment of message.attachments) {
                        const mediaUrl = await this.getBase64FromUrl(attachment);
                        const [type, data] = mediaUrl.substring(5).split(";base64,") as [string, string];
                        if (!Object.values(ClaudeAllowedMediaTypes).includes(type as any)) {
                            throw new Error("Invalid media type");
                        }
                        content.push({
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: type as typeof ClaudeAllowedMediaTypes[keyof typeof ClaudeAllowedMediaTypes],
                                data: data
                            }
                        });
                    }
                }

                result.push({
                    role: message.role,
                    content: content
                });
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
                .catch(reject);
        });
    }
}

export const ClaudeAllowedMediaTypes = Object.freeze({
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "GIF": "image/gif",
    "WEBP": "image/webp"
} as const);

interface ClaudeMessage {
    role: typeof ChatMessageRoles[keyof typeof ChatMessageRoles];
    content: (
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
            name: string,
            input: Record<string, any>
        }
    )[]
}
