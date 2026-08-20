require("dotenv").config();
const puppeteer = require("puppeteer");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Helper: Convert PCM16 buffer to WAV format with 44-byte standard header
function pcm16ToWav(pcmBuffer, sampleRate = 16000, numChannels = 1) {
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size
  header.writeUInt16LE(1, 20);  // AudioFormat (PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// Helper: Simple Energy Voice Activity Detection (VAD) to skip silence
function hasAudioActivity(pcmBuffer, threshold = 150) {
  let sum = 0;
  const numSamples = Math.floor(pcmBuffer.length / 2);
  if (numSamples === 0) return false;
  for (let i = 0; i < pcmBuffer.length; i += 2) {
    const sample = pcmBuffer.readInt16LE(i);
    sum += Math.abs(sample);
  }
  const avg = sum / numSamples;
  return avg > threshold;
}

// Candidate Whisper models and endpoints
const WHISPER_MODELS = ["whisper-large-v3", "whisper-large-v3-turbo", "distil-whisper-large-v3-en"];
let workingWhisperModel = WHISPER_MODELS[0];
let workingWhisperEndpoint = "https://api.groq.com/openai/v1/audio/translations";

async function translateAudioWithWhisper(wavBuffer) {
  if (!process.env.GROQ_API_KEY) {
    console.error("❌ GROQ_API_KEY is missing from environment variables");
    return null;
  }

  const endpointsToTry = [
    workingWhisperEndpoint,
    "https://api.groq.com/openai/v1/audio/translations",
    "https://api.groq.com/openai/v1/audio/transcriptions",
  ];

  const modelsToTry = [
    workingWhisperModel,
    ...WHISPER_MODELS.filter(m => m !== workingWhisperModel),
  ];

  for (const endpoint of [...new Set(endpointsToTry)]) {
    for (const modelName of modelsToTry) {
      try {
        const formData = new FormData();
        const audioBlob = new Blob([wavBuffer], { type: "audio/wav" });
        formData.append("file", audioBlob, "audio.wav");
        formData.append("model", modelName);
        formData.append("response_format", "json");

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();
          workingWhisperModel = modelName;
          workingWhisperEndpoint = endpoint;
          return result.text?.trim() || null;
        }

        const errText = await response.text();
        if (errText.includes("model_not_found") || errText.includes("does not exist") || response.status === 404) {
          console.warn(`⚠️ Whisper model '${modelName}' at '${endpoint}' not found, trying fallback...`);
          continue;
        }

        console.warn(`Groq Whisper API warning (${response.status}):`, errText);
      } catch (err) {
        console.warn(`Fetch error for ${modelName}:`, err.message);
      }
    }
  }

  return null;
}

class MeetBot {
  constructor(sessionId, meetUrl, io) {
    this.sessionId = sessionId;
    this.meetUrl = meetUrl;
    this.io = io;
    this.browser = null;
    this.page = null;
    this.transcript = [];
    this.isRunning = false;
    this.participantNames = [];
    this._currentSpeaker = null;
    this._lastSpeaker = null;
    this._lastEntryId = null;
    this._audioBufferList = [];
    this._isProcessingAudio = false;
    this._whisperInterval = null;
    this.userDataDir = null;
  }

