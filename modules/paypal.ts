import { caution, log_create_logger } from 'spooder';

const log = log_create_logger('paypal', '#009cde');

const PAYPAL_API_V1 = 'https://api-m.paypal.com/v1';
const PAYPAL_API_V2 = 'https://api-m.paypal.com/v2';

let paypal_access_token: string | null = null;
let paypal_access_token_expire = 0;

// region types

// common types
interface Money {
	currency_code: string;
	value: string;
}

interface Name {
	given_name?: string;
	surname?: string;
	full_name?: string;
}

interface Address {
	address_line_1: string;
	address_line_2?: string;
	admin_area_2?: string;
	admin_area_1?: string;
	postal_code?: string;
	country_code: string;
}

interface PhoneNumber {
	country_code?: string;
	national_number?: string;
}

interface Link {
	href: string;
	rel: string;
	method?: string;
	title?: string;
}

// v1 subscription types
interface SubscriptionBillingInfo {
	outstanding_balance?: Money;
	cycles_completed?: number;
	cycles_remaining?: number;
	next_billing_time?: string;
	failed_payments_count?: number;
}

interface SubscriptionSubscriber {
	name: Name;
	email_address: string;
	payer_id?: string;
	shipping_address?: {
		name: Name;
		address: Address;
	};
	payment_source?: {
		card?: {
			id?: string;
			last_digits?: string;
			brand?: string;
			type?: string;
		};
	};
}

interface SubscriptionPlanOverride {
	billing_cycles?: Array<{
		frequency?: {
			interval_unit: string;
			interval_count: number;
		};
		tenure_type: string;
		sequence: number;
		total_cycles?: number;
		pricing_scheme: {
			fixed_price: Money;
			create_time?: string;
			update_time?: string;
		};
	}>;
	payment_preferences?: {
		auto_bill_amount?: string;
		setup_fee?: Money;
		setup_fee_failure_action?: string;
		payment_failure_threshold?: number;
	};
	taxes?: {
		percentage: string;
		inclusive: boolean;
	};
}

interface SubscriptionDetails {
	id: string;
	status: 'APPROVAL_PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
	status_update_time?: string;
	plan_id: string;
	plan_overridden?: boolean;
	start_time?: string;
	quantity?: string;
	shipping_amount?: Money;
	subscriber: SubscriptionSubscriber;
	billing_info?: SubscriptionBillingInfo;
	custom_id?: string;
	create_time?: string;
	plan?: SubscriptionPlanOverride;
	links: Link[];
}

// v2 order types
interface OrderItem {
	name: string;
	quantity: string;
	unit_amount: Money;
	description?: string;
	sku?: string;
	category?: 'PHYSICAL_GOODS' | 'DIGITAL_GOODS' | 'DONATION';
	tax?: Money;
}

interface AmountBreakdown {
	item_total?: Money;
	shipping?: Money;
	handling?: Money;
	tax_total?: Money;
	insurance?: Money;
	shipping_discount?: Money;
	discount?: Money;
}

interface OrderAmount {
	currency_code: string;
	value: string;
	breakdown?: AmountBreakdown;
}

interface ShippingName {
	full_name?: string;
	given_name?: string;
	surname?: string;
}

interface ShippingOption {
	id?: string;
	label?: string;
	type?: 'SHIPPING' | 'PICKUP';
	selected?: boolean;
	amount?: Money;
}

interface ShippingDetails {
	type?: 'SHIPPING' | 'PICKUP_IN_PERSON';
	name?: ShippingName;
	email_address?: string;
	phone_number?: PhoneNumber;
	address?: Address;
	options?: ShippingOption[];
}

interface Payee {
	email_address?: string;
	merchant_id?: string;
}

interface ExperienceContext {
	payment_method_preference?: 'IMMEDIATE_PAYMENT_REQUIRED';
	payment_method_selected?: 'PAYPAL';
	brand_name?: string;
	locale?: string;
	landing_page?: 'LOGIN' | 'BILLING' | 'NO_PREFERENCE';
	user_action?: 'CONTINUE' | 'PAY_NOW';
	return_url?: string;
	cancel_url?: string;
	notify_url?: string;
	shipping_preference?: 'GET_FROM_FILE' | 'SET_PROVIDED_ADDRESS' | 'NOT_REQUIRED';
}

interface TaxInfo {
	tax_id?: string;
	tax_id_type?: string;
}

interface PayPalPaymentSource {
	experience_context?: ExperienceContext;
	name?: ShippingName;
	email_address?: string;
	phone_number?: PhoneNumber;
	birth_date?: string;
	tax_info?: TaxInfo;
	address?: Address;
}

interface PaymentSource {
	paypal?: PayPalPaymentSource;
}

interface ApplicationContext {
	brand_name?: string;
	locale?: string;
	landing_page?: 'LOGIN' | 'BILLING' | 'NO_PREFERENCE';
	user_action?: 'CONTINUE' | 'PAY_NOW';
	payment_method?: {
		payer_selected?: 'PAYPAL' | 'APPLE_PAY' | 'VENMO' | 'CARD';
		payee_preferred?: 'UNRESTRICTED' | 'IMMEDIATE_PAYMENT_REQUIRED';
	};
	return_url?: string;
	cancel_url?: string;
	notify_url?: string;
	shipping_preference?: 'GET_FROM_FILE' | 'SET_PROVIDED_ADDRESS' | 'NOT_REQUIRED';
}

interface Payer {
	name?: ShippingName;
	email_address?: string;
	payer_id?: string;
	phone_number?: PhoneNumber;
	birth_date?: string;
	tax_info?: TaxInfo;
	address?: Address;
}

interface PurchaseUnit {
	amount: OrderAmount;
	reference_id?: string;
	items?: OrderItem[];
	shipping?: ShippingDetails;
	payee?: Payee;
	custom_id?: string;
	invoice_id?: string;
	description?: string;
	soft_descriptor?: string;
	supplementary_data?: Record<string, any>;
}

interface CreateOrderRequest {
	intent: 'CAPTURE' | 'AUTHORIZE';
	purchase_units: PurchaseUnit[];
	payment_source?: PaymentSource;
	application_context?: ApplicationContext;
	payer?: Payer;
	processing_instruction?: string;
}

