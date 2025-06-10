import { MCPManager } from "./MCPManager";

export class MCPResourceHandler {
    private static mcpManager = MCPManager.getInstance();

    /**
     * Fetches MCP resource content by URI
     * @param uri The resource URI (e.g., "file:///path/to/file.txt")
     * @returns The resource content as a string
     */
    static async fetchResource(uri: string): Promise<string> {
        // Try to find which server owns this resource
        const servers = this.mcpManager.getAvailableServers();
        
        for (const serverName of servers) {
            try {
                const content = await this.mcpManager.getResourceContent(serverName, uri);
                return content;
            } catch (error) {
                // Try next server
                continue;
            }
        }
        
        throw new Error(`Resource ${uri} not found in any MCP server`);
    }

    /**
     * Lists all available resources across all MCP servers
     */
    static async listAllResources(): Promise<{ serverName: string; resources: any[] }[]> {
        const servers = this.mcpManager.getAvailableServers();
        const allResources: { serverName: string; resources: any[] }[] = [];
        
        for (const serverName of servers) {
            const client = this.mcpManager.getClient(serverName);
            if (client) {
                const resources = client.getResources();
                allResources.push({ serverName, resources });
            }
        }
        
        return allResources;
    }

    /**
     * Converts MCP resource URIs in attachments to actual content
     * @param attachments Array of attachment strings (URLs or URIs)
     * @returns Array of attachments with MCP resources resolved
     */
    static async resolveResourceAttachments(attachments: string[]): Promise<string[]> {
        const resolved: string[] = [];
        
        for (const attachment of attachments) {
            // Check if this looks like an MCP resource URI
            if (attachment.startsWith("file://") || attachment.startsWith("resource://")) {
                try {
                    const content = await this.fetchResource(attachment);
                    // Convert to text attachment
                    const base64Content = Buffer.from(content).toString('base64');
                    resolved.push(`data:text/plain;base64,${base64Content}`);
                } catch (error) {
                    console.error(`Failed to resolve MCP resource ${attachment}:`, error);
                    resolved.push(attachment); // Keep original if resolution fails
                }
            } else {
                resolved.push(attachment);
            }
        }
        
        return resolved;
    }
}