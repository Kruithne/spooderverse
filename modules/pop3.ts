/*!
	spooderverse/pop3 (https://github.com/Kruithne/spooderverse)
	Authors: Kruithne <kruithne@gmail.com>
	License: ISC
 */

import tls from 'node:tls';
import { ErrorWithMetadata, filesize, log } from 'spooder';

// MARK: :pop3
interface POP3Client {
	socket: tls.TLSSocket;
	state: POP3ConnectionState;
	locked: boolean;
	auth_user: string;
	host: string;
	port: number;
	data: Record<string, any>;
}

interface POP3StatResult {
	count: number;
	octets: number;
}

interface POP3ListResult {
	count: number;
	messages: Map<number, number>;
}

interface POP3CommandResult {
	success: boolean;
	data: string;
}

const POP3_TIMEOUT = 30000;

enum POP3ConnectionState {
	DISCONNECTED = 0,
	CONNECTED = 1,
	AUTHENTICATED = 2
}

async function pop3_timeout_promise<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: NodeJS.Timeout|null = null;

	try {
		return await Promise.race([
			promise,
			new Promise<T>((_resolve, reject) => {
				timer = setTimeout(() => reject(new Error('Operation timed out')), ms);
			})
		]);
	} finally {
		if (timer !== null)
			clearTimeout(timer);
	}
}

async function pop3_create_socket(host: string, port: number): Promise<tls.TLSSocket> {
	const socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
		const tlsSocket = tls.connect({
			host,
			port,
			rejectUnauthorized: true
		}, () => {
			resolve(tlsSocket);
		});

		tlsSocket.on('error', reject);
	});

	return socket;
}

async function pop3_execute_command(client: POP3Client, command: string, argument?: string, multiline: boolean = false): Promise<POP3CommandResult> {
	if (client.locked)
		throw new Error(`pop3 ${command} failed: client locked`);

	client.locked = true;

	try {
		let cmd_text = command;
		if (argument !== undefined)
			cmd_text = `${cmd_text} ${argument}\r\n`;
		else
			cmd_text = `${cmd_text}\r\n`;
		
		client.socket.write(cmd_text);
		
		const result = await pop3_read_response(client.socket, multiline);
		client.locked = false;
		
		if (!result.success)
			throw new ErrorWithMetadata('pop3 command failed', { command, result: result.data });
		
		return result;
	} finally {
		client.locked = false;
	}
}

async function pop3_read_response(socket: tls.TLSSocket, multiline: boolean = false): Promise<POP3CommandResult> {
	return new Promise((resolve, reject) => {
		let buffer = '';
		let response_ok: boolean | null = null;
		let checking_resp = true;
		
		const onData = (data: Buffer) => {
			const chunk = data.toString('ascii');
			buffer += chunk;
			
			if (checking_resp) {
				if (buffer.startsWith('+OK')) {
					checking_resp = false;
					response_ok = true;
				} else if (buffer.startsWith('-ERR')) {
					checking_resp = false;
					response_ok = false;
				} else if (!multiline) {
					checking_resp = false;
					response_ok = true;
				}
			}
			
			if (!checking_resp) {
				if (multiline && (response_ok === false || buffer.endsWith('\r\n.\r\n'))) {
					socket.removeListener('data', onData);
					resolve({ success: response_ok!, data: buffer });
				} else if (!multiline) {
					socket.removeListener('data', onData);
					resolve({ success: response_ok!, data: buffer });
				}
			}
		};
		
		socket.on('data', onData);
	});
}

function pop3_assert_state(client: POP3Client, state: POP3ConnectionState) {
	if (client.state !== state)
		throw new ErrorWithMetadata('pop3 invalid state', { expected: state, actual: client.state });
}

