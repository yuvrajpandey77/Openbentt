Optional bundled llama-server (llama.cpp) for Openbentt Local GGUF

Place the platform executable here before packaging:

  linux/llama-server
  darwin/llama-server    (macOS)
  win32/llama-server.exe (Windows)

The app resolves, in order:
  OPENBENTT_LLAMA_SERVER_PATH → Settings binary path → this folder → `which llama-server` / `where llama-server`

Build binaries from https://github.com/ggerganov/llama.cpp (target must include server).
