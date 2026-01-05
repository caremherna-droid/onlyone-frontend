import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { getSocket } from "../lib/socket";
import api from "../lib/api";
import { useAuth } from "../store/auth";
import { Button } from "../components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  MessageSquare, 
  Send, 
  Heart, 
  X, 
  ChevronLeft,
  ChevronRight,
  LogOut
} from "lucide-react";

export default function LivePage() {
  const router = useRouter();
  const { sessionId } = router.query;
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null); // Track remote stream like VideoTalk
  const socketRef = useRef<any>(null);
  const offerProcessedRef = useRef(false);
  const alertShownRef = useRef(false); // Prevent multiple alerts
  const processingOfferRef = useRef(false); // Prevent parallel offer processing
  const iceCandidateQueueRef = useRef<RTCIceCandidate[]>([]); // Queue ICE candidates until remote description is set
  const joiningSessionRef = useRef(false); // Prevent multiple simultaneous joinSession calls
  const pcSessionIdRef = useRef<string | null>(null); // Track which sessionId the PC is for

  const [status, setStatus] = useState("connecting");
  const [session, setSession] = useState<any>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [consumedSeconds, setConsumedSeconds] = useState(0);
  const [tokensSpent, setTokensSpent] = useState(0);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [reactions, setReactions] = useState<any[]>([]);
  const [allSessions, setAllSessions] = useState<any[]>([]);
  const [currentSessionIndex, setCurrentSessionIndex] = useState(0);
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const auth = useAuth();

  useEffect(() => {
    if (!auth.token) return;

    // Load all active sessions
    loadAllSessions();

    if (sessionId) {
      loadSession();
      joinSession();
    }

    // Log video element state periodically
    const videoCheckInterval = setInterval(() => {
      if (remoteVideoRef.current) {
        const videoEl = remoteVideoRef.current;
        console.log("[Viewer] [FRONTEND] Video element periodic check", {
          hasSrcObject: !!videoEl.srcObject,
          srcObjectType: videoEl.srcObject?.constructor?.name,
          paused: videoEl.paused,
          ended: videoEl.ended,
          readyState: videoEl.readyState,
          videoWidth: videoEl.videoWidth,
          videoHeight: videoEl.videoHeight,
          currentTime: videoEl.currentTime,
          dimensions: {
            width: videoEl.offsetWidth,
            height: videoEl.offsetHeight,
          },
          clientDimensions: {
            width: videoEl.clientWidth,
            height: videoEl.clientHeight,
          },
          visible: videoEl.offsetWidth > 0 && videoEl.offsetHeight > 0,
          display: window.getComputedStyle(videoEl).display,
          visibility: window.getComputedStyle(videoEl).visibility,
          opacity: window.getComputedStyle(videoEl).opacity,
          zIndex: window.getComputedStyle(videoEl).zIndex,
          position: window.getComputedStyle(videoEl).position,
          inViewport:
            videoEl.getBoundingClientRect().width > 0 &&
            videoEl.getBoundingClientRect().height > 0,
        });

        // Check if stream has active tracks
        if (videoEl.srcObject instanceof MediaStream) {
          const stream = videoEl.srcObject;
          console.log("[Viewer] [FRONTEND] Stream state check", {
            streamActive: stream.active,
            streamId: stream.id,
            videoTracks: stream.getVideoTracks().length,
            audioTracks: stream.getAudioTracks().length,
            videoTracksEnabled: stream.getVideoTracks().map((t) => ({
              id: t.id,
              enabled: t.enabled,
              readyState: t.readyState,
              muted: t.muted,
            })),
            audioTracksEnabled: stream.getAudioTracks().map((t) => ({
              id: t.id,
              enabled: t.enabled,
              readyState: t.readyState,
              muted: t.muted,
            })),
          });
        }
      }
    }, 5000); // Check every 5 seconds

    return () => {
      clearInterval(videoCheckInterval);
      // Auto-end session when leaving page
      leaveSession();
      // Cleanup
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
        pcSessionIdRef.current = null;
      }
    };
  }, [sessionId, auth.token]);

  useEffect(() => {
    // Update current session index when sessionId changes
    if (sessionId && allSessions.length > 0) {
      const index = allSessions.findIndex((s) => s.id === sessionId);
      if (index !== -1) {
        setCurrentSessionIndex(index);
      }
    }
  }, [sessionId, allSessions]);

  async function loadAllSessions() {
    try {
      const { data } = await api.get("/sessions");
      const sessions = data.sessions || [];
      setAllSessions(sessions);

      // If no sessionId in URL but we have sessions, navigate to first one
      if (!sessionId && sessions.length > 0) {
        router.replace(`/live?sessionId=${sessions[0].id}`, undefined, {
          shallow: true,
        });
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  }

  async function loadSession() {
    try {
      const { data } = await api.get(`/sessions/${sessionId}`);
      setSession(data.session);
    } catch {}
  }

  async function joinSession() {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "live.tsx:152",
        message: "joinSession called",
        data: {
          sessionId,
          hasExistingPC: !!pcRef.current,
          existingPCState: pcRef.current?.connectionState,
          isJoining: joiningSessionRef.current,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "S",
      }),
    }).catch(() => {});
    // #endregion
    if (!sessionId) return;

    // Prevent multiple simultaneous calls
    if (joiningSessionRef.current) {
      console.log("[Viewer] Already joining session, skipping duplicate call");
      return;
    }

    // Check if we already have a valid peer connection for THIS session
    if (
      pcRef.current &&
      pcSessionIdRef.current === sessionId &&
      pcRef.current.signalingState !== "closed" &&
      pcRef.current.connectionState !== "closed"
    ) {
      console.log(
        "[Viewer] Valid peer connection already exists for this session, skipping joinSession"
      );
      return;
    }

    joiningSessionRef.current = true;

    try {
      console.log("[Viewer] Joining session", sessionId);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/pages/live.tsx:205',message:'viewer calling join API',data:{sessionId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{})
      // #endregion
      // Join session via API
      const joinResponse = await api.post(`/sessions/${sessionId}/join`);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/pages/live.tsx:207',message:'viewer join API response',data:{sessionId,hasViewer:!!joinResponse.data?.viewer,viewerId:joinResponse.data?.viewer?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{})
      // #endregion

      // Check if session is still live
      if (joinResponse.data?.session?.status !== "LIVE") {
        if (!alertShownRef.current) {
          alertShownRef.current = true;
          if (confirm("This session has ended.\n\nClick OK to return to browse page.")) {
            leaveSession().finally(() => {
              router.push("/browse");
            });
          } else {
            alertShownRef.current = false;
          }
        }
        router.push("/browse");
        return;
      }

      // Load session to check if it's private
      const sessionData = await api.get(`/sessions/${sessionId}`);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/pages/live.tsx:218',message:'viewer loaded session data',data:{sessionId,viewersCount:sessionData.data.session?.viewers?.length||0,viewers:sessionData.data.session?.viewers?.map((v:any)=>({id:v.id,username:v.user?.username,isAdmin:v.isAdmin}))||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{})
      // #endregion
      const isPrivate = sessionData.data.session.isPrivate;
      setSession(sessionData.data.session);

      // Only request camera/mic for private rooms, and make it optional
      // For public rooms, viewers don't need camera/mic - just watch
      // For private rooms, start with video/audio off, user can enable them later
      let stream: MediaStream | null = null;

      // Setup WebRTC peer connection
      // Close existing connection if any
      if (pcRef.current) {
        // #region agent log
        fetch(
          "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "live.tsx:179",
              message: "Closing existing peer connection",
              data: {
                hadPC: !!pcRef.current,
                oldState: pcRef.current?.connectionState,
                oldSignalingState: pcRef.current?.signalingState,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run1",
              hypothesisId: "Q",
            }),
          }
        ).catch(() => {});
        // #endregion
        try {
          pcRef.current.close();
        } catch (e) {
          console.error("[Viewer] Error closing existing peer connection:", e);
        }
      }

      // #region agent log
      fetch(
        "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "live.tsx:187",
            message: "Creating new peer connection",
            data: { sessionId },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "run1",
            hypothesisId: "R",
          }),
        }
      ).catch(() => {});
      // #endregion
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
      pcRef.current = pc;
      const normalizedSessionId =
        typeof sessionId === 'string' ? sessionId : Array.isArray(sessionId) ? sessionId[0] : ''
      pcSessionIdRef.current = normalizedSessionId; // Track which session this PC is for
      offerProcessedRef.current = false; // Reset flag for new session
      processingOfferRef.current = false; // Reset processing lock
      iceCandidateQueueRef.current = []; // Clear ICE candidate queue

      // Handle remote stream (broadcaster's video) - VideoTalk approach with fallback
      // VideoTalk: Simple direct assignment when stream arrives
      pc.ontrack = (e) => {
        // #region agent log
        fetch(
          "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "live.tsx:200",
              message: "ontrack fired",
              data: {
                kind: e.track.kind,
                id: e.track.id,
                enabled: e.track.enabled,
                readyState: e.track.readyState,
                muted: e.track.muted,
                streamsCount: e.streams.length,
                streamId: e.streams[0]?.id,
                connectionState: pc.connectionState,
                iceConnectionState: pc.iceConnectionState,
                signalingState: pc.signalingState,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run1",
              hypothesisId: "A",
            }),
          }
        ).catch(() => {});
        // #endregion
        console.log(
          "[Viewer] [FRONTEND] Received remote track (VideoTalk approach):",
          {
            kind: e.track.kind,
            id: e.track.id,
            enabled: e.track.enabled,
            readyState: e.track.readyState,
            muted: e.track.muted,
            streams: e.streams.length,
            streamId: e.streams[0]?.id,
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
            signalingState: pc.signalingState,
          }
        );

        // Check if track is actually sending data
        if (e.track.kind === 'video') {
          console.log("[Viewer] [FRONTEND] Video track details:", {
            enabled: e.track.enabled,
            muted: e.track.muted,
            readyState: e.track.readyState,
            settings: e.track.getSettings ? e.track.getSettings() : 'N/A',
          });
          
          // If track is muted, it might not be sending data
          if (e.track.muted) {
            console.warn("[Viewer] [FRONTEND] WARNING: Video track is muted - may not be sending data!");
          }
        }

        if (e.streams && e.streams.length > 0 && remoteVideoRef.current) {
          // VideoTalk approach: Get stream from track event and set srcObject directly
          const stream = e.streams[0];
          const videoEl = remoteVideoRef.current;

          // If this is a new stream, set it (VideoTalk does this directly)
          if (
            !remoteStreamRef.current ||
            remoteStreamRef.current.id !== stream.id
          ) {
            console.log(
              "[Viewer] [FRONTEND] Setting video stream (VideoTalk approach)",
              {
                streamId: stream.id,
                videoTracks: stream.getVideoTracks().length,
                audioTracks: stream.getAudioTracks().length,
              }
            );

            // #region agent log
            fetch(
              "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  location: "live.tsx:234",
                  message: "Setting video srcObject",
                  data: {
                    streamId: stream.id,
                    videoTracks: stream.getVideoTracks().length,
                    audioTracks: stream.getAudioTracks().length,
                    trackStates: stream.getVideoTracks().map((t) => ({
                      id: t.id,
                      enabled: t.enabled,
                      readyState: t.readyState,
                      muted: t.muted,
                    })),
                    connectionState: pc.connectionState,
                  },
                  timestamp: Date.now(),
                  sessionId: "debug-session",
                  runId: "run1",
                  hypothesisId: "B",
                }),
              }
            ).catch(() => {});
            // #endregion
            // VideoTalk: Direct assignment - videoEl.srcObject = stream
            videoEl.srcObject = stream;
            remoteStreamRef.current = stream;

            // Log video track state
            const videoTracks = stream.getVideoTracks();
            if (videoTracks.length > 0) {
              const videoTrack = videoTracks[0];
              console.log("[Viewer] [FRONTEND] Video track state after setting stream:", {
                enabled: videoTrack.enabled,
                muted: videoTrack.muted,
                readyState: videoTrack.readyState,
                id: videoTrack.id,
              });
              
              // If track is muted, warn about it
              if (videoTrack.muted) {
                console.warn("[Viewer] [FRONTEND] WARNING: Video track is muted - video may not display!");
              }
            }

            // Force video to play - try multiple times if needed
            const attemptPlay = async () => {
              try {
                // Ensure video is not paused
                if (videoEl.paused) {
                  await videoEl.play();
                }
                // Force play even if not paused
                if (videoEl.paused) {
                  videoEl.play().catch(() => {});
                }
              } catch (e) {
                console.error("[Viewer] Error in attemptPlay:", e);
              }
            };

            // Try playing immediately
            attemptPlay();

            // Also try after a short delay to ensure stream is ready
            setTimeout(attemptPlay, 100);
            setTimeout(attemptPlay, 500);
            setTimeout(attemptPlay, 1000);

            // VideoTalk uses autoPlay, but we'll also call play() to ensure it works
            videoEl
              .play()
              .then(() => {
                // #region agent log
                fetch(
                  "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      location: "live.tsx:242",
                      message: "Video play() succeeded",
                      data: {
                        readyState: videoEl.readyState,
                        videoWidth: videoEl.videoWidth,
                        videoHeight: videoEl.videoHeight,
                        paused: videoEl.paused,
                      },
                      timestamp: Date.now(),
                      sessionId: "debug-session",
                      runId: "run1",
                      hypothesisId: "C",
                    }),
                  }
                ).catch(() => {});
                // #endregion
              })
              .catch((err) => {
                // #region agent log
                fetch(
                  "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      location: "live.tsx:245",
                      message: "Video play() failed",
                      data: {
                        error: err.message,
                        errorName: err.name,
                        readyState: videoEl.readyState,
                      },
                      timestamp: Date.now(),
                      sessionId: "debug-session",
                      runId: "run1",
                      hypothesisId: "D",
                    }),
                  }
                ).catch(() => {});
                // #endregion
              if (err.name !== "AbortError") {
                  console.error(
                    "[Viewer] [FRONTEND] Error playing video:",
                    err
                  );
              }
            });
          }
        } else {
          // Fallback: create/append to a MediaStream and attach (for tracks without streams)
          if (!remoteStreamRef.current) {
            remoteStreamRef.current = new MediaStream();
          }
          remoteStreamRef.current.addTrack(e.track);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStreamRef.current;
            remoteVideoRef.current.play().catch((err) => {
              if (err.name !== "AbortError") {
                console.error(
                  "[Viewer] [FRONTEND] Error playing video (fallback):",
                  err
                );
              }
            });
          }
        }
      };

      // Connection state handler - ensure video plays when connected (VideoTalk approach)
      pc.onconnectionstatechange = () => {
        // #region agent log
        fetch(
          "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "live.tsx:265",
              message: "Connection state changed",
              data: {
                connectionState: pc.connectionState,
                iceConnectionState: pc.iceConnectionState,
                signalingState: pc.signalingState,
                hasRemoteDesc: !!pc.remoteDescription,
                hasLocalDesc: !!pc.localDescription,
                hasRemoteStream: !!remoteStreamRef.current,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run1",
              hypothesisId: "E",
            }),
          }
        ).catch(() => {});
        // #endregion
        console.log(
          "[Viewer] [FRONTEND] Connection state changed:",
          pc.connectionState,
          "ICE state:",
          pc.iceConnectionState,
          "Signaling state:",
          pc.signalingState
        );

        // Handle connection failures - try to restart ICE
        if (pc.connectionState === "failed") {
          console.log("[Viewer] Connection failed, attempting to restart ICE");
          try {
            pc.restartIce();
          } catch (e) {
            console.error("[Viewer] Error restarting ICE:", e);
          }
        }

        // Handle disconnections
        if (pc.connectionState === "disconnected") {
          console.log("[Viewer] Connection disconnected, waiting for reconnection...");
        }

        if (
          pc.connectionState === "connected" &&
          remoteVideoRef.current &&
          remoteStreamRef.current
        ) {
          const videoEl = remoteVideoRef.current;
          console.log(
            "[Viewer] [FRONTEND] Connection connected, ensuring video plays",
            {
              paused: videoEl.paused,
              readyState: videoEl.readyState,
              hasSrcObject: !!videoEl.srcObject,
              videoWidth: videoEl.videoWidth,
              videoHeight: videoEl.videoHeight,
            }
          );
          // Force play when connection is established
          if (videoEl.paused || videoEl.readyState === 0) {
            videoEl.play().catch((err) => {
              if (err.name !== "AbortError") {
                console.error(
                  "[Viewer] [FRONTEND] Error playing after connection:",
                  err
                );
                // Try again after a delay
                setTimeout(() => {
                  videoEl.play().catch(() => {});
                }, 500);
              }
            });
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(
          "[Viewer] [FRONTEND] ICE connection state changed:",
          pc.iceConnectionState,
          "Connection state:",
          pc.connectionState
        );

        // When ICE connects, ensure video plays
        if (
          pc.iceConnectionState === "connected" &&
          remoteVideoRef.current &&
          remoteStreamRef.current
        ) {
          const videoEl = remoteVideoRef.current;
          console.log(
            "[Viewer] [FRONTEND] ICE connected, forcing video play",
            {
              paused: videoEl.paused,
              readyState: videoEl.readyState,
              hasSrcObject: !!videoEl.srcObject,
            }
          );
          // Force play when ICE connects
          if (videoEl.paused || videoEl.readyState === 0) {
            videoEl.play().catch((err) => {
              if (err.name !== "AbortError") {
                console.error(
                  "[Viewer] [FRONTEND] Error playing after ICE connection:",
                  err
                );
                // Try again after a delay
                setTimeout(() => {
                  videoEl.play().catch(() => {});
                }, 500);
              }
            });
          }
        }
      };

      // Setup socket - define named handlers first
      const socket = getSocket();
      if (!socket) {
        throw new Error("Socket not available");
      }

      // Reset alert flag when joining new session
      alertShownRef.current = false;

      const handleDisconnect = (message: string) => {
        if (alertShownRef.current) {
          console.log(
            "[Viewer] Alert already shown, ignoring duplicate disconnect"
          );
          return;
        }
        alertShownRef.current = true;
        // Use setTimeout to ensure alert is shown after any pending state updates
        setTimeout(() => {
          if (confirm(message + "\n\nClick OK to return to browse page.")) {
        leaveSession().finally(() => {
          router.push("/browse");
        });
          } else {
            // User cancelled, reset flag so they can try again
            alertShownRef.current = false;
          }
        }, 100);
      };

      // Define named handlers for proper cleanup
      const onJoined = () => {
        console.log("[Viewer] Joined session via socket");
        setStatus("connected");
      };

      const onViewerCount = ({ count }: any) => {
        setViewerCount(count);
      };

      const onTick = ({
        consumedSeconds: secs,
        tokensSpent: tokens,
        walletBalance,
      }: any) => {
        console.log("[Viewer] Tick update", { secs, tokens, walletBalance });
        setConsumedSeconds(secs);
        setTokensSpent(tokens);
        if (walletBalance !== undefined) {
          auth.setWalletBalance(walletBalance);
        }
      };

      const onWalletBalanceUpdate = ({ balance }: any) => {
        auth.setWalletBalance(balance);
      };

      const onDisconnected = ({
        reason,
        sessionId: disconnectedSessionId,
      }: any) => {
        console.log("[Viewer] Disconnected event", {
          reason,
          disconnectedSessionId,
        });
        // Only handle if it's for this session
        if (disconnectedSessionId && disconnectedSessionId !== sessionId)
          return;

        let message = "You have been disconnected from the session";
        if (reason === "INSUFFICIENT_BALANCE") {
          message = "Insufficient tokens. You have been disconnected.";
        } else if (reason === "BROADCASTER_DISCONNECTED") {
          message = "The broadcaster has ended the session.";
        } else if (reason) {
          message = `Disconnected: ${reason}`;
        }

        handleDisconnect(message);
      };

      const onSessionEnded = () => {
        console.log("[Viewer] session_ended received");
        handleDisconnect("The session has ended");
      };

      const onSocketDisconnect = (reason: string) => {
        if (reason === "io server disconnect") {
          // Server disconnected us (e.g., session ended)
          handleDisconnect("You have been disconnected from the session");
        } else if (
          reason === "transport close" ||
          reason === "transport error"
        ) {
          // Network error - try to reconnect
          console.log("Connection lost, attempting to reconnect...");
          setStatus("connecting");
          // Socket.io will auto-reconnect, but we should check session status
          setTimeout(async () => {
            try {
              const sessionCheck = await api.get(`/sessions/${sessionId}`);
              if (sessionCheck.data?.session?.status !== "LIVE") {
                if (!alertShownRef.current) {
                  alertShownRef.current = true;
                  if (confirm("The session has ended while you were disconnected.\n\nClick OK to return to browse page.")) {
                leaveSession().finally(() => {
                  router.push("/browse");
                });
                  } else {
                    alertShownRef.current = false;
                  }
                }
              } else if (socket.connected) {
                // Rejoin session if reconnected
                socket.emit("join_session", { sessionId });
              }
            } catch (e) {
              console.error("Error checking session status:", e);
              if (!alertShownRef.current) {
                alertShownRef.current = true;
                if (confirm("Unable to reconnect. Please refresh the page.\n\nClick OK to return to browse page.")) {
              router.push("/browse");
                } else {
                  alertShownRef.current = false;
                }
              }
            }
          }, 2000);
        }
      };

      const onSocketConnect = () => {
        if (status === "connecting") {
          // Rejoin session after reconnection
          socket.emit("join_session", { sessionId });
        }
      };

      const onReaction = (data: any) => {
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

      const onChatMessage = (msg: any) => {
        // #region agent log
        fetch(
          "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "live.tsx:664",
              message: "chat_message received on viewer",
              data: {
                fromUserId: msg.userId,
                username: msg.username,
                text: msg.message,
                currentMessagesCount: chatMessages.length,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run-chat",
              hypothesisId: "CHAT_VIEWER",
            }),
          }
        ).catch(() => {});
        // #endregion

        setChatMessages((prev) => [...prev, msg]);
      };

      const onUserJoined = ({ username }: any) => {
        // User joined - handled by viewer_count update
      };

      const onUserLeft = ({ username }: any) => {
        // User left - handled by viewer_count update
      };

      // Handle WebRTC offer from broadcaster
      const onWebrtcOffer = async ({ fromUserId, offer }: any) => {
        // #region agent log
        fetch(
          "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "live.tsx:451",
              message: "WebRTC offer received",
              data: {
                fromUserId,
                hasOffer: !!offer,
                offerType: offer?.type,
                signalingState: pc?.signalingState,
                hasRemoteDesc: !!pc?.remoteDescription,
                hasLocalDesc: !!pc?.localDescription,
                isProcessing: processingOfferRef.current,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run1",
              hypothesisId: "F",
            }),
          }
        ).catch(() => {});
        // #endregion
        console.log("[Viewer] webrtc-offer received", {
          fromUserId,
          hasOffer: !!offer,
          signalingState: pc?.signalingState,
          hasRemoteDesc: !!pc?.remoteDescription,
          hasLocalDesc: !!pc?.localDescription,
          isProcessing: processingOfferRef.current,
        });

        if (!offer || !pc) return;

        // Early exit checks - must be in correct state to process offer
        if (offerProcessedRef.current) {
          console.log("[Viewer] Offer already processed, ignoring duplicate");
          return;
        }

        // Prevent parallel processing with a lock
        if (processingOfferRef.current) {
          console.log(
            "[Viewer] Already processing an offer, ignoring duplicate"
          );
          return;
        }

        // Check if local description is already set (answer already created and sent)
        // This is the most reliable check - if answer was sent, we're done
        if (pc.localDescription) {
          console.log(
            "[Viewer] Local description already set (answer already sent), ignoring duplicate offer"
          );
          offerProcessedRef.current = true;
          return;
        }

        // Check if remote description is already set (offer already processed)
        if (pc.remoteDescription) {
          console.log(
            "[Viewer] Remote description already set, ignoring duplicate offer"
          );
          offerProcessedRef.current = true; // Mark as processed to prevent further attempts
          return;
        }

        // Only process if connection is in 'stable' state (no descriptions set yet)
        if (pc.signalingState !== "stable") {
          console.log(
            `[Viewer] Connection not in stable state (${pc.signalingState}), ignoring offer`
          );
          // If we're in have-remote-offer state, we're already processing
          if (pc.signalingState === "have-remote-offer") {
            processingOfferRef.current = true;
            offerProcessedRef.current = true;
          }
          return;
        }

        // Set processing lock
        processingOfferRef.current = true;

        try {
          // Set remote description (the offer)
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          // #region agent log
          fetch(
            "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                location: "live.tsx:514",
                message: "Remote description set",
                data: {
                  signalingState: pc.signalingState,
                  hasRemoteDesc: !!pc.remoteDescription,
                  remoteDescType: (pc.remoteDescription as any)?.type,
                },
                timestamp: Date.now(),
                sessionId: "debug-session",
                runId: "run1",
                hypothesisId: "G",
              }),
            }
          ).catch(() => {});
          // #endregion
          console.log("[Viewer] Remote description set, creating answer...");

          // Process queued ICE candidates now that remote description is set
          const queuedCandidates = iceCandidateQueueRef.current;
          iceCandidateQueueRef.current = []; // Clear queue
          for (const candidate of queuedCandidates) {
            try {
              await pc.addIceCandidate(candidate);
              console.log("[Viewer] Added queued ICE candidate");
            } catch (e) {
              console.error("[Viewer] Error adding queued ICE candidate:", e);
            }
          }

          // Create answer
          const answer = await pc.createAnswer();
          console.log("[Viewer] Answer created, setting local description...");

          // Set local description (the answer) - this should work now since we're in 'have-remote-offer' state
          await pc.setLocalDescription(answer);
          console.log("[Viewer] Local description set, signaling state:", pc.signalingState);
          // #region agent log
          fetch(
            "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                location: "live.tsx:533",
                message: "Local description (answer) set",
                data: {
                  signalingState: pc.signalingState,
                  hasLocalDesc: !!pc.localDescription,
                  localDescType: (pc.localDescription as any)?.type,
                  answerType: answer.type,
                },
                timestamp: Date.now(),
                sessionId: "debug-session",
                runId: "run1",
                hypothesisId: "H",
              }),
            }
          ).catch(() => {});
          // #endregion
          console.log("[Viewer] Sent answer to broadcaster", fromUserId);

          // Mark as processed immediately after successful processing
          offerProcessedRef.current = true;
          processingOfferRef.current = false; // Release lock

          // Send answer to broadcaster
          if (socket.connected) {
            console.log(
              "[Viewer] [FRONTEND] Emitting webrtc-answer to broadcaster",
              {
                sessionId,
                to: `user:${fromUserId}`,
                hasAnswer: !!pc.localDescription,
                answerType: pc.localDescription
                  ? (pc.localDescription as RTCSessionDescription).type
                  : undefined,
                answerSdpLength: pc.localDescription
                  ? (pc.localDescription as RTCSessionDescription).sdp?.length
                  : undefined,
                signalingState: pc.signalingState,
              }
            );
            socket.emit("webrtc-answer", {
              sessionId,
              to: `user:${fromUserId}`,
              answer: pc.localDescription,
            });
          } else {
            console.error(
              "[Viewer] [FRONTEND] Socket not connected, cannot send answer"
            );
          }
        } catch (e: any) {
          console.error("[Viewer] Error handling WebRTC offer:", e);
          processingOfferRef.current = false; // Release lock on error

          // If error occurs, check the current state
          if (pc.localDescription) {
            // Answer was already created, mark as processed
            console.log("[Viewer] Answer already exists, marking as processed");
            offerProcessedRef.current = true;
          } else if (pc.signalingState === "stable" && pc.remoteDescription) {
            // Remote description is set but local isn't - this shouldn't happen, but mark as processed
            console.log(
              "[Viewer] Remote description set but local not set, marking as processed"
            );
            offerProcessedRef.current = true;
          } else if (e.message?.includes("stable")) {
            // Connection is already stable (answer was already sent)
            console.log(
              "[Viewer] Connection already stable, marking as processed"
            );
            offerProcessedRef.current = true;
          }
        }
      };

      // Handle WebRTC answer (shouldn't happen for viewers, but handle it)
      const onWebrtcAnswer = async ({ fromUserId, answer }: any) => {
        console.log("[Viewer] Unexpected webrtc-answer received", {
          fromUserId,
          hasAnswer: !!answer,
        });
        if (!answer || !pc) return;
        try {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        } catch (e: any) {
          console.error("Error handling WebRTC answer:", e);
        }
      };

      // Handle ICE candidates
      const onWebrtcIce = async ({ fromUserId, candidate }: any) => {
        // #region agent log
        fetch(
          "http://127.0.0.1:7243/ingest/8a32c005-56f4-4611-b001-43659656840e",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "live.tsx:643",
              message: "ICE candidate received",
              data: {
                fromUserId,
                hasCandidate: !!candidate,
                hasRemoteDesc: !!pc?.remoteDescription,
                signalingState: pc?.signalingState,
                connectionState: pc?.connectionState,
                iceConnectionState: pc?.iceConnectionState,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run1",
              hypothesisId: "T",
            }),
          }
        ).catch(() => {});
        // #endregion
        console.log("[Viewer] webrtc-ice received", {
          fromUserId,
          hasCandidate: !!candidate,
          hasRemoteDesc: !!pc?.remoteDescription,
          signalingState: pc?.signalingState,
        });

        if (!pc || !candidate) return;

        try {
          // Check if peer connection is in a valid state
          if (pc.signalingState === 'closed' || pc.connectionState === 'closed') {
            console.log("[Viewer] Peer connection is closed, ignoring ICE candidate");
            return;
          }
          
          // Check if remote description is set before adding ICE candidate
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log("[Viewer] ICE candidate added successfully");
          } else {
            // Queue ICE candidate until remote description is set
            iceCandidateQueueRef.current.push(new RTCIceCandidate(candidate));
            console.log(
              "[Viewer] ICE candidate queued (remote description not set yet)"
            );
          }
        } catch (e: any) {
          // Ignore errors for duplicate or invalid candidates
          if (
            e.message?.includes("null") ||
            e.message?.includes("InvalidStateError")
          ) {
            console.log(
              "[Viewer] ICE candidate ignored (remote description not set or duplicate)"
            );
          } else {
            console.error("[Viewer] Error adding ICE candidate:", e);
          }
        }
      };

      // Remove all existing listeners for this session to prevent duplicates (using named handlers)
      socket.off("webrtc-offer", onWebrtcOffer);
      socket.off("webrtc-answer", onWebrtcAnswer);
      socket.off("webrtc-ice", onWebrtcIce);
      socket.off("joined", onJoined);
      socket.off("viewer_count", onViewerCount);
      socket.off("tick", onTick);
      socket.off("wallet_balance_update", onWalletBalanceUpdate);
      socket.off("disconnected", onDisconnected);
      socket.off("session_ended", onSessionEnded);
      socket.off("disconnect", onSocketDisconnect);
      socket.off("connect", onSocketConnect);
      socket.off("chat_message", onChatMessage);
      socket.off("reaction", onReaction);
      socket.off("user_joined", onUserJoined);
      socket.off("user_left", onUserLeft);

      socketRef.current = socket;

      // Ensure socket is connected before emitting
      if (socket.connected) {
        socket.emit("join_session", { sessionId });
      } else {
        // Wait for connection
        socket.once("connect", () => {
          socket.emit("join_session", { sessionId });
        });
        if (!socket.connected) {
          socket.connect();
        }
      }

      // Register named handlers
      socket.on("joined", onJoined);
      socket.on("viewer_count", onViewerCount);
      socket.on("tick", onTick);
      socket.on("wallet_balance_update", onWalletBalanceUpdate);
      socket.on("disconnected", onDisconnected);
      socket.on("session_ended", onSessionEnded);
      socket.on("disconnect", onSocketDisconnect);
      socket.on("connect", onSocketConnect);
      socket.on("chat_message", onChatMessage);
      socket.on("reaction", onReaction);
      socket.on("user_joined", onUserJoined);
      socket.on("user_left", onUserLeft);
      socket.on("webrtc-offer", onWebrtcOffer);
      socket.on("webrtc-answer", onWebrtcAnswer);
      socket.on("webrtc-ice", onWebrtcIce);

      // Send ICE candidates to broadcaster
      pc.onicecandidate = (event) => {
        if (
          event.candidate &&
          sessionData?.data?.session?.broadcaster?.id &&
          socket &&
          socket.connected
        ) {
          socket.emit("webrtc-ice", {
            sessionId,
            to: `user:${sessionData.data.session.broadcaster.id}`,
            candidate: event.candidate,
          });
        }
      };

      setStatus("live");
      joiningSessionRef.current = false;
    } catch (e: any) {
      console.error("Failed to join session", e);
      joiningSessionRef.current = false;

      let errorMessage = "Failed to join session";

      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        errorMessage =
          "Camera/microphone access denied. Please allow permissions and try again.";
      } else if (e.response?.status === 400) {
        // Handle specific 400 errors
        const errorData = e.response?.data?.error;
        if (typeof errorData === "string") {
          errorMessage = errorData;
        } else if (errorData?.message) {
          errorMessage = errorData.message;
        } else {
          errorMessage =
            "Cannot join session. The session may have ended or you may not have sufficient tokens.";
        }
      } else if (e.response?.status === 404) {
        errorMessage = "Session not found. It may have ended.";
      } else if (
        e.code === "ERR_NETWORK" ||
        e.message?.includes("Network Error")
      ) {
        errorMessage =
          "Network error. Please check your internet connection and try again.";
      } else if (e.message) {
        errorMessage = e.message;
      }

      if (!alertShownRef.current) {
        alertShownRef.current = true;
        if (confirm(errorMessage + "\n\nClick OK to return to browse page.")) {
      router.push("/browse");
        } else {
          alertShownRef.current = false;
        }
      }
    }
  }

  async function leaveSession() {
    if (!sessionId) return;

    try {
      // Stop all media tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      // Close peer connection
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      pcSessionIdRef.current = null; // Clear session tracking
      offerProcessedRef.current = false;

      // Leave session via socket first
      const socket = getSocket();
      if (socket && socket.connected) {
        try {
          socket.emit("leave_session", { sessionId });
        } catch (socketError) {
          console.debug("Socket leave emit failed:", socketError);
        }
      }

      // Leave session via API (may fail if already left or session ended, that's ok)
      try {
        await api.post(`/sessions/${sessionId}/leave`);
      } catch (apiError: any) {
        // Ignore 404 errors (viewer already left or session ended)
        // Ignore network errors (user may be offline)
        if (apiError.response?.status === 404) {
          console.debug("Viewer already left or session ended (expected)");
        } else if (apiError.code === "ERR_NETWORK") {
          console.debug("Network error during leave (user may be offline)");
        } else {
          console.debug("API leave call failed:", apiError);
        }
      }
    } catch (e) {
      console.error("Error leaving session:", e);
    }
  }

  function handleSwipeStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 1) {
      setSwipeStartX(e.touches[0].clientX);
    }
  }

  function handleSwipeEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (swipeStartX === null) return;
    const endX = e.changedTouches[0].clientX;
    const diff = endX - swipeStartX;
    const threshold = 50; // Minimum swipe distance

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        handleSwipe("right");
      } else {
        handleSwipe("left");
      }
    }
    setSwipeStartX(null);
  }

  function handleSwipe(direction: "left" | "right") {
    if (allSessions.length === 0) return;

    let newIndex = currentSessionIndex;
    if (direction === "left") {
      newIndex = (currentSessionIndex + 1) % allSessions.length;
    } else {
      newIndex =
        (currentSessionIndex - 1 + allSessions.length) % allSessions.length;
    }

    const newSession = allSessions[newIndex];
    if (newSession && newSession.id) {
      router.replace(`/live?sessionId=${newSession.id}`, undefined, {
        shallow: true,
      });
    }
  }

  function goToPrevSession() {
    if (allSessions.length === 0) return;
    const newIndex =
      (currentSessionIndex - 1 + allSessions.length) % allSessions.length;
    const newSession = allSessions[newIndex];
    if (newSession && newSession.id) {
      router.replace(`/live?sessionId=${newSession.id}`, undefined, {
        shallow: true,
      });
    }
  }

  function goToNextSession() {
    if (allSessions.length === 0) return;
    const newIndex = (currentSessionIndex + 1) % allSessions.length;
    const newSession = allSessions[newIndex];
    if (newSession && newSession.id) {
      router.replace(`/live?sessionId=${newSession.id}`, undefined, {
        shallow: true,
      });
    }
  }

  async function toggleVideo() {
    if (!videoEnabled) {
      // Enable video
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });

        if (!streamRef.current) {
          streamRef.current = stream;
        } else {
          // Add video tracks to existing stream
          stream.getVideoTracks().forEach((track) => {
            streamRef.current?.addTrack(track);
          });
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = streamRef.current;
        }

        // Add video track to peer connection if it exists
        if (pcRef.current && stream.getVideoTracks().length > 0) {
          stream.getVideoTracks().forEach((track) => {
            pcRef.current?.addTrack(track, streamRef.current!);
          });
        }

        setVideoEnabled(true);
      } catch (e: any) {
        alert("Failed to enable video: " + (e.message || "Unknown error"));
      }
    } else {
      // Disable video
      if (streamRef.current) {
        streamRef.current.getVideoTracks().forEach((track) => {
          track.stop();
          streamRef.current?.removeTrack(track);
        });
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      setVideoEnabled(false);
    }
  }

  async function toggleAudio() {
    if (!audioEnabled) {
      // Enable audio
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        if (!streamRef.current) {
          streamRef.current = stream;
        } else {
          // Add audio tracks to existing stream
          stream.getAudioTracks().forEach((track) => {
            streamRef.current?.addTrack(track);
          });
        }

        // Add audio track to peer connection if it exists
        if (pcRef.current && stream.getAudioTracks().length > 0) {
          stream.getAudioTracks().forEach((track) => {
            pcRef.current?.addTrack(track, streamRef.current!);
          });
        }

        setAudioEnabled(true);
      } catch (e: any) {
        alert("Failed to enable audio: " + (e.message || "Unknown error"));
      }
    } else {
      // Disable audio
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach((track) => {
          track.stop();
          streamRef.current?.removeTrack(track);
        });
      }
      setAudioEnabled(false);
    }
  }

  function sendChatMessage() {
    if (!chatInput.trim() || !sessionId) return;
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit("chat_message", { sessionId, message: chatInput });
      setChatInput("");
    }
  }

  function sendReaction(emoji: string) {
    if (!sessionId) return;
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit("reaction", { sessionId, emoji });
    }
  }

  return (
    <main className="fixed inset-0 bg-black">
      {/* Full-screen Video */}
      <div className="absolute inset-0">
          <div
          className="relative w-full h-full"
            onTouchStart={handleSwipeStart}
            onTouchEnd={handleSwipeEnd}
          >
            {/* Swipe Navigation Arrows */}
            {allSessions.length > 1 && (
              <>
                <button
                  onClick={goToPrevSession}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full transition-all"
                  aria-label="Previous creator"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <button
                  onClick={goToNextSession}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full transition-all"
                  aria-label="Next creator"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
                {/* Session indicator */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                  {currentSessionIndex + 1} / {allSessions.length}
                </div>
              </>
            )}

          {/* Broadcaster's video (main) - Full screen */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={true}
              className="w-full h-full object-cover"
              onLoadedMetadata={() => {
                if (remoteVideoRef.current) {
                  console.log(
                    "[Viewer] [FRONTEND] Video element mounted/updated",
                    {
                      id: remoteVideoRef.current.id,
                      className: remoteVideoRef.current.className,
                      hasSrcObject: !!remoteVideoRef.current.srcObject,
                      dimensions: {
                        width: remoteVideoRef.current.offsetWidth,
                        height: remoteVideoRef.current.offsetHeight,
                      },
                      visible:
                        remoteVideoRef.current.offsetWidth > 0 &&
                        remoteVideoRef.current.offsetHeight > 0,
                      display: window.getComputedStyle(remoteVideoRef.current)
                        .display,
                      visibility: window.getComputedStyle(
                        remoteVideoRef.current
                      ).visibility,
                    }
                  );
                  console.log("[Viewer] [FRONTEND] Video metadata loaded", {
                    videoWidth: remoteVideoRef.current.videoWidth,
                    videoHeight: remoteVideoRef.current.videoHeight,
                    duration: remoteVideoRef.current.duration,
                    readyState: remoteVideoRef.current.readyState,
                  });
                  // Ensure video plays after metadata loads
                  if (remoteVideoRef.current.paused) {
                    remoteVideoRef.current.play().catch((err) => {
                      console.error(
                        "[Viewer] [FRONTEND] Error playing after metadata load:",
                        err
                      );
                    });
                  }
                }
              }}
              onLoadedData={() => {
                console.log("[Viewer] [FRONTEND] Video data loaded", {
                  videoWidth: remoteVideoRef.current?.videoWidth,
                  videoHeight: remoteVideoRef.current?.videoHeight,
                  readyState: remoteVideoRef.current?.readyState,
                });
              }}
              onCanPlay={() => {
                console.log("[Viewer] [FRONTEND] Video can play", {
                  readyState: remoteVideoRef.current?.readyState,
                  videoWidth: remoteVideoRef.current?.videoWidth,
                  videoHeight: remoteVideoRef.current?.videoHeight,
                });
                if (remoteVideoRef.current && remoteVideoRef.current.paused) {
                  remoteVideoRef.current.play().catch((err) => {
                    console.error(
                      "[Viewer] [FRONTEND] Error in onCanPlay play():",
                      err
                    );
                  });
                }
              }}
              onPlaying={() => {
                console.log("[Viewer] [FRONTEND] Video is now playing", {
                  videoWidth: remoteVideoRef.current?.videoWidth,
                  videoHeight: remoteVideoRef.current?.videoHeight,
                  readyState: remoteVideoRef.current?.readyState,
                });
              }}
              onPlay={() => {
                console.log("[Viewer] [FRONTEND] Video started playing");
              }}
              onPause={() => {
                console.log("[Viewer] [FRONTEND] Video paused");
              }}
              onWaiting={() => {
                console.log("[Viewer] [FRONTEND] Video waiting for data");
              }}
              onStalled={() => {
                console.warn("[Viewer] [FRONTEND] Video stalled");
              }}
              onError={(e) => {
                console.error("[Viewer] [FRONTEND] Video error:", e, {
                  error: remoteVideoRef.current?.error,
                  errorCode: remoteVideoRef.current?.error?.code,
                  errorMessage: remoteVideoRef.current?.error?.message,
                  readyState: remoteVideoRef.current?.readyState,
                });
              }}
            />
          {/* Your own video (small preview) - only show if video is enabled in private rooms */}
          {session?.isPrivate && videoEnabled && (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
              className="absolute bottom-20 right-4 w-32 h-24 rounded-lg border-2 border-white/30 object-cover bg-gray-800"
              />
            )}
            {status === "connecting" && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75">
                <div className="text-white text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
                  <p>Connecting...</p>
                </div>
              </div>
            )}
        </div>
      </div>

      {/* Top Bar - Modern Live Style */}
      <div 
        className="fixed top-0 left-0 right-0 z-[10000] bg-gradient-to-b from-black/95 via-black/85 to-transparent pt-safe backdrop-blur-xl border-b border-white/10"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000 }}
      >
        <div className="flex justify-between items-center px-2 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-4 flex-shrink-0">
            {/* Session navigation */}
            {allSessions.length > 1 && (
              <>
                <motion.button
                  onClick={goToPrevSession}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="bg-black/70 backdrop-blur-md hover:bg-black/90 text-white p-1.5 sm:p-2 md:p-2.5 rounded-full border-2 border-white/30 transition-all shadow-lg"
                >
                  <ChevronLeft className="w-4 h-4 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" />
                </motion.button>
                <div className="bg-gradient-to-r from-purple-600/80 to-pink-600/80 backdrop-blur-md text-white px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-bold border border-white/30 shadow-lg">
                  {currentSessionIndex + 1} / {allSessions.length}
                </div>
                <motion.button
                  onClick={goToNextSession}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="bg-black/70 backdrop-blur-md hover:bg-black/90 text-white p-1.5 sm:p-2 md:p-2.5 rounded-full border-2 border-white/30 transition-all shadow-lg"
                >
                  <ChevronRight className="w-4 h-4 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5" />
                </motion.button>
                <div className="w-px h-5 sm:h-6 md:h-7 bg-white/30 mx-1 sm:mx-1.5 md:mx-2"></div>
              </>
            )}
            {/* LIVE Badge */}
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
          </div>
          {/* Leave Button - Always visible */}
          <motion.button
            onClick={() => {
              if (confirm("Are you sure you want to leave this live session?")) {
                leaveSession();
                router.push("/browse");
              }
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-gradient-to-r from-red-600 via-red-500 to-red-600 hover:from-red-700 hover:via-red-600 hover:to-red-700 text-white px-3 sm:px-5 md:px-7 py-2 sm:py-2.5 md:py-3 rounded-full text-xs sm:text-sm md:text-base font-bold flex items-center gap-1.5 sm:gap-2 md:gap-2.5 shadow-2xl border-2 border-red-300/60 min-w-[70px] sm:min-w-[100px] md:min-w-[140px] justify-center transition-all relative flex-shrink-0"
            style={{ position: 'relative', zIndex: 10001 }}
          >
            <LogOut className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
            <span>Leave</span>
          </motion.button>
        </div>
      </div>

      {/* Chat Messages - Left Side */}
      <div className="fixed left-2 sm:left-4 md:left-6 top-20 sm:top-24 md:top-28 bottom-32 sm:bottom-36 md:bottom-40 w-56 sm:w-64 md:w-72 lg:w-80 z-[9999] pointer-events-none max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] md:max-w-none" style={{ zIndex: 9999 }}>
        <div className="h-full overflow-y-auto space-y-2 sm:space-y-2.5 md:space-y-3 pr-1 sm:pr-1.5 md:pr-2">
          {chatMessages.map((msg, i) => (
            <motion.div
              key={`${msg.timestamp || i}-${msg.message}`}
              initial={{ opacity: 0, x: -30, scale: 0.85 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.85 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 25,
                delay: 0.1
              }}
              className="bg-gradient-to-br from-blue-600/80 via-cyan-600/80 to-teal-600/80 backdrop-blur-xl text-white p-2.5 sm:p-3 md:p-4 rounded-xl sm:rounded-2xl pointer-events-auto border-2 border-white/20 shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <motion.div
                  whileHover={{ scale: 1.15, rotate: 5 }}
                  className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0 shadow-xl border-2 border-white/30"
                >
                  {msg.username?.[0]?.toUpperCase() || "A"}
                </motion.div>
                <div className="flex-1 min-w-0">
                  <motion.div
                    className="font-bold text-xs sm:text-sm mb-1 sm:mb-1.5 text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-green-300 to-cyan-300"
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
        {reactions.map((reaction) => (
          <div
            key={reaction.id}
            className="absolute text-5xl animate-reaction-float"
            style={{
              left: `${reaction.x * 100}%`,
              top: `${20 + Math.random() * 60}%`,
              animation: "reactionFloat 3s ease-out forwards",
            }}
          >
            {reaction.emoji}
                  </div>
        ))}
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
          {/* Controls Row (for private rooms only) */}
          {session?.isPrivate && (
            <div className="flex justify-center gap-3 sm:gap-4 md:gap-5">
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
          )}
        </div>
      </div>

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
    </main>
  );
}
