declare module 'netlify-identity-widget' {
    interface User {
        id: string;
        email: string;
        user_metadata: {
            full_name?: string;
            avatar_url?: string;
        };
        token: {
            access_token: string;
            token_type: string;
            expires_at: number;
        };
        jwt: () => Promise<string>;
    }

    interface NetlifyIdentity {
        init: (opts?: { container?: string; locale?: string }) => void;
        open: (tab?: 'login' | 'signup') => void;
        close: () => void;
        currentUser: () => User | null;
        on: (event: 'login' | 'logout' | 'error' | 'init', callback: (user?: User) => void) => void;
        off: (event: string, callback?: Function) => void;
    }

    const netlifyIdentity: NetlifyIdentity;
    export default netlifyIdentity;
}
