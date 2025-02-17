import BaseConnector, {ChatCompletionResult, ChatMessage, ChatMessageRoles, GenerationOptions, RequestOptions} from "./BaseConnector";

export default class AnthropicConnector extends BaseConnector {
    async requestChatCompletion(messages: ChatMessage[], generationOptions: GenerationOptions, requestOptions: RequestOptions): Promise<ChatCompletionResult> {
        requestOptions.updatesEmitter?.sendUpdate("Formatting messages for Claude...")
        const sytemInstruction = messages.find(m => m.role === ChatMessageRoles.SYSTEM)?.content;
        requestOptions.updatesEmitter?.sendUpdate("Requesting completion from Claude...")
        const req = await fetch(this.connectionOptions.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env[this.connectionOptions.apiKey]!,
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
                messages: await this.formatMessages(messages),
                system: sytemInstruction,
                ...generationOptions
            })
        })

        const data = await req.json();
        
        if(!data || !data.content?.length) {
            throw new Error("Failed to get response from Anthropic API", {cause: data});
        }

        return {
            resultMessage: {
                role: ChatMessageRoles.ASSISTANT,
                content: data.content[0].text
            }
        };
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
}

export const ClaudeAllowedMediaTypes = Object.freeze({
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
        }
    )[]
}
