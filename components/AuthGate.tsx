import React, { useEffect, useState } from 'react';

const isDev = (import.meta as any).env?.DEV;

interface IdentityUser {
    email: string;
    user_metadata?: { full_name?: string; avatar_url?: string };
    jwt: () => Promise<string>;
}

interface IdentityWidget {
    init: (opts?: any) => void;
    open: (tab?: string) => void;
    close: () => void;
    currentUser: () => IdentityUser | null;
    logout: () => void;
    on: (event: string, callback: (user?: IdentityUser) => void) => void;
}

let _widget: IdentityWidget | null = null;
let _initPromise: Promise<IdentityWidget> | null = null;

/** Lazily load and init the widget (singleton). */
export async function ensureWidget(): Promise<IdentityWidget> {
    if (_widget) return _widget;
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
        const mod = await import('netlify-identity-widget');
        _widget = mod.default as unknown as IdentityWidget;
        _widget.init();
        return _widget;
    })();
    return _initPromise;
}

/** Get current user (may be null). */
export function getCurrentUser(): IdentityUser | null {
    return _widget?.currentUser?.() ?? null;
}

/** Trigger logout. */
export function logout(): void {
    _widget?.logout();
}

type LoginListener = (user: IdentityUser) => void;
const _loginListeners: LoginListener[] = [];

/** Subscribe to login events. Returns an unsubscribe function. */
export function onLogin(listener: LoginListener): () => void {
    _loginListeners.push(listener);
    return () => {
        const idx = _loginListeners.indexOf(listener);
        if (idx >= 0) _loginListeners.splice(idx, 1);
    };
}

function _notifyLogin(user: IdentityUser) {
    _loginListeners.forEach(fn => fn(user));
}

/**
 * Open login and return a Promise that resolves with the user once they log in.
 * Rejects if the user closes the dialog without logging in.
 */
export function requestLogin(): Promise<IdentityUser> {
    return new Promise(async (resolve, reject) => {
        const widget = await ensureWidget();
        const current = widget.currentUser();
        if (current) { resolve(current); return; }

        const onLogin = (u?: IdentityUser) => {
            widget.close();
            if (u) resolve(u);
            else reject(new Error('Login cancelled'));
        };
        widget.on('login', onLogin);
        widget.open('login');
    });
}

interface AuthProviderProps {
    children: React.ReactNode;
    onUserChange?: (user: IdentityUser | null) => void;
}

/**
 * AuthProvider — initializes the Identity widget in the background.
 * Does NOT block rendering. The app is always accessible.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children, onUserChange }) => {
    useEffect(() => {
        if (isDev) return;

        ensureWidget().then(widget => {
            // Notify parent of initial state
            const current = widget.currentUser();
            onUserChange?.(current);

            widget.on('login', (u) => {
                widget.close();
                onUserChange?.(u ?? null);
                if (u) _notifyLogin(u);
            });
            widget.on('logout', () => {
                onUserChange?.(null);
            });
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return <>{children}</>;
};
