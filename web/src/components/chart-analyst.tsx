"use client";

import { useRef, useState } from "react";
import type { AnalyzeResponse } from "@/lib/types";
import { analyzeChart } from "@/lib/api";
import { Panel, PanelHead } from "@/components/ui";

/* eslint-disable @next/next/no-img-element */

const DIR_META = {
  UP: { label: "UP", glyph: "▲", cls: "border-mint/20 bg-mint/10 text-mint" },
  DOWN: {
    label: "DOWN",
    glyph: "▼",
    cls: "border-coral/20 bg-coral/10 text-coral",
  },
  FLAT: {
    label: "FLAT",
    glyph: "▬",
    cls: "border-amber/20 bg-amber/10 text-amber",
  },
} as const;

export function ChartAnalyst() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<AnalyzeResponse | null>(null);
  const [clientErr, setClientErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | null | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    setFile(f);
    setVerdict(null);
    setClientErr(null);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const analyze = async () => {
    if (!file || busy) return;
    setBusy(true);
    setClientErr(null);
    try {
      setVerdict(await analyzeChart(file));
    } catch (e) {
      setClientErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <PanelHead
        icon={
          <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="5" width="5" height="14" rx="1.2" />
            <rect x="10" y="9" width="5" height="10" rx="1.2" />
            <rect x="17" y="3" width="4" height="16" rx="1.2" />
          </svg>
        }
        title="Chart Analyst"
        sub="Upload a screenshot of your chart — the bot reads the candles and gives a direction call."
      />

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a chart image"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        className={`relative grid min-h-[200px] cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
          drag
            ? "border-sky bg-sky/[.06]"
            : "border-white/[.12] bg-black/20 hover:border-white/[.25]"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Chart preview"
            className="max-h-[240px] w-auto rounded-lg object-contain"
          />
        ) : (
          <div className="text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full border border-white/[.08] bg-white/[.05] text-sky">
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 16V4" />
                <path d="M6 10l6-6 6 6" />
                <path d="M4 20h16" />
              </svg>
            </div>
            <p className="text-sm font-medium">Drop a chart photo</p>
            <p className="mt-1 text-xs text-soft">or click to browse</p>
            <p className="mt-3 text-[11px] text-faint">
              PNG / JPG screenshot of the candles
            </p>
          </div>
        )}
      </div>

      <button
        onClick={() => camRef.current?.click()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[.12] bg-white/[.03] px-4 py-2.5 text-sm font-medium text-soft transition hover:bg-white/[.06]"
      >
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 8a2 2 0 0 1 2-2h1.5l1.5-2h8l1.5 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
          <circle cx="12" cy="13" r="3.2" />
        </svg>
        Take a photo
      </button>

      <button
        onClick={analyze}
        disabled={!file || busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky to-mint px-4 py-3 text-sm font-semibold text-ink transition hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
      >        {busy ? (
          <>
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="animate-spin"
              aria-hidden
            >
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
            Analyzing…
          </>
        ) : (
          "Analyze chart"
        )}
      </button>

      {verdict ? (
        verdict.ok ? (
          <div className="mt-5 rounded-2xl border border-white/[.08] bg-black/20 p-4">
            <div className="flex items-center gap-3">
              <div
                className={`grid size-12 shrink-0 place-items-center rounded-xl border text-lg font-bold ${DIR_META[verdict.direction].cls}`}
              >
                {DIR_META[verdict.direction].glyph}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-soft">
                  Market direction
                </p>
                <p className="text-xl font-bold tracking-tight">
                  {DIR_META[verdict.direction].label}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-soft">Confidence</span>
                <span className="font-semibold tabular-nums">
                  {verdict.confidence}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[.07]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky to-mint transition-[width] duration-500"
                  style={{ width: `${verdict.confidence}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-faint">
                {verdict.candles_detected} candles detected
              </p>
            </div>

            <ul className="mt-4 space-y-1.5 text-xs text-soft">
              {verdict.reasons.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-sky" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>

            <p className="mt-4 border-t border-white/[.06] pt-3 text-[11px] leading-relaxed text-amber/90">
              {verdict.disclaimer}
            </p>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-coral/20 bg-coral/[.06] p-4 text-sm text-coral">
            {verdict.error}
          </div>
        )
      ) : null}

      {clientErr ? (
        <p className="mt-3 text-xs text-coral">{clientErr}</p>
      ) : null}
    </Panel>
  );
}
