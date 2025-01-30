import BaseConnector, {ChatCompletionResult, ChatMessage, GenerationOptions, RequestOptions} from "./BaseConnector";

export default class WolframConnector extends BaseConnector {
    override async requestChatCompletion(messages: ChatMessage[], _generationOptions: GenerationOptions, requestOptions: RequestOptions): Promise<ChatCompletionResult> {
        requestOptions.updatesEmitter?.sendUpdate("Requesting computation from Wolfram Alpha...")
        const result = await this.requestWolfram(messages.at(-1)!.content)

        return {
            resultMessage: {
                content: result.queryresult.pods[0]!.subpods[0]!.plaintext,
                role: "assistant"
            }
        };
    }

    private async requestWolfram(prompt: string): Promise<WolframResult> {
        const parameters = new URLSearchParams({
            appid: process.env["WOLFRAM_ALPHA_ID"]!,
            input: prompt,
            format: "plaintext",
            includepodid: "Result",
            units: "metric",
            output: "JSON"
        })

        const request = await fetch(`https://api.wolframalpha.com/v2/query?${parameters.toString()}`)
            .then(res => res.json())
            .catch(console.error) as WolframResult

        return request;
    }
}

export interface WolframResult {
    queryresult: {
        success: boolean,
        error: boolean,
        numpods: number,
        datatypes: string,
        timedout: string,
        timedoutpods: string,
        timing: number,
        parsetiming: number,
        parsetimedout: string,
        recalculate: string,
        id: string,
        host: string,
        server: string,
        related: string,
        version: string,
        pods: {
            title: string,
            scanner: string,
            id: string,
            position: number,
            error: boolean,
            numsubpods: number,
            subpods: {
                title: string,
                plaintext: string,
                img: {
                    src: string,
                    alt: string
                }
            }[]
        }[];
        assumptions: {
            type: string,
            word: string,
            template: string,
            count: number,
            values: {
                name: string,
                desc: string,
                input: string
            }[]
        }[];
        userinfoused: {
            name: string
        }
        sources: {
            url: string,
            text: string
        }
    }
}
