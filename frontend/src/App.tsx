import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import Users from "./pages/Users";
import Logs from "./pages/Logs";
import CustomerDashboard from "./pages/CustomerDashboard";
import SetupPassword from "./pages/SetupPassword";
import Layout from "./layouts/Layout";

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
  if (user.role !== role) return <Navigate to={user.role === "admin" ? "/admin" : "/customer"} replace />;
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
                <Route path="/users" element={<Users />} />
                <Route path="/logs" element={<Logs />} />
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
              <CustomerDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/setup-password" element={<SetupPassword />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
