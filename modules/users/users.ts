import { SQL } from 'bun';
import * as spooder from 'spooder';

const db = new SQL('mysql://user:pw@localhost:3306/db_name');
const log = spooder.log_create_logger('users', 'orange');

export type UserSession = {
	session_id: string,
	last_access: number,
	user_id: number,
	flags: number,
	user_updated_timestamp: number
};

export enum UserAccountFlags { // 32-bit
	None = 0,
	AccountDisabled = 1 << 0,
	RequiresVerification = 1 << 1,
	ForcePasswordReset = 1 << 2,
	AllPermissions = 1 << 3,
	OAuthAccount = 1 << 4,
};

export enum UserPermission {
	None,
	ExamplePermission1,
	ExamplePermission2,
};

export enum VerifyLoginResponse {
	Success,
	NoAccount,
	InvalidPassword,
	RequiresVerification,
	AccountDisabled,
	RequiresPasswordReset
};

export enum SendVerificationCodeResponse {
	Success,
	Error,
	Throttled
};

export enum PasswordResetResponse {
	Success,
	NoAccount,
	Throttled,
	InvalidToken,
	TokenExpired
};

export const user_session_cache = new Map<string, UserSession>();

// example verification token: 161e2adb45c9c39d
function generate_verification_token(): string {
	return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

// example verification code: 31332
function generate_verification_code(): string {
	return (Math.floor(Math.random() * 55565) + 10000).toString();
}

function flag_is_set(number: number, flag: number): boolean {
	return (number & flag) === flag;
}

// region api
export function revoke_user_session(req: Request) {
	const cookies = spooder.cookies_get(req);
	cookies.delete('session_id');
	cookies.set('session_updated', 'EXPIRED', { httpOnly: false });
}

export async function start_user_session(req: Request, user_id: number): Promise<Response> {
	const session_id = await generate_session_id();
	const user_updated_timestamp = Date.now();

	const values = { session_id, user_id, user_updated_timestamp };
	await db`INSERT INTO user_sessions ${db(values)}`;

	const [user_row] = await db`SELECT flags FROM user_accounts WHERE id = ${user_id} LIMIT 1`;

	const session = {
		session_id,
		user_id,
		flags: user_row?.flags ?? 0,
		user_updated_timestamp,
		last_access: user_updated_timestamp
	};

	user_session_cache.set(session_id, session);
	log`started session ${session_id} for user ${user_id}`;
	
	const cookies = spooder.cookies_get(req);
	cookies.set('session_id', session.session_id);
	cookies.set('session_updated', session.user_updated_timestamp.toString(), { httpOnly: false });

	return Response.json({ success: true });
}

async function session_id_exists(session_id: string): Promise<boolean> {
	if (user_session_cache.has(session_id))
		return true;

	return spooder.db_exists(db, 'user_sessions', session_id, 'session_id');
}

async function generate_session_id(): Promise<string> {
	const new_session_id = crypto.randomUUID();

	if (await session_id_exists(new_session_id))
		return crypto.randomUUID();

	return new_session_id;
}

export async function refresh_user_sessions(...user_ids: number[]) {
	if (user_ids.length === 0)
		return;

	const user_id_set = new Set(user_ids);
	for (const [session_id, session] of user_session_cache) {
		if (user_id_set.has(session.user_id))
			user_session_cache.delete(session_id);
	}

	await db`UPDATE user_sessions SET user_updated_timestamp = ${Date.now()} WHERE user_id IN (${db(user_ids)})`;
}

export async function refresh_user_session(session_id: string) {
	user_session_cache.delete(session_id);
	await db`UPDATE user_sessions SET user_updated_timestamp = ${Date.now()} WHERE session_id = ${session_id}`;
}

export async function end_user_session(session_id: string): Promise<void> {
	user_session_cache.delete(session_id);

	await db`DELETE FROM user_sessions WHERE session_id = ${session_id}`;
}

export async function get_session(session_id: string|null): Promise<UserSession|null> {
	if (session_id === null)
		return null;

	const session = user_session_cache.get(session_id);
	if (session !== undefined) {
		session.last_access = Date.now();
		return session;
	}

	const [session_row] = await db`SELECT user_id, user_updated_timestamp FROM user_sessions WHERE session_id = ${session_id} LIMIT 1`;
	if (session_row) {
		const [user_row] = await db`SELECT flags FROM user_accounts WHERE id = ${session_row.user_id} LIMIT 1`;

		log`restored session ${session_id} for user ${session_row.user_id}`;
		const db_session: UserSession = {
			session_id,
			user_id: session_row.user_id,
			flags: user_row?.flags ?? 0,
			user_updated_timestamp: session_row.user_updated_timestamp,
			last_access: Date.now()
		};

		user_session_cache.set(session_id, db_session);
		return db_session;
	}

	return null;
}

export async function get_user_presence(user_id: number) {
	const [row] = await db`SELECT first_name, last_name FROM user_accounts WHERE id = ${user_id} LIMIT 1`;
	return row;
}

export async function verify_login(email: string, password: string) {
	const [row] = await db`SELECT id, password, flags FROM user_accounts WHERE email = ${email} LIMIT 1`;
	if (row) {
		// reject password login for oauth accounts
		if (flag_is_set(row.flags, UserAccountFlags.OAuthAccount))
			return [VerifyLoginResponse.InvalidPassword, null];

		if (flag_is_set(row.flags, UserAccountFlags.ForcePasswordReset))
			return [VerifyLoginResponse.RequiresPasswordReset, row.id];

		if (!(await Bun.password.verify(password, row.password)))
			return [VerifyLoginResponse.InvalidPassword, null];

		if (flag_is_set(row.flags, UserAccountFlags.AccountDisabled))
			return [VerifyLoginResponse.AccountDisabled, null];

		if (flag_is_set(row.flags, UserAccountFlags.RequiresVerification))
			return [VerifyLoginResponse.RequiresVerification, row.id];

		return [VerifyLoginResponse.Success, row.id];
	}

	return [VerifyLoginResponse.NoAccount, null];
}

export async function email_in_use(email: string): Promise<boolean> {
	return spooder.db_exists(db, 'user_accounts', email, 'email');
}

export async function register_account(email: string, password: string, first_name: string, last_name: string): Promise<boolean|string> {	
	let verify_token: string|null = null;

	await db.begin(async tx => {
		const hashed_password = await Bun.password.hash(password);
		const user_insert_values = {
			email,
			first_name,
			last_name,
			password: hashed_password,
			flags: UserAccountFlags.RequiresVerification
		};

		console.log(user_insert_values);

		const user_insert = await tx`INSERT INTO user_accounts ${db(user_insert_values)}`;
		const user_id = user_insert.lastInsertRowid;

		const verify_code = generate_verification_code();
		while (verify_token === null) {
			const generated_token = generate_verification_token();

			if (!(await is_verification_token_used(generated_token)))
				verify_token = generated_token;
		}

		const verify_insert_values = {
			token: verify_token,
			code: verify_code,
			last_sent: Date.now(),
			user_id,
		};

		await tx`INSERT INTO user_verify_codes ${db(verify_insert_values)}`;
		log`registered new user account ${email} with user id ${user_id}`;
	});

	if (verify_token !== null) {
		send_verification_code(verify_token, true);
		return verify_token;
	}

	return false;
}

export async function has_permission_by_session(session: UserSession, permission: UserPermission): Promise<boolean> {
	if (permission === UserPermission.None)
		return true;

	// ALL_PERMISSIONS flag allows bypass of fine-grained permission control
	if (flag_is_set(session.flags, UserAccountFlags.AllPermissions))
		return true;

	const check = await db`SELECT 1 FROM user_permissions WHERE fk_users_id = ${session.user_id} AND permission = ${permission} LIMIT 1`;
	return check.length > 0;
}

async function set_user_flag(user_id: number, flag: UserAccountFlags, state: boolean): Promise<void> {
	if (state) {
		await db`UPDATE user_accounts SET flags = flags | ${flag} WHERE id = ${user_id} LIMIT 1`;
	} else {
		await db`UPDATE user_accounts SET flags = flags & ~${flag} WHERE id = ${user_id} LIMIT 1`;
	}
}

async function is_verification_token_used(token: string): Promise<boolean> {
	return spooder.db_exists(db, 'user_verify_codes', token, 'token');
}

export async function get_user_verification_token(user_id: number): Promise<string|null> {
	const [row] = await db`SELECT token FROM user_verify_codes WHERE user_id = ${user_id} LIMIT 1`;
	return row?.token ?? null;
}

async function get_verification_token(token: string) {
	const [row] = await db`SELECT * FROM user_verify_codes WHERE token = ${token} LIMIT 1`;
	return row ?? null;
}

export async function check_verification_code(token: string, code: string): Promise<boolean|number> {
	const token_row = await get_verification_token(token);

	if (token_row !== null && token_row?.code === code) {
		await set_user_flag(token_row.user_id, UserAccountFlags.RequiresVerification, false);
		await db`DELETE FROM user_verify_codes WHERE token = ${token} LIMIT 1`;
		return token_row.user_id;
	}

	return false;
}

export async function send_verification_code(verify_token: string, force = false): Promise<SendVerificationCodeResponse> {
	const token = await get_verification_token(verify_token) ;
	if (!token) {
		spooder.caution('send_verification_code cannot find token', { verify_token });
		return SendVerificationCodeResponse.Error;
	}

	// verification codes can only be sent every 5 minutes.
	const timestamp = Date.now();
	if (!force && timestamp - token.last_sent < 300000)
		return SendVerificationCodeResponse.Throttled;

	await db`UPDATE user_verify_codes SET last_sent = ${timestamp} WHERE token = ${verify_token} LIMIT 1`;

	const [user_row] = await db`SELECT first_name, last_name, email FROM user_accounts WHERE id = ${token.user_id} LIMIT 1`;
	if (!user_row)
		return SendVerificationCodeResponse.Error;
	
	const recipient = `${user_row.first_name} ${user_row.last_name} <${user_row.email}>`;

	// TODO:
	// here token.code and token.token needs to be sent to the user
	// the easiest way to do this is via smtp_send() from the smtp module
	log`TODO: send ${token.code} and ${token.token} to ${recipient}`;

	return SendVerificationCodeResponse.Success;
}

export async function reset_user_password(user_email_or_id: string|number): Promise<PasswordResetResponse> {
	const check_field = typeof user_email_or_id === 'string' ? 'email' : 'id';
	const [user_row] = await db`SELECT id, email FROM user_accounts WHERE ${db(check_field)} = ${user_email_or_id} LIMIT 1`;

	if (!user_row)
		return PasswordResetResponse.NoAccount;

	const [reset_row] = await db`SELECT * FROM user_reset_tokens WHERE user_id = ${user_row.id} LIMIT 1`;
	if (reset_row) {
		if (Date.now() - reset_row.reset_sent < 300000)
			return PasswordResetResponse.Throttled;

		await db`DELETE FROM user_reset_tokens WHERE user_id = ${user_row.id}`;
	}

	const reset_token = crypto.randomUUID();
	await db`INSERT INTO user_reset_tokens (reset_token, user_id, reset_sent) VALUES(${reset_token}, ${user_row.id}, ${Date.now()})`;

	// TODO:
	// here reset_token needs to be sent to the user via smtp
	log`todo: send ${reset_token} to ${user_row.email}`;

	return PasswordResetResponse.Success;
}

export async function apply_password_reset(token: string, new_password: string): Promise<PasswordResetResponse> {
	const [reset_row] = await db`SELECT * FROM user_reset_tokens WHERE reset_token = ${token} LIMIT 1`;
	if (!reset_row)
		return PasswordResetResponse.InvalidToken;

	// reset links older than 24 hours are not valid
	if (Date.now() - reset_row.reset_sent > 86400000)
		return PasswordResetResponse.TokenExpired;

	const hashed_password = await Bun.password.hash(new_password);

	// account may have ForcePasswordReset, remove that flag now
	await db`UPDATE user_accounts SET password = ${hashed_password}, flags = flags & ~${UserAccountFlags.ForcePasswordReset} WHERE id = ${reset_row.user_id}`;
	await db`DELETE FROM user_reset_tokens WHERE reset_token = ${token} LIMIT 1`;

	return PasswordResetResponse.Success;
}
// endregion