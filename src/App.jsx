import { useState, useEffect, useCallback, useRef } from "react";

// ─── LocalStorage ─────────────────────────────────────────────────────────────
const ls = {
  get: (k, fb = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v)         => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── Constants ────────────────────────────────────────────────────────────────
const CATS    = ["Tutte","Primi","Secondi","Contorni","Dolci","Antipasti","Zuppe","Pizze & Pane","Bevande","Altro"];
const EMO     = { Tutte:"📚",Primi:"🍝",Secondi:"🥩",Contorni:"🥗",Dolci:"🍰",Antipasti:"🫒",Zuppe:"🥣","Pizze & Pane":"🍕",Bevande:"🍹",Altro:"🍴" };
const REPARTI = ["Frutta & Verdura","Frigo","Carne & Pesce","Latticini","Pasta & Riso","Dispensa","Altro"];
const AI_SEARCH_SUGGESTIONS = [
  "Dammi ricette di primi con i funghi",
  "Dammi una torta con cioccolato",
];

const RECIPE_TEXT_ANCHORS = [
  "ingredienti",
  "ingredients",
  "procedimento",
  "instructions",
  "method",
  "directions",
  "preparazione",
  "preparazioni",
  "filling",
  "frosting",
  "icing",
  "topping",
  "decoration",
  "decorazione",
  "ganache",
  "crema",
  "farcitura",
  "ripieno",
  "occorrente",
  "dosi",
  "recipe card",
  "for the dough",
  "for the batter",
  "for the filling",
  "for the frosting",
  "for the icing",
  "for the topping",
  "for the ganache",
  "for the glaze",
  "for the sauce",
  "per l'impasto",
  "per il ripieno",
  "per la crema",
  "per la farcitura",
  "per la glassa",
  "per la copertura",
  "per la decorazione",
  "per il condimento",
  "per la salsa",
  "assemblaggio",
  "assembly",
];

const PREPARATION_SECTION_MARKERS = [
  { label: "Base / Impasto", terms: ["impasto", "base", "batter", "dough", "sponge", "cake layer", "per l'impasto", "for the batter", "for the dough"] },
  { label: "Crema / Farcitura", terms: ["crema", "farcitura", "ripieno", "filling", "stuffing", "custard", "pastry cream", "cream cheese", "mousse", "per la crema", "for the filling"] },
  { label: "Glassa / Copertura", terms: ["glassa", "copertura", "ganache", "frosting", "icing", "glaze", "per la glassa", "for the frosting", "for the icing", "for the ganache"] },
  { label: "Decorazione", terms: ["decorazione", "decorate", "decorating", "decoration", "garnish", "guarnizione", "topping", "per la decorazione", "for the topping"] },
  { label: "Salsa / Bagna", terms: ["salsa", "bagna", "syrup", "sauce", "coulis", "per la salsa", "for the sauce"] },
  { label: "Assemblaggio", terms: ["assemblaggio", "assembly", "assembla", "montaggio", "layer", "stack", "farcisci", "decorate the cake"] },
];

const LOCAL_TEXT_MODEL_PRESETS = {
  "gemma-3n-e4b": {
    label: "Gemma 3n E4B",
    modeLabel: "Alta qualità",
    desktopHint: "Più accurato su import, ricerca AI e ricostruzione ricette. Consigliato su desktop.",
    androidHint: "Opzionale su Android: qualità più alta, ma richiede più RAM e un device recente.",
    desktopPlaceholder: "/Users/tuo-utente/models/gemma-3n-e4b-it-q4_k_m.gguf",
    androidPlaceholder: "@bundled oppure /data/local/tmp/llm/gemma-3n-E4B-it-int4.task",
  },
  "gemma-3n-e2b": {
    label: "Gemma 3n E2B",
    modeLabel: "Bilanciato",
    desktopHint: "Più leggero e veloce di E4B, con qualità comunque buona. Ottimo fallback universale.",
    androidHint: "Consigliato su Android per stabilità, consumi e compatibilità generale.",
    desktopPlaceholder: "/Users/tuo-utente/models/gemma-3n-e2b-it-q4_k_m.gguf",
    androidPlaceholder: "@bundled oppure /data/local/tmp/llm/gemma-3n-E2B-it-int4.task",
  },
  "qwen2.5-1.5b": {
    label: "Qwen 2.5 1.5B",
    modeLabel: "Compatto",
    desktopHint: "Il più leggero del gruppo. Utile quando vuoi tempi rapidi o hai memoria limitata.",
    androidHint: "Compatto e sperimentale. Richiede configurazione manuale del file locale.",
    desktopPlaceholder: "/Users/tuo-utente/models/qwen2.5-1.5b-instruct.gguf",
    androidPlaceholder: "/data/local/tmp/llm/qwen2.5-1.5b-instruct.task",
  },
};

function isAndroidShellEnvironment() {
  return typeof window !== "undefined" && typeof window.AndroidBridge?.invoke === "function";
}

function getLocalModelChoices(isAndroidShell = isAndroidShellEnvironment()) {
  return isAndroidShell
    ? ["gemma-3n-e2b", "gemma-3n-e4b", "qwen2.5-1.5b"]
    : ["gemma-3n-e4b", "gemma-3n-e2b", "qwen2.5-1.5b"];
}

function getDefaultLocalModelKey(isAndroidShell = isAndroidShellEnvironment()) {
  return isAndroidShell ? "gemma-3n-e2b" : "gemma-3n-e4b";
}

function isSupportedLocalModel(model) {
  return Boolean(model && LOCAL_TEXT_MODEL_PRESETS[model]);
}

function getProviderDefaultModel(provider, isAndroidShell = isAndroidShellEnvironment()) {
  if (provider === "local") return getDefaultLocalModelKey(isAndroidShell);
  return AI_PROVIDERS[provider]?.defaultModel ?? "";
}

function normalizeProviderModel(provider, model, isAndroidShell = isAndroidShellEnvironment()) {
  if (provider === "local") {
    return isSupportedLocalModel(model) ? model : getDefaultLocalModelKey(isAndroidShell);
  }

  return AI_PROVIDERS[provider]?.models?.includes(model)
    ? model
    : getProviderDefaultModel(provider, isAndroidShell);
}

function getLocalModelPreset(model) {
  return LOCAL_TEXT_MODEL_PRESETS[model] ?? LOCAL_TEXT_MODEL_PRESETS[getDefaultLocalModelKey()];
}

function getLocalModelOptionLabel(model, isAndroidShell = isAndroidShellEnvironment()) {
  const preset = getLocalModelPreset(model);
  const platformBadge = isAndroidShell
    ? (model === "gemma-3n-e2b" ? "Android consigliato" : model === "gemma-3n-e4b" ? "Android opzionale" : "Manuale")
    : (model === "gemma-3n-e4b" ? "Desktop consigliato" : model === "gemma-3n-e2b" ? "Più leggero" : "Manuale");
  return `${preset.label} — ${preset.modeLabel} (${platformBadge})`;
}

const AI_PROVIDERS = {
  local: {
    name: "Locale (on-device)",
    icon: "🟤",
    models: ["gemma-3n-e4b", "gemma-3n-e2b", "qwen2.5-1.5b"],
    defaultModel: "gemma-3n-e4b",
    keyPlaceholder: "",
    keyHint: "Modello locale",
    keyHintUrl: "",
    keyPrefix: "",
  },
  claude: {
    name: "Claude (Anthropic)",
    icon: "🟠",
    models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-4-5-20251001"],
    defaultModel: "claude-haiku-4-5-20251001",
    keyPlaceholder: "sk-ant-api03-…",
    keyHint: "console.anthropic.com",
    keyHintUrl: "https://console.anthropic.com",
    keyPrefix: "sk-ant-",
  },
  openai: {
    name: "ChatGPT (OpenAI)",
    icon: "🟢",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "sk-proj-…",
    keyHint: "platform.openai.com",
    keyHintUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-",
  },
};

const LOCAL_MODEL_DOWNLOADS = {
  desktop: {
    "gemma-3n-e4b": {
      label: "Gemma 3n E4B (alta qualità)",
      sizeLabel: "3.90 GB",
      fileName: "gemma-3n-e4b-it-q4_k_m.gguf",
      url: "https://huggingface.co/octo-catto/gemma-3n-E4B-it-Q4_K_M-GGUF/resolve/main/gemma-3n-e4b-it-q4_k_m.gguf?download=true",
      note: "Preset desktop consigliato: più accurato su ricette complesse e ricerca AI",
    },
    "gemma-3n-e2b": {
      label: "Gemma 3n E2B (bilanciato)",
      sizeLabel: "2.79 GB",
      fileName: "gemma-3n-e2b-it-q4_k_m.gguf",
      url: "https://huggingface.co/Edge-Quant/gemma-3n-E2B-it-Q4_K_M-GGUF/resolve/main/gemma-3n-e2b-it-q4_k_m.gguf?download=true",
      note: "Più leggero e veloce di E4B, utile come fallback desktop",
    },
  },
  android: {
    "gemma-3n-e4b": {
      label: "Gemma 3n E4B (alta qualità opzionale)",
      sizeLabel: "4.41 GB",
      fileName: "gemma-3n-E4B-it-int4.task",
      url: "https://huggingface.co/arpitx35/gemma-3n-E4B-it-int4/resolve/main/gemma-3n-E4B-it-int4.task?download=true",
      note: "Qualità più alta, ma consigliato solo su device Android recenti e con molta RAM",
    },
    "gemma-3n-e2b": {
      label: "Gemma 3n E2B (consigliato su Android)",
      sizeLabel: "3.14 GB",
      fileName: "gemma-3n-E2B-it-int4.task",
      url: "https://huggingface.co/gummybear2555/Gemma-3n-E2B-it-int4/resolve/main/gemma-3n-E2B-it-int4.task?download=true",
      note: "Preset Android più stabile per consumi, tempi e compatibilità",
    },
  },
  imageGen: {
    label: "SDXL Turbo (foto piatto locale)",
    sizeLabel: "checkpoint ufficiale singolo",
    fileName: "sd_xl_turbo_1.0.safetensors",
    url: "https://huggingface.co/stabilityai/sdxl-turbo/resolve/main/sd_xl_turbo_1.0.safetensors?download=true",
    note: "Preset consigliato per generare rapidamente una foto realistica del piatto con stable-diffusion.cpp",
  },
  vision: {
    "3b": {
      key: "3b",
      label: "Qwen2.5-VL 3B Q4",
      shortLabel: "3B — Veloce",
      model: {
        label: "Qwen2.5-VL 3B Q4",
        sizeLabel: "1.93 GB",
        fileName: "Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf",
        url: "https://huggingface.co/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf",
      },
      mmproj: {
        label: "mmproj Qwen2.5-VL 3B",
        sizeLabel: "845 MB",
        fileName: "mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf",
        url: "https://huggingface.co/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf",
      },
      totalLabel: "2.78 GB totali",
      note: "Veloce, adatto a foto piatti",
    },
    "7b": {
      key: "7b",
      label: "Qwen2.5-VL 7B Q4",
      shortLabel: "7B — Preciso",
      model: {
        label: "Qwen2.5-VL 7B Q4",
        sizeLabel: "4.68 GB",
        fileName: "Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf",
        url: "https://huggingface.co/ggml-org/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf",
      },
      mmproj: {
        label: "mmproj Qwen2.5-VL 7B",
        sizeLabel: "853 MB",
        fileName: "mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf",
        url: "https://huggingface.co/ggml-org/Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf",
      },
      totalLabel: "5.53 GB totali",
      note: "Più preciso, consigliato per OCR libri",
    },
  },
  whisper: {
    label: "Whisper Small (trascrizione audio)",
    sizeLabel: "466 MB",
    fileName: "ggml-small.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
    note: "Fallback audio→testo per video senza sottotitoli",
  },
};

function normalizeLocalRuntimePath(value) {
  const trimmed = (value || "").trim();
  if (!trimmed || trimmed === "llama-cli") return "@auto";
  return trimmed;
}

function normalizeImageGenRuntimePath(value) {
  const trimmed = (value || "").trim();
  if (!trimmed || trimmed === "sd-cli") return "@auto";
  return trimmed;
}

function createDefaultAiPrefs() {
  return {
    lastProvider: "local",
    importProvider: "local",
    searchProvider: "local",
    visionModelPath: "",
    imageGenModelPath: "",
    imageGenRuntimePath: "@auto",
    providers: Object.fromEntries(
      Object.entries(AI_PROVIDERS).map(([key, provider]) => {
        const base = { apiKey: "", model: getProviderDefaultModel(key), enabled: key === "local" };
        if (key === "local") {
          return [key, { ...base, enabled: true, localModelPath: "", localRuntimePath: "@auto", visionModelPath: "" }];
        }

        return [key, base];
      }),
    ),
  };
}

function getErrorMessage(error, fallback = "Errore sconosciuto") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.error === "string" && error.error.trim()) return error.error;

  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== "{}" ? serialized : fallback;
  } catch {
    return fallback;
  }
}

function migrateAiPrefs(savedPrefs, legacyConfig) {
  const base = createDefaultAiPrefs();
  const merged = {
    lastProvider: base.lastProvider,
    importProvider: base.importProvider,
    searchProvider: base.searchProvider,
    visionModelPath: base.visionModelPath,
    imageGenModelPath: base.imageGenModelPath,
    imageGenRuntimePath: base.imageGenRuntimePath,
    providers: { ...base.providers },
  };

  if (savedPrefs?.providers) {
    for (const providerKey of Object.keys(AI_PROVIDERS)) {
      const saved = savedPrefs.providers?.[providerKey];
      if (!saved) continue;

      merged.providers[providerKey] = {
        apiKey: saved.apiKey ?? "",
        model: normalizeProviderModel(providerKey, saved.model),
        enabled: saved.enabled !== undefined ? saved.enabled : (providerKey === "local" || Boolean(saved.apiKey?.trim())),
        ...(providerKey === "local"
          ? {
              localModelPath: saved.localModelPath ?? "",
              localRuntimePath: normalizeLocalRuntimePath(saved.localRuntimePath),
              visionModelPath: saved.visionModelPath ?? "",
            }
          : {}),
      };
    }

    if (AI_PROVIDERS[savedPrefs.lastProvider]) {
      merged.lastProvider = savedPrefs.lastProvider;
    }
    if (AI_PROVIDERS[savedPrefs.importProvider]) {
      merged.importProvider = savedPrefs.importProvider;
    } else if (AI_PROVIDERS[savedPrefs.lastProvider]) {
      merged.importProvider = savedPrefs.lastProvider;
    }
    if (AI_PROVIDERS[savedPrefs.searchProvider]) {
      merged.searchProvider = savedPrefs.searchProvider;
    }

    // Migrate visionModelPath to root level (shared across providers)
    merged.visionModelPath = savedPrefs.visionModelPath
      ?? savedPrefs.providers?.local?.visionModelPath
      ?? "";
    merged.imageGenModelPath = savedPrefs.imageGenModelPath ?? "";
    merged.imageGenRuntimePath = normalizeImageGenRuntimePath(savedPrefs.imageGenRuntimePath);
  }

  if (legacyConfig && AI_PROVIDERS[legacyConfig.provider]) {
    merged.lastProvider = legacyConfig.provider;
    merged.importProvider = legacyConfig.provider;
    merged.searchProvider = legacyConfig.provider;
    merged.providers[legacyConfig.provider] = {
      apiKey: legacyConfig.apiKey ?? merged.providers[legacyConfig.provider].apiKey,
      model: normalizeProviderModel(legacyConfig.provider, legacyConfig.model || merged.providers[legacyConfig.provider].model),
      ...(legacyConfig.provider === "local"
        ? {
            localModelPath: legacyConfig.localModelPath ?? merged.providers.local.localModelPath,
            localRuntimePath: normalizeLocalRuntimePath(legacyConfig.localRuntimePath || merged.providers.local.localRuntimePath),
            visionModelPath: legacyConfig.visionModelPath ?? merged.providers.local.visionModelPath ?? "",
          }
        : {}),
    };
    if (legacyConfig.visionModelPath) {
      merged.visionModelPath = legacyConfig.visionModelPath;
    }
    if (legacyConfig.imageGenModelPath) {
      merged.imageGenModelPath = legacyConfig.imageGenModelPath;
    }
    if (legacyConfig.imageGenRuntimePath) {
      merged.imageGenRuntimePath = normalizeImageGenRuntimePath(legacyConfig.imageGenRuntimePath);
    }
  }

  return merged;
}

function getImportProvider(aiPrefs) {
  if (AI_PROVIDERS[aiPrefs?.importProvider]) return aiPrefs.importProvider;
  if (AI_PROVIDERS[aiPrefs?.lastProvider]) return aiPrefs.lastProvider;
  return "local";
}

function getSearchProvider(aiPrefs) {
  if (AI_PROVIDERS[aiPrefs?.searchProvider]) return aiPrefs.searchProvider;
  if (AI_PROVIDERS[aiPrefs?.importProvider]) return aiPrefs.importProvider;
  if (AI_PROVIDERS[aiPrefs?.lastProvider]) return aiPrefs.lastProvider;
  return "local";
}

function getAiConfig(aiPrefs, provider = getImportProvider(aiPrefs)) {
  const safeProvider = AI_PROVIDERS[provider] ? provider : "local";
  const prefs = aiPrefs?.providers?.[safeProvider] ?? {};

  return {
    provider: safeProvider,
    apiKey: prefs.apiKey ?? "",
    model: normalizeProviderModel(safeProvider, prefs.model),
    localModelPath: prefs.localModelPath ?? "",
    localRuntimePath: normalizeLocalRuntimePath(prefs.localRuntimePath),
    visionModelPath: aiPrefs?.visionModelPath ?? prefs.visionModelPath ?? "",
    imageGenModelPath: aiPrefs?.imageGenModelPath ?? "",
    imageGenRuntimePath: normalizeImageGenRuntimePath(aiPrefs?.imageGenRuntimePath),
  };
}

function getSharedImageGenerationConfig(aiPrefs) {
  return {
    modelPath: aiPrefs?.imageGenModelPath ?? "",
    runtimePath: normalizeImageGenRuntimePath(aiPrefs?.imageGenRuntimePath),
  };
}

function loadInitialAiPrefs() {
  return migrateAiPrefs(ls.get("rv_ai_prefs", null), ls.get("rv_config", null));
}

function isLocalProvider(provider) {
  return provider === "local";
}

function requiresApiKey(provider) {
  return !isLocalProvider(provider);
}

function isProviderConfigured(config) {
  return requiresApiKey(config.provider)
    ? Boolean(config.apiKey.trim())
    : Boolean(config.localModelPath.trim());
}

function getLocalModelDownload(model, isAndroidShell) {
  const target = isAndroidShell ? LOCAL_MODEL_DOWNLOADS.android : LOCAL_MODEL_DOWNLOADS.desktop;
  return target[model] ?? null;
}

async function invokeNative(command, args) {
  const tauriInvoke = window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke;
  if (tauriInvoke) {
    try {
      return await tauriInvoke(command, args);
    } catch (error) {
      throw new Error(getErrorMessage(error, `Errore bridge nativo: ${command}`));
    }
  }

  const androidInvoke = typeof window.AndroidBridge?.invoke === "function"
    ? window.AndroidBridge.invoke.bind(window.AndroidBridge)
    : null;

  if (androidInvoke) {
    const raw = androidInvoke(command, JSON.stringify(args ?? {}));
    let parsed;

    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      throw new Error("Risposta non valida dal bridge Android");
    }

    if (!parsed?.ok) {
      throw new Error(getErrorMessage(parsed?.error, "Errore bridge Android"));
    }

    return parsed.data;
  }

  throw new Error("Bridge nativo non disponibile. Avvia l'app tramite Tauri o Android Studio.");
}

function hasNativeBridge() {
  return Boolean(
    window.__TAURI__?.core?.invoke ??
    window.__TAURI_INTERNALS__?.invoke ??
    (typeof window.AndroidBridge?.invoke === "function")
  );
}

// ─── Source detection ─────────────────────────────────────────────────────────
function detectSource(url) {
  if (/tiktok\.com/i.test(url))            return "tiktok";
  if (/instagram\.com/i.test(url))         return "instagram";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/facebook\.com/i.test(url))          return "facebook";
  return "web";
}
function getYTThumb(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────
const DEFAULT_PREPARATION_TITLE = "Preparazione principale";
const JSON_SCHEMA = `{"titolo":"","categoria":"Primi|Secondi|Contorni|Dolci|Antipasti|Zuppe|Pizze & Pane|Bevande|Altro","difficolta":"Facile|Media|Difficile","tempoPrep":"","tempoCottura":"","porzioni":4,"ingredienti":["quantità ingrediente"],"procedimento":["Passo 1"],"preparazioni":[{"titolo":"nome sezione","ingredienti":["quantità ingrediente"],"procedimento":["Passo 1"],"note":""}],"note":"","tags":["tag"],"fonte":"URL","foto":""}`;

function stripListPrefix(value) {
  return String(value || "")
    .replace(/^\s*(?:[-*•]+|\d+[\).\]-])\s*/u, "")
    .trim();
}

function normalizeTextList(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap(item => normalizeTextList(typeof item === "string" ? item : item?.text ?? item?.value ?? ""))
      .filter(Boolean);
  }

  // Model returned {name: qty} object instead of array — convert to ["qty name"]
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value)
      .map(([name, qty]) => {
        const q = String(qty || "").trim();
        const n = String(name || "").trim();
        return q && n ? `${q} ${n}` : n || q;
      })
      .filter(Boolean);
  }

  if (typeof value !== "string") return [];

  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(stripListPrefix)
    .filter(Boolean);
}

function flattenPreparationSections(sections) {
  return sections.reduce((acc, section) => {
    acc.ingredienti.push(...(section.ingredienti || []));
    acc.procedimento.push(...(section.procedimento || []));
    return acc;
  }, { ingredienti: [], procedimento: [] });
}

function normalizePreparationSections(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((section, index) => {
      const title = typeof section?.titolo === "string" && section.titolo.trim()
        ? section.titolo.trim()
        : typeof section?.title === "string" && section.title.trim()
          ? section.title.trim()
          : value.length > 1
            ? `Preparazione ${index + 1}`
            : DEFAULT_PREPARATION_TITLE;

      const ingredienti = normalizeTextList(section?.ingredienti ?? section?.ingredients);
      const procedimento = normalizeTextList(section?.procedimento ?? section?.passaggi ?? section?.steps ?? section?.method);
      const note = typeof section?.note === "string" ? section.note.trim() : "";

      return {
        titolo: title,
        ingredienti,
        procedimento,
        note,
      };
    })
    .filter(section =>
      section.titolo ||
      section.note ||
      section.ingredienti.length ||
      section.procedimento.length
    );
}

function normalizeRecipeStructure(recipe) {
  if (!recipe || typeof recipe !== "object") return recipe;

  const ingredienti = normalizeTextList(recipe.ingredienti);
  const procedimento = normalizeTextList(recipe.procedimento);
  const structuredSections = normalizePreparationSections(recipe.preparazioni ?? recipe.sezioni);

  let preparazioni;
  if (structuredSections.length && (ingredienti.length || procedimento.length)) {
    // Both root ingredients/procedure AND structured sections exist:
    // merge root as first "main" section, avoid losing base recipe data
    const rootTitle = recipe.titolo || DEFAULT_PREPARATION_TITLE;
    const alreadyHasRoot = structuredSections.some(s =>
      s.titolo === rootTitle || s.titolo === DEFAULT_PREPARATION_TITLE
    );
    if (alreadyHasRoot) {
      preparazioni = structuredSections;
    } else {
      preparazioni = [
        { titolo: rootTitle, ingredienti, procedimento, note: "" },
        ...structuredSections,
      ];
    }
  } else if (structuredSections.length) {
    preparazioni = structuredSections;
  } else if (ingredienti.length || procedimento.length) {
    preparazioni = [{ titolo: DEFAULT_PREPARATION_TITLE, ingredienti, procedimento, note: "" }];
  } else {
    preparazioni = [];
  }
  const flattened = preparazioni.length ? flattenPreparationSections(preparazioni) : { ingredienti, procedimento };

  return {
    ...recipe,
    ingredienti: flattened.ingredienti,
    procedimento: flattened.procedimento,
    preparazioni,
  };
}

function normalizeRecipeCollection(recipes) {
  return Array.isArray(recipes) ? recipes.map(normalizeRecipeStructure) : [];
}

function isLikelyStandaloneRecipeTitle(title) {
  const normalized = String(title || "").trim();
  if (!normalized) return false;

  const lowered = normalized.toLowerCase();
  if (lowered === DEFAULT_PREPARATION_TITLE.toLowerCase()) return false;

  const genericTitles = new Set([
    "base",
    "impasto",
    "crema",
    "farcitura",
    "ripieno",
    "glassa",
    "copertura",
    "decorazione",
    "topping",
    "salsa",
    "bagna",
    "assemblaggio",
  ]);
  if (genericTitles.has(lowered)) return false;

  const lettersOnly = normalized.replace(/[^A-Za-zÀ-ÿ]/g, "");
  const uppercaseRatio = lettersOnly
    ? lettersOnly.split("").filter(char => char === char.toUpperCase()).length / lettersOnly.length
    : 0;
  const recipeWordPattern = /\b(crema|torta|crostata|plumcake|biscotti|ganache|mousse|pasta|risotto|zuppa|vellutata|salsa|pane|focaccia|pizza|lasagna|tiramisù|cheesecake|souffl[eé])\b/i;

  return uppercaseRatio >= 0.65 || recipeWordPattern.test(normalized);
}

function buildStandaloneRecipeChoicesFromPreparations(recipe, sourceLabel = "") {
  const normalized = normalizeRecipeStructure(recipe);
  const baseTitle = normalized.titolo?.trim().toLowerCase() || "";

  return (normalized.preparazioni || [])
    .filter(section =>
      section?.titolo &&
      isLikelyStandaloneRecipeTitle(section.titolo) &&
      section.titolo.trim().toLowerCase() !== baseTitle &&
      ((section.ingredienti || []).length || (section.procedimento || []).length)
    )
    .map((section, index) => normalizeRecipeStructure({
      titolo: section.titolo.trim(),
      categoria: normalized.categoria || "Altro",
      difficolta: normalized.difficolta || "Facile",
      tempoPrep: normalized.tempoPrep || "",
      tempoCottura: normalized.tempoCottura || "",
      porzioni: normalized.porzioni || 4,
      ingredienti: section.ingredienti || [],
      procedimento: section.procedimento || [],
      preparazioni: [{
        titolo: section.titolo.trim(),
        ingredienti: section.ingredienti || [],
        procedimento: section.procedimento || [],
        note: section.note || "",
      }],
      note: [normalized.note, sourceLabel ? `Estratta come ricetta autonoma dalla sezione ${index + 1}.` : ""]
        .filter(Boolean)
        .join(" "),
      tags: Array.isArray(normalized.tags) ? normalized.tags : [],
      fonte: normalized.fonte || sourceLabel || "Foto importata",
      foto: normalized.foto || "",
    }));
}

function hasStructuredPreparations(recipe) {
  const sections = Array.isArray(recipe?.preparazioni) ? recipe.preparazioni : [];
  if (sections.length > 1) return true;
  if (sections.length === 1) {
    const title = sections[0]?.titolo?.trim()?.toLowerCase();
    return Boolean(title && title !== DEFAULT_PREPARATION_TITLE.toLowerCase());
  }
  return false;
}

function createPreparationDraft(title = DEFAULT_PREPARATION_TITLE) {
  return {
    titolo: title,
    ingredienti: "",
    procedimento: "",
    note: "",
  };
}

function createEmptyRecipeDraft() {
  return {
    titolo: "",
    categoria: "Altro",
    difficolta: "Facile",
    tempoPrep: "",
    tempoCottura: "",
    porzioni: 4,
    preparazioni: [createPreparationDraft()],
    note: "",
    foto: "",
    tags: "",
  };
}

function recipeToDraft(recipe) {
  const normalized = normalizeRecipeStructure(recipe);
  const sections = normalized.preparazioni?.length
    ? normalized.preparazioni
    : [{ titolo: DEFAULT_PREPARATION_TITLE, ingredienti: normalized.ingredienti || [], procedimento: normalized.procedimento || [], note: "" }];

  return {
    ...createEmptyRecipeDraft(),
    ...normalized,
    titolo: normalized.titolo || "",
    categoria: normalized.categoria || "Altro",
    difficolta: normalized.difficolta || "Facile",
    tempoPrep: normalized.tempoPrep || "",
    tempoCottura: normalized.tempoCottura || "",
    porzioni: normalized.porzioni || 4,
    preparazioni: sections.map(section => ({
      titolo: section.titolo || DEFAULT_PREPARATION_TITLE,
      ingredienti: (section.ingredienti || []).join("\n"),
      procedimento: (section.procedimento || []).join("\n"),
      note: section.note || "",
    })),
    note: normalized.note || "",
    foto: normalized.foto || "",
    tags: Array.isArray(normalized.tags) ? normalized.tags.join(", ") : (normalized.tags || ""),
  };
}

function recipeDraftToRecipe(draft, baseRecipe = {}) {
  const preparazioni = normalizePreparationSections(
    (draft.preparazioni || []).map(section => ({
      titolo: section.titolo,
      ingredienti: section.ingredienti,
      procedimento: section.procedimento,
      note: section.note,
    })),
  );
  const flattened = preparazioni.length ? flattenPreparationSections(preparazioni) : { ingredienti: [], procedimento: [] };

  return normalizeRecipeStructure({
    ...baseRecipe,
    titolo: draft.titolo?.trim() || "",
    categoria: draft.categoria || "Altro",
    difficolta: draft.difficolta || "Facile",
    tempoPrep: draft.tempoPrep || "",
    tempoCottura: draft.tempoCottura || "",
    porzioni: Number(draft.porzioni) || 0,
    ingredienti: flattened.ingredienti,
    procedimento: flattened.procedimento,
    preparazioni,
    note: draft.note || "",
    foto: draft.foto || "",
    tags: typeof draft.tags === "string"
      ? draft.tags.split(",").map(tag => tag.trim()).filter(Boolean)
      : Array.isArray(draft.tags)
        ? draft.tags
        : [],
  });
}

function buildPrompt(url, source, caption, transcript) {
  const schema = JSON_SCHEMA.replace('"fonte":"URL"', `"fonte":"${url}"`);
  const photoHint = source === "web"
    ? "Per foto: URL diretto immagine principale della ricetta (og:image o hero)."
    : "Per foto: cerca una foto del piatto su blog/Pinterest, URL diretto o stringa vuota.";
  const base = `Sei un assistente culinario. Estrai la ricetta e rispondi SOLO con JSON valido, nessun testo extra:\n${schema}\n${photoHint}\nSe la ricetta ha componenti distinte (es. base, crema, glassa, decorazione, condimento), compila anche il campo "preparazioni" dividendole per sezioni. Se è una ricetta semplice, usa una sola sezione "Preparazione principale".\n\n`;
  const transcriptBlock = transcript ? `\nTrascrizione audio del video:\n"""\n${truncateText(transcript, 3000)}\n"""` : "";
  if (source === "tiktok") {
    const cap = caption ? `\nDidascalia:\n"""\n${caption}\n"""` : "";
    return base + `URL TikTok: ${url}${cap}${transcriptBlock}\nUsa didascalia e trascrizione audio per ricostruire la ricetta. Se mancano dettagli, cerca con web search il creator+titolo.`;
  }
  if (source === "instagram") {
    const cap = caption ? `\nDidascalia:\n"""\n${caption}\n"""` : "";
    return base + `URL Instagram: ${url}${cap}${transcriptBlock}\nUsa didascalia e trascrizione audio. Se mancano dettagli, cerca con web search.`;
  }
  if (source === "facebook") {
    const cap = caption ? `\nDidascalia:\n"""\n${caption}\n"""` : "";
    return base + `URL Facebook: ${url}${cap}${transcriptBlock}\nUsa didascalia e trascrizione audio. Se mancano dettagli, cerca con web search.`;
  }
  if (source === "youtube")
    return base + `URL YouTube: ${url}\nCerca il titolo con web search e trova la ricetta nella descrizione o su siti correlati. Campo foto: lascia vuoto (gestito automaticamente).`;
  return base + `URL: ${url}\nAccedi alla pagina e estrai la ricetta. Usa web search se necessario.`;
}

