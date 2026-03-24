// aiAgent.js
// Encapsulates conversation state and integrates with Google Gemini

const { GoogleGenerativeAI } = require("@google/generative-ai");

// Helper to create a Gemini client
function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. AI features will not work.");
    return null;
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  // Use a widely available text model; the 1.5 Flash
  // IDs may not be enabled for this key / API version.
return genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
}

// Simple utility to safely parse JSON coming from the model
function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Fields we care about in the recruitment form
const FORM_FIELDS = [
  "fullName",
  "email",
  "phone",
  "education",
  "yearsExperience",
  "primarySkills",
  "currentCompany",
  "expectedSalary",
  "location",
  "motivation",
  "github",
  "linkedin",
  "portfolio",
];

// Fields for the optional resume builder
const RESUME_FIELDS = ["name", "education", "experience", "skills", "projects"];

// Build the prompt for Gemini to extract fields and drive the conversation
function buildFormPrompt({ formState, conversationHistory, userText }) {
  const formStateJson = JSON.stringify(formState || {}, null, 2);
  const historyText = (conversationHistory || [])
    .map((turn) => `${turn.role.toUpperCase()}: ${turn.text}`)
    .join("\n");

  return `
You are a friendly recruitment assistant helping to fill a web application form.

You receive:
- The current form state as JSON.
- The full conversation history so far.
- The latest user utterance.

Your tasks:
1. Extract or update any of these fields if possible, based ONLY on information that is clearly present:
   - fullName
   - email
   - phone
   - education
   - yearsExperience
   - primarySkills
   - currentCompany
   - expectedSalary
   - location
   - motivation
   - github
   - linkedin
   - portfolio

2. Keep answers concise and professional, speaking like a recruiter.

3. Decide what to do next:
   - Ask a short, clear follow-up question focusing on missing or unclear fields.
   - If the user clearly wants to submit (says things like "submit", "yes submit", "submit application"), set intent to "submit".
   - If the user clearly wants to create a resume (says things like "I want to create a resume"), set intent to "resume_builder".
   - Otherwise, set intent to "normal".

4. Return STRICT JSON with this shape ONLY (no extra text):
{
  "updates": { /* only fields that can be reliably filled or refined */ },
  "next_question": "a short follow-up question as a string",
  "intent": "normal" | "submit" | "resume_builder"
}

Current form state:
${formStateJson}

Conversation history:
${historyText}

Latest user message:
USER: ${userText}

Now respond with ONLY the JSON object and nothing else.
`;
}

// Build the prompt for the resume builder mode
function buildResumePrompt({ resumeState, conversationHistory, userText }) {
  const resumeJson = JSON.stringify(resumeState || {}, null, 2);
  const historyText = (conversationHistory || [])
    .map((turn) => `${turn.role.toUpperCase()}: ${turn.text}`)
    .join("\n");

  return `
You are helping the user build a short resume via conversation.

You receive:
- The current resume state JSON.
- The conversation history.
- The latest user utterance.

The resume template has these fields:
- name
- education
- experience
- skills
- projects

Your tasks:
1. Extract or update any of these fields from the latest user message.
2. Keep field values concise and resume-style (short phrases, bullet-like sentences).
3. Decide a short next question that asks about a missing or incomplete field.
4. If the user clearly wants to go back to the job application form, set intent to "back_to_form".

Return STRICT JSON ONLY:
{
  "updates": { /* only resume fields to set or refine */ },
  "next_question": "your next resume-related question",
  "intent": "normal" | "back_to_form"
}

Current resume state:
${resumeJson}

Conversation history:

${historyText}

Latest user message:
USER: ${userText}

Now respond with ONLY the JSON object and nothing else.
`;
}

// Build the prompt for a short candidate summary
function buildSummaryPrompt(formState) {
  const formStateJson = JSON.stringify(formState || {}, null, 2);
  return `
You are a technical recruiter. Based on the following candidate application data,
write a short, 2-3 sentence evaluation summary in the third person.
Be concise and positive but honest, and focus on skills, experience, and fit.

Candidate application JSON:
${formStateJson}

Only output the summary text, no explanations.
`;
}

