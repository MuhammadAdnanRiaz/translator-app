import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

type AppScreen = "setup" | "starting" | "ready" | "error";
type Tone = "developer" | "casual";
type Locale = "us" | "uk" | "belgium";

const LOCALES: { value: Locale; label: string; flag: string }[] = [
  { value: "us", label: "US", flag: "🇺🇸" },
  { value: "uk", label: "UK", flag: "🇬🇧" },
  { value: "belgium", label: "Belgium", flag: "🇧🇪" },
];

// ── Setup Screen ──────────────────────────────────────────────────────────────

function SetupScreen({ onModelSelected }: { onModelSelected: (path: string) => void }) {
  const [picking, setPicking] = useState(false);
  const [manualPath, setManualPath] = useState("");
  const [error, setError] = useState("");

  const confirm = async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return;
    if (!trimmed.endsWith(".gguf")) {
      setError("File must be a .gguf model file.");
      return;
    }
    setError("");
    try {
      await invoke("save_model_path", { path: trimmed });
      onModelSelected(trimmed);
    } catch (e) {
      setError(String(e));
    }
  };

  const browse = async () => {
    setPicking(true);
    setError("");
    try {
      const selected = await open({
        title: "Select your GGUF model file",
        filters: [{ name: "GGUF Model", extensions: ["gguf"] }],
        multiple: false,
        directory: false,
      });
      if (selected && typeof selected === "string") {
        await confirm(selected);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-8 gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-white tracking-tight mb-1">Welcome to Prolingo</h1>
        <p className="text-gray-500 text-sm">Sound like a native speaker in every message</p>
      </div>

      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4">
        <div className="text-center">
          <div className="w-12 h-12 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🤖</span>
          </div>
          <h2 className="text-white font-medium mb-1">Load your AI model</h2>
          <p className="text-gray-500 text-xs leading-relaxed">
            Select a <span className="text-gray-300 font-mono">.gguf</span> model file.
            Recommended: <span className="text-gray-300">Qwen2.5-1.5B-Instruct Q4_K_M</span>
          </p>
        </div>

        {/* Browse button */}
        <button
          onClick={browse}
          disabled={picking}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all cursor-pointer"
        >
          {picking ? "Opening..." : "Browse for .gguf file"}
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-xs text-gray-600">or paste path</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        {/* Manual path input */}
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirm(manualPath)}
            placeholder="/path/to/model.gguf"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 placeholder-gray-700 text-xs font-mono focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            onClick={() => confirm(manualPath)}
            disabled={!manualPath.trim()}
            className="w-full py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-200 rounded-lg text-sm transition-all cursor-pointer"
          >
            Use this path
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-xs text-center">{error}</p>
        )}
      </div>

      <div className="w-full max-w-sm">
        <p className="text-gray-700 text-xs text-center leading-relaxed">
          Tip: in the file picker, press <span className="text-gray-500 font-mono">⌘ Shift .</span> to show hidden folders
        </p>
      </div>
    </div>
  );
}

// ── Loading Screen ────────────────────────────────────────────────────────────

function LoadingScreen({ modelPath, onReady, onError }: {
  modelPath: string;
  onReady: () => void;
  onError: (msg: string) => void;
}) {
  const [status, setStatus] = useState("Starting model server...");
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const dotInterval = setInterval(() => setDots((d) => (d + 1) % 4), 500);
    return () => clearInterval(dotInterval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval>;

    const boot = async () => {
      try {
        setStatus("Loading model into memory...");
        await invoke("start_server", { modelPath });

        setStatus("Waiting for model to be ready...");

        // Poll health endpoint until ready (up to 60 seconds)
        let attempts = 0;
        pollInterval = setInterval(async () => {
          attempts++;
          if (cancelled) {
            clearInterval(pollInterval);
            return;
          }
          const ready = await invoke<boolean>("server_ready");
          if (ready) {
            clearInterval(pollInterval);
            if (!cancelled) onReady();
          } else if (attempts >= 30) {
            clearInterval(pollInterval);
            if (!cancelled) onError("Model took too long to start. Try a smaller model.");
          }
        }, 2000);
      } catch (e) {
        if (!cancelled) onError(String(e));
      }
    };

    boot();
    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [modelPath]);

  const modelName = modelPath.split("/").pop() ?? modelPath;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-8 gap-5">
      <div className="w-10 h-10 border-2 border-indigo-600/30 border-t-indigo-500 rounded-full animate-spin" />
      <div className="text-center">
        <p className="text-white text-sm font-medium mb-1">
          {status}{"...".slice(0, dots)}
        </p>
        <p className="text-gray-600 text-xs font-mono truncate max-w-xs">{modelName}</p>
      </div>
      <p className="text-gray-700 text-xs">This takes 5–15 seconds on first load</p>
    </div>
  );
}

