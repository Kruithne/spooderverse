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
- [modules/smtp.ts](#smtp) - SMTP mailing API.
- [modules/mail.ts](#mail) - Mail utilities.
- [modules/users.ts](#users) - User Management System
- [modules/paypal.ts](#paypal) - PayPal API for orders and subscriptions.
- [modules/discord.ts](#discord) - Discord bot gateway and REST API.

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
admin(user_name: string, user_secret: string): <Admin>;

type UploadInput = BunFile | string | Buffer | ArrayBuffer | Uint8Array;

type UploadOptions = {
	chunk_size?: number;
	retry_count?: number;
	queue_size?: number;
	content_type?: string;
	filename?: string;
	object_id?: string;
};

// bucket API
ObjectBucket.upload(input: UploadInput, options?: UploadOptions): Promise<ObjectID|null>;
ObjectBucket.url(object_id: string): string;
ObjectBucket.download(object_id: string): Promise<Response>;
ObjectBucket.presign(object_id: string, expires?: number, action?: string): string;
ObjectBucket.stat(object_id?: string): Promise<BucketStats | ObjectStats | null>;
ObjectBucket.delete(object_id: string): Promise<boolean>;
ObjectBucket.list(offset?: number, page_size?: number): Promise<ListResult | null>;

// bucket API (advanced)
ObjectBucket.action(action: string, params = {}): Promise<Response>;
ObjectBucket.provision(filename: string, content_type: string, size: number, object_id?: string): Promise<ObjectID|null>;
ObjectBucket.finalize(object_id: string, checksum?: string): Promise<boolean>;

// admin API
Admin.create_bucket(bucket_id: string, is_public?: boolean): Promise<{ bucket_id: string, secret: string } | null>;
Admin.delete_bucket(bucket_id: string): Promise<boolean>;
Admin.list_buckets(): Promise<ListBucketsResult | null>;
Admin.action(action: string, params = {}): Promise<Response>;
```

```ts
import * as obj_rds from 'obj_rds.ts';

const bucket = obj_rds.bucket('my_bucket', 'my_bucket_secret');

// upload file
const file = Bun.file('./duck_picture.jpg');
const obj_id = await bucket.upload(file);
// > 13a10c56-5a28-4a47-8ca0-7070fc1233ba

// upload with custom object ID (alphanumeric, underscore, hyphen; max 128 chars)
const custom_id = 'my-custom-object-id_123';
const obj_id_custom = await bucket.upload(file, { object_id: custom_id });
// > my-custom-object-id_123
// returns null with 409 status if object_id already exists in bucket

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

```ts
import * as obj_rds from 'obj_rds.ts';

const adm = obj_rds.admin('my_user', 'my_user_secret');

// create a new bucket (private by default)
const result = await adm.create_bucket('my-new-bucket');
// > { bucket_id: 'my-new-bucket', secret: '7af4c4b7d9515230...' }
// returns null with 409 status if bucket_id already exists

// create a public bucket (objects accessible without signed URLs)
const public_bucket = await adm.create_bucket('my-public-bucket', true);

// use the new bucket
const bucket = obj_rds.bucket(result.bucket_id, result.secret);
await bucket.upload(Bun.file('./image.png'));

// delete bucket and all its contents (only creator can delete)
await adm.delete_bucket('my-new-bucket');
// > true

// list all buckets owned by this user
const buckets = await adm.list_buckets();
// > { buckets: [{ bucket_id: "...", secret: "...", is_public: 0, total_size: 1024, total_files: 5 }, ...] }
```

<a id="smtp"></a>
## Module :: SMTP

```ts
smtp_send(config: SMTPSendConfig): Promise<SMTPResponse>
smtp_create_mailer(uri: string): Mailer

type SMTPMessage = {
	from: string;
	to: string;
	cc?: string;
	bcc?: string;
	subject: string;
	text?: string;
	html?: string;
};

type SMTPSendConfig = {
	uri: string;
} & SMTPMessage;

type SMTPResponse = {
	accepted: string[];
	rejected: string[];
	response: string;
	message_id: string;
};

type Mailer = {
	send(message: SMTPMessage): Promise<SMTPResponse>;
	close(): Promise<void>;
};
```

> [!NOTE]
> The connection URI format is `user:pass@host:port`. If your username or password contains special characters (such as `@`, `:`, or `$`), they must be URL-encoded. For example, a username of `user@example.com` should be encoded as `user%40example.com`.

```ts
import { smtp_send, smtp_create_mailer } from 'smtp.ts';

// one-off send
const result = await smtp_send({
	uri: 'user:pass@smtp.example.com:465',
	from: 'Sender Name <sender@example.com>',
	to: 'recipient@example.com',
	subject: 'test message',
	text: 'plain text body',
	html: '<p>html body</p>'
});
// > { accepted: ['recipient@example.com'], rejected: [], response: '250 OK', message_id: '<...>' }

// persistent mailer
const mailer = smtp_create_mailer('user:pass@smtp.example.com:465');

try {
	await mailer.send({
		from: 'Sender Name <sender@example.com>',
		to: 'recipient@example.com',
		cc: 'cc@example.com',
		bcc: 'bcc@example.com',
		subject: 'test message',
		html: '<p>html body</p>'
	});
} finally {
	await mailer.close();
}
```

<a id="mail"></a>
## Module :: Mail

```ts
type MailTemplateOptions = {
	base_html?: string;
	base_text?: string;
	html_template?: string;
	text_template?: string;
};

mail_template(options: MailTemplateOptions);
```

```ts
const template = await mail_template({
	base_html: './mail/base_template.html',
	base_text: './mail/base_template.txt',
	html_template: './mail/account_verify.html',
	text_template: './mail/account_verify.txt'
});

await smtp_send({
	// uri, to, from, etc.
	...template.parse({ code: 55535 })
});
```

> [!NOTE]
> `base_html` and `base_text` are optional for providing a standardized mail template (header, footer, etc). If provided, these should have a `{{ content }}` placeholder in them.

> [!NOTE]
> If `base_text` and `text_template` are omitted, the resulting `.text` will be an empty string. In contrast, if `base_html` and `html_template` are omitted, the resulting `.html` will match the output of `.text`.

<a id="users"></a>
## Module :: Users

The `Users` module provides a basic user management system that features login, registration, sessions, account recovery, account verification and a permission system.

While almost a drop-in module, `example.ts` and `schema.sql` have also been provided.

> [!IMPORTANT]
> An `SQL` instance has been hard-coded into the module which needs to be replaced with a proper import for your own database instance.

```ts
// session management
revoke_user_session(req: Request): void
start_user_session(req: Request, user_id: number): Promise<Response>
refresh_user_sessions(...user_ids: number[]): Promise<void>
refresh_user_session(session_id: string): Promise<void>
end_user_session(session_id: string): Promise<void>
get_session(session_id: string|null): Promise<UserSession|null>

// account management
get_user_presence(user_id: number): Promise<{ first_name: string, last_name: string }>
verify_login(email: string, password: string): Promise<[VerifyLoginResponse, number|null]>
email_in_use(email: string): Promise<boolean>
register_account(email: string, password: string, first_name: string, last_name: string): Promise<boolean|string>
has_permission_by_session(session: UserSession, permission: UserPermission): Promise<boolean>

// verification
get_user_verification_token(user_id: number): Promise<string|null>
check_verification_code(token: string, code: string): Promise<boolean|number>
send_verification_code(verify_token: string, force?: boolean): Promise<SendVerificationCodeResponse>

// password reset
reset_user_password(user_email_or_id: string|number): Promise<PasswordResetResponse>
apply_password_reset(token: string, new_password: string): Promise<PasswordResetResponse>
```

### OAuth Extension

The `Users` module includes OAuth support for third-party authentication (Google, Microsoft, etc). OAuth accounts are seamlessly integrated with the existing user system.

> [!IMPORTANT]
> OAuth providers must be configured in the `oauth_providers` database table. The `oauth_schema.sql` file includes Google and Microsoft entries with empty credentials that need to be filled in.

```ts
// provider management
get_oauth_provider(provider_name: string): Promise<OAuthProvider | null>
get_oauth_provider_by_id(provider_id: number): Promise<OAuthProvider | null>
oauth_get_providers(): Promise<{ providers: { id: number, provider_name: string }[] }>

// oauth flow
oauth_initiate_login(provider_name: string, redirect_uri: string): Promise<{ auth_url?: string, error?: string }>
oauth_callback(req: Request, code: string, state: string): Promise<Response | { error: string }>

// state token management (csrf protection)
generate_state_token(provider_id: number, redirect_uri: string): Promise<string>
validate_state_token(state: string): Promise<OAuthStateToken | null>
cleanup_expired_state_tokens(): Promise<void>

// account linking
find_oauth_account(provider_id: number, provider_user_id: string): Promise<OAuthAccount | null>
create_oauth_account(user_id: number, provider_id: number, provider_user_id: string): Promise<void>
is_oauth_account(user_id: number): Promise<boolean>

// advanced
build_authorization_url(provider: OAuthProvider, state: string, redirect_uri: string, scopes: string[]): string
exchange_code_for_token(provider: OAuthProvider, code: string, redirect_uri: string): Promise<{ access_token: string; id_token?: string } | null>
get_oauth_user_info(provider: OAuthProvider, access_token: string, id_token?: string): Promise<{ provider_user_id: string; email: string; given_name?: string; family_name?: string } | null>
```

```ts
import { oauth_initiate_login, oauth_callback } from 'oauth.ts';

// initiate oauth login
app.get('/login/google', async (req) => {
	const result = await oauth_initiate_login('google', 'https://example.com/auth/callback');

	if (result.auth_url)
		return Response.redirect(result.auth_url);

	return Response.json({ error: result.error });
});

// handle oauth callback
app.get('/auth/callback', async (req) => {
	const url = new URL(req.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');

	if (!code || !state)
		return Response.json({ error: 'missing_parameters' });

	const result = await oauth_callback(req, code, state);

	// oauth_callback returns Response on success, { error } on failure
	if (result instanceof Response)
		return result; // session started, cookies set

	return Response.json({ error: result.error });
});
```

<a id="paypal"></a>
## Module :: PayPal

> [!IMPORTANT]
> This API integrates with a third-party service. You will need to create an account with PayPal, obtain API credentials (Client ID and Secret), and may be subject to their pricing and terms of service.

> [!IMPORTANT]
> Configure the environment variables PAYPAL_CLIENT_ID and PAYPAL_SECRET.

```ts
// orders (v2 api)
paypal_create_order(options: CreateOrderOptions): Promise<{order_id: string; approval_url: string} | null>
paypal_capture_order(order_id: string): Promise<{success: boolean; transaction_id?: string; status?: string; details?: OrderResponse} | null>
paypal_get_order(order_id: string): Promise<OrderResponse | null>
paypal_refund_capture(capture_id: string, amount?: Money, note_to_payer?: string, invoice_id?: string, custom_id?: string): Promise<{success: boolean; refund_id?: string; status?: string; details?: RefundResponse} | null>

// subscriptions (v1 api)
paypal_create_subscription(request: CreateSubscriptionRequest): Promise<{subscription_id: string; approval_url: string; status: string} | null>
paypal_get_subscription(subscription_id: string): Promise<SubscriptionDetails | null>
paypal_update_subscription(subscription_id: string, patches: PatchRequest[]): Promise<boolean>
paypal_suspend_subscription(subscription_id: string, reason: string): Promise<boolean>
paypal_activate_subscription(subscription_id: string, reason: string): Promise<boolean>
paypal_cancel_subscription(subscription_id: string, reason: string): Promise<boolean>
paypal_revise_subscription(subscription_id: string, request: ReviseSubscriptionRequest): Promise<{approval_url: string; plan_id: string} | null>
paypal_capture_subscription_payment(subscription_id: string, note: string, amount: Money): Promise<{success: boolean; transaction_id?: string; status?: string; details?: CaptureSubscriptionResponse} | null>
paypal_get_subscription_transactions(subscription_id: string, start_time: string, end_time: string): Promise<SubscriptionTransactionsResponse | null>

// billing plans (v1 api)
paypal_create_billing_plan(request: CreateBillingPlanRequest): Promise<{plan_id: string; status: string} | null>
paypal_list_billing_plans(product_id?: string, plan_ids?: string[], page_size?: number, page?: number, total_required?: boolean): Promise<ListBillingPlansResponse | null>
paypal_get_billing_plan(plan_id: string): Promise<BillingPlanResponse | null>
paypal_update_billing_plan(plan_id: string, patches: PatchRequest[]): Promise<boolean>
paypal_activate_billing_plan(plan_id: string): Promise<boolean>
paypal_deactivate_billing_plan(plan_id: string): Promise<boolean>
paypal_update_plan_pricing(plan_id: string, request: UpdatePricingSchemesRequest): Promise<boolean>

// catalog products (v1 api)
paypal_create_catalog_product(request: CreateCatalogProductRequest): Promise<{product_id: string; type: string} | null>
paypal_get_catalog_product(product_id: string): Promise<CatalogProductResponse | null>

// webhooks (v1 api)
paypal_create_webhook(url: string, event_types: string[]): Promise<{webhook_id: string; url: string} | null>
paypal_list_webhooks(): Promise<WebhookResponse[] | null>
paypal_get_webhook(webhook_id: string): Promise<WebhookResponse | null>
paypal_update_webhook(webhook_id: string, patches: PatchRequest[]): Promise<boolean>
paypal_delete_webhook(webhook_id: string): Promise<boolean>
paypal_verify_webhook_signature(webhook_id: string, headers: Record<string, string>, body: string): Promise<boolean>
paypal_list_webhook_event_types(): Promise<AvailableEventType[] | null>

// invoicing (v2 api)
paypal_generate_invoice_number(): Promise<string | null>
paypal_create_draft_invoice(invoice: Invoice): Promise<Invoice | null>
paypal_get_invoice(invoice_id: string): Promise<Invoice | null>
paypal_list_invoices(page?: number, page_size?: number, total_required?: boolean): Promise<InvoiceSearchResponse | null>
paypal_search_invoices(search: InvoiceSearchRequest): Promise<InvoiceSearchResponse | null>
paypal_update_invoice(invoice_id: string, invoice: Invoice): Promise<Invoice | null>
paypal_send_invoice(invoice_id: string, notification?: SendInvoiceRequest): Promise<{href?: string} | null>
paypal_send_invoice_reminder(invoice_id: string, notification?: SendInvoiceRequest): Promise<boolean>
paypal_cancel_invoice(invoice_id: string, cancel_request: CancelInvoiceRequest): Promise<boolean>
paypal_delete_invoice(invoice_id: string): Promise<boolean>
paypal_record_invoice_payment(invoice_id: string, payment: RecordPaymentRequest): Promise<string | null>
paypal_delete_invoice_payment(invoice_id: string, transaction_id: string): Promise<boolean>
paypal_record_invoice_refund(invoice_id: string, refund: RecordRefundRequest): Promise<string | null>
paypal_delete_invoice_refund(invoice_id: string, transaction_id: string): Promise<boolean>
paypal_generate_invoice_qr_code(invoice_id: string, width?: number, height?: number): Promise<string | null>
```

```ts
import { paypal_create_order, paypal_capture_order } from 'paypal.ts';

// create an order
const order = await paypal_create_order({
	items: [{
		name: 'Premium Subscription',
		quantity: '1',
		unit_amount: { currency_code: 'USD', value: '29.99' }
	}],
	total_amount: '29.99',
	currency_code: 'USD',
	return_url: 'https://example.com/success',
	cancel_url: 'https://example.com/cancel'
});

if (order) {
	// redirect user to order.approval_url
	// > https://www.paypal.com/checkoutnow?token=...
}

// after user approves, capture the payment
const capture = await paypal_capture_order(order.order_id);
if (capture?.success) {
	// payment completed
	// > { success: true, transaction_id: '...', status: 'COMPLETED' }
}
```

```ts
import { paypal_create_subscription, paypal_get_subscription } from 'paypal.ts';

// create a subscription
const subscription = await paypal_create_subscription({
	plan_id: 'P-12345',
	subscriber: {
		name: { given_name: 'John', surname: 'Doe' },
		email_address: 'john@example.com'
	},
	application_context: {
		return_url: 'https://example.com/success',
		cancel_url: 'https://example.com/cancel'
	}
});

if (subscription) {
	// redirect user to subscription.approval_url
	// > { subscription_id: 'I-...', approval_url: 'https://...', status: 'APPROVAL_PENDING' }
}

// check subscription status
const details = await paypal_get_subscription(subscription.subscription_id);
// > { id: 'I-...', status: 'ACTIVE', billing_info: {...}, subscriber: {...} }
```

```ts
import { paypal_create_webhook, paypal_list_webhooks, paypal_verify_webhook_signature, paypal_list_webhook_event_types, paypal_delete_webhook } from 'paypal.ts';

// list available event types
const event_types = await paypal_list_webhook_event_types();
// > [{ name: 'PAYMENT.SALE.COMPLETED', description: '...' }, ...]

// create a webhook
const webhook = await paypal_create_webhook('https://example.com/webhook', [
	'PAYMENT.SALE.COMPLETED',
	'PAYMENT.SALE.REFUNDED',
	'BILLING.SUBSCRIPTION.CREATED',
	'BILLING.SUBSCRIPTION.CANCELLED'
]);
// > { webhook_id: '1WB...', url: 'https://example.com/webhook' }

// list all webhooks
const webhooks = await paypal_list_webhooks();
// > [{ id: '1WB...', url: 'https://...', event_types: [...] }]

// verify webhook signature (in your webhook handler)
app.post('/webhook', async (req) => {
	const is_valid = await paypal_verify_webhook_signature(
		'1WB...',
		req.headers,
		await req.text()
	);

	if (is_valid) {
		// process webhook event
		const event = await req.json();
		// > { event_type: 'PAYMENT.SALE.COMPLETED', resource: {...} }
	}
});

// delete webhook
await paypal_delete_webhook(webhook.webhook_id);
```

```ts
import { paypal_generate_invoice_number, paypal_create_draft_invoice, paypal_send_invoice, paypal_record_invoice_payment, paypal_generate_invoice_qr_code } from 'paypal.ts';

// generate next invoice number
const invoice_number = await paypal_generate_invoice_number();
// > '0001'

// create a draft invoice
const invoice = await paypal_create_draft_invoice({
	detail: {
		invoice_number: invoice_number,
		invoice_date: '2025-11-12',
		currency_code: 'USD',
		payment_term: {
			term_type: 'NET_30'
		}
	},
	invoicer: {
		business_name: 'My Business',
		email_address: 'business@example.com'
	},
	primary_recipients: [{
		business_name: 'Client Company',
		email_address: 'client@example.com'
	}],
	items: [
		{
			name: 'Web Development Services',
			quantity: '10',
			unit_amount: { currency_code: 'USD', value: '100.00' },
			unit_of_measure: 'HOURS'
		}
	]
});
// > { id: 'INV2-...', status: 'DRAFT', amount: { value: '1000.00' }, ... }

// send the invoice
await paypal_send_invoice(invoice.id, {
	subject: 'Invoice for services',
	note: 'Thank you for your business!'
});

// generate QR code for payment
const qr_code = await paypal_generate_invoice_qr_code(invoice.id, 200, 200);
// > 'iVBORw0KGgoAAAANS...' (base64 PNG image)

// record a payment
const payment_id = await paypal_record_invoice_payment(invoice.id, {
	method: 'CASH',
	payment_date: '2025-11-12',
	amount: { currency_code: 'USD', value: '500.00' },
	note: 'Partial payment received'
});
// > 'EXTR-...'

// search invoices
const results = await paypal_search_invoices({
	status: ['SENT', 'PARTIALLY_PAID'],
	invoice_date_range: {
		start: '2025-01-01',
		end: '2025-12-31'
	}
});
// > { items: [{ id: 'INV2-...', status: 'SENT', ... }], total_items: 5 }
```

<a id="discord"></a>
## Module :: Discord

Discord bot gateway client with WebSocket connection management, automatic reconnection, and REST API support.

> [!IMPORTANT]
> Configure the environment variable DISCORD_TOKEN with your bot token.

```ts
// connect
discord_connect(intents?: number): Promise<DiscordClient>

// client
DiscordClient.on(event: 'ready' | 'message' | 'interaction', handler): void
DiscordClient.send_message(channel_id: string, message: string | MessagePayload, attachments?: Attachment[]): Promise<unknown>
DiscordClient.get_channel_message(channel_id: string, message_id: string): Promise<unknown>
DiscordClient.delete_channel_message(channel_id: string, message_id: string): Promise<unknown>
DiscordClient.get_reaction(channel_id: string, message_id: string, emoji: { name: string; id?: string }): Promise<unknown>
DiscordClient.set_presence(name: string, type: number): void

// message class
DiscordMessage.content: string
DiscordMessage.channel_id: string
DiscordMessage.author_id: string
DiscordMessage.delete(): Promise<void>
DiscordMessage.respond(message: string, attachments?: Attachment[]): Promise<void>

// interaction class
DiscordInteraction.name: string
DiscordInteraction.user_id: string
DiscordInteraction.channel_id: string
DiscordInteraction.guild_id: string
DiscordInteraction.custom_id: string | null
DiscordInteraction.values: string[]
DiscordInteraction.is_command: boolean
DiscordInteraction.is_component: boolean
DiscordInteraction.get_option(name: string): unknown | null
DiscordInteraction.respond(message: string | MessagePayload, ephemeral?: boolean): Promise<void>
DiscordInteraction.update(message: string | MessagePayload): Promise<void>
DiscordInteraction.defer(ephemeral?: boolean): Promise<void>

// component builders
create_action_row(...components: Component[]): ActionRowComponent
create_select_menu(options: SelectMenuOptions): SelectMenuComponent
create_button(options: ButtonOptions): ButtonComponent
```

```ts
import { discord_connect, INTENTS, create_action_row, create_button, BUTTON_STYLE } from 'discord.ts';

const bot = await discord_connect(INTENTS.GUILDS | INTENTS.GUILD_MESSAGES | INTENTS.MESSAGE_CONTENT);

bot.on('ready', () => {
	console.log('bot connected');
	bot.set_presence('with spooderverse', 0);
});

bot.on('message', async (msg) => {
	if (msg.content === '!ping')
		await msg.respond('pong!');
});

bot.on('interaction', async (interaction) => {
	if (interaction.is_command && interaction.name === 'hello')
		await interaction.respond('Hello!', true);
});
```

```ts
// send embed with components
await bot.send_message(channel_id, {
	embeds: [{
		title: 'Confirmation',
		description: 'Are you sure?',
		color: 0x5865F2
	}],
	components: [
		create_action_row(
			create_button({ custom_id: 'confirm', label: 'Yes', style: BUTTON_STYLE.SUCCESS }),
			create_button({ custom_id: 'cancel', label: 'No', style: BUTTON_STYLE.DANGER })
		)
	]
});
```

```ts
// handle button interaction
bot.on('interaction', async (interaction) => {
	if (!interaction.is_component)
		return;

	if (interaction.custom_id === 'confirm')
		await interaction.update({ content: 'Confirmed!', components: [] });
	else if (interaction.custom_id === 'cancel')
		await interaction.update({ content: 'Cancelled.', components: [] });
});
```

## Legal
This software is provided as-is with no warranty or guarantee. The authors of this project are not responsible or liable for any problems caused by using this software or any part thereof. Use of this software does not entitle you to any support or assistance from the authors of this project.

The code in this repository is licensed under the ISC license. See the [LICENSE](LICENSE) file for more information.