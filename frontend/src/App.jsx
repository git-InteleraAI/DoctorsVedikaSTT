import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import Appointments from "./pages/Appointments";
import Consultation from "./pages/Consultation";
import ConsultationSummary from "./pages/ConsultationSummary";
import PatientRecord from "./pages/PatientRecord";
import Patients from "./pages/Patients";
import DoctorLogin from "./pages/DoctorLogin";
import DoctorOnboarding from "./pages/DoctorOnboarding";
import ResetPassword from "./pages/ResetPassword";
import Availability from "./pages/Availability";
import VideosAndShorts from "./pages/VideosAndShorts";
import QnA from "./pages/QnA";
import AuthCallback from "./pages/AuthCallback";
import { AuthProvider } from "./context/AuthContext";

import Profile from "./pages/Profile";
import StaffPortal from "./pages/StaffPortal";
import HospitalAdmin from "./pages/HospitalAdmin";

import ProtectedRoute from "./components/ProtectedRoute";

import QRIntakeEntry from "./pages/QRIntake/QRIntakeEntry";
import QRPatientForm from "./pages/QRIntake/QRPatientForm";
import QRIntakeChat from "./pages/QRIntake/QRIntakeChat";
import QREducationVideos from "./pages/QRIntake/QREducationVideos";

function App() {
  return (
    <AuthProvider>
      <Router>

      <Routes>

        {/* Auth Callback Route */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Portal Authentication Routes */}
        <Route
          path="/login"
          element={<DoctorLogin portal="doctor" />}
        />

        <Route
          path="/admin/login"
          element={<DoctorLogin portal="admin" />}
        />

        <Route
          path="/staff/login"
          element={<DoctorLogin portal="staff" />}
        />

        <Route
          path="/signup"
          element={<Navigate to="/login" replace />}
        />

        <Route
          path="/onboarding"
          element={<Navigate to="/dashboard" replace />}
        />

        <Route
          path="/reset-password"
          element={<ResetPassword />}
        />


        {/* Landing Page */}
        <Route
          path="/"
          element={<LandingPage />}
        />

        {/* Protected App Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* QR Intake Entry Route */}
        <Route
          path="/qr/:hospitalCode"
          element={<QRIntakeEntry />}
        />

        <Route
          path="/qr/:hospitalCode/patient"
          element={<QRPatientForm />}
        />

        <Route
          path="/qr/:hospitalCode/chat/:accessToken"
          element={<QRIntakeChat />}
        />

        <Route
        path="/qr/:hospitalCode/education/:accessToken"
       element={<QREducationVideos />}
        />

        <Route
          path="/appointments"
          element={
            <ProtectedRoute>
              <Appointments />
            </ProtectedRoute>
          }
        />

        <Route
          path="/availability"
          element={
            <ProtectedRoute>
              <Availability />
            </ProtectedRoute>
          }
        />

        <Route
          path="/consultation/:visitId"
          element={
            <ProtectedRoute>
              <Consultation />
            </ProtectedRoute>
          }
        />

        <Route
          path="/consultation/:visitId/summary"
          element={
            <ProtectedRoute>
              <ConsultationSummary />
            </ProtectedRoute>
          }
        />

        <Route
          path="/patients"
          element={
            <ProtectedRoute>
              <Patients />
            </ProtectedRoute>
          }
        />

        <Route
          path="/patients/:patientId"
          element={
            <ProtectedRoute>
              <PatientRecord />
            </ProtectedRoute>
          }
        />

        <Route
          path="/videos"
          element={
            <ProtectedRoute>
              <VideosAndShorts />
            </ProtectedRoute>
          }
        />

        <Route
          path="/qna"
          element={
            <ProtectedRoute>
              <QnA />
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        <Route
          path="/staff"
          element={
            <ProtectedRoute>
              <StaffPortal />
            </ProtectedRoute>
          }
        />

        <Route
          path="/staff/*"
          element={
            <ProtectedRoute>
              <StaffPortal />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <HospitalAdmin />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/*"
          element={
            <ProtectedRoute>
              <HospitalAdmin />
            </ProtectedRoute>
          }
        />

        <Route
          path="/hospital-admin"
          element={
            <ProtectedRoute>
              <HospitalAdmin />
            </ProtectedRoute>
          }
        />

        <Route
          path="/hospital-admin/*"
          element={
            <ProtectedRoute>
              <HospitalAdmin />
            </ProtectedRoute>
          }
        />


      </Routes>

      </Router>
    </AuthProvider>
  );
}

export default App;