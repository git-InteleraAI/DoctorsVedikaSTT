import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import Consultation from "./pages/Consultation";
import ConsultationSummary from "./pages/ConsultationSummary";
import PatientRecord from "./pages/PatientRecord";

function App() {
  return (
    <Router>

      <Routes>

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
          path="/consultation/:patientId"
          element={<Consultation />}
        />

        <Route
          path="/consultation/:patientId/summary"
          element={<ConsultationSummary />}
        />

        <Route
          path="/patients/:patientId"
          element={<PatientRecord />}
        />

      </Routes>

    </Router>
  );
}

export default App;