# Prolingo

> Sound like a native English speaker in every message.

Prolingo is a lightweight desktop app that rewrites your messages into natural, professional English — tailored to specific tones and locales. Built for freelancers and professionals who communicate across borders.

Powered entirely by a **local AI model** (GGUF via llama.cpp) — no cloud, no subscriptions, no data leaving your machine.

![License](https://img.shields.io/github/license/MuhammadAdnanRiaz/translator-app)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![Release](https://img.shields.io/github/v/release/MuhammadAdnanRiaz/translator-app)

---

## Features

- **Tone control** — Developer or Casual
- **Locale-aware** — US English, British English, or Belgian/International English
- **Fully local** — runs on your machine, no API keys, no internet required
- **Fast** — Metal-accelerated on Apple Silicon (M-series), near-instant responses
- **Private** — your messages never leave your device
- **Bring your own model** — works with any GGUF model file

---

## Download

Grab the latest installer for your platform from the [Releases page](https://github.com/MuhammadAdnanRiaz/translator-app/releases).

| Platform | Installer |
|----------|-----------|
| macOS | `.dmg` |
| Windows | `.msi` |
| Linux | `.AppImage` / `.deb` |

---

## Setup

### 1. Install llama.cpp

Prolingo uses llama.cpp to run the AI model locally.

**macOS:**
```bash
brew install llama.cpp
```

**Windows / Linux:** Download a pre-built binary from the [llama.cpp releases page](https://github.com/ggerganov/llama.cpp/releases) and add it to your PATH.

### 2. Download a GGUF model

We recommend **Qwen2.5-1.5B-Instruct Q4_K_M** (~1 GB) — fast, accurate, and great for text polishing:

```bash
# Install the Hugging Face CLI
pip install huggingface-hub

# Download the model
huggingface-cli download Qwen/Qwen2.5-1.5B-Instruct-GGUF \
  qwen2.5-1.5b-instruct-q4_k_m.gguf \
  --local-dir ~/Downloads/models
```

Or download it manually from [huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF).

Any GGUF model works — feel free to use a larger or different model based on your hardware.

### 3. First launch

1. Open Prolingo
2. Click **Browse for .gguf file** and select your downloaded model — or paste the full path directly
3. Wait ~10 seconds for the model to load (only on first launch or model change)
4. Start polishing your messages

> **Tip (macOS):** If your model is in a hidden folder (e.g. `~/.cache`), press `⌘ Shift .` in the file picker to reveal hidden files.

---

## Usage

1. Type your message in the input box
2. Choose your **Tone**: `Developer` or `Casual`
3. Choose your **Locale**: 🇺🇸 US, 🇬🇧 UK, or 🇧🇪 Belgium
4. Press **Polish →** (or `⌘ Enter`)
5. Copy the result and send it

---

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (stable)
- llama.cpp (see Setup above)

### Run in development

```bash
git clone https://github.com/MuhammadAdnanRiaz/translator-app.git
cd translator-app
npm install
npm run tauri dev
```

### Build for production

```bash
npm run tauri build
```

The built installer will be in `src-tauri/target/release/bundle/`.

---

## How It Works

Prolingo runs a local `llama-server` process in the background using your chosen GGUF model. When you hit Polish, it sends your message to the server via its OpenAI-compatible API with a carefully crafted system prompt that encodes the selected tone and locale. The model rewrites your message and returns it — all on-device, all private.

**System prompt structure (example — US Developer):**

```
Rewrite the following message in American English and sound like a
professional American software developer — direct, technical, use
phrases like 'reach out', 'circle back', 'touch base', 'loop in'.
Preserve the original meaning exactly. Return ONLY the rewritten message.
```

Temperature is set to `0.3` for consistent, focused output.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | [Tauri 2](https://tauri.app) (Rust) |
| Frontend | [React](https://react.dev) + TypeScript |
| Styling | [Tailwind CSS](https://tailwindcss.com) |
| AI inference | [llama.cpp](https://github.com/ggerganov/llama.cpp) |
| Recommended model | [Qwen 2.5 1.5B Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF) |

---

## System Requirements

| | Minimum | Recommended |
|--|---------|-------------|
| RAM | 4 GB | 8 GB+ |
| Storage | 1.5 GB | 2 GB+ |
| macOS | 10.15+ | Apple Silicon (M1+) |
| Windows | 10 (64-bit) | Windows 11 |
| Linux | Ubuntu 20.04+ | Ubuntu 22.04+ |

---

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and test them
4. Commit: `git commit -m "Add your feature"`
5. Push: `git push origin feature/your-feature`
6. Open a Pull Request

Please open an issue first for major changes so we can discuss the approach.

---

## License

MIT — see [LICENSE](LICENSE) for details.
