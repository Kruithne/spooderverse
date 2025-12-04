const DISCORD_API = 'https://discord.com/api/v10';
const GATEWAY_PARAMETERS = '?v=10&encoding=json';
const MAX_PAYLOAD_SIZE = 4096;
const RECONNECT_DELAY = 5000;

const DISCORD_TOKEN = process.env.DISCORD_TOKEN as string;
const BOT_TOKEN_HEADER = { 'Authorization': 'Bot ' + DISCORD_TOKEN };

// region api endpoints
const API_ENDPOINT = {
	GATEWAY: { endpoint: '/gateway', method: 'GET' },
	CREATE_MESSAGE: { endpoint: '/channels/%s/messages', method: 'POST' },
	DELETE_MESSAGE: { endpoint: '/channels/%s/messages/%s', method: 'DELETE' },
	GET_CHANNEL_MESSAGE: { endpoint: '/channels/%s/messages/%s', method: 'GET' },
	INTERACTION_RESPONSE: { endpoint: '/interactions/%s/%s/callback', method: 'POST' },
	EDIT_INTERACTION_RESP: { endpoint: '/webhooks/%s/%s/messages/@original', method: 'PATCH' },
	GET_REACTIONS: { endpoint: '/channels/%s/messages/%s/reactions/%s?limit=100', method: 'GET' }
} as const;
// endregion

// region opcodes
const OPCODE = {
	DISPATCH: 0,
	HEARTBEAT: 1,
	IDENTIFY: 2,
	PRESENCE_UPDATE: 3,
	RESUME: 6,
	RECONNECT: 7,
	INVALID_SESSION: 9,
	HELLO: 10,
	HEARTBEAT_ACK: 11
} as const;

const OPCODE_NAMES: Record<number, string> = Object.fromEntries(
	Object.entries(OPCODE).map(([k, v]) => [v, k])
);
// endregion

// region intents
export const INTENTS = {
	GUILDS: 1 << 0,
	GUILD_MEMBERS: 1 << 1,
	GUILD_BANS: 1 << 2,
	GUILD_EMOJIS_AND_STICKERS: 1 << 3,
	GUILD_INTEGRATIONS: 1 << 4,
	GUILD_WEBHOOKS: 1 << 5,
	GUILD_INVITES: 1 << 6,
	GUILD_VOICE_STATES: 1 << 7,
	GUILD_PRESENCES: 1 << 8,
	GUILD_MESSAGES: 1 << 9,
	GUILD_MESSAGE_REACTIONS: 1 << 10,
	GUILD_MESSAGE_TYPING: 1 << 11,
	DIRECT_MESSAGES: 1 << 12,
	DIRECT_MESSAGE_REACTIONS: 1 << 13,
	DIRECT_MESSAGE_TYPING: 1 << 14,
	MESSAGE_CONTENT: 1 << 15
} as const;
// endregion

// region socket close codes
const SOCKET_CODE = {
	CLIENT_RECONNECT: 3000,
	UNKNOWN_ERR: 4000,
	UNKNOWN_OPCODE: 4001,
	DECODE_ERROR: 4002,
	NOT_AUTHENTICATED: 4003,
	AUTHENTICATION_FAILED: 4004,
	ALREADY_AUTHENTICATED: 4005,
	INVALID_SEQUENCE: 4007,
	RATE_LIMITED: 4008,
	SESSION_TIMED_OUT: 4009,
	INVALID_SHARD: 4010,
	SHARDING_REQUIRED: 4011,
	INVALID_API_VER: 4012,
	INVALID_INTENT: 4013,
	DISALLOWED_INTENT: 4014
} as const;

const SOCKET_CODE_NAMES: Record<number, string> = Object.fromEntries(
	Object.entries(SOCKET_CODE).map(([k, v]) => [v, k])
);
// endregion

// region interaction types
export const INTERACTION_TYPE = {
	PING: 1,
	APPLICATION_COMMAND: 2,
	MESSAGE_COMPONENT: 3,
	APPLICATION_COMMAND_AUTOCOMPLETE: 4,
	MODAL_SUBMIT: 5
} as const;
// endregion

// region interaction callback types
export const INTERACTION_CALLBACK_TYPE = {
	PONG: 1,
	CHANNEL_MESSAGE_WITH_SOURCE: 4,
	DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
	DEFERRED_UPDATE_MESSAGE: 6,
	UPDATE_MESSAGE: 7,
	APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
	MODAL: 9
} as const;
// endregion