function buildLocalPrompt({ url, source, caption, extracted, transcript }) {
  const schema = JSON_SCHEMA.replace('"fonte":"URL"', `"fonte":"${url}"`);
  const pageTitle = extracted?.title ? `Titolo pagina: ${extracted.title}\n` : "";
  const imageHint = extracted?.image
    ? `Immagine principale rilevata: ${extracted.image}\nSe coerente con il piatto, riusala nel campo "foto".`
    : 'Se non trovi una foto affidabile, lascia "foto" vuoto.';
  const extractedText = extracted?.text?.trim()
    ? focusRecipeText(extracted.text)
    : "Nessun contenuto leggibile estratto automaticamente.";
  const preparationHints = extractPreparationHints({ caption, transcript, extracted });
  const preparationHintsBlock = preparationHints.length
    ? `Possibili sezioni/preparazioni rilevate localmente:\n${preparationHints.map(hint => `- ${hint.label} (${hint.source}): ${hint.evidence}`).join("\n")}`
    : "";

  const transcriptBlock = transcript
    ? `Trascrizione audio del video:\n"""\n${truncateText(transcript, 3000)}\n"""`
    : "";

  return [
    "Sei un assistente culinario offline. Ricostruisci la ricetta usando solo il contenuto fornito qui sotto.",
    `Rispondi SOLO con JSON valido, nessun testo extra:\n${schema}`,
    `Se la ricetta ha componenti distinte (es. impasto, farcitura, crema, copertura, decorazione), usa il campo "preparazioni" per dividere ingredienti e procedimento per sezione. Se la ricetta è semplice, usa una sola sezione "${DEFAULT_PREPARATION_TITLE}".`,
    `IMPORTANTE per "ingredienti": estrai TUTTI gli ingredienti con quantità menzionati nel testo, nella didascalia e nella trascrizione audio. Anche se gli ingredienti sono citati dentro i passaggi del procedimento e non in una lista separata, devi comunque elencarli uno per uno nel campo "ingredienti" con le quantità (es. "200g farina", "3 uova", "1 spicchio d'aglio"). Non lasciare "ingredienti" vuoto se nel testo ci sono ingredienti.`,
    imageHint,
    source === "youtube"
      ? "Per YouTube usa titolo, descrizione, sottotitoli o testo estratto. Non inventare ingredienti non supportati dal contenuto."
      : "Non usare web search e non citare fonti esterne. Se un dato manca, usa stringa vuota o array parziale.",
    preparationHintsBlock,
    pageTitle,
    transcriptBlock,
    caption ? `Didascalia / testo aggiuntivo:\n"""\n${truncateText(caption, 3000)}\n"""` : "",
    extractedText !== "Nessun contenuto leggibile estratto automaticamente."
      ? `Testo estratto da ${url}:\n"""\n${extractedText}\n"""`
      : "",
  ].filter(Boolean).join("\n\n");
}

function buildVideoContextText(videoContext) {
  if (!videoContext?.found) return "";

  const parts = [];

  if (videoContext.visualSummary?.trim()) {
    parts.push(`Interpretazione visiva del video:\n"""\n${truncateText(videoContext.visualSummary.trim(), 2200)}\n"""`);
  }

  if (Array.isArray(videoContext.onScreenText) && videoContext.onScreenText.length) {
    parts.push(
      `Testi letti nei frame del video:\n"""\n${truncateText(videoContext.onScreenText.join("\n"), 2200)}\n"""`
    );
  }

  if (Array.isArray(videoContext.keyMoments) && videoContext.keyMoments.length) {
    parts.push(
      `Passaggi visivi osservati nel video:\n"""\n${truncateText(videoContext.keyMoments.map((step, index) => `${index + 1}. ${step}`).join("\n"), 2200)}\n"""`
    );
  }

  return parts.join("\n\n");
}

function buildEnhancedLocalPrompt({ url, source, caption, extracted, transcript, videoContext }) {
  const basePrompt = buildLocalPrompt({ url, source, caption, extracted, transcript });
  const videoBlock = buildVideoContextText(videoContext);

  if (!videoBlock) return basePrompt;

  return [
    basePrompt,
    "Per i video usa anche il contenuto visivo seguente: testo on-screen e interpretazione dei passaggi osservati nei frame. Trattalo come fonte primaria insieme ad audio e didascalia.",
    videoBlock,
  ].join("\n\n");
}

function buildExternalPrompt({ url, source, caption, extracted, transcript, videoContext }) {
  const schema = JSON_SCHEMA.replace('"fonte":"URL"', `"fonte":"${url}"`);
  const pageTitle = extracted?.title ? `Titolo pagina estratto localmente: ${extracted.title}\n` : "";
  const imageHint = extracted?.image
    ? `Immagine principale rilevata localmente: ${extracted.image}\nSe coerente con il piatto, riusala nel campo "foto".`
    : 'Se non trovi una foto affidabile, lascia "foto" vuoto.';
  const extractedText = extracted?.text?.trim()
    ? focusRecipeText(extracted.text)
    : "";
  const preparationHints = extractPreparationHints({ caption, transcript, extracted });
  const preparationHintsBlock = preparationHints.length
    ? `Possibili sezioni/preparazioni rilevate localmente:\n${preparationHints.map(hint => `- ${hint.label} (${hint.source}): ${hint.evidence}`).join("\n")}`
    : "";
  const transcriptBlock = transcript
    ? `Trascrizione / sottotitoli recuperati localmente:\n"""\n${truncateText(transcript, 6500)}\n"""`
    : "";
  const videoBlock = buildVideoContextText(videoContext);

  return [
    "Sei un assistente culinario. Devi estrarre o ricostruire la ricetta usando sia l'URL sia il contenuto già recuperato localmente dall'app.",
    `Rispondi SOLO con JSON valido, nessun testo extra:\n${schema}`,
    `Se la ricetta ha componenti distinte (es. impasto, crema, farcitura, glassa, decorazione), usa il campo "preparazioni" per dividere ingredienti e procedimento per sezione. Se è semplice, usa una sola sezione "${DEFAULT_PREPARATION_TITLE}".`,
    `IMPORTANTE per "ingredienti": estrai TUTTI gli ingredienti con quantità menzionati nei dati forniti qui sotto. Anche se compaiono dentro i passaggi, elencali comunque nel campo "ingredienti".`,
    "Se i dati suggeriscono sezioni diverse come base, crema, farcitura, glassa, topping o decorazione, NON fonderle in un unico blocco: crea una voce separata nel campo \"preparazioni\" e assegna a ogni sezione i suoi ingredienti e passaggi.",
    source === "youtube"
      ? "Per YouTube usa con priorità titolo, testo pagina, descrizione e sottotitoli già recuperati qui sotto. Cerca attivamente sul web il titolo esatto del video, il canale/creator e una eventuale companion recipe page o descrizione completa. Usa la web search per recuperare soprattutto i dettagli mancanti delle diverse preparazioni, non per ignorare i dati locali."
      : source === "web"
        ? "Per le pagine web usa con priorità il testo già estratto localmente. Puoi usare web search solo come supporto se il contenuto è incompleto."
        : "Per i social usa con priorità didascalia, metadati e trascrizione già recuperati localmente. Usa web search solo come supporto secondario.",
    `URL originale: ${url}`,
    imageHint,
    preparationHintsBlock,
    pageTitle,
    caption ? `Didascalia / testo aggiuntivo recuperato localmente:\n"""\n${truncateText(caption, 5000)}\n"""` : "",
    transcriptBlock,
    extractedText ? `Testo estratto localmente dalla pagina:\n"""\n${extractedText}\n"""` : "",
    videoBlock ? `Contesto video estratto localmente:\n${videoBlock}` : "",
  ].filter(Boolean).join("\n\n");
}

function buildPhotoPrompt({ fileName, note, photoType }) {
  const safeFileName = (fileName || "").replace(/"/g, "").trim();
  const sourceLabel = safeFileName ? `Foto importata (${safeFileName})` : "Foto importata";
  const schema = JSON_SCHEMA.replace('"fonte":"URL"', `"fonte":"${sourceLabel}"`);

  if (photoType === "book") {
    const multiRecipeSchema = `{"ricette":[${schema}, ${schema}]}`;
    return [
      "Sei un OCR culinario. Ti viene mostrata la foto di una pagina con una o più ricette scritte (libro, rivista, quaderno, appunti).",
      [
        "REGOLE FONDAMENTALI — TRASCRIZIONE FEDELE:",
        "1. LEGGI parola per parola tutto il testo visibile nella foto.",
        "2. NON inventare, NON aggiungere, NON riformulare, NON riassumere. Trascrivi esattamente ciò che è scritto.",
        "3. Se un ingrediente è scritto nella foto, DEVE comparire nel JSON. Se NON è scritto, NON aggiungerlo.",
        "4. Mantieni le quantità ESATTAMENTE come scritte (es. se dice \"½ litro\" scrivi \"½ litro\", se dice \"40 gr\" scrivi \"40 gr\").",
        "5. Trascrivi TUTTI i passaggi del procedimento, non solo i primi. Ogni passaggio numerato o paragrafo separato = un elemento dell'array.",
        "6. Il titolo deve essere ESATTAMENTE quello scritto nella pagina.",
        '7. Nel campo "fonte" scrivi "Foto importata" — non inventare la fonte.',
        '8. "foto" deve essere stringa vuota.',
      ].join("\n"),
      [
        "RICETTE MULTIPLE:",
        `Se la pagina contiene UNA SOLA ricetta, rispondi con JSON singolo:\n${schema}`,
        `Se la pagina contiene DUE O PIÙ ricette distinte (non varianti della stessa), rispondi con:\n${multiRecipeSchema}`,
        "Ogni ricetta nell'array deve essere completa e indipendente, con il proprio titolo, ingredienti e procedimento.",
        "Varianti della stessa ricetta (es. crema base + variante al cioccolato) NON sono ricette separate: usa \"preparazioni\" con sezioni separate.",
        "Se nella pagina compare un SECONDO TITOLO autonomo e leggibile (per esempio in maiuscolo o chiaramente separato), trattalo come ricetta distinta nell'array \"ricette\", non come sezione della prima ricetta.",
      ].join("\n"),
      "Rispondi SOLO con JSON valido, nessun testo extra.",
      "Se parti del testo sono poco leggibili o tagliate, trascrivi quello che riesci a leggere e segnala nel campo \"note\" quali parti sono incerte.",
      note?.trim() ? `Contesto aggiuntivo fornito dall'utente:\n"""\n${note.trim()}\n"""` : "",
    ].filter(Boolean).join("\n\n");
  }

  return [
    "Sei un assistente culinario che osserva la foto di un piatto o di una preparazione.",
    `Rispondi SOLO con JSON valido, nessun testo extra:\n${schema}`,
    "Riconosci il piatto più probabile e ricostruisci una ricetta realistica e cucinabile.",
    `Se il piatto sembra composto da più elementi distinti (es. base, crema, topping, decorazione), usa il campo "preparazioni" per separare ingredienti e passaggi per ciascuna parte.`,
    "Se la foto non mostra ogni dettaglio, usa quantità ragionevoli e una versione plausibile del piatto, senza inventare elementi improbabili.",
    'Nel campo "note" indica brevemente che la ricetta è stata ricostruita da una foto quando alcuni dettagli sono stimati.',
    'Nel campo "foto" puoi lasciare stringa vuota: l\'anteprima originale viene gestita dall\'app.',
    note?.trim() ? `Contesto aggiuntivo fornito dall'utente:\n"""\n${note.trim()}\n"""` : "",
  ].filter(Boolean).join("\n\n");
}

function isBookImportedRecipe(recipe) {
  if (!recipe?.devData) return false;

  const storedType = recipe.devData?.input?.photoImport?.photoType;
  if (storedType === "book") return true;

  const prompt = String(recipe.devData?.prompt || "");
  return prompt.includes("OCR culinario") || prompt.includes("foto di una pagina con una o più ricette");
}

function buildRecipeImagePrompt(recipe) {
  const normalized = normalizeRecipeStructure(recipe);
  const keyIngredients = (normalized.ingredienti || []).slice(0, 12).join(", ");
  const sectionSummary = (normalized.preparazioni || [])
    .slice(0, 4)
    .map(section => {
      const ingredients = (section.ingredienti || []).slice(0, 6).join(", ");
      return `${section.titolo || "Preparazione"}: ${ingredients}`.trim();
    })
    .filter(Boolean)
    .join(" | ");

  return [
    "Create a realistic food photograph of the finished recipe described below.",
    "Show only the final edible result, fully prepared and appetizing.",
    "No recipe text, no book page, no collage, no ingredient flat lay, no step-by-step layout, no hands.",
    "Use natural light, realistic textures, editorial food photography style, believable plating.",
    `Dish name: ${normalized.titolo}.`,
    normalized.categoria ? `Category: ${normalized.categoria}.` : "",
    keyIngredients ? `Key ingredients: ${keyIngredients}.` : "",
    sectionSummary ? `Important components to reflect visually when relevant: ${sectionSummary}.` : "",
    "If it is a cream, frosting, custard, sauce, or filling rather than a plated dish, present it realistically in an elegant bowl, jar, or pastry setting appropriate to the recipe.",
    "The image must look like a real photograph of the completed recipe, ready to serve.",
  ].filter(Boolean).join("\n");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Impossibile leggere la foto selezionata"));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Impossibile elaborare la foto selezionata"));
    image.src = dataUrl;
  });
}

async function optimizeImageForImport(file) {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(originalDataUrl);
  const maxDimension = 1440;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const targetWidth = Math.max(1, Math.round(image.width * scale));
  const targetHeight = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) return originalDataUrl;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const optimizedDataUrl = canvas.toDataURL("image/jpeg", 0.84);
  return optimizedDataUrl.length < originalDataUrl.length ? optimizedDataUrl : originalDataUrl;
}

function buildShoppingPrompt(recipes) {
  const ingAll = recipes.map(r => `${r.titolo}: ${(r.ingredienti||[]).join(", ")}`).join("\n");
  return `Crea lista della spesa aggregata per:\n${ingAll}\nRispondi SOLO con JSON valido:\n{"items":[{"ingrediente":"pasta","quantita":"400g","reparto":"Pasta & Riso"}]}\nReparti possibili: Frigo|Frutta & Verdura|Pasta & Riso|Carne & Pesce|Latticini|Dispensa|Altro\nAggrega ingredienti simili e somma le quantità.`;
}

const AI_RECIPE_SEARCH_SCHEMA = `{"matchedIds":[123],"reason":"breve spiegazione in italiano","ingredientFocus":["funghi"],"categoryFocus":["Primi"]}`;

const INGREDIENT_STOPWORDS = new Set([
  "di","da","del","della","dello","delle","dei","degli","con","per","the","and","for","fresh","fresco",
  "fresca","freschi","fresche","extra","virgin","olive","oil","olio","vergine","room","temperature",
  "optional","facoltativo","quanto","basta","qb","q","b","circa","about","some","few","large","small",
  "medio","media","medi","grande","grandi","piccolo","piccola","taste","gusto","seed","seeds","semi",
  "chopped","tritato","tritata","tritati","tritate","minced","a","an","to","or","your","sliced","slice",
  "tagliato","tagliata","tagliati","tagliate","cooked","cotta","cotto","cotti","cotta","warm","cold"
]);

function normalizeIngredientFacet(rawIngredient) {
  const cleaned = rawIngredient
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+(?:[.,/]\d+)?\b/g, " ")
    .replace(/\b(?:g|gr|grammi|grammo|kg|ml|cl|l|oz|lb|lbs|cup|cups|tbsp|tsp|tablespoon|teaspoon|pinch|pizzico|fette|fetta|spicchi|spicchio|cucchiai|cucchiaio|cucchiaini|cucchiaino)\b/g, " ")
    .replace(/[^\p{L}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const tokens = cleaned
    .split(" ")
    .filter(token => token.length > 2 && !INGREDIENT_STOPWORDS.has(token));

  if (!tokens.length) return "";
  return tokens.slice(0, Math.min(2, tokens.length)).join(" ");
}

function formatIngredientFacet(label) {
  return label
    .split(" ")
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function buildIngredientCatalog(recipes) {
  const map = new Map();

  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredienti || []) {
      const key = normalizeIngredientFacet(ingredient);
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, { key, label: formatIngredientFacet(key), count: 0, recipeIds: new Set(), examples: [] });
      }

      const entry = map.get(key);
      entry.recipeIds.add(recipe.id);
      if (!entry.examples.includes(ingredient) && entry.examples.length < 2) {
        entry.examples.push(ingredient);
      }
    }
  }

  return [...map.values()]
    .map(entry => ({
      ...entry,
      count: entry.recipeIds.size,
      recipeIds: [...entry.recipeIds],
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "it"));
}

function resolveIngredientFacet(focusValues, catalog) {
  const normalizedValues = (focusValues || []).map(normalizeIngredientFacet).filter(Boolean);
  if (!normalizedValues.length) return null;

  for (const value of normalizedValues) {
    const exact = catalog.find(entry => entry.key === value);
    if (exact) return exact;

    const partial = catalog.find(entry => entry.key.includes(value) || value.includes(entry.key));
    if (partial) return partial;
  }

  return null;
}

function buildAiRecipeSearchPrompt(query, recipes) {
  const dataset = recipes.map(recipe => JSON.stringify({
    id: recipe.id,
    titolo: recipe.titolo,
    categoria: recipe.categoria,
    tags: recipe.tags || [],
    ingredienti: recipe.ingredienti || [],
    preparazioni: (recipe.preparazioni || []).map(section => ({
      titolo: section.titolo,
      ingredienti: section.ingredienti || [],
    })),
    ingredientiNormalizzati: (recipe.ingredienti || []).map(normalizeIngredientFacet).filter(Boolean),
    note: recipe.note || "",
  })).join("\n");

  return [
    "Sei il motore di ricerca intelligente del ricettario personale dell'utente.",
    "Devi cercare SOLO tra le ricette fornite qui sotto. Non inventare ricette e non usare conoscenza esterna.",
    `Query utente: "${query}"`,
    "Se la query è naturale o conversazionale, interpreta intento, categoria e ingredienti. Esempi: 'dammi ricette di primi con i funghi', 'dammi una torta con cioccolato'.",
    `Rispondi SOLO con JSON valido:\n${AI_RECIPE_SEARCH_SCHEMA}`,
    "Regole:",
    "- matchedIds deve contenere solo ID presenti nella lista",
    "- reason deve spiegare in breve perché hai scelto quelle ricette",
    "- se non trovi nulla, restituisci matchedIds vuoto",
    "Ricette disponibili:",
    dataset,
  ].join("\n\n");
}

function truncateText(input, maxChars) {
  return input.length > maxChars ? `${input.slice(0, maxChars)}…` : input;
}

function focusRecipeText(text) {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return "";

  const lower = normalized.toLowerCase();
  const anchorIndex = RECIPE_TEXT_ANCHORS
    .map(anchor => lower.indexOf(anchor))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0];

  const intro = truncateText(normalized, 1200);
  if (anchorIndex == null) {
    return truncateText(normalized, 4200);
  }

  const start = Math.max(0, anchorIndex - 600);
  const focused = normalized.slice(start, start + 3600).trim();
  if (focused === intro || focused.startsWith(intro)) {
    return truncateText(focused, 4200);
  }

  return truncateText(`${intro}\n\n${focused}`, 4600);
}

function extractPreparationHints({ caption = "", transcript = "", extracted = null }) {
  const textSources = [
    { source: "Didascalia", text: caption || "" },
    { source: "Trascrizione", text: transcript || "" },
    { source: "Pagina", text: extracted?.text || "" },
  ];
  const hints = new Map();

  for (const entry of textSources) {
    const normalized = entry.text
      .replace(/\r\n?/g, "\n")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized) continue;

    const fragments = normalized
      .split(/\n+|(?<=[.!?])\s+/)
      .map(fragment => fragment.trim())
      .filter(fragment => fragment.length >= 12);

    for (const fragment of fragments) {
      const lower = fragment.toLowerCase();

      for (const marker of PREPARATION_SECTION_MARKERS) {
        if (!marker.terms.some(term => lower.includes(term))) continue;

        const key = marker.label.toLowerCase();
        if (!hints.has(key)) {
          hints.set(key, {
            label: marker.label,
            source: entry.source,
            evidence: truncateText(fragment, 220),
          });
        }
      }

      if (hints.size >= 6) break;
    }

    if (hints.size >= 6) break;
  }

  return [...hints.values()];
}

// ─── AI Caller ────────────────────────────────────────────────────────────────
async function callAI({ provider, apiKey, model, prompt, useWebSearch = true, localOptions = null, imageDataUrl = "" }) {
  return invokeNative("call_ai", {
    payload: { provider, apiKey, model, prompt, useWebSearch, localOptions, imageDataUrl },
  });
}

