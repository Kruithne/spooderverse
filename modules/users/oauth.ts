import { SQL } from 'bun';
import * as spooder from 'spooder';
import { start_user_session, email_in_use, UserAccountFlags } from './users';

const db = new SQL('mysql://user:pw@localhost:3306/db_name');
const log = spooder.log_create_logger('oauth', 'cyan');

// oauth provider configuration
type OAuthProvider = {
	id: number;
	provider_name: string;
	client_id: string;
	client_secret: string;
	auth_endpoint: string;
	token_endpoint: string;
	userinfo_endpoint: string;
};

// oauth account link
type OAuthAccount = {
	id: number;
	user_id: number;
	provider_id: number;
	provider_user_id: string;
	linked_at: Date;
};

// state token for csrf protection
type OAuthStateToken = {
	state: string;
	provider_id: number;
	redirect_uri: string;
	created: number;
};

// jwt header/payload structure
type JWTHeader = {
	alg: string;
	kid?: string;
	typ?: string;
};

type JWTPayload = {
	iss: string;
	aud: string;
	sub: string;
	exp: number;
	iat?: number;
	email?: string;
	email_verified?: boolean;
	[key: string]: any;
};

// jwks key structure
type JWKSKey = {
	kid: string;
	kty: string;
	alg: string;
	use: string;
	n: string;
	e: string;
};

function base64url_decode(input: string): string {
	let base64 = input.replace(/-/g, '+').replace(/_/g, '/');

	while (base64.length % 4 !== 0)
		base64 += '=';

	return Buffer.from(base64, 'base64').toString('utf-8');
}

function parse_jwt_unverified(token: string): { header: JWTHeader; payload: JWTPayload; signature: string } | null {
	try {
		const parts = token.split('.');
		if (parts.length !== 3)
			return null;

		const header = JSON.parse(base64url_decode(parts[0]));
		const payload = JSON.parse(base64url_decode(parts[1]));
		const signature = parts[2];

		return { header, payload, signature };
	}
	catch {
		return null;
	}
}

async function fetch_jwks(jwks_uri: string): Promise<JWKSKey[]> {
	const response = await fetch(jwks_uri);
	if (!response.ok)
		throw new Error('failed to fetch jwks');

	const data = await response.json();
	return data.keys || [];
}

async function jwk_to_crypto_key(jwk: JWKSKey): Promise<CryptoKey> {
	return await crypto.subtle.importKey(
		'jwk',
		{
			kty: jwk.kty,
			n: jwk.n,
			e: jwk.e,
			alg: jwk.alg,
			ext: true,
		},
		{
			name: 'RSASSA-PKCS1-v1_5',
			hash: 'SHA-256',
		},
		false,
		['verify']
	);
}

async function verify_jwt_signature(token: string, jwks_uri: string): Promise<boolean> {
	const parsed = parse_jwt_unverified(token);
	if (!parsed)
		return false;

	const { header, payload } = parsed;

	if (header.alg !== 'RS256')
		return false;

	const keys = await fetch_jwks(jwks_uri);
	const matching_key = keys.find(k => k.kid === header.kid);

	if (!matching_key)
		return false;

	const crypto_key = await jwk_to_crypto_key(matching_key);

	const parts = token.split('.');
	const message = parts[0] + '.' + parts[1];
	const signature = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');

	return await crypto.subtle.verify(
		'RSASSA-PKCS1-v1_5',
		crypto_key,
		signature,
		new TextEncoder().encode(message)
	);
}

async function validate_jwt(token: string, jwks_uri: string, expected_issuer: string, expected_audience: string): Promise<JWTPayload | null> {
	const parsed = parse_jwt_unverified(token);
	if (!parsed)
		return null;

	const { payload } = parsed;

	const valid = await verify_jwt_signature(token, jwks_uri);
	if (!valid)
		return null;

	if (payload.iss !== expected_issuer)
		return null;

	if (payload.aud !== expected_audience)
		return null;

	const now = Math.floor(Date.now() / 1000);
	if (payload.exp < now)
		return null;

	return payload;
}

export async function get_oauth_provider(provider_name: string): Promise<OAuthProvider | null> {
	const [result] = await db`SELECT * FROM oauth_providers WHERE provider_name = ${provider_name} LIMIT 1`;
	return result ?? null;
}

export async function get_oauth_provider_by_id(provider_id: number): Promise<OAuthProvider | null> {
	const [result] = await db`SELECT * FROM oauth_providers WHERE id = ${provider_id} LIMIT 1`;
	return result ?? null;
}

