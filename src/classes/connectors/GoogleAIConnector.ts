// classes/connector/GoogleAIConnector.ts

import BaseConnector, { ChatCompletionResult, ChatMessage, GenerationOptions } from "./BaseConnector";

export default class GoogleAIConnector extends BaseConnector {
    override async requestChatCompletion(messages: ChatMessage[], generationOptions: GenerationOptions): Promise<ChatCompletionResult> {
        const googleAIMessages = await this.formatMessages(messages);
        const response = await this.sendRequest(googleAIMessages, generationOptions);

        if (!response.candidates || response.candidates.length === 0) {
            throw new Error("Failed to get response from Google AI", { cause: response });
        }

        const result = response.candidates[0]?.content;
        if (!result) {
            throw new Error("Failed to get response from Google AI", { cause: response });
        }
        if(!result.parts[0]?.text) {
            throw new Error("Failed to get response from Google AI", { cause: response });
        }
        return {
            resultMessage: {
                role: "assistant",
                content: result.parts[0].text
            }
        };
    }

    private async sendRequest(messages: GoogleAIMessage[], generationOptions: GenerationOptions): Promise<GoogleAIResponse> {
        const apiKey = process.env[this.connectionOptions.apiKey];
        if (!apiKey) {
            throw new Error("Google API key not found in environment variables");
        }

        const url = `${this.connectionOptions.url}/models/${generationOptions.model}:generateContent?key=${apiKey}`;
        const result = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contents: messages,
                ...generationOptions,
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

    
    private getBase64FromUrl(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            fetch(url)
                .then(res => res.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.readAsDataURL(blob);
                    reader.onloadend = () => {
                        resolve(reader.result as string);
                    }
                })
                .catch(reject)
        })
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
}

interface GoogleAIResponse {
    candidates?: {
        content: {
            parts: {
                text: string;
            }[];
        };
    }[];
    error?: any;
}