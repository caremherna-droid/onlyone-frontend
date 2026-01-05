import { useEffect, useRef, useState, useCallback } from "react";
import api from "../lib/api";
import { useAuth } from "../store/auth";
import { useRouter } from "next/router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { getSocket } from "../lib/socket";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Users, 
  MessageSquare, 
  Send, 
  Heart, 
  X, 
  Square,
  DollarSign,
  Eye,
  Sparkles
} from "lucide-react";

export default function BroadcastPage() {
  const [ratePerMinute, setRatePerMinute] = useState<number>(10);
  const [privateRatePerMinute, setPrivateRatePerMinute] = useState<number>(11);
  const [isPrivate, setIsPrivate] = useState(false);
  const [status, setStatus] = useState<"offline" | "live">("offline");
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0); // Tokens earned during this session
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [reactions, setReactions] = useState<any[]>([]);
  const [joinNotifications, setJoinNotifications] = useState<any[]>([]); // "Ken Joined" notifications
  const [chatInput, setChatInput] = useState("");
  const [showViewersList, setShowViewersList] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const viewerStreamsRef = useRef<Map<string, MediaStream>>(new Map()); // Viewer video streams
  const viewerVideoRefsRef = useRef<Map<string, HTMLVideoElement>>(new Map()); // Video elements for viewer streams
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidate[]>>(
    new Map()
  );
  const socketRef = useRef<any>(null);
  const currentSessionRef = useRef<any>(null);
  const statusRef = useRef<"offline" | "live">("offline");
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processedAnswersRef = useRef<Set<string>>(new Set());
  const creatingPCForRef = useRef<Set<string>>(new Set()); // Track users we're currently creating PCs for
  const [viewerStreamsState, setViewerStreamsState] = useState<Map<string, MediaStream>>(new Map());

  const auth = useAuth();

  // Function to update viewer feeds display
  const updateViewerFeedsDisplay = useCallback(() => {
    setViewerStreamsState(new Map(viewerStreamsRef.current));
  }, []);
  const router = useRouter();

  useEffect(() => {
    if (!auth.token) {
      router.push("/auth/login");
      return;
    }
    loadUserData();

    // Check if we were redirected from Go Live modal with a sessionId
    const { sessionId } = router.query;
    if (sessionId && typeof sessionId === "string") {
      // Session was just created, start video immediately
      const session = { id: sessionId };
      setStatus("live");
      setCurrentSession(session);
      currentSessionRef.current = session;
      statusRef.current = "live";
      setupVideoForSession(sessionId);
    } else {
      // Check for existing active session
      checkActiveSession();
    }
  }, [auth.token, router.query]);

  useEffect(() => {
    // Update refs when state changes
    currentSessionRef.current = currentSession;
    statusRef.current = status;
  }, [currentSession, status]);

  useEffect(() => {
    // Handle cleanup on navigation/route change
    const handleRouteChange = (url: string) => {
      // Don't end session if navigating to the same page (e.g., refresh)
      if (url === router.asPath) return;

      const session = currentSessionRef.current;
      const currentStatus = statusRef.current;
      if (session && currentStatus === "live") {
        console.log("Route change detected, ending session before navigation");
        endSessionOnLeave(session.id).catch((err) => {
          console.error("Error ending session during route change:", err);
        });
      }
    };

    // Listen for route changes (both programmatic and Link clicks)
    router.events?.on("routeChangeStart", handleRouteChange);

    // Also listen for popstate (browser back/forward)
    const handlePopState = () => {
      const session = currentSessionRef.current;
      const currentStatus = statusRef.current;
      if (session && currentStatus === "live") {
        console.log("Browser navigation detected, ending session");
        endSessionOnLeave(session.id).catch((err) => {
          console.error("Error ending session on popstate:", err);
        });
      }
    };
    window.addEventListener("popstate", handlePopState);

    // Handle browser navigation (back/forward/close) - Similar to Jitsi's approach
    // Use 'unload' instead of 'beforeunload' for more reliable cleanup
    const handleUnload = () => {
      const session = currentSessionRef.current;
      const currentStatus = statusRef.current;
      if (session && currentStatus === "live") {
        console.log(
          "[Broadcast] Page unloading, cleaning up session and media"
        );

        // Stop stream immediately - this is critical to release camera/mic
        stopStream();

        // Try to end session via API using sendBeacon or fetch with keepalive
        // sendBeacon is more reliable for page unload scenarios
        const url = `${
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
        }/sessions/${session.id}/end`;
        const token = localStorage.getItem("token");

        if (navigator.sendBeacon) {
          // Use sendBeacon for more reliable delivery during page unload
          const blob = new Blob([JSON.stringify({})], {
            type: "application/json",
          });
          navigator.sendBeacon(url, blob);
        } else {
          // Fallback to fetch with keepalive
          fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            keepalive: true,
            body: JSON.stringify({}),
          }).catch(() => {});
        }
      }
    };

    // Handle visibility change (tab switching, minimizing) - Like Jitsi does
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden - could be minimized or switched away
        // Don't end session, but could pause video if needed
        console.log("[Broadcast] Tab hidden");
      } else {
        // Tab is visible again
        console.log("[Broadcast] Tab visible");
      }
    };

    // Use 'unload' for more reliable cleanup (like Jitsi's disableBeforeUnloadHandlers option)
    // 'beforeunload' can be cancelled by user, 'unload' is more reliable
    window.addEventListener("unload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Cleanup on unmount - this is the most important cleanup
    return () => {
      console.log("[Broadcast] Component unmounting, cleaning up...");

      // Remove all event listeners
      router.events?.off("routeChangeStart", handleRouteChange);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("unload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      // Clear heartbeat interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      // Auto-end session when leaving page - use refs for latest values
      const session = currentSessionRef.current;
      const currentStatus = statusRef.current;
      if (session && currentStatus === "live") {
        console.log(
          "[Broadcast] Unmounting with live session, ending session now"
        );
        endSessionOnLeave(session.id).catch((err) => {
          console.error("[Broadcast] Error ending session on unmount:", err);
        });
      } else if (streamRef.current) {
        console.log("[Broadcast] Stopping remaining tracks on unmount");
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount/unmount

  async function endSessionOnLeave(sessionId: string) {
    if (!sessionId) return;
    try {
      console.log("[Broadcast] Ending session on leave, sessionId:", sessionId);

      // Clear processed answers
      processedAnswersRef.current.clear();

      // Stop stream first - this is critical to stop the camera
      await stopStream();

      // Remove socket listeners
      const socket = socketRef.current;
      if (socket) {
        socket.off("user_joined");
        socket.off("user_left");
        socket.off("viewer_count");
        socket.off("chat_message");
        socket.off("session_ended");
        socket.off("webrtc-answer");
        socket.off("webrtc-ice");
      }

      // Then end session
      await api.post(`/sessions/${sessionId}/end`);
      // Update refs
      currentSessionRef.current = null;
      statusRef.current = "offline";
      console.log("[Broadcast] Session ended on leave");
    } catch (e) {
      console.error("[Broadcast] Error ending session on leave:", e);
      // Even if API call fails, ensure stream is stopped
      await stopStream();
    }
  }

  async function loadUserData() {
    try {
      const { data } = await api.get("/auth/me");
      if (data.user.role !== "BROADCASTER") {
        if (
          confirm(
            "You need to become a creator to go live. Become a creator now?"
          )
        ) {
          router.push("/become-creator");
        } else {
          router.push("/");
        }
        return;
      }
      setRatePerMinute(data.user.ratePerMinute || 10);
      setPrivateRatePerMinute(data.user.privateRatePerMinute || 11);
    } catch {}
  }

  async function checkActiveSession() {
    try {
      const { data } = await api.get("/sessions");
      const mySession = data.sessions.find(
        (s: any) => s.broadcaster.id === auth.user?.id && s.status === "LIVE"
      );
      if (mySession) {
        setStatus("live");
        setCurrentSession(mySession);
        currentSessionRef.current = mySession;
        statusRef.current = "live";
        // If already live, set up the video
        setupVideoForSession(mySession.id);
      }
    } catch {}
  }

  async function saveRates() {
    try {
      await api.patch("/users/me", {
        ratePerMinute,
        privateRatePerMinute,
      });
      alert("Rates saved!");
    } catch (e: any) {
      alert(e?.response?.data?.error || "Failed to save rates");
    }
  }

  async function stopStream() {
    console.log("Stopping stream...");

    // FIRST: Remove tracks from peer connection senders and stop them
    // This is critical because tracks added to peer connections stay active
    const allTracks = new Set<MediaStreamTrack>();

    // Collect and remove all tracks from peer connections before closing them
    peerConnectionsRef.current.forEach((pc, userId) => {
      try {
        // Get all senders (which contain the tracks)
        pc.getSenders().forEach(async (sender) => {
          if (sender.track) {
            const track = sender.track;
            allTracks.add(track);
            console.log(
              `Found track in peer connection for ${userId}: ${track.kind}, id: ${track.id}`
            );
            // Remove the track from the sender first
            try {
              await sender.replaceTrack(null);
            } catch (e) {
              console.error(
                `Error removing track from sender for ${userId}:`,
                e
              );
            }
          }
        });
        // Get all receivers (for completeness, though we're the broadcaster)
        pc.getReceivers().forEach((receiver) => {
          if (receiver.track) {
            allTracks.add(receiver.track);
          }
        });
        // Close the peer connection
        pc.close();
      } catch (e) {
        console.error(`Error closing peer connection for ${userId}:`, e);
      }
    });
    peerConnectionsRef.current.clear();
    iceCandidateQueueRef.current.clear();

    // SECOND: Stop all tracks from the main stream
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      console.log(`Stopping ${tracks.length} media tracks from main stream`);
      tracks.forEach((track) => {
        allTracks.add(track);
        console.log(
          `Found track in main stream: ${track.kind}, id: ${track.id}, enabled: ${track.enabled}, readyState: ${track.readyState}`
        );
      });
      streamRef.current = null;
    }

    // THIRD: Clear video element FIRST (before stopping tracks)
    if (localVideoRef.current) {
      // Get tracks from video element if any
      if (localVideoRef.current.srcObject) {
        const videoStream = localVideoRef.current.srcObject as MediaStream;
        videoStream.getTracks().forEach((track) => {
          allTracks.add(track);
        });
      }
      localVideoRef.current.srcObject = null;
      localVideoRef.current.pause();
      // Force load empty source
      localVideoRef.current.load();
    }

    // FOURTH: Stop ALL tracks (from all sources) - do this AFTER removing from senders
    console.log(`Stopping ${allTracks.size} total unique tracks`);
    allTracks.forEach((track) => {
      try {
        if (track.readyState !== "ended") {
          console.log(
            `Stopping track: ${track.kind}, id: ${track.id}, readyState: ${track.readyState}`
          );
          track.stop(); // This stops the track and releases the camera/mic
          track.enabled = false;
        } else {
          console.log(`Track already ended: ${track.kind}, id: ${track.id}`);
        }
      } catch (e) {
        console.error("Error stopping track:", e);
      }
    });

    // FIFTH: Force garbage collection hint by clearing all references
    // Wait a moment to ensure tracks are fully stopped
    await new Promise((resolve) => setTimeout(resolve, 100));

    // SIXTH: Disconnect socket and leave session
    if (socketRef.current) {
      const sessionId = currentSessionRef.current?.id || currentSession?.id;
      if (sessionId) {
        try {
          socketRef.current.emit("leave_session", { sessionId });
        } catch (e) {
          console.error("Error emitting leave_session:", e);
        }
      }
    }
    socketRef.current = null;

    console.log("Stream stopped successfully");
  }

  async function setupVideoForSession(sessionId: string) {
    try {
      // Remove all existing socket listeners first to prevent duplicates
      const socket = getSocket();

      // Get camera and microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: true,
      });

      streamRef.current = stream;

      // Show local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Setup socket - ensure it's connected and authenticated
      socketRef.current = socket;

      // Ensure socket is connected before joining session
      // This is critical for the broadcaster to be tracked as active
      if (socket.connected) {
        socket.emit("join_session", { sessionId });
      } else {
        await new Promise<void>((resolve) => {
          if (socket.connected) {
            resolve();
          } else {
            socket.once("connect", () => resolve());
            socket.connect();
          }
        });
        socket.emit("join_session", { sessionId });
      }

      // Define WebRTC handlers first (before socket.off calls)
      // Handle WebRTC signaling - use a Set to track processed answers
      const handleWebRTCAnswer = async ({ fromUserId, answer }: any) => {
        const answerKey = `${fromUserId}-${answer?.sdp?.substring(0, 50)}`;
        if (processedAnswersRef.current.has(answerKey)) {
          console.log(
            `[Broadcast] Ignoring duplicate answer for ${fromUserId} (already processed)`
          );
          return;
        }

        console.log("[Broadcast] [FRONTEND] webrtc-answer received", {
          fromUserId,
          answerPresent: !!answer,
          answerType: answer?.type,
        });
        const pc = peerConnectionsRef.current.get(fromUserId);
        if (pc && answer) {
          try {
            // Check connection state first
            if (pc.signalingState === "closed") {
              console.log(
                `[Broadcast] Ignoring answer for ${fromUserId}, connection is closed`
              );
              return;
            }

            // Check if we're in the correct state to set remote description
            // We need to be in 'have-local-offer' state (we sent offer, waiting for answer)
            // If we're in 'stable', it means both descriptions are already set
            if (pc.signalingState === "stable") {
              if (pc.remoteDescription) {
                console.log(
                  `[Broadcast] Already in stable state with remote description for ${fromUserId}, ignoring duplicate answer`
                );
                processedAnswersRef.current.add(answerKey); // Mark as processed to prevent retries
                return;
              } else {
                // This shouldn't happen, but handle it
                console.warn(
                  `[Broadcast] In stable state but no remote description for ${fromUserId}, attempting to set`
                );
              }
            }

            // Only set remote description if we don't already have one AND we're in correct state
            if (
              !pc.remoteDescription &&
              (pc.signalingState === "have-local-offer" ||
                pc.signalingState === "stable")
            ) {
              console.log(
                `[Broadcast] [FRONTEND] Setting remote description for ${fromUserId}`,
                {
                  signalingState: pc.signalingState,
                  hasLocalDescription: !!pc.localDescription,
                  hasRemoteDescription: !!pc.remoteDescription,
                }
              );

              await pc.setRemoteDescription(new RTCSessionDescription(answer));
              processedAnswersRef.current.add(answerKey);

              console.log(
                `[Broadcast] [FRONTEND] Remote description set successfully for ${fromUserId}`,
                {
                  newSignalingState: pc.signalingState,
                }
              );

              // Add any queued ICE candidates now that remote description is set
              const queuedCandidates =
                iceCandidateQueueRef.current.get(fromUserId) || [];
              if (queuedCandidates.length > 0) {
                console.log(
                  `[Broadcast] Processing ${queuedCandidates.length} queued ICE candidates for ${fromUserId}`
                );
              }
              for (const candidate of queuedCandidates) {
                try {
                  await pc.addIceCandidate(candidate);
                } catch (e) {
                  console.error(
                    "[Broadcast] Error adding queued ICE candidate:",
                    e
                  );
                }
              }
              // Clear the queue
              iceCandidateQueueRef.current.delete(fromUserId);
            } else {
              console.log(
                `[Broadcast] Cannot set remote description for ${fromUserId}`,
                {
                  hasRemoteDescription: !!pc.remoteDescription,
                  signalingState: pc.signalingState,
                  reason: pc.remoteDescription
                    ? "already set"
                    : `wrong state: ${pc.signalingState}`,
                }
              );
              // Mark as processed even if we can't set it (to prevent retries)
              processedAnswersRef.current.add(answerKey);
            }
          } catch (e: any) {
            console.error(
              "[Broadcast] [FRONTEND] Error setting remote description:",
              e,
              {
                fromUserId,
                signalingState: pc.signalingState,
                hasLocalDescription: !!pc.localDescription,
                hasRemoteDescription: !!pc.remoteDescription,
                errorName: e?.name,
                errorMessage: e?.message,
              }
            );
            // If error is because we're in wrong state, mark as processed to prevent retries
            if (
              e?.message?.includes("wrong state") ||
              e?.message?.includes("stable")
            ) {
              processedAnswersRef.current.add(answerKey);
            }
          }
        }
      };

      const handleWebRTCIce = async ({ fromUserId, candidate }: any) => {
        console.log("[Broadcast] webrtc-ice received", {
          fromUserId,
          hasCandidate: !!candidate,
        });
        const pc = peerConnectionsRef.current.get(fromUserId);
        if (pc && candidate) {
          try {
            // Check if remote description is set before adding ICE candidate
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
              // Queue the candidate if remote description is not set yet
              const queue = iceCandidateQueueRef.current.get(fromUserId) || [];
              queue.push(new RTCIceCandidate(candidate));
              iceCandidateQueueRef.current.set(fromUserId, queue);
            }
          } catch (e) {
            console.error("Error adding ICE candidate:", e);
          }
        }
      };

      // Define named handlers for proper cleanup
      const handleUserJoined = async (eventData: any) => {
        const {
        sessionId: incomingSessionId,
        userId,
        username,
          isAdmin,
        } = eventData || {};
        // Add join notification
        const notification = {
          username: username || "Someone",
          id: Date.now() + Math.random(),
        };
        setJoinNotifications((prev) => [...prev, notification]);
        // Remove notification after 5 seconds
        setTimeout(() => {
          setJoinNotifications((prev) =>
            prev.filter((n) => n.id !== notification.id)
          );
        }, 5000);
        // #region agent log
        fetch(
          "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "broadcast.tsx:582",
              message: "user_joined event received",
              data: {
                incomingSessionId,
                userId,
                username,
                currentSessionId: sessionId,
                hasExistingPC: peerConnectionsRef.current.has(userId),
                isCreating: creatingPCForRef.current.has(userId),
                allPCs: Array.from(peerConnectionsRef.current.keys()),
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run1",
              hypothesisId: "M",
            }),
          }
        ).catch(() => {});
        // #endregion
        if (incomingSessionId !== sessionId) {
          return;
        }
        console.log(`[Broadcast] user_joined event received`, {
          userId,
          username,
          sessionId: incomingSessionId,
          isAdmin: isAdmin || false,
          hasStream: !!streamRef.current,
          streamActive: streamRef.current?.active,
          streamVideoTracks: streamRef.current?.getVideoTracks().length || 0,
          streamAudioTracks: streamRef.current?.getAudioTracks().length || 0,
          currentSessionId: sessionId,
          sessionMatch: incomingSessionId === sessionId,
        });

        // Check if peer connection already exists for this user
        const existingPC = peerConnectionsRef.current.get(userId);
        if (existingPC) {
          // Check if it's still valid (not closed)
          if (
            existingPC.connectionState !== "closed" &&
            existingPC.signalingState !== "closed"
          ) {
            // If the viewer (or admin) re-joined and may have missed the original offer,
            // re-send the current offer (or renegotiate) so they can setRemoteDescription.
            try {
              const socketNow = socketRef.current;
              const existingLocal = existingPC.localDescription;
              const canResendExistingOffer =
                !!existingLocal && existingLocal.type === "offer";
              // #region agent log
              fetch(
                "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    location: "broadcast.tsx:657",
                    message: "Existing PC on user_joined; attempting re-offer",
                    data: {
                      userId,
                      username,
                      sessionId,
                      pcConnectionState: existingPC.connectionState,
                      pcSignalingState: existingPC.signalingState,
                      hasLocalDescription: !!existingLocal,
                      localDescriptionType: existingLocal?.type,
                      localSdpLength: existingLocal?.sdp?.length,
                      socketConnected: !!socketNow?.connected,
                      canResendExistingOffer,
                    },
                    timestamp: Date.now(),
                    sessionId: "debug-session",
                    runId: "run1",
                    hypothesisId: "ADMIN_REOFFER",
                  }),
                }
              ).catch(() => {});
              // #endregion

              if (socketNow?.connected) {
                if (canResendExistingOffer) {
                  socketNow.emit("webrtc-offer", {
                    sessionId,
                    to: `user:${userId}`,
                    offer: existingLocal,
                  });
                  // #region agent log
                  fetch(
                    "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        location: "broadcast.tsx:692",
                        message: "Re-emitted existing webrtc-offer for existing PC",
                        data: { userId, sessionId, offerType: existingLocal?.type },
                        timestamp: Date.now(),
                        sessionId: "debug-session",
                        runId: "run1",
                        hypothesisId: "ADMIN_REOFFER",
                      }),
                    }
                  ).catch(() => {});
                  // #endregion
                } else {
                  // Renegotiate: create a fresh offer and emit.
                  const newOffer = await existingPC.createOffer();
                  await existingPC.setLocalDescription(newOffer);
                  socketNow.emit("webrtc-offer", {
                    sessionId,
                    to: `user:${userId}`,
                    offer: existingPC.localDescription,
                  });
                  // #region agent log
                  fetch(
                    "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        location: "broadcast.tsx:716",
                        message: "Renegotiated and emitted new webrtc-offer for existing PC",
                        data: {
                          userId,
                          sessionId,
                          offerType: existingPC.localDescription?.type,
                          offerSdpLength: existingPC.localDescription?.sdp?.length,
                        },
                        timestamp: Date.now(),
                        sessionId: "debug-session",
                        runId: "run1",
                        hypothesisId: "ADMIN_REOFFER",
                      }),
                    }
                  ).catch(() => {});
                  // #endregion
                }
              }
            } catch (e: any) {
              // #region agent log
              fetch(
                "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    location: "broadcast.tsx:744",
                    message: "Re-offer attempt failed",
                    data: { userId, sessionId, error: e?.message, name: e?.name },
                    timestamp: Date.now(),
                    sessionId: "debug-session",
                    runId: "run1",
                    hypothesisId: "ADMIN_REOFFER",
                  }),
                }
              ).catch(() => {});
              // #endregion
            }

            // #region agent log
            fetch(
              "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  location: "broadcast.tsx:596",
                  message: "Peer connection exists and valid, skipping",
                  data: {
                    userId,
                    username,
                    existingPCState: existingPC.connectionState,
                    existingSignalingState: existingPC.signalingState,
                  },
                  timestamp: Date.now(),
                  sessionId: "debug-session",
                  runId: "run1",
                  hypothesisId: "N",
                }),
              }
            ).catch(() => {});
            // #endregion
          console.log(
            `Peer connection already exists for ${username}, skipping`
          );
          return;
          } else {
            // Connection is closed, remove it and create a new one
            console.log(
              `[Broadcast] Existing peer connection for ${username} is closed, removing and recreating`
            );
            try {
              existingPC.close();
            } catch (e) {
              console.error(`[Broadcast] Error closing closed PC:`, e);
            }
            peerConnectionsRef.current.delete(userId);
          }
        }

        // Check if we're already creating a peer connection for this user
        if (creatingPCForRef.current.has(userId)) {
          // #region agent log
          fetch(
            "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                location: "broadcast.tsx:610",
                message: "Already creating PC for user, skipping",
                data: { userId, username },
                timestamp: Date.now(),
                sessionId: "debug-session",
                runId: "run1",
                hypothesisId: "V",
              }),
            }
          ).catch(() => {});
          // #endregion
          console.log(
            `[Broadcast] Already creating peer connection for ${username}, skipping duplicate`
          );
          return;
        }

        // Mark as creating
        creatingPCForRef.current.add(userId);

        // #region agent log
        fetch(
          "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "broadcast.tsx:618",
              message: "Creating new peer connection",
              data: { userId, username },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run1",
              hypothesisId: "O",
            }),
          }
        ).catch(() => {});
        // #endregion
        // Ensure stream is available before creating peer connection
        const currentStream = streamRef.current || stream;
        if (!currentStream) {
          console.error(`[Broadcast] No stream available for ${username} (userId: ${userId}), cannot create peer connection. Waiting for stream...`);
          // Wait a bit for stream to be ready (might be initializing)
          setTimeout(() => {
            const retryStream = streamRef.current || stream;
            if (retryStream) {
              console.log(`[Broadcast] Stream now available for ${username}, creating peer connection`);
              createPeerConnection(userId, sessionId, retryStream).catch((err) => {
                creatingPCForRef.current.delete(userId);
                console.error(`[Broadcast] Error creating peer connection for ${username} (retry):`, err);
              });
            } else {
              console.error(`[Broadcast] Stream still not available for ${username} after retry`);
              creatingPCForRef.current.delete(userId);
            }
          }, 2000);
          return;
        }
        
        console.log(`[Broadcast] Creating peer connection for ${username} (userId: ${userId})`, {
          hasStream: !!currentStream,
          streamActive: currentStream.active,
          videoTracks: currentStream.getVideoTracks().length,
          audioTracks: currentStream.getAudioTracks().length,
        });
        
        // Create peer connection for new viewer (or admin)
        createPeerConnection(userId, sessionId, currentStream).catch((err) => {
          // Remove from creating set on error
          creatingPCForRef.current.delete(userId);
          console.error(
            `[Broadcast] Error creating peer connection for ${username} (userId: ${userId}):`,
            err
          );
        });
      };

      const handleUserLeft = ({ username }: any) => {
        console.log(`${username} left`);
      };

      const handleViewerCount = ({ count, sessionId: eventSessionId }: any) => {
        console.log("[Broadcast] Viewer count update:", count);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/pages/broadcast.tsx:917',message:'broadcaster received viewer_count',data:{count,eventSessionId,currentSessionId:sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{})
        // #endregion
        setViewerCount(count);
      };

      const handleSessionStats = (data: any) => {
        console.log("[Broadcast] Session stats update:", data);
        setViewerCount(data.viewerCount ?? viewerCount);
        setTotalEarnings(data.totalEarnings ?? totalEarnings);
      };

      const handleReaction = (data: any) => {
        const newReaction = {
          emoji: data.emoji || "❤️",
          x: Math.random(),
          id: Date.now() + Math.random(),
        };
        setReactions((prev) => [...prev, newReaction]);
        // Remove reaction after animation
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
        }, 3000);
      };


      const handleChatMessage = (msg: any) => {
        // Auto-scroll chat to bottom
        setTimeout(() => {
          if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop =
              chatScrollRef.current.scrollHeight;
          }
        }, 100);
        // #region agent log
        fetch(
          "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "broadcast.tsx:738",
              message: "chat_message received on broadcaster",
              data: {
                fromUserId: msg.userId,
                username: msg.username,
                text: msg.message,
                currentMessagesCount: chatMessages.length,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run-chat",
              hypothesisId: "CHAT_BROADCAST",
            }),
          }
        ).catch(() => {});
        // #endregion

        console.log('Broadcaster received chat_message:', msg)
        setChatMessages((prev) => {
          // Prevent duplicates by checking userId, message, and timestamp
          const exists = prev.some((m: any) => 
            m.userId === msg.userId && 
            m.message === msg.message && 
            Math.abs(new Date(m.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 1000
          )
          if (exists) {
            console.log('Duplicate chat message ignored:', msg)
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/pages/broadcast.tsx:977',message:'duplicate chat message ignored',data:{userId:msg.userId,message:msg.message,timestamp:msg.timestamp},timestamp:Date.now(),sessionId:'debug-session',runId:'run-chat',hypothesisId:'DUPLICATE'})}).catch(()=>{})
            // #endregion
            return prev
          }
          return [...prev, msg]
        });
      };

      const handleSessionEnded = (payload: any) => {
        console.log("[Broadcast] Received session_ended event:", payload);
        handleRemoteSessionEnded(payload);
      };

      // Remove existing handlers (using named handlers)
      socket.off("user_joined", handleUserJoined);
      socket.off("user_left", handleUserLeft);
      socket.off("viewer_count", handleViewerCount);
      socket.off("session_stats", handleSessionStats);
      socket.off("reaction", handleReaction);
      socket.off("chat_message", handleChatMessage);
      socket.off("session_ended", handleSessionEnded);
      socket.off("webrtc-answer", handleWebRTCAnswer);
      socket.off("webrtc-ice", handleWebRTCIce);

      // Register handlers
      socket.on("user_joined", handleUserJoined);
      socket.on("user_left", handleUserLeft);
      socket.on("viewer_count", handleViewerCount);
      socket.on("session_stats", handleSessionStats);
      socket.on("reaction", handleReaction);
      socket.on("chat_message", handleChatMessage);
      socket.on("session_ended", handleSessionEnded);

      // Heartbeat mechanism to keep session alive (update updatedAt timestamp)
      // This helps detect stale sessions - if heartbeat stops, session is stale
      // Similar to how Jitsi tracks active sessions
      heartbeatIntervalRef.current = setInterval(async () => {
        if (currentSessionRef.current && statusRef.current === "live") {
          try {
            // Send heartbeat to update session's updatedAt timestamp
            await api
              .post(`/sessions/${currentSessionRef.current.id}/heartbeat`)
              .catch(() => {
                // Ignore errors - session might have ended
              });
          } catch (e) {
            // Ignore heartbeat errors
          }
        }
      }, 30000); // Every 30 seconds

      // Register WebRTC handlers (already defined above)
      socket.on("webrtc-answer", handleWebRTCAnswer);
      socket.on("webrtc-ice", handleWebRTCIce);
    } catch (error: any) {
      console.error("Error accessing camera/microphone:", error);
      alert("Failed to access camera/microphone. Please allow permissions.");
    }
  }

  async function createPeerConnection(
    viewerId: string,
    sessionId: string,
    stream: MediaStream
  ) {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "broadcast.tsx:666",
        message: "Creating peer connection",
        data: {
          viewerId,
          sessionId,
          streamId: stream.id,
          streamActive: stream.active,
          videoTracks: stream.getVideoTracks().length,
          audioTracks: stream.getAudioTracks().length,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "I",
      }),
    }).catch(() => {});
    // #endregion
    console.log("[Broadcast] Creating RTCPeerConnection for viewer", viewerId, {
      hasStream: !!stream,
      streamActive: stream.active,
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
    });
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    // Add local stream tracks
    stream.getTracks().forEach((track) => {
      console.log("[Broadcast] [FRONTEND] Adding track to peer connection", {
        viewerId,
        kind: track.kind,
        trackId: track.id,
        enabled: track.enabled,
        readyState: track.readyState,
        muted: track.muted,
        streamId: stream.id,
        streamActive: stream.active,
      });
      pc.addTrack(track, stream);
    });

    // Log sender info after adding tracks
    setTimeout(() => {
      const senders = pc.getSenders();
      console.log(
        "[Broadcast] [FRONTEND] Peer connection senders after adding tracks",
        {
          viewerId,
          senderCount: senders.length,
          senders: senders.map((s) => ({
            trackId: s.track?.id,
            trackKind: s.track?.kind,
            trackEnabled: s.track?.enabled,
            trackReadyState: s.track?.readyState,
            trackMuted: s.track?.muted,
          })),
        }
      );
    }, 100);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      // #region agent log
      fetch(
        "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "broadcast.tsx:726",
            message: "ICE candidate generated",
            data: {
              viewerId,
              hasCandidate: !!event.candidate,
              candidateType: event.candidate?.type,
              connectionState: pc.connectionState,
              iceConnectionState: pc.iceConnectionState,
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "run1",
            hypothesisId: "U",
          }),
        }
      ).catch(() => {});
      // #endregion
      if (event.candidate) {
        console.log("[Broadcast] Sending ICE candidate to viewer", {
          viewerId,
        });
        const socket = getSocket();
        socket.emit("webrtc-ice", {
          sessionId,
          to: `user:${viewerId}`,
          candidate: event.candidate,
        });
      }
    };

    // Create and send offer
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "broadcast.tsx:729",
        message: "Creating offer",
        data: {
          viewerId,
          signalingState: pc.signalingState,
          hasLocalDesc: !!pc.localDescription,
          sendersCount: pc.getSenders().length,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "J",
      }),
    }).catch(() => {});
    // #endregion
    // Handle remote stream (for bidirectional communication in private rooms)
    pc.ontrack = (event) => {
      console.log("[Broadcast] Received track from viewer", {
        viewerId,
        kind: event.track.kind,
        streamId: event.streams[0]?.id,
      });
      // Store viewer stream for display when creator video is disabled
      if (event.streams && event.streams.length > 0) {
        viewerStreamsRef.current.set(viewerId, event.streams[0]);
        // Create video element if it doesn't exist
        if (!viewerVideoRefsRef.current.has(viewerId)) {
          const videoElement = document.createElement("video");
          videoElement.autoplay = true;
          videoElement.playsInline = true;
          videoElement.muted = false;
          videoElement.className = "w-full h-full object-cover";
          viewerVideoRefsRef.current.set(viewerId, videoElement);
        }
        // Set stream to video element
        const videoElement = viewerVideoRefsRef.current.get(viewerId);
        if (videoElement) {
          videoElement.srcObject = event.streams[0];
        }
        // Force re-render to show viewer feeds
        updateViewerFeedsDisplay();
      }
    };

    console.log("[Broadcast] [FRONTEND] Creating offer for viewer", viewerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "broadcast.tsx:731",
        message: "Offer created and local desc set",
        data: {
          viewerId,
          offerType: offer.type,
          offerSdpLength: offer.sdp?.length,
          signalingState: pc.signalingState,
          hasLocalDesc: !!pc.localDescription,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "K",
      }),
    }).catch(() => {});
    // #endregion
    console.log(
      "[Broadcast] [FRONTEND] Local description set for viewer",
      viewerId,
      {
        offerType: offer.type,
        offerSdpLength: offer.sdp?.length,
        localDescriptionType: pc.localDescription?.type,
        signalingState: pc.signalingState,
      }
    );

    const socket = getSocket();
    console.log(
      "[Broadcast] [FRONTEND] Emitting webrtc-offer to viewer",
      viewerId,
      {
        sessionId,
        to: `user:${viewerId}`,
        hasOffer: !!pc.localDescription,
        offerType: pc.localDescription?.type,
        socketConnected: socket.connected,
      }
    );
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "broadcast.tsx:755",
        message: "Emitting webrtc-offer",
        data: {
          viewerId,
          sessionId,
          to: `user:${viewerId}`,
          hasOffer: !!pc.localDescription,
          offerType: pc.localDescription?.type,
          socketConnected: socket.connected,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "L",
      }),
    }).catch(() => {});
    // #endregion
    socket.emit("webrtc-offer", {
      sessionId,
      to: `user:${viewerId}`,
      offer: pc.localDescription,
    });

    // Store peer connection immediately to prevent duplicates
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "broadcast.tsx:761",
        message: "Storing peer connection",
        data: {
          viewerId,
          hadExisting: peerConnectionsRef.current.has(viewerId),
          totalPCs: peerConnectionsRef.current.size,
          pcState: pc.connectionState,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "P",
      }),
    }).catch(() => {});
    // #endregion
    peerConnectionsRef.current.set(viewerId, pc);

    // Remove from creating set now that PC is stored
    creatingPCForRef.current.delete(viewerId);
  }

  async function goLive() {
    try {
      // First save rates
      await api.patch("/users/me", {
        ratePerMinute,
        privateRatePerMinute,
      });

      // Ensure socket is connected BEFORE starting session
      // This ensures the broadcaster is tracked as active
      const socket = getSocket();
      if (!socket.connected) {
        socket.connect();
        // Wait for connection with timeout
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Socket connection timeout")),
            5000
          );
          if (socket.connected) {
            clearTimeout(timeout);
            resolve();
          } else {
            socket.once("connect", () => {
              clearTimeout(timeout);
              resolve();
            });
          }
        });
      }

      // Then start the session
      const { data } = await api.post("/sessions/start", { isPrivate });
      console.log("[Broadcast] Setting status to live, session:", data.session);
      setStatus("live");
      setCurrentSession(data.session);
      currentSessionRef.current = data.session;
      statusRef.current = "live";
      console.log("[Broadcast] Status set to live, current status:", status);

      // Setup video immediately - this will request camera/mic access
      // This will also emit join_session which adds broadcaster to activeBroadcasters
      await setupVideoForSession(data.session.id);
    } catch (e: any) {
      alert(e?.response?.data?.error || "Failed to go live");
    }
  }

  async function stopLive() {
    if (!currentSession) return;

    try {
      // Clear heartbeat interval first
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      // Clear processed answers
      processedAnswersRef.current.clear();

      // Stop stream FIRST - this stops the camera immediately
      console.log("[Broadcast] Ending live session, stopping stream first...");
      await stopStream();

      // Remove socket listeners
      const socket = socketRef.current;
      if (socket) {
        socket.off("user_joined");
        socket.off("user_left");
        socket.off("viewer_count");
        socket.off("chat_message");
        socket.off("session_ended");
        socket.off("webrtc-answer");
        socket.off("webrtc-ice");
      }

      // Then end the session on the backend
      await api.post(`/sessions/${currentSession.id}/end`);

      // Update state
      setStatus("offline");
      setCurrentSession(null);
      currentSessionRef.current = null;
      statusRef.current = "offline";
      setViewerCount(0);
      setChatMessages([]);

      // Redirect to dashboard after ending session
      router.push("/creators/dashboard");
    } catch (e: any) {
      console.error("[Broadcast] Error ending session:", e);
      // Even if API call fails, ensure stream is stopped
      await stopStream();
      alert(e?.response?.data?.error || "Failed to end session");
    }
  }

  async function handleRemoteSessionEnded(payload?: {
    reason?: string;
    message?: string;
  }) {
    const message = payload?.message || "Session has ended.";
    const endedSessionId = currentSessionRef.current?.id;
    console.log(
      "[Broadcast] Handling remote session ended event:",
      payload,
      "currentSession:",
      endedSessionId
    );

    // Clear heartbeat interval
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    // Clear processed answers
    processedAnswersRef.current.clear();

    // Remove socket listeners
    const socket = socketRef.current;
    if (socket) {
      socket.off("user_joined");
      socket.off("user_left");
      socket.off("viewer_count");
      socket.off("chat_message");
      socket.off("session_ended");
      socket.off("webrtc-answer");
      socket.off("webrtc-ice");
    }

    try {
      await stopStream();
    } catch (error) {
      console.error(
        "[Broadcast] Error stopping stream after remote session end:",
        error
      );
    }

    setStatus("offline");
    setCurrentSession(null);
    currentSessionRef.current = null;
    statusRef.current = "offline";
    setViewerCount(0);
    setChatMessages([]);

    alert(message);
    router.push("/creators/dashboard");
  }

  function sendChatMessage() {
    if (!chatInput.trim() || !currentSession) return;
    const socket = getSocket();
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/pages/broadcast.tsx:1467',message:'broadcaster sending chat message',data:{sessionId:currentSession.id,message:chatInput,socketConnected:socket.connected},timestamp:Date.now(),sessionId:'debug-session',runId:'run-chat',hypothesisId:'CHAT_SEND'})}).catch(()=>{})
    // #endregion
    socket.emit("chat_message", {
      sessionId: currentSession.id,
      message: chatInput,
    });
    setChatInput("");
  }

  function sendReaction(emoji: string) {
    if (!currentSession) return;
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit("reaction", { sessionId: currentSession.id, emoji });
    }
  }

  function toggleVideo() {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoEnabled;
      setVideoEnabled(!videoEnabled);
    }
  }

  function toggleAudio() {
    if (!streamRef.current) return;
    const audioTrack = streamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioEnabled;
      setAudioEnabled(!audioEnabled);
    }
  }

  // Debug: Log current status
  console.log("[Broadcast] Render - status:", status, "currentSession:", !!currentSession);
  
  return (
    <main className="min-h-screen p-6 girly-bg">
      {status === "offline" ? (
        <div className="flex items-center justify-center min-h-[80vh]">
          <Card className="w-full max-w-xl bg-gradient-to-br from-white via-purple-50 to-pink-50 border-2 border-purple-200 shadow-2xl hover:shadow-purple-300 transition-all duration-500">
            <CardHeader className="text-center pb-2">
              <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 animate-pulse">
                🚀 Go Live
              </h1>
              <p className="text-sm text-gray-600 mt-1">Start your live streaming session</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 mb-2 font-semibold">
                  💰 Public Rate (tokens per minute)
                </label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    className="flex-1 bg-gradient-to-r from-white to-purple-50 border-2 border-purple-300 focus:border-purple-500 focus:ring-purple-500 rounded-xl shadow-lg hover:shadow-purple-200 transition-all duration-300 text-center font-bold text-purple-700"
                    value={ratePerMinute}
                    onChange={(e) => setRatePerMinute(Number(e.target.value))}
                  />
                  <Button
                    variant="outline"
                    onClick={saveRates}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-none shadow-lg hover:shadow-purple-300 transition-all duration-300 font-bold"
                  >
                    💾 Save
                  </Button>
                </div>
                <p className="text-xs text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-pink-500 mt-1 font-medium">
                  ≈ {Math.ceil((ratePerMinute / 60) * 10)} 💎 per 10 seconds
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-red-600 mb-2 font-semibold">
                  🔒 Private Rate (tokens per minute)
                </label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    className="flex-1 bg-gradient-to-r from-white to-pink-50 border-2 border-pink-300 focus:border-pink-500 focus:ring-pink-500 rounded-xl shadow-lg hover:shadow-pink-200 transition-all duration-300 text-center font-bold text-pink-700"
                    value={privateRatePerMinute}
                    onChange={(e) =>
                      setPrivateRatePerMinute(Number(e.target.value))
                    }
                  />
                  <Button
                    variant="outline"
                    onClick={saveRates}
                    className="bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-600 hover:to-red-600 text-white border-none shadow-lg hover:shadow-pink-300 transition-all duration-300 font-bold"
                  >
                    💾 Save
                  </Button>
                </div>
                <p className="text-xs text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-red-500 mt-1 font-medium">
                  ≈ {Math.ceil((privateRatePerMinute / 60) * 10)} 🔒💎 per 10 seconds
                </p>
              </div>
              <div className="flex items-center gap-3 bg-gradient-to-r from-purple-50 to-pink-50 p-3 rounded-xl border border-purple-200">
                <input
                  type="checkbox"
                  id="private"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="w-5 h-5 text-purple-600 bg-purple-100 border-purple-300 rounded focus:ring-purple-500 focus:ring-2"
                />
                <label htmlFor="private" className="text-sm font-medium text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 cursor-pointer">
                  🔒 Start as private room
                </label>
              </div>
              <Button
                onClick={goLive}
                className="w-full bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 hover:from-purple-600 hover:via-pink-600 hover:to-red-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-purple-300 transition-all duration-300 transform hover:scale-105 text-lg"
              >
                🎥 Go Live {isPrivate ? "(🔒 Private)" : "(🌍 Public)"}
              </Button>
              <div className="pt-4 border-t-2 border-pink-200">
                <a
                  href="/creators/dashboard"
                  className="text-sm text-pink-600 hover:underline"
                >
                  → View Dashboard & Stats
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="fixed inset-0 bg-black">
          {/* Full-width Video */}
          <div className="absolute inset-0">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
              className={`w-full h-full object-cover ${
                !videoEnabled ? "hidden" : ""
              }`}
            />
            {!videoEnabled && (
              <ViewerFeedsGrid
                viewerStreams={viewerStreamsState}
                viewerVideoRefs={viewerVideoRefsRef.current}
              />
            )}
          </div>

          {/* Top Bar - Modern Live Style */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed top-0 left-0 right-0 z-[10000] bg-gradient-to-b from-black/95 via-black/85 to-transparent pt-safe backdrop-blur-xl border-b border-white/10"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000 }}
          >
            <div className="flex justify-between items-center px-2 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4 flex-shrink-0">
                {/* LIVE Badge with Animation */}
                <motion.div
                  animate={{
                    scale: [1, 1.08, 1],
                    boxShadow: [
                      "0 0 0 0 rgba(239, 68, 68, 0.8)",
                      "0 0 0 8px rgba(239, 68, 68, 0)",
                      "0 0 0 0 rgba(239, 68, 68, 0.8)"
                    ]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="bg-gradient-to-r from-red-500 via-red-600 to-red-500 text-white px-2 sm:px-3 md:px-5 py-1.5 sm:py-2 md:py-2.5 rounded-full flex items-center gap-1 sm:gap-2 md:gap-2.5 text-xs sm:text-sm font-bold shadow-2xl border-2 border-red-300/50"
                >
                  <motion.span
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 bg-white rounded-full shadow-lg"
                  ></motion.span>
                  <span className="text-xs sm:text-sm md:text-base tracking-wide">LIVE</span>
                </motion.div>

                {/* Viewer Count with Animation */}
                <motion.div
                  whileHover={{ scale: 1.08 }}
                  className="bg-gradient-to-r from-indigo-600/90 via-purple-600/90 to-pink-600/90 backdrop-blur-md text-white px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5 rounded-full flex items-center gap-1 sm:gap-2 md:gap-2.5 text-xs sm:text-sm font-bold shadow-xl border border-white/30"
                >
                  <motion.div
                    animate={{ rotate: [0, 15, -15, 0] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                  >
                    <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" />
                  </motion.div>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={viewerCount}
                      initial={{ opacity: 0, scale: 0.7, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.7, y: 5 }}
                      className="font-bold text-xs sm:text-sm md:text-base"
                    >
                      {viewerCount}
                    </motion.span>
                  </AnimatePresence>
                </motion.div>

                {/* Tokens Earned with Animation */}
                <motion.div
                  whileHover={{ scale: 1.08 }}
                  className="flex bg-gradient-to-r from-amber-500/90 via-yellow-500/90 to-orange-500/90 backdrop-blur-md text-white px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5 rounded-full items-center gap-1 sm:gap-2 md:gap-2.5 text-xs sm:text-sm font-bold shadow-xl border border-white/30"
                >
                  <motion.div
                    animate={{
                      rotate: [0, 20, -20, 0],
                      scale: [1, 1.15, 1]
                    }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                  >
                    <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4" />
                  </motion.div>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={totalEarnings}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="font-bold text-xs sm:text-sm md:text-base"
                    >
                      {totalEarnings}
                    </motion.span>
                  </AnimatePresence>
                </motion.div>
              </div>
              {/* End Button - Always visible when live */}
              <motion.button
                onClick={stopLive}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                animate={{
                  boxShadow: [
                    "0 0 0 0 rgba(239, 68, 68, 0.6)",
                    "0 0 0 6px rgba(239, 68, 68, 0)",
                    "0 0 0 0 rgba(239, 68, 68, 0.6)"
                  ]
                }}
                transition={{
                  boxShadow: {
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }
                }}
                className="bg-gradient-to-r from-red-600 via-red-500 to-red-600 hover:from-red-700 hover:via-red-600 hover:to-red-700 text-white px-3 sm:px-5 md:px-8 py-2 sm:py-2.5 md:py-3.5 rounded-full text-xs sm:text-sm md:text-base font-bold transition-all shadow-2xl border-2 border-red-300/60 flex items-center gap-1.5 sm:gap-2 md:gap-3 min-w-[80px] sm:min-w-[120px] md:min-w-[160px] justify-center relative flex-shrink-0"
                style={{ position: 'relative', zIndex: 10001 }}
              >
                <Square className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" fill="currentColor" />
                <span className="hidden sm:inline">End Live</span>
                <span className="sm:hidden">End</span>
              </motion.button>
            </div>
          </motion.div>

          {/* Join Notifications */}
          {joinNotifications.map((notification) => (
            <div
              key={notification.id}
              className="absolute top-24 left-1/2 -translate-x-1/2 z-30 bg-black/70 text-white px-4 py-2 rounded-full text-sm font-bold animate-slide-in-left"
            >
              {notification.username} joined
            </div>
          ))}

          {/* Chat Messages - Left Side */}
          <div className="fixed left-2 sm:left-4 md:left-6 top-20 sm:top-24 md:top-28 bottom-32 sm:bottom-36 md:bottom-40 w-56 sm:w-64 md:w-72 lg:w-80 z-[9999] pointer-events-none max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] md:max-w-none" style={{ zIndex: 9999 }}>
            <div
              ref={chatScrollRef}
              className="h-full overflow-y-auto space-y-2 sm:space-y-2.5 md:space-y-3 pr-1 sm:pr-1.5 md:pr-2"
              style={{ scrollBehavior: "smooth" }}
            >
              {chatMessages.map((msg, i) => (
                <motion.div
                  key={`${msg.userId}-${msg.timestamp || i}-${msg.message}-${i}`}
                  initial={{ opacity: 0, x: -30, scale: 0.85 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.85 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 25,
                    delay: 0.1
                  }}
                  className="bg-gradient-to-br from-purple-600/80 via-pink-600/80 to-rose-600/80 backdrop-blur-xl text-white p-2.5 sm:p-3 md:p-4 rounded-xl sm:rounded-2xl pointer-events-auto border-2 border-white/20 shadow-2xl"
                >
                  <div className="flex items-start gap-3">
                    <motion.div
                      whileHover={{ scale: 1.15, rotate: 5 }}
                      className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0 shadow-xl border-2 border-white/30"
                    >
                      {msg.username?.[0]?.toUpperCase() || "A"}
                    </motion.div>
                    <div className="flex-1 min-w-0">
                      <motion.div
                        className="font-bold text-xs sm:text-sm mb-1 sm:mb-1.5 text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-pink-300 to-purple-300"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                      >
                        {msg.username || "Anonymous"}
                      </motion.div>
                      <motion.div
                        className="text-xs sm:text-sm break-words text-white/95"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                      >
                        {msg.message}
                      </motion.div>
                    </div>
                    </div>
                </motion.div>
              ))}
              </div>
            </div>

          {/* Reactions Overlay */}
          <div className="absolute inset-0 pointer-events-none z-20">
            <AnimatePresence>
            {reactions.map((reaction) => (
                <motion.div
                key={reaction.id}
                  initial={{
                    opacity: 0,
                    scale: 0.5,
                    x: reaction.x * 100 + '%',
                    y: '80%'
                  }}
                  animate={{
                    opacity: [0, 1, 1, 0],
                    scale: [0.5, 1.2, 1, 0.8],
                    x: reaction.x * 100 + '%',
                    y: ['80%', '20%', '10%'],
                    rotate: [0, 15, -15, 0]
                  }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{
                    duration: 3,
                    ease: "easeOut",
                    times: [0, 0.1, 0.8, 1]
                  }}
                  className="absolute text-5xl pointer-events-none"
                style={{
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                }}
              >
                {reaction.emoji}
                </motion.div>
            ))}
            </AnimatePresence>
                </div>

      {/* Bottom Controls Bar - Modern Design */}
      <div className="fixed bottom-0 left-0 right-0 z-[10000] bg-gradient-to-t from-black/95 via-black/85 to-transparent pb-safe backdrop-blur-xl border-t border-white/10">
        <div className="flex flex-col gap-3 sm:gap-4 md:gap-5 px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6">
          {/* Chat Input Row */}
          <div className="flex gap-2 sm:gap-2.5 md:gap-3">
            <div className="flex-1 relative min-w-0">
              <MessageSquare className="absolute left-2 sm:left-3 md:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5 text-white/60" />
              <input
                type="text"
                className="w-full bg-black/70 backdrop-blur-md text-white pl-8 sm:pl-10 md:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 md:py-4 rounded-full border-2 border-white/30 focus:outline-none focus:border-pink-500 focus:ring-2 sm:focus:ring-4 focus:ring-pink-500/30 transition-all placeholder:text-white/50 text-sm sm:text-base"
                placeholder="Type a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && sendChatMessage()}
              />
            </div>
            <motion.button
              onClick={sendChatMessage}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 hover:from-pink-600 hover:via-rose-600 hover:to-pink-700 text-white px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 md:py-4 rounded-full text-xs sm:text-sm md:text-base font-bold transition-all shadow-xl border-2 border-pink-300/50 flex items-center gap-1 sm:gap-1.5 md:gap-2 flex-shrink-0"
            >
              <Send className="w-4 h-4 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" />
              <span className="hidden sm:inline">Send</span>
            </motion.button>
            <motion.button
              onClick={() => {
                const emojis = ["❤️", "🔥", "👍", "😍", "🎉"];
                const emoji = emojis[Math.floor(Math.random() * emojis.length)];
                sendReaction(emoji);
              }}
              whileHover={{ scale: 1.1, rotate: 10 }}
              whileTap={{ scale: 0.9 }}
              className="bg-gradient-to-r from-red-500/90 to-pink-500/90 backdrop-blur-md hover:from-red-600 hover:to-pink-600 text-white px-3 sm:px-4 md:px-5 py-2.5 sm:py-3 md:py-4 rounded-full border-2 border-white/30 transition-all shadow-xl flex items-center justify-center flex-shrink-0"
            >
              <Heart className="w-4 h-4 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" fill="currentColor" />
            </motion.button>
          </div>
          {/* Controls Row */}
          <div className="flex justify-center items-center gap-3 sm:gap-4 md:gap-5">
            {/* Viewers List Button */}
            <motion.button
              onClick={() => setShowViewersList(!showViewersList)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-indigo-600/90 to-purple-600/90 backdrop-blur-md border-2 border-white/40 flex items-center justify-center text-white hover:from-indigo-500 hover:to-purple-500 transition-all shadow-2xl"
            >
              <Users className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
            </motion.button>
            {/* Toggle Video */}
            <motion.button
              onClick={toggleVideo}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className={`w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full backdrop-blur-md border-2 flex items-center justify-center text-white transition-all shadow-2xl ${
                videoEnabled
                  ? "bg-gradient-to-br from-green-600/90 to-emerald-600/90 border-green-300/60 hover:from-green-500 hover:to-emerald-500"
                  : "bg-gradient-to-br from-red-600/90 to-rose-600/90 border-red-300/60 hover:from-red-500 hover:to-rose-500"
              }`}
            >
              {videoEnabled ? (
                <Video className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
              ) : (
                <VideoOff className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
              )}
            </motion.button>
            {/* Toggle Audio */}
            <motion.button
              onClick={toggleAudio}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className={`w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full backdrop-blur-md border-2 flex items-center justify-center text-white transition-all shadow-2xl ${
                audioEnabled
                  ? "bg-gradient-to-br from-blue-600/90 to-cyan-600/90 border-blue-300/60 hover:from-blue-500 hover:to-cyan-500"
                  : "bg-gradient-to-br from-red-600/90 to-rose-600/90 border-red-300/60 hover:from-red-500 hover:to-rose-500"
              }`}
            >
              {audioEnabled ? (
                <Mic className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
              ) : (
                <MicOff className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
              )}
            </motion.button>
          </div>
        </div>
      </div>

          {/* Viewers List Modal */}
          {showViewersList && (
            <div
              className="fixed inset-0 bg-black/70 z-30 flex items-center justify-center"
              onClick={() => setShowViewersList(false)}
            >
              <div
                className="bg-white rounded-2xl p-6 max-w-md w-full mx-4"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-2xl font-bold mb-4">Viewers</h2>
                <p className="text-gray-600 mb-4">
                  {viewerCount} {viewerCount === 1 ? "viewer" : "viewers"}{" "}
                  watching
                </p>
                <button
                  onClick={() => setShowViewersList(false)}
                  className="w-full bg-pink-500 text-white py-2 rounded-lg font-semibold hover:bg-pink-600 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* CSS Animations */}
          <style jsx>{`
            @keyframes slideInLeft {
              from {
                opacity: 0;
                transform: translateX(-20px);
              }
              to {
                opacity: 1;
                transform: translateX(0);
              }
            }
            @keyframes reactionFloat {
              0% {
                opacity: 1;
                transform: translateY(0) scale(0.5);
              }
              100% {
                opacity: 0;
                transform: translateY(-100px) scale(1.5);
              }
            }
            .animate-slide-in-left {
              animation: slideInLeft 0.4s ease-out;
            }
            .animate-reaction-float {
              animation: reactionFloat 3s ease-out forwards;
            }
          `}</style>
        </div>
      )}
    </main>
  );
}

// Viewer Feeds Grid Component
function ViewerFeedsGrid({
  viewerStreams,
  viewerVideoRefs,
}: {
  viewerStreams: Map<string, MediaStream>;
  viewerVideoRefs: Map<string, HTMLVideoElement>;
}) {
  const viewerIds = Array.from(viewerStreams.keys());
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Attach video elements to the grid
    if (gridRef.current) {
      gridRef.current.innerHTML = "";
      viewerIds.forEach((viewerId) => {
        const videoElement = viewerVideoRefs.get(viewerId);
        if (videoElement) {
          const container = document.createElement("div");
          container.className = "relative w-full h-full rounded-lg overflow-hidden border border-white/20";
          container.appendChild(videoElement);
          gridRef.current?.appendChild(container);
        }
      });
    }
  }, [viewerIds, viewerVideoRefs]);

  if (viewerIds.length === 0) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-6xl mb-4">📹</div>
          <p className="text-white/70">No viewers with video</p>
        </div>
      </div>
    );
  }

  // Calculate grid layout
  const cols = viewerIds.length === 1 ? 1 : viewerIds.length <= 4 ? 2 : 3;
  const gridColsClass = `grid-cols-${cols}`;

  return (
    <div className="w-full h-full p-4">
      <div
        ref={gridRef}
        className={`grid ${gridColsClass} gap-4 h-full`}
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
        }}
      />
    </div>
  );
}
