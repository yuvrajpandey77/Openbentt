Bundled llama-server (llama.cpp) for Openbentt Local GGUF

Download before packaging (not committed — large binaries):

  npm run download:llama-server        # current OS only
  npm run download:llama-server:all    # linux + macOS + Windows (CI)

Install paths (electron-builder extraResources → process.resourcesPath/llama/):

  linux/llama-server
  darwin/llama-server
  win32/llama-server.exe

Pinned release: scripts/llama-release.json (override with LLAMA_CPP_TAG=b9222).

Resolve order in the app:
  OPENBENTT_LLAMA_SERVER_PATH → Settings path → bundled resources → PATH.