// region interaction callback flags
export const INTERACTION_CALLBACK_FLAGS = {
	EPHEMERAL: 1 << 6
} as const;
// endregion

// region component types
export const COMPONENT_TYPE = {
	ACTION_ROW: 1,
	BUTTON: 2,
	STRING_SELECT: 3,
	TEXT_INPUT: 4,
	USER_SELECT: 5,
	ROLE_SELECT: 6,
	MENTIONABLE_SELECT: 7,
	CHANNEL_SELECT: 8
} as const;
// endregion

// region button styles
export const BUTTON_STYLE = {
	PRIMARY: 1,
	SECONDARY: 2,
	SUCCESS: 3,
	DANGER: 4,
	LINK: 5
} as const;
// endregion

// region types
interface APIEndpoint {
	endpoint: string;
	method: string;
}

interface GatewayPayload {
	op: number;
	d?: unknown;
	s?: number | null;
	t?: string;
}

export interface SelectOption {
	label: string;
	value: string;
	description?: string;
	emoji?: { name: string; id?: string };
	default?: boolean;
}

export interface ActionRowComponent {
	type: typeof COMPONENT_TYPE.ACTION_ROW;
	components: Component[];
}

export interface ButtonComponent {
	type: typeof COMPONENT_TYPE.BUTTON;
	style: number;
	label?: string;
	emoji?: { name: string; id?: string };
	custom_id?: string;
	url?: string;
	disabled?: boolean;
}

export interface SelectMenuComponent {
	type: 3 | 5 | 6 | 7 | 8;
	custom_id: string;
	placeholder?: string;
	min_values?: number;
	max_values?: number;
	options?: SelectOption[];
	disabled?: boolean;
}

export type Component = ActionRowComponent | ButtonComponent | SelectMenuComponent;

export interface Embed {
	title?: string;
	description?: string;
	url?: string;
	timestamp?: string;
	color?: number;
	footer?: { text: string; icon_url?: string };
	image?: { url: string };
	thumbnail?: { url: string };
	author?: { name: string; url?: string; icon_url?: string };
	fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export interface MessagePayload {
	content?: string;
	embeds?: Embed[];
	components?: ActionRowComponent[];
	attachments?: unknown[];
}

export interface Attachment {
	filename: string;
	contentType: string;
	content: Buffer | string;
	description?: string;
}
// endregion

// region utility functions
function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function random(min: number, max: number): number {
	return Math.random() * (max - min) + min;
}

function format_endpoint(endpoint: string, ...params: string[]): string {
	let i = 0;
	return endpoint.replace(/%s/g, () => params[i++] ?? '');
}
// endregion

// region discord message
export class DiscordMessage {
	constructor(
		public discord: DiscordClient,
		public raw: Record<string, unknown>
	) {}

	get content(): string {
		return this.raw.content as string;
	}

	get channel_id(): string {
		return this.raw.channel_id as string;
	}

	get author_id(): string {
		return (this.raw.author as Record<string, unknown>).id as string;
	}

	async delete(): Promise<void> {
		await this.discord.delete_channel_message(this.raw.channel_id as string, this.raw.id as string);
	}

	async respond(message: string, attachments: Attachment[] | null = null): Promise<void> {
		const content: MessagePayload & { message_reference: unknown } = {
			content: message,
			message_reference: {
				message_id: this.raw.id,
				channel_id: this.raw.channel_id,
				guild_id: this.raw.guild_id,
				fail_if_not_exists: false
			}
		};

		if (Array.isArray(attachments))
			await this.discord.create_message_attachments(content, this.raw.channel_id as string, attachments);
		else
			await discord_api(API_ENDPOINT.CREATE_MESSAGE, content, this.raw.channel_id as string);
	}
}
// endregion

// region discord interaction
export class DiscordInteraction {
	deferred = false;

	constructor(
		public discord: DiscordClient,
		public raw: Record<string, unknown>
	) {}

	get name(): string {
		return (this.raw.data as Record<string, unknown>).name as string;
	}

	get type(): number {
		return this.raw.type as number;
	}

	get user_id(): string {
		const member = this.raw.member as Record<string, unknown> | undefined;
		const user = member?.user ?? this.raw.user;
		return (user as Record<string, unknown>).id as string;
	}

	get channel_id(): string {
		return this.raw.channel_id as string;
	}

	get guild_id(): string {
		return this.raw.guild_id as string;
	}

	get username(): string {
		const member = this.raw.member as Record<string, unknown> | undefined;
		const user = member?.user ?? this.raw.user;
		return (user as Record<string, unknown>).username as string;
	}

