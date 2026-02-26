import React, { useEffect, useState, useRef, useCallback } from "react";
import { useWS } from "./WSProvider.js";
import { X, Send, Zap, User } from "lucide-react";
import {
  analyzeUserQuestion,
  getEstimatedWaitTime,
} from "../utils/helpDeskAI.js";
import { apiFetch } from "../utils/api.js";

export default function HelpdeskChat({
  request,
  user,
  onClose,
}: {
  request: any;
  user: any;
  onClose?: () => void;
}) {
  const ws = (() => {
    try {
      return useWS();
    } catch {
      return null;
    }
  })();
  const [messages, setMessages] = useState<any[]>(() => {
    const msgs = request?.messages || [];
    // If messages array is empty but the request has an initial message, seed it
    if (msgs.length === 0 && request?.message) {
      return [
        {
          fromName: request.username || "User",
          message: request.message,
          ts: request.ts || Date.now(),
          admin: false,
        },
      ];
    }
    return msgs;
  });
  const [input, setInput] = useState("");
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const [adminConnected, setAdminConnected] = useState(false);
  const [resolved, setResolved] = useState(
    () => request?.status === "resolved",
  );
  const [waitTime, setWaitTime] = useState("");
  const msgsRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);

  // Sync messages when the request prop changes (e.g. after admin claims the request)
  useEffect(() => {
    if (request?.messages && request.messages.length > 0) {
      setMessages(request.messages);
    } else if (request?.message) {
      // Seed with the initial help request message
      setMessages([
        {
          fromName: request.username || "User",
          message: request.message,
          ts: request.ts || Date.now(),
          admin: false,
        },
      ]);
    }
    if (request?.claimedBy) {
      setAdminConnected(true);
    }
    if (request?.status === "resolved") {
      setResolved(true);
    }
  }, [
    request?.id,
    request?.messages?.length,
    request?.claimedBy,
    request?.status,
  ]);

  useEffect(() => {
    if (!ws) return;
    const un = ws.addListener((data: any) => {
      try {
        if (
          data?.type === "help-message" &&
          String(data.requestId) === String(request.id)
        ) {
          const incoming = data.message;
          // Deduplicate: skip if we already have a message with same text within 10s window
          setMessages((m) => {
            const isDup = m.some(
              (existing: any) =>
                existing.message === incoming.message &&
                Math.abs((existing.ts || 0) - (incoming.ts || 0)) < 10000,
            );
            if (isDup) return m;
            return [...m, incoming];
          });
        }
        if (
          data?.type === "help-request-updated" &&
          data.request?.id === request.id
        ) {
          setMessages(data.request.messages || []);
          setAdminConnected(data.request.claimedBy ? true : false);
          if (data.request.status === "resolved") {
            setResolved(true);
          }
        }
        if (
          data?.type === "help-typing" &&
          String(data.requestId) === String(request.id)
        ) {
          const who =
            data.fromName || data.fromEmail || (data.admin ? "admin" : "user");
          setTypingUsers((prev) => ({ ...prev, [who]: Date.now() }));
        }
      } catch {}
    });
    return () => {
      un();
    };
  }, [ws, request?.id]);

  const sendMsg = () => {
    if (!input.trim()) return;

    // Send user message via REST (reliable, persists immediately, server broadcasts via WS)
    const userMessage = input;

    const msgObj = {
      fromEmail: user?.email || null,
      fromName: user?.username || null,
      message: userMessage,
      ts: Date.now(),
      admin: !!user?.isAdmin,
    };
    setMessages((m) => [...m, msgObj]);
    setInput("");

    // Send via REST — server persists and broadcasts via WS to the other party
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const authToken = localStorage.getItem("authToken");
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
      apiFetch(`/api/help/requests/${request.id}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: userMessage }),
      }).catch(() => {
        // If REST fails, try WS as fallback
        try {
          ws?.send({
            type: "help-message",
            requestId: request.id,
            message: userMessage,
          });
        } catch {}
      });
    } catch {
      // If REST setup fails, try WS
      try {
        ws?.send({
          type: "help-message",
          requestId: request.id,
          message: userMessage,
        });
      } catch {}
    }

    // If admin not connected, try AI response
    if (!adminConnected) {
      const t = window.setTimeout(() => {
        const aiResponse = analyzeUserQuestion(userMessage);
        if (aiResponse) {
          const aiMsg = {
            fromName: "AI Assistant",
            message: `${aiResponse.title}\n\n${aiResponse.message}`,
            ts: Date.now(),
            admin: true,
            actions: aiResponse.actions,
            followUp: aiResponse.followUp,
          };
          setMessages((m) => [...m, aiMsg]);
        }
      }, 500);
      timersRef.current.push(t);
    }
  };

  const requestAdminConnection = (needsHelp: boolean) => {
    if (!needsHelp) {
      const confirmMsg = {
        fromName: "You",
        message: "No, I think I have it now. Thanks!",
        ts: Date.now(),
        admin: false,
      };
      setMessages((m) => [...m, confirmMsg]);

      const t = window.setTimeout(() => {
        const aiMsg = {
          fromName: "AI Assistant",
          message:
            "✓ Great! Glad I could help. Feel free to reach out anytime you need assistance.",
          ts: Date.now(),
          admin: true,
        };
        setMessages((m) => [...m, aiMsg]);
      }, 300);
      timersRef.current.push(t);
      return;
    }

    // Request admin connection
    const confirmMsg = {
      fromName: "You",
      message: "Yes, I need to speak with an admin",
      ts: Date.now(),
      admin: false,
    };
    setMessages((m) => [...m, confirmMsg]);

    // Send escalation request to admins
    try {
      ws?.send({ type: "help-escalate", requestId: request.id });
    } catch {}

    setWaitTime(getEstimatedWaitTime());

    const t = window.setTimeout(() => {
      const waitMsg = {
        fromName: "System",
        message: `⏳ Connecting you with an admin...\n\n📊 Estimated wait time: ${waitTime}\n\nAn admin will be with you shortly. Please stay on this chat.`,
        ts: Date.now(),
        admin: true,
      };
      setMessages((m) => [...m, waitMsg]);
    }, 500);
    timersRef.current.push(t);
  };

  // REST polling fallback: periodically fetch messages in case WS routing fails
  useEffect(() => {
    if (!request?.id) return;
    let active = true;
    const poll = async () => {
      try {
        const headers: Record<string, string> = {};
        const authToken = localStorage.getItem("authToken");
        if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
        const res = await apiFetch(`/api/help/requests/${request.id}`, {
          headers,
        });
        if (!active) return;
        const j = await res.json().catch(() => null);
        if (j?.ok && j.request?.messages && j.request.messages.length > 0) {
          setMessages((prev) => {
            const serverMsgs = j.request.messages;
            // If server has more messages than local, replace with server state
            // (server is the source of truth)
            if (serverMsgs.length > prev.length) {
              return serverMsgs;
            }
            return prev;
          });
          if (j.request.claimedBy) setAdminConnected(true);
          if (j.request.status === "resolved") setResolved(true);
        }
      } catch {}
    };
    // Poll every 4 seconds
    const interval = setInterval(poll, 4000);
    // Also do an immediate poll
    poll();
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [request?.id]);

  // auto-scroll to bottom when messages update
  useEffect(() => {
    if (!msgsRef.current) return;
    try {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    } catch {}
  }, [messages]);

  // send typing notifications (debounced)
  const sendTyping = useCallback(() => {
    try {
      ws?.send({
        type: "help-typing",
        requestId: request.id,
        fromName: user?.username,
        fromEmail: user?.email,
        admin: !!user?.isAdmin,
      });
    } catch {}
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      setTypingUsers((prev) => {
        const copy = { ...prev };
        delete copy[user?.username || user?.email || "me"];
        return copy;
      });
    }, 3000);
  }, [ws, request.id, user]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current = [];
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-slate-900 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              Help Desk — {request.username || "Anonymous"}
            </div>
            {adminConnected && !resolved && (
              <span className="text-xs px-2 py-1 rounded bg-emerald-600">
                Admin Connected
              </span>
            )}
            {resolved && (
              <span className="text-xs px-2 py-1 rounded bg-slate-500">
                Chat Ended
              </span>
            )}
          </div>
          <button
            aria-label="Close"
            className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-sm"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          ref={msgsRef}
          className="flex-1 overflow-y-auto p-3 space-y-3 bg-black/20"
        >
          {messages.map((m, i) => (
            <div key={i}>
              <div
                className={`max-w-[85%] px-3 py-2 rounded ${m.admin ? "bg-emerald-600/20 border border-emerald-500/40 text-emerald-100 ml-auto" : "bg-slate-700 text-slate-100"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs opacity-70 font-semibold flex items-center gap-1">
                    {m.admin ? (
                      <Zap className="w-3 h-3" />
                    ) : (
                      <User className="w-3 h-3" />
                    )}
                    {m.fromName ||
                      m.fromEmail ||
                      (m.admin ? "AI Assistant" : "You")}
                  </div>
                  <div className="text-xs opacity-50 ml-2">
                    {m.ts
                      ? new Date(m.ts).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </div>
                </div>
                <div className="whitespace-pre-wrap break-words text-sm">
                  {m.message}
                </div>

                {/* Calibration actions */}
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-semibold opacity-80">
                      📍 Try these calibration points:
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      {m.actions.map((action: any) => (
                        <button
                          key={action.id}
                          className={`${action.color} text-white text-xs py-2 px-2 rounded font-medium hover:opacity-90 transition-opacity`}
                          onClick={() => {
                            const actionMsg = {
                              fromName: "You",
                              message: `Clicked: ${action.label}`,
                              ts: Date.now(),
                              admin: false,
                            };
                            setMessages((prev) => [...prev, actionMsg]);
                            try {
                              ws?.send({
                                type: "help-message",
                                requestId: request.id,
                                message: `User clicked: ${action.id}`,
                              });
                            } catch {}
                          }}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Follow-up prompt */}
                {m.followUp && !adminConnected && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs opacity-80">{m.followUp}</div>
                    <div className="flex gap-2">
                      <button
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-2 px-3 rounded font-medium transition-colors"
                        onClick={() => requestAdminConnection(true)}
                      >
                        ✅ Yes, connect me
                      </button>
                      <button
                        className="flex-1 bg-slate-600 hover:bg-slate-700 text-white text-xs py-2 px-3 rounded font-medium transition-colors"
                        onClick={() => requestAdminConnection(false)}
                      >
                        ❌ No thanks
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* typing indicators */}
          {Object.keys(typingUsers).length > 0 && (
            <div className="text-xs text-slate-300 opacity-80 flex items-center gap-2">
              <span>{Object.keys(typingUsers).join(", ")} typing</span>
              <span className="flex gap-1">
                <span className="w-1 h-1 bg-slate-300 rounded-full animate-bounce"></span>
                <span className="w-1 h-1 bg-slate-300 rounded-full animate-bounce delay-100"></span>
                <span className="w-1 h-1 bg-slate-300 rounded-full animate-bounce delay-200"></span>
              </span>
            </div>
          )}
        </div>

        {resolved ? (
          <div className="p-3 border-t border-slate-700 bg-slate-800 text-center">
            <p className="text-sm text-slate-400">
              This chat has been closed. Thank you!
            </p>
            <button
              className="mt-2 btn bg-slate-600 hover:bg-slate-500 text-white text-sm px-4 py-1"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        ) : (
          <div className="p-3 border-t border-slate-700 bg-slate-800 flex gap-2">
            <input
              className="input flex-1 text-sm"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                sendTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMsg();
                }
              }}
              placeholder="Ask a question (e.g., 'How does calibration work?')..."
            />
            <button
              aria-label="Send message"
              className="btn bg-blue-600 hover:bg-blue-700 text-white"
              onClick={sendMsg}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
