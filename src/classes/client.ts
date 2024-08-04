import SuperMap from "@thunder04/supermap";
import { Client, ClientOptions } from "discord.js";
import { Store } from "../stores/store";
import { StoreTypes } from "../types";
import { ConfigLoader } from "./configLoader";

export class DiscordBotClient extends Client {
	commands: Store<StoreTypes.COMMANDS>;
	components: Store<StoreTypes.COMPONENTS>;
	contexts: Store<StoreTypes.CONTEXTS>;
	modals: Store<StoreTypes.MODALS>;
	cache: SuperMap<string, any>;
	#configLoader = ConfigLoader;

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

    loadConfig() {
		return this.#configLoader.loadConfig()
    }

	async getSlashCommandTag(name: string) {
		const commands = await this.application?.commands.fetch()
		if(!commands?.size) return `/${name}`
		else if(commands?.find(c => c.name === name)?.id) return `</${name}:${commands?.find(c => c.name === name)!.id}>`
		else return `/${name}`
	}
}
