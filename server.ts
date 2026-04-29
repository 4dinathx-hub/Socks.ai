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
  
  // 1. WhatsApp Integration
  // Webhook Verification (Meta requirements)
  app.get("/api/whatsapp/webhook", (req, res) => {
    const verify_token = process.env.WHATSAPP_VERIFY_TOKEN;
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === verify_token) {
        console.log("WEBHOOK_VERIFIED");
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    }
  });

  // Webhook Receiver
  app.post("/api/whatsapp/webhook", (req, res) => {
    const body = req.body;
    if (body.object === "whatsapp_business_account") {
      if (body.entry && body.entry[0].changes && body.entry[0].changes[0] &&
          body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;
        const msg_body = msg.text?.body;

        console.log(`[WhatsApp Webhook] Message from ${from}: ${msg_body}`);
        // In a real 2M-line app, you might sync this to Supabase or broadcast via WS
      }
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  });

  // Send Message API
  app.post("/api/whatsapp/send", async (req, res) => {
    try {
      const { to, message } = req.body;
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

      if (!phoneNumberId || !accessToken) {
        console.log(`[WhatsApp Mock] Sending to ${to}: ${message}`);
        return res.json({ success: true, message: `(Mock) Sent message to ${to}. Configure WhatsApp API keys for real transmission.` });
      }

      const response = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: to.replace(/[^0-9]/g, ""),
          type: "text",
          text: {
            body: message
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || response.statusText);
      }

      res.json({ success: true, message: `Message sent to ${to} via WhatsApp!` });
    } catch (error: any) {
      console.error("[WhatsApp Send Error]", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 2. ElevenLabs Voice Generation
  app.post("/api/voice/generate", async (req, res) => {
    try {
      const { text, voiceId = "21m00Tcm4TlvDq8ikWAM" } = req.body; // Default voice (Rachel)
      
      // Get the API key from environment, or use the one provided in chat temporarily
      // Note: Ideally, api keys should be provided via environment variables.
      const apiKey = process.env.ELEVENLABS_API_KEY || "sk_84ace1989c3180cf6b10242fd71a21885926b90f0444ee50";
      
      if (!apiKey) {
        return res.json({ success: true, audioUrl: null, note: "ELEVENLABS_API_KEY not configured. Falling back to browser TTS." });
      }

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5
          }
        })
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs Error: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Audio = buffer.toString("base64");
      const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;

      res.json({ success: true, audioUrl });
    } catch (error: any) {
      console.error("[ElevenLabs Error]", error);
      res.status(500).json({ success: false, error: error.message });
    }
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
