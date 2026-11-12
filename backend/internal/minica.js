import errs from "../lib/error.js";
import settingModel from "../models/setting.js";

const REQUEST_TIMEOUT = 90000;

const getConfig = async () => {
	const setting = await settingModel.query().where("id", "minica").first();
	const config = setting?.meta;
	if (
		typeof config?.url !== "string" ||
		typeof config.username !== "string" ||
		typeof config.password !== "string" ||
		typeof config.ca_id !== "string" ||
		!config.url ||
		!config.username ||
		!config.password ||
		!config.ca_id
	) {
		throw new errs.ValidationError("MiniCA is not configured. Configure its URL, credentials, and CA in Settings.");
	}

	let baseUrl;
	try {
		baseUrl = new URL(config.url);
	} catch {
		throw new errs.ValidationError("MiniCA URL is invalid");
	}

	if (
		!["http:", "https:"].includes(baseUrl.protocol) ||
		baseUrl.username ||
		baseUrl.password ||
		baseUrl.search ||
		baseUrl.hash ||
		config.username.includes(":") ||
		/[\r\n]/.test(config.username + config.password)
	) {
		throw new errs.ValidationError("MiniCA URL must be an HTTP(S) URL without credentials, query, or fragment");
	}

	const path = baseUrl.pathname.replace(/\/+$/, "");
	return {
		baseUrl: `${baseUrl.origin}${path}`,
		username: config.username,
		password: config.password,
		caId: config.ca_id,
	};
};

const request = async (config, endpoint, options = {}) => {
	const headers = new Headers(options.headers || {});
	headers.set("Authorization", `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`);
	if (options.body) {
		headers.set("Content-Type", "application/json");
	}

	let response;
	try {
		response = await fetch(`${config.baseUrl}/api/${endpoint}`, {
			...options,
			headers,
			redirect: "error",
			signal: AbortSignal.timeout(REQUEST_TIMEOUT),
		});
	} catch (err) {
		throw new errs.ValidationError(`Could not connect to MiniCA: ${err.message}`);
	}

	let body;
	try {
		body = await response.json();
	} catch {
		throw new errs.ValidationError(`MiniCA returned an invalid response (HTTP ${response.status})`);
	}

	if (!response.ok || body?.success !== true) {
		const message =
			typeof body?.error?.message === "string"
				? body.error.message.replaceAll(config.password, "[REDACTED]").slice(0, 500)
				: response.statusText;
		throw new errs.ValidationError(`MiniCA request failed (HTTP ${response.status}): ${message}`);
	}

	return body.data;
};

const requestWrite = async (config, endpoint, method, data) => {
	const csrf = await request(config, "csrf");
	if (typeof csrf?.token !== "string" || !csrf.token) {
		throw new errs.ValidationError("MiniCA did not provide a CSRF token");
	}

	return request(config, endpoint, {
		method,
		headers: {
			Cookie: `minica_csrf=${csrf.token}`,
			"X-CSRF-Token": csrf.token,
		},
		body: JSON.stringify(data),
	});
};

const getCa = async (config) => {
	const caId = encodeURIComponent(config.caId);
	return request(config, `cas/${caId}`);
};

const issue = async (domainNames) => {
	if (!Array.isArray(domainNames) || domainNames.length === 0) {
		throw new errs.ValidationError("At least one DNS name is required to issue a MiniCA certificate");
	}
	const config = await getConfig();
	const ca = await getCa(config);
	const caId = encodeURIComponent(config.caId);
	const cert = await requestWrite(config, `cas/${caId}/certs`, "PUT", {
		common_name: domainNames[0],
		country_code: ca.country_code,
		state: ca.state,
		city: ca.city,
		organization: ca.organization,
		organization_unit: ca.organization_unit,
		valid_days: 90,
		digest_algorithm: "sha256",
		key_profile: "rsa:2048",
		dns_list: domainNames,
		ip_list: [],
	});

	if (typeof cert?.id !== "string" || typeof cert.cert_pem !== "string" || typeof cert.key_pem !== "string") {
		throw new errs.ValidationError("MiniCA returned a certificate without its ID, PEM, or private key");
	}

	return { cert, caId: config.caId };
};

const renew = async (caId, certificateId) => {
	const config = await getConfig();
	if (config.caId !== caId) {
		throw new errs.ValidationError("The configured MiniCA CA does not match this certificate");
	}
	const ca = encodeURIComponent(config.caId);
	const cert = encodeURIComponent(certificateId);
	const renewed = await requestWrite(config, `cas/${ca}/certs/${cert}/renew/90`, "POST", {});

	if (
		typeof renewed?.id !== "string" ||
		typeof renewed.cert_pem !== "string" ||
		typeof renewed.key_pem !== "string"
	) {
		throw new errs.ValidationError("MiniCA returned a renewed certificate without its ID, PEM, or private key");
	}

	return renewed;
};

const testConnection = async () => {
	const config = await getConfig();
	await getCa(config);
	const csrf = await request(config, "csrf");
	if (typeof csrf?.token !== "string" || !csrf.token) {
		throw new errs.ValidationError("MiniCA did not provide a CSRF token");
	}
};

export { getConfig, issue, renew, testConnection };