interface Capture {
	id: string;
	status: 'COMPLETED' | 'DECLINED' | 'PENDING' | 'FAILED' | 'VOIDED';
	amount?: Money;
	create_time?: string;
	update_time?: string;
	final_capture?: boolean;
	seller_protection?: {
		status?: 'ELIGIBLE' | 'NOT_ELIGIBLE';
		dispute_categories?: string[];
	};
	supplementary_data?: Record<string, any>;
}

interface Authorization {
	id: string;
	status: 'CREATED' | 'CAPTURED' | 'DENIED' | 'PENDING' | 'EXPIRED' | 'VOIDED';
	amount?: Money;
	create_time?: string;
	update_time?: string;
	expiration_time?: string;
	seller_protection?: {
		status?: 'ELIGIBLE' | 'NOT_ELIGIBLE';
		dispute_categories?: string[];
	};
}

interface Refund {
	id: string;
	status: 'COMPLETED' | 'FAILED' | 'PENDING';
	amount?: Money;
	create_time?: string;
	update_time?: string;
	links?: Link[];
}

interface PaymentStatus {
	captures?: Capture[];
	authorizations?: Authorization[];
	refunds?: Refund[];
}

interface PurchaseUnitResponse {
	reference_id?: string;
	amount?: OrderAmount;
	payee?: Payee;
	description?: string;
	custom_id?: string;
	invoice_id?: string;
	items?: OrderItem[];
	shipping?: ShippingDetails;
	payments?: PaymentStatus;
	supplementary_data?: Record<string, any>;
}

interface PayerResponse {
	name?: ShippingName;
	email_address?: string;
	payer_id?: string;
	phone_number?: PhoneNumber;
	birth_date?: string;
	tax_info?: TaxInfo;
	address?: Address;
}

interface OrderResponse {
	id: string;
	status: 'CREATED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
	payment_source?: PaymentSource;
	payer?: PayerResponse;
	purchase_units?: PurchaseUnitResponse[];
	links?: Link[];
	create_time?: string;
	update_time?: string;
}

// v2 refund types
interface PlatformFee {
	amount: Money;
}

interface PaymentInstruction {
	platform_fees?: PlatformFee[];
}

interface RefundRequest {
	amount?: Money;
	invoice_id?: string;
	note_to_payer?: string;
	payment_instruction?: PaymentInstruction;
	custom_id?: string;
}

interface RefundStatusDetails {
	reason?: 'INSUFFICIENT_FUNDS' | 'CANNOT_REFUND' | 'NOT_SUPPORTED' | 'BUYER_COMPLAINT' | 'REFUND_FAILED' | 'ECHECK_DECLINE' | 'PENDING_SETTLEMENT' | 'DENIED' | 'UNDERPAYMENT_DECLINED' | 'OTHER';
}

interface RefundResponse {
	id: string;
	status: 'COMPLETED' | 'DECLINED' | 'PENDING' | 'FAILED' | 'OTHER';
	status_details?: RefundStatusDetails;
	amount: Money;
	invoice_id?: string;
	create_time: string;
	update_time: string;
	custom_id?: string;
	links: Link[];
	payee?: Payee;
}

// helper types for api functions
interface CreateOrderOptions {
	// required
	items: OrderItem[];
	total_amount: string;
	currency_code: string;
	return_url: string;
	cancel_url: string;

	// optional
	reference_id?: string;
	intent?: 'CAPTURE' | 'AUTHORIZE';
	custom_id?: string;
	invoice_id?: string;
	description?: string;
	soft_descriptor?: string;
	shipping?: ShippingDetails;
	application_context?: Omit<ApplicationContext, 'return_url' | 'cancel_url'>;
	payer?: Payer;
}

// v1 subscription request types
interface SubscriptionApplicationContext {
	brand_name?: string;
	locale?: string;
	shipping_preference?: 'GET_FROM_FILE' | 'NO_SHIPPING' | 'SET_PROVIDED_ADDRESS';
	user_action?: 'CONTINUE' | 'SUBSCRIBE_NOW';
	payment_method?: {
		payer_selected?: string;
		payee_preferred?: 'UNRESTRICTED' | 'IMMEDIATE_PAYMENT_REQUIRED';
	};
	return_url: string;
	cancel_url: string;
}

interface CreateSubscriptionRequest {
	plan_id: string;
	start_time?: string;
	quantity?: string;
	shipping_amount?: Money;
	subscriber?: SubscriptionSubscriber;
	application_context?: SubscriptionApplicationContext;
	custom_id?: string;
	plan?: SubscriptionPlanOverride;
}

// json patch types for subscription updates
type PatchOperation = 'add' | 'replace' | 'remove';

interface PatchRequest {
	op: PatchOperation;
	path: string;
	value?: any;
}

type UpdateSubscriptionRequest = PatchRequest[];

// v1 subscription revise types
interface ReviseSubscriptionRequest {
	plan_id: string;
	quantity?: string;
	shipping_amount?: Money;
	shipping_address?: {
		name?: Name;
		address?: Address;
	};
	application_context?: {
		brand_name?: string;
		locale?: string;
		shipping_preference?: 'GET_FROM_FILE' | 'NO_SHIPPING' | 'SET_PROVIDED_ADDRESS';
		user_action?: 'CONTINUE' | 'SUBSCRIBE_NOW';
		payment_method?: {
			payer_selected?: string;
			payee_preferred?: 'UNRESTRICTED' | 'IMMEDIATE_PAYMENT_REQUIRED';
		};
		return_url?: string;
		cancel_url?: string;
	};
}

interface ReviseSubscriptionResponse {
	plan_id: string;
	plan_overridden?: boolean;
	quantity?: string;
	shipping_amount?: Money;
	shipping_address?: {
		name?: Name;
		address?: Address;
	};
	links: Link[];
}

// v1 subscription capture types
interface CaptureSubscriptionRequest {
	note: string;
	capture_type: 'OUTSTANDING_BALANCE';
	amount: Money;
}

interface CaptureSubscriptionResponse {
	id: string;
	status: 'COMPLETED' | 'PENDING' | 'DECLINED' | 'FAILED';
	amount?: Money;
	create_time?: string;
	update_time?: string;
	payer?: {
		name?: Name;
		email_address?: string;
		payer_id?: string;
	};
}

