import BaseConnector, { ChatCompletionResult, ChatMessage, ChatMessageRoles, GenerationOptions, RequestOptions } from "./BaseConnector";
import { AnthropicToolDefinition } from "../tools/BaseTool";
import { MCPResourceHandler } from "../mcp/MCPResourceHandler";

export default class ToolsAnthropicConnector extends BaseConnector {
    private collectedAttachments: any[] = [];

    async requestChatCompletion(messages: ChatMessage[], generationOptions: GenerationOptions, requestOptions: RequestOptions): Promise<ChatCompletionResult> {
        requestOptions.updatesEmitter?.sendUpdate("Formatting messages for Claude...")
        const systemInstruction = messages.find(m => m.role === ChatMessageRoles.SYSTEM)?.content;

        this.collectedAttachments = []; // Reset attachments for new request
        const response = await this.executeToolCall(await this.formatMessages(messages), systemInstruction, generationOptions, requestOptions);

        // Resolve any MCP resource attachments
        const resolvedAttachments = this.collectedAttachments.length > 0 
            ? await MCPResourceHandler.resolveResourceAttachments(this.collectedAttachments)
            : [];

        return {
            resultMessage: {
                role: ChatMessageRoles.ASSISTANT,
                content: response.content,
                attachments: resolvedAttachments
            }
        };
    }

    private async executeToolCall(messages: ClaudeMessage[], systemInstruction: string | undefined, generationOptions: GenerationOptions, requestOptions: RequestOptions, depth = 5): Promise<{ content: string }> {
        requestOptions.updatesEmitter?.sendUpdate("Requesting completion from Claude...");
        const payload: AnthropicPayload = {
            messages,
            max_tokens: 4096,
            system: systemInstruction,
            ...generationOptions,
            tools: depth === 0 ? undefined : this.availableTools.map(tool => tool.toAnthropicToolDefinition())
        };

        const response = await fetch(this.connectionOptions.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env[this.connectionOptions.apiKey]!,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json() as AnthropicResponse;
        
        if (!data?.content?.length) {
            throw new Error("Failed to get response from Anthropic API", { cause: data });
        }

        const toolCalls = data.content.filter((item): item is Extract<AnthropicResponse["content"][number], { type: "tool_use" }> => 
            item.type === "tool_use" && depth > 0
        );
        const textContent = data.content
            .filter((item): item is Extract<AnthropicResponse["content"][number], { type: "text" }> => 
                item.type === "text"
            )
            .map(item => item.text)
            .join("");

        // If no tool calls or reached max depth, return the text content
        if (!toolCalls.length || depth === 0) {
            return { content: textContent };
        }

        // Add assistant's message with both text and tool calls
        messages.push({
            role: "assistant",
            content: data.content
        });

        // Process tool calls and collect results
        const toolResults: ClaudeMessage["content"] = [];
        for (const toolCall of toolCalls) {
            const tool = this.availableTools.find(t => t.name === toolCall.name);
            if (tool) {
                requestOptions.updatesEmitter?.sendUpdate(`Executing tool: ${tool.name}...`);
                try {
                    const toolResponse = await tool.handleToolCall(toolCall.input, requestOptions.userId);
                    if (toolResponse.attachments) {
                        this.collectedAttachments.push(...toolResponse.attachments);
                    }
                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: toolCall.id,
                        content: JSON.stringify(toolResponse.result)
                    });
                } catch (error) {
                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: toolCall.id,
                        is_error: true,
                        content: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        }

        // Add tool results to message history
        messages.push({
            role: "user",
            content: toolResults
        });

        // Continue the conversation with tool results
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

    /**
     * Converts a URL to a base64 string (user input to claude required format)
     * @param url The source URL
     * @returns 
     */
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
    tools?: AnthropicToolDefinition[],
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
