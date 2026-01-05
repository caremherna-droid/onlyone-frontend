import axios from "axios";

// Get API URL dynamically based on current host
function getApiUrl(): string {
  // Use environment variable if set
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // In browser, check if we're on HTTPS and use HTTPS for backend
  if (typeof window !== "undefined") {
    const isHttps = window.location.protocol === "https:";
    if (isHttps) {
      // Use HTTPS for production backend when frontend is on HTTPS
      return "https://54.83.74.33:4000";
    }
  }
  
  // Default to HTTP for local development
  return "http://54.83.74.33:4000";
}

const api = axios.create({
  baseURL: getApiUrl(),
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export default api;
