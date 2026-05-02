import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import InviteExpired from "./pages/InviteExpired";
import AdminDashboard from "./pages/AdminDashboard";
import TrackedAwbsList from "./pages/TrackedAwbsList";
import ActiveQueries from "./pages/ActiveQueries";
import Users from "./pages/Users";
import Logs from "./pages/Logs";
import ActiveShipments from "./pages/ActiveShipments";
import ArchivedShipments from "./pages/ArchivedShipments";
import CustomerSettings from "./pages/CustomerSettings";
import SetupPassword from "./pages/SetupPassword";
import EmailsHandled from "./pages/EmailsHandled";
import ServicesStatus from "./pages/ServicesStatus";
import Layout from "./layouts/Layout";

function isCustomerRole(r: string) {
  return r === "customer" || r === "user";
}

function ProtectedRoute({
  children,
  role,
}: {
  children: React.ReactNode;
  role: "admin" | "customer";
}) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role === "admin") {
    if (user.role !== "admin") return <Navigate to={isCustomerRole(user.role) ? "/customer" : "/login"} replace />;
  } else {
    // Customer console: invited users have role `user` in DB
    if (user.role === "admin") return <Navigate to="/admin" replace />;
    if (!isCustomerRole(user.role)) return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute role="admin">
            <Layout role="admin">
              <Routes>
                <Route path="/" element={<AdminDashboard />} />
                <Route path="/tracked" element={<TrackedAwbsList />} />
                <Route path="/active-queries" element={<ActiveQueries />} />
                <Route path="/users" element={<Users />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/ingested-emails" element={<EmailsHandled />} />
                <Route path="/services" element={<ServicesStatus />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer/*"
        element={
          <ProtectedRoute role="customer">
            <Layout role="customer">
              <Routes>
                <Route path="/" element={<ActiveShipments />} />
                <Route path="/archived" element={<ArchivedShipments />} />
                <Route path="/settings" element={<CustomerSettings />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/setup-password" element={<SetupPassword />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/invite-expired" element={<InviteExpired />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
