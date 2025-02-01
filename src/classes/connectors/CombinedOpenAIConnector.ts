import OpenAIConnector, { OpenAiChatMessage, OpenAiBotMessage } from "./OpenAIConnector";
import { ChatCompletionResult, ChatMessage, GenerationOptions, RequestOptions } from "./BaseConnector";

export default class CombinedOpenAIConnector extends OpenAIConnector {
    override async requestChatCompletion(messages: ChatMessage[], generationOptions: GenerationOptions, requestOptions: RequestOptions): Promise<ChatCompletionResult> {
        // convert message format to openai format
        const openAiMessages = messages
            .map(m => this.convertToOpenAiMessage(m))
            .filter(m => m !== null) as OpenAiChatMessage[];

        requestOptions.updatesEmitter?.sendUpdate("Checking message moderation...")
        const validated = await this.passesModeration(openAiMessages)

        if(!validated) throw new Error("Message did not pass moderation")

        requestOptions.updatesEmitter?.sendUpdate("Message passed moderation check")
        const response = await this.executeToolCall(openAiMessages, generationOptions, requestOptions)

        const audio_data_string = response.audio?.data ? 
            `data:audio/${generationOptions["audio"]?.["format"]};base64,${response.audio.data}` : 
            undefined;

        return {
            resultMessage: {
                role: response.role,
                content: response.content || response.audio?.transcript || "",
                audio_data_string
            } as ChatMessage
        };
    }

    private async executeToolCall(messages: OpenAiChatMessage[], generationOptions: GenerationOptions, requestOptions: RequestOptions, depth = 5): Promise<OpenAiBotMessage> {
        requestOptions.updatesEmitter?.sendUpdate("Requesting completion from OpenAI...")
        const response = await this.sendRequest({
            ...generationOptions,
            messages,
            tool_choice: depth === 0 ? "none" : "auto",
            tools: [
                {
                    type: "function",
                    function: {
                        description: "Get up to date information directly from the internet.",
                        name: "internet",
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
                },
                {
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
                }
            ]
        })

        const result = response.choices[0]?.message;
        if (!result) throw new Error("Failed to get response from OpenAI", { cause: response });

        const internetToolCalls = result.tool_calls?.filter(call => call.function.name === "internet") || []
        const wolframToolCalls = result.tool_calls?.filter(call => call.function.name === "wolfram-alpha") || []

        if (!internetToolCalls.length && !wolframToolCalls.length) return result;

        messages.push(result)

        // Handle internet searches
        if(internetToolCalls.length) {
            requestOptions.updatesEmitter?.sendUpdate("Searching the internet for information...")
            for(const toolCall of internetToolCalls) {
                const searxingResponse = await this.requestInternet(toolCall.function.arguments)
    
                messages.push({
                    role: "tool",
                    content: JSON.stringify(searxingResponse),
                    tool_call_id: toolCall.id
                } as OpenAiChatMessage)
            }
        }

        // Handle Wolfram Alpha queries
        if(wolframToolCalls.length) {
            requestOptions.updatesEmitter?.sendUpdate("Computing with Wolfram Alpha...")
            for(const toolCall of wolframToolCalls) {
                const wolframResponse = await this.requestWolfram(toolCall.function.arguments)
    
                messages.push({
                    role: "tool",
                    content: wolframResponse,
                    tool_call_id: toolCall.id
                } as OpenAiChatMessage)
            }
        }

        return this.executeToolCall(messages, generationOptions, requestOptions, depth - 1)
    }

    private async requestInternet(prompt: string): Promise<{title: string, url: string, content: string}[]> {
        const searchParams = new URLSearchParams({q: JSON.parse(prompt).query, format: "json"});
        const data = await fetch(`${process.env["SEARXING_ORIGIN"]}/search?${searchParams.toString()}`)
            .then(res => res.json())

        return data.results.slice(0, 5).map((result: any) => ({
            title: result.title,
            url: result.url,
            content: result.content
        }))
    }

    private async requestWolfram(prompt: string): Promise<string> {
        const parameters = new URLSearchParams({
            appid: process.env["WOLFRAM_ALPHA_ID"]!,
            input: JSON.parse(prompt).query,
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
