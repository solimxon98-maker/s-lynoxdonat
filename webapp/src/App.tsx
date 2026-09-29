import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { FullScreenLoader } from "./components/ui";
import { UserLayout } from "./components/UserLayout";
import { TelegramAuthProvider } from "./context/AuthContext";
import { DonatePage } from "./pages/Donate";
import { HomePage } from "./pages/Home";
import { OrderDetailPage } from "./pages/OrderDetail";
import { OrdersPage } from "./pages/Orders";
import { PayPage } from "./pages/Pay";
import { ProfilePage } from "./pages/Profile";
import { WalletPage } from "./pages/Wallet";

// Admin panel alohida chunk sifatida yuklanadi (Telegram foydalanuvchilariga yuklanmaydi)
const AdminLayout = lazy(() => import("./admin/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const AdminLoginPage = lazy(() => import("./admin/AdminLogin").then((m) => ({ default: m.AdminLoginPage })));
const DashboardPage = lazy(() => import("./admin/Dashboard").then((m) => ({ default: m.DashboardPage })));
const ProductsPage = lazy(() => import("./admin/Products").then((m) => ({ default: m.ProductsPage })));
const AdminOrdersPage = lazy(() => import("./admin/Orders").then((m) => ({ default: m.AdminOrdersPage })));
const AdminUsersPage = lazy(() => import("./admin/Users").then((m) => ({ default: m.AdminUsersPage })));
const TopupsPage = lazy(() => import("./admin/Topups").then((m) => ({ default: m.TopupsPage })));
const CardsPage = lazy(() => import("./admin/Cards").then((m) => ({ default: m.CardsPage })));
const FastDonatePage = lazy(() => import("./admin/FastDonate").then((m) => ({ default: m.FastDonatePage })));

function AdminFallback() {
  return (
    <div className="app-bg min-h-screen">
      <FullScreenLoader />
    </div>
  );
}

/** Sahifa almashganda tepaga qaytish (aks holda uzun Donat sahifasidan keyin pastda qolib ketadi) */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
    <ScrollToTop />
    <Routes>
      <Route
        path="/admin/login"
        element={
          <Suspense fallback={<AdminFallback />}>
            <AdminLoginPage />
          </Suspense>
        }
      />
      <Route
        path="/admin"
        element={
          <Suspense fallback={<AdminFallback />}>
            <AdminLayout />
          </Suspense>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="orders" element={<AdminOrdersPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="topups" element={<TopupsPage />} />
        <Route path="cards" element={<CardsPage />} />
        <Route path="fastdonate" element={<FastDonatePage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>

      <Route
        element={
          <TelegramAuthProvider>
            <UserLayout />
          </TelegramAuthProvider>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="donate" element={<DonatePage />} />
        <Route path="pay/:paymentId" element={<PayPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:orderId" element={<OrderDetailPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="wallet" element={<WalletPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  );
}
