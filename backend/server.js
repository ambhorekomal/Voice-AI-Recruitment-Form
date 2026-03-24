// server.js
// Express server with WebSocket for the voice recruitment assistant

require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");

const { createAgent } = require("./aiAgent");
const { synthesizeCartesiaSpeech } = require("./cartesiaTts");

const GREETING =
  "Hello! Let's fill this application form together. Share your details when you're ready—you can ask me questions any time, and I'll respond. To begin, what is your full name?";

const app = express();
const PORT = process.env.PORT || 3000;

async function sendAssistantMessage(ws, text) {
  const hasCartesiaKey = Boolean(process.env.CARTESIA_API_KEY);
  if (hasCartesiaKey) {
    const b64 = await synthesizeCartesiaSpeech(text);
    if (b64) {
      ws.send(
        JSON.stringify({
          type: "assistant_message",
          text,
          cartesia: true,
        })
      );
      ws.send(
        JSON.stringify({
          type: "tts_audio",
          mimeType: "audio/wav",
          base64: b64,
        })
      );
      return;
    }
  }
  ws.send(JSON.stringify({ type: "assistant_message", text }));
}

app.use(cors());

// Serve the frontend static files
const frontendPath = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const server = http.createServer(app);

// WebSocket server for real-time AI conversation
const wss = new WebSocket.Server({ server, path: "/ws" });

wss.on("connection", (ws) => {
  const agent = createAgent();

  (async () => {
    await sendAssistantMessage(ws, GREETING);
  })();

  ws.on("message", async (message) => {
    let parsed;
    try {
      parsed = JSON.parse(message.toString());
    } catch {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Received invalid message from client.",
        })
      );
      return;
    }

    if (parsed.type === "control" && parsed.command === "reset") {
      agent.reset();
      await sendAssistantMessage(
        ws,
        "I have cleared the form. Let's start again. What is your full name?"
      );
      return;
    }

    if (parsed.type === "user_input") {
      const userText = typeof parsed.text === "string" ? parsed.text : "";
      if (!userText.trim()) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "I did not receive any text. Please try speaking again.",
          })
        );
        return;
      }

      try {
        const result = await agent.handleUserInput(userText);

        if (result.error) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: result.error,
            })
          );
          return;
        }

        for (const msg of result.messages || []) {
          if (msg.type === "assistant_message" && typeof msg.text === "string") {
            await sendAssistantMessage(ws, msg.text);
          } else {
            ws.send(JSON.stringify(msg));
          }
        }

        // If the agent determined that we should submit, instruct the frontend
        if (result.shouldSubmit) {
          await sendAssistantMessage(
            ws,
            "Great, I will submit your application now. Thank you for your time."
          );

          // Signal the frontend to submit the form
          ws.send(
            JSON.stringify({
              type: "submit_form",
            })
          );

          // Generate and send summary
          const summary = await agent.generateSummary();
          ws.send(
            JSON.stringify({
              type: "summary",
              text: summary.text,
            })
          );
        }
      } catch (err) {
        console.error("Error handling user input:", err);
        ws.send(
          JSON.stringify({
            type: "error",
            message:
              "Something went wrong while processing your answer. Please try again.",
          })
        );
      }
    }
  });

  ws.on("close", () => {
    // Clean up if necessary
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

