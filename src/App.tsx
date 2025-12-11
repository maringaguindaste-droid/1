import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import EmployeeForm from "./pages/EmployeeForm";
import EmployeeDetails from "./pages/EmployeeDetails";
import Documents from "./pages/Documents";
import DocumentForm from "./pages/DocumentForm";
import DocumentTypes from "./pages/DocumentTypes";
import AdminPanel from "./pages/AdminPanel";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Notifications from "./pages/Notifications";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <CompanyProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
              <Route path="/employees" element={<ProtectedRoute><Layout><Employees /></Layout></ProtectedRoute>} />
              <Route path="/employees/new" element={<ProtectedRoute requireAdmin><Layout><EmployeeForm /></Layout></ProtectedRoute>} />
              <Route path="/employees/:id" element={<ProtectedRoute requireAdmin><Layout><EmployeeForm /></Layout></ProtectedRoute>} />
              <Route path="/employees/:id/view" element={<ProtectedRoute><Layout><EmployeeDetails /></Layout></ProtectedRoute>} />
              <Route path="/employees/details/:id" element={<ProtectedRoute><Layout><EmployeeDetails /></Layout></ProtectedRoute>} />
              <Route path="/documents" element={<ProtectedRoute><Layout><Documents /></Layout></ProtectedRoute>} />
              <Route path="/documents/new" element={<ProtectedRoute requireAdmin><Layout><DocumentForm /></Layout></ProtectedRoute>} />
              <Route path="/documents/:id/edit" element={<ProtectedRoute requireAdmin><Layout><DocumentForm /></Layout></ProtectedRoute>} />
              <Route path="/document-types" element={<ProtectedRoute requireAdmin><Layout><DocumentTypes /></Layout></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute requireAdmin><Layout><AdminPanel /></Layout></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute requireAdmin><Layout><Settings /></Layout></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute><Layout><Notifications /></Layout></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </CompanyProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
