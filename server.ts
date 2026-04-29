import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // === AI API Routes (Socks Backend) ===
  
  // 1. WhatsApp Integration Mock
  app.post("/api/whatsapp/send", (req, res) => {
    const { to, message } = req.body;
    // In a real 200k+ line app, this handles Twilio/Meta WhatsApp API
    console.log(`[WhatsApp Mock] Sending to ${to}: ${message}`);
    res.json({ success: true, message: `Sent WhatsApp message to ${to}` });
  });

  // 2. ElevenLabs Voice Generation Mock
  app.post("/api/voice/generate", (req, res) => {
    const { text, voiceId } = req.body;
    // In real app: call elevenlabs API, stream audio back
    console.log(`[ElevenLabs Mock] Generating voice for: ${text.substring(0, 50)}...`);
    res.json({ success: true, audioUrl: null, note: "ElevenLabs API pending configuration." });
  });

  // 3. Image Generation Mock (Fallback if Gemini isn't used for images)
  app.post("/api/images/generate", (req, res) => {
    res.json({ success: true, imageUrl: "https://images.unsplash.com/photo-1620121692029-d088224ddc74?auto=format&fit=crop&q=80&w=1000", note: "Abstract generation mockup." });
  });

  // Vite Integration for SPA
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Socks OS Backend running on http://localhost:${PORT}`);
  });
}

startServer();
