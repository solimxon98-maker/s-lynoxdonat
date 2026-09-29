import { Lock, LogIn, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Logo } from "../components/Logo";
import { Alert, Spinner } from "../components/ui";
import { adminSignIn } from "../lib/adminData";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("denied") ? "Bu hisobda admin huquqi yo‘q." : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminSignIn(email.trim(), password);
      navigate("/admin", { replace: true });
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(
        code.includes("too-many-requests")
          ? "Juda ko‘p urinish. Birozdan so‘ng qayta urinib ko‘ring."
          : "Email yoki parol noto‘g‘ri.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-bg flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="card-glow w-full max-w-sm p-7 animate-fade-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={60} className="mb-3 shadow-glow" />
          <h1 className="font-display text-xl font-bold text-white">S-LynoxDonat</h1>
          <p className="text-sm text-slate-400">Admin panelga kirish</p>
        </div>

        <label className="label" htmlFor="email">Email</label>
        <div className="relative mb-4">
          <Mail size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input id="email" type="email" autoComplete="username" required className="input pl-11" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <label className="label" htmlFor="password">Parol</label>
        <div className="relative mb-5">
          <Lock size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className="input pl-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}

        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner size={18} /> : <LogIn size={18} />} Kirish
        </button>
      </form>
    </div>
  );
}