export async function generate_state_token(provider_id: number, redirect_uri: string): Promise<string> {
	const state = crypto.randomUUID();
	const created = Date.now();

	const values = { state, provider_id, redirect_uri, created };
	await db`INSERT INTO oauth_state_tokens ${db(values)}`;

	return state;
}

export async function validate_state_token(state: string): Promise<OAuthStateToken | null> {
	const [token] = await db`SELECT * FROM oauth_state_tokens WHERE state = ${state} LIMIT 1`;

	if (!token)
		return null;

	const now = Date.now();
	if (now - token.created > 10 * 60 * 1000) { // 10 mins
		await db`DELETE FROM oauth_state_tokens WHERE state = ${state}`;
		return null;
	}

	await db`DELETE FROM oauth_state_tokens WHERE state = ${state}`;
	return token;
}

export async function cleanup_expired_state_tokens(): Promise<void> {
	const cutoff = Date.now() - 10 * 60 * 1000;
	await db`DELETE FROM oauth_state_tokens WHERE created < ${cutoff}`;
}

export function build_authorization_url(provider: OAuthProvider, state: string, redirect_uri: string, scopes: string[]): string {
	const params = new URLSearchParams({
		client_id: provider.client_id,
		redirect_uri: redirect_uri,
		response_type: 'code',
		scope: scopes.join(' '),
		state: state,
	});

	return `${provider.auth_endpoint}?${params.toString()}`;
}

export async function exchange_code_for_token(provider: OAuthProvider, code: string, redirect_uri: string): Promise<{ access_token: string; id_token?: string } | null> {
	try {
		const response = await fetch(provider.token_endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				client_id: provider.client_id,
				client_secret: provider.client_secret,
				code: code,
				redirect_uri: redirect_uri,
				grant_type: 'authorization_code',
			}).toString(),
		});

		if (!response.ok)
			return null;

		const data = await response.json();
		return {
			access_token: data.access_token,
			id_token: data.id_token,
		};
	}
	catch {
		return null;
	}
}

export async function get_oauth_user_info(provider: OAuthProvider, access_token: string, id_token?: string): Promise<{ provider_user_id: string; email: string; given_name?: string; family_name?: string } | null> {
	// google provides id_token (jwt)
	if (provider.provider_name === 'google' && id_token) {
		const payload = await validate_jwt(
			id_token,
			'https://www.googleapis.com/oauth2/v3/certs',
			'https://accounts.google.com',
			provider.client_id
		);

		if (!payload || !payload.email)
			return null;

		return {
			provider_user_id: payload.sub,
			email: payload.email,
			given_name: payload.given_name,
			family_name: payload.family_name,
		};
	}

	// microsoft provides id_token (jwt)
	if (provider.provider_name === 'microsoft' && id_token) {
		const payload = await validate_jwt(
			id_token,
			'https://login.microsoftonline.com/common/discovery/v2.0/keys',
			'https://login.microsoftonline.com/common/v2.0',
			provider.client_id
		);

		if (!payload)
			return null;

		// microsoft might need userinfo endpoint for email/names
		if (!payload.email) {
			const response = await fetch(provider.userinfo_endpoint, {
				headers: {
					'Authorization': `Bearer ${access_token}`,
				},
			});

			if (!response.ok)
				return null;

			const data = await response.json();
			return {
				provider_user_id: payload.sub,
				email: data.mail || data.userPrincipalName,
				given_name: data.givenName,
				family_name: data.surname,
			};
		}

		return {
			provider_user_id: payload.sub,
			email: payload.email,
			given_name: payload.given_name,
			family_name: payload.family_name,
		};
	}

	try {
		const response = await fetch(provider.userinfo_endpoint, {
			headers: {
				'Authorization': `Bearer ${access_token}`,
			},
		});

		if (!response.ok)
			return null;

		const data = await response.json();

		let provider_user_id: string;
		let email: string;
		let given_name: string | undefined;
		let family_name: string | undefined;

		if (provider.provider_name === 'google') {
			provider_user_id = data.id;
			email = data.email;
			given_name = data.given_name;
			family_name = data.family_name;
		} else if (provider.provider_name === 'microsoft') {
			provider_user_id = data.id;
			email = data.mail || data.userPrincipalName;
			given_name = data.givenName;
			family_name = data.surname;
		} else {
			provider_user_id = data.id || data.sub;
			email = data.email;
			given_name = data.given_name || data.givenName;
			family_name = data.family_name || data.surname;
		}

		if (!provider_user_id || !email)
			return null;

		return { provider_user_id, email, given_name, family_name };
	}
	catch {
		return null;
	}
}

