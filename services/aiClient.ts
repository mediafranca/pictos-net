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