	get custom_id(): string | null {
		const data = this.raw.data as Record<string, unknown>;
		return (data.custom_id as string) ?? null;
	}

	get component_type(): number | null {
		const data = this.raw.data as Record<string, unknown>;
		return (data.component_type as number) ?? null;
	}

	get values(): string[] {
		const data = this.raw.data as Record<string, unknown>;
		return (data.values as string[]) ?? [];
	}

	get is_command(): boolean {
		return this.type === INTERACTION_TYPE.APPLICATION_COMMAND;
	}

	get is_component(): boolean {
		return this.type === INTERACTION_TYPE.MESSAGE_COMPONENT;
	}

	get is_modal_submit(): boolean {
		return this.type === INTERACTION_TYPE.MODAL_SUBMIT;
	}

	get_option(name: string): unknown | null {
		const data = this.raw.data as Record<string, unknown>;
		const options = data.options as Array<{ name: string; value: unknown }> | undefined;
		return options?.find(e => e.name === name)?.value ?? null;
	}

	get_option_by_type(type: number): Record<string, unknown> | undefined {
		const data = this.raw.data as Record<string, unknown>;
		const options = data.options as Array<Record<string, unknown>> | undefined;
		return options?.find(e => e.type === type);
	}

	async respond(message: string | MessagePayload = '', ephemeral = false): Promise<void> {
		if (this.deferred)
			return await this.edit(message);

		const response: Record<string, unknown> = {
			type: INTERACTION_CALLBACK_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
			data: {}
		};

		const data = response.data as Record<string, unknown>;

		if (typeof message === 'string') {
			if (message.length > 0)
				data.content = message;
		} else {
			if (message.content) data.content = message.content;
			if (message.embeds) data.embeds = message.embeds;
			if (message.components) data.components = message.components;
		}

		if (ephemeral)
			data.flags = INTERACTION_CALLBACK_FLAGS.EPHEMERAL;

		await discord_api(
			API_ENDPOINT.INTERACTION_RESPONSE,
			response,
			this.raw.id as string,
			this.raw.token as string
		);
	}

	async edit(message: string | MessagePayload = ''): Promise<void> {
		const body: Record<string, unknown> = {};

		if (typeof message === 'string') {
			body.content = message;
		} else {
			if (message.content !== undefined) body.content = message.content;
			if (message.embeds) body.embeds = message.embeds;
			if (message.components) body.components = message.components;
		}

		await discord_api(
			API_ENDPOINT.EDIT_INTERACTION_RESP,
			body,
			this.discord.user_id,
			this.raw.token as string
		);
	}

	async update(message: string | MessagePayload = ''): Promise<void> {
		const response: Record<string, unknown> = {
			type: INTERACTION_CALLBACK_TYPE.UPDATE_MESSAGE,
			data: {}
		};

		const data = response.data as Record<string, unknown>;

		if (typeof message === 'string') {
			if (message.length > 0)
				data.content = message;
		} else {
			if (message.content !== undefined) data.content = message.content;
			if (message.embeds) data.embeds = message.embeds;
			if (message.components) data.components = message.components;
		}

		await discord_api(
			API_ENDPOINT.INTERACTION_RESPONSE,
			response,
			this.raw.id as string,
			this.raw.token as string
		);
	}

	async defer(ephemeral = false): Promise<void> {
		const response: Record<string, unknown> = {
			type: INTERACTION_CALLBACK_TYPE.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
		};

		if (ephemeral)
			response.data = { flags: INTERACTION_CALLBACK_FLAGS.EPHEMERAL };

		await discord_api(
			API_ENDPOINT.INTERACTION_RESPONSE,
			response,
			this.raw.id as string,
			this.raw.token as string
		);
		this.deferred = true;
	}

	async defer_update(): Promise<void> {
		const response = { type: INTERACTION_CALLBACK_TYPE.DEFERRED_UPDATE_MESSAGE };
		await discord_api(
			API_ENDPOINT.INTERACTION_RESPONSE,
			response,
			this.raw.id as string,
			this.raw.token as string
		);
		this.deferred = true;
	}
}
// endregion

// region discord client
type DiscordEventMap = {
	ready: [];
	message: [DiscordMessage];
	interaction: [DiscordInteraction];
};

type DiscordEventHandler<K extends keyof DiscordEventMap> = (...args: DiscordEventMap[K]) => void;

export class DiscordClient {
	private intents: number;