// v1 subscription transactions types
interface SubscriptionTransaction {
	id: string;
	status: 'COMPLETED' | 'PENDING' | 'DECLINED' | 'FAILED' | 'REVERSED' | 'REFUNDED';
	amount_with_breakdown: {
		gross_amount: Money;
		fee_amount?: Money;
		net_amount?: Money;
		shipping_amount?: Money;
		tax_amount?: Money;
	};
	payer_name?: Name;
	payer_email?: string;
	time: string;
}

interface SubscriptionTransactionsResponse {
	transactions: SubscriptionTransaction[];
	total_items?: number;
	total_pages?: number;
	links?: Link[];
}

// v1 billing plan types
interface BillingCycleFrequency {
	interval_unit: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
	interval_count: number;
}

interface BillingCyclePricingScheme {
	fixed_price: Money;
	create_time?: string;
	update_time?: string;
}

interface BillingCycle {
	frequency: BillingCycleFrequency;
	tenure_type: 'REGULAR' | 'TRIAL';
	sequence: number;
	total_cycles: number;
	pricing_scheme: BillingCyclePricingScheme;
}

interface BillingPlanPaymentPreferences {
	auto_bill_outstanding?: boolean;
	setup_fee?: Money;
	setup_fee_failure_action?: 'CONTINUE' | 'CANCEL';
	payment_failure_threshold?: number;
}

interface BillingPlanTaxes {
	percentage: string;
	inclusive: boolean;
}

interface CreateBillingPlanRequest {
	product_id: string;
	name: string;
	description?: string;
	status?: 'CREATED' | 'INACTIVE' | 'ACTIVE';
	billing_cycles: BillingCycle[];
	payment_preferences?: BillingPlanPaymentPreferences;
	taxes?: BillingPlanTaxes;
}

interface BillingPlanResponse {
	id: string;
	product_id: string;
	name: string;
	description?: string;
	status: 'CREATED' | 'INACTIVE' | 'ACTIVE';
	billing_cycles: BillingCycle[];
	payment_preferences?: BillingPlanPaymentPreferences;
	taxes?: BillingPlanTaxes;
	create_time: string;
	update_time: string;
	links: Link[];
}

interface ListBillingPlansResponse {
	plans: BillingPlanResponse[];
	total_items?: number;
	total_pages?: number;
	links?: Link[];
}

// v1 billing plan pricing update types
interface PricingTier {
	starting_quantity: string;
	ending_quantity?: string;
	amount: Money;
}

interface PricingScheme {
	fixed_price?: Money;
	pricing_model?: 'VOLUME' | 'TIERED';
	tiers?: PricingTier[];
}

interface BillingCyclePricingUpdate {
	billing_cycle_sequence: number;
	pricing_scheme: PricingScheme;
}

interface UpdatePricingSchemesRequest {
	pricing_schemes: BillingCyclePricingUpdate[];
}

// v1 catalog product types
interface CreateCatalogProductRequest {
	name: string;
	description?: string;
	type?: 'PHYSICAL' | 'DIGITAL' | 'SERVICE';
	category?: string;
	image_url?: string;
	home_url?: string;
}

interface CatalogProductResponse {
	id: string;
	name: string;
	description?: string;
	type: 'PHYSICAL' | 'DIGITAL' | 'SERVICE';
	category?: string;
	image_url?: string;
	home_url?: string;
	create_time: string;
	update_time: string;
	links: Link[];
}

// v1 webhook types
interface WebhookEventType {
	name: string;
	description?: string;
	status?: 'ENABLED' | 'DISABLED';
	resource_versions?: Array<{
		resource_version: string;
		resource_type: string;
	}>;
}

interface WebhookRequest {
	url: string;
	event_types: WebhookEventType[];
}

interface WebhookResponse {
	id: string;
	url: string;
	event_types: WebhookEventType[];
	links: Link[];
}

interface ListWebhooksResponse {
	webhooks: WebhookResponse[];
}

interface VerifyWebhookSignatureRequest {
	auth_algo: string;
	cert_url: string;
	transmission_id: string;
	transmission_sig: string;
	transmission_time: string;
	webhook_id: string;
	webhook_event: Record<string, any>;
}

interface VerifyWebhookSignatureResponse {
	verification_status: 'SUCCESS' | 'FAILURE';
}

interface AvailableEventType {
	name: string;
	description: string;
	status?: 'ENABLED' | 'DISABLED';
	resource_versions?: Array<{
		resource_version: string;
		resource_type: string;
	}>;
}

interface ListEventTypesResponse {
	event_types: AvailableEventType[];
}

// v2 invoicing types
interface InvoiceDetail {
	invoice_number?: string;
	reference?: string;
	invoice_date?: string;
	currency_code: string;
	note?: string;
	term?: string;
	memo?: string;
	payment_term?: {
		term_type?: 'DUE_ON_RECEIPT' | 'DUE_ON_DATE_SPECIFIED' | 'NET_10' | 'NET_15' | 'NET_30' | 'NET_45' | 'NET_60' | 'NET_90' | 'NO_DUE_DATE';
		due_date?: string;
	};
	metadata?: {
		create_time?: string;
		created_by?: string;
		last_update_time?: string;
		last_updated_by?: string;
		cancel_time?: string;
		cancelled_by?: string;
		first_sent_time?: string;
		last_sent_time?: string;
		last_sent_by?: string;
	};
}

interface PhoneDetail {
	country_code: string;
	national_number: string;
	extension_number?: string;
	phone_type?: 'MOBILE' | 'HOME' | 'WORK' | 'FAX' | 'PAGER' | 'OTHER';
}

interface ContactName {
	given_name?: string;
	surname?: string;
	full_name?: string;
	prefix?: string;
	suffix?: string;
	middle_name?: string;
}

interface AddressPortable {
	address_line_1?: string;
	address_line_2?: string;
	admin_area_2?: string;
	admin_area_1?: string;
	postal_code?: string;
	country_code: string;
}

interface InvoicerInfo {
	name?: ContactName;
	address?: AddressPortable;
	email_address?: string;
	phones?: PhoneDetail[];
	website?: string;
	tax_id?: string;
	logo_url?: string;
	business_name?: string;
}

interface BillingInfo {
	name?: ContactName;
	address?: AddressPortable;
	email_address?: string;
	phones?: PhoneDetail[];
	business_name?: string;
	additional_info_value?: string;
	language?: string;
}

interface Tax {
	name?: string;
	percent?: string;
	amount?: Money;
}

