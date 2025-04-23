import BaseTool, { ToolCallData, ToolResponse } from "./BaseTool";

export default class GptImageTool extends BaseTool {
    constructor() {
        super({
            name: "gpt_image",
            description: "Generate images using OpenAI's GPT image models (gpt-image-1, dall-e-2, dall-e-3). Provide a prompt describing the desired image. Optional parameters allow customization of model, size, background, format, and more.",
            parameters: {
                type: "object",
                properties: {
                    prompt: {
                        type: "string",
                        description: "A text description of the desired image(s)."
                    },
                    background: {
                        type: "string",
                        description: "Set transparency for the background (gpt-image-1 only): transparent, opaque, or auto.",
                        enum: ["transparent", "opaque", "auto"]
                    },
                    output_format: {
                        type: "string",
                        description: "The format for generated images (gpt-image-1 only): png, jpeg, or webp.",
                        enum: ["png", "jpeg", "webp"]
                    },
                    quality: {
                        type: "string",
                        description: "Image quality: auto, high, medium, low, hd, or standard.",
                        enum: ["auto", "high", "medium", "low"]
                    }
                },
                required: ["prompt"]
            }
        });
    }

    async handleToolCall(parameters: ToolCallData, userId?: string): Promise<ToolResponse> {
        try {
            const apiKey = process.env['OPENAI_KEY'];
            if (!apiKey) {
                throw new Error("OPENAI_KEY is not configured");
            }

            console.log(parameters)
            const prompt = parameters["prompt"];
            const background = parameters["background"];
            const output_format = parameters["output_format"];
            const quality = parameters["quality"];

            if (!prompt || typeof prompt !== "string" || prompt.length < 1) {
                throw new Error("Prompt is required and must be a non-empty string.");
            }

            const body: Record<string, any> = {
                prompt,
                model: "gpt-image-1",
                size: "auto",
                user: userId,
                moderation: "low"
            };
            if (background) body["background"] = background;
            if (output_format) body["output_format"] = output_format;
            if (quality) body["quality"] = quality;

            const response = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
            }

            const data = await response.json();

            if (data.data && Array.isArray(data.data) && data.data.length > 0) {
                const attachments = data.data.map((img: any) =>
                    img.b64_json ? `data:image/png;base64,${img.b64_json}` : null
                ).filter(Boolean);

                return {
                    result: "Image(s) generated successfully.",
                    attachments
                };
            } else {
                throw new Error("No image data returned from OpenAI API.");
            }
        } catch (error) {
            console.error("Error in GptImageTool:", error);
            return {
                result: `Error generating image: ${error instanceof Error ? error.message : String(error)}`,
                attachments: []
            };
        }
    }
}
