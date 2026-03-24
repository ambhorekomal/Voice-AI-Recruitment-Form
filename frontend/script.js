// script.js
// Frontend: always-on speech recognition + Cartesia TTS from server (optional)

(() => {
  const chatEl = document.getElementById("chat");
  const voiceStatus = document.getElementById("voiceStatus");
  const voiceStatusText = voiceStatus?.querySelector(".voice-status-text");
  const applicationForm = document.getElementById("applicationForm");
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
  let keepListening = true;
  const cartesiaQueue = [];
  let cartesiaPlaying = false;

  function setVoiceStatus(text, listening) {
    if (voiceStatusText) voiceStatusText.textContent = text;
    if (voiceStatus) {
      voiceStatus.classList.toggle("listening", Boolean(listening));
    }
  }

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

  function speakBrowser(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  }

  function pumpCartesiaQueue() {
    if (cartesiaPlaying || cartesiaQueue.length === 0) return;
    cartesiaPlaying = true;
    const item = cartesiaQueue.shift();
    const mimeType = item.mimeType || "audio/wav";
    const audio = new Audio(`data:${mimeType};base64,${item.base64}`);
    audio.onended = () => {
      cartesiaPlaying = false;
      pumpCartesiaQueue();
    };
    audio.onerror = () => {
      cartesiaPlaying = false;
      pumpCartesiaQueue();
    };
    const playOnce = () => {
      audio.play().catch(() => {
        createBanner("Tap anywhere on the page to allow voice playback.", "info");
        const unlock = () => {
          audio.play().catch(() => {});
          document.removeEventListener("click", unlock);
          document.removeEventListener("keydown", unlock);
        };
        document.addEventListener("click", unlock, { once: true });
        document.addEventListener("keydown", unlock, { once: true });
        cartesiaPlaying = false;
        pumpCartesiaQueue();
      });
    };
    playOnce();
  }

  function enqueueCartesiaAudio(base64, mimeType) {
    if (!base64) return;
    cartesiaQueue.push({ base64, mimeType });
    pumpCartesiaQueue();
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
        if (!data.cartesia) {
          speakBrowser(data.text);
        }
      } else if (data.type === "tts_audio") {
        enqueueCartesiaAudio(data.base64, data.mimeType);
      } else if (data.type === "form_update") {
        handleFormUpdate(data.data);
      } else if (data.type === "resume_update") {
        handleResumeUpdate(data.data);
      } else if (data.type === "submit_request") {
        // Assistant already sent a spoken prompt
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
      setVoiceStatus("Disconnected — refresh page", false);
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
    ws.send(
      JSON.stringify({
        type: "user_input",
        text,
      })
    );
  }

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

  function startRecognitionLoop() {
    if (!recognition) return;
    try {
      recognition.start();
    } catch {
      // Already running — ignore
    }
  }

  function initSpeechRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      createBanner(
        "Your browser does not support speech recognition. Try Chrome desktop.",
        "error"
      );
      setVoiceStatus("Speech recognition not supported", false);
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.addEventListener("start", () => {
      isListening = true;
      setVoiceStatus("Listening — speak anytime", true);
    });

    recognition.addEventListener("end", () => {
      isListening = false;
      if (!keepListening) {
        setVoiceStatus("Microphone off", false);
        return;
      }
      setVoiceStatus("Reconnecting microphone…", false);
      setTimeout(() => {
        try {
          recognition.start();
        } catch {
          // ignore
        }
      }, 120);
    });

    recognition.addEventListener("result", (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ");
      const trimmed = transcript.trim();
      if (!trimmed) return;
      addChatMessage(trimmed, "user");
      sendUserInput(trimmed);
    });

    recognition.addEventListener("error", (e) => {
      const err = e.error || "";
      if (err === "no-speech" || err === "aborted") {
        if (keepListening) {
          setTimeout(() => startRecognitionLoop(), 200);
        }
        return;
      }
      if (err === "not-allowed") {
        setVoiceStatus("Microphone blocked — allow access in the browser", false);
        createBanner(
          "Microphone access denied. Allow the mic in your browser address bar, then refresh.",
          "error"
        );
        keepListening = false;
        return;
      }
      createBanner("Speech recognition error. Please try again.", "error");
    });

    // Browsers often require a user gesture for the mic; try auto-start, then one-click fallback
    const tryAutoStart = () => {
      try {
        recognition.start();
      } catch {
        setVoiceStatus("Click anywhere to enable the microphone", false);
        const once = () => {
          document.removeEventListener("click", once);
          document.removeEventListener("keydown", once);
          keepListening = true;
          startRecognitionLoop();
        };
        document.addEventListener("click", once, { once: true });
        document.addEventListener("keydown", once, { once: true });
      }
    };

    setTimeout(tryAutoStart, 400);
  }

  function init() {
    connectWebSocket();
    initSpeechRecognition();

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
