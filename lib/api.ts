import axios from "axios";

// Get API URL dynamically based on current host
function getApiUrl(): string {
  // Use environment variable if set, otherwise use production backend
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // Use production backend URL
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
