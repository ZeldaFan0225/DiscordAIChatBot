import BaseTool, { ToolCallData, ToolResponse } from "../tools/BaseTool";
import { MCPClient } from "./MCPClient";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

export class MCPToolAdapter extends BaseTool {
    private mcpClient: MCPClient;
    private mcpTool: Tool;

    constructor(mcpClient: MCPClient, tool: Tool) {
        super({
            name: tool.name,
            description: tool.description || "",
            parameters: tool.inputSchema as any
        });
        this.mcpClient = mcpClient;
        this.mcpTool = tool;
    }

    async handleToolCall(parameters: ToolCallData): Promise<ToolResponse> {
        try {
            const result = await this.mcpClient.callTool(this.mcpTool.name, parameters);
            
            // Extract any attachments from the result
            const attachments: string[] = [];
            
            // Handle different content types
            if (result.content) {
                for (const content of result.content) {
                    if (content.type === "image" && content.data) {
                        // Convert base64 image to data URL
                        const mimeType = content.mimeType || "image/png";
                        attachments.push(`data:${mimeType};base64,${content.data}`);
                    } else if (content.type === "resource" && content.resource) {
                        // Add resource URI as attachment for later fetching
                        attachments.push(content.resource.uri);
                    }
                }
            }

            // Extract text content
            let textResult = "";
            if (result.content) {
                textResult = result.content
                    .filter((c: any) => c.type === "text")
                    .map((c: any) => c.text)
                    .join("\n");
            }

            return {
                result: textResult || result,
                attachments: attachments.length > 0 ? attachments : undefined
            };
        } catch (error) {
            console.error(`MCP tool call failed for ${this.mcpTool.name}:`, error);
            throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
}