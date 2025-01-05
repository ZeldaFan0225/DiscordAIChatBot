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

    static loadConfig(): Config {
        const content = readFileSync("config.json", "utf-8");
        let config: Config;
        try {
            config = JSON.parse(content)
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
    model: string;
    displayName: string;
    defaultSystemInstructionName: string;
    systemInstructionAllowed?: boolean;
    images: {
        supported: boolean;
    };
    generationOptions: GenerationOptions;
}