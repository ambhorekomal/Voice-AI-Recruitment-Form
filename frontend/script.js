// script.js
// Frontend logic for the voice recruitment assistant

(() => {
  const chatEl = document.getElementById("chat");
  const voiceBtn = document.getElementById("voiceBtn");
  const applicationForm = document.getElementById("applicationForm");
  const submitBtn = document.getElementById("submitBtn");
  const resetBtn = document.getElementById("resetBtn");
  const summaryPlaceholder = document.getElementById("summaryPlaceholder");
  const summaryText = document.getElementById("summaryText");
  const resumeName = document.getElementById("resumeName");
  const resumeEducation = document.getElementById("resumeEducation");
  const resumeExperience = document.getElementById("resumeExperience");
  const resumeSkills = document.getElementById("resumeSkills");
  const resumeProjects = document.getElementById("resumeProjects");

  let ws;
  let recognition;
  let isListening = false;
  let lastUserTranscript = "";

  function createBanner(message, type = "info") {
    const existing = document.querySelector(".banner");
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.className = `banner ${type === "error" ? "banner-error" : "banner-info"}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function addChatMessage(text, role = "assistant") {
    const container = document.createElement("div");
    container.className = `chat-message ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    const meta = document.createElement("span");
    meta.className = "chat-meta";
    meta.textContent = role === "assistant" ? "AI" : "You";

    const content = document.createElement("div");
    content.textContent = text;

    bubble.appendChild(meta);
    bubble.appendChild(content);
    container.appendChild(bubble);
    chatEl.appendChild(container);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  }

  function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.addEventListener("open", () => {
      createBanner("Connected to voice assistant.", "info");
    });

    ws.addEventListener("message", (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === "assistant_message") {
        addChatMessage(data.text, "assistant");
        speak(data.text);
      } else if (data.type === "form_update") {
        handleFormUpdate(data.data);
      } else if (data.type === "resume_update") {
        handleResumeUpdate(data.data);
      } else if (data.type === "submit_request") {
        // The AI will have also sent an assistant message prompting for submit
      } else if (data.type === "submit_form") {
        submit_form();
      } else if (data.type === "summary") {
        generate_summary(data.text);
      } else if (data.type === "error") {
        addChatMessage(data.message, "assistant");
        createBanner(data.message, "error");
      }
    });

    ws.addEventListener("close", () => {
      createBanner("Disconnected from assistant. Refresh to reconnect.", "error");
    });

    ws.addEventListener("error", () => {
      createBanner("WebSocket error occurred.", "error");
    });
  }

  function sendUserInput(text) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      createBanner("Connection is not ready yet.", "error");
      return;
    }
    const payload = {
      type: "user_input",
      text,
    };
    ws.send(JSON.stringify(payload));
  }

  // Tool-like functions to update DOM
  function fieldElement(id) {
    return document.getElementById(id);
  }

  function highlightField(el) {
    if (!el) return;
    el.classList.add("field-updated", "field-updated-highlight");
    setTimeout(() => {
      el.classList.remove("field-updated-highlight");
    }, 800);
  }

  function fill_name(value) {
    const el = fieldElement("fullName");
    if (el && value) {
      el.value = value;
      highlightField(el);
    }
  }

  function fill_email(value) {
    const el = fieldElement("email");
    if (el && value) {
      el.value = value;
      highlightField(el);
    }
  }

  function fill_phone(value) {
    const el = fieldElement("phone");
    if (el && value) {
      el.value = value;
      highlightField(el);
    }
  }

  function fill_education(value) {
    const el = fieldElement("education");
    if (el && value) {
      el.value = value;
      highlightField(el);
    }
  }

  function fill_experience(value) {
    const el = fieldElement("yearsExperience");
    if (el && value) {
      el.value = value;
      highlightField(el);
    }
  }

  function fill_skills(value) {
    const el = fieldElement("primarySkills");
    if (el && value) {
      el.value = value;
      highlightField(el);
    }
  }

  function fill_company(value) {
    const el = fieldElement("currentCompany");
    if (el && value) {
      el.value = value;
      highlightField(el);
    }
  }

  function fill_salary(value) {
    const el = fieldElement("expectedSalary");
    if (el && value) {
      el.value = value;
      highlightField(el);
    }
  }

  function fill_location(value) {
    const el = fieldElement("location");
    if (el && value) {
      el.value = value;
      highlightField(el);
    }
  }

  function fill_motivation(value) {
    const el = fieldElement("motivation");
    if (el && value) {
      el.value = value;
      highlightField(el);
    }
  }

  function fill_github(value) {
    const el = fieldElement("github");
    if (el && value) {
      el.value = value;
      highlightField(el);
    }
  }

  function fill_linkedin(value) {
    const el = fieldElement("linkedin");
    if (el && value) {
      el.value = value;
      highlightField(el);
    }
  }

  function fill_portfolio(value) {
    const el = fieldElement("portfolio");
    if (el && value) {
      el.value = value;
      highlightField(el);
    }
  }

  function handleFormUpdate(data) {
    if (!data || typeof data !== "object") return;
    if (data.fullName) fill_name(data.fullName);
    if (data.email) fill_email(data.email);
    if (data.phone) fill_phone(data.phone);
    if (data.education) fill_education(data.education);
    if (data.yearsExperience) fill_experience(data.yearsExperience);
    if (data.primarySkills) fill_skills(data.primarySkills);
    if (data.currentCompany) fill_company(data.currentCompany);
    if (data.expectedSalary) fill_salary(data.expectedSalary);
    if (data.location) fill_location(data.location);
    if (data.motivation) fill_motivation(data.motivation);
    if (data.github) fill_github(data.github);
    if (data.linkedin) fill_linkedin(data.linkedin);
    if (data.portfolio) fill_portfolio(data.portfolio);
  }

  function handleResumeUpdate(data) {
    if (!data || typeof data !== "object") return;
    if (data.name && resumeName) {
      resumeName.textContent = data.name;
    }
    if (data.education && resumeEducation) {
      resumeEducation.textContent = data.education;
    }
    if (data.experience && resumeExperience) {
      resumeExperience.textContent = data.experience;
    }
    if (data.skills && resumeSkills) {
      resumeSkills.textContent = data.skills;
    }
    if (data.projects && resumeProjects) {
      resumeProjects.textContent = data.projects;
    }
  }

  function submit_form() {
    if (!applicationForm) return;
    // Prevent actual navigation; we treat this as a virtual submit
    addChatMessage("Submitting your application...", "assistant");
    applicationForm.classList.add("submitted");
    createBanner("Application submitted (virtual).", "info");
  }

  function generate_summary(text) {
    if (!text) return;
    summaryPlaceholder.style.display = "none";
    summaryText.textContent = text;
  }

  function resetForm() {
    applicationForm.reset();
    summaryText.textContent = "";
    summaryPlaceholder.style.display = "block";
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "control", command: "reset" }));
    }
  }

  // Speech recognition handling
  function initSpeechRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      createBanner(
        "Your browser does not support speech recognition. Try Chrome desktop.",
        "error"
      );
      voiceBtn.disabled = true;
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.addEventListener("start", () => {
      isListening = true;
      voiceBtn.classList.add("listening");
    });

    recognition.addEventListener("end", () => {
      isListening = false;
      voiceBtn.classList.remove("listening");

      if (!lastUserTranscript) {
        addChatMessage("I didn't catch that. Could you please repeat?", "assistant");
        speak("I didn't catch that. Could you please repeat?");
      }
    });

    recognition.addEventListener("result", (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ");
      lastUserTranscript = transcript.trim();
      if (!lastUserTranscript) return;
      addChatMessage(lastUserTranscript, "user");
      sendUserInput(lastUserTranscript);
    });

    recognition.addEventListener("error", () => {
      createBanner("Speech recognition error. Please try again.", "error");
    });
  }

  function toggleListening() {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      return;
    }
    lastUserTranscript = "";
    recognition.start();
  }

  function init() {
    connectWebSocket();
    initSpeechRecognition();

    voiceBtn.addEventListener("click", () => {
      toggleListening();
    });

    applicationForm.addEventListener("submit", (e) => {
      e.preventDefault();
      submit_form();
    });

    resetBtn.addEventListener("click", (e) => {
      e.preventDefault();
      resetForm();
    });
  }

  window.addEventListener("DOMContentLoaded", init);
})();

