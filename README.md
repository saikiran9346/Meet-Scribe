<div align="center">

# 🎙️ MeetScribe

### **AI-Powered Real-Time Meeting Assistant & Cross-Meeting Intelligence Platform**

*Autonomous Google Meet bot, 99+ language real-time speech translation into English with Groq Whisper, executive-grade AI summaries, and cross-meeting RAG intelligence.*

[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Firebase](https://img.shields.io/badge/Firebase_Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Groq Whisper](https://img.shields.io/badge/Groq_Whisper_v3-Multilingual_STT-F05A28?style=for-the-badge)](https://groq.com/)
[![Groq LLaMA](https://img.shields.io/badge/Groq_LLaMA_3-Ultra--Fast_LLM-F05A28?style=for-the-badge)](https://groq.com/)
[![LangChain](https://img.shields.io/badge/LangChain-RAG_Orchestration-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white)](https://www.langchain.com/)

[Features](#-key-features) • [Architecture](#-architecture) • [Quick Start Guide](#-quick-start-guide) • [API Reference](#-api-reference) • [Configuration](#-environment-variables)

---

</div>

## 📌 Overview

**MeetScribe** is a state-of-the-art meeting intelligence platform designed to eliminate manual note-taking, break language barriers, and turn team conversations into structured, searchable knowledge.

Using an autonomous browser bot powered by **Puppeteer**, MeetScribe joins Google Meet calls, captures live tab audio, and streams it to **Groq Whisper Large-v3 (`whisper-large-v3`)** to translate speech from **99+ languages directly into fluent English in real-time**.

Upon meeting conclusion, an executive AI engine extracts comprehensive multi-paragraph overviews, key decisions with reasoning, granular action items with owners & priorities, speaker contribution breakdowns, and sentiment dynamics. All meeting intelligence is securely stored in **Firebase Firestore**, complete with **PDF generation**, **public shareable links**, **per-meeting deep-dive AI chat**, and a **Global Cross-Meeting RAG Assistant** on the dashboard.

---

## ✨ Key Features

| Feature | Description |
| :--- | :--- |
| 🤖 **Autonomous Meet Bot** | Puppeteer-driven bot that auto-detects installed browsers (Chrome, Brave, Edge), joins Google Meet links, automatically turns off mic/camera, and captures PCM16 tab audio. |
| 🌐 **99+ Multilingual Speech Translation** | Speaks in **Hindi, Telugu, Tamil, Spanish, French, German, Japanese, Chinese, Arabic, or Hinglish**? Groq Whisper translates the speech **directly into clean English in real-time** (~150ms latency). |
| ⚡ **Zero-Card Free Cloud Processing** | Runs 100% on free-tier services (Groq Cloud + Firebase) with **zero credit card requirements** and zero local GPU hardware strain. |
| 🧠 **Global Cross-Meeting Intelligence (RAG)** | Ask natural-language questions across **all past meetings** right from the Dashboard (*"What decisions did we make this month?"*, *"List all tasks assigned to Rahul"*). |
| 💬 **Per-Meeting Deep-Dive AI Chatbot** | Context-aware assistant on individual meeting summary pages to drill down into exact discussion points and speaker arguments. |
| 📝 **Executive-Grade AI Summaries** | Multi-paragraph context summaries, exhaustive key decision logs, and structured action items with assignees and priority badges (`high`, `medium`, `low`). |
| 👥 **Speaker Contribution Breakdown** | Identifies participants via Google Meet DOM scrapers & acoustic diarization, detailing each person's arguments, feedback, and key contributions. |
| 📄 **One-Click PDF Reports** | Generates client-ready, paginated PDF documents on-the-fly using `pdf-lib` without any third-party PDF services. |
| 🔗 **Shareable Public Links** | Generates secure, read-only share URLs allowing external stakeholders to review summaries without logging in. |
| 📑 **LeetCode-Style Dashboard Pagination** | Clean 5-meetings-per-page pagination with quick `‹ Prev` / `Next ›` controls and active page tracking. |
| ☁️ **Cloud Storage & Security** | Robust **Firebase Firestore** persistence with Bearer token authentication and multi-user isolation. |
| 🎨 **Modern Glassmorphic UI** | Responsive dark-mode interface with vibrant neon accents, glass blur effects, and interactive animations. |

---

## 🏗️ Architecture

```mermaid
flowchart TD
    subgraph Client["Frontend (React 18)"]
        DASH["Dashboard & Global RAG Chat"]
        PAGE["Pagination & Past Meetings"]
        SUM["Meeting Summary & Local Chat"]
        WS_C["Socket.IO Client"]
    end

    subgraph Server["Backend (Node.js / Express)"]
        API["REST API Router & Auth Resolver"]
        WS_S["Socket.IO Server"]
        BOT["Puppeteer Meet Bot"]
        VAD["Voice Activity Detector (VAD)"]
        WHISPER_ENG["Groq Whisper Translation Pipeline"]
        LLM_ENG["Groq LLaMA Intelligence Engine"]
        PDF["PDF Generator (pdf-lib)"]
    end

    subgraph ExternalCloud["Cloud & AI Services"]
        GM["Google Meet Audio Stream"]
        GROQ["Groq Cloud API (whisper-large-v3 / llama-3.3)"]
        FS["Firebase Firestore Database"]
        FA["Firebase Authentication"]
    end

    GM -->|WebRTC Audio Stream| BOT
    BOT -->|PCM16 Chunks| VAD
    VAD -->|Active Voice Audio Chunks| WHISPER_ENG
    WHISPER_ENG -->|audio.translations (99+ Langs to English)| GROQ
    GROQ -->|Real-Time English Transcript| WHISPER_ENG
    WHISPER_ENG -->|Live Socket Stream| WS_S
    WS_S -->|transcript-update| WS_C
    WS_C --> SUM

    BOT -->|Full Meeting Transcript| LLM_ENG
    LLM_ENG -->|JSON Mode Prompt| GROQ
    GROQ -->|Executive Summary JSON| LLM_ENG
    LLM_ENG -->|Persist Meeting Document| FS

    DASH -->|POST /api/chat/global (Cross-Meeting RAG)| API
    API -->|Fetch All User Meetings| FS
    API -->|Multi-Meeting Reasoning| GROQ

    API -->|Read / Save Meetings| FS
    API -->|Stream PDF Buffer| PDF
    DASH -->|Authenticate ID Token| FA
```

---

## 🛠️ Tech Stack

### **Frontend**
- **Framework**: React 18, JavaScript (ES6+)
- **Routing**: React Router DOM v6
- **Real-Time Client**: Socket.IO Client
- **Authentication**: Firebase Client SDK (Email/Password, Google Sign-In)
- **Styling**: Vanilla CSS (Custom Design System, Glassmorphism, Responsive CSS Grid/Flexbox)

### **Backend**
- **Runtime**: Node.js (v18+) & Express.js
- **Browser Automation**: Puppeteer (Auto-detects Chrome, Brave, and Edge on Windows/Linux/macOS)
- **Speech-to-Text & Translation**: Groq Whisper Large-v3 (`whisper-large-v3` via `/v1/audio/translations`)
- **Language Models**: Groq Cloud (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`) with automatic fallback routing
- **AI Orchestration**: LangChain, Direct Groq API in native JSON Object Mode
- **Database**: Firebase Admin SDK & Google Cloud Firestore
- **Document Generation**: `pdf-lib`
- **Networking**: WebSockets (`ws`), Socket.IO, CORS

---

## 🚀 Quick Start Guide

Follow these steps to run MeetScribe locally on your machine.

### Prerequisites
- **Node.js**: v18.0.0 or higher ([Download Node.js](https://nodejs.org/))
- **Google Chrome** (or Brave / Edge) installed
- **API Keys & Accounts** (All 100% Free):
  - [Groq Cloud](https://console.groq.com/) (Get a free API key — no credit card needed)
  - [Firebase Console](https://console.firebase.google.com/) (Create a free Firebase project with Firestore enabled)

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/saikiran9346/Meet-Scribe.git
cd Meet-Scribe
```

---

### Step 2: Configure Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   npm install
   ```

2. Create a `.env` file inside `backend/`:
   ```env
   PORT=8080
   FRONTEND_URL=http://localhost:3000
   GROQ_API_KEY=gsk_your_groq_api_key_here
   HEADLESS=false
   ```

3. Place your Firebase Service Account JSON file in the project root as `serviceAccount.json`.

---

### Step 3: Configure Frontend

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   ```

2. Create a `.env` file inside `frontend/`:
   ```env
   REACT_APP_API_URL=http://localhost:8080
   REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
   REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   REACT_APP_FIREBASE_PROJECT_ID=your_project_id
   REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   REACT_APP_FIREBASE_APP_ID=your_app_id
   ```

---

### Step 4: Run the Application

1. **Start the Backend Server**:
   ```bash
   cd backend
   npm start
   ```
   *Backend will run on `http://localhost:8080` with Firestore connected.*

2. **Start the Frontend Client**:
   ```bash
   cd frontend
   npm start
   ```
   *Frontend will open at `http://localhost:3000`.*

---

## 📖 How to Use MeetScribe

1. **Log in / Sign up**: Open `http://localhost:3000` and sign in with your email or Google account.
2. **Deploy the Bot**: Paste any Google Meet URL (e.g. `https://meet.google.com/abc-defg-hij`) on the dashboard and click **Deploy Scribe Bot**.
3. **Google Sign-in**: The Chrome browser window will open automatically. Sign in with your Google account and click **Join**.
4. **Speak in ANY Language**: Speak in Hindi, Telugu, Tamil, Spanish, French, German, Japanese, Arabic, or English. Watch the live transcript on your dashboard display **fluent English translations in real-time**.
5. **Stop & Summarize**: Click **Stop & Summarize** to generate the executive summary, key decisions, and action items.
6. **Save & Chat**: Click **Save Meeting** to store it in Firestore, export as PDF, share via public link, or ask questions to the AI chatbot.
7. **Cross-Meeting Intelligence**: Go to the Dashboard and use the **"Ask AI Across All Meetings"** assistant to analyze decisions and track action items across your entire meeting history!

---

## 📡 API Reference

### **Bot Automation**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/bot/start` | Launch Puppeteer bot and navigate to Google Meet URL |
| `POST` | `/api/bot/stop` | Leave call, finalize transcript, and generate executive summary |
| `GET` | `/api/bot/transcript/:sessionId` | Retrieve real-time in-memory transcript for an active call |

### **Meetings & Firestore Persistence**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/meetings` | List all saved meetings for the authenticated user (sorted newest first) |
| `GET` | `/api/meetings/:sessionId` | Get complete meeting data (overview, decisions, action items, transcript) |
| `POST` | `/api/meetings/:sessionId/save` | Persist temporary meeting data permanently to Firestore |
| `DELETE` | `/api/meetings/:sessionId` | Delete meeting record from Firestore |

### **AI Chatbots (Per-Meeting & Global RAG)**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/meetings/:sessionId/chat` | Chat with AI about a specific meeting's transcript |
| `GET` | `/api/meetings/:sessionId/chat` | Get conversation history for a specific meeting |
| `POST` | `/api/chat/global` | **Cross-Meeting RAG**: Ask questions across all saved meetings with citations |

### **Export & Sharing**
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/meetings/:sessionId/pdf/download` | Stream and download generated PDF document |
| `POST` | `/api/meetings/:sessionId/share` | Generate public read-only report URL |
| `GET` | `/api/share/:sessionId` | Public unauthenticated endpoint to view shared summary |

---

## 📂 Project Structure

```
meet-scribe/
├── backend/
│   ├── bot/
│   │   └── meetBot.js              # Puppeteer bot + WebRTC audio capture & Whisper translation
│   ├── middleware/
│   │   └── auth.js                 # Firebase Admin SDK & token validation
│   ├── routes/
│   │   └── api.js                  # Express REST API routes
│   ├── services/
│   │   ├── langchainService.js     # Groq LLM summarization, translation & RAG chat
│   │   └── storageService.js       # Firestore CRUD operations & PDF generator
│   ├── server.js                   # Express server & Socket.IO initialization
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── BotControl.jsx            # Meeting launcher widget
│   │   │   ├── GlobalMeetingChatbot.jsx  # Cross-meeting RAG AI assistant
│   │   │   ├── LiveTranscript.jsx        # Real-time streaming transcript view
│   │   │   ├── MeetingChatbot.jsx        # Per-meeting deep-dive chatbot
│   │   │   └── Navbar.jsx                # Header & authentication navigation
│   │   ├── context/
│   │   │   └── AuthContext.jsx           # Firebase user authentication state
│   │   ├── hooks/
│   │   │   └── useApi.js                 # Unified API request client
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx             # Main dashboard with pagination (5/page)
│   │   │   ├── Session.jsx               # Live recording & interim transcript view
│   │   │   ├── Summary.jsx               # Tabbed executive meeting report & PDF
│   │   │   ├── PublicSummary.jsx         # Public shareable view
│   │   │   └── Login.jsx                 # User login & registration
│   │   ├── styles/
│   │   │   └── main.css                  # Custom glassmorphic design system
│   │   ├── firebase.js                   # Firebase client initialization
│   │   └── App.jsx                       # React Router configuration
│   ├── package.json
│   └── .env.example
├── serviceAccount.json                   # Firebase Admin credentials (Git ignored)
├── README.md
└── .gitignore
```

---

## 🔒 Security & Privacy

- **API Keys & Credentials**: Protected via `.gitignore`. Service accounts, private keys, and `.env` files are never tracked in Git.
- **Isolated User Profiles**: Each browser bot instance operates in a sandboxed, ephemeral profile that is cleaned up upon session termination.
- **Role & Token Validation**: Secured by Firebase Authentication and Firestore security rules.

---

## 📜 License

This project is open-source and available under the **MIT License**.
