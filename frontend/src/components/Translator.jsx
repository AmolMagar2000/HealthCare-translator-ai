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
  const [activeTab, setActiveTab] = useState("translated");

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const shouldAutoPlayRef = useRef(false);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
        setTimeout(() => {
          autoSpeak();
        }, 350);
      };

      recorder.onerror = (err) => {
        console.error("MediaRecorder error:", err);
        setStatus("Recorder error");
      };

      recorder.start(3000); 
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

      const data = await res.json();
      const origCandidate = data.original || data.transcript || data.source || data.text;
      if (origCandidate) {
        setOriginal((prev) => (prev ? prev + " " + origCandidate : origCandidate));
      }

      if (data.translation) {
        setTranslated((prev) => (prev ? prev + " " + data.translation : data.translation));
      }

      if (data.notes && !/corrupt|unsupported audio|deepgram error/i.test(data.notes)) {
        setNotes((prev) => (prev ? prev + " | " + data.notes : data.notes));
      }
    } catch (err) {
      console.error("Upload failed", err);
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
      <h2 style={{ marginBottom: 12 }}>Healthcare Voice Translator</h2>

      {/* Responsive Controls Row */}
      <div className="controls-row">
        {/* Left: Status */}
        <div className="status-group">
          <span className={`rec-dot ${recording ? "blink" : ""}`} />
          <div style={{ color: recording ? "#b91c1c" : "inherit" }}>
            {recording ? "Recording..." : `Status: ${status}`}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="action-group">
          <select value={srcLang} onChange={(e) => setSrcLang(e.target.value)}>
            <option value="en-US">English</option>
            <option value="hi-IN">Hindi</option>
            <option value="es-ES">Spanish</option>
          </select>

          <span>→</span>

          <select value={tgtLang} onChange={(e) => setTgtLang(e.target.value)}>
            <option value="hi-IN">Hindi</option>
            <option value="en-US">English</option>
            <option value="es-ES">Spanish</option>
          </select>
        </div>
      </div>

      {/* Large Record Button Block */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button
          onClick={recording ? stopRecording : startRecording}
          className={`record-btn ${recording ? "red" : "blue"}`}
          style={{ flex: 1 }} // Make button span full width in this flex container
        >
          {recording ? "Stop Recording" : "Start Recording"}
        </button>
        
        <button onClick={manualSpeak} className="replay-btn">
            🔊 Replay
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs" role="tablist">
        <div
          role="tab"
          className={`tab ${activeTab === "original" ? "active" : ""}`}
          onClick={() => setActiveTab("original")}
        >
          Original
        </div>
        <div
          role="tab"
          className={`tab ${activeTab === "translated" ? "active" : ""}`}
          onClick={() => setActiveTab("translated")}
        >
          Translated
        </div>
      </div>

      {/* Content card */}
      <div className="card">
        {activeTab === "original" ? (
          <>
            <h4 style={{ marginTop: 0 }}>Original ({srcLang.split("-")[0]})</h4>
            <div style={{ whiteSpace: "pre-wrap" }}>{original || "No original transcript yet."}</div>
          </>
        ) : (
          <>
            <h4 style={{ marginTop: 0 }}>Translated ({tgtLang.split("-")[0]})</h4>
            <div style={{ whiteSpace: "pre-wrap" }}>{translated || "No translation yet."}</div>
            {notes && <div className="small-note">Note: {notes}</div>}
          </>
        )}
      </div>

      <div className="statusbar">
        Tip: Press Record, speak naturally, then Stop.
      </div>
    </div>
  );
}