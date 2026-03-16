// server.js
// Express server with WebSocket for the voice recruitment assistant

require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const WebSocket = require("ws");

const { createAgent } = require("./aiAgent");

const app = express();
const PORT = process.env.PORT || 3000;

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

  ws.send(
    JSON.stringify({
      type: "assistant_message",
      text: "Hello, I will help you fill the application form. What is your full name?",
    })
  );

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
      ws.send(
        JSON.stringify({
          type: "assistant_message",
          text: "I have cleared the form. Let's start again. What is your full name?",
        })
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

        // Send any messages the agent wants to push to the client
        (result.messages || []).forEach((msg) => {
          ws.send(JSON.stringify(msg));
        });

        // If the agent determined that we should submit, instruct the frontend
        if (result.shouldSubmit) {
          ws.send(
            JSON.stringify({
              type: "assistant_message",
              text:
                "Great, I will submit your application now. Thank you for your time.",
            })
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