export async function pop3_connect(host: string, port: number): Promise<POP3Client> {
	const socket = await pop3_timeout_promise(pop3_create_socket(host, port), POP3_TIMEOUT);
	const client = {
		socket,
		state: POP3ConnectionState.DISCONNECTED,
		locked: false,
		auth_user: '',
		host,
		port,
		data: {}
	};
	
	socket.on('error', (err) => {
		log('pop3', 'socket error: {%s}', err.message);
		throw new Error(err);
	});
	
	socket.on('end', () => {
		client.state = POP3ConnectionState.DISCONNECTED;
	});
	
	socket.on('close', () => {
		log('pop3', 'connection closed');
	});
	
	const response = await pop3_timeout_promise(pop3_read_response(socket), POP3_TIMEOUT);
	if (!response.success)
		throw new ErrorWithMetadata(`pop3 connection failed`, { response });
	
	client.state = POP3ConnectionState.CONNECTED;
	log('pop3', 'connected to {%s}:{%s}', host, port);
	
	return client;
}

export async function pop3_login(client: POP3Client, username: string, password: string): Promise<boolean> {
	pop3_assert_state(client, POP3ConnectionState.CONNECTED);
	
	await pop3_execute_command(client, 'USER', username);
	await pop3_execute_command(client, 'PASS', password);
	
	client.state = POP3ConnectionState.AUTHENTICATED;
	client.auth_user = username;
	log('pop3', 'authenticated as {%s}', username);
	
	return true;
}

export async function pop3_stat(client: POP3Client): Promise<POP3StatResult> {
	pop3_assert_state(client, POP3ConnectionState.AUTHENTICATED);
	
	const result = await pop3_execute_command(client, 'STAT');
	const parts = result.data.split(' ');
	
	return {
		count: parseInt(parts[1].trim(), 10),
		octets: parseInt(parts[2].trim(), 10)
	};
}

export const pop3_list = async (client: POP3Client, msg_number?: number): Promise<POP3ListResult> => {
	pop3_assert_state(client, POP3ConnectionState.AUTHENTICATED);

	const use_multiline = msg_number === undefined;
	const result = await pop3_execute_command(client, 'LIST', msg_number?.toString(), use_multiline);

	const messages = new Map<number, number>();
	let count = 0;

	if (msg_number !== undefined) {
		// single message
		const parts = result.data.split(' ');
		messages.set(parseInt(parts[1], 10), parseInt(parts[2], 10));
		count = 1;
	} else {
		const start_offset = result.data.indexOf('\r\n') + 2;
		const end_offset = result.data.indexOf('\r\n.\r\n');

		if (end_offset > start_offset) {
			const list_data = result.data.substring(start_offset, end_offset);
			const lines = list_data.split('\r\n');

			for (const line of lines) {
				const parts = line.split(' ');
				if (parts.length >= 2) {
					messages.set(parseInt(parts[0], 10), parseInt(parts[1], 10));
					count++;
				}
			}
		}
	}

	return { count, messages };
}

export async function pop3_get_count(client: POP3Client): Promise<number> {
	const stat = await pop3_stat(client);
	return stat.count;
}

export async function pop3_get_message(client: POP3Client, msg_number: number): Promise<string> {
	pop3_assert_state(client, POP3ConnectionState.AUTHENTICATED);
	
	const result = await pop3_execute_command(client, 'RETR', msg_number.toString(), true);

	const start_offset = result.data.indexOf('\r\n') + 2;
	const end_offset = result.data.indexOf('\r\n.\r\n');
	const message = result.data.substring(start_offset, end_offset);
	
	log('pop3', 'retrieved message {%s} [{%s}] ({%s})', msg_number, client.auth_user, filesize(message.length));
	
	return message;
}

export async function pop3_delete_message(client: POP3Client, msg_number: number): Promise<void> {
	pop3_assert_state(client, POP3ConnectionState.AUTHENTICATED);
	
	await pop3_execute_command(client, 'DELE', msg_number.toString());
}

export async function pop3_quit(client: POP3Client): Promise<boolean | void> {
	if (client.state === POP3ConnectionState.DISCONNECTED)
		return;

	try {
		await pop3_execute_command(client, 'QUIT');
	} finally {
		client.socket.end();
		client.state = POP3ConnectionState.DISCONNECTED;
	}
};

export async function* pop3_iterator(client: POP3Client): AsyncGenerator<string> {
	pop3_assert_state(client, POP3ConnectionState.AUTHENTICATED);

	const { count, messages } = await pop3_list(client);

	if (count === 0)
		return;

	for (const msg_number of messages.keys()) {
		const message = await pop3_get_message(client, msg_number);
		await pop3_delete_message(client, msg_number);

		yield message;
	}
}