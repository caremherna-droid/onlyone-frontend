import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Utility function to merge class names (cn = className)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Utility function to get API base URL for constructing image URLs
export function getApiBaseUrl(): string {
  // Use environment variable if set, otherwise use production backend
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // Use production backend URL
  return "http://54.83.74.33:4000";
}

// Helper function to construct full image URL from relative path
export function getImageUrl(path: string | null | undefined): string {
  if (!path) return "";
  // If path is already a full URL, return it
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  // If path starts with /, remove it
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${getApiBaseUrl()}/${cleanPath}`;
}
