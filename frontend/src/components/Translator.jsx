import React, { useEffect, useRef, useState } from "react";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export default function Translator() {
  const [recording, setRecording] = useState(false);
  const [translated, setTranslated] = useState("");
  const [original, setOriginal] = useState("");
  const [notes, setNotes] = useState("");
  const [srcLang, setSrcLang] = useState("en-US");
  const [tgtLang, setTgtLang] = useState("hi-IN");
  const [status, setStatus] = useState("Idle");
  const [activeTab, setActiveTab] = useState("translated"); // "original" | "translated"

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const shouldAutoPlayRef = useRef(false);

  useEffect(() => {
    // cleanup
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // inject small styles local to component so you can paste file directly
  const style = `
    .translator-controls { display:flex; gap:8px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
    .rec-dot { width:12px; height:12px; border-radius:50%; display:inline-block; margin-right:8px; vertical-align:middle; }
    .rec-dot.blink { animation: rec-blink 1s infinite; background: #dc2626; box-shadow: 0 0 8px rgba(220,38,38,0.6); }
    @keyframes rec-blink { 0%{opacity:1}50%{opacity:0.35}100%{opacity:1} }
    .record-btn { padding:8px 12px; border-radius:6px; color:white; border:none; cursor:pointer; font-weight:600; }
    .record-btn.red { background:#dc2626; }
    .record-btn.blue { background:#2563eb; }
    .tabs { display:flex; gap:8px; margin:12px 0; }
    .tab { padding:8px 12px; border-radius:8px; cursor:pointer; border:1px solid #e6e6e6; background:#fff; }
    .tab.active { background:#2563eb; color:white; border-color:transparent; }
    .card { background:#fff; padding:12px; border-radius:8px; border:1px solid #eee; min-height:120px; }
    .statusbar { margin-top:10px; font-size:13px; color:#555; }
    .small-note { margin-top:8px; color:#b45309; font-weight:600; }
    @media (prefers-color-scheme: dark) {
      .card { background: #1a1a1a; border:1px solid #333; color: #e6e6e6; }
      .tab { background: #111; color: #e6e6e6; border-color:#222; }
      .tab.active { background:#2563eb; color:white; }
    }
  `;

  async function startRecording() {
    setTranslated("");
    setOriginal("");
    setNotes("");
    setStatus("Listening...");
    shouldAutoPlayRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      recorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          await sendChunk(e.data);
        }
      };

      recorder.onstop = () => {
        setStatus("Stopped");
        // Auto-play after a short delay to allow last chunk responses to arrive
        setTimeout(() => {
          autoSpeak();
        }, 350); // 350ms small delay
      };

      recorder.onerror = (err) => {
        console.error("MediaRecorder error:", err);
        setStatus("Recorder error");
      };

      recorder.start(3000); // 3s chunks
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      console.error("Microphone error:", err);
      setStatus("Microphone access denied or not available");
    }
  }

  function stopRecording() {
    try {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch (e) {
      console.warn("Stop error", e);
    } finally {
      setRecording(false);
    }
  }

  async function sendChunk(blob) {
    const form = new FormData();
    form.append("file", blob, "chunk.webm");
    form.append("src_lang", srcLang.split("-")[0]);
    form.append("tgt_lang", tgtLang.split("-")[0]);

    try {
      const res = await fetch(`${BACKEND}/api/transcribe_and_translate`, {
        method: "POST",
        body: form,
      });

      // Always attempt to parse JSON (backend returns translation + optional original/transcript)
      const data = await res.json();

      // If backend returns original/transcript fields, append them to original state (robust)
      const origCandidate = data.original || data.transcript || data.source || data.text;
      if (origCandidate) {
        setOriginal((prev) => (prev ? prev + " " + origCandidate : origCandidate));
      }

      // Append translation only (backend returns translated text in 'translation')
      if (data.translation) {
        setTranslated((prev) => (prev ? prev + " " + data.translation : data.translation));
      }

      // Show only meaningful notes (ignore Deepgram short-chunk noise)
      if (data.notes && !/corrupt|unsupported audio|deepgram error/i.test(data.notes)) {
        setNotes((prev) => (prev ? prev + " | " + data.notes : data.notes));
      }

      // If backend explicitly says chunk was corrupt, log it but don't show to user
      if (data.notes && /corrupt|unsupported audio/i.test(data.notes)) {
        console.debug("Ignored Deepgram chunk error:", data.notes);
      }
    } catch (err) {
      console.error("Upload failed", err);
      // show generic note if network error
      setNotes((prev) => (prev ? prev + " | Network error" : "Network error"));
    }
  }

  function autoSpeak() {
    if (!translated || !shouldAutoPlayRef.current) return;
    const u = new SpeechSynthesisUtterance(translated);
    u.lang = tgtLang;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    shouldAutoPlayRef.current = false;
  }

  function manualSpeak() {
    if (!translated) return;
    const u = new SpeechSynthesisUtterance(translated);
    u.lang = tgtLang;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  return (
    <div className="container">
      {/* inject styles */}
      <style>{style}</style>

      <h2 style={{ marginBottom: 12 }}>Healthcare Voice Translator</h2>

      {/* Recording status row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className={`rec-dot ${recording ? "blink" : ""}`}
            style={{ background: recording ? "#dc2626" : "#9ca3af", opacity: recording ? 1 : 0.6 }}
            aria-hidden
          />
          <div style={{ fontWeight: 700, color: recording ? "#b91c1c" : "#374151" }}>
            {recording ? "Recording..." : `Status: ${status}`}
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <select value={srcLang} onChange={(e) => setSrcLang(e.target.value)} style={{ padding: 8, borderRadius: 6 }}>
            <option value="en-US">English</option>
            <option value="hi-IN">Hindi</option>
            <option value="es-ES">Spanish</option>
          </select>

          <span style={{ alignSelf: "center" }}>→</span>

          <select value={tgtLang} onChange={(e) => setTgtLang(e.target.value)} style={{ padding: 8, borderRadius: 6 }}>
            <option value="hi-IN">Hindi</option>
            <option value="en-US">English</option>
            <option value="es-ES">Spanish</option>
          </select>

          <button
            onClick={recording ? stopRecording : startRecording}
            className={`record-btn ${recording ? "red" : "blue"}`}
            style={{ marginLeft: 8 }}
          >
            {recording ? "Stop" : "Record"}
          </button>

          <button onClick={manualSpeak} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", background: "#fff" }}>
            🔊 Replay
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" role="tablist" aria-label="Transcript tabs">
        <div
          role="tab"
          tabIndex={0}
          className={`tab ${activeTab === "original" ? "active" : ""}`}
          onClick={() => setActiveTab("original")}
          onKeyDown={(e) => e.key === "Enter" && setActiveTab("original")}
        >
          Original
        </div>
        <div
          role="tab"
          tabIndex={0}
          className={`tab ${activeTab === "translated" ? "active" : ""}`}
          onClick={() => setActiveTab("translated")}
          onKeyDown={(e) => e.key === "Enter" && setActiveTab("translated")}
        >
          Translated
        </div>
      </div>

      {/* Content card */}
      <div className="card">
        {activeTab === "original" ? (
          <>
            <h4 style={{ marginTop: 0 }}>Original ({srcLang.split("-")[0]})</h4>
            <div style={{ whiteSpace: "pre-wrap", minHeight: 80 }}>{original || "No original transcript yet."}</div>
          </>
        ) : (
          <>
            <h4 style={{ marginTop: 0 }}>Translated ({tgtLang.split("-")[0]})</h4>
            <div style={{ whiteSpace: "pre-wrap", minHeight: 80 }}>{translated || "No translation yet."}</div>
            {notes && <div className="small-note">Note: {notes}</div>}
          </>
        )}
      </div>

      <div className="statusbar">Tip: Press Record, speak naturally, then Stop — translation will auto-play.</div>
    </div>
  );
}
