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

async function getWidget(): Promise<IdentityWidget> {
    if (!_widget) {
        _widget = (await import('netlify-identity-widget')).default as unknown as IdentityWidget;
    }
    return _widget;
}

/** Get current user (available globally for aiClient and other modules) */
export function getCurrentUser(): IdentityUser | null {
    return _widget?.currentUser?.() ?? null;
}

/** Trigger logout */
export function logout(): void {
    _widget?.logout();
}

interface AuthGateProps {
    children: React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
    const [user, setUser] = useState<IdentityUser | null>(null);
    const [loading, setLoading] = useState(!isDev);

    useEffect(() => {
        if (isDev) return;

        getWidget().then(widget => {
            widget.init();

            const current = widget.currentUser();
            if (current) {
                setUser(current);
            }
            setLoading(false);

            widget.on('login', (u) => {
                setUser(u ?? null);
                widget.close();
            });

            widget.on('logout', () => {
                setUser(null);
            });
        });
    }, []);

    // Dev mode: skip auth entirely
    if (isDev) return <>{children}</>;

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-violet-600 animate-spin" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="text-center max-w-sm">
                    <h1 className="text-2xl font-bold text-slate-800 mb-2">Pictos.net</h1>
                    <p className="text-sm text-slate-500 mb-6">
                        Inicia sesion para acceder a la aplicacion.
                    </p>
                    <button
                        onClick={async () => {
                            const w = await getWidget();
                            w.open('login');
                        }}
                        className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2.5 rounded-full font-bold text-sm uppercase tracking-widest transition-colors shadow-md"
                    >
                        Iniciar sesion
                    </button>
                </div>
            </div>
        );
    }

    return <>{children}</>;
};