interface Discount {
	percent?: string;
	amount?: Money;
}

interface InvoiceItem {
	id?: string;
	name: string;
	description?: string;
	quantity: string;
	unit_amount: Money;
	tax?: Tax;
	item_date?: string;
	discount?: Discount;
	unit_of_measure?: 'QUANTITY' | 'HOURS' | 'AMOUNT';
}

interface AmountWithBreakdown {
	currency_code: string;
	value: string;
	breakdown?: {
		item_total?: Money;
		discount?: {
			invoice_discount?: Discount;
			item_discount?: Money;
		};
		tax_total?: Money;
		shipping?: {
			amount?: Money;
			tax?: Tax;
		};
		custom?: {
			label: string;
			amount: Money;
		};
	};
}

interface Configuration {
	tax_calculated_after_discount?: boolean;
	tax_inclusive?: boolean;
	allow_tip?: boolean;
	template_id?: string;
	partial_payment?: {
		allow_partial_payment?: boolean;
		minimum_amount_due?: Money;
	};
}

interface FileReference {
	id?: string;
	reference_url?: string;
	content_type?: string;
	create_time?: string;
	size?: string;
}

interface Invoice {
	id?: string;
	parent_id?: string;
	status?: 'DRAFT' | 'SENT' | 'SCHEDULED' | 'PAID' | 'MARKED_AS_PAID' | 'CANCELLED' | 'REFUNDED' | 'PARTIALLY_PAID' | 'PARTIALLY_REFUNDED' | 'MARKED_AS_REFUNDED' | 'UNPAID' | 'PAYMENT_PENDING';
	detail: InvoiceDetail;
	invoicer?: InvoicerInfo;
	primary_recipients: BillingInfo[];
	additional_recipients?: string[];
	items: InvoiceItem[];
	configuration?: Configuration;
	amount?: AmountWithBreakdown;
	due_amount?: Money;
	gratuity?: Money;
	payments?: {
		paid_amount?: Money;
		transactions?: InvoicePaymentRecord[];
	};
	refunds?: {
		refund_amount?: Money;
		transactions?: InvoiceRefundRecord[];
	};
	links?: Link[];
	attachments?: FileReference[];
}

interface InvoicePaymentRecord {
	type?: string;
	payment_id?: string;
	payment_date?: string;
	method?: 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'PAYPAL' | 'WIRE_TRANSFER' | 'OTHER';
	note?: string;
	amount?: Money;
	shipping_info?: {
		name?: ContactName;
		address?: AddressPortable;
	};
}

interface InvoiceRefundRecord {
	type?: string;
	refund_id?: string;
	refund_date?: string;
	amount?: Money;
	method?: 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'PAYPAL' | 'WIRE_TRANSFER' | 'OTHER';
	note?: string;
}

interface SendInvoiceRequest {
	subject?: string;
	note?: string;
	send_to_invoicer?: boolean;
	send_to_recipient?: boolean;
	additional_recipients?: string[];
}

interface RecordPaymentRequest {
	payment_id?: string;
	payment_date?: string;
	method: 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'PAYPAL' | 'WIRE_TRANSFER' | 'OTHER';
	note?: string;
	amount: Money;
}

interface RecordRefundRequest {
	refund_date?: string;
	amount: Money;
	method?: 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'PAYPAL' | 'WIRE_TRANSFER' | 'OTHER';
	note?: string;
}

interface CancelInvoiceRequest {
	subject?: string;
	note?: string;
	send_to_invoicer?: boolean;
	send_to_recipient?: boolean;
	additional_recipients?: string[];
}

interface InvoiceSearchRequest {
	page?: number;
	page_size?: number;
	total_required?: boolean;
	invoice_number?: string;
	status?: Array<'DRAFT' | 'SENT' | 'SCHEDULED' | 'PAID' | 'MARKED_AS_PAID' | 'CANCELLED' | 'REFUNDED' | 'PARTIALLY_PAID' | 'PARTIALLY_REFUNDED' | 'MARKED_AS_REFUNDED' | 'UNPAID' | 'PAYMENT_PENDING'>;
	reference?: string;
	currency_code?: string;
	memo?: string;
	total_amount_range?: {
		lower_amount?: Money;
		upper_amount?: Money;
	};
	invoice_date_range?: {
		start?: string;
		end?: string;
	};
	due_date_range?: {
		start?: string;
		end?: string;
	};
	payment_date_range?: {
		start?: string;
		end?: string;
	};
	creation_date_range?: {
		start?: string;
		end?: string;
	};
	recipient_first_name?: string;
	recipient_last_name?: string;
	recipient_email?: string;
	recipient_business_name?: string;
	invoicer_email?: string;
	archived?: boolean;
	fields?: string;
}

interface InvoiceSearchResponse {
	total_pages?: number;
	total_items?: number;
	items?: Invoice[];
	links?: Link[];
}

interface QRCodeRequest {
	width?: number;
	height?: number;
	action?: 'pay';
}

interface QRCodeResponse {
	base64_image?: string;
}

interface GenerateInvoiceNumberResponse {
	invoice_number: string;
}
// endregion

// region internal
async function paypal_get_access_token(): Promise<string> {
	const current_time = Date.now();
	if (paypal_access_token !== null && paypal_access_token_expire > current_time)
		return paypal_access_token;

	log`access token expired, requesting new access token`;

	const res = await fetch(`${PAYPAL_API_V1}/oauth2/token`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Authorization': 'Basic ' + btoa(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`)
		},
		body: 'grant_type=client_credentials'
	});

	if (!res.ok) {
		caution('paypal_get_access_token() failed', { status: res.status });
		return '';
	}

	const json = await res.json();
	paypal_access_token_expire = current_time + (json.expires_in * 1000);
	paypal_access_token = `${json.token_type} ${json.access_token}`;

	log`granted new ${json.token_type} token, expiry in ${json.expires_in}`;

	return paypal_access_token;
}

async function paypal_api_post(endpoint: string, body: Record<string, any>, options: RequestInit = {}): Promise<Record<string, any>|null|boolean> {
	const access_token = await paypal_get_access_token();
	const res = await fetch(`${PAYPAL_API_V1}/${endpoint}`, Object.assign({
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': access_token
		},
		body: JSON.stringify(body)
	}, options));

	if (!res.ok) {
		caution(`paypal_api_post() failed`, { endpoint, options, status: res.status, body: await res.text() });
		return null;
	}

	if (res.status === 204)
		return true;
	else
		return res.json();
}