// ── Translator Screen ─────────────────────────────────────────────────────────

function TranslatorScreen({ onChangeModel }: { onChangeModel: () => void }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [tone, setTone] = useState<Tone>("developer");
  const [locale, setLocale] = useState<Locale>("us");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const translate = useCallback(async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError("");
    setOutput("");
    try {
      const result = await invoke<string>("translate", { text: input, tone, locale });
      setOutput(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [input, tone, locale, loading]);

  const copy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) translate();
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col p-5 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white tracking-tight">Prolingo</h1>
          <p className="text-xs text-gray-600">Sound like a native speaker</p>
        </div>
        <button
          onClick={onChangeModel}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors cursor-pointer"
          title="Change model"
        >
          ⚙ Model
        </button>
      </div>

      {/* Controls */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-0.5 gap-0.5">
          {(["developer", "casual"] as Tone[]).map((t) => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={`px-3 py-1.5 rounded-md text-sm capitalize font-medium transition-all cursor-pointer ${
                tone === t ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-0.5 gap-0.5">
          {LOCALES.map(({ value, label, flag }) => (
            <button
              key={value}
              onClick={() => setLocale(value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                locale === value ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {flag} {label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-gray-600 uppercase tracking-wider font-medium">
          Your message
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message here..."
          rows={6}
          className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-gray-100 placeholder-gray-700 resize-none focus:outline-none focus:border-indigo-500 transition-colors leading-relaxed"
        />
        <p className="text-xs text-gray-700 text-right">⌘↵ to polish</p>
      </div>

      {/* Button */}
      <button
        onClick={translate}
        disabled={loading || !input.trim()}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all text-sm cursor-pointer"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Polishing...
          </span>
        ) : (
          "Polish →"
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-xl p-4 text-red-400 text-sm leading-relaxed">
          <span className="font-medium block mb-1">Something went wrong</span>
          {error}
        </div>
      )}

      {/* Output */}
      {output && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-600 uppercase tracking-wider font-medium">
              Polished
            </label>
            <button
              onClick={copy}
              className="text-xs text-indigo-500 hover:text-indigo-400 transition-colors font-medium cursor-pointer"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-gray-100 leading-relaxed min-h-[80px] select-all">
            {output}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<AppScreen>("setup");
  const [modelPath, setModelPath] = useState<string | null>(null);
  const [bootError, setBootError] = useState("");

  // On mount, check if a model path was already saved
  useEffect(() => {
    invoke<string | null>("get_model_path").then((saved) => {
      if (saved) {
        setModelPath(saved);
        setScreen("starting");
      }
    });
  }, []);

  const handleModelSelected = (path: string) => {
    setModelPath(path);
    setScreen("starting");
  };

  const handleChangeModel = async () => {
    await invoke("stop_server");
    setScreen("setup");
    setModelPath(null);
  };

  if (screen === "setup") {
    return <SetupScreen onModelSelected={handleModelSelected} />;
  }

  if (screen === "starting" && modelPath) {
    return (
      <LoadingScreen
        modelPath={modelPath}
        onReady={() => setScreen("ready")}
        onError={(msg) => { setBootError(msg); setScreen("error"); }}
      />
    );
  }

  if (screen === "error") {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-8 gap-4">
        <div className="w-full max-w-sm bg-red-950 border border-red-900 rounded-2xl p-6 text-center">
          <p className="text-red-400 font-medium mb-2">Failed to start model</p>
          <p className="text-red-500/70 text-sm mb-4">{bootError}</p>
          <button
            onClick={() => setScreen("setup")}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm transition-all cursor-pointer"
          >
            Choose different model
          </button>
        </div>
      </div>
    );
  }

  return <TranslatorScreen onChangeModel={handleChangeModel} />;
}
