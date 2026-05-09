import { Routes, Route, Navigate } from "react-router-dom";
import HomePage from "./pages/HomePage";
import PreMeetingPage from "./pages/PreMeetingPage";
import MeetingRoom from "./pages/MeetingRoom";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/premeeting/:roomId" element={<PreMeetingPage />} />
      <Route path="/meeting/:roomId" element={<ErrorBoundary><MeetingRoom /></ErrorBoundary>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
