/**
 * The one ecosystem session this app runs on.
 *
 * WorkOS used to keep its own username/password JWT in localStorage. Now it
 * shares the ecosystem's session: the access token lives in memory, the refresh
 * token is an HttpOnly cookie on `.dileepadari.dev`, and signing in on any app
 * in the ecosystem signs you in here too. All of WorkOS's data now lives behind
 * the shared gateway under `/apps/workos`, reached with this session's token.
 *
 * @module session
 */
import { createSessionClient } from '@completeos/auth-client';

const GATEWAY = import.meta.env.VITE_GATEWAY_URL ?? 'https://api.dileepadari.dev';

export const session = createSessionClient({ baseUrl: GATEWAY });

/** Where every WorkOS API call is rooted, now that the app lives on the gateway. */
export const WORKOS_API_BASE = `${GATEWAY}/apps/workos`;
/** The gateway root, for cross-app endpoints like the shared AI-key store. */
export const GATEWAY_URL = GATEWAY;
