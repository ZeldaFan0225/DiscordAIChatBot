import BaseConnector, { ChatCompletionResult, ChatMessage, GenerationOptions, RequestOptions } from "./BaseConnector";
import { ToolDefinition } from "../tools/BaseTool";

export default class ToolsGoogleConnector extends BaseConnector {
    private collectedAttachments: any[] = [];

    override async requestChatCompletion(messages: ChatMessage[], generationOptions: GenerationOptions, requestOptions: RequestOptions): Promise<ChatCompletionResult> {
        requestOptions.updatesEmitter?.sendUpdate("Formatting messages for Google AI...")
        this.collectedAttachments = []; // Reset attachments for new request
        const googleAIMessages = await this.formatMessages(messages);
        const systemInstruction = messages.find(m => m.role === "system")?.content;

        const response = await this.executeToolCall(googleAIMessages, systemInstruction, generationOptions, requestOptions);

        return {
            resultMessage: {
                role: "assistant",
                content: response.content,
                attachments: this.collectedAttachments
            }
        };
    }

    private async executeToolCall(messages: GoogleAIMessage[], systemInstruction: string | undefined, generationOptions: GenerationOptions, requestOptions: RequestOptions, depth = 5): Promise<{ content: string }> {
        requestOptions.updatesEmitter?.sendUpdate("Requesting completion from Google AI...")
        const response = await this.sendRequest(messages, {
            ...generationOptions,
            system_instruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
            tools: depth === 0 ? undefined : this.availableTools.map(tool => ({
                function_declarations: [tool.toGoogleToolDefinition()]
            }))
        });

        if (!response.candidates || response.candidates.length === 0) {
            throw new Error("Failed to get response from Google AI", { cause: response });
        }

        const result = response.candidates[0]?.content;
        if (!result) {
            throw new Error("Failed to get response from Google AI", { cause: response });
        }

        // Extract text content and function calls
        const textContent = result.parts
            .filter((part): part is Required<Pick<GoogleAIMessagePart, "text">> => 
                typeof part.text === "string"
            )
            .map(part => part.text)
            .join("");

        const functionCalls = result.parts
            .filter((part): part is Required<Pick<GoogleAIMessagePart, "functionCall">> => 
                part.functionCall !== undefined && depth > 0
            )
            .map(part => part.functionCall);

        // If no function calls or reached max depth, return the text content
        if (!functionCalls.length || depth === 0) {
            return { content: textContent };
        }

        // Add assistant's message with complete response
        messages.push({
            role: "model",
            parts: result.parts
        });

        // Process function calls and collect responses
        const functionResponseParts: GoogleAIMessagePart[] = [];
        for (const functionCall of functionCalls) {
            const tool = this.availableTools.find(t => t.name === functionCall.name);
            if (tool) {
                requestOptions.updatesEmitter?.sendUpdate(`Executing tool: ${tool.name}...`);
                try {
                    const toolResponse = await tool.handleToolCall(functionCall.args);
                    if (toolResponse.attachments) {
                        this.collectedAttachments.push(...toolResponse.attachments);
                    }
                    functionResponseParts.push({
                        functionResponse: {
                            name: tool.name,
                            response: { 
                                result: toolResponse.result,
                                status: "success"
                            }
                        }
                    });
                } catch (error) {
                    functionResponseParts.push({
                        functionResponse: {
                            name: tool.name,
                            response: {
                                error: error instanceof Error ? error.message : String(error),
                                status: "error"
                            }
                        }
                    });
                }
            }
        }

        // Add function responses to message history
        messages.push({
            role: "user",
            parts: functionResponseParts
        });

        // Continue the conversation with function responses
        return this.executeToolCall(messages, systemInstruction, generationOptions, requestOptions, depth - 1);
    }

    private async sendRequest(messages: GoogleAIMessage[], options: GoogleAIRequestOptions): Promise<GoogleAIResponse> {
        const apiKey = process.env[this.connectionOptions.apiKey];
        if (!apiKey) {
            throw new Error("Google API key not found in environment variables");
        }

        const url = `${this.connectionOptions.url}/models/${options.model}:generateContent?key=${apiKey}`;
        const result = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contents: messages,
                ...options,
            }),
        });

        const response = await result.json();
        if (response.error) {
            throw new Error("Google AI Error", { cause: response });
        }

        return response as GoogleAIResponse;
    }

    private async formatMessages(messages: ChatMessage[]) {
        let result: GoogleAIMessage[] = [];
        for (const message of messages) {
            if(message.role === "system") continue;
            result.push({
                role: message.role === "assistant" ? "model" : "user",
                parts: [
                    { text: message.content },
                    ...(message.attachments ? await this.formatAttachments(message.attachments) : [])
                ]
            });
        }
        return result;
    }

    /**
     * Format input attachments to Google AI format
     * @param attachments 
     * @returns 
     */
    private async formatAttachments(attachments: string[]) {
        let result: GoogleAIMessagePart[] = [];
        for (const attachment of attachments) {
            const mediaUrl = await this.getBase64FromUrl(attachment)
            const [type, data] = mediaUrl.substring(5).split(";base64,") as [string, string]
            result.push({
                inline_data: {
                    mime_type: type,
                    data: data
                }
            });
        }

        return result
    }

    /**
     * Get base64 data from URL
     * @param url The source URL
     * @returns 
     */
    private async getBase64FromUrl(url: string): Promise<string> {
        const response = await fetch(url);
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const buffer = Buffer.from(await response.arrayBuffer());
        return `data:${contentType};base64,${buffer.toString('base64')}`;
    }
}

interface GoogleAIMessage {
    role?: string;
    parts: GoogleAIMessagePart[];
}

interface GoogleAIMessagePart {
    text?: string;
    inline_data?: {
        mime_type: string;
        data: string;
    };
    functionCall?: {
        name: string;
        args: Record<string, any>;
    };
    functionResponse?: {
        name: string;
        response: {
            result?: any;
            error?: string;
            status: "success" | "error";
        };
    };
}

interface GoogleAIResponse {
    candidates?: {
        content: {
            parts: GoogleAIMessagePart[];
        };
    }[];
    error?: any;
}

interface GoogleAIRequestOptions extends GenerationOptions {
    system_instruction?: {
        parts: GoogleAIMessagePart[];
    };
    tools?: {
        function_declarations: ToolDefinition[];
    }[];
}
