import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

function getApiUrl() {
  // Use environment variable if set, otherwise use production backend
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // Use production backend URL
  return "https://8c9806fb10e6.ngrok-free.app";
}

export function getSocket() {
  const currentToken =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const tokenWithBearer = currentToken ? `Bearer ${currentToken}` : undefined;

  if (!socket) {
    // Create socket but don't auto-connect; we set auth first so server sees correct token at handshake
    socket = io(getApiUrl() + "/signaling", {
      auth: { token: tokenWithBearer },
      autoConnect: false, // IMPORTANT: connect after configuring auth
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      transports: ["websocket", "polling"],
    });

    socket.on("connect_error", (err) => {
      console.warn("[socket] connect_error", err?.message || err);
    });

    // Optionally debug connect/disconnect
    socket.on("connect", () => console.debug("[socket] connected", socket?.id));
    socket.on("disconnect", (reason) =>
      console.debug("[socket] disconnected", reason)
    );
  } else {
    // Socket exists - check if token changed
    const currentAuth = (socket.auth as any)?.token;
    if (currentAuth !== tokenWithBearer) {
      socket.auth = { token: tokenWithBearer };
      // Reconnect so server gets new auth
      if (socket.connected) {
        socket.disconnect();
      }
    }
  }

  // Ensure connected (explicit connect)
  if (!socket.connected) {
    try {
      socket.connect();
    } catch (e) {
      console.warn("[socket] connect() failed", e);
    }
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

