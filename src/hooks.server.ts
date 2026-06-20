import type { Handle } from '@sveltejs/kit';
import { verifyAccessJwt } from '$lib/server/access';

// Cloudflare Access gate (defence in depth). Access authenticates at the edge;
// we still verify the JWT here so a direct
// hit on the Worker — bypassing the Access-protected hostname — is refused.
// Local dev sets ACCESS_BYPASS=true via .dev.vars.
export const handle: Handle = async ({ event, resolve }) => {
	const env = event.platform?.env;

	// `wrangler types` infers ACCESS_BYPASS as the literal "false" from
	// wrangler.jsonc when .dev.vars is absent (as in CI), but .dev.vars (local)
	// and the deployment can set it to "true". Coerce to a plain string so the
	// check is valid regardless of the literal type that gets generated.
	if (String(env?.ACCESS_BYPASS) === 'true') {
		event.locals.identity = { email: 'dev@localhost', sub: 'dev' };
		return resolve(event);
	}

	const token = event.request.headers.get('Cf-Access-Jwt-Assertion');
	const teamDomain = env?.ACCESS_TEAM_DOMAIN;
	const aud = env?.ACCESS_AUD;
	if (!token || !teamDomain || !aud) return new Response('Forbidden', { status: 403 });

	const identity = await verifyAccessJwt(token, { teamDomain, aud, fetch });
	if (!identity) return new Response('Forbidden', { status: 403 });

	event.locals.identity = identity;
	return resolve(event);
};
