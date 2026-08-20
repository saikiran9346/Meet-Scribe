import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import BotControl from "../components/BotControl";
import GlobalMeetingChatbot from "../components/GlobalMeetingChatbot";
import { useApi } from "../hooks/useApi";

const SENTIMENT_CHIP = {
  positive: "chip-positive",
  neutral:  "chip-neutral",
  mixed:    "chip-mixed",
  negative: "chip-negative",
};

const ITEMS_PER_PAGE = 5;

export default function Dashboard() {
  const api      = useApi();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => { loadMeetings(); }, []);

  const loadMeetings = async () => {
    try {
      const data = await api.getMeetings();
      setMeetings(data.meetings || []);
    } catch (_) {}
  };

  const handleDelete = async (e, sessionId) => {
    e.stopPropagation();
    if (!confirm("Delete this meeting?")) return;
    await api.deleteMeeting(sessionId).catch(() => {});
    setMeetings((prev) => {
      const updated = prev.filter((m) => m.sessionId !== sessionId);
      const newTotalPages = Math.ceil(updated.length / ITEMS_PER_PAGE) || 1;
      if (currentPage > newTotalPages) {
        setCurrentPage(newTotalPages);
      }
      return updated;
    });
  };

  // Pagination calculations
  const totalPages = Math.ceil(meetings.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedMeetings = meetings.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <>
      <div className="glow-blob glow-blob-1" />
      <div className="glow-blob glow-blob-2" />
      <Navbar />

      <div className="page-content page-content--wide">

        {/* Hero */}
        <div className="hero">
          <h1 className="hero-title">Meeting intelligence</h1>
          <p className="hero-subtitle">
            Paste a Google Meet link and deploy the AI scribe bot
          </p>
        </div>

        {/* Bot launcher component */}
        <div className="bot-control-wrapper">
          <BotControl />
        </div>

        {/* Past meetings section */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h2 className="meetings-section__title" style={{ margin: 0 }}>
              Past meetings
              <span className="meetings-section__count">({meetings.length})</span>
            </h2>
            {meetings.length > ITEMS_PER_PAGE && (
              <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                Page {currentPage} of {totalPages} (5 per page)
              </span>
            )}
          </div>

          {meetings.length === 0 ? (
            <div className="glass empty-state--card">
              <div className="empty-state--card-icon">🎙️</div>
              <p className="empty-state--card-text">
                No meetings yet — start your first session above
              </p>
            </div>
          ) : (
            <>
              <div className="meeting-list">
                {paginatedMeetings.map((m) => (
                  <div
                    key={m.sessionId}
                    className="meeting-card"
                    onClick={() => navigate(`/summary/${m.sessionId}`)}
                  >
                    <div className="meeting-card__inner">
                      <div className="meeting-card__content">
                        <div className="meeting-card__title-row">
                          <p className="meeting-card__title">{m.title}</p>
                          <span className={`chip ${SENTIMENT_CHIP[m.sentiment] || "chip-neutral"} meeting-card__chip`}>
                            {m.sentiment}
                          </span>
                        </div>
                        <p className="meeting-card__overview">{m.overview}</p>
                        <p className="meeting-card__meta">
                          {new Date(m.createdAt).toLocaleString()} · {m.transcriptCount} entries
                        </p>
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={(e) => handleDelete(e, m.sessionId)}
                        className="meeting-card__delete"
                        title="Delete meeting"
                      >
                        <svg width="15" height="15" fill="none" viewBox="0 0 24 24"
                          stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* LeetCode-style Pagination Bar */}
              {totalPages > 1 && (
                <div className="pagination-container">
                  <div className="pagination-info">
                    Showing {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, meetings.length)} of {meetings.length} meetings
                  </div>

                  <div className="pagination-controls">
                    {/* Previous Button */}
                    <button
                      className="pagination-btn"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      ‹ Prev
                    </button>

                    {/* Page Numbers */}
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        key={pageNum}
                        className={`pagination-btn ${currentPage === pageNum ? "active" : ""}`}
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </button>
                    ))}

                    {/* Next Button */}
                    <button
                      className="pagination-btn"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next ›
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Global Cross-Meeting AI Assistant (at the bottom) */}
        <GlobalMeetingChatbot meetingCount={meetings.length} />

      </div>
    </>
  );
}
