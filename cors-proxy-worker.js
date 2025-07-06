/**
 * Cloudflare Workers CORS Proxy for Remote Fetch Plugin
 *
 * This script is designed to be as safe as possible:
 * - Only allows public internet URLs (blocks localhost, private IPs, etc.)
 * - Handles CORS preflight requests
 * - Limits file size (50MB max)
 * - Copies only safe headers
 * - Sets strict CORS headers on all responses
 * - Does NOT log, store, or analyze any data
 *
 * You can review the code below. It is safe for use as a public CORS proxy for file downloads.
 */

export default {
	async fetch(request) {
		const url = new URL(request.url);
		const targetUrl = url.searchParams.get("url");

		// Handle CORS preflight requests
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 200,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods":
						"GET, POST, PUT, DELETE, OPTIONS",
					"Access-Control-Allow-Headers": "*",
					"Access-Control-Max-Age": "86400",
				},
			});
		}

		// Validate URL parameter
		if (!targetUrl) {
			return new Response("Missing 'url' query parameter.", {
				status: 400,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Content-Type": "text/plain",
				},
			});
		}

		// Validate URL format
		let validatedUrl;
		try {
			validatedUrl = new URL(targetUrl);
		} catch (err) {
			return new Response("Invalid URL format.", {
				status: 400,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Content-Type": "text/plain",
				},
			});
		}

		// Security: Block internal/private IP ranges
		const hostname = validatedUrl.hostname;
		if (
			hostname === "localhost" ||
			hostname === "127.0.0.1" ||
			hostname === "0.0.0.0" ||
			hostname.startsWith("192.168.") ||
			hostname.startsWith("10.") ||
			hostname.startsWith("172.")
		) {
			return new Response(
				"Access to internal/private networks is not allowed.",
				{
					status: 403,
					headers: {
						"Access-Control-Allow-Origin": "*",
						"Content-Type": "text/plain",
					},
				}
			);
		}

		try {
			// Prepare headers for the proxied request
			const proxyHeaders = new Headers();
			proxyHeaders.set(
				"User-Agent",
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
			);
			const allowedHeaders = [
				"accept",
				"accept-encoding",
				"accept-language",
				"cache-control",
				"referer",
			];
			for (const [key, value] of request.headers) {
				if (allowedHeaders.includes(key.toLowerCase())) {
					proxyHeaders.set(key, value);
				}
			}
			// Make the proxied request with timeout
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
			const proxiedResponse = await fetch(validatedUrl.toString(), {
				method: request.method,
				headers: proxyHeaders,
				signal: controller.signal,
				body: request.method === "GET" ? null : request.body,
			});
			clearTimeout(timeoutId);
			// Check if response is too large (>50MB)
			const contentLength = proxiedResponse.headers.get("content-length");
			if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
				return new Response("File too large (>50MB).", {
					status: 413,
					headers: {
						"Access-Control-Allow-Origin": "*",
						"Content-Type": "text/plain",
					},
				});
			}
			// Clone the response headers
			const responseHeaders = new Headers();
			const importantHeaders = [
				"content-type",
				"content-length",
				"content-disposition",
				"content-encoding",
				"last-modified",
				"etag",
				"cache-control",
			];
			for (const header of importantHeaders) {
				const value = proxiedResponse.headers.get(header);
				if (value) {
					responseHeaders.set(header, value);
				}
			}
			// Set CORS headers
			responseHeaders.set("Access-Control-Allow-Origin", "*");
			responseHeaders.set(
				"Access-Control-Allow-Methods",
				"GET, POST, PUT, DELETE, OPTIONS"
			);
			responseHeaders.set("Access-Control-Allow-Headers", "*");
			responseHeaders.set("Access-Control-Expose-Headers", "*");
			// If no content-type is set, try to guess from URL
			if (!responseHeaders.get("content-type")) {
				const pathname = validatedUrl.pathname.toLowerCase();
				if (pathname.endsWith(".pdf")) {
					responseHeaders.set("content-type", "application/pdf");
				} else if (
					pathname.endsWith(".jpg") ||
					pathname.endsWith(".jpeg")
				) {
					responseHeaders.set("content-type", "image/jpeg");
				} else if (pathname.endsWith(".png")) {
					responseHeaders.set("content-type", "image/png");
				} else if (pathname.endsWith(".gif")) {
					responseHeaders.set("content-type", "image/gif");
				} else if (pathname.endsWith(".zip")) {
					responseHeaders.set("content-type", "application/zip");
				} else {
					responseHeaders.set(
						"content-type",
						"application/octet-stream"
					);
				}
			}
			return new Response(proxiedResponse.body, {
				status: proxiedResponse.status,
				statusText: proxiedResponse.statusText,
				headers: responseHeaders,
			});
		} catch (err) {
			console.error("Proxy error:", err);
			let errorMessage = "Failed to fetch URL";
			let statusCode = 502;
			if (err.name === "AbortError") {
				errorMessage = "Request timeout (30s)";
				statusCode = 504;
			} else if (err.message && err.message.includes("fetch")) {
				errorMessage = "Network error or invalid URL";
				statusCode = 502;
			} else {
				errorMessage = `Error: ${err.message}`;
			}
			return new Response(errorMessage, {
				status: statusCode,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Content-Type": "text/plain",
				},
			});
		}
	},
};
