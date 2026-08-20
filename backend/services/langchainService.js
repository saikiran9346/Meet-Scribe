const chatSessions = new Map();

let cachedGroqModels = null;
let workingModelName = null;

// Dynamically discover all active models available on this Groq API Key
async function getAvailableModels() {
  if (cachedGroqModels && cachedGroqModels.length > 0) {
    return cachedGroqModels;
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.data)) {
        // Filter out audio/whisper and guard models, keep active text/chat models
        const textModels = data.data
          .map((m) => m.id)
          .filter((id) => !id.includes("whisper") && !id.includes("guard") && !id.includes("vision"));

        if (textModels.length > 0) {
          console.log("✅ Discovered active Groq LLM models:", textModels);
          cachedGroqModels = textModels;
          workingModelName = textModels[0];
          return textModels;
        }
      }
    } else {
      console.warn("⚠️ Failed to query Groq models list:", res.status);
    }
  } catch (err) {
    console.warn("⚠️ Model discovery error:", err.message);
  }

  // Fallback list if discovery endpoint fails
  return [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "llama-3.1-70b-versatile",
    "mixtral-8x7b-32768",
  ];
}

async function callGroqAPI(messages, jsonMode = false) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set in environment variables");
  }

  const availableModels = await getAvailableModels();
  const modelsToTry = [
    workingModelName || availableModels[0],
    ...availableModels.filter((m) => m !== workingModelName),
  ];

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const payload = {
        model,
        messages,
        temperature: 0.2,
      };
      if (jsonMode) {
        payload.response_format = { type: "json_object" };
      }

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          workingModelName = model; // Cache the confirmed working model
          return content;
        }
      }

      const errText = await res.text();
      console.warn(`⚠️ Groq model '${model}' rejected (${res.status}):`, errText.substring(0, 150));
      lastError = new Error(`Groq ${model} error: ${errText}`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Failed to communicate with Groq API");
}

