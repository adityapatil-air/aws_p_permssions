import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import LandingPage from "./components/LandingPage";
import LoginSelector from "./components/LoginSelector";
import OwnerAuth from "./components/OwnerAuth";
import MemberAuth from "./components/MemberAuth";
import OwnerBucketSetup from "./components/OwnerBucketSetup";
import OwnerDashboard from "./components/OwnerDashboard";
import OwnerDashboardSimple from "./components/OwnerDashboardSimple";
import FileManager from "./components/FileManager";
import AcceptInvite from "./components/AcceptInvite";
import SharedFolder from "./components/SharedFolder";
import ProtectedRoute from "./components/ProtectedRoute";
import CSVCleaner from "./components/CSVCleaner";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginSelector />} />
          <Route path="/owner-auth" element={<OwnerAuth />} />
          <Route path="/member-auth" element={<MemberAuth />} />
          <Route path="/owner-bucket-setup" element={<OwnerBucketSetup />} />
          <Route path="/owner-dashboard" element={
            <ProtectedRoute>
              <OwnerDashboard />
            </ProtectedRoute>
          } />
          <Route path="/owner-dashboard-simple" element={
            <ProtectedRoute>
              <OwnerDashboardSimple />
            </ProtectedRoute>
          } />
          <Route path="/file-manager" element={
            <ProtectedRoute requireAuth={false}>
              <FileManager />
            </ProtectedRoute>
          } />
          <Route path="/accept-invite/:token" element={<AcceptInvite />} />
          <Route path="/shared-folder/:shareId" element={<SharedFolder />} />
          <Route path="/shared/:shareId" element={<SharedFolder />} />
          <Route path="/csv-cleaner" element={<CSVCleaner />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
