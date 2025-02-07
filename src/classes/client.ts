import SuperMap from "@thunder04/supermap";
import { AttachmentBuilder, Client, ClientOptions } from "discord.js";
import { Store } from "../stores/store";
import { StoreTypes } from "../types";
import { ConfigLoader } from "./configLoader";
import { Pool } from "pg";

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
	
			const fileExtension = type.split("/")[1];
			const buffer = Buffer.from(data, "base64");
	
			return new AttachmentBuilder(buffer, {name: `${filename}.${fileExtension}`});
		} else if(input.startsWith("http")) {
			const request = await fetch(input);
			const contentType = request.headers.get("Content-Type") || "image/png";
			const fileExtension = contentType.split("/")[1];
	
			return new AttachmentBuilder(Buffer.from(await request.arrayBuffer()), {name: `${filename}.${fileExtension}`});
		} else {
			return new AttachmentBuilder(Buffer.from(input), {name: `${filename}.txt`});
		}
	}
}
