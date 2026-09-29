/** DEMO: lib/supabase.ts o'rniga — admin sessiyasi brauzer xotirasida */
const subs = new Set<() => void>();
let adminToken: string | null = null;

export const demoAuth = {
  get token() {
    return adminToken;
  },
  signIn(uid: string) {
    adminToken = uid;
    subs.forEach((s) => s());
  },
  signOut() {
    adminToken = null;
    subs.forEach((s) => s());
  },
  subscribe(cb: () => void) {
    subs.add(cb);
    return () => subs.delete(cb);
  },
};

export const supabaseConfigured = true;

export function supabase() {
  return {
    auth: {
      getSession: async () => ({ data: { session: adminToken ? { access_token: adminToken } : null } }),
    },
  };
}