async function paypal_api_get(endpoint: string, options: RequestInit = {}): Promise<Record<string, any>|null> {
	const access_token = await paypal_get_access_token();
	const res = await fetch(`${PAYPAL_API_V1}/${endpoint}`, Object.assign({
		headers: { 'Authorization': access_token }
	}, options));

	if (!res.ok) {
		caution(`paypal_api_get() failed`, { endpoint, options, status: res.status, body: await res.text() });
		return null;
	}

	return res.json();
}

async function paypal_api_v2_post(endpoint: string, body: Record<string, any>, options: RequestInit = {}): Promise<Record<string, any>|null> {
	const access_token = await paypal_get_access_token();
	const res = await fetch(`${PAYPAL_API_V2}/${endpoint}`, Object.assign({
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': access_token
		},
		body: JSON.stringify(body)
	}, options));

	if (!res.ok) {
		const error_body = await res.text();
		caution(`paypal_api_v2_post() failed`, { endpoint, options, status: res.status, body: error_body });
		return null;
	}

	if (res.status === 204)
		return {};

	return res.json();
}

async function paypal_api_v2_get(endpoint: string, options: RequestInit = {}): Promise<Record<string, any>|null> {
	const access_token = await paypal_get_access_token();
	const res = await fetch(`${PAYPAL_API_V2}/${endpoint}`, Object.assign({
		headers: { 'Authorization': access_token }
	}, options));

	if (!res.ok) {
		caution(`paypal_api_v2_get() failed`, { endpoint, options, status: res.status, body: await res.text() });
		return null;
	}

	return res.json();
}

async function paypal_api_patch(endpoint: string, body: any[], options: RequestInit = {}): Promise<boolean> {
	const access_token = await paypal_get_access_token();
	const res = await fetch(`${PAYPAL_API_V1}/${endpoint}`, Object.assign({
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': access_token
		},
		body: JSON.stringify(body)
	}, options));

	if (!res.ok) {
		caution(`paypal_api_patch() failed`, { endpoint, options, status: res.status, body: await res.text() });
		return false;
	}

	return res.status === 204;
}

async function paypal_api_delete(endpoint: string, options: RequestInit = {}): Promise<boolean> {
	const access_token = await paypal_get_access_token();
	const res = await fetch(`${PAYPAL_API_V1}/${endpoint}`, Object.assign({
		method: 'DELETE',
		headers: { 'Authorization': access_token }
	}, options));

	if (!res.ok) {
		caution(`paypal_api_delete() failed`, { endpoint, options, status: res.status, body: await res.text() });
		return false;
	}

	return res.status === 204;
}

async function paypal_api_v2_delete(endpoint: string, options: RequestInit = {}): Promise<boolean> {
	const access_token = await paypal_get_access_token();
	const res = await fetch(`${PAYPAL_API_V2}/${endpoint}`, Object.assign({
		method: 'DELETE',
		headers: { 'Authorization': access_token }
	}, options));

	if (!res.ok) {
		caution(`paypal_api_v2_delete() failed`, { endpoint, options, status: res.status, body: await res.text() });
		return false;
	}

	return res.status === 204;
}

async function paypal_api_v2_put(endpoint: string, body: Record<string, any>, options: RequestInit = {}): Promise<Record<string, any>|null> {
	const access_token = await paypal_get_access_token();
	const res = await fetch(`${PAYPAL_API_V2}/${endpoint}`, Object.assign({
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': access_token
		},
		body: JSON.stringify(body)
	}, options));

	if (!res.ok) {
		caution(`paypal_api_v2_put() failed`, { endpoint, options, status: res.status, body: await res.text() });
		return null;
	}

	if (res.status === 204)
		return {};

	return res.json();
}
// endregion

// region v1 api
export async function paypal_create_subscription(request: CreateSubscriptionRequest): Promise<{subscription_id: string; approval_url: string; status: string} | null> {
	const response = await paypal_api_post('billing/subscriptions', request) as SubscriptionDetails | null;
	if (!response || !response.id) {
		caution('paypal_create_subscription() failed to create subscription', { response });
		return null;
	}

	const approval_link = response.links?.find((link) => link.rel === 'approve');
	if (!approval_link) {
		caution('paypal_create_subscription() no approval link found', { response });
		return null;
	}

	log`created subscription ${response.id} with status ${response.status}`;
	return {
		subscription_id: response.id,
		approval_url: approval_link.href,
		status: response.status
	};
}

export async function paypal_get_subscription(subscription_id: string): Promise<SubscriptionDetails | null> {
	return paypal_api_get(`billing/subscriptions/${subscription_id}`) as Promise<SubscriptionDetails | null>;
}

export async function paypal_cancel_subscription(subscription_id: string, reason: string): Promise<boolean> {
	const result = await paypal_api_post(`billing/subscriptions/${subscription_id}/cancel`, { reason });
	return result === true;
}

export async function paypal_update_subscription(subscription_id: string, patches: UpdateSubscriptionRequest): Promise<boolean> {
	const result = await paypal_api_patch(`billing/subscriptions/${subscription_id}`, patches);
	if (result) {
		log`updated subscription ${subscription_id}`;
	}
	return result;
}

export async function paypal_suspend_subscription(subscription_id: string, reason: string): Promise<boolean> {
	const result = await paypal_api_post(`billing/subscriptions/${subscription_id}/suspend`, { reason });
	return result === true;
}

export async function paypal_activate_subscription(subscription_id: string, reason: string): Promise<boolean> {
	const result = await paypal_api_post(`billing/subscriptions/${subscription_id}/activate`, { reason });
	return result === true;
}

export async function paypal_revise_subscription(subscription_id: string, request: ReviseSubscriptionRequest): Promise<{approval_url: string; plan_id: string} | null> {
	const response = await paypal_api_post(`billing/subscriptions/${subscription_id}/revise`, request) as ReviseSubscriptionResponse | null;
	if (!response || !response.plan_id) {
		caution('paypal_revise_subscription() failed to revise subscription', { response });
		return null;
	}

	const approval_link = response.links?.find((link) => link.rel === 'approve');
	if (!approval_link) {
		caution('paypal_revise_subscription() no approval link found', { response });
		return null;
	}

	log`revised subscription ${subscription_id} to plan ${response.plan_id}`;
	return {
		approval_url: approval_link.href,
		plan_id: response.plan_id
	};
}

