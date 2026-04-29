import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const PORT = 3000;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  app.use(express.json());

  // === AI API Routes (Socks Backend) ===
  const generateAIResponse = async (prompt: string, context: any) => {
    const { name, style, location, user, learnedFacts } = context;
    const factsText = learnedFacts && learnedFacts.length > 0 
      ? `\n\nHere are some learned facts about the user and the world:\n${learnedFacts.map((f: string) => `- ${f}`).join('\n')}` 
      : '';
    const systemInstruction = `You are a super AI assistant named ${name || 'Socks'}. 
The user's name is ${user || 'User'}. 
Your personality/style is: ${style || 'helpful and concise'}. 
You are an independent AI agent connected to global data centers, Supabase, Couchbase Lite, n8n backends, and WhatsApp.
${location ? `Satellite data confirms the user is at Coordinates: Latitude ${location.latitude}, Longitude ${location.longitude}. Use this to provide hyper-local answers if relevant.` : ''}${factsText}`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { systemInstruction }
      });
      return response.text || "No response generated.";
    } catch (err: any) {
      console.error("[Socks AI Error]", err);
      return "I encountered an error accessing my core systems. Please verify my API keys.";
    }
  };

  // Chat Interface for Web App
  app.post("/api/chat", async (req, res) => {
    const { message, preferences, location, learnedFacts } = req.body;
    
    if (message.toLowerCase().includes('generate image') || message.toLowerCase().includes('draw')) {
      return res.json({ 
        success: true, 
        type: 'image',
        text: 'Generating visual data...',
        imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(message.replace(/generate image|draw/ig, '').trim())}?width=800&height=600&nologo=true`
      });
    }

    if (message.toLowerCase().includes('whatsapp to')) {
      const match = message.match(/to (\d+).*?(?:say|tell|:)\s*(.*)/i);
      if (match) {
        const to = match[1];
        const msg = match[2];
        return res.json({ success: true, text: `Triggering WhatsApp flow to ${to} with message: "${msg}". Note: Set up WHATSAPP_ACCESS_TOKEN to execute.` });
      }
    }

    const reply = await generateAIResponse(message, {
      name: preferences?.ai_name,
      style: preferences?.ai_style,
      user: preferences?.user_name,
      location: location,
      learnedFacts: learnedFacts
    });

    res.json({ success: true, text: reply, type: 'text' });
  });

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
  app.post("/api/whatsapp/webhook", async (req, res) => {
    const body = req.body;
    if (body.object === "whatsapp_business_account") {
      if (body.entry && body.entry[0].changes && body.entry[0].changes[0] &&
          body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;
        const msg_body = msg.text?.body;

        console.log(`[WhatsApp Webhook] Message from ${from}: ${msg_body}`);
        
        if (msg_body) {
          const reply = await generateAIResponse(msg_body, { name: 'Socks', style: 'helpful and concise', user: from });
          const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
          const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
          if (phoneNumberId && accessToken) {
            await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ messaging_product: "whatsapp", to: from, text: { body: reply } })
            }).catch(e => console.error(e));
          }
        }
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

  // 3. Image Generation
  app.post("/api/images/generate", async (req, res) => {
    const { prompt } = req.body;
    res.json({ 
      success: true, 
      imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt || 'abstract background')}?width=800&height=600&nologo=true`, 
      note: "Image generated successfully." 
    });
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
