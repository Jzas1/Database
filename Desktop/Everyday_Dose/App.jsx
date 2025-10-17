import { useState, useEffect } from "react";
import Login from "./components/Login";
import ConversionDashboard from "./components/ConversionDashboard";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check auth status on mount
  useEffect(() => {
    fetch("/api/auth")
      .then((res) => res.json())
      .then((data) => {
        setIsAuthenticated(data.authenticated || false);
      })
      .catch(() => {
        setIsAuthenticated(false);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
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