export async function paypal_capture_subscription_payment(subscription_id: string, note: string, amount: Money): Promise<{success: boolean; transaction_id?: string; status?: string; details?: CaptureSubscriptionResponse} | null> {
	const request: CaptureSubscriptionRequest = {
		note: note,
		capture_type: 'OUTSTANDING_BALANCE',
		amount: amount
	};

	const response = await paypal_api_post(`billing/subscriptions/${subscription_id}/capture`, request) as CaptureSubscriptionResponse | null;
	if (!response) {
		return null;
	}

	const success = response.status === 'COMPLETED';
	log`captured subscription payment for ${subscription_id} with status ${response.status}, transaction ${response.id || 'none'}`;

	return {
		success: success,
		transaction_id: response.id,
		status: response.status,
		details: response
	};
}

export async function paypal_get_subscription_transactions(subscription_id: string, start_time: string, end_time: string): Promise<SubscriptionTransactionsResponse | null> {
	const endpoint = `billing/subscriptions/${subscription_id}/transactions?start_time=${encodeURIComponent(start_time)}&end_time=${encodeURIComponent(end_time)}`;
	const response = await paypal_api_get(endpoint) as SubscriptionTransactionsResponse | null;

	if (response) {
		log`retrieved ${response.transactions?.length || 0} transactions for subscription ${subscription_id}`;
	}

	return response;
}

export async function paypal_create_billing_plan(request: CreateBillingPlanRequest): Promise<{plan_id: string; status: string} | null> {
	const response = await paypal_api_post('billing/plans', request) as BillingPlanResponse | null;
	if (!response || !response.id) {
		caution('paypal_create_billing_plan() failed to create billing plan', { response });
		return null;
	}

	log`created billing plan ${response.id} with status ${response.status}`;
	return {
		plan_id: response.id,
		status: response.status
	};
}

export async function paypal_list_billing_plans(product_id?: string, plan_ids?: string[], page_size?: number, page?: number, total_required?: boolean): Promise<ListBillingPlansResponse | null> {
	const params = new URLSearchParams();

	if (product_id)
		params.append('product_id', product_id);

	if (plan_ids && plan_ids.length > 0)
		params.append('plan_ids', plan_ids.join(','));

	if (page_size !== undefined)
		params.append('page_size', page_size.toString());

	if (page !== undefined)
		params.append('page', page.toString());

	if (total_required !== undefined)
		params.append('total_required', total_required.toString());

	const query_string = params.toString();
	const endpoint = query_string ? `billing/plans?${query_string}` : 'billing/plans';

	const response = await paypal_api_get(endpoint) as ListBillingPlansResponse | null;

	if (response)
		log`listed ${response.plans?.length || 0} billing plans`;

	return response;
}

export async function paypal_get_billing_plan(plan_id: string): Promise<BillingPlanResponse | null> {
	const response = await paypal_api_get(`billing/plans/${plan_id}`) as BillingPlanResponse | null;

	if (response)
		log`retrieved billing plan ${plan_id} with status ${response.status}`;

	return response;
}

export async function paypal_update_billing_plan(plan_id: string, patches: PatchRequest[]): Promise<boolean> {
	const result = await paypal_api_patch(`billing/plans/${plan_id}`, patches);
	if (result)
		log`updated billing plan ${plan_id}`;

	return result;
}

export async function paypal_activate_billing_plan(plan_id: string): Promise<boolean> {
	const result = await paypal_api_post(`billing/plans/${plan_id}/activate`, {});
	if (result === true)
		log`activated billing plan ${plan_id}`;

	return result === true;
}

export async function paypal_deactivate_billing_plan(plan_id: string): Promise<boolean> {
	const result = await paypal_api_post(`billing/plans/${plan_id}/deactivate`, {});
	if (result === true)
		log`deactivated billing plan ${plan_id}`;

	return result === true;
}

export async function paypal_update_plan_pricing(plan_id: string, request: UpdatePricingSchemesRequest): Promise<boolean> {
	const result = await paypal_api_post(`billing/plans/${plan_id}/update-pricing-schemes`, request);
	if (result === true)
		log`updated pricing for billing plan ${plan_id}`;

	return result === true;
}

export async function paypal_create_catalog_product(request: CreateCatalogProductRequest): Promise<{product_id: string; type: string} | null> {
	const response = await paypal_api_post('catalogs/products', request) as CatalogProductResponse | null;
	if (!response || !response.id) {
		caution('paypal_create_catalog_product() failed to create product', { response });
		return null;
	}

	const product_type = response.type || 'PHYSICAL';
	log`created catalog product ${response.id} with type ${product_type}`;

	return {
		product_id: response.id,
		type: product_type
	};
}

export async function paypal_get_catalog_product(product_id: string): Promise<CatalogProductResponse | null> {
	const response = await paypal_api_get(`catalogs/products/${product_id}`) as CatalogProductResponse | null;

	if (response)
		log`retrieved catalog product ${product_id} with type ${response.type}`;

	return response;
}

export async function paypal_create_webhook(url: string, event_types: string[]): Promise<{webhook_id: string; url: string} | null> {
	const request: WebhookRequest = {
		url: url,
		event_types: event_types.map(name => ({ name }))
	};

	const response = await paypal_api_post('notifications/webhooks', request) as WebhookResponse | null;
	if (!response || !response.id) {
		caution('paypal_create_webhook() failed to create webhook', { response });
		return null;
	}

	log`created webhook ${response.id} for ${response.url} with ${response.event_types.length} event types`;
	return {
		webhook_id: response.id,
		url: response.url
	};
}

export async function paypal_list_webhooks(): Promise<WebhookResponse[] | null> {
	const response = await paypal_api_get('notifications/webhooks') as ListWebhooksResponse | null;
	if (!response)
		return null;

	log`listed ${response.webhooks?.length || 0} webhooks`;
	return response.webhooks;
}

export async function paypal_get_webhook(webhook_id: string): Promise<WebhookResponse | null> {
	const response = await paypal_api_get(`notifications/webhooks/${webhook_id}`) as WebhookResponse | null;

	if (response)
		log`retrieved webhook ${webhook_id} for ${response.url}`;

	return response;
}