  emit(event, data) {
    this.io.to(this.sessionId).emit(event, data);
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _detectBrowser() {
    const homeDir = os.homedir();
    const browserPaths = [
      path.join(process.env.PROGRAMFILES || "", "Google\\Chrome\\Application\\chrome.exe"),
      path.join(process.env["PROGRAMFILES(X86)"] || "", "Google\\Chrome\\Application\\chrome.exe"),
      path.join(homeDir, "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
      path.join(process.env.PROGRAMFILES || "", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
      path.join(homeDir, "AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
      path.join(process.env.PROGRAMFILES || "", "Microsoft\\Edge\\Application\\msedge.exe"),
    ];
    for (const p of browserPaths) {
      try {
        if (fs.existsSync(p)) {
          console.log("✅ Found browser:", p);
          return p;
        }
      } catch (_) {}
    }
    return null;
  }

  async launch() {
    this.isRunning = true;
    this.emit("bot-status", { status: "launching", message: "Starting browser..." });

    const browserPath = process.env.CHROME_EXECUTABLE_PATH || this._detectBrowser();
    if (!browserPath) {
      throw new Error("Chrome or Brave not found. Set CHROME_EXECUTABLE_PATH if needed.");
    }

    this.userDataDir = path.join(os.tmpdir(), `meet-scribe-profile-${Date.now()}-${uuidv4()}`);
    fs.mkdirSync(this.userDataDir, { recursive: true });
    console.log("🧪 Launching Chrome with a fresh temp profile:", this.userDataDir);

    const launchOptions = {
      headless: false,
      userDataDir: this.userDataDir,
      executablePath: browserPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--disable-infobars",
        "--lang=en-US",
        "--window-size=1366,768",
        "--window-position=0,0",
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--enable-usermedia-screen-capturing",
        "--force-device-scale-factor=1",
        "--mute-audio",
      ],
      ignoreDefaultArgs: ["--enable-automation"],
    };

    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();

    // Anti-detection
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [
          { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
          { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
          { name: "Native Client", filename: "internal-nacl-plugin" },
        ],
      });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      Object.defineProperty(navigator, "platform", { get: () => "Win32" });
      Object.defineProperty(navigator, "vendor", { get: () => "Google Inc." });
      delete window.callPhantom;
      delete window._phantom;
      delete window.domAutomation;
      delete window.domAutomationController;
      window.chrome = {
        runtime: { connect: () => {}, onMessage: { addListener: () => {} } },
        loadTimes: () => ({}),
        app: {},
      };
    });

    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    const ctx = this.browser.defaultBrowserContext();
    await ctx.overridePermissions("https://meet.google.com", ["microphone", "camera"]);
    await ctx.overridePermissions("https://accounts.google.com", ["microphone", "camera"]);

    this.page.on("console", (msg) => {
      const text = msg.text();
      if (!text.includes("Invalid keyframe") && !text.includes("third-party")) {
        console.log("📄 Page:", text.substring(0, 150));
      }
    });
    this.page.on("error", (err) => console.error("❌ Page error:", err.message));

    // Expose audio chunk receiver
    await this.page.exposeFunction("sendAudioChunk", (base64Chunk) => {
      if (!this.isRunning) return;
      try {
        const buffer = Buffer.from(base64Chunk, "base64");
        this._audioBufferList.push(buffer);
      } catch (err) {
        console.error("Audio chunk decode error:", err.message);
      }
    });

    await this.page.exposeFunction("onCaptionUpdate", (speakerName) => {
      if (speakerName && speakerName.trim().length > 0 && speakerName.trim().length < 50) {
        const name = speakerName.trim();
        if (name !== this._currentSpeaker) {
          this._currentSpeaker = name;
          console.log(`🗣️ Caption speaker: ${name}`);
        }
      }
    }).catch(() => {});

    // WebRTC audio interceptor
    await this.page.evaluateOnNewDocument(() => {
      window._audioContext = null;
      window._audioProcessor = null;
      window._audioTrackCount = 0;

      const OrigRTC = window.RTCPeerConnection;
      window.RTCPeerConnection = function (...args) {
        const pc = new OrigRTC(...args);
        pc.addEventListener("track", (e) => {
          if (e.track.kind !== "audio") return;
          window._audioTrackCount++;
          console.log(`🎤 Audio track #${window._audioTrackCount} captured`);

          if (!window._audioContext) {
            window._audioContext = new AudioContext({ sampleRate: 16000 });
          }
          if (window._audioContext.state === "suspended") {
            window._audioContext.resume();
          }

          const stream = new MediaStream([e.track.clone()]);
          const src = window._audioContext.createMediaStreamSource(stream);

          if (!window._audioProcessor) {
            window._audioProcessor = window._audioContext.createScriptProcessor(4096, 1, 1);
            window._audioProcessor.connect(window._audioContext.destination);

            let count = 0;
            window._audioProcessor.onaudioprocess = (ev) => {
              const data = ev.inputBuffer.getChannelData(0);
              const pcm16 = new Int16Array(data.length);
              for (let i = 0; i < data.length; i++) {
                pcm16[i] = Math.max(-32768, Math.min(32767, data[i] * 32768));
              }
              const uint8 = new Uint8Array(pcm16.buffer);
              let binary = "";
              for (let j = 0; j < uint8.length; j++) {
                binary += String.fromCharCode(uint8[j]);
              }
              count++;
              if (count % 100 === 0) console.log(`🎵 Chunks captured: ${count}`);
              if (typeof window.sendAudioChunk === "function") {
                window.sendAudioChunk(btoa(binary));
              }
            };
            console.log("✅ Audio processor ready");
          }

          src.connect(window._audioProcessor);
          console.log(`✅ Track #${window._audioTrackCount} connected`);
        });
        return pc;
      };
      Object.keys(OrigRTC).forEach((k) => { window.RTCPeerConnection[k] = OrigRTC[k]; });
      console.log("✅ WebRTC interceptor installed");
    });

    await this._signInToGoogle();
    await this._joinMeeting();
  }

  async _signInToGoogle() {
    console.log("🔐 Opening Google sign-in for user...");
    this.emit("bot-status", {
      status: "waiting-signin",
      message: "Please sign in with YOUR Google account in the browser window that just opened.",
    });

    try {
      await this.page.goto(
        "https://accounts.google.com/ServiceLogin?continue=https://www.google.com",
        { waitUntil: "networkidle2", timeout: 30000 }
      );
    } catch (_) {}

    await this.sleep(2000);
    console.log("⏳ Waiting for user to sign in manually...");

    const MAX_WAIT = 5 * 60 * 1000;
    const CHECK_INTERVAL = 2000;
    let elapsed = 0;

    while (elapsed < MAX_WAIT) {
      try {
        const url = this.page.url();
        if (url.includes("google.com") && !url.includes("accounts.google.com")) {
          console.log("✅ User signed in!");
          this.emit("bot-status", {
            status: "success",
            message: "Signed in! Opening Meet link now...",
          });
          await this.sleep(2000);
          return;
        }
      } catch (_) {}

      await this.sleep(CHECK_INTERVAL);
      elapsed += CHECK_INTERVAL;

      if (elapsed % 30000 === 0) {
        this.emit("bot-status", {
          status: "waiting-signin",
          message: `Waiting for sign-in... (${Math.floor(elapsed / 1000)}s) — Please sign in with your Google account`,
        });
      }
    }

    console.log("⚠️ Sign-in timeout");
    await this.sleep(2000);
  }

  async _joinMeeting() {
    this.emit("bot-status", { status: "navigating", message: "Opening Google Meet..." });

    try {
      await this.page.goto(this.meetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await this.sleep(5000);

      await this.page.evaluate(() => { window.scrollTo(0, 0); });
      await this.page.screenshot({ path: "meet-loading.png" });

      const pageText = await this.page.evaluate(() => document.body.innerText);
      console.log("📄 Page preview:", pageText.substring(0, 200));

      if (
        pageText.includes("You can't join this video call") &&
        pageText.includes("wrong account")
      ) {
        console.error("❌ Google Workspace domain restriction detected!");
        this.emit("bot-status", {
          status: "error",
          message:
            "This Google Meet requires an organizational account (@school/company domain).",
        });
        return;
      }

      // Pre-join muting mic & camera
      await this.page.evaluate(() => {
        const buttons = Array.from(
          document.querySelectorAll("button, div[role='button'], div[data-is-muted]")
        );
        for (const b of buttons) {
          const aria = (b.getAttribute("aria-label") || "").toLowerCase();
          if (
            aria.includes("turn off microphone") ||
            (aria.includes("microphone") && !aria.includes("on"))
          ) {
            b.click();
          }
          if (
            aria.includes("turn off camera") ||
            (aria.includes("camera") && !aria.includes("on"))
          ) {
            b.click();
          }
        }
      });
      console.log("✅ Mic off");
      console.log("✅ Camera off");

      this.emit("bot-status", {
        status: "joining",
        message: "Please click 'Ask to join' or 'Join now' in the browser window!",
      });

      console.log("⏳ Waiting for user to click Join...");
      const joined = await this._waitForJoin();
      if (!joined) {
        throw new Error("Timeout waiting for user to join the meeting");
      }

      console.log("✅ User joined meeting!");
      this.emit("bot-status", {
        status: "joined",
        message: "In meeting! Capturing and translating speech...",
      });

      await this.sleep(3000);
      await this._ensureAudioPlaying();
      await this._startAudioPipeline();

    } catch (err) {
      console.error("❌ Join error:", err.message);
      this.emit("bot-status", { status: "error", message: err.message });
      throw err;
    }
  }

  async _waitForJoin() {
    const MAX_WAIT = 5 * 60 * 1000;
    const CHECK_INTERVAL = 2000;
    let elapsed = 0;

    while (elapsed < MAX_WAIT) {
      try {
        const inMeeting = await this.page.evaluate(() => {
          const leaveButtons = Array.from(
            document.querySelectorAll("button, div[role='button']")
          ).filter((b) => {
            const aria = (b.getAttribute("aria-label") || "").toLowerCase();
            const text = (b.innerText || "").toLowerCase();
            return (
              aria.includes("leave call") ||
              aria.includes("leave meeting") ||
              text.includes("leave call") ||
              b.getAttribute("data-call-ended") !== null
            );
          });
          const hasControls = document.querySelector("[data-meeting-title]") !== null ||
                              document.querySelector("[data-call-ended]") !== null ||
                              document.querySelector("[data-self-name]") !== null;
          return leaveButtons.length > 0 || hasControls;
        });

        if (inMeeting) return true;
      } catch (_) {}

      await this.sleep(CHECK_INTERVAL);
      elapsed += CHECK_INTERVAL;

      if (elapsed % 20000 === 0) {
        this.emit("bot-status", {
          status: "joining",
          message: `Waiting for join (${Math.floor(elapsed / 1000)}s) — Please click 'Ask to join' or 'Join now' in Chrome!`,
        });
      }
    }
    return false;
  }

  async _startAudioPipeline() {
    console.log("🎤 Starting Whisper translation pipeline...");
    this.emit("bot-status", { status: "listening", message: "Listening & Translating..." });

    const MAX_WAIT = 15000;
    const CHECK_INTERVAL = 1000;
    let waited = 0;
    while (waited < MAX_WAIT) {
      try {
        const count = await this.page.evaluate(() => window._audioTrackCount || 0);
        if (count > 0) {
          console.log(`🎧 Incoming audio tracks detected: ${count}`);
          break;
        }
      } catch (_) {}
      await this.sleep(CHECK_INTERVAL);
      waited += CHECK_INTERVAL;
    }

    this._startWhisperAudioProcessor();
    this._startParticipantScraper();
    await this._enableCaptions();
    console.log("✅ Transcription & Translation pipeline ready");
  }

  async _ensureAudioPlaying() {
    try {
      await this.page.evaluate(() => {
        try {
          const mediaEls = Array.from(document.querySelectorAll('audio, video'));
          mediaEls.forEach((el) => {
            try {
              el.muted = false;
              if (typeof el.volume === 'number') el.volume = 1.0;
              if (el.paused) el.play().catch(() => {});
            } catch (e) {}
          });

          const audios = document.getElementsByTagName('audio');
          for (const a of audios) {
            try { a.muted = false; a.volume = 1.0; a.play().catch(() => {}); } catch (e) {}
          }
        } catch (e) {}
      });
      console.log('🔊 Ensured page audio elements are unmuted and playing');
    } catch (err) {
      console.warn('⚠️ Failed to ensure audio playing:', err.message);
    }
  }

  async _enableCaptions() {
    console.log("💬 Enabling captions...");
    try {
      const captionEnabled = await this.page.evaluate(async () => {
        const clickIfVisible = (el) => {
          if (!el) return false;
          el.scrollIntoView({ block: "center", inline: "center" });
          el.click();
          return true;
        };

        const hasCaptionButton = () => {
          const buttons = Array.from(document.querySelectorAll("button, div[role='button'], span[role='button']"));
          for (const button of buttons) {
            const aria = (button.getAttribute("aria-label") || "").trim().toLowerCase();
            const text = (button.innerText || "").trim().toLowerCase();
            if (
              aria.includes("turn on captions") ||
              aria.includes("turn captions on") ||
              text.includes("turn on captions") ||
              (text.includes("captions") && aria.includes("closed captions"))
            ) {
              return button;
            }
          }
          return null;
        };

        const captionButton = hasCaptionButton();
        if (captionButton) {
          clickIfVisible(captionButton);
          return true;
        }

        const moreMenu = Array.from(document.querySelectorAll("button, div[role='button'], span[role='button']")).find((button) => {
          const aria = (button.getAttribute("aria-label") || "").trim().toLowerCase();
          const text = (button.innerText || "").trim().toLowerCase();
          return aria.includes("more options") || text === "more options" || text === "more";
        });

        if (moreMenu && clickIfVisible(moreMenu)) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const menuItem = Array.from(document.querySelectorAll("button, div[role='button'], span[role='button']")).find((item) => {
            const text = (item.innerText || "").trim().toLowerCase();
            return text.includes("turn on captions") || text.includes("captions");
          });
          if (menuItem && clickIfVisible(menuItem)) return true;
        }

        return false;
      });

      if (!captionEnabled) {
        await this.page.keyboard.press("c");
        await this.sleep(1000);
      } else {
        await this.sleep(2000);
      }

      // Observe DOM for captions to extract active speaker names
      await this.page.evaluate(() => {
        let retryCount = 0;
        const maxRetries = 20;

        window._updateSpeaker = function(name) {
          if (name && name.length > 0 && name.length < 50) {
            if (typeof window.onCaptionUpdate === "function") {
              window.onCaptionUpdate(name);
            }
          }
        };

        function findAndObserveCaptions() {
          retryCount++;
          const selectors = [
            ".a4cQT", ".TBnnec", ".CNusmb", ".iOzk7",
            "[jsname='tgaKEf']", "[data-message-text]", "[class*='caption']",
            "[class*='Caption']", "[class*='transcript']"
          ];

          let container = null;
          for (const sel of selectors) {
            container = document.querySelector(sel);
            if (container) {
              console.log("✅ Caption container found:", sel);
              break;
            }
          }

          if (!container) {
            if (retryCount < maxRetries) {
              setTimeout(findAndObserveCaptions, 3000);
            }
            return;
          }

          const nameSelectors = [
            ".zs7s8d", ".KcIKyf", ".NWpY1d", "[class*='speaker']",
            "[class*='Speaker']", "[class*='name']", "[jsname='r4nke']"
          ];

          function getLatestSpeakerName() {
            for (const sel of nameSelectors) {
              const allEls = container.querySelectorAll(sel);
              if (allEls.length > 0) {
                const lastEl = allEls[allEls.length - 1];
                const name = lastEl.innerText?.trim();
                if (name && name.length > 0 && name.length < 50) return name;
              }
            }
            return null;
          }

          const observer = new MutationObserver(() => {
            try {
              const name = getLatestSpeakerName();
              if (name) window._updateSpeaker(name);
            } catch (e) {}
          });

          observer.observe(container, { childList: true, subtree: true, characterData: true });

          setInterval(() => {
            try {
              let name = getLatestSpeakerName();
              if (!name) {
                const headerSelectors = ["[data-participant-name]", "[class*='active-speaker']", ".uVSpGf"];
                for (const sel of headerSelectors) {
                  const el = document.querySelector(sel);
                  if (el && el.innerText?.trim()) {
                    name = el.innerText.trim();
                    break;
                  }
                }
              }
              if (name) window._updateSpeaker(name);
            } catch (e) {}
          }, 1000);
        }

        setTimeout(findAndObserveCaptions, 3000);
      });

    } catch (err) {
      console.log("⚠️ Caption enable error:", err.message);
    }
  }

  _startParticipantScraper() {
    const scrape = async () => {
      try {
        if (!this.page || this.page.isClosed() || !this.isRunning) return;

        const names = await this.page.evaluate(() => {
          const names = [];
          const seen = new Set();
          const rejectList = [
            "microphone", "camera", "settings", "video", "audio", "screen",
            "share", "chat", "caption", "raise hand", "reaction", "panel",
            "call controls", "meeting details", "background", "everyone",
            "notifications", "ai scribe", "meetscribe", "scribe",
          ];

          document.querySelectorAll("[data-self-name]").forEach((el) => {
            const name = el.getAttribute("data-self-name");
            if (name && name.length > 1 && name.length < 40 && !seen.has(name)) {
              const lower = name.toLowerCase();
              if (!rejectList.some((p) => lower.includes(p))) {
                seen.add(name);
                names.push(name);
              }
            }
          });

          return names;
        }).catch(() => []);

        if (names.length > 0) {
          const newJoiners = names.filter((n) => !this.participantNames.includes(n));
          const left = this.participantNames.filter((n) => !names.includes(n));
          if (newJoiners.length > 0) console.log(`🟢 Joined: ${newJoiners.join(", ")}`);
          if (left.length > 0) console.log(`🔴 Left: ${left.join(", ")}`);

          if (JSON.stringify(names.sort()) !== JSON.stringify([...this.participantNames].sort())) {
            this.participantNames = names;
            console.log(`👥 Participants: ${names.join(", ")}`);
          }
        }
      } catch (_) {}
    };

    setTimeout(scrape, 5000);
    const interval = setInterval(() => {
      if (!this.isRunning) { clearInterval(interval); return; }
      scrape();
    }, 3000);

    console.log("✅ Participant scraper started");
  }

  // Groq Whisper Large-v3 Audio Translation Processor
  _startWhisperAudioProcessor() {
    if (this._whisperInterval) clearInterval(this._whisperInterval);

    console.log("✅ Groq Whisper Large-v3 Translation Engine connected (Translating 99+ languages to English)");

    this._whisperInterval = setInterval(async () => {
      if (!this.isRunning || this._isProcessingAudio) return;
      if (this._audioBufferList.length < 8) return; // Wait until ~2.5 seconds of audio chunks accumulate

      this._isProcessingAudio = true;
      const chunksToProcess = this._audioBufferList.splice(0, this._audioBufferList.length);
      const combinedPcm = Buffer.concat(chunksToProcess);

      try {
        // Skip silent audio chunks
        if (hasAudioActivity(combinedPcm, 150)) {
          const wavBuffer = pcm16ToWav(combinedPcm, 16000, 1);
          
          const translatedEnglish = await translateAudioWithWhisper(wavBuffer);

          if (translatedEnglish && translatedEnglish.length > 1) {
            // Ignore repetitive silence hallucination phrases common in Whisper
            const hallucinations = [
              "thank you", "thanks for watching", "subtitles by", "translated by",
              "subscribe to my channel", "bye", "you", "the end", "i'm sorry", "..."
            ];
            const lower = translatedEnglish.toLowerCase().trim().replace(/[.,!]/g, "");
            const isHallucination = hallucinations.some(h => lower === h);

            if (!isHallucination) {
              let speakerName = this._currentSpeaker;
              if (!speakerName && this.participantNames.length > 0) {
                speakerName = this.participantNames[0];
              }
              if (!speakerName) speakerName = "Speaker 1";

              const entry = {
                id: uuidv4(),
                text: translatedEnglish,
                timestamp: new Date().toISOString(),
                speaker: speakerName,
              };

              this.transcript.push(entry);
              console.log(`📝 [${speakerName}] (Whisper Translated English):`, entry.text);
              this.emit("transcript-update", { entry, isFinal: true });

              this._currentSpeaker = null;
            }
          }
        }
      } catch (err) {
        console.error("❌ Audio translation pipeline error:", err.message);
      } finally {
        this._isProcessingAudio = false;
      }
    }, 3000);
  }

  async _cleanupTempProfile() {
    if (!this.userDataDir) return;
    try {
      fs.rmSync(this.userDataDir, { recursive: true, force: true });
      console.log("🧹 Removed temp Chrome profile:", this.userDataDir);
    } catch (err) {
      console.warn("⚠️ Failed to remove temp profile:", err.message);
    } finally {
      this.userDataDir = null;
    }
  }

  async stop() {
    this.isRunning = false;
    if (this._whisperInterval) clearInterval(this._whisperInterval);
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (err) {
        console.warn("⚠️ Error closing browser:", err.message);
      }
    }
    await this._cleanupTempProfile();
    this.emit("bot-status", { status: "stopped", message: "Bot has left the meeting." });
    return this.transcript;
  }

  getTranscript() {
    return this.transcript;
  }
}

module.exports = MeetBot;
