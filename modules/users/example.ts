import { SQL } from 'bun';
import * as spooder from 'spooder';
import * as users from './users';
import * as oauth from './oauth';

const db = new SQL('mysql://user:pw@localhost:3306/db_name');
const server = spooder.http_serve(6010);

type JSONRequestHandler = Parameters<typeof server.json>[1];

type SessionRequestHandler<RequireSession extends boolean> = RequireSession extends true
? (...args: [...Parameters<JSONRequestHandler>, session: users.UserSession]) => ReturnType<JSONRequestHandler>
: (...args: [...Parameters<JSONRequestHandler>, session: users.UserSession | null]) => ReturnType<JSONRequestHandler>;

type EndpointReturnType = Promise<Record<any, any> | number | string>;
type PermissionEndpointHandler = (req: Request, json: spooder.JsonObject, session: NonNullable<users.UserSession>) => EndpointReturnType;

function session_endpoint(
	id: string, 
	handler: SessionRequestHandler<true>, 
	require_session: true
): void;

function session_endpoint(
	id: string, 
	handler: SessionRequestHandler<false>, 
	require_session?: false
): void;

function session_endpoint(id: string, handler: SessionRequestHandler<boolean>, require_session = false) {
	return async (req: Request, url: URL, json: spooder.JsonObject) => {
		const cookies = spooder.cookies_get(req);
		const user_session_id = cookies.get('session_id') ?? null;
		const user_session = await users.get_session(user_session_id);

		if (require_session && user_session === null)
			return spooder.HTTP_STATUS_CODE.Unauthorized_401;

		return handler(req, url, json, user_session as any);
	};
}

function permission_endpoint(id: string, handler: PermissionEndpointHandler, permission: users.UserPermission) {
	return async (req: Request, json: spooder.JsonObject) => {
		const cookies = spooder.cookies_get(req);
		const user_session_id = cookies.get('session_id') ?? null;
		const user_session = await users.get_session(user_session_id);

		if (user_session === null || !(await users.has_permission_by_session(user_session, permission)))
			return spooder.HTTP_STATUS_CODE.Unauthorized_401;

		return await handler(req, json, user_session);
	};
}

// region example handlers
session_endpoint('query_user_presence', async (req, url, json, session) => {
	const user_info = await users.get_user_presence(session.user_id);
	const [user_flags] = await db`SELECT flags FROM user_accounts WHERE id = ${session.user_id} LIMIT 1`;
	return {
		user_presence: {
			first_name: user_info?.first_name,
			last_name: user_info?.last_name,
			flags: user_flags?.flags ?? 0
		},
		session_updated: session.user_updated_timestamp
	};
}, true);

session_endpoint('user_send_password_reset', async (req, url, json, session) => {
	const reset = await users.reset_user_password(session.user_id);
	if (reset === users.PasswordResetResponse.Throttled)
		return { error: 'Reset recently requested, please try again in 5 minutes' };

	if (reset === users.PasswordResetResponse.Success)
		return { success: true };

	spooder.caution('user_send_password_reset got unexpected reset response', {
		user_id: session.user_id,
		reset_response: reset
	});

	return { error: 'Unexpected error, please contact technical support!' };
}, true);

session_endpoint('user_logout', async (req, url, json, session) => {
	if (session !== null) {
		await users.end_user_session(session.session_id);
		users.revoke_user_session(req);
	}

	return { success: true };
});

server.json('user_login', server.throttle(1000, async (req, url, json) => {
	if (typeof json.email !== 'string')
		return { error_field: 'email', error: 'Invalid e-mail address' };

	const trimmed_email = json.email.trim().toLowerCase();
	if (trimmed_email.length === 0)
		return { error_field: 'email', error: 'Missing e-mail address' };

	if (trimmed_email.length > 254)
		return { error_field: 'email', error: 'E-mail address too long' };

	if (!/^[^@]+@[^@]+\.[^@]+$/.test(trimmed_email))
		return { error_field: 'email', error: 'Invalid e-mail address' };

	if (typeof json.password !== 'string' || json.password.length === 0 || json.password.length > 128)
		return { error_field: 'password', error: 'Invalid password' };

	const [verify_res, user_id] = await users.verify_login(trimmed_email, json.password) as [users.VerifyLoginResponse, number];

	if (verify_res === users.VerifyLoginResponse.NoAccount)
		return { error_field: 'email', error: 'Account does not exist' };

	if (verify_res === users.VerifyLoginResponse.InvalidPassword)
		return { error_field: 'password', error: 'Incorrect password' };

	if (verify_res === users.VerifyLoginResponse.AccountDisabled)
		return { error: 'This account has been disabled' };

	if (verify_res === users.VerifyLoginResponse.RequiresPasswordReset)
		return { error: '', migrate: true };

	if (verify_res === users.VerifyLoginResponse.RequiresVerification) {
		const token = await users.get_user_verification_token(user_id);
		return { error: 'Account requires verification', verify: token };
	}

	return await users.start_user_session(req, user_id);
}));

