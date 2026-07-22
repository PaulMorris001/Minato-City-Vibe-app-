import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Privacy from "./pages/Privacy";
import Csae from "./pages/Csae";
import DeleteAccount from "./pages/DeleteAccount";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Events from "./pages/Events";
import EventDetails from "./pages/EventDetails";
import ExternalEventDetails from "./pages/ExternalEventDetails";
import Pay from "./pages/Pay";
import Profile from "./pages/Profile";
import UserProfile from "./pages/UserProfile";
import VendorProfile from "./pages/VendorProfile";
import { AuthProvider } from "./context/AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/privacy" element={<Privacy />} />
          {/* `/csae-policy` is the path declared in the Google Play Console child
              safety section — keep it stable. `/csae` is a friendly alias. */}
          <Route path="/csae-policy" element={<Csae />} />
          <Route path="/csae" element={<Csae />} />
          <Route path="/delete-account" element={<DeleteAccount />} />

          {/* Account + pay-for-events */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:eventId" element={<EventDetails />} />
          <Route path="/events/:eventId/pay" element={<Pay />} />
          <Route path="/external-events/:eventId" element={<ExternalEventDetails />} />

          {/* Profiles — own, other members (event hosts/guests) and vendors */}
          <Route path="/profile" element={<Profile />} />
          <Route path="/u/:userId" element={<UserProfile />} />
          <Route path="/vendors/:vendorId" element={<VendorProfile />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
