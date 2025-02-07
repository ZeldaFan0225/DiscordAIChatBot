import BaseTool, { ToolCallData } from "./BaseTool";

export default class SearxingTool extends BaseTool {
    constructor() {
        super({
            name: "internet",
            description: "Get up to date information directly from the internet.",
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
        });
    }

    async handleToolCall(parameters: ToolCallData): Promise<{title: string, url: string, content: string}[]> {
        const searchParams = new URLSearchParams({
            q: parameters["query"],
            format: "json"
        });

        const data = await fetch(`${process.env["SEARXING_ORIGIN"]}/search?${searchParams.toString()}`)
            .then(res => res.json());

        return data.results.slice(0, 5).map((result: any) => ({
            title: result.title,
            url: result.url,
            content: result.content
        }));
    }
}
