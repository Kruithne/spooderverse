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
- [modules/obj_rds.ts](#obj-rds) - Rubber Duck Solutions CDN API.

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

<a id="obj-rds"></a>
## Module :: RDS Object Storage

> [!IMPORTANT]
> This API integrates with a third-party service. You will need to create an account with the provider, obtain authentication credentials, and may be subject to their pricing and terms of service.

```ts
set_hmac_algorithm(alg: string);
bucket(bucket_id: string, bucket_secret: string): <ObjectBucket>;

type UploadInput = BunFile | string | Buffer | ArrayBuffer | Uint8Array;

type UploadOptions = {
	chunk_size?: number;
	retry_count?: number;
	queue_size?: number;
	content_type?: string;
	filename?: string;
};

// standard API
ObjectBucket.upload(input: UploadInput, options?: UploadOptions): Promise<ObjectID|null>;
ObjectBucket.url(object_id: string): string;
ObjectBucket.download(object_id: string): Promise<Response>;
ObjectBucket.presign(object_id: string, expires?: number, action?: string): string;
ObjectBucket.stat(object_id?: string): Promise<BucketStats | ObjectStats | null>;
ObjectBucket.delete(object_id: string): Promise<boolean>;
ObjectBucket.list(offset?: number, page_size?: number): Promise<ListResult | null>;

// advanced
ObjectBucket.action(action: string, params = {}): Promise<Response>;
ObjectBucket.provision(filename: string, content_type: string, size: number): Promise<ObjectID|null>;
ObjectBucket.finalize(object_id: string, checksum?: string): Promise<boolean>;
```

```ts
import * as obj_rds from 'obj_rds.ts';

const bucket = obj_rds.bucket('my_bucket', 'my_bucket_secret');

// upload file
const file = Bun.file('./duck_picture.jpg');
const obj_id = await bucket.upload(file);
// > 13a10c56-5a28-4a47-8ca0-7070fc1233ba

// download file
const res = await bucket.download(obj_id);
if (res.ok)
	Bun.write('./duck_copy.jpg', res);

// public URL
bucket.url(obj_id);

// presigned URL (24 hours, access only)
bucket.presign(obj_id);

// get bucket statistics
const stats = await bucket.stat();
// > { size: 1048576, files: 42 }

// get object metadata
const metadata = await bucket.stat(obj_id);
// > { filename: "duck_picture.jpg", size: 1024, content_type: "image/jpeg", created: 1234567890 }

// delete object
await bucket.delete(obj_id);

// list objects (paginated)
const list = await bucket.list(0, 50);
// > { objects: [{ object_id: "...", filename: "...", size: X, content_type: "...", created: X }, ...] }
```

## Legal
This software is provided as-is with no warranty or guarantee. The authors of this project are not responsible or liable for any problems caused by using this software or any part thereof. Use of this software does not entitle you to any support or assistance from the authors of this project.

The code in this repository is licensed under the ISC license. See the [LICENSE](LICENSE) file for more information.