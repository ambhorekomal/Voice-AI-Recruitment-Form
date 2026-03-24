// cartesiaTts.js — Cartesia Sonic TTS (bytes API). Keep API key on the server only.

const CARTESIA_BYTES_URL = "https://api.cartesia.ai/tts/bytes";

/**
 * @param {string} text
 * @returns {Promise<string|null>} Base64 WAV bytes, or null if skipped / failed
 */
async function synthesizeCartesiaSpeech(text) {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey || !text || typeof text !== "string" || !text.trim()) {
    return null;
  }

  const voiceId =
    process.env.CARTESIA_VOICE_ID || "694f9389-aac1-45b6-b726-9d9369183238";
  const modelId = process.env.CARTESIA_MODEL_ID || "sonic-3";
  const version = process.env.CARTESIA_VERSION || "2025-04-16";

  try {
    const res = await fetch(CARTESIA_BYTES_URL, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Cartesia-Version": version,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: modelId,
        transcript: text.trim().slice(0, 5000),
        voice: { mode: "id", id: voiceId },
        output_format: {
          container: "wav",
          encoding: "pcm_s16le",
          sample_rate: 44100,
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("Cartesia TTS HTTP error:", res.status, errBody);
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  } catch (err) {
    console.error("Cartesia TTS request failed:", err);
    return null;
  }
}

module.exports = { synthesizeCartesiaSpeech };