	private connecting = false;
	private connected = false;
	ready = false;

	private heartbeat: Timer | null = null;
	private heartbeat_interval = 0;
	private heartbeat_ack = false;

	private gateway_url = '';
	private socket: WebSocket | null = null;

	private sequence: number | null = null;
	private session_id = '';
	user_id = '';

	private event_handlers: Map<keyof DiscordEventMap, Set<DiscordEventHandler<keyof DiscordEventMap>>> = new Map();

	constructor(intents: number) {
		this.intents = intents;
	}

	on<K extends keyof DiscordEventMap>(event: K, handler: DiscordEventHandler<K>): void {
		if (!this.event_handlers.has(event))
			this.event_handlers.set(event, new Set());
		this.event_handlers.get(event)!.add(handler as DiscordEventHandler<keyof DiscordEventMap>);
	}

	private emit<K extends keyof DiscordEventMap>(event: K, ...args: DiscordEventMap[K]): void {
		const handlers = this.event_handlers.get(event);
		if (handlers) {
			for (const handler of handlers)
				(handler as DiscordEventHandler<K>)(...args);
		}
	}

	async connect(should_delay = false): Promise<void> {
		if (this.connecting || this.connected)
			return;

		this.connecting = true;
		this.connected = false;
		this.ready = false;

		if (should_delay) {
			console.log(`[discord] Connecting to gateway in ${RECONNECT_DELAY}ms`);
			await delay(RECONNECT_DELAY);
		}

		if (this.gateway_url === '') {
			const res = await discord_api(API_ENDPOINT.GATEWAY) as { url: string };
			console.log(`[discord] Received gateway host: ${res.url}`);
			this.set_gateway_url(res.url);
		} else {
			console.log(`[discord] Using cached gateway host: ${this.gateway_url}`);
		}

		console.log(`[discord] Connecting to gateway: ${this.gateway_url}`);
		this.socket = new WebSocket(this.gateway_url);

		this.socket.addEventListener('error', () => this.on_socket_error());
		this.socket.addEventListener('open', () => this.on_socket_connection());
		this.socket.addEventListener('message', (event) => this.on_socket_data(event.data));
		this.socket.addEventListener('close', (event) => this.on_socket_close(event.code));
	}

	private on_socket_error(): void {
		this.gateway_url = '';
	}

	private async on_socket_close(code: number): Promise<void> {
		const code_name = SOCKET_CODE_NAMES[code] ?? `UNKNOWN [${code}]`;
		console.error(`[discord] Disconnected from gateway: ${code_name}`);

		if (this.heartbeat)
			clearTimeout(this.heartbeat);

		this.connected = false;
		this.connecting = false;
		this.ready = false;

		if (code === SOCKET_CODE.UNKNOWN_ERR || code === SOCKET_CODE.CLIENT_RECONNECT || (code >= 1000 && code <= 1999)) {
			if (code === SOCKET_CODE.UNKNOWN_ERR)
				console.error('[discord] Unknown gateway error, reconnecting');
			this.connect(true);
		} else if (code === SOCKET_CODE.INVALID_SEQUENCE || code === SOCKET_CODE.SESSION_TIMED_OUT) {
			console.error('[discord] Invalid sequence/session, scrubbing cached session');
			this.sequence = null;
			this.session_id = '';
			this.connect(true);
		} else {
			console.error(`[discord] Not reconnecting due to gateway code: ${code_name}`);
		}
	}

	private on_socket_connection(): void {
		this.connected = true;
		this.connecting = false;
	}

	private async on_socket_data(data: string | Buffer): Promise<void> {
		let parsed: GatewayPayload;

		if (typeof data === 'string')
			parsed = JSON.parse(data);
		else
			parsed = JSON.parse(new TextDecoder().decode(data));

		if (parsed.s !== null && parsed.s !== undefined)
			this.sequence = parsed.s;

		if (parsed.op === OPCODE.DISPATCH)
			this.handle_dispatch(parsed.t!, parsed.d);
		else
			this.handle_opcode(parsed.op, parsed.d);
	}

	private handle_opcode(opcode: number, data: unknown): void {
		switch (opcode) {
			case OPCODE.HELLO:
				this.handle_opcode_hello(data as { heartbeat_interval: number });
				break;
			case OPCODE.HEARTBEAT:
				this.send_heartbeat();
				break;
			case OPCODE.HEARTBEAT_ACK:
				this.heartbeat_ack = true;
				break;
			case OPCODE.INVALID_SESSION:
				this.handle_opcode_invalid_session();
				break;
			case OPCODE.RECONNECT:
				console.log('[discord] Reconnecting as requested by gateway');
				this.socket?.close(SOCKET_CODE.CLIENT_RECONNECT);
				break;
			default:
				console.log(`[discord] Unhandled opcode: ${OPCODE_NAMES[opcode] ?? opcode}`);
		}
	}

