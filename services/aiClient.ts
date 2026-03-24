/**
 * AI Client — Dual-mode abstraction for Gemini API calls.
 *
 * - Development: calls Gemini directly (API key from .env via Vite define)
 * - Production: proxies through Netlify Function with JWT auth.
 *   If the user is not logged in, the Identity widget opens automatically
 *   and the call proceeds after successful authentication.
 */

import { GoogleGenAI } from "@google/genai";
import { getCurrentUser, requestLogin } from "../components/AuthGate";

const isDev = (import.meta as any).env?.DEV;

interface GenerateContentParams {
    model: string;
    contents: any;
    config?: any;
}

interface GenerateContentResponse {
    text: string;
    candidates?: any[];
}

/**
 * Get a fresh JWT. If the user is not logged in, opens the login widget
 * and waits for them to authenticate before returning the token.
 */
async function getAuthToken(): Promise<string> {
    let user = getCurrentUser();
    if (!user) {
        user = await requestLogin();
    }
    const token = await user.jwt();
    return token;
}

/**
 * Call the Netlify Function proxy with JWT authentication.
 */
async function proxyCall(params: GenerateContentParams): Promise<GenerateContentResponse> {
    const token = await getAuthToken();
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const res = await fetch("/.netlify/functions/api-gemini", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify(params),
        });

        if (res.ok) return res.json();

        // Retry on 502/503/504 (transient proxy/timeout errors)
        if ([502, 503, 504].includes(res.status) && attempt < MAX_RETRIES) {
            const delay = (attempt + 1) * 3000;
            console.warn(`[aiClient] ${res.status} on attempt ${attempt + 1}, retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
        }

        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Proxy error ${res.status}`);
    }

    throw new Error('Max retries exceeded');
}

/**
 * Generate content via Gemini (direct in dev, proxied in prod).
 */
export async function generateContent(params: GenerateContentParams): Promise<GenerateContentResponse> {
    if (isDev) {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent(params);
        return { text: response.text || '', candidates: response.candidates };
    }
    return proxyCall(params);
}

/**
 * Stream content via Gemini.
 * - Dev: real streaming via SDK
 * - Prod: non-streaming proxy, yielded as a single chunk
 */
export async function* generateContentStream(
    params: GenerateContentParams
): AsyncGenerator<{ text: string }> {
    if (isDev) {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const stream = await ai.models.generateContentStream(params);
        for await (const chunk of stream) {
            yield { text: chunk.text || '' };
        }
        return;
    }

    const result = await proxyCall(params);
    yield { text: result.text };
}
