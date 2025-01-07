import {readFileSync} from "fs";
import BaseConnector, { ConnectionOptions, GenerationOptions } from "./connectors/BaseConnector";
import { join } from "path";

export class ConfigLoader {
    static #config: Config;
    static #connectors: Record<string, BaseConnector> = {};
    static {
        ConfigLoader.loadConfig();
    }

    static get config(): Config {
        return ConfigLoader.#config;
    }

    static get connectorInstances(): Record<string, BaseConnector> {
        return ConfigLoader.#connectors;
    }

    static validateConfig(config: any): asserts config is Config {
        // Validate required fields
        if (!Array.isArray(config.staff_roles)) {
            throw new Error("staff_roles must be an array of strings");
        }

        // Validate hey configuration
        if (typeof config.hey !== "object" || config.hey === null) {
            throw new Error("hey configuration must be an object");
        }
        if (typeof config.hey.enabled !== "boolean") {
            throw new Error("hey.enabled must be a boolean");
        }
        if (typeof config.hey.triggers !== "object" || config.hey.triggers === null) {
            throw new Error("hey.triggers must be an object");
        }
        for (const [trigger, triggerConfig] of Object.entries(config.hey.triggers) as [string, HeyTrigger][]) {
            if (typeof triggerConfig.model !== "string") {
                throw new Error(`hey.triggers.${trigger}.model must be a string`);
            }
            if (triggerConfig.processingEmoji !== undefined && typeof triggerConfig.processingEmoji !== "string") {
                throw new Error(`hey.triggers.${trigger}.processingEmoji must be a string if provided`);
            }
            if (triggerConfig.systemInstruction !== undefined && typeof triggerConfig.systemInstruction !== "string") {
                throw new Error(`hey.triggers.${trigger}.systemInstruction must be a string if provided`);
            }
            if (triggerConfig.previousMessagesContext !== undefined && typeof triggerConfig.previousMessagesContext !== "number") {
                throw new Error(`hey.triggers.${trigger}.previousMessagesContext must be a number if provided`);
            }

            // Cross validate model exists
            if (!config.modelConfigurations[triggerConfig.model]) {
                throw new Error(`Hey trigger "${trigger}" references non-existent model: ${triggerConfig.model}`);
            }

            // Cross validate system instruction exists if specified
            if (triggerConfig.systemInstruction && !config.systemInstructions[triggerConfig.systemInstruction]) {
                throw new Error(`Hey trigger "${trigger}" references non-existent system instruction: ${triggerConfig.systemInstruction}`);
            }
        }

        // Validate optional user_blacklist
        if (config.user_blacklist !== undefined && !Array.isArray(config.user_blacklist)) {
            throw new Error("user_blacklist must be an array of strings if provided");
        }

        // Validate optional chat configuration
        if (config.chat !== undefined) {
            if (typeof config.chat !== "object" || config.chat === null) {
                throw new Error("chat configuration must be an object if provided");
            }
            if (config.chat.maxHistoryDepth !== undefined && typeof config.chat.maxHistoryDepth !== "number") {
                throw new Error("chat.maxHistoryDepth must be a number if provided");
            }
        }

        // Validate optional ask configuration
        if (config.ask !== undefined) {
            if (typeof config.ask !== "object" || config.ask === null) {
                throw new Error("ask configuration must be an object if provided");
            }
            if (config.ask.model !== undefined && typeof config.ask.model !== "string") {
                throw new Error("ask.model must be a string if provided");
            }
            if (config.ask.systemInstruction !== undefined && typeof config.ask.systemInstruction !== "string") {
                throw new Error("ask.systemInstruction must be a string if provided");
            }
            if (config.ask.initialPromptTemplate !== undefined && typeof config.ask.initialPromptTemplate !== "string") {
                throw new Error("ask.initialPromptTemplate must be a string if provided");
            }
        }

        // Validate systemInstructions
        if (typeof config.systemInstructions !== "object" || config.systemInstructions === null) {
            throw new Error("systemInstructions must be an object");
        }
        for (const [key, value] of Object.entries(config.systemInstructions)) {
            if (typeof value !== "string") {
                throw new Error(`systemInstructions.${key} must be a string`);
            }
        }
        if(!("default" in config.systemInstructions)) {
            throw new Error("systemInstructions must contain a default instruction");
        }

        // Validate connectorConfigurations
        if (typeof config.connectorConfigurations !== "object" || config.connectorConfigurations === null) {
            throw new Error("connectorConfigurations must be an object");
        }
        for (const [name, connectorConfig] of Object.entries(config.connectorConfigurations) as [string, ConnectorConfiguration][]) {
            if (typeof connectorConfig.class !== "string") {
                throw new Error(`connectorConfigurations.${name}.class must be a string`);
            }
            if (typeof connectorConfig.connectionOptions !== "object" || connectorConfig.connectionOptions === null) {
                throw new Error(`connectorConfigurations.${name}.connectionOptions must be an object`);
            }
        }

        // Validate modelConfigurations
        if (typeof config.modelConfigurations !== "object" || config.modelConfigurations === null) {
            throw new Error("modelConfigurations must be an object");
        }
        for (const [name, modelConfig] of Object.entries(config.modelConfigurations) as [string, ModelConfiguration][]) {
            if (typeof modelConfig.connector !== "string") {
                throw new Error(`modelConfigurations.${name}.connector must be a string`);
            }
            if (typeof modelConfig.displayName !== "string") {
                throw new Error(`modelConfigurations.${name}.displayName must be a string`);
            }
            if (modelConfig.systemInstructionAllowed !== undefined && typeof modelConfig.systemInstructionAllowed !== "boolean") {
                throw new Error(`modelConfigurations.${name}.systemInstructionAllowed must be a boolean if provided`);
            }
            if(modelConfig.systemInstructionAllowed !== false) {
                if (typeof modelConfig.defaultSystemInstructionName !== "string") {
                    throw new Error(`modelConfigurations.${name}.defaultSystemInstructionName must be a string`);
                }
            }
            if (typeof modelConfig.images !== "object" || modelConfig.images === null) {
                throw new Error(`modelConfigurations.${name}.images must be an object`);
            }
            if (typeof modelConfig.images.supported !== "boolean") {
                throw new Error(`modelConfigurations.${name}.images.supported must be a boolean`);
            }
            if (typeof modelConfig.generationOptions !== "object" || modelConfig.generationOptions === null) {
                throw new Error(`modelConfigurations.${name}.generationOptions must be an object`);
            }

            // Cross validate connector exists
            if (!config.connectorConfigurations[modelConfig.connector]) {
                throw new Error(`Model ${name} references non-existent connector: ${modelConfig.connector}`);
            }

            // Cross validate system instruction exists
            if (modelConfig.systemInstructionAllowed !== false && !config.systemInstructions[modelConfig.defaultSystemInstructionName!]) {
                throw new Error(`Model ${name} references non-existent system instruction: ${modelConfig.defaultSystemInstructionName}`);
            }
        }

        // Cross validate ask configuration references if present
        if (config.ask?.model && !config.modelConfigurations[config.ask.model]) {
            throw new Error(`Ask configuration references non-existent model: ${config.ask.model}`);
        }
        if (config.ask?.systemInstruction && !config.systemInstructions[config.ask.systemInstruction]) {
            throw new Error(`Ask configuration references non-existent system instruction: ${config.ask.systemInstruction}`);
        }
    }