function extractJsonFromCodeBlock(txt) {
  const m = txt.match(/```json\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  const m2 = txt.match(/```\s*(\{[\s\S]*?\})\s*```/);
  if (m2) return m2[1].trim();
  return null;
}

function findJsonObject(source) {
  const start = source.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let stringChar = null;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === stringChar) {
        if (stringChar === "'" && i + 1 < source.length && /[a-zA-Z\u00e0-\u00fa]/.test(source[i + 1])) {
          continue;
        }
        inString = false;
        stringChar = null;
      }
      continue;
    }

    if (ch === "\"" || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return source.slice(start);
}

function stripPromptEcho(text, prompt = "") {
  const normalizedText = text.replace(/\r\n?/g, "\n");
  const normalizedPrompt = prompt.replace(/\r\n?/g, "\n").trim();

  if (!normalizedPrompt) return normalizedText;

  const variants = [
    `> ${normalizedPrompt}`,
    `>${normalizedPrompt}`,
    normalizedPrompt,
  ];

  for (const variant of variants) {
    const index = normalizedText.indexOf(variant);
    if (index !== -1) {
      return normalizedText.slice(index + variant.length).trimStart();
    }
  }

  return normalizedText;
}

function sanitizeModelText(txt, prompt = "") {
  let clean = txt.replace(/\u0000/g, "").replace(/\r\n?/g, "\n");
  clean = stripPromptEcho(clean, prompt);

  const lines = clean.split("\n");
  const filtered = [];
  let skippingCommandList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (
      trimmed === "--no-conversation is not supported by llama-cli" ||
      trimmed === "please use llama-completion instead" ||
      trimmed === "Loading model..." ||
      trimmed === "available commands:" ||
      /^build\s+:/.test(trimmed) ||
      /^model\s+:/.test(trimmed) ||
      /^modalities\s+:/.test(trimmed) ||
      /^\/(?:exit|regen|clear|read|glob)\b/.test(trimmed) ||
      /^[>]+$/.test(trimmed) ||
      /^[▄█▀\s]+$/.test(trimmed)
    ) {
      if (trimmed === "available commands:") {
        skippingCommandList = true;
      }
      continue;
    }

    if (skippingCommandList) {
      if (!trimmed) continue;
      if (/^\/(?:exit|regen|clear|read|glob)\b/.test(trimmed)) continue;
      skippingCommandList = false;
    }

    filtered.push(line);
  }

  return filtered.join("\n").trim();
}

function findJsonObjects(source) {
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let stringChar = null;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === stringChar) {
        inString = false;
        stringChar = null;
      }
      continue;
    }

    if (ch === "\"" || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        candidates.push(source.slice(start, i + 1));
        start = -1;
      }
    }
  }

  if (start !== -1) {
    candidates.push(source.slice(start));
  }

  return candidates;
}

function scoreJsonCandidate(candidate) {
  const normalized = normalizeLooseJson(candidate);
  let score = 0;
  const lower = normalized.toLowerCase();

  if (lower.includes("\"matchedids\"")) score += 4;
  if (lower.includes("\"reason\"")) score += 2;
  if (lower.includes("\"titolo\"")) score += 3;
  if (lower.includes("\"ingredienti\"")) score += 3;
  if (lower.includes("\"procedimento\"")) score += 3;
  if (lower.includes("\"preparazioni\"")) score += 4;
  if (lower.includes("\"items\"")) score += 3;

  try {
    JSON.parse(normalized);
    score += 5;
  } catch {
    // ignore parse score bonus
  }

  return score;
}

function extractJsonObjectCandidate(txt, prompt = "") {
  const clean = sanitizeModelText(txt, prompt);

  const fromBlock = extractJsonFromCodeBlock(clean);
  if (fromBlock) {
    const blockCandidates = findJsonObjects(fromBlock);
    if (blockCandidates.length) {
      return [...blockCandidates].sort((a, b) => scoreJsonCandidate(a) - scoreJsonCandidate(b)).at(-1);
    }
  }

  const stripped = clean.replace(/```json|```/gi, "").trim();
  const candidates = findJsonObjects(stripped);
  if (candidates.length) {
    return [...candidates].sort((a, b) => scoreJsonCandidate(a) - scoreJsonCandidate(b)).at(-1);
  }

  throw new Error("Nessun JSON trovato nella risposta");
}

function normalizeLooseJson(input) {
  const source = input
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\r\n?/g, "\n");

  let out = "";
  let inString = false;
  let stringChar = null;
  let escaped = false;
  const stack = [];

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }

      if (ch === "\n") {
        out += "\\n";
        continue;
      }

      if (ch === stringChar) {
        if (stringChar === "'" && i + 1 < source.length && /[a-zA-Zà-ú]/.test(source[i + 1])) {
          out += "’";
          continue;
        }
        inString = false;
        stringChar = null;
        out += "\"";
        continue;
      }

      if (ch === "\"" && stringChar === "'") {
        out += "\\\"";
        continue;
      }

      out += ch;
      continue;
    }

    if (ch === "\"" || ch === "'") {
      inString = true;
      stringChar = ch;
      out += "\"";
      continue;
    }

    if (ch === "{") {
      stack.push("}");
      out += ch;
      continue;
    }

    if (ch === "[") {
      stack.push("]");
      out += ch;
      continue;
    }

    if (ch === "}" || ch === "]") {
      if (stack.length && stack[stack.length - 1] === ch) {
        stack.pop();
      }
      out += ch;
      continue;
    }

    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(ch)) continue;
    out += ch;
  }

  if (inString) out += "\"";
  out = out
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\bNone\b/g, "null");

  while (stack.length) out += stack.pop();
  return out.trim();
}

function parseJSON(txt, prompt = "") {
  const candidate = extractJsonObjectCandidate(txt, prompt);

  try {
    return JSON.parse(candidate);
  } catch (firstError) {
    try {
      const normalized = normalizeLooseJson(candidate);
      return JSON.parse(normalized);
    } catch (secondError) {
      console.error("[OR-JSON] raw input:\n", txt?.slice(0, 3000));
      console.error("[OR-JSON] candidate:\n", candidate?.slice(0, 3000));
      console.error("[OR-JSON] normalized:\n", normalizeLooseJson(candidate)?.slice(0, 3000));
      throw new Error(`JSON Parse error: ${secondError.message}`);
    }
  }
}

function buildJsonRepairPrompt({ rawText, schema, label }) {
  return [
    `Correggi il seguente JSON di ${label} malformato.`,
    "Rispondi SOLO con JSON valido, senza spiegazioni e senza blocchi markdown.",
    `Schema richiesto:\n${schema}`,
    "Se una stringa è troncata, chiudila in modo coerente. Se un campo manca, usa stringa vuota, array vuoto o un numero ragionevole.",
    `JSON da correggere:\n"""\n${rawText.slice(0, 12000)}\n"""`,
  ].join("\n\n");
}

async function parseStructuredResponse({ txt, provider, apiKey, model, schema, label, localOptions = null, prompt = "" }) {
  const result = await parseStructuredResponseWithMeta({
    txt,
    provider,
    apiKey,
    model,
    schema,
    label,
    localOptions,
    prompt,
  });
  return result.data;
}

async function parseStructuredResponseWithMeta({ txt, provider, apiKey, model, schema, label, localOptions = null, prompt = "" }) {
  const sanitizedText = sanitizeModelText(txt, prompt);
  try {
    return {
      data: parseJSON(sanitizedText, prompt),
      rawText: txt,
      sanitizedText,
      repaired: false,
      repairedText: "",
    };
  } catch (firstError) {
    const repairedText = await callAI({
      provider,
      apiKey,
      model,
      prompt: buildJsonRepairPrompt({ rawText: sanitizedText, schema, label }),
      useWebSearch: false,
      localOptions,
    });

    try {
      return {
        data: parseJSON(repairedText, prompt),
        rawText: txt,
        sanitizedText,
        repaired: true,
        repairedText,
      };
    } catch (repairError) {
      throw new Error(repairError.message || firstError.message);
    }
  }
}

function buildImportDebugData({
  provider,
  model,
  source,
  url,
  useWebSearch,
  caption,
  socialThumbnail,
  extracted,
  transcript,
  videoContext,
  prompt,
  rawModelResponse,
  sanitizedModelResponse,
  repairedModelResponse,
  parsedRecipe,
  localModelPath,
  localRuntimePath,
  visionModelPath,
  photoFileName,
  photoNote,
  photoType,
  importMode = "url",
}) {
  return {
    version: 1,
    importedAt: new Date().toISOString(),
    provider,
    model,
    source,
    importMode,
    useWebSearch,
    url,
    localRuntimePath: localRuntimePath || "",
    localModelPath: localModelPath || "",
    visionModelPath: visionModelPath || "",
    input: {
      caption: truncateText(caption || "", 6000),
      socialThumbnail: socialThumbnail || "",
      transcript: truncateText(transcript || "", 8000),
      extracted: extracted
        ? {
            title: extracted.title || "",
            image: extracted.image || "",
            text: truncateText(extracted.text || "", 10000),
          }
        : null,
      videoContext: videoContext || null,
      photoImport: importMode === "photo"
        ? {
            fileName: photoFileName || "",
            note: truncateText(photoNote || "", 2500),
            photoType: photoType || "",
          }
        : null,
    },
    prompt: truncateText(prompt || "", 12000),
    modelOutput: {
      raw: truncateText(rawModelResponse || "", 12000),
      sanitized: truncateText(sanitizedModelResponse || "", 12000),
      repaired: repairedModelResponse ? truncateText(repairedModelResponse, 12000) : "",
    },
    parsedRecipe,
  };
}

async function extractUrlContent(url) {
  return invokeNative("extract_url_content", { payload: { url } });
}

async function extractYoutubeTranscript(url) {
  return invokeNative("extract_youtube_transcript", { payload: { url } });
}

async function extractSocialTranscript(url) {
  return invokeNative("extract_social_transcript", { payload: { url } });
}

async function fetchSocialPreview(url) {
  return invokeNative("fetch_social_preview", { payload: { url } });
}

async function importVideoFrames({ url, visionModelPath, runtimePath, maxFrames }) {
  return invokeNative("import_video_frames", {
    payload: { url, visionModelPath, runtimePath, maxFrames },
  });
}

async function startLocalModelDownload(downloadConfig) {
  return invokeNative("start_local_model_download", { payload: downloadConfig });
}

async function getLocalModelDownloadStatus(downloadId) {
  return invokeNative("get_local_model_download_status", { payload: { downloadId } });
}

async function getLocalRuntimeStatus(runtimePath = "") {
  return invokeNative("get_local_runtime_status", { payload: { runtimePath } });
}

async function getLocalAndroidModelStatus(model = "") {
  return invokeNative("get_local_android_model_status", { payload: { model } });
}

async function getModelStorageStatus(activePaths = [], activeVisionModelPaths = []) {
  return invokeNative("get_model_storage_status", {
    payload: { activePaths, activeVisionModelPaths },
  });
}

async function cleanUnusedModels(activePaths = [], activeVisionModelPaths = []) {
  return invokeNative("clean_unused_models", {
    payload: { activePaths, activeVisionModelPaths },
  });
}

function formatDownloadSize(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) return "0.00 GB";
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}

function formatStorageSize(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) return "0 B";
  if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

function isExternalWebUrl(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function openExternalUrl(url) {
  if (!isExternalWebUrl(url)) {
    throw new Error("URL non valido");
  }

  if (hasNativeBridge()) {
    return invokeNative("open_external_url", { payload: { url } });
  }

  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    throw new Error("Impossibile aprire il link in una nuova finestra");
  }
  return true;
}

async function generateRecipeImage({ provider, prompt, apiKey = "", localModelPath = "", localRuntimePath = "" }) {
  return invokeNative("generate_recipe_image", {
    payload: {
      provider,
      prompt,
      apiKey,
      localModelPath,
      localRuntimePath,
    },
  });
}

async function importFromUrl({ provider, apiKey, model, url, caption, localModelPath, localRuntimePath, visionModelPath, socialThumbnail, onProgress }) {
  const source  = detectSource(url);
  const ytThumb = source === "youtube" ? getYTThumb(url) : null;
  const localOptions = isLocalProvider(provider)
    ? { modelPath: localModelPath, runtimePath: localRuntimePath }
    : null;
  const canExtractVideoContext = Boolean(visionModelPath?.trim()) && Boolean(window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke);

  let extracted = null;
  let prompt;
  let useWebSearch = true;
  const isSocialClosed = ["tiktok", "instagram", "facebook"].includes(source);
  const isVideoSource = ["tiktok", "instagram", "facebook", "youtube"].includes(source);

  let transcript = null;
  let videoContext = null;
  if (isSocialClosed) {
    try {
      onProgress?.("🎙️ Scarico e trascrivo audio dal video…");
      const result = await extractSocialTranscript(url);
      if (result?.found) {
        if (result.description && !caption.includes(result.description.slice(0, 80))) {
          caption = (caption ? caption + "\n\n" : "") + result.description;
        }
        if (result.title && !caption.includes(result.title)) {
          caption = result.title + "\n" + caption;
        }
        if (result.transcript) {
          transcript = result.transcript;
        }
        if (result.thumbnail && !socialThumbnail) {
          socialThumbnail = result.thumbnail;
        }
      }
    } catch (_) { /* cookies/whisper non disponibili */ }
  }

  if (!isSocialClosed) {
    if (source === "youtube") {
      onProgress?.("🎬 Recupero titolo, testo e metadati da YouTube…");
    } else {
      onProgress?.("🔍 Estraggo il contenuto della pagina…");
    }
    try {
      extracted = await extractUrlContent(url);
    } catch (extractionError) {
      if (isLocalProvider(provider)) {
        throw extractionError;
      }
      console.warn("[external-extract fallback]", extractionError);
    }
  }

  if (!isSocialClosed && source === "youtube" && !transcript) {
    try {
      onProgress?.("📝 Recupero i sottotitoli di YouTube…");
      const result = await extractYoutubeTranscript(url);
      if (result?.found) transcript = result.transcript;
    } catch (_) {}
  }

  if (isVideoSource && canExtractVideoContext) {
    try {
      onProgress?.("📹 Estraggo frame e testo dal video…");
      videoContext = await importVideoFrames({
        url,
        visionModelPath,
        runtimePath: localRuntimePath || "@auto",
        maxFrames: 8,
      });
      if (videoContext?.found) {
        onProgress?.("🧠 Interpreto il video e il testo on-screen…");
      }
    } catch (visionErr) {
      console.warn("[video-context fallback]", visionErr);
      onProgress?.("⚠️ Analisi visiva non disponibile, continuo con audio/testo…");
    }
  }

  if (isLocalProvider(provider)) {
    if (isSocialClosed && !transcript && !caption) {
      throw new Error(
        "Impossibile accedere al contenuto. Assicurati di essere loggato su " +
        (source === "tiktok" ? "TikTok" : source === "instagram" ? "Instagram" : "Facebook") +
        " in Chrome o Firefox, oppure incolla la didascalia manualmente."
      );
    }
    prompt = buildEnhancedLocalPrompt({ url, source, caption, extracted, transcript, videoContext });
    useWebSearch = false;
  } else {
    prompt = buildExternalPrompt({ url, source, caption, extracted, transcript, videoContext });
  }

  onProgress?.(isLocalProvider(provider)
    ? "🤖 Analizzo con il modello locale…"
    : "🤖 Invio al modello AI…");
  const txt = await callAI({ provider, apiKey, model, prompt, useWebSearch, localOptions });
  const parsed = await parseStructuredResponseWithMeta({
    txt,
    provider,
    apiKey,
    model,
    schema: JSON_SCHEMA.replace('"fonte":"URL"', `"fonte":"${url}"`),
    label: "ricetta",
    localOptions,
    prompt,
  });
  const rec = parsed.data;

  if (ytThumb) rec.foto = ytThumb;
  else if (socialThumbnail) rec.foto = socialThumbnail;
  else if (!rec.foto && extracted?.image) rec.foto = extracted.image;
  return {
    recipe: rec,
    debugData: buildImportDebugData({
      provider,
      model,
      source,
      url,
      useWebSearch,
      caption,
      socialThumbnail,
      extracted,
      transcript,
      videoContext,
      prompt,
      rawModelResponse: parsed.rawText,
      sanitizedModelResponse: parsed.sanitizedText,
      repairedModelResponse: parsed.repaired ? parsed.repairedText : "",
      parsedRecipe: rec,
      localModelPath,
      localRuntimePath,
      visionModelPath,
      importMode: "url",
    }),
  };
}

async function importFromPhoto({
  provider,
  apiKey,
  model,
  imageDataUrl,
  photoFileName,
  photoNote,
  photoType,
  localModelPath,
  localRuntimePath,
  visionModelPath,
  onProgress,
}) {
  const safeFileName = (photoFileName || "").replace(/"/g, "").trim();
  const isBookMode = photoType === "book";
  const localOptions = isLocalProvider(provider)
    ? { modelPath: localModelPath, runtimePath: localRuntimePath, visionModelPath }
    : null;

  if (isLocalProvider(provider) && typeof window.AndroidBridge?.invoke === "function") {
    throw new Error("Su Android il modello locale non supporta ancora l'analisi foto. Usa Claude/OpenAI oppure il desktop con modello vision.");
  }

  if (isLocalProvider(provider) && !visionModelPath?.trim()) {
    throw new Error("Per importare da foto in locale serve configurare anche il Modello vision.");
  }

  const prompt = buildPhotoPrompt({ fileName: photoFileName, note: photoNote, photoType });
  onProgress?.(isBookMode
    ? (isLocalProvider(provider) ? "📖 Leggo la ricetta dalla foto con il modello vision locale…" : "📖 Leggo la ricetta dalla foto…")
    : (isLocalProvider(provider) ? "📷 Analizzo la foto con il modello vision locale…" : "📷 Invio la foto al modello AI…"));

  const txt = await callAI({
    provider,
    apiKey,
    model,
    prompt,
    useWebSearch: false,
    localOptions,
    imageDataUrl,
  });

  const parsed = await parseStructuredResponseWithMeta({
    txt,
    provider,
    apiKey,
    model,
    schema: JSON_SCHEMA.replace('"fonte":"URL"', `"fonte":"Foto importata${safeFileName ? ` (${safeFileName})` : ""}"`),
    label: "ricetta da foto",
    localOptions,
    prompt,
  });
  const raw = parsed.data;

  const buildDebug = (rec) => buildImportDebugData({
    provider,
    model,
    source: "photo",
    url: "",
    useWebSearch: false,
    caption: "",
    socialThumbnail: "",
    extracted: null,
    transcript: "",
    videoContext: null,
    prompt,
    rawModelResponse: parsed.rawText,
    sanitizedModelResponse: parsed.sanitizedText,
    repairedModelResponse: parsed.repaired ? parsed.repairedText : "",
    parsedRecipe: rec,
    localModelPath,
    localRuntimePath,
    visionModelPath,
    photoFileName: safeFileName,
    photoNote,
    photoType,
    importMode: "photo",
  });

  // Multiple recipes detected
  if (Array.isArray(raw?.ricette) && raw.ricette.length > 1) {
    const defaultFonte = safeFileName ? `Foto importata: ${safeFileName}` : "Foto importata";
    const allRecipes = raw.ricette.map(r => {
      if (!r.fonte) r.fonte = defaultFonte;
      return r;
    });
    return { recipes: allRecipes, debugData: buildDebug(raw), multiple: true };
  }

  // Single recipe (or array with 1 element)
  const rec = Array.isArray(raw?.ricette) ? raw.ricette[0] : raw;
  if (!rec.fonte) {
    rec.fonte = safeFileName ? `Foto importata: ${safeFileName}` : "Foto importata";
  }

  if (isBookMode) {
    const promotedRecipes = buildStandaloneRecipeChoicesFromPreparations(
      rec,
      safeFileName ? `Foto importata: ${safeFileName}` : "Foto importata",
    );

    if (promotedRecipes.length) {
      return {
        recipes: [normalizeRecipeStructure(rec), ...promotedRecipes],
        debugData: buildDebug(raw),
        multiple: true,
      };
    }
  }

  return { recipe: rec, debugData: buildDebug(rec) };
}

async function buildShoppingList({ provider, apiKey, model, recipes, localModelPath, localRuntimePath }) {
  const prompt = buildShoppingPrompt(recipes);
  const txt = await callAI({
    provider,
    apiKey,
    model,
    prompt,
    useWebSearch: false,
    localOptions: isLocalProvider(provider)
      ? { modelPath: localModelPath, runtimePath: localRuntimePath }
      : null,
  });
  return parseStructuredResponse({
    txt,
    provider,
    apiKey,
    model,
    schema: `{"items":[{"ingrediente":"","quantita":"","reparto":"Frigo|Frutta & Verdura|Pasta & Riso|Carne & Pesce|Latticini|Dispensa|Altro"}]}`,
    label: "lista della spesa",
    localOptions: isLocalProvider(provider)
      ? { modelPath: localModelPath, runtimePath: localRuntimePath }
      : null,
    prompt,
  });
}

async function testApiKey(provider, apiKey, localOptions = null, model = "") {
  return invokeNative("test_api_key", {
    payload: { provider, apiKey, localOptions, model },
  });
}

// ─── Unit Conversion & Portion Scaling ────────────────────────────────────────
const FRACTION_MAP = { "½":0.5, "¼":0.25, "¾":0.75, "⅓":1/3, "⅔":2/3, "⅕":0.2, "⅖":0.4, "⅗":0.6, "⅘":0.8, "⅙":1/6, "⅚":5/6, "⅛":0.125, "⅜":3/8, "⅝":5/8, "⅞":7/8 };
const FRACTION_CHARS = Object.keys(FRACTION_MAP);

function convertToImperial(ingredientString) {
  if (!ingredientString || typeof ingredientString !== "string") return ingredientString;
  let s = ingredientString;
  // Specific common conversions first
  s = s.replace(/\b1\s*kg\b/gi, "2.2 lb");
  s = s.replace(/\b500\s*g\b/gi, "1.1 lb");
  s = s.replace(/\b250\s*g\b/gi, "8.8 oz");
  s = s.replace(/\b200\s*g\b/gi, "7 oz");
  s = s.replace(/\b100\s*g\b/gi, "3.5 oz");
  s = s.replace(/\b1\s*l\b/gi, "4.2 cups");
  s = s.replace(/\b500\s*ml\b/gi, "2 cups");
  s = s.replace(/\b250\s*ml\b/gi, "1 cup");
  s = s.replace(/\b100\s*ml\b/gi, "0.4 cup");
  // Generic g -> oz
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*g\b/gi, (_, n) => {
    const val = parseFloat(n.replace(",",".")) / 28.35;
    return val >= 16 ? `${(val/16).toFixed(1)} lb` : `${val.toFixed(1)} oz`;
  });
  // Generic kg -> lb
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*kg\b/gi, (_, n) => {
    return `${(parseFloat(n.replace(",",".")) * 2.205).toFixed(1)} lb`;
  });
  // Generic ml -> cups
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*ml\b/gi, (_, n) => {
    const cups = parseFloat(n.replace(",",".")) / 236.6;
    return cups === 1 ? "1 cup" : `${cups.toFixed(1)} cups`;
  });
  // Generic l -> cups
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*l\b/gi, (_, n) => {
    const cups = parseFloat(n.replace(",",".")) * 4.227;
    return `${cups.toFixed(1)} cups`;
  });
  return s;
}

function convertToMetric(ingredientString) {
  if (!ingredientString || typeof ingredientString !== "string") return ingredientString;
  let s = ingredientString;
  // lb -> g/kg
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*(?:lbs?|pounds?)\b/gi, (_, n) => {
    const g = parseFloat(n.replace(",",".")) * 453.6;
    return g >= 1000 ? `${(g/1000).toFixed(1)} kg` : `${Math.round(g)} g`;
  });
  // oz -> g
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*oz\b/gi, (_, n) => {
    return `${Math.round(parseFloat(n.replace(",",".")) * 28.35)} g`;
  });
  // cups -> ml (volume)
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*cups?\b/gi, (_, n) => {
    const ml = parseFloat(n.replace(",",".")) * 236.6;
    return ml >= 1000 ? `${(ml/1000).toFixed(1)} l` : `${Math.round(ml)} ml`;
  });
  // tbsp -> ml
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*tbsp\b/gi, (_, n) => {
    return `${Math.round(parseFloat(n.replace(",",".")) * 14.79)} ml`;
  });
  // tsp -> ml
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*tsp\b/gi, (_, n) => {
    return `${(parseFloat(n.replace(",",".")) * 4.929).toFixed(1)} ml`;
  });
  // tablespoon(s) -> ml
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*tablespoons?\b/gi, (_, n) => {
    return `${Math.round(parseFloat(n.replace(",",".")) * 14.79)} ml`;
  });
  // teaspoon(s) -> ml
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*teaspoons?\b/gi, (_, n) => {
    return `${(parseFloat(n.replace(",",".")) * 4.929).toFixed(1)} ml`;
  });
  // pint(s) -> ml
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*pints?\b/gi, (_, n) => {
    return `${Math.round(parseFloat(n.replace(",",".")) * 473.2)} ml`;
  });
  // quart(s) -> l
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*quarts?\b/gi, (_, n) => {
    return `${(parseFloat(n.replace(",",".")) * 0.9464).toFixed(1)} l`;
  });
  // gallon(s) -> l
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*gallons?\b/gi, (_, n) => {
    return `${(parseFloat(n.replace(",",".")) * 3.785).toFixed(1)} l`;
  });
  // fl oz -> ml
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*fl\.?\s*oz\b/gi, (_, n) => {
    return `${Math.round(parseFloat(n.replace(",",".")) * 29.57)} ml`;
  });
  // stick(s) butter -> g (1 stick = 113g)
  s = s.replace(/\b(\d+(?:[.,]\d+)?)\s*sticks?\b/gi, (_, n) => {
    return `${Math.round(parseFloat(n.replace(",",".")) * 113)} g`;
  });
  return s;
}

function formatScaledNumber(n) {
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n - 0.25) < 0.01) return "¼";
  if (Math.abs(n - 0.5) < 0.01) return "½";
  if (Math.abs(n - 0.75) < 0.01) return "¾";
  if (Math.abs(n - 1/3) < 0.02) return "⅓";
  if (Math.abs(n - 2/3) < 0.02) return "⅔";
  const whole = Math.floor(n);
  const frac = n - whole;
  if (whole > 0 && Math.abs(frac - 0.5) < 0.01) return `${whole}½`;
  if (whole > 0 && Math.abs(frac - 0.25) < 0.01) return `${whole}¼`;
  if (whole > 0 && Math.abs(frac - 0.75) < 0.01) return `${whole}¾`;
  // Round to 1 decimal max
  const r = Math.round(n * 10) / 10;
  return r === Math.floor(r) ? String(Math.floor(r)) : r.toFixed(1);
}

function scaleIngredient(ingredientString, factor) {
  if (!ingredientString || typeof ingredientString !== "string" || factor === 1) return ingredientString;
  // Match leading number (with optional comma/dot decimal), or leading unicode fraction
  return ingredientString.replace(/^(\d+(?:[.,]\d+)?)\s*/, (match, num) => {
    const parsed = parseFloat(num.replace(",", "."));
    if (isNaN(parsed)) return match;
    return formatScaledNumber(parsed * factor) + " ";
  }).replace(new RegExp("^([" + FRACTION_CHARS.join("") + "])"), (match) => {
    const val = FRACTION_MAP[match];
    if (val === undefined) return match;
    return formatScaledNumber(val * factor);
  });
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  app:         { display:"flex", height:"100vh", overflow:"hidden", background:"linear-gradient(135deg, #e8e0d4 0%, #d4cfc6 50%, #c8c0b4 100%)" },
  sidebar:     { width:225, flexShrink:0, background:"rgba(28,26,20,0.75)", backdropFilter:"blur(40px) saturate(180%)", WebkitBackdropFilter:"blur(40px) saturate(180%)", color:"#F5F0E8", display:"flex", flexDirection:"column" },
  logo:        { fontFamily:"'Playfair Display',serif", fontSize:21, fontWeight:700, padding:"20px 18px 16px", borderBottom:"1px solid rgba(245,240,232,.15)" },
  navItem:     { display:"flex", alignItems:"center", gap:9, padding:"10px 18px", cursor:"pointer", fontSize:14, color:"rgba(245,240,232,.55)", borderLeft:"3px solid transparent", transition:"all .15s" },
  navActive:   { color:"#E8A838", borderLeftColor:"#E8A838", background:"rgba(232,168,56,.08)" },
  navSection:  { padding:"14px 18px 5px", fontSize:10, letterSpacing:"1.5px", textTransform:"uppercase", color:"rgba(245,240,232,.3)" },
  catItem:     { display:"flex", alignItems:"center", gap:8, padding:"7px 18px", cursor:"pointer", fontSize:13, transition:"color .15s" },
  sideBtn:     { display:"block", width:"calc(100% - 32px)", margin:"0 16px 6px", padding:"10px 0", borderRadius:12, border:"1px solid rgba(255,255,255,0.12)", cursor:"pointer", fontSize:13, fontWeight:500, background:"linear-gradient(180deg, rgba(220,95,60,0.85) 0%, rgba(180,60,35,0.9) 100%)", backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)", color:"#fff", boxShadow:"0 2px 8px rgba(200,75,47,0.25), inset 0 1px 0 rgba(255,255,255,0.2)", transition:"all .2s" },
  sideBtnGhost:{ background:"linear-gradient(180deg, rgba(245,240,232,0.12) 0%, rgba(245,240,232,0.06) 100%)", color:"rgba(245,240,232,.7)", border:"1px solid rgba(245,240,232,0.1)", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.06)" },
  providerPill:{ display:"flex", alignItems:"center", gap:6, background:"rgba(245,240,232,.08)", borderRadius:8, padding:"7px 14px", margin:"0 16px 6px", fontSize:12, color:"rgba(245,240,232,.6)", cursor:"pointer", border:"1px solid rgba(245,240,232,.1)", transition:"all .15s" },
  main:        { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  topbar:      { flexShrink:0, background:"rgba(245,240,232,0.6)", backdropFilter:"blur(30px) saturate(180%)", WebkitBackdropFilter:"blur(30px) saturate(180%)", borderBottom:"1px solid rgba(255,255,255,0.4)", padding:"12px 24px", display:"flex", alignItems:"center", gap:10 },
  topTitle:    { fontFamily:"'Playfair Display',serif", fontSize:22, flex:1 },
  searchBox:   { display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.45)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", border:"1px solid rgba(255,255,255,0.4)", borderRadius:10, padding:"7px 12px", flex:1, maxWidth:300 },
  content:     { flex:1, overflowY:"auto", padding:"24px 28px" },
  grid:        { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))", gap:16 },
  card:        { background:"rgba(255,255,255,0.45)", backdropFilter:"blur(40px) saturate(180%)", WebkitBackdropFilter:"blur(40px) saturate(180%)", border:"1px solid rgba(255,255,255,0.6)", borderRadius:16, overflow:"hidden", cursor:"pointer", transition:"transform .2s,box-shadow .2s,background .2s", boxShadow:"0 4px 30px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.5)", display:"flex", flexDirection:"column", position:"relative" },
  cardThumb:   { height:130, background:"linear-gradient(135deg,rgba(237,232,220,0.6),rgba(216,208,190,0.6))", display:"flex", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden" },
  catBadge:    { position:"absolute", top:8, left:8, background:"rgba(28,26,20,0.75)", backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)", color:"#E8A838", fontSize:10, padding:"2px 7px", borderRadius:4, fontWeight:500, zIndex:1 },
  cardBody:    { padding:"12px 14px 14px", flex:1, display:"flex", flexDirection:"column", gap:6 },
  cardTitle:   { fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:600, lineHeight:1.2 },
  cardMeta:    { display:"flex", gap:12, fontSize:12, color:"#888" },
  diffBadge:   { fontSize:11, padding:"2px 8px", borderRadius:4, fontWeight:500 },
  dFacile:     { background:"rgba(232,245,233,0.6)", color:"#2E7D32" },
  dMedia:      { background:"rgba(255,243,224,0.6)", color:"#E65100" },
  dDifficile:  { background:"rgba(255,235,238,0.6)", color:"#C62828" },
  iconBtn:     { background:"none", border:"none", cursor:"pointer", fontSize:16, padding:"4px 6px", borderRadius:8, transition:"all .15s" },
  selCircle:   { position:"absolute", top:8, right:8, width:24, height:24, borderRadius:"50%", border:"2px solid rgba(255,255,255,.9)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2, transition:"all .15s" },
  empty:       { textAlign:"center", padding:"70px 20px", color:"#888" },
  detail:      { padding:"28px 32px", maxWidth:820, overflowY:"auto", height:"100%" },
  detailTitle: { fontFamily:"'Playfair Display',serif", fontSize:32, fontWeight:700, lineHeight:1.15, marginBottom:14 },
  badges:      { display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 },
  badge:       { background:"rgba(237,232,220,0.5)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:20, padding:"4px 12px", fontSize:13, color:"#555" },
  tag:         { background:"rgba(237,232,220,0.5)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:4, padding:"2px 8px", fontSize:12, color:"#777" },
  detailGrid:  { display:"grid", gridTemplateColumns:"1fr 2fr", gap:24, marginBottom:16 },
  secTitle:    { fontFamily:"'Playfair Display',serif", fontSize:18, marginBottom:12 },
  ingItem:     { padding:"7px 0", borderBottom:"1px solid rgba(237,232,220,0.5)", fontSize:14, display:"flex", alignItems:"center", gap:8 },
  ingDot:      { width:5, height:5, borderRadius:"50%", background:"#C84B2F", flexShrink:0, display:"inline-block" },
  stepItem:    { display:"flex", gap:12, marginBottom:14 },
  stepNum:     { width:26, height:26, borderRadius:"50%", background:"rgba(200,75,47,0.85)", color:"#fff", fontSize:12, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 },
  noteBox:     { background:"rgba(255,248,236,0.6)", border:"1px solid rgba(240,216,154,0.5)", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#7A5C00", marginTop:16, backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)" },
  sourceLink:  { fontSize:13, color:"#C84B2F", textDecoration:"none" },
  backBtn:     { background:"none", border:"none", cursor:"pointer", color:"#888", fontSize:14, fontWeight:500, padding:"6px 10px 6px 0" },
  listCard:    { background:"rgba(255,255,255,0.45)", backdropFilter:"blur(40px) saturate(180%)", WebkitBackdropFilter:"blur(40px) saturate(180%)", border:"1px solid rgba(255,255,255,0.6)", borderRadius:16, marginBottom:14, overflow:"hidden", boxShadow:"0 4px 30px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.5)" },
  listHeader:  { padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" },
  repartoT:    { fontSize:10, textTransform:"uppercase", letterSpacing:"1px", color:"#999", margin:"12px 0 4px" },
  listItem:    { display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:"1px solid rgba(237,232,220,0.5)", fontSize:14 },
  listCheck:   { width:20, height:20, borderRadius:5, border:"1.5px solid #D0C8B8", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all .1s" },
  overlay:     { position:"fixed", inset:0, background:"rgba(28,26,20,0.3)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 },
  modal:       { background:"rgba(253,250,244,0.72)", backdropFilter:"blur(60px) saturate(200%)", WebkitBackdropFilter:"blur(60px) saturate(200%)", borderRadius:20, padding:28, width:560, maxWidth:"95vw", maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(28,26,20,.25), inset 0 1px 0 rgba(255,255,255,0.5)", border:"1px solid rgba(255,255,255,0.4)" },
  modalTitle:  { fontFamily:"'Playfair Display',serif", fontSize:22, marginBottom:16 },
  label:       { display:"block", fontSize:11, fontWeight:600, color:"#999", marginBottom:5, textTransform:"uppercase", letterSpacing:".5px" },
  input:       { width:"100%", padding:"10px 13px", border:"1px solid rgba(255,255,255,0.4)", borderRadius:12, fontSize:14, background:"rgba(255,255,255,0.35)", backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)", color:"#1C1A14", outline:"none", boxShadow:"inset 0 1px 3px rgba(0,0,0,0.05), 0 1px 0 rgba(255,255,255,0.4)", transition:"border-color .2s" },
  errMsg:      { color:"#C84B2F", fontSize:13, marginTop:8 },
  btnPrimary:  { display:"inline-flex", alignItems:"center", gap:6, padding:"10px 20px", borderRadius:14, background:"linear-gradient(180deg, rgba(220,95,60,0.9) 0%, rgba(180,60,35,0.95) 100%)", backdropFilter:"blur(12px) saturate(180%)", WebkitBackdropFilter:"blur(12px) saturate(180%)", color:"#fff", border:"1px solid rgba(255,255,255,0.25)", cursor:"pointer", fontSize:14, fontWeight:500, boxShadow:"0 2px 8px rgba(200,75,47,0.3), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.1)", transition:"all .2s" },
  btnSecondary:{ display:"inline-flex", alignItems:"center", gap:6, padding:"10px 16px", borderRadius:14, background:"linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(245,240,232,0.45) 100%)", color:"#1C1A14", border:"1px solid rgba(255,255,255,0.5)", cursor:"pointer", fontSize:14, backdropFilter:"blur(16px) saturate(180%)", WebkitBackdropFilter:"blur(16px) saturate(180%)", boxShadow:"0 1px 6px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(0,0,0,0.04)", transition:"all .2s" },
  selBar:      { display:"flex", alignItems:"center", gap:12, background:"rgba(28,26,20,0.75)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", color:"#F5F0E8", padding:"10px 16px", borderRadius:10, marginBottom:16, fontSize:13 },
  loadOverlay: { position:"fixed", inset:0, background:"rgba(28,26,20,0.3)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 },
  loadBox:     { background:"rgba(253,250,244,0.72)", backdropFilter:"blur(60px) saturate(200%)", WebkitBackdropFilter:"blur(60px) saturate(200%)", borderRadius:16, padding:"32px 40px", textAlign:"center", boxShadow:"0 20px 60px rgba(0,0,0,.15), inset 0 1px 0 rgba(255,255,255,0.5)", border:"1px solid rgba(255,255,255,0.4)" },
  spinner:     { width:36, height:36, border:"3px solid rgba(224,216,200,0.5)", borderTopColor:"#C84B2F", borderRadius:"50%", animation:"spin .7s linear infinite", margin:"0 auto 16px" },
  // Provider switch
  switchRow:   { display:"flex", background:"rgba(237,232,220,0.4)", backdropFilter:"blur(20px) saturate(180%)", WebkitBackdropFilter:"blur(20px) saturate(180%)", borderRadius:14, padding:3, marginBottom:20, border:"1px solid rgba(255,255,255,0.35)", boxShadow:"inset 0 1px 3px rgba(0,0,0,0.06)" },
  switchOpt:   { flex:1, padding:"9px 0", textAlign:"center", borderRadius:11, fontSize:14, fontWeight:500, cursor:"pointer", transition:"all .25s ease", border:"none" },
  switchActive:{ background:"linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.5) 100%)", boxShadow:"0 2px 8px rgba(28,26,20,.1), inset 0 1px 0 rgba(255,255,255,0.7)", color:"#1C1A14" },
  switchInact: { background:"transparent", color:"#999" },
  // Setup
  setupWrap:   { display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"linear-gradient(135deg, #e8e0d4 0%, #d4cfc6 50%, #c8c0b4 100%)" },
  setupBox:    { background:"rgba(253,250,244,0.72)", backdropFilter:"blur(60px) saturate(200%)", WebkitBackdropFilter:"blur(60px) saturate(200%)", borderRadius:24, padding:48, width:520, boxShadow:"0 20px 60px rgba(28,26,20,.12), inset 0 1px 0 rgba(255,255,255,0.5)", border:"1px solid rgba(255,255,255,0.4)", textAlign:"center" },
  setupLogo:   { fontFamily:"'Playfair Display',serif", fontSize:36, fontWeight:700, marginBottom:8 },
};

// ─── Setup / Onboarding ───────────────────────────────────────────────────────
function SetupScreen({ onSave }) {
  const [provider, setProvider] = useState("claude");
  const [apiKey, setApiKey]     = useState("");
  const [model, setModel]       = useState(AI_PROVIDERS.claude.defaultModel);
  const [err, setErr]           = useState("");
  const [testing, setTesting]   = useState(false);
  const prov = AI_PROVIDERS[provider];

  const switchProvider = p => { setProvider(p); setApiKey(""); setModel(AI_PROVIDERS[p].defaultModel); setErr(""); };

  const save = async () => {
    if (!apiKey.trim()) { setErr("Inserisci la chiave API"); return; }
    setTesting(true); setErr("");
    try {
      const ok = await testApiKey(provider, apiKey.trim());
      if (ok) onSave({ provider, apiKey: apiKey.trim(), model });
      else setErr("Chiave non valida o errore di connessione");
    } catch (e) { setErr("Errore: " + e.message); }
    setTesting(false);
  };

  return (
    <div style={S.setupWrap}>
      <div style={S.setupBox}>
        <div style={S.setupLogo}>Recipe<span style={{ color:"#E8A838" }}>Vault</span></div>
        <p style={{ color:"#888", marginBottom:28, fontSize:15, lineHeight:1.6 }}>
          Scegli il provider AI e inserisci la tua chiave per abilitare l'import intelligente da qualsiasi fonte.
        </p>

        {/* Provider switch */}
        <div style={{ ...S.switchRow, marginBottom:24 }}>
          {Object.entries(AI_PROVIDERS).map(([key, p]) => (
            <button key={key} style={{ ...S.switchOpt, ...(provider===key ? S.switchActive : S.switchInact) }}
              onClick={() => switchProvider(key)}>
              {p.icon} {p.name}
            </button>
          ))}
        </div>

        <div style={{ textAlign:"left" }}>
          <div style={{ marginBottom:14 }}>
            <label style={S.label}>API Key — {prov.name}</label>
            <input style={{ ...S.input, fontFamily:"monospace", letterSpacing:".5px" }}
              type="password" placeholder={prov.keyPlaceholder}
              value={apiKey} onChange={e => { setApiKey(e.target.value); setErr(""); }}
              onKeyDown={e => e.key === "Enter" && save()}/>
            <p style={{ fontSize:12, color:"#aaa", marginTop:5 }}>
              Ottienila su <a href={prov.keyHintUrl} target="_blank" rel="noreferrer" style={{ color:"#C84B2F" }}>{prov.keyHint}</a>
            </p>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={S.label}>Modello</label>
            <select style={S.input} value={model} onChange={e => setModel(e.target.value)}>
              {prov.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {err && <div style={{ ...S.errMsg, marginBottom:12 }}>{err}</div>}
        <button style={{ ...S.btnPrimary, width:"100%", justifyContent:"center", padding:"12px" }} onClick={save} disabled={testing}>
          {testing ? "Verifico connessione…" : "Salva e avvia RecipeVault →"}
        </button>
        <p style={{ fontSize:12, color:"#aaa", marginTop:18, lineHeight:1.6 }}>
          La chiave viene salvata solo localmente su questo Mac, mai inviata altrove.
        </p>
      </div>
    </div>
  );
}

// ─── Settings Modal ───────────────────────────────────────────────────────────
function SettingsModal({ config, onSave, onClose, onExport, onImport }) {
  const [provider, setProvider] = useState(config.provider);
  const [apiKey, setApiKey]     = useState(config.apiKey);
  const [model, setModel]       = useState(config.model);
  const [testing, setTesting]   = useState(false);
  const [status, setStatus]     = useState(null); // null | "ok" | "err"
  const [err, setErr]           = useState("");
  const prov = AI_PROVIDERS[provider];

  const switchProvider = p => { setProvider(p); setApiKey(""); setModel(AI_PROVIDERS[p].defaultModel); setStatus(null); setErr(""); };

  const testAndSave = async () => {
    if (!apiKey.trim()) { setErr("Inserisci la chiave"); return; }
    setTesting(true); setErr(""); setStatus(null);
    try {
      const ok = await testApiKey(provider, apiKey.trim());
      if (ok) { setStatus("ok"); onSave({ provider, apiKey: apiKey.trim(), model }); }
      else { setStatus("err"); setErr("Chiave non valida"); }
    } catch(e) { setStatus("err"); setErr(e.message); }
    setTesting(false);
  };

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <h2 style={S.modalTitle}>⚙️ Impostazioni AI</h2>

        {/* Provider switch */}
        <div style={S.switchRow}>
          {Object.entries(AI_PROVIDERS).map(([key, p]) => (
            <button key={key} style={{ ...S.switchOpt, ...(provider===key ? S.switchActive : S.switchInact) }}
              onClick={() => switchProvider(key)}>
              {p.icon} {p.name}
            </button>
          ))}
        </div>

        <div style={{ marginBottom:14 }}>
          <label style={S.label}>API Key — {prov.name}</label>
          <input style={{ ...S.input, fontFamily:"monospace" }} type="password"
            placeholder={prov.keyPlaceholder} value={apiKey}
            onChange={e => { setApiKey(e.target.value); setStatus(null); setErr(""); }}/>
          <p style={{ fontSize:12, color:"#aaa", marginTop:4 }}>
            <a href={prov.keyHintUrl} target="_blank" rel="noreferrer" style={{ color:"#C84B2F" }}>{prov.keyHint}</a>
            {" "}· La chiave è salvata solo localmente.
          </p>
        </div>

        <div style={{ marginBottom:20 }}>
          <label style={S.label}>Modello</label>
          <select style={S.input} value={model} onChange={e => setModel(e.target.value)}>
            {prov.models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {provider === "openai" && (
            <p style={{ fontSize:12, color:"#aaa", marginTop:4 }}>
              💡 Per l'import da URL viene usato automaticamente <strong>gpt-4o-search-preview</strong> (web search integrata).
            </p>
          )}
          {provider === "claude" && (
            <p style={{ fontSize:12, color:"#aaa", marginTop:4 }}>
              💡 Il modello selezionato viene usato con <strong>web_search</strong> integrato per l'import da URL.
            </p>
          )}
        </div>

        {status === "ok" && <div style={{ color:"#2E7D32", fontSize:13, marginBottom:10 }}>✅ Connessione verificata — impostazioni salvate</div>}
        {err && <div style={S.errMsg}>{err}</div>}

        <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginBottom:20 }}>
          <button style={S.btnSecondary} onClick={onClose}>Chiudi</button>
          <button style={S.btnPrimary} onClick={testAndSave} disabled={testing}>
            {testing ? "Verifico…" : "Verifica e Salva"}
          </button>
        </div>

        <div style={{ borderTop:"1px solid #E0D8C8", paddingTop:16 }}>
          <div style={S.label}>Backup dati</div>
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            <button style={S.btnSecondary} onClick={onExport}>⬆️ Esporta JSON</button>
            <button style={S.btnSecondary} onClick={onImport}>⬇️ Importa JSON</button>
          </div>
          <p style={{ fontSize:12, color:"#aaa", marginTop:8 }}>Esporta le ricette come backup o per spostarle su un altro dispositivo.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [aiPrefs, setAiPrefs] = useState(loadInitialAiPrefs);
  const [recipes, setRecipes] = useState(() => {
    const raw = ls.get("rv_recipes", []);
    const migrationKey = "rv_ingredient_fix_v1";
    const alreadyMigrated = ls.get(migrationKey, false);
    const normalized = normalizeRecipeCollection(raw);
    if (alreadyMigrated) return normalized;
    // One-time recovery: re-extract ingredients from devData.parsedRecipe
    // to restore quantities stripped by the old stripListPrefix regex
    let changed = false;
    const recovered = normalized.map(r => {
      const orig = r.devData?.parsedRecipe;
      if (!orig) return r;
      const fresh = normalizeRecipeStructure({ ...r, ingredienti: orig.ingredienti, preparazioni: orig.preparazioni || orig.sezioni });
      if (JSON.stringify(fresh.ingredienti) !== JSON.stringify(r.ingredienti)) {
        changed = true;
        return { ...r, ingredienti: fresh.ingredienti, preparazioni: fresh.preparazioni, procedimento: fresh.procedimento };
      }
      return r;
    });
    ls.set(migrationKey, true);
    if (changed) ls.set("rv_recipes", recovered);
    return changed ? recovered : normalized;
  });
  const [lists, setLists]     = useState(() => ls.get("rv_lists", []));
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [view, setView]       = useState("home");
  const [activeRec, setActiveRec] = useState(null);
  const [cat, setCat]         = useState("Tutte");
  const [q, setQ]             = useState("");
  const [ingredientFilter, setIngredientFilter] = useState("");
  const [aiSearchQuery, setAiSearchQuery] = useState("");
  const [aiSearchResultIds, setAiSearchResultIds] = useState(null);
  const [aiSearchReason, setAiSearchReason] = useState("");
  const [aiSearching, setAiSearching] = useState(false);
  const [modal, setModal]     = useState(null);
  const [importMode, setImportMode] = useState("url");
  const [url, setUrl]         = useState("");
  const [caption, setCaption] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [photoFileName, setPhotoFileName] = useState("");
  const [photoNote, setPhotoNote] = useState("");
  const [photoType, setPhotoType] = useState("dish");
  const [socialPreview, setSocialPreview] = useState(null);
  const [fetchingSocialPreview, setFetchingSocialPreview] = useState(false);
  const [socialPreviewPending, setSocialPreviewPending] = useState(false);
  const [importProvider, setImportProvider] = useState(() => getAiConfig(loadInitialAiPrefs()).provider);
  const [importApiKey, setImportApiKey] = useState(() => getAiConfig(loadInitialAiPrefs()).apiKey);
  const [importModel, setImportModel] = useState(() => getAiConfig(loadInitialAiPrefs()).model);
  const [importLocalModelPath, setImportLocalModelPath] = useState(() => getAiConfig(loadInitialAiPrefs()).localModelPath);
  const [importLocalRuntimePath, setImportLocalRuntimePath] = useState(() => getAiConfig(loadInitialAiPrefs()).localRuntimePath);
  const [importVisionModelPath, setImportVisionModelPath] = useState(() => getAiConfig(loadInitialAiPrefs()).visionModelPath);
  const [sharedImageGenModelPath, setSharedImageGenModelPath] = useState(() => getSharedImageGenerationConfig(loadInitialAiPrefs()).modelPath);
  const [sharedImageGenRuntimePath, setSharedImageGenRuntimePath] = useState(() => getSharedImageGenerationConfig(loadInitialAiPrefs()).runtimePath);
  const [aiConfigReturnMode, setAiConfigReturnMode] = useState(null);
  const [aiConfigTab, setAiConfigTab] = useState("settings");
  const [testingImportKey, setTestingImportKey] = useState(false);
  const [importKeyStatus, setImportKeyStatus] = useState(null);
  const [localDownloadId, setLocalDownloadId] = useState(null);
  const [localDownloadStatus, setLocalDownloadStatus] = useState(null);
  const [visionSize, setVisionSize] = useState(() => ls.get("rv_settings", {}).visionSize ?? "3b");
  const [visionDownloadPhase, setVisionDownloadPhase] = useState(null);
  const [visionDownloadId, setVisionDownloadId] = useState(null);
  const [visionDownloadStatus, setVisionDownloadStatus] = useState(null);
  const [imageGenDownloadId, setImageGenDownloadId] = useState(null);
  const [imageGenDownloadStatus, setImageGenDownloadStatus] = useState(null);
  const [whisperDownloadId, setWhisperDownloadId] = useState(null);
  const [whisperDownloadStatus, setWhisperDownloadStatus] = useState(null);
  const [runtimeStatus, setRuntimeStatus] = useState(null);
  const [checkingRuntime, setCheckingRuntime] = useState(false);
  const [copiedInstallCmd, setCopiedInstallCmd] = useState(false);
  const [androidBundledModelStatus, setAndroidBundledModelStatus] = useState(null);
  const [checkingAndroidBundledModel, setCheckingAndroidBundledModel] = useState(false);
  const [modelStorageStatus, setModelStorageStatus] = useState(null);
  const [loadingModelStorage, setLoadingModelStorage] = useState(false);
  const [cleaningModelStorage, setCleaningModelStorage] = useState(false);
  const [modelStorageMessage, setModelStorageMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingContext, setLoadingContext] = useState(null);
  const [loadMsg, setLoadMsg] = useState("");
  const [err, setErr]         = useState("");
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [recipePickerDialog, setRecipePickerDialog] = useState(null); // { recipes, debugData, photoPreview, onPick }
  const [selMode, setSelMode] = useState(false);
  const [sel, setSel]         = useState([]);
  const [listName, setListName] = useState("");
  const [openList, setOpenList] = useState(null);
  const [favOnly, setFavOnly] = useState(false);
  const [manual, setManual]   = useState(createEmptyRecipeDraft);
  const [editRec, setEditRec] = useState(null);
  const [devModeOpen, setDevModeOpen] = useState(false);
  const [useImperial, setUseImperial] = useState(() => (ls.get("rv_settings", {}).useImperial ?? false));
  const [scaleFactor, setScaleFactor] = useState(1);
  const activeImportRequestRef = useRef(0);
  const cancelledImportRequestRef = useRef(null);
  const loadMsgTimeoutRef = useRef(null);

  const toggleImperial = () => {
    setUseImperial(prev => {
      const next = !prev;
      const settings = ls.get("rv_settings", {});
      ls.set("rv_settings", { ...settings, useImperial: next });
      return next;
    });
  };

  const saveAiPrefs = nextPrefs => {
    setAiPrefs(nextPrefs);
    ls.set("rv_ai_prefs", nextPrefs);
    ls.set("rv_config", getAiConfig(nextPrefs));
  };
  const updateAiPrefs = updater => {
    setAiPrefs(prevPrefs => {
      const nextPrefs = updater(prevPrefs);
      ls.set("rv_ai_prefs", nextPrefs);
      ls.set("rv_config", getAiConfig(nextPrefs));
      return nextPrefs;
    });
  };
  const persist    = useCallback(r => {
    const normalizedRecipes = normalizeRecipeCollection(r);
    setRecipes(normalizedRecipes);
    ls.set("rv_recipes", normalizedRecipes);
  }, []);
  const persistL   = useCallback(l => { setLists(l);   ls.set("rv_lists", l);   }, []);
  const defaultImportProviderKey = getImportProvider(aiPrefs);
  const defaultImportAiConfig = getAiConfig(aiPrefs, defaultImportProviderKey);
  const searchProviderKey = getSearchProvider(aiPrefs);
  const searchAiConfig = getAiConfig(aiPrefs, searchProviderKey);
  const activeProvider = AI_PROVIDERS[searchAiConfig.provider];
  const activeAiReady = isProviderConfigured(searchAiConfig);
  const isAndroidShell = typeof window.AndroidBridge?.invoke === "function";
  const isCompactUi = isAndroidShell || viewportWidth <= 920;
  const pageTitle = view==="home" ? (cat==="Tutte" ? "Tutte le ricette" : cat) : "Liste della spesa";
  const hasRecipeFilters = Boolean(
    aiSearchResultIds !== null ||
    ingredientFilter ||
    q.trim() ||
    favOnly ||
    cat !== "Tutte"
  );
  const ingredientSourceRecipes = recipes.filter(r => {
    if (favOnly && !r.fav) return false;
    if (cat !== "Tutte" && r.categoria !== cat) return false;
    return true;
  });
  const ingredientCatalog = buildIngredientCatalog(ingredientSourceRecipes);
  const globalIngredientCatalog = buildIngredientCatalog(recipes);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => () => {
    if (loadMsgTimeoutRef.current) {
      window.clearTimeout(loadMsgTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!activeRec) setDevModeOpen(false);
    setScaleFactor(1);
  }, [activeRec]);

  useEffect(() => {
    if (!localDownloadId) return undefined;

    let cancelled = false;
    let timeoutId = null;

    const poll = async () => {
      try {
        const status = await getLocalModelDownloadStatus(localDownloadId);
        if (cancelled) return;

        setLocalDownloadStatus(status);

        if (status.state === "completed") {
          if (status.path) {
            setImportLocalModelPath(status.path);
            updateAiPrefs(prevPrefs => ({
              ...prevPrefs,
              providers: {
                ...prevPrefs.providers,
                local: {
                  ...prevPrefs.providers.local,
                  model: importModel,
                  localModelPath: status.path,
                  localRuntimePath: importLocalRuntimePath.trim() || "@auto",
                },
              },
            }));
          }
          setImportKeyStatus("ok");
          setLocalDownloadId(null);
          return;
        }

        if (status.state === "error") {
          setImportKeyStatus("err");
          setErr(`Errore download modello: ${status.error || "errore sconosciuto"}`);
          setLocalDownloadId(null);
          return;
        }

        timeoutId = window.setTimeout(poll, 500);
      } catch (error) {
        if (cancelled) return;
        setImportKeyStatus("err");
        setErr(`Errore monitorando il download: ${error.message}`);
        setLocalDownloadId(null);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [localDownloadId, importLocalRuntimePath, importModel]);

  useEffect(() => {
    if (!visionDownloadId) return undefined;
    let cancelled = false;
    let timeoutId = null;
    const poll = async () => {
      try {
        const status = await getLocalModelDownloadStatus(visionDownloadId);
        if (cancelled) return;
        setVisionDownloadStatus(status);

        if (status.state === "completed") {
          if (visionDownloadPhase === "model") {
            const modelDir = status.path.substring(0, status.path.lastIndexOf("/") + 1);
            setImportVisionModelPath(status.path);
            const visionPreset = LOCAL_MODEL_DOWNLOADS.vision[visionSize] || LOCAL_MODEL_DOWNLOADS.vision["3b"];
            const mmproj = visionPreset.mmproj;
            try {
              const mmId = await startLocalModelDownload({ url: mmproj.url, fileName: mmproj.fileName });
              setVisionDownloadPhase("mmproj");
              setVisionDownloadId(mmId);
              setVisionDownloadStatus({ state: "starting", downloadedBytes: 0, totalBytes: null, path: "", error: "" });
            } catch (e2) {
              setErr("Errore avviando download mmproj: " + e2.message);
              setVisionDownloadId(null);
            }
          } else {
            updateAiPrefs(prevPrefs => ({
              ...prevPrefs,
              visionModelPath: importVisionModelPath,
              providers: {
                ...prevPrefs.providers,
                local: { ...prevPrefs.providers.local, visionModelPath: importVisionModelPath },
              },
            }));
            setVisionDownloadId(null);
            setVisionDownloadPhase(null);
          }
          return;
        }

        if (status.state === "error") {
          setErr(`Errore download vision ${visionDownloadPhase}: ${status.error || "errore sconosciuto"}`);
          setVisionDownloadId(null);
          setVisionDownloadPhase(null);
          return;
        }

        timeoutId = window.setTimeout(poll, 500);
      } catch (e) {
        if (cancelled) return;
        setErr(`Errore monitorando download vision: ${e.message}`);
        setVisionDownloadId(null);
        setVisionDownloadPhase(null);
      }
    };
    poll();
    return () => { cancelled = true; if (timeoutId) window.clearTimeout(timeoutId); };
  }, [visionDownloadId, visionDownloadPhase, importVisionModelPath]);

  useEffect(() => {
    if (!imageGenDownloadId) return undefined;
    let cancelled = false;
    let timeoutId = null;

    const poll = async () => {
      try {
        const status = await getLocalModelDownloadStatus(imageGenDownloadId);
        if (cancelled) return;
        setImageGenDownloadStatus(status);

        if (status.state === "completed") {
          if (status.path) {
            setSharedImageGenModelPath(status.path);
            updateAiPrefs(prevPrefs => ({
              ...prevPrefs,
              imageGenModelPath: status.path,
            }));
          }
          setImageGenDownloadId(null);
          return;
        }

        if (status.state === "error") {
          setErr(`Errore download modello immagini: ${status.error || "errore sconosciuto"}`);
          setImageGenDownloadId(null);
          return;
        }

        timeoutId = window.setTimeout(poll, 500);
      } catch (error) {
        if (cancelled) return;
        setErr(`Errore monitorando download immagini: ${error.message}`);
        setImageGenDownloadId(null);
      }
    };

    poll();
    return () => { cancelled = true; if (timeoutId) window.clearTimeout(timeoutId); };
  }, [imageGenDownloadId]);

  useEffect(() => {
    if (!whisperDownloadId) return undefined;
    let cancelled = false;
    let timeoutId = null;
    const poll = async () => {
      try {
        const status = await getLocalModelDownloadStatus(whisperDownloadId);
        if (cancelled) return;
        setWhisperDownloadStatus(status);
        if (status.state === "completed" || status.state === "error") {
          setWhisperDownloadId(null);
          if (status.state === "error") setErr(`Errore download whisper: ${status.error || "errore sconosciuto"}`);
          return;
        }
        timeoutId = window.setTimeout(poll, 500);
      } catch (e) {
        if (cancelled) return;
        setErr(`Errore monitorando download whisper: ${e.message}`);
        setWhisperDownloadId(null);
      }
    };
    poll();
    return () => { cancelled = true; if (timeoutId) window.clearTimeout(timeoutId); };
  }, [whisperDownloadId]);

  useEffect(() => {
    if (isAndroidShell || modal !== "import" || importProvider !== "local") return;
    detectDesktopRuntime({ runtimePath: importLocalRuntimePath, applyResolvedPath: true });
  }, [isAndroidShell, modal, importProvider]);

  useEffect(() => {
    if (!isAndroidShell || modal !== "import" || importProvider !== "local") return;
    detectAndroidBundledModel({ applyDefault: true });
  }, [isAndroidShell, modal, importProvider, importModel]);

  useEffect(() => {
    if (modal !== "ai-config" || aiConfigTab !== "storage") return;
    refreshModelStorage();
  }, [modal, aiConfigTab, aiPrefs, isAndroidShell]);

  useEffect(() => {
    if (!url || modal !== "import") {
      setSocialPreviewPending(false);
      return;
    }
    const src = detectSource(url);
    if (!["tiktok", "instagram", "facebook"].includes(src)) {
      if (socialPreview) setSocialPreview(null);
      setSocialPreviewPending(false);
      return;
    }
    setSocialPreviewPending(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      setFetchingSocialPreview(true);
      try {
        const result = await fetchSocialPreview(url);
        if (cancelled) return;
        if (result?.found) {
          setSocialPreview(result);
          if (result.description && !caption) setCaption(result.description);
        } else {
          setSocialPreview(null);
        }
      } catch {
        if (!cancelled) setSocialPreview(null);
      } finally {
        if (!cancelled) {
          setFetchingSocialPreview(false);
          setSocialPreviewPending(false);
        }
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [url, modal]);

  const resetImportDraft = () => {
    setUrl("");
    setCaption("");
    setPhotoDataUrl("");
    setPhotoFileName("");
    setPhotoNote("");
    setPhotoType("dish");
    setSocialPreview(null);
    setFetchingSocialPreview(false);
    setSocialPreviewPending(false);
    setErr("");
  };

  const loadProviderDraft = providerKey => {
    const nextConfig = getAiConfig(aiPrefs, providerKey);
    setImportProvider(providerKey);
    setImportApiKey(nextConfig.apiKey);
    setImportModel(nextConfig.model);
    setImportLocalModelPath(nextConfig.localModelPath);
    setImportLocalRuntimePath(nextConfig.localRuntimePath);
    // Shared components live at root level and are reloaded when the config panel opens.
    setImportVisionModelPath(aiPrefs?.visionModelPath ?? "");
    setSharedImageGenModelPath(aiPrefs?.imageGenModelPath ?? "");
    setSharedImageGenRuntimePath(normalizeImageGenRuntimePath(aiPrefs?.imageGenRuntimePath));
    setLocalDownloadId(null);
    setLocalDownloadStatus(null);
    setVisionDownloadId(null);
    setVisionDownloadStatus(null);
    setVisionDownloadPhase(null);
    setImageGenDownloadId(null);
    setImageGenDownloadStatus(null);
    setWhisperDownloadId(null);
    setWhisperDownloadStatus(null);
    setRuntimeStatus(null);
    setCopiedInstallCmd(false);
    setAndroidBundledModelStatus(null);
    setImportKeyStatus(null);
    setErr("");
  };

  const openAiConfigModal = ({ provider = importProvider, returnMode = null } = {}) => {
    loadProviderDraft(provider);
    setAiConfigReturnMode(returnMode);
    setAiConfigTab("settings");
    setModelStorageMessage("");
    setModal("ai-config");
  };

  const closeAiConfigModal = () => {
    const returnMode = aiConfigReturnMode;
    setAiConfigReturnMode(null);
    setErr("");
    setModal(returnMode === "import" ? "import" : null);
  };

  const showAllRecipes = () => {
    clearAiRecipeSearch();
    setAiSearchQuery("");
    setIngredientFilter("");
    setQ("");
    setFavOnly(false);
    setCat("Tutte");
    setSelMode(false);
    setSel([]);
    setView("home");
  };

  const openImportModal = (mode = "url") => {
    const importConfig = defaultImportAiConfig;
    setImportMode(mode);
    loadProviderDraft(importConfig.provider);
    setAiConfigReturnMode(null);
    resetImportDraft();
    setModal("import");
  };

  const openPhotoModal = () => openImportModal("photo");

  const openAddRecipeModal = () => {
    setErr("");
    setModal(isCompactUi ? "quickAdd" : "import");
  };

  const switchImportProvider = nextProvider => {
    loadProviderDraft(nextProvider);
    setSocialPreviewPending(false);
  };

  const detectDesktopRuntime = async ({ runtimePath = importLocalRuntimePath, applyResolvedPath = false } = {}) => {
    if (isAndroidShell || importProvider !== "local") return;

    setCheckingRuntime(true);
    try {
      const status = await getLocalRuntimeStatus(normalizeLocalRuntimePath(runtimePath));
      setRuntimeStatus(status);
      if (applyResolvedPath && status?.found && status.resolvedPath) {
        setImportLocalRuntimePath(status.source === "bundled" ? "@bundled" : status.resolvedPath);
      }
    } catch (error) {
      setRuntimeStatus({
        found: false,
        resolvedPath: "",
        version: "",
        brewAvailable: false,
        suggestedCommand: "brew install llama.cpp",
        error: error.message,
      });
    } finally {
      setCheckingRuntime(false);
    }
  };

  const copyInstallCommand = async command => {
    try {
      await copyToClipboard(command);
      setCopiedInstallCmd(true);
      window.setTimeout(() => setCopiedInstallCmd(false), 1800);
    } catch (error) {
      setErr(`Impossibile copiare il comando: ${error.message}`);
    }
  };

  const detectAndroidBundledModel = async ({ applyDefault = false } = {}) => {
    if (!isAndroidShell || importProvider !== "local") return;

    setCheckingAndroidBundledModel(true);
    try {
      const status = await getLocalAndroidModelStatus(importModel);
      setAndroidBundledModelStatus(status);
      if (applyDefault && status?.found && !importLocalModelPath.trim()) {
        setImportLocalModelPath("@bundled");
      }
    } catch (error) {
      setAndroidBundledModelStatus({
        found: false,
        assetPath: "",
        resolvedPath: "",
        error: error.message,
      });
    } finally {
      setCheckingAndroidBundledModel(false);
    }
  };

  const buildModelStoragePayload = async () => {
    const activePaths = new Set();
    const activeVisionModelPaths = new Set();
    const addPath = value => {
      const trimmed = String(value || "").trim();
      if (!trimmed || trimmed.startsWith("@") || trimmed.startsWith("asset://")) return;
      activePaths.add(trimmed);
    };

    const localPrefs = aiPrefs?.providers?.local ?? {};
    addPath(localPrefs.localModelPath);

    const visionPath = String(aiPrefs?.visionModelPath || "").trim();
    if (visionPath && !visionPath.startsWith("@") && !visionPath.startsWith("asset://")) {
      activePaths.add(visionPath);
      activeVisionModelPaths.add(visionPath);
    }

    addPath(aiPrefs?.imageGenModelPath);

    if (isAndroidShell && String(localPrefs.localModelPath || "").trim() === "@bundled") {
      try {
        const bundledStatus = await getLocalAndroidModelStatus(localPrefs.model || "");
        if (bundledStatus?.found && bundledStatus?.resolvedPath) {
          activePaths.add(String(bundledStatus.resolvedPath).trim());
        }
      } catch {
        // Ignore bundled resolution errors here; storage scan still works.
      }
    }

    return {
      activePaths: [...activePaths],
      activeVisionModelPaths: [...activeVisionModelPaths],
    };
  };

  const refreshModelStorage = async () => {
    setLoadingModelStorage(true);
    setModelStorageMessage("");
    try {
      const payload = await buildModelStoragePayload();
      const status = await getModelStorageStatus(payload.activePaths, payload.activeVisionModelPaths);
      setModelStorageStatus(status);
    } catch (error) {
      setErr(`Impossibile leggere lo spazio modelli: ${getErrorMessage(error)}`);
    } finally {
      setLoadingModelStorage(false);
    }
  };

  const requestCleanUnusedModels = () => {
    const inactiveFiles = modelStorageStatus?.files?.filter(file => !file.isActive) ?? [];
    if (!inactiveFiles.length) {
      setModelStorageMessage("Nessun modello non usato da pulire.");
      return;
    }

    setConfirmDialog({
      message: `Pulire ${inactiveFiles.length} modello/i non usato/i e liberare ${formatStorageSize(modelStorageStatus.inactiveBytes || 0)}?`,
      confirmLabel: "Pulisci",
      icon: "🧹",
      onConfirm: async () => {
        setConfirmDialog(null);
        setCleaningModelStorage(true);
        setModelStorageMessage("");
        try {
          const payload = await buildModelStoragePayload();
          const result = await cleanUnusedModels(payload.activePaths, payload.activeVisionModelPaths);
          setModelStorageMessage(`Pulizia completata: rimossi ${result.deletedCount} file, liberati ${formatStorageSize(result.freedBytes || 0)}.`);
          await refreshModelStorage();
        } catch (error) {
          setErr(`Errore durante la pulizia modelli: ${getErrorMessage(error)}`);
        } finally {
          setCleaningModelStorage(false);
        }
      },
    });
  };

  const autoDownloadLocalModel = async () => {
    const downloadPreset = getLocalModelDownload(importModel, isAndroidShell);
    if (!downloadPreset) {
      setErr("Per questo preset locale inserisci manualmente il percorso del file modello.");
      return;
    }

    setErr("");
    setImportKeyStatus(null);
    setLocalDownloadStatus({
      state: "starting",
      downloadedBytes: 0,
      totalBytes: null,
      path: "",
      error: "",
    });

    try {
      const downloadId = await startLocalModelDownload(downloadPreset);
      setLocalDownloadId(downloadId);
    } catch (error) {
      setImportKeyStatus("err");
      setErr("Errore download modello: " + error.message);
    }
  };

  const getVisionPreset = () => LOCAL_MODEL_DOWNLOADS.vision[visionSize] || LOCAL_MODEL_DOWNLOADS.vision["3b"];

  const autoDownloadVisionModel = async () => {
    const preset = getVisionPreset();
    if (!preset) return;
    setErr("");
    setVisionDownloadPhase("model");
    setVisionDownloadStatus({ state: "starting", downloadedBytes: 0, totalBytes: null, path: "", error: "" });
    try {
      const downloadId = await startLocalModelDownload({ url: preset.model.url, fileName: preset.model.fileName });
      setVisionDownloadId(downloadId);
    } catch (error) {
      setErr("Errore download modello vision: " + error.message);
      setVisionDownloadPhase(null);
    }
  };

  const autoDownloadImageGenModel = async () => {
    const preset = LOCAL_MODEL_DOWNLOADS.imageGen;
    if (!preset) return;
    setErr("");
    setImageGenDownloadStatus({ state: "starting", downloadedBytes: 0, totalBytes: null, path: "", error: "" });
    try {
      const downloadId = await startLocalModelDownload({ url: preset.url, fileName: preset.fileName });
      setImageGenDownloadId(downloadId);
    } catch (error) {
      setErr(`Errore download modello immagini: ${error.message}`);
    }
  };

  const autoDownloadWhisperModel = async () => {
    const preset = LOCAL_MODEL_DOWNLOADS.whisper;
    if (!preset) return;
    setErr("");
    setWhisperDownloadStatus({ state: "starting", downloadedBytes: 0, totalBytes: null, path: "", error: "" });
    try {
      const downloadId = await startLocalModelDownload({ url: preset.url, fileName: preset.fileName });
      setWhisperDownloadId(downloadId);
    } catch (error) {
      setErr("Errore download modello whisper: " + error.message);
    }
  };

  const buildProviderPrefs = (provider, config) => ({
    apiKey: requiresApiKey(provider) ? config.apiKey.trim() : "",
    model: config.model,
    ...(isLocalProvider(provider)
      ? {
          localModelPath: config.localModelPath?.trim() ?? "",
          localRuntimePath: config.localRuntimePath?.trim() || "@auto",
          visionModelPath: config.visionModelPath?.trim() ?? "",
        }
      : {}),
  });

  const testImportKey = async () => {
    const localOptions = {
      modelPath: importLocalModelPath.trim(),
      runtimePath: importLocalRuntimePath.trim(),
      preferredModel: importModel,
    };

    if (requiresApiKey(importProvider) && !importApiKey.trim()) {
      setErr("Inserisci la chiave API del provider scelto");
      return;
    }

    if (isLocalProvider(importProvider) && !localOptions.modelPath) {
      setErr("Inserisci il percorso del modello locale");
      return;
    }

    setTestingImportKey(true);
    setImportKeyStatus(null);
    setErr("");

    try {
      const ok = await testApiKey(importProvider, importApiKey.trim(), localOptions, importModel);
      if (!ok) {
        setImportKeyStatus("err");
        setErr(isLocalProvider(importProvider) ? "Modello o runtime non validi" : "Chiave non valida o errore di connessione");
        return;
      }

      saveAiPrefs({
        ...aiPrefs,
        visionModelPath: importVisionModelPath,
        providers: {
          ...aiPrefs.providers,
          [importProvider]: buildProviderPrefs(importProvider, {
            apiKey: importApiKey,
            model: importModel,
            localModelPath: importLocalModelPath,
            localRuntimePath: importLocalRuntimePath,
            visionModelPath: importVisionModelPath,
          }),
        },
      });
      setImportKeyStatus("ok");
    } catch (e) {
      setImportKeyStatus("err");
      setErr("Errore: " + e.message);
    } finally {
      setTestingImportKey(false);
    }
  };

  const filtered = recipes.filter(r => {
    if (favOnly && !r.fav) return false;
    if (cat !== "Tutte" && r.categoria !== cat) return false;
    if (ingredientFilter) {
      const normalizedIngredients = (r.ingredienti || []).map(normalizeIngredientFacet).filter(Boolean);
      const hasIngredient = normalizedIngredients.some(key =>
        key === ingredientFilter || key.includes(ingredientFilter) || ingredientFilter.includes(key)
      );
      if (!hasIngredient) return false;
    }
    if (q) {
      const qq = q.toLowerCase();
      return r.titolo?.toLowerCase().includes(qq) ||
             r.tags?.some(t => t.toLowerCase().includes(qq)) ||
             (r.ingredienti||[]).some(i => i.toLowerCase().includes(qq)) ||
             (r.preparazioni || []).some(section =>
               section.titolo?.toLowerCase().includes(qq) ||
               (section.ingredienti || []).some(ingredient => ingredient.toLowerCase().includes(qq)) ||
               (section.procedimento || []).some(step => step.toLowerCase().includes(qq))
             );
    }
    return true;
  });
  const displayedRecipes = aiSearchResultIds
    ? filtered.filter(recipe => aiSearchResultIds.includes(recipe.id))
    : filtered;

  // ── Actions ──
  const clearAiRecipeSearch = () => {
    setAiSearchResultIds(null);
    setAiSearchReason("");
  };

  const runAiRecipeSearch = async nextQuery => {
    const trimmedQuery = (nextQuery ?? aiSearchQuery).trim();
    if (!trimmedQuery) return;

    if (!recipes.length) {
      setErr("Aggiungi almeno una ricetta prima di usare la ricerca AI.");
      return;
    }

    if (!activeAiReady) {
      setErr("Configura prima il provider predefinito della ricerca AI nel pannello Configurazione AI.");
      return;
    }

    const localOptions = isLocalProvider(searchAiConfig.provider)
      ? { modelPath: searchAiConfig.localModelPath, runtimePath: searchAiConfig.localRuntimePath }
      : null;

    setAiSearching(true);
    setErr("");

    try {
      const prompt = buildAiRecipeSearchPrompt(trimmedQuery, recipes);
      const txt = await callAI({
        provider: searchAiConfig.provider,
        apiKey: searchAiConfig.apiKey,
        model: searchAiConfig.model,
        prompt,
        useWebSearch: false,
        localOptions,
      });

      const result = await parseStructuredResponse({
        txt,
        provider: searchAiConfig.provider,
        apiKey: searchAiConfig.apiKey,
        model: searchAiConfig.model,
        schema: AI_RECIPE_SEARCH_SCHEMA,
        label: "ricerca ricette",
        localOptions,
        prompt,
      });

      const validIds = [...new Set((result.matchedIds || []).map(id => Number(id)).filter(id =>
        Number.isFinite(id) && recipes.some(recipe => recipe.id === id)
      ))];
      const suggestedCategory = Array.isArray(result.categoryFocus)
        ? result.categoryFocus.find(value => CATS.includes(value))
        : null;
      const suggestedIngredient = resolveIngredientFacet(result.ingredientFocus, globalIngredientCatalog);

      setAiSearchQuery(trimmedQuery);
      setAiSearchResultIds(validIds);
      setAiSearchReason(
        result.reason ||
        (validIds.length
          ? `Ho trovato ${validIds.length} ricette coerenti con la richiesta.`
          : "Non ho trovato ricette coerenti con la richiesta.")
      );
      setView("home");
      setSelMode(false);
      setSel([]);
      setFavOnly(false);
      setQ("");
      setCat(suggestedCategory || "Tutte");
      setIngredientFilter(suggestedIngredient?.key || "");
    } catch (error) {
      setErr(`Errore ricerca AI: ${getErrorMessage(error)}`);
    } finally {
      setAiSearching(false);
    }
  };

  const cancelLocalImport = () => {
    cancelledImportRequestRef.current = activeImportRequestRef.current;
    if (loadMsgTimeoutRef.current) {
      window.clearTimeout(loadMsgTimeoutRef.current);
      loadMsgTimeoutRef.current = null;
    }
    setLoading(false);
    setLoadingContext(null);
    setLoadMsg("");
  };

  const doImportPhoto = async importConfig => {
    if (!photoDataUrl) {
      setErr("Seleziona una foto del piatto prima di continuare.");
      return;
    }
    if (requiresApiKey(importConfig.provider) && !importConfig.apiKey.trim()) {
      setErr("Configura prima la chiave API del provider scelto nel pannello Configurazione AI.");
      return;
    }
    if (isLocalProvider(importConfig.provider) && !importConfig.localModelPath?.trim()) {
      setErr("Configura prima il modello locale nel pannello Configurazione AI.");
      return;
    }

    const normalizedConfig = {
      provider: importConfig.provider,
      apiKey: importConfig.apiKey.trim(),
      model: importConfig.model,
      localModelPath: importConfig.localModelPath?.trim() ?? "",
      localRuntimePath: importConfig.localRuntimePath?.trim() || "@auto",
      visionModelPath: importConfig.visionModelPath?.trim() ?? "",
    };
    const isLocalImport = isLocalProvider(normalizedConfig.provider);
    const requestId = activeImportRequestRef.current + 1;

    activeImportRequestRef.current = requestId;
    cancelledImportRequestRef.current = null;
    if (loadMsgTimeoutRef.current) {
      window.clearTimeout(loadMsgTimeoutRef.current);
      loadMsgTimeoutRef.current = null;
    }

    setErr("");
    setLoading(true);
    setLoadingContext(isLocalImport ? "local-photo-import" : "photo-import");
    setLoadMsg(photoType === "book" ? "📖 Leggo la ricetta dalla foto…" : "📷 Osservo la foto del piatto…");

    try {
      saveAiPrefs({
        ...aiPrefs,
        visionModelPath: importVisionModelPath,
        providers: {
          ...aiPrefs.providers,
          [normalizedConfig.provider]: buildProviderPrefs(normalizedConfig.provider, normalizedConfig),
        },
      });

      const imported = await importFromPhoto({
        ...normalizedConfig,
        imageDataUrl: photoDataUrl,
        photoFileName,
        photoNote: photoNote.trim(),
        photoType,
        onProgress: msg => {
          if (activeImportRequestRef.current === requestId && cancelledImportRequestRef.current !== requestId) {
            setLoadMsg(msg);
          }
        },
      });
      if (cancelledImportRequestRef.current === requestId) return;

      const photoPreview = photoDataUrl.length <= 350_000 ? photoDataUrl : "";

      // Multiple recipes detected — show picker
      if (imported.multiple && imported.recipes?.length > 1) {
        setRecipePickerDialog({
          recipes: imported.recipes,
          debugData: imported.debugData,
          photoPreview,
          onPick: (chosen) => {
            const toImport = Array.isArray(chosen) ? chosen : [chosen];
            const newRecs = toImport.map((rec, i) => normalizeRecipeStructure({
              ...rec,
              id: Date.now() + i,
              createdAt: new Date().toISOString(),
              fav: false,
              foto: rec.foto || photoPreview,
              devData: imported.debugData,
            }));
            persist([...newRecs, ...recipes]);
            setRecipePickerDialog(null);
            setModal(null);
            resetImportDraft();
            setActiveRec(newRecs[0]);
            setView("detail");
          },
        });
        return;
      }

      const newRec = normalizeRecipeStructure({
        ...imported.recipe,
        id: Date.now(),
        createdAt: new Date().toISOString(),
        fav: false,
        foto: imported.recipe.foto || photoPreview,
        devData: imported.debugData,
      });
      persist([newRec, ...recipes]);
      setModal(null);
      resetImportDraft();
      setActiveRec(newRec);
      setView("detail");
    } catch (error) {
      if (cancelledImportRequestRef.current === requestId) return;
      setErr("Errore: " + getErrorMessage(error));
    } finally {
      if (loadMsgTimeoutRef.current) {
        window.clearTimeout(loadMsgTimeoutRef.current);
        loadMsgTimeoutRef.current = null;
      }
      if (activeImportRequestRef.current === requestId) {
        setLoading(false);
        setLoadingContext(null);
      }
    }
  };

  const doImport = async importConfig => {
    if (!url.trim()) return;
    if (requiresApiKey(importConfig.provider) && !importConfig.apiKey.trim()) {
      setErr("Configura prima la chiave API del provider scelto nel pannello Configurazione AI.");
      return;
    }
    if (isLocalProvider(importConfig.provider) && !importConfig.localModelPath?.trim()) {
      setErr("Configura prima il modello locale nel pannello Configurazione AI.");
      return;
    }

    const src = detectSource(url.trim());
    if (["tiktok", "instagram", "facebook"].includes(src) && (socialPreviewPending || fetchingSocialPreview)) {
      setErr(
        `Attendi che finisca il recupero della didascalia da ${
          src === "tiktok" ? "TikTok" : src === "instagram" ? "Instagram" : "Facebook"
        }.`
      );
      return;
    }
    const msgs = { tiktok:"🎵 Analizzo TikTok…", instagram:"📸 Analizzo Instagram…", youtube:"▶️ Recupero la ricetta YouTube…", web:"🔍 Leggo la pagina…" };
    const providerInfo = AI_PROVIDERS[importConfig.provider];
    const normalizedConfig = {
      provider: importConfig.provider,
      apiKey: importConfig.apiKey.trim(),
      model: importConfig.model,
      localModelPath: importConfig.localModelPath?.trim() ?? "",
      localRuntimePath: importConfig.localRuntimePath?.trim() || "@auto",
      visionModelPath: importConfig.visionModelPath?.trim() ?? "",
    };
    const isLocalImport = isLocalProvider(normalizedConfig.provider);
    const requestId = activeImportRequestRef.current + 1;

    activeImportRequestRef.current = requestId;
    cancelledImportRequestRef.current = null;
    if (loadMsgTimeoutRef.current) {
      window.clearTimeout(loadMsgTimeoutRef.current);
      loadMsgTimeoutRef.current = null;
    }

    setErr(""); setLoading(true); setLoadingContext(isLocalImport ? "local-import" : "import"); setLoadMsg(msgs[src] || "Importo…");
    try {
      saveAiPrefs({
        ...aiPrefs,
        visionModelPath: importVisionModelPath,
        providers: {
          ...aiPrefs.providers,
          [normalizedConfig.provider]: buildProviderPrefs(normalizedConfig.provider, normalizedConfig),
        },
      });

      const imported = await importFromUrl({
        ...normalizedConfig,
        url: url.trim(),
        caption: caption.trim(),
        socialThumbnail: socialPreview?.thumbnail || null,
        onProgress: msg => {
          if (activeImportRequestRef.current === requestId && cancelledImportRequestRef.current !== requestId) {
            setLoadMsg(msg);
          }
        },
      });
      if (cancelledImportRequestRef.current === requestId) return;
      const newRec = normalizeRecipeStructure({
        ...imported.recipe,
        id: Date.now(),
        createdAt: new Date().toISOString(),
        fav: false,
        devData: imported.debugData,
      });
      persist([newRec, ...recipes]);
      setModal(null);
      resetImportDraft();
      setActiveRec(newRec); setView("detail");
    } catch(e) {
      if (cancelledImportRequestRef.current === requestId) return;
      setErr("Errore: " + getErrorMessage(e));
    } finally {
      if (loadMsgTimeoutRef.current) {
        window.clearTimeout(loadMsgTimeoutRef.current);
        loadMsgTimeoutRef.current = null;
      }
      if (activeImportRequestRef.current === requestId) {
        setLoading(false);
        setLoadingContext(null);
      }
    }
  };

  const updatePreparationDraftField = (setter, index, field, value) => {
    setter(prevDraft => ({
      ...prevDraft,
      preparazioni: (prevDraft.preparazioni || []).map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, [field]: value } : section
      ),
    }));
  };

  const addPreparationDraft = setter => {
    setter(prevDraft => {
      const nextIndex = (prevDraft.preparazioni?.length || 0) + 1;
      return {
        ...prevDraft,
        preparazioni: [
          ...(prevDraft.preparazioni || []),
          createPreparationDraft(`Preparazione ${nextIndex}`),
        ],
      };
    });
  };

  const removePreparationDraft = (setter, index) => {
    setter(prevDraft => {
      const currentSections = prevDraft.preparazioni || [];
      if (currentSections.length <= 1) {
        return { ...prevDraft, preparazioni: [createPreparationDraft()] };
      }

      const nextSections = currentSections.filter((_, sectionIndex) => sectionIndex !== index);
      return {
        ...prevDraft,
        preparazioni: nextSections.length ? nextSections : [createPreparationDraft()],
      };
    });
  };

  const renderPreparationSectionsEditor = (draft, setter) => {
    const sections = draft.preparazioni?.length ? draft.preparazioni : [createPreparationDraft()];

    return (
      <div style={{ marginBottom:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom:10, flexWrap:"wrap" }}>
          <div>
            <label style={S.label}>Preparazioni</label>
            <div style={{ fontSize:12, color:"#888", lineHeight:1.5 }}>
              Dividi la ricetta in sezioni come base, crema, farcitura o decorazione.
            </div>
          </div>
          <button
            style={{ ...S.btnSecondary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"12px 16px", borderRadius:14 } : {}) }}
            onClick={() => addPreparationDraft(setter)}
          >
            + Aggiungi preparazione
          </button>
        </div>

        <div style={{ display:"grid", gap:10 }}>
          {sections.map((section, index) => (
            <div key={`${section.titolo}-${index}`} style={{ background:"#F5F0E8", border:"1px solid #E0D8C8", borderRadius:16, padding:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, marginBottom:10, flexWrap:"wrap" }}>
                <strong style={{ color:"#4D453A", fontSize:14 }}>Preparazione {index + 1}</strong>
                {sections.length > 1 && (
                  <button
                    style={{ ...S.btnSecondary, padding:"8px 12px", fontSize:12 }}
                    onClick={() => removePreparationDraft(setter, index)}
                  >
                    Rimuovi
                  </button>
                )}
              </div>

              <div style={{ marginBottom:10 }}>
                <label style={S.label}>Titolo sezione</label>
                <input
                  style={S.input}
                  value={section.titolo}
                  placeholder={index === 0 ? DEFAULT_PREPARATION_TITLE : `Preparazione ${index + 1}`}
                  onChange={e => updatePreparationDraftField(setter, index, "titolo", e.target.value)}
                />
              </div>

              <div style={{ marginBottom:10 }}>
                <label style={S.label}>Ingredienti della sezione (uno per riga)</label>
                <textarea
                  style={{ ...S.input, minHeight:80, resize:"vertical" }}
                  value={section.ingredienti}
                  onChange={e => updatePreparationDraftField(setter, index, "ingredienti", e.target.value)}
                  placeholder={"300g farina\n2 uova\n120g zucchero"}
                />
              </div>

              <div style={{ marginBottom:10 }}>
                <label style={S.label}>Procedimento della sezione (un passaggio per riga)</label>
                <textarea
                  style={{ ...S.input, minHeight:90, resize:"vertical" }}
                  value={section.procedimento}
                  onChange={e => updatePreparationDraftField(setter, index, "procedimento", e.target.value)}
                  placeholder={"Mescola gli ingredienti secchi...\nAggiungi le uova...\nCuoci a 180°C..."}
                />
              </div>

              <div>
                <label style={S.label}>Nota sezione (opzionale)</label>
                <input
                  style={S.input}
                  value={section.note}
                  onChange={e => updatePreparationDraftField(setter, index, "note", e.target.value)}
                  placeholder="Es. lascia raffreddare completamente prima della farcitura"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const doManual = () => {
    if (!manual.titolo.trim()) { setErr("Inserisci il titolo"); return; }
    const newRec = recipeDraftToRecipe(manual, {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      fav: false,
      fonte: "",
    });
    persist([newRec, ...recipes]);
    setModal(null);
    setManual(createEmptyRecipeDraft());
    setActiveRec(newRec); setView("detail");
  };

  const openEditModal = rec => {
    setEditRec(recipeToDraft(rec));
    setErr("");
    setModal("edit");
  };

  const doEditSave = () => {
    if (!editRec?.titolo?.trim()) { setErr("Inserisci il titolo"); return; }
    const updated = recipes.map(r => r.id === editRec.id ? {
      ...recipeDraftToRecipe(editRec, r),
    } : r);
    persist(updated);
    const saved = updated.find(r => r.id === editRec.id);
    setActiveRec(saved);
    setModal(null);
    setEditRec(null);
    setErr("");
  };

  const doDelete = id => {
    const rec = recipes.find(r => r.id === id);
    setConfirmDialog({
      message: `Eliminare "${rec?.titolo || "questa ricetta"}"?`,
      onConfirm: () => {
        persist(recipes.filter(r => r.id !== id));
        if (view === "detail") { setView("home"); setActiveRec(null); }
        setConfirmDialog(null);
      },
    });
  };

  const toggleFav = id => {
    const updated = recipes.map(r => r.id === id ? { ...r, fav: !r.fav } : r);
    persist(updated);
    if (activeRec?.id === id) setActiveRec(updated.find(r => r.id === id));
  };

  const toggleSel = id => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const doCreateList = async () => {
    if (!sel.length) { setErr("Seleziona almeno una ricetta"); return; }
    if (requiresApiKey(searchAiConfig.provider) && !searchAiConfig.apiKey.trim()) {
      setErr("Configura prima il provider AI nel pannello Configurazione AI.");
      return;
    }
    if (isLocalProvider(searchAiConfig.provider) && !searchAiConfig.localModelPath.trim()) {
      setErr("Configura prima il modello locale nel pannello Configurazione AI.");
      return;
    }
    setErr(""); setLoading(true); setLoadMsg("🛒 Genero la lista della spesa…");
    try {
      const chosen = recipes.filter(r => sel.includes(r.id));
      const data   = await buildShoppingList({ ...searchAiConfig, recipes: chosen });
      const newList = { id: Date.now(), nome: listName || "Lista " + new Date().toLocaleDateString("it"),
        items: data.items.map(i => ({ ...i, id: Math.random(), done: false })),
        ricette: chosen.map(r => r.titolo), createdAt: new Date().toISOString() };
      persistL([newList, ...lists]);
      setModal(null); setSelMode(false); setSel([]); setListName("");
      setView("lists"); setOpenList(newList.id);
    } catch(e) { setErr("Errore: " + getErrorMessage(e)); }
    setLoading(false);
  };

  const toggleItem = (listId, itemId) => {
    persistL(lists.map(l => l.id === listId
      ? { ...l, items: l.items.map(i => i.id === itemId ? { ...i, done: !i.done } : i) } : l));
  };

  const exportJSON = async () => {
    const backup = JSON.stringify({ recipes, lists }, null, 2);

    try {
      if (hasNativeBridge()) {
        const path = await invokeNative("export_backup", { payload: { json: backup } });
        alert(`Backup salvato in:\n${path}`);
        return;
      }

      const blob = new Blob([backup], { type:"application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "recipevault-backup.json";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert("Errore durante l'export: " + e.message);
    }
  };

  const importJSON = () => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".json";
    input.onchange = e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const d = JSON.parse(ev.target.result);
          if (d.recipes) persist([...d.recipes, ...recipes]);
          if (d.lists)   persistL([...d.lists, ...lists]);
          alert(`Importate ${d.recipes?.length||0} ricette e ${d.lists?.length||0} liste.`);
        } catch { alert("File non valido"); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const generateBookRecipeImage = async (recipe) => {
    if (isAndroidShell) {
      setErr("La generazione immagine locale non è ancora supportata su Android. Per ora usa la versione desktop.");
      return;
    }

    const localImageGenConfig = getSharedImageGenerationConfig(aiPrefs);
    if (!localImageGenConfig.modelPath.trim()) {
      setErr("Configura il modello locale di generazione immagini nel pannello AI.");
      openAiConfigModal({ provider: "local" });
      return;
    }

    const imagePrompt = buildRecipeImagePrompt(recipe);
    const modelFileName = localImageGenConfig.modelPath.split(/[\\/]/).pop() || "modello-locale";
    setErr("");
    setLoading(true);
    setLoadingContext("recipe-image-generation");
    setLoadMsg("🖼️ Genero una foto locale del piatto…");

    try {
      const imageDataUrl = await generateRecipeImage({
        provider: "local",
        prompt: imagePrompt,
        localModelPath: localImageGenConfig.modelPath.trim(),
        localRuntimePath: localImageGenConfig.runtimePath,
      });
      const generatedAt = new Date().toISOString();
      const updatedRecipes = recipes.map(item => (
        item.id === recipe.id
          ? {
              ...item,
              foto: imageDataUrl,
              devData: item.devData
                ? {
                    ...item.devData,
                    generatedImage: {
                      provider: "local",
                      model: modelFileName,
                      generatedAt,
                      runtimePath: localImageGenConfig.runtimePath,
                      prompt: truncateText(imagePrompt, 4000),
                    },
                  }
                : item.devData,
            }
          : item
      ));

      persist(updatedRecipes);
      const nextActive = updatedRecipes.find(item => item.id === recipe.id) || recipe;
      setActiveRec(nextActive);
    } catch (error) {
      setErr(`Errore generando la foto: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
      setLoadingContext(null);
    }
  };

  const handleSourceLinkClick = async sourceUrl => {
    try {
      setErr("");
      await openExternalUrl(sourceUrl);
    } catch (error) {
      setErr(`Impossibile aprire la fonte: ${getErrorMessage(error)}`);
    }
  };

  // ── Sub-components ──
  const diffStyle = d => d==="Facile" ? S.dFacile : d==="Media" ? S.dMedia : S.dDifficile;

  const RecipeCard = ({ r }) => (
    <div style={{
      ...S.card,
      ...(isCompactUi ? { flexDirection:"row", borderRadius:18, minHeight:118 } : {}),
      ...(selMode && sel.includes(r.id) ? { outline:"2px solid #C84B2F" } : {}),
    }}
      onClick={() => selMode ? toggleSel(r.id) : (setActiveRec(r), setView("detail"))}>
      {selMode && (
        <div style={{ ...S.selCircle, background: sel.includes(r.id)?"#C84B2F":"rgba(255,255,255,.7)" }}>
          {sel.includes(r.id) && <span style={{ color:"#fff", fontSize:12 }}>✓</span>}
        </div>
      )}
      <div style={{ ...S.cardThumb, ...(isCompactUi ? { width:104, minWidth:104, height:"auto" } : {}) }}>
        {r.foto
          ? <img src={r.foto} alt={r.titolo} style={{ width:"100%", height:"100%", objectFit:"cover", position:"absolute", inset:0 }} onError={e=>e.target.style.display="none"}/>
          : <span style={{ fontSize:44 }}>{EMO[r.categoria]||"🍴"}</span>}
        <div style={S.catBadge}>{r.categoria}</div>
      </div>
      <div style={{ ...S.cardBody, ...(isCompactUi ? { padding:"14px 14px 14px 12px" } : {}) }}>
        <div style={{ ...S.cardTitle, ...(isCompactUi ? { fontSize:17 } : {}) }}>{r.titolo}</div>
        <div style={{ ...S.cardMeta, ...(isCompactUi ? { flexWrap:"wrap", rowGap:4 } : {}) }}>
          {r.tempoPrep && <span>⏱ {r.tempoPrep}</span>}
          {r.porzioni  && <span>👤 {r.porzioni}</span>}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"auto" }}>
          <span style={{ ...S.diffBadge, ...diffStyle(r.difficolta) }}>{r.difficolta}</span>
          <div style={{ display:"flex", gap:isCompactUi ? 6 : 2 }}>
            <button style={{ ...S.iconBtn, color:r.fav?"#E8A838":"#ccc", ...(isCompactUi ? { fontSize:18, padding:"8px 9px", background:"#F5F0E8" } : {}) }} onClick={e=>{e.stopPropagation();toggleFav(r.id);}}>★</button>
            <button style={{ ...S.iconBtn, color:"#C8B8A8", ...(isCompactUi ? { fontSize:17, padding:"8px 9px", background:"#F5F0E8" } : {}) }} onClick={e=>{e.stopPropagation();doDelete(r.id);}}>🗑</button>
          </div>
        </div>
      </div>
    </div>
  );

  const Detail = ({ r }) => {
    const sections = Array.isArray(r.preparazioni) ? r.preparazioni : [];
    const showStructuredPreparations = hasStructuredPreparations(r);
    const scaledPortions = r.porzioni ? Math.round(r.porzioni * scaleFactor) : null;
    const canGenerateImportedBookPhoto = isBookImportedRecipe(r) && !isAndroidShell;
    const sourceUrl = isExternalWebUrl(r.fonte) ? r.fonte : "";
    const displayIngredient = (ing) => {
      let s = scaleIngredient(ing, scaleFactor);
      s = useImperial ? convertToImperial(s) : convertToMetric(s);
      return s;
    };

    return (
        <div style={{ ...S.detail, ...(isCompactUi ? { padding:"18px 18px calc(110px + env(safe-area-inset-bottom))", maxWidth:"100%" } : {}) }} className="selectable">
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:isCompactUi ? 16 : 20, flexWrap:"wrap", ...(isCompactUi ? { position:"sticky", top:0, zIndex:5, background:"rgba(245,240,232,.6)", backdropFilter:"blur(30px) saturate(180%)", WebkitBackdropFilter:"blur(30px) saturate(180%)", paddingBottom:10 } : {}) }}>
            <button style={{ ...S.backBtn, ...(isCompactUi ? { fontSize:15, fontWeight:600, padding:"10px 14px", borderRadius:999, background:"#FDFAF4", border:"1px solid #E0D8C8" } : {}) }} onClick={()=>{setView("home");setActiveRec(null);setDevModeOpen(false);}}>← Indietro</button>
            <button style={{ ...S.iconBtn, color:r.fav?"#E8A838":"#bbb", fontSize:20, ...(isCompactUi ? { padding:"10px 12px", background:"#FDFAF4", border:"1px solid #E0D8C8" } : {}) }} onClick={()=>toggleFav(r.id)}>★</button>
            <button style={{ ...S.iconBtn, color:"#5B7A3A", fontSize:18, ...(isCompactUi ? { padding:"10px 12px", background:"#FDFAF4", border:"1px solid #E0D8C8" } : {}) }} onClick={()=>openEditModal(r)}>✏️</button>
            <button style={{ ...S.iconBtn, color:"#C84B2F", fontSize:18, ...(isCompactUi ? { padding:"10px 12px", background:"#FDFAF4", border:"1px solid #E0D8C8" } : {}) }} onClick={()=>doDelete(r.id)}>🗑</button>
            {canGenerateImportedBookPhoto && (
              <button
                style={{ ...S.btnSecondary, ...(isCompactUi ? { padding:"10px 14px", borderRadius:999 } : { padding:"7px 12px" }) }}
                onClick={() => generateBookRecipeImage(r)}
              >
                🖼️ Genera foto piatto
              </button>
            )}
            {r.devData && (
              <button
                style={{ ...S.btnSecondary, ...(isCompactUi ? { padding:"10px 14px", borderRadius:999 } : { padding:"7px 12px" }) }}
                onClick={() => setDevModeOpen(true)}
              >
                🧪 DEV MODE
              </button>
            )}
            {sourceUrl
              ? (
                <button
                  style={{ ...S.sourceLink, background:"none", border:"none", cursor:"pointer", padding:0 }}
                  onClick={() => handleSourceLinkClick(sourceUrl)}
                >
                  🔗 Fonte originale
                </button>
              )
              : (r.fonte ? <span style={{ ...S.sourceLink, color:"#8E8475" }}>📄 {r.fonte}</span> : null)}
          </div>
          {r.foto && (
            <div style={{ borderRadius:isCompactUi ? 20 : 12, overflow:"hidden", marginBottom:isCompactUi ? 16 : 20, maxHeight:isCompactUi ? 240 : 300 }}>
              <img src={r.foto} alt={r.titolo} style={{ width:"100%", maxHeight:isCompactUi ? 240 : 300, objectFit:"cover" }} onError={e=>e.target.parentElement.style.display="none"}/>
            </div>
          )}
          <div style={{ fontSize:isCompactUi ? 30 : 36, marginBottom:8 }}>{EMO[r.categoria]}</div>
          <h1 style={{ ...S.detailTitle, ...(isCompactUi ? { fontSize:28, marginBottom:12 } : {}) }}>{r.titolo}</h1>
          <div style={S.badges}>
            <span style={S.badge}>{r.categoria}</span>
            <span style={{ ...S.badge, ...diffStyle(r.difficolta) }}>{r.difficolta}</span>
            {r.tempoPrep    && <span style={S.badge}>⏱ Prep: {r.tempoPrep}</span>}
            {r.tempoCottura && <span style={S.badge}>🔥 Cottura: {r.tempoCottura}</span>}
            {r.porzioni     && (
              <span style={{ ...S.badge, display:"inline-flex", alignItems:"center", gap:6 }}>
                <button onClick={()=>setScaleFactor(f=>Math.max(0.25,f-0.25))} style={{ background:"none", border:"none", cursor:"pointer", fontSize:15, fontWeight:700, color:"#C84B2F", padding:"0 2px", lineHeight:1 }}>−</button>
                <span>👤 {scaledPortions} porzioni{scaleFactor !== 1 ? ` (×${scaleFactor})` : ""}</span>
                <button onClick={()=>setScaleFactor(f=>f+0.25)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:15, fontWeight:700, color:"#C84B2F", padding:"0 2px", lineHeight:1 }}>+</button>
              </span>
            )}
            <button
              onClick={toggleImperial}
              style={{ ...S.badge, cursor:"pointer", background: useImperial ? "rgba(200,75,47,0.15)" : "rgba(237,232,220,0.5)", border: useImperial ? "1px solid rgba(200,75,47,0.3)" : "1px solid rgba(255,255,255,0.3)" }}
              title={useImperial ? "Passa a unità metriche" : "Passa a unità imperiali"}
            >
              {useImperial ? "🇺🇸" : "🇪🇺"} {useImperial ? "Imperial" : "Metrico"}
            </button>
          </div>
          {r.tags?.length > 0 && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:20 }}>
              {r.tags.map(t=><span key={t} style={S.tag}>#{t}</span>)}
            </div>
          )}

          {showStructuredPreparations ? (
            <div style={{ display:"grid", gap:16 }}>
              {sections.map((section, sectionIndex) => (
                <div key={`${section.titolo}-${sectionIndex}`} style={{ background:"rgba(255,255,255,0.45)", backdropFilter:"blur(40px) saturate(180%)", WebkitBackdropFilter:"blur(40px) saturate(180%)", border:"1px solid rgba(255,255,255,0.6)", borderRadius:isCompactUi ? 18 : 16, padding:isCompactUi ? 16 : 18, boxShadow:"0 4px 30px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.5)" }}>
                  <h2 style={{ ...S.secTitle, marginBottom:12 }}>
                    {section.titolo || `Preparazione ${sectionIndex + 1}`}
                  </h2>
                  <div style={{ ...S.detailGrid, ...(isCompactUi ? { gridTemplateColumns:"1fr", gap:18 } : {}) }}>
                    <div>
                      <h3 style={{ ...S.label, fontSize:12, color:"#8A7C69", marginBottom:10 }}>Ingredienti</h3>
                      <ul style={{ listStyle:"none" }}>
                        {(section.ingredienti || []).map((ingredient, ingredientIndex) => (
                          <li key={ingredientIndex} style={S.ingItem}><span style={S.ingDot}/>{displayIngredient(ingredient)}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 style={{ ...S.label, fontSize:12, color:"#8A7C69", marginBottom:10 }}>Procedimento</h3>
                      {(section.procedimento || []).map((step, stepIndex) => (
                        <div key={stepIndex} style={S.stepItem}>
                          <span style={S.stepNum}>{stepIndex + 1}</span>
                          <span style={{ lineHeight:1.7, fontSize:14 }}>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {section.note && (
                    <div style={{ ...S.noteBox, marginTop:14 }}>
                      <strong>Nota sezione: </strong>{section.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ ...S.detailGrid, ...(isCompactUi ? { gridTemplateColumns:"1fr", gap:20 } : {}) }}>
              <div>
                <h2 style={S.secTitle}>🧂 Ingredienti</h2>
                <ul style={{ listStyle:"none" }}>
                  {(r.ingredienti||[]).map((ing,i)=>(
                    <li key={i} style={S.ingItem}><span style={S.ingDot}/>{displayIngredient(ing)}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 style={S.secTitle}>📋 Procedimento</h2>
                {(r.procedimento||[]).map((step,i)=>(
                  <div key={i} style={S.stepItem}>
                    <span style={S.stepNum}>{i+1}</span>
                    <span style={{ lineHeight:1.7, fontSize:14 }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {r.note && <div style={S.noteBox}><strong>📝 Note: </strong>{r.note}</div>}
        </div>
      );
  };

  const ListsView = () => (
    <div style={{ padding:isCompactUi ? "18px 16px calc(110px + env(safe-area-inset-bottom))" : "24px 28px", overflowY:"auto", height:"100%" }}>
      <div style={{ display:"flex", alignItems:isCompactUi ? "stretch" : "center", flexDirection:isCompactUi ? "column" : "row", gap:12, marginBottom:24 }}>
        <h2 style={{ ...S.topTitle, fontFamily:"'Playfair Display',serif", flex:1 }}>🛒 Liste della Spesa</h2>
        <button
          style={{ ...S.btnPrimary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"13px 18px", borderRadius:14 } : {}) }}
          onClick={() => {
            setErr("");
            setModal(null);
            setView("home");
            setSel([]);
            setSelMode(true);
          }}
        >
          + Nuova Lista
        </button>
      </div>
      {lists.length === 0
        ? <div style={S.empty}>
            <div style={{ fontSize:52 }}>🛒</div>
            <h3 style={{ fontFamily:"'Playfair Display',serif", margin:"12px 0 8px" }}>Nessuna lista</h3>
            <p>Seleziona una o più ricette e poi genera la lista della spesa con AI.</p>
            <button
              style={{ ...S.btnPrimary, marginTop:18 }}
              onClick={() => {
                setErr("");
                setModal(null);
                setView("home");
                setSel([]);
                setSelMode(true);
              }}
            >
              ☑ Seleziona ricette
            </button>
          </div>
        : lists.map(l => (
          <div key={l.id} style={S.listCard}>
            <div style={S.listHeader} onClick={()=>setOpenList(openList===l.id?null:l.id)}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18 }}>{l.nome}</div>
                <div style={{ fontSize:12, color:"#888", marginTop:2 }}>{l.ricette?.join(", ")} · {l.items?.filter(i=>i.done).length}/{l.items?.length} completati</div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <button style={{ ...S.iconBtn, color:"#C84B2F" }} onClick={e=>{e.stopPropagation();setConfirmDialog({message:`Eliminare "${l.name}"?`,onConfirm:()=>{persistL(lists.filter(x=>x.id!==l.id));setConfirmDialog(null);}});}}>🗑</button>
                <span>{openList===l.id?"▲":"▼"}</span>
              </div>
            </div>
            {openList===l.id && (
              <div style={{ padding:"0 20px 20px" }} className="selectable">
                {REPARTI.filter(rep=>l.items?.some(i=>i.reparto===rep)).map(rep=>(
                  <div key={rep}>
                    <div style={S.repartoT}>{rep}</div>
                    {l.items.filter(i=>i.reparto===rep).map(item=>(
                      <div key={item.id} style={S.listItem}>
                        <div style={{ ...S.listCheck, background:item.done?"#3D6B47":"transparent", borderColor:item.done?"#3D6B47":"#D0C8B8" }}
                          onClick={()=>toggleItem(l.id,item.id)}>
                          {item.done && <span style={{ color:"#fff", fontSize:11 }}>✓</span>}
                        </div>
                        <span style={{ textDecoration:item.done?"line-through":"none", color:item.done?"#aaa":"#333" }}>{item.ingrediente}</span>
                        <span style={{ marginLeft:"auto", color:"#888", fontSize:13 }}>{item.quantita}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      }
    </div>
  );

  // ── Import modal ──
  const importConfigReady = (() => {
    const currentConfig = {
      provider: importProvider,
      apiKey: importApiKey,
      localModelPath: importLocalModelPath,
    };
    if (isLocalProvider(importProvider)) {
      if (importMode === "photo") {
        return !isAndroidShell && Boolean(importLocalModelPath?.trim() && importVisionModelPath?.trim());
      }
      return isProviderConfigured(currentConfig);
    }
    return isProviderConfigured(currentConfig);
  })();

  const renderCommonAiAssetsBlock = () => {
    if (isAndroidShell) return null;

    return (
      <div style={{ marginBottom:18, background:"rgba(255,255,255,0.35)", backdropFilter:"blur(30px) saturate(180%)", WebkitBackdropFilter:"blur(30px) saturate(180%)", border:"1px solid rgba(255,255,255,0.5)", borderRadius:18, padding:isCompactUi ? 16 : 20, boxShadow:"0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.5)" }}>
        <div style={{ marginBottom:12 }}>
          <div style={{ ...S.label, marginBottom:6 }}>Componenti comuni</div>
          <div style={{ fontSize:13, color:"#6F6558", lineHeight:1.55 }}>
            Modelli e runtime condivisi tra tutti i provider: vision per foto/video, whisper per trascrizione audio e generazione immagini locale desktop.
          </div>
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={S.label}>Modello vision condiviso (foto e video)</label>
          <input
            style={{ ...S.input, fontFamily:"monospace", letterSpacing:".2px" }}
            placeholder="Es. /Users/tuo-utente/models/Qwen2.5-VL-3B-Q4.gguf"
            value={importVisionModelPath}
            onChange={e => {
              const nextValue = e.target.value;
              setImportVisionModelPath(nextValue);
              updateAiPrefs(prevPrefs => ({ ...prevPrefs, visionModelPath: nextValue }));
              setErr("");
            }}
          />
          <p style={{ fontSize:12, color:"#888", marginTop:5, lineHeight:1.5 }}>
            Modello GGUF con supporto vision per analizzare foto di piatti, leggere ricette da libri e analizzare frame video.
          </p>
          <div style={{ marginTop:10 }}>
            <div style={{ display:"flex", gap:6, marginBottom:8 }}>
              {Object.entries(LOCAL_MODEL_DOWNLOADS.vision).map(([key, preset]) => (
                <button
                  key={key}
                  style={{
                    flex:1, padding:"8px 10px", borderRadius:10, fontSize:13, fontWeight:500, cursor:"pointer", transition:"all .2s",
                    border: visionSize === key ? "1px solid rgba(200,75,47,0.3)" : "1px solid rgba(255,255,255,0.4)",
                    background: visionSize === key ? "rgba(200,75,47,0.1)" : "rgba(255,255,255,0.3)",
                    color: visionSize === key ? "#C84B2F" : "#666",
                  }}
                  onClick={() => {
                    setVisionSize(key);
                    const settings = ls.get("rv_settings", {});
                    ls.set("rv_settings", { ...settings, visionSize: key });
                  }}
                >
                  <div>{preset.shortLabel}</div>
                  <div style={{ fontSize:11, fontWeight:400, marginTop:2, color: visionSize === key ? "#C84B2F" : "#999" }}>{preset.totalLabel}</div>
                </button>
              ))}
            </div>
            <div style={{ fontSize:12, color:"#888", marginBottom:8, lineHeight:1.5 }}>
              {visionSize === "7b"
                ? "🎯 Consigliato per OCR da libri/ricette fotografate. Più lento ma molto più preciso nella lettura del testo."
                : "⚡ Veloce e leggero, ideale per riconoscere piatti da foto. Meno preciso per leggere testo da libri."}
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              <button
                style={{ ...S.btnSecondary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"13px 16px", borderRadius:14 } : {}) }}
                onClick={autoDownloadVisionModel}
                disabled={Boolean(visionDownloadId) || visionDownloadStatus?.state === "starting"}
              >
                {visionDownloadId || visionDownloadStatus?.state === "starting"
                  ? `Scarico ${visionDownloadPhase === "mmproj" ? "mmproj" : "modello"}…`
                  : `⬇️ Scarica ${getVisionPreset().model.label}`}
              </button>
              <span style={{ fontSize:12, color:"#888" }}>
                {getVisionPreset().totalLabel} · {getVisionPreset().note}
              </span>
            </div>
          </div>
          {visionDownloadStatus && (
            <div style={{ marginTop:12, background:"rgba(253,250,244,0.6)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)", border:"1px solid rgba(255,255,255,0.4)", borderRadius:14, padding:"12px 14px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", marginBottom:8, fontSize:13, color:"#5C5245" }}>
                <strong>
                  {visionDownloadStatus.state === "completed" && !visionDownloadId
                    ? "Vision model scaricato"
                    : visionDownloadStatus.state === "error"
                      ? "Download interrotto"
                      : `Download ${visionDownloadPhase === "mmproj" ? "mmproj" : "modello"} in corso`}
                </strong>
                <span>
                  {formatDownloadSize(visionDownloadStatus.downloadedBytes || 0)}
                  {typeof visionDownloadStatus.totalBytes === "number" ? ` / ${formatDownloadSize(visionDownloadStatus.totalBytes)}` : ""}
                </span>
              </div>
              <div style={{ height:10, borderRadius:999, background:"#EDE8DC", overflow:"hidden" }}>
                <div style={{
                  height:"100%",
                  width: typeof visionDownloadStatus.totalBytes === "number" && visionDownloadStatus.totalBytes > 0
                    ? `${Math.min(100, (visionDownloadStatus.downloadedBytes / visionDownloadStatus.totalBytes) * 100)}%`
                    : visionDownloadStatus.state === "completed" ? "100%" : "18%",
                  background:"linear-gradient(90deg,#7B4BC8 0%,#C84B9F 100%)",
                  transition:"width .3s ease",
                }} />
              </div>
              <div style={{ fontSize:12, color:"#888", marginTop:8 }}>
                {visionDownloadStatus.state === "completed" && !visionDownloadId
                  ? `Modello e mmproj salvati. Percorso: ${importVisionModelPath}`
                  : visionDownloadStatus.state === "error"
                    ? (visionDownloadStatus.error || "Errore sconosciuto")
                    : typeof visionDownloadStatus.totalBytes === "number" && visionDownloadStatus.totalBytes > 0
                      ? `${((visionDownloadStatus.downloadedBytes / visionDownloadStatus.totalBytes) * 100).toFixed(1)}% completato`
                      : "Calcolo dimensione in corso…"}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={S.label}>Generazione immagini locale (desktop)</label>
          <input
            style={{ ...S.input, fontFamily:"monospace", letterSpacing:".2px", marginBottom:10 }}
            placeholder="Es. /Users/tuo-utente/models/sd_xl_turbo_1.0.safetensors"
            value={sharedImageGenModelPath}
            onChange={e => {
              const nextValue = e.target.value;
              setSharedImageGenModelPath(nextValue);
              updateAiPrefs(prevPrefs => ({ ...prevPrefs, imageGenModelPath: nextValue }));
              setErr("");
            }}
          />
          <input
            style={{ ...S.input, fontFamily:"monospace", letterSpacing:".2px" }}
            placeholder="@auto oppure /percorso/sd-cli"
            value={sharedImageGenRuntimePath}
            onChange={e => {
              const nextValue = e.target.value;
              setSharedImageGenRuntimePath(nextValue);
              updateAiPrefs(prevPrefs => ({
                ...prevPrefs,
                imageGenRuntimePath: normalizeImageGenRuntimePath(nextValue),
              }));
              setErr("");
            }}
          />
          <p style={{ fontSize:12, color:"#888", marginTop:5, lineHeight:1.5 }}>
            Usa un runtime compatibile con <strong>stable-diffusion.cpp</strong> (`sd-cli`) e un modello locale supportato dal runtime. Questo blocco serve per generare una foto del piatto a partire dalla ricetta importata da libro.
          </p>
          <p style={{ fontSize:12, color:"#888", marginTop:5, lineHeight:1.5 }}>
            Lascia <strong>@auto</strong> per cercare `sd-cli` nel sistema o in un eventuale sidecar futuro. Su Android questa funzione locale non è ancora supportata.
          </p>
          <div style={{ marginTop:10, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <button
              style={{ ...S.btnSecondary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"13px 16px", borderRadius:14 } : {}) }}
              onClick={autoDownloadImageGenModel}
              disabled={Boolean(imageGenDownloadId) || imageGenDownloadStatus?.state === "starting"}
            >
              {imageGenDownloadId || imageGenDownloadStatus?.state === "starting"
                ? "Scarico modello immagini…"
                : `⬇️ Scarica ${LOCAL_MODEL_DOWNLOADS.imageGen.label}`}
            </button>
            <span style={{ fontSize:12, color:"#888" }}>
              {LOCAL_MODEL_DOWNLOADS.imageGen.sizeLabel} · {LOCAL_MODEL_DOWNLOADS.imageGen.note}
            </span>
          </div>
          {imageGenDownloadStatus && (
            <div style={{ marginTop:12, background:"rgba(253,250,244,0.6)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)", border:"1px solid rgba(255,255,255,0.4)", borderRadius:14, padding:"12px 14px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", marginBottom:8, fontSize:13, color:"#5C5245" }}>
                <strong>
                  {imageGenDownloadStatus.state === "completed"
                    ? "Modello immagini scaricato"
                    : imageGenDownloadStatus.state === "error"
                      ? "Download interrotto"
                      : "Download in corso"}
                </strong>
                <span>
                  {formatDownloadSize(imageGenDownloadStatus.downloadedBytes || 0)}
                  {typeof imageGenDownloadStatus.totalBytes === "number"
                    ? ` / ${formatDownloadSize(imageGenDownloadStatus.totalBytes)}`
                    : ""}
                </span>
              </div>
              <div style={{ height:10, borderRadius:999, background:"#EDE8DC", overflow:"hidden" }}>
                <div style={{
                  height:"100%",
                  width: typeof imageGenDownloadStatus.totalBytes === "number" && imageGenDownloadStatus.totalBytes > 0
                    ? `${Math.min(100, (imageGenDownloadStatus.downloadedBytes / imageGenDownloadStatus.totalBytes) * 100)}%`
                    : imageGenDownloadStatus.state === "completed" ? "100%" : "18%",
                  background:"linear-gradient(90deg,#875C2A 0%,#D9A55A 100%)",
                  transition:"width .3s ease",
                }} />
              </div>
              <div style={{ fontSize:12, color:"#888", marginTop:8 }}>
                {imageGenDownloadStatus.state === "completed"
                  ? `Modello immagini pronto. Percorso: ${sharedImageGenModelPath}`
                  : imageGenDownloadStatus.state === "error"
                    ? (imageGenDownloadStatus.error || "Errore sconosciuto")
                    : typeof imageGenDownloadStatus.totalBytes === "number" && imageGenDownloadStatus.totalBytes > 0
                      ? `${((imageGenDownloadStatus.downloadedBytes / imageGenDownloadStatus.totalBytes) * 100).toFixed(1)}% completato`
                      : "Calcolo dimensione in corso…"}
              </div>
            </div>
          )}
        </div>

        <div>
          <label style={S.label}>Trascrizione audio condivisa (fallback video)</label>
          <p style={{ fontSize:12, color:"#888", marginTop:2, marginBottom:8, lineHeight:1.5 }}>
            Se un video non ha sottotitoli disponibili, RecipeVault può scaricare l’audio e trascriverlo con Whisper.
          </p>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <button
              style={{ ...S.btnSecondary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"13px 16px", borderRadius:14 } : {}) }}
              onClick={autoDownloadWhisperModel}
              disabled={Boolean(whisperDownloadId) || whisperDownloadStatus?.state === "starting"}
            >
              {whisperDownloadId || whisperDownloadStatus?.state === "starting"
                ? "Scarico modello…"
                : `⬇️ Scarica ${LOCAL_MODEL_DOWNLOADS.whisper.label}`}
            </button>
            <span style={{ fontSize:12, color:"#888" }}>
              {LOCAL_MODEL_DOWNLOADS.whisper.sizeLabel} · {LOCAL_MODEL_DOWNLOADS.whisper.note}
            </span>
          </div>
          {whisperDownloadStatus && (
            <div style={{ marginTop:12, background:"rgba(253,250,244,0.6)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)", border:"1px solid rgba(255,255,255,0.4)", borderRadius:14, padding:"12px 14px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", marginBottom:8, fontSize:13, color:"#5C5245" }}>
                <strong>
                  {whisperDownloadStatus.state === "completed"
                    ? "Whisper scaricato"
                    : whisperDownloadStatus.state === "error"
                      ? "Download interrotto"
                      : "Download in corso"}
                </strong>
                <span>
                  {formatDownloadSize(whisperDownloadStatus.downloadedBytes || 0)}
                  {typeof whisperDownloadStatus.totalBytes === "number" ? ` / ${formatDownloadSize(whisperDownloadStatus.totalBytes)}` : ""}
                </span>
              </div>
              <div style={{ height:10, borderRadius:999, background:"#EDE8DC", overflow:"hidden" }}>
                <div style={{
                  height:"100%",
                  width: typeof whisperDownloadStatus.totalBytes === "number" && whisperDownloadStatus.totalBytes > 0
                    ? `${Math.min(100, (whisperDownloadStatus.downloadedBytes / whisperDownloadStatus.totalBytes) * 100)}%`
                    : whisperDownloadStatus.state === "completed" ? "100%" : "18%",
                  background:"linear-gradient(90deg,#2E7D32 0%,#66BB6A 100%)",
                  transition:"width .3s ease",
                }} />
              </div>
              <div style={{ fontSize:12, color:"#888", marginTop:8 }}>
                {whisperDownloadStatus.state === "completed"
                  ? "Whisper pronto. Trascrizione audio attiva automaticamente."
                  : whisperDownloadStatus.state === "error"
                    ? (whisperDownloadStatus.error || "Errore sconosciuto")
                    : typeof whisperDownloadStatus.totalBytes === "number" && whisperDownloadStatus.totalBytes > 0
                      ? `${((whisperDownloadStatus.downloadedBytes / whisperDownloadStatus.totalBytes) * 100).toFixed(1)}% completato`
                      : "Calcolo dimensione in corso…"}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const AiConfigModal = () => {
    const importProviderInfo = AI_PROVIDERS[importProvider];
    const importUsesApiKey = requiresApiKey(importProvider);
    const localModelPreset = importProvider === "local" ? getLocalModelPreset(importModel) : null;
    const modelChoices = importProvider === "local"
      ? getLocalModelChoices(isAndroidShell)
      : importProviderInfo.models;
    const localDownloadPreset = importProvider === "local"
      ? getLocalModelDownload(importModel, isAndroidShell)
      : null;
    const storageFiles = modelStorageStatus?.files ?? [];
    const inactiveStorageFiles = storageFiles.filter(file => !file.isActive);
    const renderStorageTab = () => (
      <div>
        <p style={{ fontSize:13, color:"#888", marginBottom:14, lineHeight:1.55 }}>
          Qui vedi quanto spazio occupano i modelli salvati dall'app e puoi rimuovere quelli non più referenziati dalla configurazione corrente.
        </p>

        <div style={{ display:"grid", gridTemplateColumns:isCompactUi ? "1fr" : "repeat(3, 1fr)", gap:10, marginBottom:14 }}>
          {[
            { label: "Totale", value: formatStorageSize(modelStorageStatus?.totalBytes || 0), tone: "#3C3526" },
            { label: "In uso", value: formatStorageSize(modelStorageStatus?.activeBytes || 0), tone: "#2E7D32" },
            { label: "Pulibile", value: formatStorageSize(modelStorageStatus?.inactiveBytes || 0), tone: "#C84B2F" },
          ].map(card => (
            <div key={card.label} style={{ background:"rgba(255,255,255,0.35)", border:"1px solid rgba(255,255,255,0.45)", borderRadius:16, padding:"14px 16px", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.35)" }}>
              <div style={{ fontSize:11, color:"#8E8475", textTransform:"uppercase", letterSpacing:".6px", marginBottom:6 }}>{card.label}</div>
              <div style={{ fontSize:22, fontWeight:700, color:card.tone }}>{card.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:12 }}>
          <button
            style={{ ...S.btnSecondary, ...(isCompactUi ? { flex:1, justifyContent:"center", padding:"13px 16px", borderRadius:14 } : {}) }}
            onClick={refreshModelStorage}
            disabled={loadingModelStorage || cleaningModelStorage}
          >
            {loadingModelStorage ? "Aggiorno…" : "🔄 Aggiorna spazio"}
          </button>
          <button
            style={{ ...S.btnSecondary, color: inactiveStorageFiles.length ? "#C84B2F" : "#8E8475", ...(isCompactUi ? { flex:1, justifyContent:"center", padding:"13px 16px", borderRadius:14 } : {}) }}
            onClick={requestCleanUnusedModels}
            disabled={loadingModelStorage || cleaningModelStorage || !inactiveStorageFiles.length}
          >
            {cleaningModelStorage ? "Pulisco…" : "🧹 Pulisci modelli non usati"}
          </button>
        </div>

        {modelStorageMessage && (
          <div style={{ ...S.noteBox, marginTop:0, marginBottom:12, color:"#3C3526" }}>
            {modelStorageMessage}
          </div>
        )}

        {modelStorageStatus?.rootPath && (
          <div style={{ fontSize:12, color:"#888", marginBottom:10, lineHeight:1.5 }}>
            Cartella modelli app: <span style={{ fontFamily:"monospace" }}>{modelStorageStatus.rootPath}</span>
          </div>
        )}

        {loadingModelStorage && !modelStorageStatus && (
          <div style={{ ...S.empty, padding:"36px 12px" }}>Analizzo lo spazio occupato dai modelli…</div>
        )}

        {!loadingModelStorage && modelStorageStatus && storageFiles.length === 0 && (
          <div style={{ ...S.empty, padding:"36px 12px" }}>Nessun modello salvato nella cartella dell'app.</div>
        )}

        {storageFiles.length > 0 && (
          <div style={{ display:"grid", gap:10 }}>
            {storageFiles.map(file => (
              <div key={file.path} style={{ background:"rgba(255,255,255,0.3)", border:"1px solid rgba(255,255,255,0.4)", borderRadius:14, padding:"12px 14px", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.3)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", marginBottom:6 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:"#3C3526", wordBreak:"break-word" }}>{file.name}</div>
                  <span style={{
                    fontSize:11,
                    fontWeight:600,
                    color:file.isActive ? "#2E7D32" : "#C84B2F",
                    background:file.isActive ? "rgba(46,125,50,0.12)" : "rgba(200,75,47,0.12)",
                    border:file.isActive ? "1px solid rgba(46,125,50,0.22)" : "1px solid rgba(200,75,47,0.22)",
                    borderRadius:999,
                    padding:"4px 8px",
                    whiteSpace:"nowrap",
                  }}>
                    {file.isActive ? "In uso" : "Non usato"}
                  </span>
                </div>
                <div style={{ fontSize:12, color:"#6F6558", marginBottom:6 }}>{formatStorageSize(file.sizeBytes)}</div>
                <div style={{ fontSize:11, color:"#8E8475", fontFamily:"monospace", wordBreak:"break-all" }}>{file.path}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );

    return <>
      <h2 style={S.modalTitle}>⚙️ Configurazione AI</h2>
      <div style={{ ...S.switchRow, marginBottom:14, ...(isCompactUi ? { flexDirection:"column", gap:6, background:"transparent", padding:0 } : {}) }}>
        <button
          style={{ ...S.switchOpt, ...(aiConfigTab==="settings" ? S.switchActive : S.switchInact), ...(isCompactUi ? { border:"1px solid #D8D0BE", padding:"12px 14px", textAlign:"left" } : {}) }}
          onClick={() => setAiConfigTab("settings")}
        >
          ⚙️ Impostazioni
        </button>
        <button
          style={{ ...S.switchOpt, ...(aiConfigTab==="storage" ? S.switchActive : S.switchInact), ...(isCompactUi ? { border:"1px solid #D8D0BE", padding:"12px 14px", textAlign:"left" } : {}) }}
          onClick={() => setAiConfigTab("storage")}
        >
          💾 Spazio modelli
        </button>
      </div>
      {aiConfigTab === "settings" ? <>
      <p style={{ fontSize:13, color:"#888", marginBottom:14, lineHeight:1.55 }}>
        Configura provider, modelli e runtime una volta sola. Qui puoi scegliere separatamente il provider predefinito per gli import e quello per la ricerca AI.
      </p>

      <div style={{ marginBottom:16 }}>
        <label style={S.label}>Provider attivi</label>
        <div style={{ display:"grid", gap:8 }}>
          {Object.entries(AI_PROVIDERS).map(([key, provider]) => {
            const provPrefs = aiPrefs.providers?.[key] || {};
            const isEnabled = provPrefs.enabled !== undefined ? provPrefs.enabled : (key === "local" || Boolean(provPrefs.apiKey?.trim()));
            return (
              <div key={key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"rgba(255,255,255,0.3)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)", borderRadius:12, border:"1px solid rgba(255,255,255,0.4)", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.3)" }}>
                <span style={{ fontSize:13, color:"#3C3526" }}>{provider.icon} {provider.name}</span>
                <button
                  style={{
                    width:44, height:24, borderRadius:12, border:"1px solid rgba(0,0,0,0.08)", cursor: key === "local" ? "default" : "pointer",
                    background: isEnabled ? "linear-gradient(180deg, #4a8254 0%, #3D6B47 100%)" : "linear-gradient(180deg, #ddd8cc 0%, #c8c0b4 100%)",
                    position:"relative", transition:"background .2s", opacity: key === "local" ? 0.7 : 1,
                    boxShadow: isEnabled ? "inset 0 1px 3px rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.1)" : "inset 0 1px 3px rgba(0,0,0,0.1)",
                  }}
                  onClick={() => {
                    if (key === "local") return;
                    const nextEnabled = !isEnabled;
                    saveAiPrefs({
                      ...aiPrefs,
                      providers: {
                        ...aiPrefs.providers,
                        [key]: { ...aiPrefs.providers[key], enabled: nextEnabled },
                      },
                    });
                  }}
                  title={key === "local" ? "Il provider locale è sempre attivo" : (isEnabled ? "Disattiva" : "Attiva")}
                >
                  <span style={{
                    position:"absolute", top:2, left: isEnabled ? 22 : 2,
                    width:20, height:20, borderRadius:"50%",
                    background:"linear-gradient(180deg, #fff 0%, #f0ece4 100%)",
                    boxShadow:"0 1px 4px rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,0.9)",
                    transition:"left .2s ease",
                  }} />
                </button>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize:12, color:"#888", marginTop:6, lineHeight:1.5 }}>
          Disattiva i provider che non vuoi vedere nella selezione rapida dell'import. Il provider locale è sempre attivo.
        </p>
      </div>

      <div style={{ marginBottom:14 }}>
        <label style={S.label}>Provider predefinito per import</label>
        <select
          style={S.input}
          value={defaultImportProviderKey}
          onChange={e => {
            const nextProvider = e.target.value;
            saveAiPrefs({
              ...aiPrefs,
              importProvider: nextProvider,
              lastProvider: nextProvider,
            });
            loadProviderDraft(nextProvider);
          }}
        >
          {Object.entries(AI_PROVIDERS).filter(([key]) => {
            const p = aiPrefs.providers?.[key]; return key === "local" || (p?.enabled !== undefined ? p.enabled : Boolean(p?.apiKey?.trim()));
          }).map(([key, provider]) => (
            <option key={key} value={key}>{provider.icon} {provider.name}</option>
          ))}
        </select>
        <p style={{ fontSize:12, color:"#888", marginTop:5, lineHeight:1.5 }}>
          Questo provider viene preselezionato quando apri `Importa da URL` o `Importa da foto`. Dentro l'import puoi comunque cambiarlo al volo.
        </p>
      </div>

      <div style={{ marginBottom:16 }}>
        <label style={S.label}>Provider predefinito per ricerca AI</label>
        <select
          style={S.input}
          value={searchProviderKey}
          onChange={e => saveAiPrefs({ ...aiPrefs, searchProvider: e.target.value })}
        >
          {Object.entries(AI_PROVIDERS).filter(([key]) => {
            const p = aiPrefs.providers?.[key]; return key === "local" || (p?.enabled !== undefined ? p.enabled : Boolean(p?.apiKey?.trim()));
          }).map(([key, provider]) => (
            <option key={key} value={key}>{provider.icon} {provider.name}</option>
          ))}
        </select>
        <p style={{ fontSize:12, color:"#888", marginTop:5, lineHeight:1.5 }}>
          Questo provider viene usato per la ricerca testuale nel ricettario e per la generazione della lista della spesa.
        </p>
      </div>

      {renderCommonAiAssetsBlock()}

      <div style={{ ...S.switchRow, marginBottom:12, ...(isCompactUi ? { flexDirection:"column", gap:6, background:"transparent", padding:0 } : {}) }}>
        {Object.entries(AI_PROVIDERS).map(([key, provider]) => (
          <button
            key={key}
            style={{ ...S.switchOpt, ...(importProvider===key ? S.switchActive : S.switchInact), ...(isCompactUi ? { border:"1px solid #D8D0BE", padding:"12px 14px", textAlign:"left" } : {}) }}
            onClick={() => switchImportProvider(key)}
          >
            {provider.icon} {provider.name}
          </button>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:isCompactUi ? "1fr" : "1fr 1fr", gap:10 }}>
        {importUsesApiKey ? (
          <div style={{ gridColumn:"1 / -1" }}>
            <label style={S.label}>API Key — {importProviderInfo.name}</label>
            <input
              style={{ ...S.input, fontFamily:"monospace", letterSpacing:".3px" }}
              type="password"
              placeholder={importProviderInfo.keyPlaceholder}
              value={importApiKey}
              onChange={e => { setImportApiKey(e.target.value); setImportKeyStatus(null); setErr(""); }}
            />
            <p style={{ fontSize:12, color:"#aaa", marginTop:5 }}>
              Ottienila su <a href={importProviderInfo.keyHintUrl} target="_blank" rel="noreferrer" style={{ color:"#C84B2F" }}>{importProviderInfo.keyHint}</a>
            </p>
          </div>
        ) : (
          <>
            <div style={{ gridColumn:"1 / -1" }}>
              <label style={S.label}>Percorso modello locale</label>
              <input
                style={{ ...S.input, fontFamily:"monospace", letterSpacing:".2px" }}
                placeholder={isAndroidShell ? localModelPreset?.androidPlaceholder : localModelPreset?.desktopPlaceholder}
                value={importLocalModelPath}
                onChange={e => { setImportLocalModelPath(e.target.value); setImportKeyStatus(null); setErr(""); }}
              />
              <p style={{ fontSize:12, color:"#888", marginTop:5, lineHeight:1.5 }}>
                {isAndroidShell
                  ? localModelPreset?.androidHint
                  : localModelPreset?.desktopHint}
              </p>
              <p style={{ fontSize:12, color:"#888", marginTop:5, lineHeight:1.5 }}>
                {isAndroidShell
                  ? "Usa `@bundled` per il modello incluso nell'app, oppure un file MediaPipe/LiteRT `.task` copiato sul device."
                  : "Usa un modello GGUF locale compatibile con llama.cpp. Il preset E4B è quello consigliato sul desktop."}
              </p>
              {localDownloadPreset && (
                <div style={{ marginTop:10, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  <button
                    style={{ ...S.btnSecondary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"13px 16px", borderRadius:14 } : {}) }}
                    onClick={autoDownloadLocalModel}
                    disabled={Boolean(localDownloadId) || localDownloadStatus?.state === "starting"}
                  >
                    {localDownloadId || localDownloadStatus?.state === "starting" ? "Scarico modello…" : `⬇️ Scarica ${localDownloadPreset.label}`}
                  </button>
                  <span style={{ fontSize:12, color:"#888" }}>
                    {localDownloadPreset.sizeLabel} · {localDownloadPreset.note}
                  </span>
                </div>
              )}
              {localDownloadStatus && importProvider === "local" && (
                <div style={{ marginTop:12, background:"rgba(253,250,244,0.6)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)", border:"1px solid rgba(255,255,255,0.4)", borderRadius:14, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", marginBottom:8, fontSize:13, color:"#5C5245" }}>
                    <strong>
                      {localDownloadStatus.state === "completed"
                        ? "Modello scaricato"
                        : localDownloadStatus.state === "error"
                          ? "Download interrotto"
                          : "Download in corso"}
                    </strong>
                    <span>
                      {formatDownloadSize(localDownloadStatus.downloadedBytes || 0)}
                      {typeof localDownloadStatus.totalBytes === "number"
                        ? ` / ${formatDownloadSize(localDownloadStatus.totalBytes)}`
                        : ""}
                    </span>
                  </div>
                  <div style={{ height:10, borderRadius:999, background:"#EDE8DC", overflow:"hidden" }}>
                    <div
                      style={{
                        height:"100%",
                        width: typeof localDownloadStatus.totalBytes === "number" && localDownloadStatus.totalBytes > 0
                          ? `${Math.min(100, (localDownloadStatus.downloadedBytes / localDownloadStatus.totalBytes) * 100)}%`
                          : localDownloadStatus.state === "completed"
                            ? "100%"
                            : "18%",
                        background:"linear-gradient(90deg,#C84B2F 0%,#E8A838 100%)",
                        transition:"width .3s ease",
                      }}
                    />
                  </div>
                  <div style={{ fontSize:12, color:"#888", marginTop:8 }}>
                    {localDownloadStatus.state === "completed"
                      ? `Salvato in ${localDownloadStatus.path}`
                      : localDownloadStatus.state === "error"
                        ? (localDownloadStatus.error || "Errore sconosciuto")
                        : typeof localDownloadStatus.totalBytes === "number" && localDownloadStatus.totalBytes > 0
                          ? `${((localDownloadStatus.downloadedBytes / localDownloadStatus.totalBytes) * 100).toFixed(1)}% completato`
                          : "Calcolo dimensione totale in corso…"}
                  </div>
                </div>
              )}
              {isAndroidShell && (
                <div style={{ marginTop:12, background:"rgba(253,250,244,0.6)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)", border:"1px solid rgba(255,255,255,0.4)", borderRadius:14, padding:"12px 14px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", marginBottom:8 }}>
                    <strong style={{ fontSize:13, color: androidBundledModelStatus?.found ? "#2E7D32" : "#5C5245" }}>
                      {androidBundledModelStatus?.found ? "Modello Android incluso" : "Modello incluso"}
                    </strong>
                    <button
                      style={{ ...S.btnSecondary, padding:"8px 12px", fontSize:12 }}
                      onClick={() => detectAndroidBundledModel({ applyDefault: false })}
                      disabled={checkingAndroidBundledModel}
                    >
                      {checkingAndroidBundledModel ? "Controllo…" : "Aggiorna"}
                    </button>
                  </div>
                  <div style={{ fontSize:12, color:"#888", lineHeight:1.55 }}>
                    {androidBundledModelStatus?.found
                      ? `Asset: ${androidBundledModelStatus.assetPath}`
                      : androidBundledModelStatus?.error || "Controllo dei modelli bundlettati in corso…"}
                  </div>
                  {androidBundledModelStatus?.found && (
                    <>
                      <div style={{ fontSize:12, color:"#888", marginTop:6, lineHeight:1.55 }}>
                        Copiato internamente in: {androidBundledModelStatus.resolvedPath}
                      </div>
                      <div style={{ marginTop:10 }}>
                        <button
                          style={{ ...S.btnSecondary, width:"100%", justifyContent:"center", padding:"11px 14px", borderRadius:14 }}
                          onClick={() => {
                            setImportLocalModelPath("@bundled");
                            setImportKeyStatus(null);
                            setErr("");
                          }}
                        >
                          Usa modello incluso
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {!localDownloadPreset && (
                <p style={{ fontSize:12, color:"#888", marginTop:8 }}>
                  Per questo modello inserisci manualmente il percorso del file locale.
                </p>
              )}
            </div>
            {!isAndroidShell && (
              <div style={{ gridColumn:"1 / -1" }}>
                <label style={S.label}>Runtime desktop</label>
                <input
                  style={{ ...S.input, fontFamily:"monospace" }}
                  placeholder="@auto oppure /percorso/llama-cli"
                  value={importLocalRuntimePath}
                  onChange={e => { setImportLocalRuntimePath(e.target.value); setImportKeyStatus(null); setErr(""); setRuntimeStatus(null); }}
                />
                <p style={{ fontSize:12, color:"#888", marginTop:5 }}>
                  Usa <strong>@auto</strong> per preferire il runtime incorporato, oppure inserisci comando/percorso assoluto di <strong>llama-cli</strong>.
                </p>
                <div style={{ marginTop:10, display:"flex", gap:8, flexWrap:"wrap" }}>
                  <button
                    style={{ ...S.btnSecondary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"13px 16px", borderRadius:14 } : {}) }}
                    onClick={() => detectDesktopRuntime({ runtimePath: importLocalRuntimePath, applyResolvedPath: true })}
                    disabled={checkingRuntime}
                  >
                    {checkingRuntime ? "Controllo runtime…" : "🔎 Rileva llama.cpp"}
                  </button>
                  {runtimeStatus?.suggestedCommand && (
                    <button
                      style={{ ...S.btnSecondary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"13px 16px", borderRadius:14 } : {}) }}
                      onClick={() => copyInstallCommand(runtimeStatus.suggestedCommand)}
                    >
                      {copiedInstallCmd ? "✅ Comando copiato" : "📋 Copia comando installazione"}
                    </button>
                  )}
                </div>
                <div style={{ marginTop:10, background:"rgba(253,250,244,0.6)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)", border:"1px solid rgba(255,255,255,0.4)", borderRadius:14, padding:"12px 14px" }}>
                  <div style={{ fontSize:13, color: runtimeStatus?.found ? "#2E7D32" : "#5C5245", fontWeight:600, marginBottom:6 }}>
                    {runtimeStatus?.found
                      ? "llama.cpp rilevato"
                      : checkingRuntime
                        ? "Controllo runtime in corso…"
                        : "Setup guidato llama.cpp"}
                  </div>
                  <div style={{ fontSize:12, color:"#888", lineHeight:1.55 }}>
                    {runtimeStatus?.found
                      ? `${runtimeStatus.source === "bundled" ? "Runtime incorporato" : "Runtime di sistema"} · ${runtimeStatus.resolvedPath}${runtimeStatus.version ? ` · ${runtimeStatus.version}` : ""}`
                      : runtimeStatus?.error
                        ? runtimeStatus.error
                        : "Ti aiuto a verificare se `llama-cli` è già installato oppure a preparare il comando Homebrew corretto."}
                  </div>
                  {!runtimeStatus?.found && (
                    <div style={{ fontSize:12, color:"#888", marginTop:8, lineHeight:1.5 }}>
                      {runtimeStatus?.brewAvailable === false
                        ? "Homebrew non risulta disponibile. Puoi comunque indicare manualmente il percorso di `llama-cli`."
                        : "Se usi Homebrew, il comando consigliato è `brew install llama.cpp`."}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        <div>
          <label style={S.label}>{importProvider === "local" ? "Modalità modello locale" : "Modello"}</label>
          <select
            style={S.input}
            value={importModel}
            onChange={e => { setImportModel(e.target.value); setImportKeyStatus(null); setErr(""); }}
          >
            {modelChoices.map(modelName => (
              <option key={modelName} value={modelName}>
                {importProvider === "local" ? getLocalModelOptionLabel(modelName, isAndroidShell) : modelName}
              </option>
            ))}
          </select>
          {importProvider === "local" && localModelPreset && (
            <p style={{ fontSize:12, color:"#888", marginTop:5, lineHeight:1.5 }}>
              {isAndroidShell ? localModelPreset.androidHint : localModelPreset.desktopHint}
            </p>
          )}
        </div>
        <div style={{ display:"flex", alignItems:"end" }}>
          <button style={{ ...S.btnSecondary, width:"100%", justifyContent:"center", ...(isCompactUi ? { padding:"13px 16px", borderRadius:14 } : {}) }} onClick={testImportKey} disabled={testingImportKey}>
            {testingImportKey ? "Verifico…" : importUsesApiKey ? "Verifica chiave" : "Verifica modello"}
          </button>
        </div>
      </div>

      {importProvider === "openai" && (
        <p style={{ fontSize:12, color:"#888", marginTop:8 }}>
          💡 OpenAI usa il modello scelto per foto e ricerca testuale; per gli URL web sfrutta automaticamente la web search integrata.
        </p>
      )}
      {importProvider === "claude" && (
        <p style={{ fontSize:12, color:"#888", marginTop:8 }}>
          💡 Claude usa il modello scelto con supporto web search per gli URL e analisi diretta delle foto.
        </p>
      )}
      {importProvider === "local" && (
        <p style={{ fontSize:12, color:"#888", marginTop:8, lineHeight:1.5 }}>
          💡 Il provider locale usa il modello testuale per pagine e ricerca, il modello vision per foto e video e il runtime immagini condiviso per generare una foto del piatto dalle ricette importate da libro.
        </p>
      )}
      {importKeyStatus === "ok" && (
        <div style={{ color:"#2E7D32", fontSize:13, marginTop:8 }}>
          ✅ {importUsesApiKey ? "Chiave verificata" : "Modello pronto"} e configurazione salvata localmente
        </div>
      )}
      {importKeyStatus === "err" && !err && (
        <div style={{ color:"#C84B2F", fontSize:13, marginTop:8 }}>
          {importUsesApiKey ? "Chiave non valida" : "Modello o runtime non validi"}
        </div>
      )}

      {err && <div style={{ ...S.errMsg, marginTop:10 }}>{err}</div>}

      <div style={{ borderTop:"1px solid rgba(224,216,200,0.6)", marginTop:18, paddingTop:16 }}>
        <div style={S.label}>Preferenze</div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", marginTop:8, background:"rgba(255,255,255,0.3)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)", borderRadius:12, border:"1px solid rgba(255,255,255,0.4)", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.3)" }}>
          <div>
            <span style={{ fontSize:13, color:"#3C3526" }}>Sistema di misura predefinito</span>
            <p style={{ fontSize:12, color:"#888", marginTop:2 }}>{useImperial ? "Unità imperiali (cup, oz, lb)" : "Sistema metrico (g, ml, kg)"}</p>
          </div>
          <button
            style={{
              width:44, height:24, borderRadius:12, border:"1px solid rgba(0,0,0,0.08)", cursor:"pointer",
              background: useImperial ? "linear-gradient(180deg, #4a8254 0%, #3D6B47 100%)" : "linear-gradient(180deg, #ddd8cc 0%, #c8c0b4 100%)",
              position:"relative", transition:"background .2s",
              boxShadow: useImperial ? "inset 0 1px 3px rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.1)" : "inset 0 1px 3px rgba(0,0,0,0.1)",
            }}
            onClick={toggleImperial}
            title={useImperial ? "Passa a metrico" : "Passa a imperiale"}
          >
            <span style={{
              position:"absolute", top:2, left: useImperial ? 22 : 2,
              width:20, height:20, borderRadius:"50%",
              background:"linear-gradient(180deg, #fff 0%, #f0ece4 100%)",
              boxShadow:"0 1px 4px rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,0.9)",
              transition:"left .2s ease",
            }} />
          </button>
        </div>
      </div>

      <div style={{ borderTop:"1px solid rgba(224,216,200,0.6)", marginTop:18, paddingTop:16 }}>
        <div style={S.label}>Backup dati</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:8 }}>
          <button style={S.btnSecondary} onClick={exportJSON}>⬆️ Esporta JSON</button>
          <button style={S.btnSecondary} onClick={importJSON}>⬇️ Importa JSON</button>
        </div>
      </div>
      </> : renderStorageTab()}

      <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:18, ...(isCompactUi ? { flexDirection:"column-reverse" } : {}) }}>
        <button
          style={{ ...S.btnSecondary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"13px 16px", borderRadius:16 } : {}) }}
          onClick={closeAiConfigModal}
        >
          {aiConfigReturnMode === "import" ? "Torna all'import" : "Chiudi"}
        </button>
      </div>
    </>;
  };

  const ImportModal = () => {
    const isPhotoMode = importMode === "photo";
    const importProviderInfo = AI_PROVIDERS[importProvider];
    const activeLocalModelPreset = importProvider === "local" ? getLocalModelPreset(importModel) : null;
    const src = url ? detectSource(url) : null;
    const requiresCaptionRecovery = Boolean(src && ["tiktok", "instagram", "facebook"].includes(src));
    const socialCaptionLock = requiresCaptionRecovery && (socialPreviewPending || fetchingSocialPreview);
    const srcInfo = src && { tiktok:{icon:"🎵",label:"TikTok",color:"#555",bg:"#EEEEFF"}, instagram:{icon:"📸",label:"Instagram",color:"#833AB4",bg:"#F5EEF8"}, youtube:{icon:"▶️",label:"YouTube",color:"#CC0000",bg:"#FFF0F0"}, web:{icon:"🌐",label:"Sito web",color:"#2E7D32",bg:"#E8F5E9"}, facebook:{icon:"👤",label:"Facebook",color:"#1877F2",bg:"#EEF4FF"} }[src];
    const modeTitle = isPhotoMode ? "📷 Importa da foto" : "🔗 Importa da URL";
    const modeSubtitle = isPhotoMode
      ? "Carica la foto di un piatto e lascia che l'AI ricostruisca una ricetta plausibile."
      : "Sito di ricette, blog, YouTube, TikTok, Instagram…";

    const handlePhotoSelection = async event => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const dataUrl = await optimizeImageForImport(file);
        setPhotoDataUrl(dataUrl);
        setPhotoFileName(file.name || "foto-piatto");
        setErr("");
      } catch (error) {
        setErr(error.message);
      } finally {
        event.target.value = "";
      }
    };

    return <>
      <h2 style={S.modalTitle}>{modeTitle}</h2>
      <p style={{ fontSize:13, color:"#888", marginBottom:14, lineHeight:1.5 }}>{modeSubtitle}</p>
      <div style={{ ...S.switchRow, marginBottom:14, ...(isCompactUi ? { flexDirection:"row" } : {}) }}>
        <button
          style={{ ...S.switchOpt, ...(importMode==="url" ? S.switchActive : S.switchInact) }}
          onClick={() => { setImportMode("url"); setErr(""); }}
        >
          🔗 URL
        </button>
        <button
          style={{ ...S.switchOpt, ...(importMode==="photo" ? S.switchActive : S.switchInact) }}
          onClick={() => { setImportMode("photo"); setErr(""); }}
        >
          📷 Foto
        </button>
      </div>
      <div style={{ background:"rgba(245,240,232,0.5)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", borderRadius:isCompactUi ? 18 : 12, marginBottom:16, padding:isCompactUi ? 16 : 14, border:"1px solid rgba(255,255,255,0.3)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"flex-start", flexWrap:"wrap" }}>
          <div style={{ minWidth:0, flex:1 }}>
            <div style={{ fontSize:12, textTransform:"uppercase", letterSpacing:"1px", color:"#8A7C69", marginBottom:6 }}>
              AI selezionata per questo import
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:"#3C3526", marginBottom:4 }}>
              {importProviderInfo.icon} {importProviderInfo.name}
            </div>
            <div style={{ fontSize:13, color:"#6F6558", lineHeight:1.55 }}>
              Modello: <strong>{importProvider === "local" && activeLocalModelPreset ? `${activeLocalModelPreset.label} — ${activeLocalModelPreset.modeLabel}` : importModel}</strong>
              {importProvider === "local"
                ? ` · ${importLocalModelPath?.trim() ? `modello ${importLocalModelPath.split("/").pop()}` : "modello locale non configurato"}`
                : ` · ${importApiKey.trim() ? "chiave API salvata" : "chiave API mancante"}`}
            </div>
            {importProvider === "local" && !isAndroidShell && importVisionModelPath?.trim() && (
              <div style={{ fontSize:12, color:"#7A7062", marginTop:6 }}>
                Vision: {importVisionModelPath.split("/").pop()}
              </div>
            )}
            {importProvider === defaultImportProviderKey && (
              <div style={{ fontSize:12, color:"#2E7D32", marginTop:6 }}>
                ✅ È il provider predefinito per gli import
              </div>
            )}
            {importProvider === searchProviderKey && (
              <div style={{ fontSize:12, color:"#2E7D32", marginTop:6 }}>
                ✅ È anche il provider predefinito per ricerca AI e lista della spesa
              </div>
            )}
          </div>
          <div style={{ display:"flex", flexDirection:"column", alignItems:isCompactUi ? "stretch" : "flex-end", gap:8, minWidth:isCompactUi ? "100%" : 180 }}>
            <div style={{ fontSize:11, color:importConfigReady ? "#2E7D32" : "#C84B2F", fontWeight:700, textTransform:"uppercase", letterSpacing:".8px" }}>
              {importConfigReady ? "Configurato" : "Da configurare"}
            </div>
            <button
              style={{ ...S.btnSecondary, width:isCompactUi ? "100%" : "auto", justifyContent:"center", ...(isCompactUi ? { padding:"13px 16px", borderRadius:14 } : {}) }}
              onClick={() => openAiConfigModal({ provider: importProvider, returnMode: "import" })}
            >
              ⚙️ Apri configurazione AI
            </button>
          </div>
        </div>
      </div>
      <div style={{ ...S.switchRow, marginBottom:14, ...(isCompactUi ? { flexDirection:"column", gap:6, background:"transparent", padding:0 } : {}) }}>
        {Object.entries(AI_PROVIDERS).filter(([key]) => {
          if (key === "local") return true;
          const provPrefs = aiPrefs.providers?.[key] || {};
          const isEnabled = provPrefs.enabled !== undefined ? provPrefs.enabled : Boolean(provPrefs.apiKey?.trim());
          const isConfigured = key === "local" ? Boolean(provPrefs.localModelPath?.trim()) : Boolean(provPrefs.apiKey?.trim());
          return isEnabled && isConfigured;
        }).map(([key, provider]) => (
          <button
            key={key}
            style={{ ...S.switchOpt, ...(importProvider===key ? S.switchActive : S.switchInact), ...(isCompactUi ? { border:"1px solid #D8D0BE", padding:"12px 14px", textAlign:"left" } : {}) }}
            onClick={() => switchImportProvider(key)}
          >
            {provider.icon} {provider.name}
          </button>
        ))}
      </div>
      {!isPhotoMode ? (
        <>
          {srcInfo && (
            <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:srcInfo.bg, color:srcInfo.color, borderRadius:6, padding:"3px 10px", fontSize:12, fontWeight:600, marginBottom:10 }}>
              {srcInfo.icon} {srcInfo.label} rilevato
            </div>
          )}
          <div style={{ marginBottom:12 }}>
            <label style={S.label}>URL</label>
            <input style={S.input} placeholder="https://…" value={url}
              onChange={e=>{
                const nextUrl = e.target.value;
                setUrl(nextUrl);
                setCaption("");
                setErr("");
                setSocialPreview(null);
                setSocialPreviewPending(["tiktok","instagram","facebook"].includes(detectSource(nextUrl)));
              }}
              onKeyDown={e=>e.key==="Enter"&&!caption&&!socialCaptionLock&&doImport({
                provider: importProvider,
                apiKey: importApiKey,
                model: importModel,
                localModelPath: importLocalModelPath,
                localRuntimePath: importLocalRuntimePath,
                visionModelPath: importVisionModelPath,
              })}/>
          </div>
          {src && ["tiktok","instagram","facebook"].includes(src) && (
            <div style={{ marginBottom:12 }}>
              {socialCaptionLock && (
                <div style={{ fontSize:13, color:"#888", marginBottom:10, display:"flex", alignItems:"center", gap:8, padding:"10px 14px", background:"#f9f6f0", borderRadius:10, border:"1px solid #e8e0d0" }}>
                  <span style={{ display:"inline-block", width:18, height:18, border:"2.5px solid #ddd", borderTopColor:"#A0522D", borderRadius:"50%", animation:"spin 0.8s linear infinite", flexShrink:0 }} />
                  <span>
                    {fetchingSocialPreview
                      ? `Recupero didascalia da ${src === "tiktok" ? "TikTok" : src === "instagram" ? "Instagram" : "Facebook"}…`
                      : "Preparo il recupero della didascalia…"}
                  </span>
                </div>
              )}
              {socialPreview?.thumbnail && (
                <div style={{ borderRadius:12, overflow:"hidden", marginBottom:10, maxHeight:160 }}>
                  <img src={socialPreview.thumbnail} alt={socialPreview.title || ""} style={{ width:"100%", maxHeight:160, objectFit:"cover" }} onError={e => e.target.parentElement.style.display = "none"} />
                </div>
              )}
              {socialPreview?.title && (
                <div style={{ fontSize:14, fontWeight:600, color:"#3C3526", marginBottom:6 }}>{socialPreview.title}</div>
              )}
              <label style={S.label}>Didascalia / testo video {socialPreview?.description ? "" : <span style={{ fontWeight:400, textTransform:"none", color:"#aaa" }}>(consigliata)</span>}</label>
              <textarea style={{ ...S.input, minHeight:90, resize:"vertical" }}
                placeholder={socialPreview?.found ? "Didascalia recuperata automaticamente" : "Incolla qui la descrizione del video o gli ingredienti nella didascalia…"}
                value={caption} onChange={e=>{setCaption(e.target.value);setErr("");}}/>
              {socialPreview?.found
                ? <div style={{ fontSize:11, color:"#2E7D32", marginTop:4 }}>✅ Didascalia recuperata automaticamente dal browser</div>
                : <div style={{ fontSize:11, color:"#aaa", marginTop:4 }}>💡 Loggati su {src==="tiktok"?"TikTok":"Instagram"} in Chrome/Firefox per il recupero automatico, oppure incolla manualmente</div>
              }
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ marginBottom:14 }}>
            <label style={S.label}>Tipo di foto</label>
            <div style={{ ...S.switchRow, marginBottom:0 }}>
              <button
                style={{ ...S.switchOpt, ...(photoType==="dish" ? S.switchActive : S.switchInact) }}
                onClick={() => setPhotoType("dish")}
              >
                🍽️ Foto piatto
              </button>
              <button
                style={{ ...S.switchOpt, ...(photoType==="book" ? S.switchActive : S.switchInact) }}
                onClick={() => setPhotoType("book")}
              >
                📖 Ricetta da libro
              </button>
            </div>
            <p style={{ fontSize:12, color:"#888", marginTop:6, lineHeight:1.5 }}>
              {photoType === "book"
                ? "Fotografa la pagina del libro, rivista o appunti: l'AI leggerà il testo e trascriverà la ricetta."
                : "Fotografa un piatto: l'AI lo riconoscerà e ricostruirà una ricetta plausibile."}
            </p>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={S.label}>{photoType === "book" ? "Foto della ricetta" : "Foto del piatto"}</label>
            <label style={{
              display:"block",
              border:"1.5px dashed #D8D0BE",
              background:"rgba(249,245,238,0.6)",
              backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)",
              borderRadius:isCompactUi ? 18 : 14,
              padding:isCompactUi ? 18 : 16,
              cursor:"pointer",
            }}>
              <input type="file" accept="image/*,.webp,.heic,.heif" style={{ display:"none" }} onChange={handlePhotoSelection} />
              {photoDataUrl ? (
                <div>
                  <div style={{ borderRadius:14, overflow:"hidden", marginBottom:10, maxHeight:isCompactUi ? 260 : 220 }}>
                    <img src={photoDataUrl} alt={photoFileName || "Foto"} style={{ width:"100%", maxHeight:isCompactUi ? 260 : 220, objectFit:"cover" }} />
                  </div>
                  <div style={{ fontSize:13, color:"#5C5245", fontWeight:600 }}>{photoFileName || "Foto selezionata"}</div>
                  <div style={{ fontSize:12, color:"#8A7C69", marginTop:4 }}>Tocca per sostituire la foto</div>
                </div>
              ) : (
                <div style={{ textAlign:"center", color:"#7A7062" }}>
                  <div style={{ fontSize:36, marginBottom:8 }}>{photoType === "book" ? "📖" : "📷"}</div>
                  <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>
                    {photoType === "book" ? "Seleziona la foto della ricetta" : "Seleziona una foto del piatto"}
                  </div>
                  <div style={{ fontSize:12, lineHeight:1.5 }}>JPG, PNG, WebP, HEIC — foto dal telefono, desktop o screenshot.</div>
                </div>
              )}
            </label>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={S.label}>Contesto aggiuntivo (opzionale)</label>
            <textarea
              style={{ ...S.input, minHeight:88, resize:"vertical" }}
              placeholder={photoType === "book"
                ? "Es. il libro è in francese, la ricetta è per 6 persone, pagina 42…"
                : "Es. è una pasta ai funghi cremosa, porzione per 2 persone, cucina calabrese…"}
              value={photoNote}
              onChange={e => { setPhotoNote(e.target.value); setErr(""); }}
            />
            <div style={{ fontSize:12, color:"#888", marginTop:5, lineHeight:1.5 }}>
              {photoType === "book"
                ? "Se il testo è in un’altra lingua o se vuoi aggiungere indicazioni, scrivile qui."
                : "Aiuta l’AI se conosci già qualche dettaglio del piatto, ma puoi anche lasciare vuoto."}
            </div>
          </div>
          {importProvider === "local" && (
            <div style={{ marginBottom:12, background:"#FFF8EC", border:"1px solid #F0D89A", borderRadius:12, padding:"12px 14px", fontSize:12, color:"#7A5C00", lineHeight:1.55 }}>
              {isAndroidShell
                ? "Il provider locale su Android non supporta ancora l’analisi foto. Per questa modalità usa Claude/OpenAI oppure il desktop con Modello vision configurato."
                : "Per il provider locale serve configurare anche il Modello vision nel pannello Configurazione AI."}
            </div>
          )}
        </>
      )}
      {err && <div style={S.errMsg}>{err}</div>}
      <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:18, ...(isCompactUi ? { flexDirection:"column-reverse" } : {}) }}>
        <button style={S.btnSecondary} onClick={()=>{setModal(null);resetImportDraft();}}>Annulla</button>
        <button
          style={{ ...S.btnPrimary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"14px 18px", borderRadius:16 } : {}) }}
          onClick={() => isPhotoMode
            ? doImportPhoto({
                provider: importProvider,
                apiKey: importApiKey,
                model: importModel,
                localModelPath: importLocalModelPath,
                localRuntimePath: importLocalRuntimePath,
                visionModelPath: importVisionModelPath,
              })
            : doImport({
                provider: importProvider,
                apiKey: importApiKey,
                model: importModel,
                localModelPath: importLocalModelPath,
                localRuntimePath: importLocalRuntimePath,
                visionModelPath: importVisionModelPath,
              })}
          disabled={loading || !importConfigReady || (isPhotoMode ? !photoDataUrl : (!url.trim() || socialCaptionLock))}
        >
          {loading
            ? loadMsg
            : !importConfigReady
              ? "Configura AI per continuare"
            : !isPhotoMode && socialCaptionLock
              ? "Recupero didascalia…"
              : isPhotoMode && photoType === "book"
                ? (importProvider === "local" ? "Leggi ricetta in locale →" : "Leggi ricetta con AI →")
                : isPhotoMode && importProvider === "local"
                ? "Importa foto in locale →"
                : isPhotoMode
                  ? "Importa foto con AI →"
              : importProvider === "local"
                ? "Importa in locale →"
                : "Importa con AI →"}
        </button>
      </div>
    </>;
  };

  const aiSearchActive = aiSearchResultIds !== null;
  const homeEmptyTitle = aiSearchActive
    ? "Nessuna ricetta trovata"
    : ingredientFilter
      ? `Nessuna ricetta con ${formatIngredientFacet(ingredientFilter)}`
      : "Nessuna ricetta";
  const homeEmptyDescription = aiSearchActive
    ? `La richiesta "${aiSearchQuery}" non ha trovato risultati nel tuo ricettario.`
    : ingredientFilter
      ? "Prova a togliere il filtro ingrediente o a cambiare categoria."
      : "Importa un link o inserisci una ricetta manualmente.";

  const closeCurrentModal = () => {
    if (modal === "import") {
      resetImportDraft();
      setModal(null);
      return;
    }
    if (modal === "ai-config") {
      closeAiConfigModal();
      return;
    }
    setModal(null);
  };

  // ── Layout ──
  return (
    <div style={{ ...S.app, ...(isCompactUi ? { display:"block", minHeight:"100dvh", height:"auto", overflow:"visible", background:"linear-gradient(135deg, #e8e0d4 0%, #d4cfc6 50%, #c8c0b4 100%)" } : {}) }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        button:disabled { opacity:.5; cursor:not-allowed; }
      `}</style>

      {!isCompactUi && (
        <div style={S.sidebar}>
          <div style={S.logo}>Recipe<span style={{ color:"#E8A838" }}>Vault</span></div>

          <div style={{ padding:"8px 0" }}>
            {[["home","📚","Ricettario"],["lists","🛒","Liste spesa"]].map(([v,ic,lb])=>(
              <div key={v} style={{ ...S.navItem, ...(view===v&&!selMode?S.navActive:{}) }}
                onClick={()=>{setView(v);setSelMode(false);setSel([]);}}>
                <span>{ic}</span><span style={{ flex:1 }}>{lb}</span>
                {v==="home" && <span style={{ fontSize:11, background:"rgba(245,240,232,.12)", borderRadius:10, padding:"1px 7px" }}>{recipes.length}</span>}
              </div>
            ))}
          </div>

          <div style={S.navSection}>Categorie</div>
          <div style={{ overflowY:"auto", flex:1 }}>
            {CATS.map(c=>(
              <div key={c} style={{ ...S.catItem, color:cat===c&&view==="home"?"#fff":"rgba(245,240,232,.5)" }}
                onClick={()=>{setCat(c);setView("home");setSelMode(false);}}>
                <span>{EMO[c]}</span><span style={{ flex:1 }}>{c}</span>
                <span style={{ fontSize:11, opacity:.5 }}>{c==="Tutte"?recipes.length:recipes.filter(r=>r.categoria===c).length}</span>
              </div>
            ))}
          </div>

          <div style={{ padding:"12px 16px 8px", borderTop:"1px solid rgba(245,240,232,.1)" }}>
            <button style={S.sideBtn} onClick={() => openImportModal("url")}>+ Importa URL</button>
            <button style={{ ...S.sideBtn, background:"#A0522D" }} onClick={openPhotoModal}>+ Importa foto</button>
            <button style={{ ...S.sideBtn, ...S.sideBtnGhost }} onClick={()=>{setErr("");setModal("manual");}}>+ Inserisci manuale</button>
          </div>
        </div>
      )}

      {/* Main */}
      <div style={{ ...S.main, ...(isCompactUi ? { minHeight:"100dvh", overflow:"visible", paddingBottom:"calc(84px + env(safe-area-inset-bottom))" } : {}) }}>
        {view !== "detail" && (
          <div style={{ ...S.topbar, ...(isCompactUi ? { position:"sticky", top:0, zIndex:10, padding:"18px 16px 14px", display:"block", background:"rgba(245,240,232,.6)", backdropFilter:"blur(30px) saturate(180%)", WebkitBackdropFilter:"blur(30px) saturate(180%)", borderBottom:"1px solid rgba(255,255,255,0.4)" } : {}) }}>
            {isCompactUi ? (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:view==="home" ? 14 : 0 }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ fontSize:11, letterSpacing:"1.3px", textTransform:"uppercase", color:"#8A7C69", marginBottom:4 }}>RecipeVault</div>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:28, lineHeight:1.05 }}>{pageTitle}</div>
                  </div>
                  {view==="home" && (
                    <button style={{ ...S.iconBtn, fontSize:22, color:favOnly?"#E8A838":"#C9BFAF", background:"#FDFAF4", border:"1px solid #E0D8C8", padding:"10px 12px" }} onClick={()=>setFavOnly(f=>!f)} title="Solo preferiti">★</button>
                  )}
                </div>

                {view==="home" && (
                  <>
                    <div style={{ ...S.searchBox, maxWidth:"none", width:"100%", padding:"11px 14px", borderRadius:14, marginBottom:12 }}>
                      <span style={{ opacity:.5 }}>🔍</span>
                      <input placeholder="Cerca nome, tag, ingrediente…" value={q} onChange={e=>setQ(e.target.value)}
                        style={{ border:"none", outline:"none", background:"transparent", fontSize:15, width:"100%" }}/>
                    </div>
                    {hasRecipeFilters && (
                      <button
                        style={{ ...S.btnSecondary, width:"100%", justifyContent:"center", padding:"12px 16px", borderRadius:14, marginBottom:12 }}
                        onClick={showAllRecipes}
                      >
                        Mostra tutte le ricette
                      </button>
                    )}
                    <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:2 }}>
                      <div style={{ ...S.providerPill, minWidth:"max-content", margin:0, padding:"10px 12px", background:"#FDFAF4", color:"#5C5245" }}>
                        <span>{recipes.length}</span>
                        <span>ricette salvate</span>
                      </div>
                      {activeAiReady && (
                        <div style={{ ...S.providerPill, minWidth:"max-content", margin:0, padding:"10px 12px", background:"#FDFAF4", color:"#5C5245" }}>
                          <span>{activeProvider.icon}</span>
                          <span>Ricerca: {activeProvider.name}</span>
                        </div>
                      )}
                      <button style={{ ...S.btnSecondary, minWidth:"max-content", padding:"10px 14px", borderRadius:999 }} onClick={() => openAiConfigModal({ provider: searchProviderKey })}>⚙️ AI</button>
                      {!selMode
                        ? <button style={{ ...S.btnSecondary, minWidth:"max-content", padding:"10px 14px", borderRadius:999 }} onClick={()=>{setSelMode(true);setView("home");}}>☑ Seleziona</button>
                        : <>
                          <button style={{ ...S.btnPrimary, minWidth:"max-content", padding:"10px 14px", borderRadius:999 }} onClick={()=>{if(!sel.length)return;setErr("");setModal("list");}} disabled={!sel.length}>🛒 {sel.length}</button>
                          <button style={{ ...S.btnSecondary, minWidth:"max-content", padding:"10px 14px", borderRadius:999 }} onClick={()=>{setSelMode(false);setSel([]);}}>Chiudi</button>
                        </>}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <div style={S.topTitle}>{pageTitle}</div>
                {view==="home" && <>
                <div style={S.searchBox}>
                  <span style={{ opacity:.5 }}>🔍</span>
                  <input placeholder="Cerca nome, tag, ingrediente…" value={q} onChange={e=>setQ(e.target.value)}
                    style={{ border:"none", outline:"none", background:"transparent", fontSize:14, width:"100%" }}/>
                </div>
                {hasRecipeFilters && <button style={S.btnSecondary} onClick={showAllRecipes}>Mostra tutte</button>}
                <button style={S.btnSecondary} onClick={() => openAiConfigModal({ provider: searchProviderKey })}>⚙️ Configura AI</button>
                <button style={{ ...S.iconBtn, fontSize:20, color:favOnly?"#E8A838":"#ccc" }} onClick={()=>setFavOnly(f=>!f)} title="Solo preferiti">★</button>
                {!selMode
                  ? <button style={S.btnSecondary} onClick={()=>{setSelMode(true);setView("home");}}>☑ Seleziona</button>
                    : <>
                      <span style={{ fontSize:13, color:"#888" }}>{sel.length} selezionate</span>
                      <button style={S.btnPrimary} onClick={()=>{if(!sel.length)return;setErr("");setModal("list");}} disabled={!sel.length}>🛒 Crea Lista</button>
                      <button style={S.btnSecondary} onClick={()=>{setSelMode(false);setSel([]);}}>✕</button>
                    </>
                  }
                </>}
              </>
            )}
          </div>
        )}

        {isCompactUi && view==="home" && (
          <div style={{ display:"flex", gap:8, overflowX:"auto", padding:"12px 16px 0" }}>
            {CATS.map(c => (
              <button
                key={c}
                style={{
                  border:"1px solid",
                  borderColor: cat===c ? "#1C1A14" : "#D8D0BE",
                  background: cat===c ? "#1C1A14" : "#FDFAF4",
                  color: cat===c ? "#F5F0E8" : "#4D453A",
                  borderRadius:999,
                  padding:"10px 14px",
                  fontSize:13,
                  whiteSpace:"nowrap",
                  cursor:"pointer",
                  boxShadow: cat===c ? "0 8px 20px rgba(28,26,20,.12)" : "none",
                }}
                onClick={()=>{setCat(c);setView("home");setSelMode(false);}}
              >
                {EMO[c]} {c}
              </button>
            ))}
          </div>
        )}

        {view==="detail" && activeRec && <Detail r={activeRec}/>}
        {view==="lists"  && <ListsView/>}
        {view==="home"   && (
          <div style={{ ...S.content, ...(isCompactUi ? { padding:"16px 16px calc(110px + env(safe-area-inset-bottom))" } : {}) }}>
            <div style={{ display:"grid", gap:14, marginBottom:18 }}>
              <div style={{
                background:"rgba(255,255,255,0.45)",
                backdropFilter:"blur(40px) saturate(180%)",
                WebkitBackdropFilter:"blur(40px) saturate(180%)",
                border:"1px solid rgba(255,255,255,0.6)",
                borderRadius:isCompactUi ? 20 : 16,
                padding:isCompactUi ? 16 : 18,
                boxShadow:"0 4px 30px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.5)",
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"flex-start", flexWrap:"wrap", marginBottom:12 }}>
                  <div>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:isCompactUi ? 22 : 20, color:"#1C1A14", marginBottom:4 }}>
                      🧠 Cerca nel ricettario con AI
                    </div>
                    <div style={{ fontSize:13, color:"#7A7062", lineHeight:1.55 }}>
                      Scrivi in modo naturale: l’AI cerca solo tra le tue ricette salvate.
                    </div>
                  </div>
                  <div style={{
                    background:"#F5F0E8",
                    border:"1px solid #E0D8C8",
                    borderRadius:999,
                    padding:"8px 12px",
                    fontSize:12,
                    color:"#5C5245",
                    whiteSpace:"nowrap",
                  }}>
                    {activeAiReady ? `${activeProvider.icon} ${activeProvider.name}` : "Configura un provider AI"}
                  </div>
                </div>

                <div style={{ display:"flex", gap:10, flexDirection:isCompactUi ? "column" : "row", marginBottom:10 }}>
                  <div style={{ ...S.searchBox, flex:1, maxWidth:"none", padding:isCompactUi ? "12px 14px" : "9px 12px", borderRadius:isCompactUi ? 14 : 10 }}>
                    <span style={{ opacity:.5 }}>✨</span>
                    <input
                      placeholder="Es. Dammi ricette di primi con i funghi"
                      value={aiSearchQuery}
                      onChange={e => setAiSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !aiSearching && runAiRecipeSearch()}
                      style={{ border:"none", outline:"none", background:"transparent", fontSize:isCompactUi ? 15 : 14, width:"100%" }}
                    />
                  </div>
                  <button
                    style={{ ...S.btnPrimary, justifyContent:"center", ...(isCompactUi ? { width:"100%", padding:"14px 18px", borderRadius:16 } : {}) }}
                    onClick={() => runAiRecipeSearch()}
                    disabled={aiSearching || !aiSearchQuery.trim() || !recipes.length || !activeAiReady}
                  >
                    {aiSearching ? "Cerco…" : "Cerca con AI"}
                  </button>
                </div>

                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {AI_SEARCH_SUGGESTIONS.map(suggestion => (
                    <button
                      key={suggestion}
                      style={{
                        ...S.btnSecondary,
                        padding:"9px 12px",
                        borderRadius:999,
                        fontSize:12,
                        background:"#FFF8EC",
                        borderColor:"#F0D89A",
                      }}
                      onClick={() => {
                        setAiSearchQuery(suggestion);
                        runAiRecipeSearch(suggestion);
                      }}
                      disabled={aiSearching || !recipes.length || !activeAiReady}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>

                {aiSearchActive && (
                  <div style={{
                    marginTop:12,
                    padding:"12px 14px",
                    background:"#F5F0E8",
                    border:"1px solid #E0D8C8",
                    borderRadius:14,
                    display:"flex",
                    justifyContent:"space-between",
                    gap:12,
                    alignItems:"flex-start",
                    flexWrap:"wrap",
                  }}>
                    <div>
                      <div style={{ fontSize:12, textTransform:"uppercase", letterSpacing:"1px", color:"#8A7C69", marginBottom:4 }}>
                        Ricerca AI attiva
                      </div>
                      <div style={{ fontSize:14, color:"#3C3526", fontWeight:600, marginBottom:4 }}>
                        “{aiSearchQuery}”
                      </div>
                      <div style={{ fontSize:13, color:"#6F6558", lineHeight:1.55 }}>
                        {aiSearchReason || "Sto mostrando le ricette più coerenti con la tua richiesta."}
                      </div>
                    </div>
                    <button
                      style={{ ...S.btnSecondary, padding:"10px 12px", borderRadius:12 }}
                      onClick={showAllRecipes}
                    >
                      Mostra tutte
                    </button>
                  </div>
                )}

                {!activeAiReady && (
                  <div style={{ marginTop:12, fontSize:12, color:"#8A7C69", lineHeight:1.55 }}>
                    Per usare questa ricerca configura prima il provider AI nel <strong>pannello Configurazione AI</strong>.
                  </div>
                )}
              </div>

              <div style={{
                background:"rgba(255,255,255,0.45)",
                backdropFilter:"blur(40px) saturate(180%)",
                WebkitBackdropFilter:"blur(40px) saturate(180%)",
                border:"1px solid rgba(255,255,255,0.6)",
                borderRadius:isCompactUi ? 20 : 16,
                padding:isCompactUi ? 16 : 18,
                boxShadow:"0 4px 30px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.5)",
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"center", flexWrap:"wrap", marginBottom:12 }}>
                  <div>
                    <div style={{ fontFamily:"'Playfair Display',serif", fontSize:isCompactUi ? 22 : 20, color:"#1C1A14", marginBottom:4 }}>
                      🧅 Organizza per ingrediente
                    </div>
                    <div style={{ fontSize:13, color:"#7A7062", lineHeight:1.55 }}>
                      Sfoglia il ricettario partendo dagli ingredienti più usati.
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {ingredientFilter && (
                      <button
                        style={{ ...S.btnSecondary, padding:"9px 12px", borderRadius:999 }}
                        onClick={() => setIngredientFilter("")}
                      >
                        Rimuovi filtro
                      </button>
                    )}
                    <div style={{
                      background:"#F5F0E8",
                      border:"1px solid #E0D8C8",
                      borderRadius:999,
                      padding:"8px 12px",
                      fontSize:12,
                      color:"#5C5245",
                    }}>
                      {ingredientCatalog.length} ingredienti riconosciuti
                    </div>
                  </div>
                </div>

                {ingredientCatalog.length ? (
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {ingredientCatalog.slice(0, isCompactUi ? 12 : 18).map(entry => {
                      const active = ingredientFilter === entry.key;
                      return (
                        <button
                          key={entry.key}
                          style={{
                            border:"1px solid",
                            borderColor: active ? "#1C1A14" : "#D8D0BE",
                            background: active ? "#1C1A14" : "#F8F3EA",
                            color: active ? "#F5F0E8" : "#4D453A",
                            borderRadius:999,
                            padding:"10px 14px",
                            fontSize:13,
                            cursor:"pointer",
                            display:"inline-flex",
                            alignItems:"center",
                            gap:8,
                          }}
                          onClick={() => {
                            clearAiRecipeSearch();
                            setIngredientFilter(active ? "" : entry.key);
                          }}
                          title={entry.examples.join(" · ")}
                        >
                          <span>{entry.label}</span>
                          <span style={{
                            fontSize:11,
                            opacity:.75,
                            background: active ? "rgba(245,240,232,.14)" : "rgba(28,26,20,.08)",
                            borderRadius:999,
                            padding:"2px 8px",
                          }}>
                            {entry.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize:13, color:"#8A7C69", lineHeight:1.55 }}>
                    Gli ingredienti compariranno qui appena avrai salvato qualche ricetta.
                  </div>
                )}
              </div>
            </div>

            {selMode && (
              <div style={{ ...S.selBar, ...(isCompactUi ? { borderRadius:16, padding:"12px 14px", marginTop:8, flexWrap:"wrap" } : {}) }}>
                <span>☑ Clicca le ricette per aggiungerle alla lista</span>
                <span style={{ flex:1 }}/><strong>{sel.length} selezionate</strong>
              </div>
            )}
            {displayedRecipes.length===0
              ? <div style={S.empty}>
                  <div style={{ fontSize:52 }}>🍽</div>
                  <h3 style={{ fontFamily:"'Playfair Display',serif", fontSize:22, margin:"12px 0 8px" }}>{homeEmptyTitle}</h3>
                  <p>{homeEmptyDescription}</p>
                  {aiSearchActive || ingredientFilter
                    ? <button
                        style={{ ...S.btnSecondary, marginTop:20 }}
                        onClick={() => {
                          clearAiRecipeSearch();
                          setIngredientFilter("");
                          setCat("Tutte");
                        }}
                      >
                        Rimuovi i filtri intelligenti
                      </button>
                    : <button style={{ ...S.btnPrimary, marginTop:20 }} onClick={openAddRecipeModal}>+ Aggiungi la prima ricetta</button>}
                </div>
              : <div style={S.grid}>{displayedRecipes.map(r=><RecipeCard key={r.id} r={r}/>)}</div>
            }
          </div>
        )}
      </div>

      {isCompactUi && view !== "detail" && (
        <div style={{
          position:"fixed",
          left:12,
          right:12,
          bottom:"calc(10px + env(safe-area-inset-bottom))",
          display:"grid",
          gridTemplateColumns:"1fr auto 1fr",
          gap:10,
          padding:"10px 12px",
          borderRadius:24,
          background:"rgba(28,26,20,.75)",
          backdropFilter:"blur(40px) saturate(180%)",
          WebkitBackdropFilter:"blur(40px) saturate(180%)",
          boxShadow:"0 18px 40px rgba(28,26,20,.2)",
          zIndex:20,
          alignItems:"center",
        }}>
          <button style={{ background:"none", border:"none", color:view==="home"?"#F5F0E8":"rgba(245,240,232,.55)", fontSize:13, fontWeight:600, padding:"8px 10px", cursor:"pointer" }} onClick={()=>{setView("home");setSelMode(false);setSel([]);}}>📚 Ricette</button>
          <button style={{ ...S.btnPrimary, padding:"12px 16px", borderRadius:18, justifyContent:"center" }} onClick={openAddRecipeModal}>＋</button>
          <button style={{ background:"none", border:"none", color:view==="lists"?"#F5F0E8":"rgba(245,240,232,.55)", fontSize:13, fontWeight:600, padding:"8px 10px", cursor:"pointer" }} onClick={()=>{setView("lists");setSelMode(false);setSel([]);}}>🛒 Liste</button>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmDialog && (
        <div style={{ ...S.overlay, zIndex:1100 }} onClick={e=>{if(e.target===e.currentTarget)setConfirmDialog(null);}}>
          <div style={{ background:"rgba(253,250,244,0.72)", backdropFilter:"blur(60px) saturate(200%)", WebkitBackdropFilter:"blur(60px) saturate(200%)", border:"1px solid rgba(255,255,255,0.4)", borderRadius:isCompactUi ? 24 : 16, padding:isCompactUi ? "28px 22px" : "24px 28px", maxWidth:380, width:"90%", boxShadow:"0 16px 48px rgba(0,0,0,.15), inset 0 1px 0 rgba(255,255,255,0.5)", textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>{confirmDialog.icon || "🗑"}</div>
            <p style={{ fontSize:15, color:"#3C3526", lineHeight:1.5, marginBottom:20 }}>{confirmDialog.message}</p>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button style={{ ...S.btnSecondary, flex:1, justifyContent:"center", ...(isCompactUi ? { padding:"14px 16px", borderRadius:14 } : {}) }} onClick={()=>setConfirmDialog(null)}>{confirmDialog.cancelLabel || "Annulla"}</button>
              <button style={{ ...S.btnPrimary, flex:1, justifyContent:"center", background:"#C84B2F", ...(isCompactUi ? { padding:"14px 16px", borderRadius:14 } : {}) }} onClick={confirmDialog.onConfirm}>{confirmDialog.confirmLabel || "Elimina"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Recipe picker dialog — multiple recipes from book photo */}
      {recipePickerDialog && (
        <div style={{ ...S.overlay, zIndex:1100 }} onClick={e=>{if(e.target===e.currentTarget)setRecipePickerDialog(null);}}>
          <div style={{
            background:"rgba(253,250,244,0.82)", backdropFilter:"blur(60px) saturate(200%)", WebkitBackdropFilter:"blur(60px) saturate(200%)",
            border:"1px solid rgba(255,255,255,0.4)", borderRadius:isCompactUi ? 24 : 20,
            padding:isCompactUi ? "28px 22px" : "28px 32px", maxWidth:480, width:"92%",
            boxShadow:"0 16px 48px rgba(0,0,0,.15), inset 0 1px 0 rgba(255,255,255,0.5)",
          }}>
            <div style={{ fontSize:36, marginBottom:8, textAlign:"center" }}>📖</div>
            <p style={{ fontSize:16, fontWeight:600, color:"#3C3526", textAlign:"center", marginBottom:4 }}>
              Trovate {recipePickerDialog.recipes.length} opzioni
            </p>
            <p style={{ fontSize:13, color:"#8A7E6B", textAlign:"center", marginBottom:20 }}>
              Scegli quale ricetta o variante vuoi importare.
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
              {recipePickerDialog.recipes.map((rec, idx) => (
                <button key={idx} onClick={() => recipePickerDialog.onPick(rec)} style={{
                  ...S.btnSecondary, display:"flex", flexDirection:"column", alignItems:"flex-start",
                  padding:"14px 18px", borderRadius:16, textAlign:"left", cursor:"pointer",
                  transition:"all 0.15s ease",
                }}>
                  <span style={{ fontSize:15, fontWeight:600, color:"#3C3526", marginBottom:4 }}>
                    {rec.titolo || `Ricetta ${idx + 1}`}
                  </span>
                  <span style={{ fontSize:12, color:"#8A7E6B" }}>
                    {rec.ingredienti?.length || 0} ingredienti · {rec.procedimento?.length || 0} passaggi
                    {rec.categoria ? ` · ${rec.categoria}` : ""}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button style={{ ...S.btnSecondary, flex:1, justifyContent:"center" }} onClick={()=>setRecipePickerDialog(null)}>
                Annulla
              </button>
              <button style={{ ...S.btnPrimary, flex:1, justifyContent:"center" }} onClick={() => recipePickerDialog.onPick(recipePickerDialog.recipes)}>
                Importa tutte
              </button>
            </div>
          </div>
        </div>
      )}

      {devModeOpen && activeRec?.devData && (
        <div style={{ ...S.overlay, zIndex:1150 }} onClick={e=>{if(e.target===e.currentTarget)setDevModeOpen(false);}}>
          <div style={{
            background:"#FDFAF4",
            borderRadius:isCompactUi ? 24 : 16,
            padding:isCompactUi ? "22px 18px calc(22px + env(safe-area-inset-bottom))" : "24px 28px",
            width:isCompactUi ? "100vw" : "min(920px, 94vw)",
            maxWidth:isCompactUi ? "100vw" : 920,
            maxHeight:isCompactUi ? "88vh" : "90vh",
            overflow:"auto",
            boxShadow:"0 16px 48px rgba(0,0,0,.25)",
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, justifyContent:"space-between", marginBottom:16, flexWrap:"wrap" }}>
              <div>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:isCompactUi ? 24 : 22, color:"#1C1A14" }}>🧪 DEV MODE</div>
                <div style={{ fontSize:13, color:"#7A7062", marginTop:4 }}>JSON di debug generato durante l'import della ricetta</div>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button
                  style={{ ...S.btnSecondary, ...(isCompactUi ? { padding:"12px 14px", borderRadius:14 } : {}) }}
                  onClick={async () => {
                    try {
                      await copyToClipboard(JSON.stringify(activeRec.devData, null, 2));
                    } catch (error) {
                      setErr(`Impossibile copiare il JSON: ${error.message}`);
                    }
                  }}
                >
                  📋 Copia JSON
                </button>
                <button
                  style={{ ...S.btnPrimary, ...(isCompactUi ? { padding:"12px 14px", borderRadius:14 } : {}) }}
                  onClick={() => setDevModeOpen(false)}
                >
                  Chiudi
                </button>
              </div>
            </div>
            <pre style={{
              margin:0,
              padding:isCompactUi ? 14 : 16,
              borderRadius:16,
              background:"#1C1A14",
              color:"#F5F0E8",
              fontSize:12,
              lineHeight:1.6,
              overflow:"auto",
              whiteSpace:"pre-wrap",
              wordBreak:"break-word",
            }}>{JSON.stringify(activeRec.devData, null, 2)}</pre>
          </div>
        </div>
      )}

      {/* Modals */}
      {modal && (
        <div style={{ ...S.overlay, ...(isCompactUi ? { alignItems:"end", backdropFilter:"blur(10px)" } : {}) }} onClick={e=>{if(e.target===e.currentTarget&&!loading){ closeCurrentModal(); }}}>
          <div style={{ ...S.modal, ...(modal==="ai-config" && !isCompactUi ? { width:760, maxWidth:"96vw" } : {}), ...(isCompactUi ? { width:"100vw", maxWidth:"100vw", maxHeight:"92vh", minHeight:"72vh", borderRadius:"24px 24px 0 0", padding:"22px 18px calc(26px + env(safe-area-inset-bottom))" } : {}) }}>
            {modal==="quickAdd" && <>
              <h2 style={S.modalTitle}>🍽️ Aggiungi ricetta</h2>
              <p style={{ fontSize:14, color:"#6F6558", lineHeight:1.6, marginBottom:18 }}>
                Scegli come vuoi aggiungere una nuova ricetta al tuo ricettario.
              </p>

              <div style={{ display:"grid", gap:12, marginBottom:18 }}>
                <button
                  style={{ ...S.btnPrimary, width:"100%", justifyContent:"space-between", padding:"16px 18px", borderRadius:18 }}
                  onClick={() => {
                    setErr("");
                    openImportModal("url");
                  }}
                >
                  <span>🔗 Importa da URL</span>
                  <span style={{ opacity:.8, fontSize:12 }}>
                    {defaultImportAiConfig.provider === "local" ? "Modello locale o API" : AI_PROVIDERS[defaultImportAiConfig.provider]?.name || "Configura AI"}
                  </span>
                </button>

                <button
                  style={{ ...S.btnPrimary, width:"100%", justifyContent:"space-between", padding:"16px 18px", borderRadius:18, background:"#A0522D" }}
                  onClick={() => {
                    setErr("");
                    openPhotoModal();
                  }}
                >
                  <span>📷 Importa da foto</span>
                  <span style={{ opacity:.8, fontSize:12 }}>
                    {defaultImportAiConfig.provider === "local" ? "Vision o API" : AI_PROVIDERS[defaultImportAiConfig.provider]?.name || "Riconosci il piatto"}
                  </span>
                </button>

                <button
                  style={{ ...S.btnSecondary, width:"100%", justifyContent:"space-between", padding:"16px 18px", borderRadius:18 }}
                  onClick={() => {
                    setErr("");
                    setModal("manual");
                  }}
                >
                  <span>✏️ Inserisci manualmente</span>
                  <span style={{ opacity:.7, fontSize:12 }}>Più rapido per ricette tue</span>
                </button>
              </div>

              <div style={{ display:"flex", justifyContent:"flex-end" }}>
                <button style={{ ...S.btnSecondary, width:"100%", justifyContent:"center", padding:"13px 16px", borderRadius:16 }} onClick={()=>{setModal(null);setErr("");}}>
                  Chiudi
                </button>
              </div>
            </>}

            {modal==="import" && <ImportModal/>}
            {modal==="ai-config" && <AiConfigModal/>}

            {modal==="manual" && <>
              <h2 style={S.modalTitle}>✏️ Ricetta manuale</h2>
              <div style={{ marginBottom:12 }}><label style={S.label}>Titolo *</label>
                <input style={S.input} value={manual.titolo} onChange={e=>setManual(m=>({...m,titolo:e.target.value}))}/></div>
              <div style={{ display:"grid", gridTemplateColumns:isCompactUi ? "1fr" : "1fr 1fr 1fr", gap:10, marginBottom:12 }}>
                <div><label style={S.label}>Categoria</label>
                  <select style={S.input} value={manual.categoria} onChange={e=>setManual(m=>({...m,categoria:e.target.value}))}>
                    {CATS.slice(1).map(c=><option key={c}>{c}</option>)}
                  </select></div>
                <div><label style={S.label}>Difficoltà</label>
                  <select style={S.input} value={manual.difficolta} onChange={e=>setManual(m=>({...m,difficolta:e.target.value}))}>
                    {["Facile","Media","Difficile"].map(d=><option key={d}>{d}</option>)}
                  </select></div>
                <div><label style={S.label}>Porzioni</label>
                  <input style={S.input} type="number" value={manual.porzioni} onChange={e=>setManual(m=>({...m,porzioni:+e.target.value}))}/></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:isCompactUi ? "1fr" : "1fr 1fr", gap:10, marginBottom:12 }}>
                <div><label style={S.label}>Tempo prep</label><input style={S.input} placeholder="20 min" value={manual.tempoPrep} onChange={e=>setManual(m=>({...m,tempoPrep:e.target.value}))}/></div>
                <div><label style={S.label}>Tempo cottura</label><input style={S.input} placeholder="30 min" value={manual.tempoCottura} onChange={e=>setManual(m=>({...m,tempoCottura:e.target.value}))}/></div>
              </div>
              {renderPreparationSectionsEditor(manual, setManual)}
              <div style={{ marginBottom:12 }}><label style={S.label}>Note</label>
                <input style={S.input} value={manual.note} onChange={e=>setManual(m=>({...m,note:e.target.value}))}/></div>
              <div style={{ marginBottom:12 }}>
                <label style={S.label}>URL Foto (opzionale)</label>
                <input style={S.input} placeholder="https://esempio.com/foto.jpg" value={manual.foto} onChange={e=>setManual(m=>({...m,foto:e.target.value}))}/>
                {manual.foto && <img src={manual.foto} alt="preview" style={{ marginTop:8, width:"100%", maxHeight:120, objectFit:"cover", borderRadius:8 }} onError={e=>e.target.style.display="none"}/>}
              </div>
              {err && <div style={S.errMsg}>{err}</div>}
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:14, ...(isCompactUi ? { flexDirection:"column-reverse" } : {}) }}>
                <button style={{ ...S.btnSecondary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"13px 16px", borderRadius:16 } : {}) }} onClick={()=>{setModal(null);setErr("");}}>Annulla</button>
                <button style={{ ...S.btnPrimary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"14px 18px", borderRadius:16 } : {}) }} onClick={doManual}>Salva ricetta</button>
              </div>
            </>}

            {modal==="edit" && editRec && <>
              <h2 style={S.modalTitle}>✏️ Modifica ricetta</h2>
              <div style={{ marginBottom:12 }}><label style={S.label}>Titolo *</label>
                <input style={S.input} value={editRec.titolo} onChange={e=>setEditRec(m=>({...m,titolo:e.target.value}))}/></div>
              <div style={{ display:"grid", gridTemplateColumns:isCompactUi ? "1fr" : "1fr 1fr 1fr", gap:10, marginBottom:12 }}>
                <div><label style={S.label}>Categoria</label>
                  <select style={S.input} value={editRec.categoria} onChange={e=>setEditRec(m=>({...m,categoria:e.target.value}))}>
                    {CATS.slice(1).map(c=><option key={c}>{c}</option>)}
                  </select></div>
                <div><label style={S.label}>Difficoltà</label>
                  <select style={S.input} value={editRec.difficolta} onChange={e=>setEditRec(m=>({...m,difficolta:e.target.value}))}>
                    {["Facile","Media","Difficile"].map(d=><option key={d}>{d}</option>)}
                  </select></div>
                <div><label style={S.label}>Porzioni</label>
                  <input style={S.input} type="number" value={editRec.porzioni} onChange={e=>setEditRec(m=>({...m,porzioni:+e.target.value}))}/></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:isCompactUi ? "1fr" : "1fr 1fr", gap:10, marginBottom:12 }}>
                <div><label style={S.label}>Tempo prep</label><input style={S.input} placeholder="20 min" value={editRec.tempoPrep || ""} onChange={e=>setEditRec(m=>({...m,tempoPrep:e.target.value}))}/></div>
                <div><label style={S.label}>Tempo cottura</label><input style={S.input} placeholder="30 min" value={editRec.tempoCottura || ""} onChange={e=>setEditRec(m=>({...m,tempoCottura:e.target.value}))}/></div>
              </div>
              {renderPreparationSectionsEditor(editRec, setEditRec)}
              <div style={{ marginBottom:12 }}><label style={S.label}>Note</label>
                <input style={S.input} value={editRec.note || ""} onChange={e=>setEditRec(m=>({...m,note:e.target.value}))}/></div>
              <div style={{ marginBottom:12 }}><label style={S.label}>Tags (separati da virgola)</label>
                <input style={S.input} placeholder="pasta, italiano, veloce" value={editRec.tags || ""} onChange={e=>setEditRec(m=>({...m,tags:e.target.value}))}/></div>
              <div style={{ marginBottom:12 }}>
                <label style={S.label}>URL Foto (opzionale)</label>
                <input style={S.input} placeholder="https://esempio.com/foto.jpg" value={editRec.foto || ""} onChange={e=>setEditRec(m=>({...m,foto:e.target.value}))}/>
                {editRec.foto && <img src={editRec.foto} alt="preview" style={{ marginTop:8, width:"100%", maxHeight:120, objectFit:"cover", borderRadius:8 }} onError={e=>e.target.style.display="none"}/>}
              </div>
              {err && <div style={S.errMsg}>{err}</div>}
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:14, ...(isCompactUi ? { flexDirection:"column-reverse" } : {}) }}>
                <button style={{ ...S.btnSecondary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"13px 16px", borderRadius:16 } : {}) }} onClick={()=>{setModal(null);setEditRec(null);setErr("");}}>Annulla</button>
                <button style={{ ...S.btnPrimary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"14px 18px", borderRadius:16 } : {}) }} onClick={doEditSave}>Salva modifiche</button>
              </div>
            </>}

            {modal==="list" && <>
              <h2 style={S.modalTitle}>🛒 Crea lista della spesa</h2>
              <p style={{ fontSize:13, color:"#888", marginBottom:14 }}>
                {activeAiReady
                  ? `L'AI (${activeProvider.icon} ${activeProvider.name}) aggrega gli ingredienti di ${sel.length} ricette`
                  : "Per generare la lista serve prima configurare un provider nel pannello Configurazione AI."}
              </p>
              {!sel.length && (
                <div style={{ background:"#FFF8EC", border:"1px solid #F0D89A", borderRadius:12, padding:"12px 14px", marginBottom:14, fontSize:13, color:"#7A5C00", lineHeight:1.5 }}>
                  Seleziona prima una o più ricette dalla schermata principale, poi torna qui per generare la lista.
                </div>
              )}
              <div style={{ marginBottom:14 }}><label style={S.label}>Nome lista</label>
                <input style={S.input} placeholder="Es: Spesa di lunedì" value={listName} onChange={e=>{setListName(e.target.value);setErr("");}}/></div>
              <div style={{ background:"#F5F0E8", borderRadius:8, padding:12, marginBottom:12, fontSize:13, maxHeight:180, overflowY:"auto" }}>
                {recipes.filter(r=>sel.includes(r.id)).map(r=>(
                  <div key={r.id} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #E0D8C8" }}>
                    <span>{EMO[r.categoria]} {r.titolo}</span>
                    <button style={{ background:"none", border:"none", cursor:"pointer", color:"#C84B2F", fontSize:12 }} onClick={()=>toggleSel(r.id)}>✕</button>
                  </div>
                ))}
              </div>
              {err && <div style={S.errMsg}>{err}</div>}
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end", ...(isCompactUi ? { flexDirection:"column-reverse" } : {}) }}>
                <button
                  style={{ ...S.btnSecondary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"13px 16px", borderRadius:16 } : {}) }}
                  onClick={()=>{
                    setModal(null);
                    setErr("");
                    setListName("");
                    if (!sel.length) {
                      setView("home");
                      setSelMode(true);
                      return;
                    }
                    setSelMode(false);
                    setSel([]);
                  }}
                >
                  {sel.length ? "Annulla" : "Vai alle ricette"}
                </button>
                <button style={{ ...S.btnPrimary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"14px 18px", borderRadius:16 } : {}) }} onClick={doCreateList} disabled={loading||!sel.length}>{loading?loadMsg:"Genera Lista AI →"}</button>
              </div>
            </>}
          </div>
        </div>
      )}

      {/* Spinner */}
      {loading && (
        <div style={S.loadOverlay}>
          <div style={S.loadBox}>
            <div style={S.spinner}/>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16 }}>{loadMsg}</div>
            <div style={{ fontSize:12, color:"#888", marginTop:4 }}>Potrebbe richiedere qualche secondo…</div>
            <button
              style={{ ...S.btnSecondary, marginTop:14, justifyContent:"center", minWidth:140 }}
              onClick={cancelLocalImport}
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
