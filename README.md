## Voice AI Recruitment Form

This project is a small web app that lets a candidate talk to an AI assistant, which then fills out a job application form for them. The AI can also help build a simple resume-style summary from the same conversation.

### What is in this project?

- **Backend (Node.js / Express)**  
  - File: `backend/server.js`  
  - Starts a web server (Express) that:
    - Serves the frontend files (HTML/CSS/JS) from the `frontend` folder.
    - Exposes a `/health` endpoint to quickly check that the server is running.
    - Opens a WebSocket endpoint at `/ws` so the browser can talk to the AI in real time.
  - When a browser connects to `/ws`, the server:
    - Creates a new conversation agent from `backend/aiAgent.js`.
    - Sends a first greeting message: it asks for the candidate’s full name.
    - Listens for messages from the browser and forwards the user’s text to the agent.
    - Sends back structured messages to the browser, such as:
      - AI chat messages to speak to the user.
      - Instructions to update specific form fields.
      - A signal to “submit” the form when the application looks complete.
      - A short candidate summary after submission.

- **AI Agent (Google Gemini)**  
  - File: `backend/aiAgent.js`  
  - Uses the Google Gemini API via the `@google/generative-ai` library.  
  - Keeps all state for one conversation:
    - Current application form values (name, email, phone, skills, etc.).
    - Optional resume information (name, education, experience, skills, projects).
    - Conversation history between the user and the assistant.
  - For each user message it:
    - Builds a clear text prompt describing the current form/resume data and history.
    - Asks Gemini to return **strict JSON** with:
      - Which fields to update (for the form or resume).
      - A short next question to ask the user.
      - An intent, like “normal conversation”, “submit the application”, or “switch to resume builder”.
    - Safely parses the JSON and:
      - Updates only known fields (for example `fullName`, `email`, `location`).
      - Prepares messages for the frontend, such as:
        - `form_update` – tells the browser which form inputs to fill in.
        - `resume_update` – tells the browser which parts of the resume preview to change.
        - Normal assistant chat messages.
        - A “submit request” if the form is mostly complete, asking the user if they want to submit.
    - When the agent (or the user) decides to submit:
      - It tells the frontend to virtually submit the form.
      - It generates a 2–3 sentence recruiter-style summary of the candidate.

- **Frontend (HTML/JS in the browser)**  
  - Main script: `frontend/script.js`  
  - Handles three main things:
    1. **WebSocket connection**
       - Connects to `ws://<server-host>/ws`.
       - Sends the user’s recognized speech as JSON messages (`type: "user_input"`).
       - Receives AI messages and:
         - Shows them in a chat window.
         - Uses browser speech synthesis to read the AI messages out loud.
         - Updates form fields and resume preview when the backend sends `form_update` or `resume_update`.
         - “Submits” the form when it receives `submit_form` from the backend (no real backend DB write, just marks the form as submitted on the page).
         - Displays the final candidate summary text from the AI.
    2. **Speech recognition (in the browser)**
       - Uses the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) if the browser supports it.
       - When the user taps the voice button:
         - Starts listening to the microphone.
         - Converts what the user says into text.
         - Shows the user’s text in the chat and sends it to the backend over WebSocket.
    3. **Form and summary UI**
       - Fills visible form inputs like name, email, phone, skills, etc. when updates arrive.
       - Highlights any fields that were just updated by the AI.
       - Shows a resume-style summary section that is updated from `resume_update` messages.
       - Has a **Reset** button that clears the form and tells the backend to reset the conversation.

### Environment variables (backend)

The backend reads environment variables (using `dotenv`):

- **`GEMINI_API_KEY`** – your Google Generative AI (Gemini) API key.  
  - Without this, the AI assistant cannot think or fill the form, and you will see a warning in the logs.
- **`PORT`** (optional) – port for the HTTP server.  
  - If not set, it defaults to `3000`.

You can put these in `backend/.env` when running locally (do not commit the key to public repos).

### How to run locally (summary)

1. **Install dependencies**
   - Open a terminal in the `backend` folder and run:
     - `npm install`
2. **Set up `.env` in the `backend` folder**
   - Add at least:
     - `GEMINI_API_KEY=your_real_key_here`
     - (Optionally) `PORT=3000`
3. **Start the backend**
   - From the `backend` folder: `npm start`  
   - This serves the frontend from the `frontend` folder and opens the WebSocket endpoint at `/ws`.
4. **Open the app**
   - In your browser, go to `http://localhost:3000` (or whatever port you configured).
   - Click the voice button and start speaking to the assistant.

### How this will be deployed to Render (backend only)

You can deploy just the backend (which also serves the static frontend files) to Render like this:

1. Commit and push this whole project to your GitHub repo `ambhorekomal/Voice-AI-Recruitment-Form`.
2. On Render:
   - Click **New** → **Web Service**.
   - Connect your GitHub account and select the `Voice-AI-Recruitment-Form` repository.
3. In the Render service settings:
   - **Root directory**: set it to `backend` (so Render runs commands inside the `backend` folder).
   - **Build command**: `npm install`
   - **Start command**: `npm start`
   - **Environment variables**: add `GEMINI_API_KEY` with your actual Gemini API key (and optionally `PORT`, e.g. `10000` or leave it blank so Render picks one).
4. Deploy the service. Render will:
   - Install dependencies in the `backend` folder.
   - Start `node server.js`.
   - Expose a public URL like `https://your-service-name.onrender.com`.

Because the backend already serves the frontend static files, you do **not** need a separate frontend deployment: visiting the Render URL in the browser will show the web app and connect back to the same backend over WebSockets.