    static loadConfig(): Config {
        const content = readFileSync("config.json", "utf-8");
        let config: Config;
        try {
            config = JSON.parse(content);
            if(process.argv.includes("--disable-validation")) {
                console.warn("Configuration validation is disabled");
            } else {
                this.validateConfig(config);
            }
        } catch (e) {
            throw new Error(`Unable to parse config file: ${(e as SyntaxError).message}`);
        }
        ConfigLoader.#config = config;

        this.loadConnectors();
        console.info("Loaded config");
        return config;
    }

    private static loadConnectors() {
        const connectors: Record<string, BaseConnector> = {}
        for(const [connectorName, connectorData] of Object.entries(ConfigLoader.#config.connectorConfigurations)) {
            try {
                const path = join(process.cwd(), "dist", connectorData.class);
                delete require.cache[require.resolve(path)];
                const connectorClass = require(path).default;
                const connector = new connectorClass(connectorData.connectionOptions);
                connectors[connectorName] = connector;
                console.info(`Loaded connector ${connectorName}`);
            } catch (e) {
                throw new Error(`Unable to load connector ${connectorName}: ${(e as Error).message}`);
            }
        }
        this.#connectors = connectors;
    }
}


export interface Config {
    staff_roles: string[];
    user_blacklist?: string[];
    hey: HeyConfiguration;
    chat?: {
        maxHistoryDepth?: number;
    },
    ask?: {
        model?: string;
        systemInstruction?: string;
        initialPromptTemplate?: string;
    },
    systemInstructions: Record<string, string>;
    connectorConfigurations: Record<string, ConnectorConfiguration>;
    modelConfigurations: Record<string, ModelConfiguration>
}

export interface HeyConfiguration {
    enabled: boolean;
    triggers: Record<string, HeyTrigger>;
}

export interface HeyTrigger {
    model: string;
    processingEmoji?: string;
    systemInstruction?: string;
    previousMessagesContext?: number;
}

export interface ConnectorConfiguration {
    class: string;
    connectionOptions: ConnectionOptions;
}

export interface ModelConfiguration {
    connector: string;
    displayName: string;
    defaultSystemInstructionName?: string;
    systemInstructionAllowed?: boolean;
    images: {
        supported: boolean;
    };
    generationOptions: GenerationOptions;
}
