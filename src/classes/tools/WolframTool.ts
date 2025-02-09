import BaseTool, { ToolCallData } from "./BaseTool";

export default class WolframTool extends BaseTool {
    constructor() {
        super({
            name: "wolfram-alpha",
            description: "Get scientifically accurate computations and knowledge directly from Wolfram Alpha.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "The query to compute with Wolfram Alpha"
                    }
                },
                required: ["query"]
            }
        });
    }

    async handleToolCall(parameters: ToolCallData) {
        const queryParams = new URLSearchParams({
            appid: process.env["WOLFRAM_ALPHA_ID"]!,
            input: parameters["query"],
            format: "plaintext",
            includepodid: "Result",
            units: "metric",
            output: "JSON"
        });

        const response = await fetch(`https://api.wolframalpha.com/v2/query?${queryParams.toString()}`)
            .then(res => res.text())
            .catch(error => {
                console.error("Wolfram Alpha API error:", error);
                return "Unable to compute result";
            });

        return {result: response || "No result found", attachments: [`data:application/json;base64,${Buffer.from(response).toString('base64')}`]};
    }
}
