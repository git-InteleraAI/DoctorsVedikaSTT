import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import Appointments from "./pages/Appointments";
import Consultation from "./pages/Consultation";
import ConsultationSummary from "./pages/ConsultationSummary";
import PatientRecord from "./pages/PatientRecord";
import Patients from "./pages/Patients";
import DoctorLogin from "./pages/DoctorLogin";
import DoctorSignup from "./pages/DoctorSignup";
import DoctorOnboarding from "./pages/DoctorOnboarding";
import Availability from "./pages/Availability";
import VideosAndShorts from "./pages/VideosAndShorts";
import QnA from "./pages/QnA";
import AuthCallback from "./pages/AuthCallback";
import { AuthProvider } from "./context/AuthContext";

import Profile from "./pages/Profile";

function App() {
  return (
    <AuthProvider>
      <Router>

      <Routes>

        {/* Auth Callback Route */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Doctor Authentication Routes */}
        <Route
          path="/login"
          element={<DoctorLogin />}
        />

        <Route
          path="/signup"
          element={<DoctorSignup />}
        />

        <Route
          path="/onboarding"
          element={<DoctorOnboarding />}
        />


        {/* DO NOT TOUCH */}
        <Route
          path="/"
          element={<LandingPage />}
        />

        <Route
          path="/dashboard"
          element={<Dashboard />}
        />

        <Route
          path="/appointments"
          element={<Appointments />}
        />

        <Route
          path="/availability"
          element={<Availability />}
        />

        <Route
          path="/consultation/:patientId"
          element={<Consultation />}
        />

        <Route
          path="/consultation/:patientId/summary"
          element={<ConsultationSummary />}
        />

        <Route
          path="/patients"
          element={<Patients />}
        />

        <Route
          path="/patients/:patientId"
          element={<PatientRecord />}
        />

        <Route
          path="/videos"
          element={<VideosAndShorts />}
        />

        <Route
          path="/qna"
          element={<QnA />}
        />

        <Route
          path="/profile"
          element={<Profile />}
        />

      </Routes>

      </Router>
    </AuthProvider>
  );
}

export default App;