server.json('user_register', server.throttle(1000, async (req, url, json) => {
	if (typeof json.email !== 'string')
		return { error_field: 'email', error: 'Invalid e-mail address' };

	const trimmed_email = json.email.trim().toLowerCase();
	if (trimmed_email.length === 0)
		return { error_field: 'email', error: 'Missing e-mail address' };

	if (trimmed_email.length > 254)
		return { error_field: 'email', error: 'E-mail address too long' };

	if (!/^[^@]+@[^@]+\.[^@]+$/.test(trimmed_email))
		return { error_field: 'email', error: 'Invalid e-mail address' };

	if (typeof json.password !== 'string' || json.password.length === 0)
		return { error_field: 'password', error: 'Missing password' };

	if (json.password.length > 128)
		return { error_field: 'password', error: 'Password cannot exceed 128 characters' };

	if (json.password.length < 12)
		return { error_field: 'password', error: 'Password must be at least 12 characters' };

	if (typeof json.first_name !== 'string')
		return { error_field: 'first_name', error: 'Missing first name' };

	const trimmed_first_name = json.first_name.trim();
	if (trimmed_first_name.length === 0)
		return { error_field: 'first_name', error: 'Missing first name' };

	if (trimmed_first_name.length > 50)
		return { error_field: 'first_name', error: 'First name too long' };

	if (typeof json.last_name !== 'string')
		return { error_field: 'last_name', error: 'Missing last name' };

	const trimmed_last_name = json.last_name.trim();
	if (trimmed_last_name.length === 0)
		return { error_field: 'last_name', error: 'Missing last name' };

	if (trimmed_last_name.length > 50)
		return { error_field: 'last_name', error: 'Last name too long' };

	if (await users.email_in_use(trimmed_email))
		return { error_field: 'email', error: 'E-mail address is already registered' };

	const verify_token = await users.register_account(trimmed_email, json.password, json.first_name, json.last_name);
	if (verify_token === false)
		return { error: 'Server error, please try again later' };

	return { success: true, verify_token };
}));

server.json('user_recover', server.throttle(1000, async (req, url, json) => {
	if (typeof json.email !== 'string')
		return { error_field: 'email', error: 'Invalid e-mail address' };

	const trimmed_email = json.email.trim().toLowerCase();
	if (trimmed_email.length === 0)
		return { error_field: 'email', error: 'Missing e-mail address' };

	if (trimmed_email.length > 254)
		return { error_field: 'email', error: 'E-mail address too long' };

	if (!/^[^@]+@[^@]+\.[^@]+$/.test(trimmed_email))
		return { error_field: 'email', error: 'Invalid e-mail address' };

	const reset = await users.reset_user_password(trimmed_email);
	if (reset === users.PasswordResetResponse.NoAccount)
		return { error_field: 'email', error: 'No account exists with this e-mail address' };

	if (reset === users.PasswordResetResponse.Throttled)
		return { error: 'Reset recently requested, please try again in 5 minutes' };

	return { success: true };
}));

server.json('user_reset_password', server.throttle(1000, async (req, url, json) => {
	if (typeof json.token !== 'string')
		return { error: 'Invalid password reset link' };

	const reset_token = json.token.trim().toLowerCase();
	if (!/^[0-9a-f-]{36}$/i.test(reset_token))
		return { error: 'Invalid password reset link' };

	if (typeof json.password !== 'string' || json.password.length === 0)
		return { error_field: 'password', error: 'Missing password' };

	if (json.password.length > 128)
		return { error_field: 'password', error: 'Password cannot exceed 128 characters' };

	if (json.password.length < 12)
		return { error_field: 'password', error: 'Password must be at least 12 characters' };

	const reset = await users.apply_password_reset(reset_token, json.password);
	if (reset === users.PasswordResetResponse.InvalidToken)
		return { error: 'Invalid or expired password reset link' };

	if (reset === users.PasswordResetResponse.TokenExpired)
		return { error: 'Invalid or expired password reset link' };

	return { success: true };
}));

server.json('user_verify', server.throttle(1000, async (req, url, json) => {
	if (typeof json.verify_token !== 'string')
		return { error: 'Missing verification token' };

	if (typeof json.verify_code !== 'string')
		return { error: 'Missing verification code' };

	// validate verify_token is a 16-character hexadecimal character string
	const verify_token = json.verify_token.trim().toLowerCase();
	if (!/^[0-9a-f]{16}$/.test(verify_token))
		return { error: 'Invalid verification token' };

	// validate verify_code is a 5 digit 0-9 string
	const verify_code = json.verify_code.trim();
	if (!/^\d{5}$/.test(verify_code))
		return { error: 'Invalid verification code' };

	const user_id = await users.check_verification_code(verify_token, verify_code);
	if (user_id === false)
		return { error: 'Invalid verification code' };

	return await users.start_user_session(req, user_id as number);
}));

server.json('user_verify_resend', server.throttle(1000, async (req, url, json) => {
	if (typeof json.verify_token !== 'string')
		return { error: 'Missing verification token' };

	// validate verify_token is a 16-character hexadeciaml character string
	const verify_token = json.verify_token.trim().toLowerCase();
	if (!/^[0-9a-f]{16}$/.test(verify_token))
		return { error: 'Invalid verification token' };

	const send_response = await users.send_verification_code(verify_token);
	if (send_response === users.SendVerificationCodeResponse.Throttled)
		return { error: 'Verification code recently sent, try again in 5 minutes.' };

	if (send_response === users.SendVerificationCodeResponse.Error)
		return { error: 'Unable to re-send verification code. Try again later.' };

	return { success: true };
}));

// oauth endpoints
server.json('oauth_get_providers', async (req, url, json) => {
	return await oauth.oauth_get_providers();
});

server.json('oauth_initiate_login', server.throttle(1000, async (req, url, json) => {
	if (typeof json.provider !== 'string')
		return { error: 'missing provider' };

	if (typeof json.redirect_uri !== 'string')
		return { error: 'missing redirect_uri' };

	return await oauth.oauth_initiate_login(json.provider, json.redirect_uri);
}));

server.json('oauth_callback', server.throttle(1000, async (req, url, json) => {
	if (typeof json.code !== 'string')
		return { error: 'missing code' };

	if (typeof json.state !== 'string')
		return { error: 'missing state' };

	return await oauth.oauth_callback(req, json.code, json.state);
}));
// endregion