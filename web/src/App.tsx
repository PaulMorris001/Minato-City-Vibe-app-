import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Privacy from "./pages/Privacy";
import Csae from "./pages/Csae";
import DeleteAccount from "./pages/DeleteAccount";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/privacy" element={<Privacy />} />
        {/* `/csae-policy` is the path declared in the Google Play Console child
            safety section — keep it stable. `/csae` is a friendly alias. */}
        <Route path="/csae-policy" element={<Csae />} />
        <Route path="/csae" element={<Csae />} />
        <Route path="/delete-account" element={<DeleteAccount />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
