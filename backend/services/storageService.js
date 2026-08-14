const { db } = require("../middleware/auth");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

// Save meeting to Firestore
async function saveMeeting(userId, sessionId, summary, transcript) {
  try {
    await db.collection("meetings").doc(sessionId).set({
      sessionId,
      userId,
      title:           summary.title || "Untitled Meeting",
      overview:        summary.overview || "",
      sentiment:       summary.sentiment || "neutral",
      transcriptCount: transcript.length,
      transcript,
      summary,
      createdAt:       new Date().toISOString(),
    });
    console.log("✅ Meeting saved to Firestore:", sessionId);
  } catch (err) {
    console.error("❌ Error saving meeting:", err.message);
    throw err;
  }
}

// Get one full meeting
async function getMeeting(userId, sessionId) {
  try {
    const doc = await db.collection("meetings").doc(sessionId).get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (data.userId !== userId) return null;
    return data;
  } catch (err) {
    console.error("❌ Error getting meeting:", err.message);
    return null;
  }
}

// List all meetings for user
async function listMeetings(userId) {
  try {
    const snap = await db
      .collection("meetings")
      .where("userId", "==", userId)
      .get();

    const meetings = snap.docs.map((d) => ({
      sessionId:       d.data().sessionId,
      title:           d.data().title,
      overview:        d.data().overview,
      sentiment:       d.data().sentiment,
      createdAt:       d.data().createdAt,
      transcriptCount: d.data().transcriptCount,
    }));

    // Sort by date newest first
    meetings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return meetings;
  } catch (err) {
    console.error("❌ Error listing meetings:", err.message);
    return [];
  }
}

// Delete meeting
async function deleteMeeting(userId, sessionId) {
  try {
    const doc = await db.collection("meetings").doc(sessionId).get();
    if (!doc.exists) return;
    if (doc.data().userId !== userId) return;
    await db.collection("meetings").doc(sessionId).delete();
    console.log("🗑️ Meeting deleted:", sessionId);
  } catch (err) {
    console.error("❌ Error deleting meeting:", err.message);
  }
}

