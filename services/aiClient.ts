/**
 * AI Client — always-proxy abstraction.
 *
 * All AI calls go through Netlify Functions (both in dev with `netlify dev`
 * and in production). No API key ever reaches the browser.
 *
 * Provides:
 *   callClaude(params)   → api-claude function (phases 1, 2, 5)
 *   callRecraft(params)  → api-recraft function (phase 3)
 */

import { getCurrentUser, requestLogin } from "../components/AuthGate";

async function getAuthToken(): Promise<string> {
    let user = getCurrentUser();
    if (!user) {
        user = await requestLogin();
    }
    return user.jwt();
}

async function callProxy(endpoint: string, params: object): Promise<any> {
    const MAX_RETRIES = 2;

    // In Vite dev mode (`netlify dev`), skip auth — the function has a NETLIFY_DEV bypass.
    const isLocalDev = import.meta.env.DEV;
    const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!isLocalDev) {
        const token = await getAuthToken();
        reqHeaders['Authorization'] = `Bearer ${token}`;
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const res = await fetch(`/.netlify/functions/${endpoint}`, {
            method: 'POST',
            headers: reqHeaders,
            body: JSON.stringify(params),
        });

        if (res.ok) return res.json();

        if ([502, 503, 504].includes(res.status) && attempt < MAX_RETRIES) {
            const delay = (attempt + 1) * 3000;
            console.warn(`[aiClient] ${res.status} on attempt ${attempt + 1}, retrying in ${delay}ms…`);
            await new Promise(r => setTimeout(r, delay));
            continue;
        }

        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Proxy error ${res.status}`);
    }

    throw new Error('Max retries exceeded');
}

export interface ClaudeParams {
    model: string;
    max_tokens?: number;
    system?: string;
    tools?: object[];
    tool_choice?: object;
    messages: object[];
}

export interface ClaudeResponse {
    content: Array<{ type: string; name?: string; input?: any; text?: string }>;
    stop_reason: string;
    usage: { input_tokens: number; output_tokens: number };
}

/**
 * Call Claude via the api-claude Netlify function.
 * Returns the raw Anthropic messages response.
 */
export async function callClaude(params: ClaudeParams): Promise<ClaudeResponse> {
    return callProxy('api-claude', params);
}

/**
 * Extract the tool_use block from a Claude response.
 * Throws if the model did not invoke the tool (hard failure per spec).
 */
export function extractToolUse(response: ClaudeResponse, toolName: string): any {
    const block = response.content?.find(b => b.type === 'tool_use' && b.name === toolName);
    if (!block) {
        throw new Error(`Claude did not invoke tool '${toolName}' (stop_reason: ${response.stop_reason})`);
    }
    return block.input;
}

export interface RecraftParams {
    prompt: string;
}

export interface RecraftResponse {
    svg: string;
}

/**
 * Call Recraft via the api-recraft Netlify function.
 * Returns { svg: string } — the raw SVG content from Recraft.
 */
export async function callRecraft(params: RecraftParams): Promise<RecraftResponse> {
    return callProxy('api-recraft', params);
}