	private handle_dispatch(event_name: string, data: unknown): void {
		switch (event_name) {
			case 'READY':
				this.handle_event_ready(data as { session_id: string; user: { id: string } });
				break;
			case 'RESUMED':
				this.ready = true;
				console.log(`[discord] Resumed session: ${this.session_id}`);
				this.emit('ready');
				break;
			case 'MESSAGE_CREATE':
				this.handle_event_message_create(data as Record<string, unknown>);
				break;
			case 'INTERACTION_CREATE':
				this.handle_event_interaction_create(data as Record<string, unknown>);
				break;
		}
	}

	private handle_opcode_hello(data: { heartbeat_interval: number }): void {
		this.heartbeat_interval = data.heartbeat_interval;
		this.heartbeat_ack = true;
		this.heartbeat = setTimeout(() => this.send_heartbeat(), this.heartbeat_interval * Math.random());

		if (this.session_id !== '' && this.sequence !== null) {
			this.send_payload(OPCODE.RESUME, {
				token: DISCORD_TOKEN,
				session_id: this.session_id,
				seq: this.sequence
			});
		} else {
			this.identify();
		}
	}

	private async handle_opcode_invalid_session(): Promise<void> {
		await delay(random(1, 5) * 1000);
		this.identify();
	}

	private handle_event_ready(data: { session_id: string; user: { id: string } }): void {
		this.session_id = data.session_id;
		this.user_id = data.user.id;
		this.ready = true;
		console.log(`[discord] Started new session: ${this.session_id}`);
		this.emit('ready');
	}

	private handle_event_message_create(data: Record<string, unknown>): void {
		if ((data.author as Record<string, unknown>).id === this.user_id)
			return;
		this.emit('message', new DiscordMessage(this, data));
	}

	private handle_event_interaction_create(data: Record<string, unknown>): void {
		this.emit('interaction', new DiscordInteraction(this, data));
	}

	set_presence(name: string, type: number): void {
		if (!this.ready)
			return;

		this.send_payload(OPCODE.PRESENCE_UPDATE, {
			activities: [{ name, type }],
			status: 'online',
			afk: false,
			since: null
		});
	}

	private identify(): void {
		this.send_payload(OPCODE.IDENTIFY, {
			token: DISCORD_TOKEN,
			properties: {
				os: process.platform,
				browser: 'spooderverse',
				device: 'spooderverse'
			},
			compress: false,
			intents: this.intents
		});
	}

	private send_heartbeat(): void {
		if (!this.connected)
			return;

		if (!this.heartbeat_ack) {
			console.error('[discord] No heartbeat acknowledgement received, reconnecting');
			this.socket?.close(SOCKET_CODE.CLIENT_RECONNECT);
			return;
		}

		if (this.heartbeat)
			clearTimeout(this.heartbeat);

		this.heartbeat_ack = false;
		this.send_payload(OPCODE.HEARTBEAT, this.sequence, false);
		this.heartbeat = setTimeout(() => this.send_heartbeat(), this.heartbeat_interval);
	}

	async send_message(
		channel_id: string,
		message: string | MessagePayload,
		attachments?: Attachment[]
	): Promise<unknown> {
		if (!this.ready)
			return null;

		const body: MessagePayload = typeof message === 'string'
			? { content: message }
			: message;

		if (attachments?.length)
			return await this.create_message_attachments(body, channel_id, attachments);

		return await discord_api(API_ENDPOINT.CREATE_MESSAGE, body, channel_id);
	}

	async create_message_attachments(
		body: MessagePayload,
		channel_id: string,
		attachments: Attachment[],
		action: APIEndpoint = API_ENDPOINT.CREATE_MESSAGE,
		action_params: string[] = []
	): Promise<unknown> {
		const endpoint = format_endpoint(action.endpoint, channel_id, ...action_params);

		const form_data = new FormData();

		const attachments_meta: Array<{ id: number; description?: string; filename: string }> = [];
		for (let i = 0; i < attachments.length; i++) {
			const attachment = attachments[i];
			const content = typeof attachment.content === 'string'
				? attachment.content
				: new Uint8Array(attachment.content);
			const blob = new Blob([content], { type: attachment.contentType });
			form_data.append(`files[${i}]`, blob, attachment.filename);
			attachments_meta.push({
				id: i,
				description: attachment.description,
				filename: attachment.filename
			});
		}

		const payload_body = { ...body, attachments: attachments_meta };
		form_data.append('payload_json', JSON.stringify(payload_body));

		const response = await fetch(DISCORD_API + endpoint, {
			method: action.method,
			headers: BOT_TOKEN_HEADER,
			body: form_data
		});

		return await response.json();
	}