// Share link
async function getShareLink(userId, sessionId) {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${frontendUrl}/summary/${sessionId}`;
}

// Helper to build PDF document
async function generatePdfBuffer(summary, transcript = []) {
  try {
    const pdfDoc = await PDFDocument.create();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const blue = rgb(0.14, 0.38, 0.87);
    const gray = rgb(0.4, 0.4, 0.4);
    const darkGray = rgb(0.1, 0.1, 0.1);

    const addText = (page, text, x, y, size, font, color) => {
      page.drawText(text, { x, y, size, font, color });
    };

    const wrapText = (text, maxWidth, fontSize) => {
      const words = String(text || "").split(" ");
      const lines = [];
      let currentLine = "";
      
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = helveticaFont.widthOfTextAtSize(testLine, fontSize);
        if (width > maxWidth) {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    };

    // Page 1: Title + Overview
    let page = pdfDoc.addPage([595, 842]); // A4
    const margin = 50;
    let y = 780;
    const contentWidth = 495;

    // Title
    addText(page, summary.title || "Meeting Summary", margin, y, 22, helveticaBold, blue);
    y -= 30;

    // Meta info
    addText(page, `Sentiment: ${summary.sentiment || "N/A"}`, margin, y, 10, helveticaFont, gray);
    y -= 15;
    addText(page, `Date: ${new Date().toLocaleString()}`, margin, y, 10, helveticaFont, gray);
    y -= 35;

    // Overview
    addText(page, "OVERVIEW", margin, y, 14, helveticaBold, blue);
    y -= 22;
    
    const overviewLines = wrapText(summary.overview || "No overview available", contentWidth, 11);
    for (const line of overviewLines) {
      if (y < 50) {
        page = pdfDoc.addPage([595, 842]);
        y = 780;
      }
      addText(page, line, margin, y, 11, helveticaFont, darkGray);
      y -= 16;
    }
    y -= 10;

    // Key Decisions
    if (y < 120) { page = pdfDoc.addPage([595, 842]); y = 780; }
    addText(page, "KEY DECISIONS", margin, y, 14, helveticaBold, blue);
    y -= 22;

    const decisions = summary.keyDecisions || [];
    if (decisions.length === 0) {
      addText(page, "No decisions identified", margin, y, 11, helveticaFont, gray);
      y -= 16;
    } else {
      decisions.forEach((d, i) => {
        if (y < 60) { page = pdfDoc.addPage([595, 842]); y = 780; }
        addText(page, `${i + 1}.`, margin, y, 11, helveticaBold, blue);
        const lines = wrapText(d, contentWidth - 20, 11);
        lines.forEach((line, j) => {
          if (j === 0) addText(page, line, margin + 20, y, 11, helveticaFont, darkGray);
          else {
            if (y < 50) { page = pdfDoc.addPage([595, 842]); y = 780; }
            addText(page, line, margin + 20, y, 11, helveticaFont, darkGray);
          }
          y -= 16;
        });
        y -= 4;
      });
    }
    y -= 10;

    // Action Items
    if (y < 120) { page = pdfDoc.addPage([595, 842]); y = 780; }
    addText(page, "ACTION ITEMS", margin, y, 14, helveticaBold, blue);
    y -= 22;

    const actions = summary.actionItems || [];
    if (actions.length === 0) {
      addText(page, "No action items identified", margin, y, 11, helveticaFont, gray);
      y -= 16;
    } else {
      actions.forEach((item, i) => {
        if (y < 80) { page = pdfDoc.addPage([595, 842]); y = 780; }
        addText(page, `${i + 1}. ${item.task || ""}`, margin, y, 11, helveticaFont, darkGray);
        y -= 16;
        addText(page, `   Owner: ${item.owner || "N/A"} | Priority: ${item.priority || "medium"}`, margin, y, 10, helveticaFont, gray);
        y -= 20;
      });
    }
    y -= 5;

    // Speaker Breakdown
    if (y < 120) { page = pdfDoc.addPage([595, 842]); y = 780; }
    addText(page, "SPEAKER BREAKDOWN", margin, y, 14, helveticaBold, blue);
    y -= 22;

    const speakers = summary.speakerBreakdown || [];
    if (speakers.length === 0) {
      addText(page, "No speaker data available", margin, y, 11, helveticaFont, gray);
      y -= 16;
    } else {
      speakers.forEach((s) => {
        if (y < 60) { page = pdfDoc.addPage([595, 842]); y = 780; }
        addText(page, s.speaker || "Speaker", margin, y, 11, helveticaBold, blue);
        y -= 16;
        const lines = wrapText(s.summary || "", contentWidth, 11);
        for (const line of lines) {
          if (y < 50) { page = pdfDoc.addPage([595, 842]); y = 780; }
          addText(page, line, margin + 10, y, 11, helveticaFont, darkGray);
          y -= 16;
        }
        y -= 6;
      });
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (err) {
    console.error("❌ Error generating PDF buffer:", err);
    return null;
  }
}

// PDF Link
async function getPdfLink(userId, sessionId) {
  return `/api/meetings/${sessionId}/pdf/download`;
}

// PDF Buffer from meeting
async function getPdfBuffer(userId, sessionId) {
  try {
    let meeting = await getMeeting(userId, sessionId);
    if (!meeting && global.tempMeetingData && global.tempMeetingData[sessionId]) {
      meeting = global.tempMeetingData[sessionId];
    }
    if (!meeting || !meeting.summary) return null;
    return await generatePdfBuffer(meeting.summary, meeting.transcript || []);
  } catch (err) {
    console.error("❌ Error in getPdfBuffer:", err.message);
    return null;
  }
}

async function generatePdf(userId, sessionId, summary, transcript) {
  return true;
}

module.exports = {
  saveMeeting,
  getMeeting,
  listMeetings,
  deleteMeeting,
  getShareLink,
  getPdfLink,
  getPdfBuffer,
  generatePdf,
  generatePdfBuffer,
};