export async function find_oauth_account(provider_id: number, provider_user_id: string): Promise<OAuthAccount | null> {
	const [result] = await db`SELECT * FROM oauth_accounts WHERE provider_id = ${provider_id} AND provider_user_id = ${provider_user_id} LIMIT 1`;
	return result ?? null;
}

export async function create_oauth_account(user_id: number, provider_id: number, provider_user_id: string): Promise<void> {
	const values = { user_id, provider_id, provider_user_id };
	await db`INSERT INTO oauth_accounts ${db(values)}`;
}

export async function is_oauth_account(user_id: number): Promise<boolean> {
	const [result] = await db`SELECT flags FROM user_accounts WHERE id = ${user_id} LIMIT 1`;

	if (!result)
		return false;

	return (result.flags & UserAccountFlags.OAuthAccount) !== 0;
}

setInterval(() => {
	cleanup_expired_state_tokens();
}, 5 * 60 * 1000); // 5 mins

export async function oauth_get_providers() {
	const providers = await db`SELECT id, provider_name FROM oauth_providers`;
	return { providers };
}

export async function oauth_initiate_login(provider_name: string, redirect_uri: string) {
	const provider = await get_oauth_provider(provider_name);

	if (!provider)
		return { error: 'unknown_provider' };

	if (!provider.client_id || !provider.client_secret)
		return { error: 'provider_not_configured' };

	const state = await generate_state_token(provider.id, redirect_uri);

	// determine scopes based on provider
	let scopes: string[];
	if (provider_name === 'google')
		scopes = ['openid', 'email', 'profile'];
	else if (provider_name === 'microsoft')
		scopes = ['openid', 'email', 'profile'];
	else
		scopes = ['openid', 'email'];

	const auth_url = build_authorization_url(provider, state, redirect_uri, scopes);
	log`initiated oauth login for ${provider_name}`;

	return { auth_url };
}

export async function oauth_callback(req: Request, code: string, state: string) {
	const state_token = await validate_state_token(state);
	if (!state_token)
		return { error: 'invalid_state' };

	const provider = await get_oauth_provider_by_id(state_token.provider_id);
	if (!provider)
		return { error: 'unknown_provider' };

	const token_response = await exchange_code_for_token(provider, code, state_token.redirect_uri);
	if (!token_response)
		return { error: 'token_exchange_failed' };

	const user_info = await get_oauth_user_info(provider, token_response.access_token, token_response.id_token);
	if (!user_info)
		return { error: 'failed_to_get_user_info' };

	log`oauth callback: provider=${provider.provider_name} email=${user_info.email}`;

	const oauth_account = await find_oauth_account(provider.id, user_info.provider_user_id);
	let user_id: number;

	if (oauth_account) {
		user_id = oauth_account.user_id;
		const [user_result] = await db`SELECT flags FROM user_accounts WHERE id = ${user_id} LIMIT 1`;

		if (!user_result)
			return { error: 'account_not_found' };

		if ((user_result.flags & UserAccountFlags.AccountDisabled) !== 0)
			return { error: 'account_disabled' };

		log`existing oauth account logged in: user_id=${user_id}`;
	}
	else {
		if (await email_in_use(user_info.email)) {
			// email exists but not linked to this oauth provider
			// check if existing account is oauth or password-based
			const [existing_user] = await db`SELECT id, flags FROM user_accounts WHERE email = ${user_info.email} LIMIT 1`;
			if (existing_user && (existing_user.flags & UserAccountFlags.OAuthAccount) === 0)
				return { error: 'email_exists_password_account' };

			return { error: 'account_state_error' };
		}

		// create new oauth account
		const insert_values = {
			email: user_info.email,
			password: '', // no password for oauth accounts
			first_name: user_info.given_name || '',
			last_name: user_info.family_name || '',
			flags: UserAccountFlags.OAuthAccount
		};

		const result = await db`INSERT INTO user_accounts ${db(insert_values)}`;
		user_id = Number(result.lastInsertRowid);

		await create_oauth_account(user_id, provider.id, user_info.provider_user_id);
		log`created new oauth account: user_id=${user_id} email=${user_info.email}`;
	}

	return await start_user_session(req, user_id);
}
