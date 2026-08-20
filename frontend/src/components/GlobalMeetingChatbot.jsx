import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";

const SUGGESTIONS = [
  "What decisions were made across recent meetings?",
  "List all high-priority action items and their owners",
  "Summarize key topics and project discussions",
  "Who contributed the most and what were their points?",
];

export default function GlobalMeetingChatbot({ meetingCount = 0 }) {
  const api = useApi();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (customText = null) => {
    const text = (customText || input).trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);

    const userMsg = { role: "user", content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);

    try {
      const res = await api.sendGlobalChat(text, messages);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.answer || "No response received.",
          referencedMeetings: res.referencedMeetings || [],
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ Failed to query across meetings. Please ensure your backend is running and try again.",
          referencedMeetings: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="glass global-chat-container">
      {/* Header */}
      <div className="global-chat-header">
        <div className="global-chat-header__info">
          <div className="global-chat-header__avatar">✨</div>
          <div>
            <h3 className="global-chat-header__title">Ask AI Across All Meetings</h3>
            <p className="global-chat-header__subtitle">
              Synthesizing intelligence from {meetingCount} saved {meetingCount === 1 ? "meeting" : "meetings"}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="global-chat-messages">
        {messages.length === 0 ? (
          <div className="global-chat-empty">
            <div className="global-chat-empty__icon">💡</div>
            <h4 className="global-chat-empty__title">Ask anything across your entire meeting history</h4>
            <p className="global-chat-empty__desc">
              Connect dots, find decisions, track action items, or synthesize themes across all your syncs.
            </p>

            {/* Quick Suggestion Pills */}
            <div className="global-chat-suggestions">
              {SUGGESTIONS.map((s, idx) => (
                <button
                  key={idx}
                  className="global-chat-pill"
                  onClick={() => handleSend(s)}
                  disabled={loading}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`chat-bubble ${msg.role} fade-in`}>
              {msg.role === "assistant" && (
                <div className="chat-bubble__label">Global Meeting Intelligence</div>
              )}
              <div className="chat-bubble__content" style={{ whiteSpace: "pre-wrap" }}>
                {msg.content}
              </div>

              {/* Referenced Meetings */}
              {msg.referencedMeetings && msg.referencedMeetings.length > 0 && (
                <div className="global-chat-references">
                  <span className="global-chat-references__label">Sources:</span>
                  {msg.referencedMeetings.map((m, mIdx) => (
                    <button
                      key={mIdx}
                      className="global-chat-ref-badge"
                      onClick={() => navigate(`/summary/${m.sessionId}`)}
                      title="View meeting summary"
                    >
                      📄 {m.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {loading && (
          <div className="chat-bubble assistant fade-in">
            <div className="chat-bubble__typing-label">Analyzing all meetings...</div>
            <div className="chat-bubble__typing">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div className="chat-input-row">
        <input
          className="input chat-input-row__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question across all your meetings..."
          disabled={loading}
        />
        <button
          className="btn-primary btn-icon"
          onClick={() => handleSend()}
          disabled={!input.trim() || loading}
        >
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