export async function paypal_update_webhook(webhook_id: string, patches: PatchRequest[]): Promise<boolean> {
	const result = await paypal_api_patch(`notifications/webhooks/${webhook_id}`, patches);
	if (result)
		log`updated webhook ${webhook_id}`;

	return result;
}

export async function paypal_delete_webhook(webhook_id: string): Promise<boolean> {
	const result = await paypal_api_delete(`notifications/webhooks/${webhook_id}`);
	if (result)
		log`deleted webhook ${webhook_id}`;

	return result;
}

export async function paypal_verify_webhook_signature(webhook_id: string, headers: Record<string, string>, body: string): Promise<boolean> {
	const request: VerifyWebhookSignatureRequest = {
		auth_algo: headers['paypal-auth-algo'] || headers['PAYPAL-AUTH-ALGO'] || '',
		cert_url: headers['paypal-cert-url'] || headers['PAYPAL-CERT-URL'] || '',
		transmission_id: headers['paypal-transmission-id'] || headers['PAYPAL-TRANSMISSION-ID'] || '',
		transmission_sig: headers['paypal-transmission-sig'] || headers['PAYPAL-TRANSMISSION-SIG'] || '',
		transmission_time: headers['paypal-transmission-time'] || headers['PAYPAL-TRANSMISSION-TIME'] || '',
		webhook_id: webhook_id,
		webhook_event: JSON.parse(body)
	};

	const response = await paypal_api_post('notifications/verify-webhook-signature', request) as VerifyWebhookSignatureResponse | null;
	if (!response) {
		caution('paypal_verify_webhook_signature() failed to verify signature');
		return false;
	}

	const verified = response.verification_status === 'SUCCESS';
	if (verified)
		log`verified webhook signature for webhook ${webhook_id}`;
	else
		caution('paypal_verify_webhook_signature() signature verification failed', { webhook_id, status: response.verification_status });

	return verified;
}

export async function paypal_list_webhook_event_types(): Promise<AvailableEventType[] | null> {
	const response = await paypal_api_get('notifications/webhooks-event-types') as ListEventTypesResponse | null;
	if (!response)
		return null;

	log`listed ${response.event_types?.length || 0} available webhook event types`;
	return response.event_types;
}
// endregion

// region v2 api
export async function paypal_create_order(options: CreateOrderOptions): Promise<{order_id: string; approval_url: string} | null> {
	const item_total = options.items.reduce((sum, item) => sum + (parseFloat(item.unit_amount.value) * parseInt(item.quantity)), 0);

	if (Math.abs(item_total - parseFloat(options.total_amount)) > 0.01) {
		caution('paypal_create_order() item total mismatch', { item_total, total_amount: options.total_amount });
		return null;
	}

	const order_request: CreateOrderRequest = {
		intent: options.intent || 'CAPTURE',
		purchase_units: [{
			reference_id: options.reference_id,
			items: options.items,
			amount: {
				currency_code: options.currency_code,
				value: options.total_amount,
				breakdown: {
					item_total: {
						currency_code: options.currency_code,
						value: item_total.toFixed(2)
					}
				}
			},
			custom_id: options.custom_id,
			invoice_id: options.invoice_id,
			description: options.description,
			soft_descriptor: options.soft_descriptor,
			shipping: options.shipping
		}],
		payment_source: {
			paypal: {
				experience_context: {
					return_url: options.return_url,
					cancel_url: options.cancel_url,
					...options.application_context
				}
			}
		},
		payer: options.payer
	};

	const response = await paypal_api_v2_post('checkout/orders', order_request) as OrderResponse | null;
	if (!response || !response.id) {
		caution('paypal_create_order() failed to create order', { response });
		return null;
	}

	const approval_link = response.links?.find((link) => link.rel === 'approve' || link.rel === 'payer-action');
	if (!approval_link) {
		caution('paypal_create_order() no approval link found', { response });
		return null;
	}

	log`created order ${response.id}`;
	return {
		order_id: response.id,
		approval_url: approval_link.href
	};
}

export async function paypal_capture_order(order_id: string): Promise<{success: boolean; transaction_id?: string; status?: string; details?: OrderResponse} | null> {
	const response = await paypal_api_v2_post(`checkout/orders/${order_id}/capture`, {}) as OrderResponse | null;
	if (!response)
		return null;

	const capture = response.purchase_units?.[0]?.payments?.captures?.[0];
	if (!capture) {
		caution('paypal_capture_order() no capture found in response', { response });
		return { success: false, details: response };
	}

	const success = capture.status === 'COMPLETED';
	log`captured order ${order_id} with status ${capture.status}, transaction ${capture.id || 'none'}`;

	return {
		success: success,
		transaction_id: capture.id,
		status: capture.status,
		details: response
	};
}

export async function paypal_get_order(order_id: string): Promise<OrderResponse | null> {
	return await paypal_api_v2_get(`checkout/orders/${order_id}`) as OrderResponse | null;
}

export async function paypal_refund_capture(capture_id: string, amount?: Money, note_to_payer?: string, invoice_id?: string, custom_id?: string): Promise<{success: boolean; refund_id?: string; status?: string; details?: RefundResponse} | null> {
	const refund_request: RefundRequest = {};

	if (amount)
		refund_request.amount = amount;

	if (note_to_payer)
		refund_request.note_to_payer = note_to_payer;

	if (invoice_id)
		refund_request.invoice_id = invoice_id;

	if (custom_id)
		refund_request.custom_id = custom_id;

	const response = await paypal_api_v2_post(`payments/captures/${capture_id}/refund`, refund_request) as RefundResponse | null;
	if (!response)
		return null;

	const success = response.status === 'COMPLETED' || response.status === 'PENDING';
	log`refunded capture ${capture_id} with status ${response.status}, refund ${response.id || 'none'}`;

	return {
		success: success,
		refund_id: response.id,
		status: response.status,
		details: response
	};
}

export async function paypal_create_draft_invoice(invoice: Invoice): Promise<Invoice | null> {
	const access_token = await paypal_get_access_token();
	const res = await fetch(`${PAYPAL_API_V2}/invoicing/invoices`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': access_token,
			'Prefer': 'return=representation'
		},
		body: JSON.stringify(invoice)
	});

	if (!res.ok) {
		const error_body = await res.text();
		caution('paypal_create_draft_invoice() failed', { status: res.status, body: error_body });
		return null;
	}

	const response = await res.json() as Invoice;
	if (!response.id) {
		caution('paypal_create_draft_invoice() missing invoice id', { response });
		return null;
	}

	log`created draft invoice ${response.id} with status ${response.status}`;
	return response;
}

