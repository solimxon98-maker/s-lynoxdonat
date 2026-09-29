import { CreditCard, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, FullScreenLoader, MockBadge, PageHeader, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { formatSum, productEmoji, productText } from "../lib/format";
import { bindBackButton, haptic, openExternal } from "../lib/telegram";

interface PaymentInfo {
  payment: {
    id: string;
    orderId: string;
    amount: number;
    currency: string;
    status: "PENDING" | "PAID" | "FAILED" | "CANCELLED";
    provider: string;
    mode: "in_app_mock" | "redirect" | null;
    payUrl: string | null;
  };
  order: { orderNo: string; nickname: string; mlbbId: string; serverId: string; name: string; category: string; diamonds: number; bonus: number; status: string };
}

/**
 * To'lov oynasi. MOCK rejimda test tugmalari ko'rsatiladi;
 * haqiqiy provider ulanganda foydalanuvchi provider sahifasiga yo'naltiriladi.
 */
export function PayPage() {
  const { paymentId = "" } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<PaymentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pay" | "cancel" | null>(null);

  useEffect(() => bindBackButton(() => navigate("/donate")), [navigate]);

  useEffect(() => {
    let alive = true;
    api<PaymentInfo>(`/payments/${encodeURIComponent(paymentId)}`)
      .then((d) => {
        if (!alive) return;
        if (d.payment.status !== "PENDING") {
          navigate(`/orders/${d.payment.orderId}`, { replace: true });
          return;
        }
        setInfo(d);
      })
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [paymentId, navigate]);

  async function act(action: "pay" | "cancel") {
    if (!info || busy) return;
    haptic.tap();
    setBusy(action);
    setError(null);
    try {
      await api(`/payments/${encodeURIComponent(info.payment.id)}/mock`, { body: { action } });
      if (action === "pay") haptic.success();
      navigate(`/orders/${info.payment.orderId}`, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      haptic.error();
    } finally {
      setBusy(null);
    }
  }

  if (!info && !error) return <FullScreenLoader text="To‘lov ma'lumotlari yuklanmoqda..." />;

  return (
    <div>
      <PageHeader title="To‘lov" subtitle={info ? `Buyurtma #${info.order.orderNo}` : undefined} right={info?.payment.mode === "in_app_mock" ? <MockBadge /> : undefined} />

      {error && <Alert>{error}</Alert>}

      {info && (
        <div className="space-y-4 animate-fade-up">
          <div className="card-glow p-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">To‘lov summasi</p>
            <p className="mt-2 font-display text-3xl font-bold text-gradient">{formatSum(info.payment.amount)}</p>
            <p className="mt-3 text-sm text-slate-300">
              {productEmoji(info.order)} {productText(info.order)} → <b className="text-white">{info.order.nickname}</b>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              ID {info.order.mlbbId} · Server {info.order.serverId}
            </p>
          </div>

          {info.payment.mode === "in_app_mock" ? (
            <>
              <Alert tone="amber">
                🧪 Bu TEST to‘lov. Haqiqiy pul yechilmaydi. Click/Payme/Uzum ulanganda bu oyna provider to‘lov sahifasi bilan almashtiriladi.
              </Alert>
              <button className="btn-primary w-full py-4" onClick={() => act("pay")} disabled={!!busy}>
                {busy === "pay" ? <Spinner size={18} /> : <CreditCard size={18} />}
                To‘lash (test)
              </button>
              <button className="btn-danger w-full" onClick={() => act("cancel")} disabled={!!busy}>
                {busy === "cancel" ? <Spinner size={18} /> : <XCircle size={18} />}
                Bekor qilish
              </button>
            </>
          ) : (
            <button className="btn-primary w-full py-4" onClick={() => info.payment.payUrl && openExternal(info.payment.payUrl)} disabled={!info.payment.payUrl}>
              <CreditCard size={18} /> To‘lov sahifasini ochish
            </button>
          )}

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
            <ShieldCheck size={13} /> Donat faqat to‘lov tasdiqlangandan keyin yuboriladi
          </p>
        </div>
      )}
    </div>
  );
}
