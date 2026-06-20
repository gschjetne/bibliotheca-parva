// Cloudflare Access JWT verification (defence in depth).
//
// Access authenticates the user at the edge and forwards the request with a
// signed JWT in the `Cf-Access-Jwt-Assertion` header. We verify that token with
// the `jose` library against the team's published keys (JWKS): the algorithm is
// pinned to RS256 (no alg-confusion / "none"), and issuer, audience and expiry
// are checked. So a request that reaches the Worker directly — bypassing the
// Access-protected hostname — is rejected. See features/authentication.feature.
import { createRemoteJWKSet, jwtVerify, customFetch, type FetchImplementation } from 'jose';

export type AccessIdentity = { email: string; sub: string };

export type VerifyOptions = {
	teamDomain: string; // e.g. "myteam.cloudflareaccess.com"
	aud: string; // the Access application's AUD tag
	fetch: typeof fetch; // injected so the Worker's fetch (and tests) can be used
	now?: number; // ms epoch, injectable for tests
};

// Per-isolate cache of the remote key set, keyed by the certs URL. jose handles
// the JWKS fetch, in-memory caching and key rotation (cooldown) internally.
const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(certsUrl: string, fetchImpl: typeof fetch) {
	let jwks = jwksByUrl.get(certsUrl);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(certsUrl), {
			[customFetch]: ((url, options) => fetchImpl(url, options)) as FetchImplementation,
		});
		jwksByUrl.set(certsUrl, jwks);
	}
	return jwks;
}

/** Verify an Access JWT. Returns the identity, or null if the token is invalid. */
export async function verifyAccessJwt(
	token: string,
	opts: VerifyOptions,
): Promise<AccessIdentity | null> {
	const issuer = `https://${opts.teamDomain}`;
	const jwks = getJwks(`${issuer}/cdn-cgi/access/certs`, opts.fetch);
	try {
		const { payload } = await jwtVerify(token, jwks, {
			issuer,
			audience: opts.aud,
			algorithms: ['RS256'],
			...(opts.now !== undefined ? { currentDate: new Date(opts.now) } : {}),
		});
		if (typeof payload.email !== 'string') return null;
		return { email: payload.email, sub: typeof payload.sub === 'string' ? payload.sub : '' };
	} catch {
		return null;
	}
}