	async get_channel_message(channel_id: string, message_id: string): Promise<unknown> {
		if (!this.ready)
			return null;
		return await discord_api(API_ENDPOINT.GET_CHANNEL_MESSAGE, null, channel_id, message_id);
	}

	async delete_channel_message(channel_id: string, message_id: string): Promise<unknown> {
		if (!this.ready)
			return null;
		return await discord_api(API_ENDPOINT.DELETE_MESSAGE, null, channel_id, message_id);
	}

	async get_reaction(channel_id: string, message_id: string, emoji: { name: string; id?: string }): Promise<unknown> {
		const emoji_id = encodeURI(emoji.id ? emoji.name + ':' + emoji.id : emoji.name);
		return await discord_api(API_ENDPOINT.GET_REACTIONS, null, channel_id, message_id, emoji_id);
	}

	private send_payload(opcode: number, data?: unknown, log_payload = true): void {
		const opcode_name = OPCODE_NAMES[opcode] ?? `UNKNOWN [${opcode}]`;

		if (!this.connected) {
			console.error(`[discord] Failed to send ${opcode_name}, socket not connected`);
			return;
		}

		const payload: GatewayPayload = { op: opcode };
		if (data !== undefined)
			payload.d = data;

		const json = JSON.stringify(payload);
		const byte_size = Buffer.byteLength(json);

		if (byte_size > MAX_PAYLOAD_SIZE) {
			console.error(`[discord] Payload ${opcode_name} exceeds max size: ${byte_size} > ${MAX_PAYLOAD_SIZE}`);
			return;
		}

		if (log_payload)
			console.log(`[discord] Sending ${opcode_name} (${byte_size} bytes)`);

		this.socket?.send(json);
	}

	private set_gateway_url(url: string): void {
		const parsed = new URL(url);
		parsed.search = GATEWAY_PARAMETERS;
		this.gateway_url = parsed.toString();
	}
}
// endregion

// region api
async function discord_api(action: APIEndpoint, body: unknown = null, ...params: string[]): Promise<unknown> {
	const endpoint = format_endpoint(action.endpoint, ...params);
	const url = DISCORD_API + endpoint;

	const options: RequestInit = {
		method: action.method,
		headers: {
			...BOT_TOKEN_HEADER,
			'Content-Type': 'application/json'
		}
	};

	if (body !== null)
		options.body = JSON.stringify(body);

	const response = await fetch(url, options);
	const text = await response.text();

	console.log(`[discord] ${action.method} ${endpoint} [${response.status}]`);

	if (!text)
		return null;

	return JSON.parse(text);
}
// endregion

// region connect
export async function discord_connect(intents: number = INTENTS.GUILDS | INTENTS.GUILD_MESSAGES): Promise<DiscordClient> {
	const client = new DiscordClient(intents);
	await client.connect();
	return client;
}
// endregion

// region component builders
export function create_action_row(...components: Component[]): ActionRowComponent {
	return {
		type: COMPONENT_TYPE.ACTION_ROW,
		components
	};
}

export function create_select_menu(options: {
	custom_id: string;
	placeholder?: string;
	min_values?: number;
	max_values?: number;
	options: SelectOption[];
	disabled?: boolean;
}): SelectMenuComponent {
	return {
		type: COMPONENT_TYPE.STRING_SELECT,
		custom_id: options.custom_id,
		placeholder: options.placeholder,
		min_values: options.min_values ?? 0,
		max_values: options.max_values ?? 1,
		options: options.options,
		disabled: options.disabled
	};
}

export function create_button(options: {
	custom_id?: string;
	label?: string;
	style: number;
	url?: string;
	emoji?: { name: string; id?: string };
	disabled?: boolean;
}): ButtonComponent {
	return {
		type: COMPONENT_TYPE.BUTTON,
		style: options.style,
		label: options.label,
		custom_id: options.custom_id,
		url: options.url,
		emoji: options.emoji,
		disabled: options.disabled
	};
}
// endregion
