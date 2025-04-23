import BaseConnector, {
    ChatCompletionResult,
    ChatMessage,
    GenerationOptions,
    RequestOptions,
} from "./BaseConnector";

interface PerplexityChatCompletionResult extends ChatCompletionResult {
    images?: Array<{
        image_url: string;
        origin_url: string;
        height: number;
        width: number;
    }>;
    citations?: string[];
}

export default class PerplexityConnector extends BaseConnector {
    override async requestChatCompletion(
        messages: ChatMessage[],
        generationOptions: GenerationOptions,
        requestChatCompletion: RequestOptions
    ): Promise<PerplexityChatCompletionResult> {
        // Convert messages to Perplexity format
        const perplexityMessages = messages.map((m) => ({
            role: m.role,
            content: m.content,
        }));

        requestChatCompletion.updatesEmitter?.sendUpdate(
            "Requesting completion from Perplexity..."
        );

        const response = await this.sendRequest({
            ...generationOptions,
            messages: perplexityMessages,
            stream: false
        });

        // Perplexity returns the result in a flexible format, so we assume OpenAI-like
        let result = response.choices?.[0]?.message || response;
        if (!result) throw new Error("Failed to get response from Perplexity", { cause: response });

        result.attachments = response.images?.map((image: any) => image.image_url) || [];

        // Replace [1], [2], ... with markdown links to citations, append unused at end
        const citations = response.citations || [];
        if (citations.length && typeof result.content === "string") {
            const used = new Set<number>();
            let content = result.content.replace(/\[(\d+)\]/g, (match: string, n: string) => {
                const idx = parseInt(n, 10) - 1;
                if (citations[idx]) {
                    used.add(idx);
                    try {
                        const domain = new URL(citations[idx]).hostname.replace(/^www\./, "");
                        return `[\[${domain}\]](${citations[idx]})`;
                    } catch {
                        return `[\[link\]](${citations[idx]})`;
                    }
                }
                return match;
            });
            
            // Append unused citations as markdown links at the end
            const unusedLinks = citations
                .map((url: string, i: number) => {
                    if (!used.has(i)) {
                        try {
                            const domain = new URL(url).hostname.replace(/^www\./, "");
                            return `[\[${domain}\]](${url})`;
                        } catch {
                            return `[\[link\]](${url})`;
                        }
                    }
                    return null;
                })
                .filter(Boolean)
                .join(", ");

            if (unusedLinks) {
                content += "\n\n" + unusedLinks;
            }

            result.content = content;
        }

        return {
            resultMessage: result
        };
    }

    protected async sendRequest(payload: Record<string, any>): Promise<any> {
        const result = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env[this.connectionOptions.apiKey]}`,
            },
            body: JSON.stringify(payload),
        });

        const response = await result.json();
        console.log("Perplexity response:", response);

        if (response.error) throw new Error("Perplexity Error", { cause: response });

        return response;
    }
}
