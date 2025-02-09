import BaseTool, { ToolCallData, ToolResponse } from "./BaseTool";

interface GeminiImageConfig {
    numberOfImages?: number;
    aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
    personGeneration?: "DONT_ALLOW" | "ALLOW_ADULT";
}

export default class Imagen3Tool extends BaseTool {
    constructor() {
        super({
            name: "generate_image",
            description: "A tool to generate images using Google's Gemini. For best results: 1) Include SUBJECT (what to generate), CONTEXT (background/setting), and STYLE (artistic approach) in your prompt. 2) Use quality modifiers like '4K', 'HDR', or 'professional' for higher quality. 3) Specify camera details like 'close-up', 'wide-angle', or 'macro' when relevant. 4) Reference specific art styles (e.g., 'renaissance', 'pop art') or photography styles ('film noir', 'polaroid') if desired. 5) Keep text generation under 25 characters for best results. Use only when directly asked to generate or create an image. The generated image will be automatically attached to the message. Make sure the prompt is appropriate for a 13+ community.",
            parameters: {
                type: "object",
                properties: {
                    prompt: {
                        type: "string",
                        description: "The prompt for image generation. Example good prompt: 'A professional studio photo (style) of a modern coffee shop (subject) with customers working on laptops in the background (context), warm lighting, 4K quality"
                    },
                    numberOfImages: {
                        type: "number",
                        description: "Number of images to generate (1-4)",
                        minimum: 1,
                        maximum: 1
                    }
                },
                required: ["prompt"]
            }
        });
    }

    async handleToolCall(parameters: ToolCallData): Promise<ToolResponse> {
        try {
            const geminiApiKey = process.env['GEMINI_TOOL_API_KEY'];
            if (!geminiApiKey) {
                throw new Error("GEMINI_TOOL_API_KEY is not configured");
            }

            const prompt = parameters["prompt"] as string;
            if (!this.validateImagePrompt(prompt)) {
                throw new Error("Invalid prompt: Must be between 1 and 500 characters");
            }

            const imageData = await this.generateGeminiImage(geminiApiKey, prompt);
            
            return {
                result: "The image has been generated",
                attachments: imageData.map(base64 => `data:image/jpeg;base64,${base64}`)
            };
        } catch (error) {
            console.error("Error in Imagen3Tool:", error);
            return {
                result: `Error generating image: ${error instanceof Error ? error.message : 'Unknown error'}`,
                attachments: []
            };
        }
    }

    private validateImagePrompt(prompt: string): boolean {
        return prompt.length > 0 && prompt.length <= 500;
    }

    private async generateGeminiImage(apiKey: string, prompt: string, config?: GeminiImageConfig): Promise<string[]> {
        console.log("Starting Gemini image generation process");

        try {
            console.log(`Sending request to Gemini API with prompt: "${prompt}"`);
            const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:generateImages", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    prompt: {
                        text: prompt
                    },
                    parameters: {
                        numberOfImages: config?.numberOfImages || 1,
                        aspectRatio: config?.aspectRatio || "1:1",
                        safetySettings: [{
                            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        }],
                        personGeneration: config?.personGeneration || "ALLOW_ADULT"
                    }
                })
            });

            console.log(response)
            console.log(await response.text())
            const data = await response.json();

            if (data.images && data.images.length > 0) {
                return data.images.map((img: { bytes: Uint8Array }) => 
                    Buffer.from(img.bytes).toString('base64')
                );
            } else {
                console.error("No image data found in the Gemini API response");
                throw new Error("No image data returned from the Gemini API");
            }
        } catch (error) {
            console.error("Error generating image with Gemini:", error);
            throw error;
        }
    }
}
