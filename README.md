# RecursiveSerendipity
<img width="2560" height="1440" alt="image" src="https://github.com/user-attachments/assets/bf1139f8-9202-4161-b4e7-b461f224e7cd" />

<img width="2560" height="1440" alt="image" src="https://github.com/user-attachments/assets/978dbc06-63d8-4d25-81ff-15d525563514" />



Autonomous evolutionary perfection engine. Local-first, recursive code generation powered by local LLMs.

## What It Does

1. You describe what you want to build (a "seed")
2. A generator model (llama3.3) creates the code
3. A build checker runs TypeScript and lint analysis
4. A critic model (deepseek-r1:70b) evaluates and critiques
5. The loop refines until the code meets your quality threshold
6. You watch the evolution happen in real-time

## Requirements

- macOS with Apple Silicon (M2 Ultra with 192GB recommended)
- [Ollama](https://ollama.com) with models installed
- [Bun](https://bun.sh) runtime
- [Rust](https://rustup.rs) with Tauri CLI (`cargo install tauri-cli`)
- Node.js 20+

## Quick Start

```bash
# Install dependencies
npm install
cd engine && bun install && cd ..

# Development mode
npm run tauri dev

# Or run the engine standalone
bun run engine/index.ts
```

## Architecture

```
Tauri (Rust) -> HTTP -> Bun Engine -> Ollama
     |                     |
  React UI            LangGraph
     |              State Machine
  Real-time          |    |    |
  Gallery       Generator  ->  BuildChecker
                     ^              |
                     |           Evaluator
                  Refiner  <--------|
```

## API

The Bun engine runs on `http://localhost:9700`:

- `GET /health` - Engine status, Ollama status, thermal
- `POST /runs` - Start a new evolution run
- `GET /runs/:id` - Get run status and variants
- `DELETE /runs/:id/stop` - Stop a running evolution
- `GET /events` - SSE stream for real-time updates
- `GET /models` - Available Ollama models
- `GET /thermal` - System thermal status

## License

MIT
