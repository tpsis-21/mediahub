import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { I18nProvider } from "./contexts/I18nContext";
import Index from "./pages/Index";
import AppPage from "./pages/AppPage";
import NotFound from "./pages/NotFound";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AdminPage from "./components/AdminModal";

const AdminRoute = () => {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground" role="status" aria-live="polite">
        Carregando…
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  if (user.type !== "admin") return <Navigate to="/app" replace />;
  return <AdminPage mode="page" />;
};

const App = () => (
  <TooltipProvider>
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/reset" element={<ResetPasswordPage />} />
              <Route path="/app" element={<AppPage />} />
              <Route path="/admin" element={<AdminRoute />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  </TooltipProvider>
);

export default App;