async function translateToEnglish(text) {
  if (!text || typeof text !== "string" || !text.trim()) return text;
  try {
    const messages = [
      {
        role: "system",
        content: `You are an ultra-fast speech translator for real-time meeting transcripts.
If the input text is in any language other than English (e.g. Hindi, Telugu, Tamil, Bengali, Marathi, Spanish, French, German, Japanese, Chinese, Arabic, Hinglish, etc.) or mixed multilingual speech, translate it into natural, fluent English.
If the input text is already in English, output the exact same text without changing its meaning.
Output ONLY the translated English text. Do NOT add quotation marks, explanations, notes, or conversational filler.`
      },
      {
        role: "user",
        content: text.trim()
      }
    ];

    const translated = await callGroqAPI(messages, false);
    return translated.trim().replace(/^["']|["']$/g, "").trim() || text;
  } catch (err) {
    console.warn("Translation fallback warning:", err.message);
    return text;
  }
}

function formatTranscript(entries) {
  return entries.map((e) => `[${e.speaker}]: ${e.text}`).join("\n");
}

async function summarizeTranscript(transcriptEntries) {
  const text = formatTranscript(transcriptEntries);
  if (!text.trim()) throw new Error("Transcript is empty");

  const messages = [
    {
      role: "system",
      content: `You are an elite executive AI chief-of-staff and meeting intelligence specialist for MeetScribe.
Your job is to thoroughly analyze meeting transcripts and generate rich, comprehensive, deeply detailed meeting intelligence.

CRITICAL INSTRUCTIONS:
1. "overview": Write a comprehensive, detailed 2-3 paragraph executive summary. Detail the full background context, the main topics and debates explored in depth, key arguments raised, important nuances, and the final outcomes or consensus reached. Do NOT write a brief 1-line summary — make it informative and detailed.
2. "keyDecisions": Provide an exhaustive list of EVERY decision, consensus, technical architecture choice, agreement, policy change, or timeline decided during the conversation.
3. "actionItems": Extract all concrete tasks, assignments, deliverables, and follow-ups mentioned in the discussion with specific task descriptions, designated owners, and priority levels ("high", "medium", "low").
4. "speakerBreakdown": For each unique speaker who participated, provide a detailed summary of their specific contributions, ideas shared, questions asked, and points argued.
5. "sentiment": One of "positive", "neutral", "mixed", "negative".
6. "sentimentReason": 1-2 detailed sentences explaining why this sentiment was chosen based on speaker tones and interactions.
7. "duration": Estimated duration of the meeting based on the discussion length.

You MUST return a valid JSON object matching this exact schema:
{
  "title": "Clear, Professional Meeting Title (5-8 words)",
  "overview": "Comprehensive 2-3 paragraph executive summary covering full context, detailed discussions, outcomes, and implications.",
  "keyDecisions": [
    "Detailed decision 1 with context and reasoning",
    "Detailed decision 2 with context and reasoning"
  ],
  "actionItems": [
    { "task": "Comprehensive description of task to execute", "owner": "Assigned Person or Team", "priority": "high" }
  ],
  "speakerBreakdown": [
    { "speaker": "Speaker Name", "summary": "Detailed description of everything this participant contributed, proposed, or discussed." }
  ],
  "sentiment": "positive",
  "sentimentReason": "Thorough justification of the meeting atmosphere and dynamics.",
  "duration": "Estimated meeting duration"
}`
    },
    {
      role: "user",
      content: `Here is the full meeting transcript:\n\n${text}\n\nGenerate the comprehensive, in-depth executive analysis in valid JSON now:`
    }
  ];

  try {
    const response = await callGroqAPI(messages, true);
    const parsed = JSON.parse(response);
    return parsed;
  } catch (err) {
    console.error("Failed to generate summary:", err.message);
    return {
      title: "Meeting Summary",
      overview: "Summary generated from transcript.",
      keyDecisions: [],
      actionItems: [],
      speakerBreakdown: [],
      sentiment: "neutral",
      sentimentReason: "Meeting concluded",
      duration: "approx 5 mins",
    };
  }
}

function initChatSession(sessionId, transcriptEntries, summaryData) {
  const transcript = formatTranscript(transcriptEntries);
  const summaryText = summaryData
    ? `Meeting title: ${summaryData.title}\nOverview: ${summaryData.overview}`
    : "";

  const systemPrompt = `You are an intelligent meeting assistant for MeetScribe.
You have full access to the transcript of a specific meeting and its summary.
Answer questions ONLY based on what was discussed in this meeting.
If something was not discussed, say so clearly.
Be concise, helpful, and reference specific speakers when relevant.

${summaryText}

Full Meeting Transcript:
${transcript}`;

  chatSessions.set(sessionId, {
    systemPrompt,
    messages: [],
    transcript: transcriptEntries,
    summary: summaryData,
  });

  return true;
}

async function chatWithMeeting(sessionId, userMessage, transcriptEntries, summaryData) {
  if (!chatSessions.has(sessionId)) {
    initChatSession(sessionId, transcriptEntries, summaryData);
  }

  const session = chatSessions.get(sessionId);

  const apiMessages = [
    { role: "system", content: session.systemPrompt },
    ...session.messages,
    { role: "user", content: userMessage }
  ];

  const assistantMessage = await callGroqAPI(apiMessages, false);

  session.messages.push({ role: "user", content: userMessage });
  session.messages.push({ role: "assistant", content: assistantMessage });

  return {
    answer: assistantMessage,
    messages: session.messages,
  };
}

async function chatAcrossAllMeetings(userMessage, conversationHistory = [], allMeetings = []) {
  if (!allMeetings || allMeetings.length === 0) {
    return {
      answer: "You don't have any saved meetings in your dashboard yet. Once you complete and save a meeting, you can ask me questions across all of your meetings!",
      referencedMeetings: [],
    };
  }

  // Build structured, rich knowledge context from all meetings
  const meetingsContext = allMeetings.map((m, idx) => {
    const title = m.title || "Untitled Meeting";
    const date = m.createdAt
      ? new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "Recent Date";
    const summary = m.summary || {};
    const overview = summary.overview || m.overview || "No overview recorded.";
    const decisions = Array.isArray(summary.keyDecisions) && summary.keyDecisions.length > 0
      ? summary.keyDecisions.map(d => `  * ${d}`).join("\n")
      : "  * None recorded";
    const actions = Array.isArray(summary.actionItems) && summary.actionItems.length > 0
      ? summary.actionItems.map(a => `  * [Priority: ${a.priority || 'medium'}] ${a.task} (Owner: ${a.owner || 'Team'})`).join("\n")
      : "  * None recorded";
    const speakers = Array.isArray(summary.speakerBreakdown) && summary.speakerBreakdown.length > 0
      ? summary.speakerBreakdown.map(s => `  * ${s.speaker}: ${s.summary}`).join("\n")
      : "  * Not recorded";

    return `=== MEETING #${idx + 1}: "${title}" (Session ID: ${m.sessionId}) ===
Date & Time: ${date}
Overview:
${overview}

Decisions Made:
${decisions}

Action Items:
${actions}

Speaker Contributions:
${speakers}`;
  }).join("\n\n----------------------------------------\n\n");

  const systemPrompt = `You are the Global Cross-Meeting Intelligence Assistant for MeetScribe.
You have complete access to the user's saved meeting knowledge base.

YOUR MISSION:
1. Synthesize insights across multiple meetings (e.g. tracking how decisions, projects, or topics progressed over time).
2. Query action items, task ownership, and commitments across all meetings.
3. Compare perspectives between different meetings or speakers.
4. Always cite your sources explicitly whenever referencing a meeting, using the format: **[Meeting: "Title" (Date)]**.

CRITICAL INSTRUCTIONS:
- Base your answers strictly on the provided meeting records.
- If information was not discussed in any of the recorded meetings, state that clearly and politely.
- Format your response with clear markdown headings, bullet points, and bold text for maximum readability.

USER'S RECORDED MEETINGS KNOWLEDGE BASE:
${meetingsContext}`;

  const apiMessages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-8).map(msg => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    })),
    { role: "user", content: userMessage }
  ];

  const assistantAnswer = await callGroqAPI(apiMessages, false);

  // Extract referenced meetings
  const referenced = [];
  for (const m of allMeetings) {
    if (
      assistantAnswer.toLowerCase().includes((m.title || "").toLowerCase()) ||
      (m.sessionId && assistantAnswer.includes(m.sessionId))
    ) {
      referenced.push({
        sessionId: m.sessionId,
        title: m.title || "Meeting",
        createdAt: m.createdAt,
      });
    }
  }

  return {
    answer: assistantAnswer,
    referencedMeetings: referenced,
  };
}

function getChatHistory(sessionId) {
  if (!chatSessions.has(sessionId)) return [];
  return chatSessions.get(sessionId).messages || [];
}

function clearChatSession(sessionId) {
  chatSessions.delete(sessionId);
}

module.exports = {
  translateToEnglish,
  summarizeTranscript,
  initChatSession,
  chatWithMeeting,
  chatAcrossAllMeetings,
  getChatHistory,
  clearChatSession,
};