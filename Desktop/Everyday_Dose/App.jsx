import { useState, useEffect } from "react";
import ConversionDashboard from "./components/ConversionDashboard";
import Login from "./components/Login";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    fetch("/api/auth")
      .then((res) => res.json())
      .then((data) => {
        setIsAuthenticated(data.authenticated);
        setIsChecking(false);
      })
      .catch(() => {
        setIsChecking(false);
      });
  }, []);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return <ConversionDashboard />;
}