import BaseConnector, {ChatMessage, ChatMessageRoles, GenerationOptions} from "./BaseConnector";

export default class OpenAIConnector extends BaseConnector {
    override async requestChatCompletion(messages: ChatMessage[], generationOptions: GenerationOptions): Promise<ChatMessage> {
        // convert message format to openai format
        const openAiMessages = messages
            .map(m => this.convertToOpenAiMessage(m))
            .filter(m => m !== null) as OpenAiChatMessage[];

        const validated = await this.passesModeration(openAiMessages)

        if(!validated) throw new Error("Message did not pass moderation")

        const response = await this.executeToolCall(openAiMessages, generationOptions)

        return response;
    }

    private async executeToolCall(messages: OpenAiChatMessage[], generationOptions: GenerationOptions, depth = 5): Promise<OpenAiBotMessage> {
        const response = await this.sendRequest({
            ...generationOptions,
            messages,
            tool_choice: depth === 0 ? "none" : "auto",
            tools: [{
                type: "function",
                function: {
                    description: "An accurate tool to give exact results for a given query. More scientifically accurate than any large language model.",
                    name: "wolfram-alpha",
                    parameters: {
                        type: "object",
                        properties: {
                            query: {
                                type: "string",
                                description: "The query to search for"
                            }
                        },
                        required: ["query"]
                    }
                }
            }]
        })

        const toolCalls = response.choices[0]!.message.tool_calls?.filter(call => call.function.name === "wolfram-alpha")
        if(!toolCalls?.length) return response.choices[0]!.message;

        messages.push(response.choices[0]!.message)

        for(const toolCall of toolCalls) {
            const wolframResponse = await this.requestWolfram(toolCall.function.arguments)

            messages.push({
                role: "tool",
                content: wolframResponse,
                tool_call_id: toolCall.id
            })
        }

        return this.executeToolCall(messages, generationOptions,  depth - 1)
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
        // IDE is crying but typescript isn't, idfk what is wrong with it
        // @ts-ignore
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

    private async requestWolfram(prompt: string): Promise<string> {
        const parameters = new URLSearchParams({
            appid: process.env["WOLFRAM_ALPHA_ID"]!,
            input: prompt,
            format: "plaintext",
            includepodid: "Result",
            units: "metric",
            output: "JSON"
        })

        const request = await fetch(`https://api.wolframalpha.com/v2/query?${parameters.toString()}`)
            .then(res => res.text())
            .catch(console.error)

        const res = request || "Unable to query result"

        return res;
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
    frequency_penalty?: number;
    logit_bias?: Record<string, number>;
    max_tokens?: number;
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
            parameters: Record<string, any>
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