export async function paypal_get_invoice(invoice_id: string): Promise<Invoice | null> {
	const response = await paypal_api_v2_get(`invoicing/invoices/${invoice_id}`) as Invoice | null;
	if (response)
		log`retrieved invoice ${invoice_id} with status ${response.status}`;

	return response;
}

export async function paypal_list_invoices(page?: number, page_size?: number, total_required?: boolean): Promise<InvoiceSearchResponse | null> {
	const params = new URLSearchParams();

	if (page !== undefined)
		params.append('page', page.toString());

	if (page_size !== undefined)
		params.append('page_size', page_size.toString());

	if (total_required !== undefined)
		params.append('total_required', total_required.toString());

	const query_string = params.toString();
	const endpoint = query_string ? `invoicing/invoices?${query_string}` : 'invoicing/invoices';

	const response = await paypal_api_v2_get(endpoint) as InvoiceSearchResponse | null;

	if (response)
		log`listed ${response.items?.length || 0} invoices`;

	return response;
}

export async function paypal_search_invoices(search: InvoiceSearchRequest): Promise<InvoiceSearchResponse | null> {
	const response = await paypal_api_v2_post('invoicing/search-invoices', search) as InvoiceSearchResponse | null;

	if (response)
		log`searched invoices, found ${response.items?.length || 0} results`;

	return response;
}

export async function paypal_send_invoice(invoice_id: string, notification?: SendInvoiceRequest): Promise<{href?: string} | null> {
	const request = notification || {};
	const response = await paypal_api_v2_post(`invoicing/invoices/${invoice_id}/send`, request);

	if (response && typeof response === 'object') {
		log`sent invoice ${invoice_id}`;
		return response as {href?: string};
	}

	return null;
}

export async function paypal_send_invoice_reminder(invoice_id: string, notification?: SendInvoiceRequest): Promise<boolean> {
	const request = notification || {};
	const result = await paypal_api_v2_post(`invoicing/invoices/${invoice_id}/remind`, request);

	if (result) {
		log`sent invoice reminder for ${invoice_id}`;
		return true;
	}

	return false;
}

export async function paypal_cancel_invoice(invoice_id: string, cancel_request: CancelInvoiceRequest): Promise<boolean> {
	const result = await paypal_api_v2_post(`invoicing/invoices/${invoice_id}/cancel`, cancel_request);

	if (result) {
		log`cancelled invoice ${invoice_id}`;
		return true;
	}

	return false;
}

export async function paypal_record_invoice_payment(invoice_id: string, payment: RecordPaymentRequest): Promise<string | null> {
	const response = await paypal_api_v2_post(`invoicing/invoices/${invoice_id}/payments`, payment);

	if (response && typeof response === 'object' && 'payment_id' in response) {
		const payment_id = (response as {payment_id?: string}).payment_id;
		log`recorded payment for invoice ${invoice_id}, payment_id: ${payment_id}`;
		return payment_id || null;
	}

	return null;
}

export async function paypal_delete_invoice_payment(invoice_id: string, transaction_id: string): Promise<boolean> {
	const result = await paypal_api_v2_delete(`invoicing/invoices/${invoice_id}/payments/${transaction_id}`);

	if (result)
		log`deleted payment ${transaction_id} from invoice ${invoice_id}`;

	return result;
}

export async function paypal_record_invoice_refund(invoice_id: string, refund: RecordRefundRequest): Promise<string | null> {
	const response = await paypal_api_v2_post(`invoicing/invoices/${invoice_id}/refunds`, refund);

	if (response && typeof response === 'object' && 'refund_id' in response) {
		const refund_id = (response as {refund_id?: string}).refund_id;
		log`recorded refund for invoice ${invoice_id}, refund_id: ${refund_id}`;
		return refund_id || null;
	}

	return null;
}

export async function paypal_delete_invoice_refund(invoice_id: string, transaction_id: string): Promise<boolean> {
	const result = await paypal_api_v2_delete(`invoicing/invoices/${invoice_id}/refunds/${transaction_id}`);

	if (result)
		log`deleted refund ${transaction_id} from invoice ${invoice_id}`;

	return result;
}

export async function paypal_delete_invoice(invoice_id: string): Promise<boolean> {
	const result = await paypal_api_v2_delete(`invoicing/invoices/${invoice_id}`);

	if (result)
		log`deleted invoice ${invoice_id}`;

	return result;
}

export async function paypal_update_invoice(invoice_id: string, invoice: Invoice): Promise<Invoice | null> {
	const response = await paypal_api_v2_put(`invoicing/invoices/${invoice_id}`, invoice) as Invoice | null;

	if (response)
		log`updated invoice ${invoice_id}`;

	return response;
}

export async function paypal_generate_invoice_qr_code(invoice_id: string, width?: number, height?: number): Promise<string | null> {
	const request: QRCodeRequest = { action: 'pay' };

	if (width)
		request.width = width;

	if (height)
		request.height = height;

	const access_token = await paypal_get_access_token();
	const res = await fetch(`${PAYPAL_API_V2}/invoicing/invoices/${invoice_id}/generate-qr-code`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': access_token
		},
		body: JSON.stringify(request)
	});

	if (!res.ok) {
		const error_body = await res.text();
		caution('paypal_generate_invoice_qr_code() failed', { status: res.status, body: error_body });
		return null;
	}

	const content_type = res.headers.get('content-type');
	if (content_type && content_type.includes('application/json')) {
		const response = await res.json() as QRCodeResponse;
		if (response && response.base64_image) {
			log`generated qr code for invoice ${invoice_id}`;
			return response.base64_image;
		}
	} else {
		const buffer = await res.arrayBuffer();
		const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
		log`generated qr code for invoice ${invoice_id}`;
		return base64;
	}

	return null;
}

export async function paypal_generate_invoice_number(): Promise<string | null> {
	const response = await paypal_api_v2_post('invoicing/generate-next-invoice-number', {}) as GenerateInvoiceNumberResponse | null;

	if (response && response.invoice_number) {
		log`generated invoice number ${response.invoice_number}`;
		return response.invoice_number;
	}

	return null;
}
// endregion