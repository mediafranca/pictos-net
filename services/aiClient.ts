/**
 * AI Client — Dual-mode abstraction for Gemini API calls.
 *
 * - Development: calls Gemini directly (API key from .env via Vite define)
 * - Production: proxies through Netlify Function with JWT auth
 *
 * This module replaces the per-service `getAI()` pattern and ensures the
 * API key never appears in the production bundle.
 */

import { GoogleGenAI } from "@google/genai";

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
 * Get a fresh JWT from Netlify Identity widget (auto-refreshes if expired).
 */
async function getAuthToken(): Promise<string> {
    const widget = (window as any).netlifyIdentity;
    const user = widget?.currentUser?.();
    if (!user) throw new Error("Not authenticated");
    // .jwt() returns a Promise that auto-refreshes expired tokens
    const token = await user.jwt();
    return token;
}

/**
 * Call the Netlify Function proxy with JWT authentication.
 */
async function proxyCall(params: GenerateContentParams): Promise<GenerateContentResponse> {
    const token = await getAuthToken();

    const res = await fetch("/.netlify/functions/api-gemini", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(params),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Proxy error ${res.status}`);
    }

    return res.json();
}

/**
 * Generate content via Gemini (direct in dev, proxied in prod).
 * Drop-in replacement for `ai.models.generateContent(params)`.
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
 *   (streaming not supported through Netlify Functions 10s timeout)
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

    // Production: single-chunk fallback via proxy
    const result = await proxyCall(params);
    yield { text: result.text };
}