// Create a conversation agent for a single WebSocket connection
function createAgent() {
  const model = createGeminiClient();

  // Per-connection state
  let formState = {};
  let resumeState = {};
  let conversationHistory = [];
  let askedToSubmit = false;
  let mode = "form"; // "form" | "resume"

  function reset() {
    formState = {};
    resumeState = {};
    conversationHistory = [];
    askedToSubmit = false;
    mode = "form";
  }

  // Helper: compute how many main fields are filled
  function completionRatio() {
    const important = [
      "fullName",
      "email",
      "phone",
      "education",
      "yearsExperience",
      "primarySkills",
      "location",
      "motivation",
    ];
    const filled = important.filter((key) => {
      const v = formState[key];
      return typeof v === "string" && v.trim().length > 0;
    }).length;
    return filled / important.length;
  }

  async function callGeminiWithRetry(prompt) {
    if (!model) {
      throw new Error("Gemini model is not configured");
    }

    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await model.generateContent({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          // Force the model to return strict JSON so that
          // safeJsonParse has a much higher chance of succeeding.
          generationConfig: {
            responseMimeType: "application/json",
          },
        });
        const response = await result.response;
        const text = response.text();
        return text;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  async function handleUserInput(userText) {
    conversationHistory.push({ role: "user", text: userText });

    // If we are in resume builder mode, route to the resume prompt/logic
    if (mode === "resume") {
      const prompt = buildResumePrompt({
        resumeState,
        conversationHistory,
        userText,
      });

      let rawText;
      try {
        rawText = await callGeminiWithRetry(prompt);
      } catch (err) {
        console.error("Gemini error (resume mode):", err);
        return {
          error: "Sorry, I had trouble thinking for a moment. Please try again.",
        };
      }

      const parsed = safeJsonParse(rawText);
      if (!parsed || typeof parsed !== "object") {
        console.warn("Failed to parse JSON from Gemini (resume). Raw:", rawText);
        return {
          error:
            "I couldn't understand that response. Let's continue, please answer again.",
        };
      }

      const updates =
        parsed.updates && typeof parsed.updates === "object"
          ? parsed.updates
          : {};
      const nextQuestion =
        typeof parsed.next_question === "string" && parsed.next_question.trim()
          ? parsed.next_question.trim()
          : "What would you like to add to your resume next?";
      const intent = parsed.intent === "back_to_form" ? "back_to_form" : "normal";

      const appliedResumeUpdates = {};
      Object.keys(updates).forEach((key) => {
        if (RESUME_FIELDS.includes(key)) {
          const value = updates[key];
          if (typeof value === "string" && value.trim().length > 0) {
            resumeState[key] = value.trim();
            appliedResumeUpdates[key] = resumeState[key];
          }
        }
      });

      const messagesToClient = [];

      if (Object.keys(appliedResumeUpdates).length > 0) {
        messagesToClient.push({
          type: "resume_update",
          data: appliedResumeUpdates,
        });
      }

      if (intent === "back_to_form") {
        mode = "form";
        const text =
          "Okay, let's go back to your job application form. What would you like to update or add?";
        messagesToClient.push({
          type: "assistant_message",
          text,
        });
        conversationHistory.push({ role: "assistant", text });
      } else {
        messagesToClient.push({
          type: "assistant_message",
          text: nextQuestion,
        });
        conversationHistory.push({ role: "assistant", text: nextQuestion });
      }

      return {
        messages: messagesToClient,
        shouldSubmit: false,
        formState,
        resumeState,
      };
    }

    // Default: form-filling mode
    const prompt = buildFormPrompt({ formState, conversationHistory, userText });

    let rawText;
    try {
      rawText = await callGeminiWithRetry(prompt);
    } catch (err) {
      console.error("Gemini error:", err);
      return {
        error: "Sorry, I had trouble thinking for a moment. Please try again.",
      };
    }

    const parsed = safeJsonParse(rawText);
    if (!parsed || typeof parsed !== "object") {
      console.warn("Failed to parse JSON from Gemini. Raw:", rawText);
      return {
        error:
          "I couldn't understand that response. Let's continue, please answer again.",
      };
    }

    const updates =
      parsed.updates && typeof parsed.updates === "object"
        ? parsed.updates
        : {};
    const nextQuestion =
      typeof parsed.next_question === "string" && parsed.next_question.trim()
        ? parsed.next_question.trim()
        : "Could you please tell me a bit more about your background?";
    const intent =
      parsed.intent === "submit" || parsed.intent === "resume_builder"
        ? parsed.intent
        : "normal";

    // If the model or user wants to switch to resume builder, change mode
    if (
      intent === "resume_builder" ||
      userText.toLowerCase().includes("create a resume") ||
      userText.toLowerCase().includes("make a resume")
    ) {
      mode = "resume";
      const startText =
        "Great, let's create your resume. First, what is your full name as you want it on your resume?";
      const messagesToClient = [
        {
          type: "assistant_message",
          text: startText,
        },
      ];
      conversationHistory.push({ role: "assistant", text: startText });
      return {
        messages: messagesToClient,
        shouldSubmit: false,
        formState,
        resumeState,
      };
    }

    // Merge updates into formState (only known fields)
    const appliedUpdates = {};
    Object.keys(updates).forEach((key) => {
      if (FORM_FIELDS.includes(key)) {
        const value = updates[key];
        if (typeof value === "string" && value.trim().length > 0) {
          formState[key] = value.trim();
          appliedUpdates[key] = formState[key];
        }
      }
    });

    const messagesToClient = [];

    // Send form update if we have any
    if (Object.keys(appliedUpdates).length > 0) {
      messagesToClient.push({
        type: "form_update",
        data: appliedUpdates,
      });
    }

    // Handle intent of submission by user
    let shouldSubmit = false;
    if (intent === "submit") {
      shouldSubmit = true;
    } else {
      const lower = userText.toLowerCase();
      if (
        lower.includes("submit") ||
        lower.includes("yes submit") ||
        lower.includes("submit application")
      ) {
        shouldSubmit = true;
      }
    }

    // Completion-based submit suggestion
    if (!shouldSubmit && !askedToSubmit && completionRatio() >= 0.7) {
      askedToSubmit = true;
      messagesToClient.push({
        type: "assistant_message",
        text:
          "I have filled most of your application. Do you want me to submit the form for you?",
      });
      messagesToClient.push({
        type: "submit_request",
      });
      conversationHistory.push({
        role: "assistant",
        text:
          "I have filled most of your application. Do you want me to submit the form for you?",
      });
    } else if (!shouldSubmit) {
      // Ask the next question to continue the interview
      messagesToClient.push({
        type: "assistant_message",
        text: nextQuestion,
      });
      conversationHistory.push({ role: "assistant", text: nextQuestion });
    }

    return {
      messages: messagesToClient,
      shouldSubmit,
      formState,
      resumeState,
    };
  }

  async function generateSummary() {
    const prompt = buildSummaryPrompt(formState);
    let summary;
    try {
      summary = await callGeminiWithRetry(prompt);
    } catch (err) {
      console.error("Gemini summary error:", err);
      return {
        text:
          "The candidate appears to be a promising profile based on the information provided.",
      };
    }
    return { text: summary.trim() };
  }

  return {
    handleUserInput,
    generateSummary,
    reset,
    getFormState: () => ({ ...formState }),
  };
}

module.exports = {
  createAgent,
};

