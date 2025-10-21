<p align="center"><img src="https://github.com/Kruithne/spooder/raw/main/docs/project-logo.png"/></p>

# spooderverse &middot; ![typescript](https://img.shields.io/badge/language-typescript-blue) [![license badge](https://img.shields.io/github/license/Kruithne/spooder?color=yellow)](LICENSE) ![bun](https://img.shields.io/badge/runtime-bun-f9f1e1)

`spooder`, which you can [find here](https://github.com/Kruithne/spooder), is a purpose-built server solution that shifts away from the dependency hell of the Node.js ecosystem.

`spooderverse` is a collection of drop-in modules designed for spooder with minimal overhead and zero dependencies.

## Usage
You *could* install this package as a dependency, and then import the modules directly.

```bash
bun add github:kruithne/spooderverse
```

```ts
import { pop3_login } from 'spooderverse/pop3';
```

The intended way for this project to be used is much simpler: take the module you want and drop it into your project. If you want to use the POP3 module, simply copy `pop3.ts` into your project and use it.

## Modules

- [modules/pop3.ts](#pop3) - POP3 mailbox API.

<a id="pop3"></a>
## Module :: POP3

```ts
pop3_connect(host: string, port: number): Promise<POP3Client>
pop3_login(client: POP3Client, username: string, password: string): Promise<boolean>
pop3_stat(client: POP3Client): Promise<POP3StatResult>
pop3_list(client: POP3Client, msg_number?: number): Promise<POP3ListResult>
pop3_get_count(client: POP3Client): Promise<number>
pop3_get_message(client: POP3Client, msg_number: number): Promise<string>
pop3_delete_message(client: POP3Client, msg_number: number): Promise<void>
pop3_quit(client: POP3Client): Promise<boolean | void>
pop3_iterator(client: POP3Client): AsyncGenerator<string>
pop3_set_timeout(timeout: number): void;
```

```ts
try {
	const client = await pop3_connect(POP3_HOST, POP3_PORT);
	await pop3_login(client, 'email', 'pwd');

	const { count, messages } = await pop3_list(client);

	for (const msg_number of messages.keys()) {
		const message = await pop3_get_message(client, msg_number);
		await pop3_delete_message(client, msg_number);
	}
} catch (e) {
	// handle errors
} finally {
	await pop3_quit(client);
}
```

## Legal
This software is provided as-is with no warranty or guarantee. The authors of this project are not responsible or liable for any problems caused by using this software or any part thereof. Use of this software does not entitle you to any support or assistance from the authors of this project.

The code in this repository is licensed under the ISC license. See the [LICENSE](LICENSE) file for more information.