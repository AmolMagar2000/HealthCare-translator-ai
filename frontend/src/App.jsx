import React from "react";
import Translator from "./components/Translator";

export default function App() {
  return (
    <div className="container">
      <div className="header">
        <h2>Healthcare Translation — Prototype</h2>
        <div className="small">Mobile-first • AI translation • Live transcripts</div>
      </div>
      <Translator />
    </div>
  );
}
