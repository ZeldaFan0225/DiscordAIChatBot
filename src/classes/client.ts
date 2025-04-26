import SuperMap from "@thunder04/supermap";
import { AttachmentBuilder, Client, ClientOptions, FileBuilder, MediaGalleryBuilder, TextDisplayBuilder, TopLevelComponentData } from "discord.js";
import { Store } from "../stores/store";
import { ChatMessageData, HeyMessageData, StoreTypes } from "../types";
import { ConfigLoader } from "./configLoader";
import { Pool } from "pg";
import { ChatCompletionResult } from "./connectors/BaseConnector";

export class DiscordBotClient extends Client {
	commands: Store<StoreTypes.COMMANDS>;
	components: Store<StoreTypes.COMPONENTS>;
	contexts: Store<StoreTypes.CONTEXTS>;
	modals: Store<StoreTypes.MODALS>;
	cache: SuperMap<string, any>;
	#configLoader = ConfigLoader;
	static db: Pool;

	constructor(options: ClientOptions) {
		super(options);
		this.commands = new Store<StoreTypes.COMMANDS>({files_folder: "/commands", load_classes_on_init: false, storetype: StoreTypes.COMMANDS});
		this.components = new Store<StoreTypes.COMPONENTS>({files_folder: "/components", load_classes_on_init: false, storetype: StoreTypes.COMPONENTS});
		this.contexts = new Store<StoreTypes.CONTEXTS>({files_folder: "/contexts", load_classes_on_init: false, storetype: StoreTypes.CONTEXTS});
		this.modals = new Store<StoreTypes.MODALS>({files_folder: "/modals", load_classes_on_init: false, storetype: StoreTypes.MODALS});
		this.cache = new SuperMap({
			intervalTime: 1000
		})
	}

	get config() {
		return this.#configLoader.config
	}

	get connectorInstances() {
		return this.#configLoader.connectorInstances
	}

	get toolInstances() {
		return this.#configLoader.toolInstances
	}

    loadConfig() {
		return this.#configLoader.loadConfig()
    }

	async getSlashCommandTag(name: string) {
		const commands = await this.application?.commands.fetch()
		if(!commands?.size) return `/${name}`
		else if(commands?.find(c => c.name === name)?.id) return `</${name}:${commands?.find(c => c.name === name)!.id}>`
		else return `/${name}`
	}

	static async convertToAttachmentBuilder(input: string, filename: string) {
		if(input.startsWith("data:")) {
			const [type, data] = input.split(";base64,");
			if(!type || !data) throw new Error("Invalid data URL");
	
			const fileExtension = type.split("/")[1]?.split(";")[0];
			const buffer = Buffer.from(data, "base64");
	
			return new AttachmentBuilder(buffer, {name: `${filename}.${fileExtension}`});
		} else if(input.startsWith("http")) {
			const request = await fetch(input);
			const contentType = request.headers.get("Content-Type") || "image/png";
			const fileExtension = contentType.split("/")[1]?.split(";")[0];
	
			return new AttachmentBuilder(Buffer.from(await request.arrayBuffer()), {name: `${filename}.${fileExtension}`});
		} else {
			return new AttachmentBuilder(Buffer.from(input), {name: `${filename}.txt`});
		}
	}

	static async constructMessage(completion: ChatCompletionResult): Promise<{components: TopLevelComponentData[], attachments: AttachmentBuilder[]}> {
        const content = completion.resultMessage.content

        const files = await Promise.allSettled(
            (completion.resultMessage.attachments || []).map((a, i) => DiscordBotClient.convertToAttachmentBuilder(a, `attachment-${i}`))
        ).then(res => res.filter(r => r.status === "fulfilled").map(r => r.value));

        if (completion.resultMessage.audio_data_string) {
            const [contentType, data] = completion.resultMessage.audio_data_string.slice(5).split(";base64,");
            if (contentType && data) {
                const attachment = new AttachmentBuilder(Buffer.from(data, "base64"), { name: `response.${contentType.split("/")[1]}` });
                files.unshift(attachment)
            }
        }

        const components = []

        if ((content?.length || 0) > 4000) {
            const fileName = `response-${Date.now()}.txt`
            components.push(
                new TextDisplayBuilder({ content: "Response attached as a file." }),
                new FileBuilder({
                    file: {
                        url: `attachment://${fileName}`
                    }
                })
            )

            files.push(new AttachmentBuilder(Buffer.from(content || "[No Content]"), { name: fileName }))
        } else {
            components.push(new TextDisplayBuilder({ content: content || "[No Content]" }))
        }

        const mediaCaruselFiles: AttachmentBuilder[] = []
        files?.forEach((file) => {
            if (/^[\w\s\-]+\.(jpg|jpeg|png|gif|webp)$/i.test(file.name!)) {
                mediaCaruselFiles.push(file)
            } else {
                components.push(
                    new FileBuilder({
                        file: {
                            url: `attachment://${file.name}`
                        }
                    })
                )
            }
        })

        if (mediaCaruselFiles.length) {
            components.push(
                new MediaGalleryBuilder({
                    items: mediaCaruselFiles.map((attachment) => ({
                        media: {
                            url: `attachment://${attachment.name}`
                        },
                        description: `Image: ${attachment.name}`
                    }))
                })
            )
        }

        return { components: components.map(c => c.toJSON()), attachments: files }
    }

	async saveChatCompletion(userContent: string, assistantResponse: string, modelName: string, systemInstructionName: string, responseMessageId: string, userId: string, parentMessageId?: string) {
		await DiscordBotClient.db.query(
			"INSERT INTO chat_messages (message_id, user_content, assistant_content, model_name, system_instruction_name, user_id, parent_message_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
			[responseMessageId, userContent, assistantResponse, modelName, systemInstructionName, userId, parentMessageId || null]
		).catch(console.error);
	}
	
	async hasChatMessage(messageId: string) {
		const { rows } = await DiscordBotClient.db.query("SELECT * FROM chat_messages WHERE message_id = $1", [messageId]);
		return rows.length > 0;
	}
	
	async getChatHistory(messageId: string) {
		const { rows } = await DiscordBotClient.db.query<ChatMessageData>(
			`WITH RECURSIVE message_hierarchy AS (
		SELECT
			index,
			message_id,
			model_name,
			system_instruction_name,
			user_content,
			assistant_content,
			user_id,
			parent_message_id
		FROM
			chat_messages
		WHERE
			message_id = $1
	
		UNION ALL
	
		SELECT
			m.index,
			m.message_id,
			m.model_name,
			m.system_instruction_name,
			m.user_content,
			m.assistant_content,
			m.user_id,
			m.parent_message_id
		FROM
			chat_messages m
			INNER JOIN message_hierarchy mh ON m.message_id = mh.parent_message_id
	)
	
	SELECT
		*
	FROM
		message_hierarchy;`,
			[messageId]
		);
		return rows;
	}

	async saveHeyCompletion(userContent: string, assistantResponse: string, triggerName: string, responseMessageId: string, userId: string, parentMessageId?: string) {
		await DiscordBotClient.db.query(
			"INSERT INTO hey_messages (message_id, user_content, assistant_content, trigger_name, user_id, parent_message_id) VALUES ($1, $2, $3, $4, $5, $6)",
			[responseMessageId, userContent, assistantResponse, triggerName, userId, parentMessageId || null]
		).catch(console.error);
	}
	
	async hasHeyMessage(messageId: string) {
		const { rows } = await DiscordBotClient.db.query("SELECT * FROM hey_messages WHERE message_id = $1", [messageId]);
		return rows.length > 0;
	}
	
	async getHeyHistory(messageId: string) {
		const { rows } = await DiscordBotClient.db.query<HeyMessageData>(
			`WITH RECURSIVE message_hierarchy AS (
		SELECT
			index,
			message_id,
			trigger_name,
			user_content,
			assistant_content,
			user_id,
			parent_message_id
		FROM
			hey_messages
		WHERE
			message_id = $1
	
		UNION ALL
	
		SELECT
			m.index,
			m.message_id,
			m.trigger_name,
			m.user_content,
			m.assistant_content,
			m.user_id,
			m.parent_message_id
		FROM
			hey_messages m
			INNER JOIN message_hierarchy mh ON m.message_id = mh.parent_message_id
	)
	
	SELECT
		*
	FROM
		message_hierarchy;`,
			[messageId]
		);
		return rows;
	}
}
