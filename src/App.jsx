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

const AI_PROVIDERS = {
  local: {
    name: "Locale (on-device)",
    icon: "🟤",
    models: ["gemma-3n-e2b", "qwen2.5-1.5b"],
    defaultModel: "gemma-3n-e2b",
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
    "gemma-3n-e2b": {
      label: "Gemma 3n E2B (consigliato)",
      sizeLabel: "2.79 GB",
      fileName: "gemma-3n-e2b-it-q4_k_m.gguf",
      url: "https://huggingface.co/Edge-Quant/gemma-3n-E2B-it-Q4_K_M-GGUF/resolve/main/gemma-3n-e2b-it-q4_k_m.gguf?download=true",
      note: "Formato GGUF quantizzato per llama.cpp",
    },
  },
  android: {
    "gemma-3n-e2b": {
      label: "Gemma 3n E2B (consigliato)",
      sizeLabel: "3.14 GB",
      fileName: "gemma-3n-E2B-it-int4.task",
      url: "https://huggingface.co/gummybear2555/Gemma-3n-E2B-it-int4/resolve/main/gemma-3n-E2B-it-int4.task?download=true",
      note: "Formato .task per MediaPipe LLM Inference",
    },
  },
  vision: {
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
    note: "Modello vision GGUF + mmproj per analisi video",
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

function createDefaultAiPrefs() {
  return {
    lastProvider: "local",
    providers: Object.fromEntries(
      Object.entries(AI_PROVIDERS).map(([key, provider]) => {
        const base = { apiKey: "", model: provider.defaultModel };
        if (key === "local") {
          return [key, { ...base, localModelPath: "", localRuntimePath: "@auto", visionModelPath: "" }];
        }

        return [key, base];
      }),
    ),
  };
}

function migrateAiPrefs(savedPrefs, legacyConfig) {
  const base = createDefaultAiPrefs();
  const merged = {
    lastProvider: base.lastProvider,
    providers: { ...base.providers },
  };

  if (savedPrefs?.providers) {
    for (const providerKey of Object.keys(AI_PROVIDERS)) {
      const saved = savedPrefs.providers?.[providerKey];
      if (!saved) continue;

      merged.providers[providerKey] = {
        apiKey: saved.apiKey ?? "",
        model: saved.model || AI_PROVIDERS[providerKey].defaultModel,
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
  }

  if (legacyConfig && AI_PROVIDERS[legacyConfig.provider]) {
    merged.lastProvider = legacyConfig.provider;
    merged.providers[legacyConfig.provider] = {
      apiKey: legacyConfig.apiKey ?? merged.providers[legacyConfig.provider].apiKey,
      model: legacyConfig.model || merged.providers[legacyConfig.provider].model,
      ...(legacyConfig.provider === "local"
        ? {
            localModelPath: legacyConfig.localModelPath ?? merged.providers.local.localModelPath,
            localRuntimePath: normalizeLocalRuntimePath(legacyConfig.localRuntimePath || merged.providers.local.localRuntimePath),
            visionModelPath: legacyConfig.visionModelPath ?? merged.providers.local.visionModelPath ?? "",
          }
        : {}),
    };
  }

  return merged;
}

function getAiConfig(aiPrefs, provider = aiPrefs?.lastProvider ?? "local") {
  const safeProvider = AI_PROVIDERS[provider] ? provider : "local";
  const prefs = aiPrefs?.providers?.[safeProvider] ?? {};

  return {
    provider: safeProvider,
    apiKey: prefs.apiKey ?? "",
    model: prefs.model || AI_PROVIDERS[safeProvider].defaultModel,
    localModelPath: prefs.localModelPath ?? "",
    localRuntimePath: normalizeLocalRuntimePath(prefs.localRuntimePath),
    visionModelPath: prefs.visionModelPath ?? "",
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

function getLocalModelDownload(model, isAndroidShell) {
  const target = isAndroidShell ? LOCAL_MODEL_DOWNLOADS.android : LOCAL_MODEL_DOWNLOADS.desktop;
  return target[model] ?? null;
}

async function invokeNative(command, args) {
  const tauriInvoke = window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke;
  if (tauriInvoke) return tauriInvoke(command, args);

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
      throw new Error(parsed?.error || "Errore bridge Android");
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
const JSON_SCHEMA = `{"titolo":"","categoria":"Primi|Secondi|Contorni|Dolci|Antipasti|Zuppe|Pizze & Pane|Bevande|Altro","difficolta":"Facile|Media|Difficile","tempoPrep":"20 min","tempoCottura":"30 min","porzioni":4,"ingredienti":["200g pasta"],"procedimento":["Passo 1..."],"note":"","tags":["tag"],"fonte":"URL","foto":"URL immagine .jpg/.png pubblico, stringa vuota se non trovata"}`;

function buildPrompt(url, source, caption, transcript) {
  const schema = JSON_SCHEMA.replace('"fonte":"URL"', `"fonte":"${url}"`);
  const photoHint = source === "web"
    ? "Per foto: URL diretto immagine principale della ricetta (og:image o hero)."
    : "Per foto: cerca una foto del piatto su blog/Pinterest, URL diretto o stringa vuota.";
  const base = `Sei un assistente culinario. Estrai la ricetta e rispondi SOLO con JSON valido, nessun testo extra:\n${schema}\n${photoHint}\n\n`;
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

  const transcriptBlock = transcript
    ? `Trascrizione audio del video:\n"""\n${truncateText(transcript, 3000)}\n"""`
    : "";

  return [
    "Sei un assistente culinario offline. Ricostruisci la ricetta usando solo il contenuto fornito qui sotto.",
    `Rispondi SOLO con JSON valido, nessun testo extra:\n${schema}`,
    `IMPORTANTE per "ingredienti": estrai TUTTI gli ingredienti con quantità menzionati nel testo, nella didascalia e nella trascrizione audio. Anche se gli ingredienti sono citati dentro i passaggi del procedimento e non in una lista separata, devi comunque elencarli uno per uno nel campo "ingredienti" con le quantità (es. "200g farina", "3 uova", "1 spicchio d'aglio"). Non lasciare "ingredienti" vuoto se nel testo ci sono ingredienti.`,
    imageHint,
    source === "youtube"
      ? "Per YouTube usa titolo, descrizione, sottotitoli o testo estratto. Non inventare ingredienti non supportati dal contenuto."
      : "Non usare web search e non citare fonti esterne. Se un dato manca, usa stringa vuota o array parziale.",
    pageTitle,
    transcriptBlock,
    caption ? `Didascalia / testo aggiuntivo:\n"""\n${caption}\n"""` : "",
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

function buildPhotoPrompt({ fileName, note }) {
  const safeFileName = (fileName || "").replace(/"/g, "").trim();
  const sourceLabel = safeFileName ? `Foto importata (${safeFileName})` : "Foto importata";
  const schema = JSON_SCHEMA.replace('"fonte":"URL"', `"fonte":"${sourceLabel}"`);

  return [
    "Sei un assistente culinario che osserva la foto di un piatto o di una preparazione.",
    `Rispondi SOLO con JSON valido, nessun testo extra:\n${schema}`,
    "Riconosci il piatto più probabile e ricostruisci una ricetta realistica e cucinabile.",
    "Se la foto non mostra ogni dettaglio, usa quantità ragionevoli e una versione plausibile del piatto, senza inventare elementi improbabili.",
    'Nel campo "note" indica brevemente che la ricetta è stata ricostruita da una foto quando alcuni dettagli sono stimati.',
    'Nel campo "foto" puoi lasciare stringa vuota: l\'anteprima originale viene gestita dall\'app.',
    note?.trim() ? `Contesto aggiuntivo fornito dall'utente:\n"""\n${note.trim()}\n"""` : "",
  ].filter(Boolean).join("\n\n");
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
  const anchors = [
    "ingredienti",
    "ingredients",
    "procedimento",
    "instructions",
    "method",
    "directions",
    "preparazione",
    "occorrente",
    "dosi",
    "recipe card",
    "for the dough",
    "for the filling",
    "per il condimento",
    "per la salsa",
  ];
  const anchorIndex = anchors
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

async function getLocalAndroidModelStatus() {
  return invokeNative("get_local_android_model_status");
}

function formatDownloadSize(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) return "0.00 GB";
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}

async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

async function importFromUrl({ provider, apiKey, model, url, caption, localModelPath, localRuntimePath, visionModelPath, socialThumbnail, onProgress }) {
  const source  = detectSource(url);
  const ytThumb = source === "youtube" ? getYTThumb(url) : null;
  const localOptions = isLocalProvider(provider)
    ? { modelPath: localModelPath, runtimePath: localRuntimePath }
    : null;

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
        if (result.description) {
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

  if (isLocalProvider(provider)) {
    if (!isSocialClosed) {
      if (source === "youtube") {
        onProgress?.("🎬 Recupero titolo e testo da YouTube…");
      }
      extracted = await extractUrlContent(url);
    }
    if (!isSocialClosed && source === "youtube") {
      try {
        onProgress?.("📝 Recupero i sottotitoli di YouTube…");
        const result = await extractYoutubeTranscript(url);
        if (result?.found) transcript = result.transcript;
      } catch (_) {}
    }
    if (isVideoSource && visionModelPath) {
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
    prompt = buildPrompt(url, source, caption, transcript);
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
  localModelPath,
  localRuntimePath,
  visionModelPath,
  onProgress,
}) {
  const safeFileName = (photoFileName || "").replace(/"/g, "").trim();
  const localOptions = isLocalProvider(provider)
    ? { modelPath: localModelPath, runtimePath: localRuntimePath, visionModelPath }
    : null;

  if (isLocalProvider(provider) && typeof window.AndroidBridge?.invoke === "function") {
    throw new Error("Su Android il modello locale non supporta ancora l'analisi foto. Usa Claude/OpenAI oppure il desktop con modello vision.");
  }

  if (isLocalProvider(provider) && !visionModelPath?.trim()) {
    throw new Error("Per importare da foto in locale serve configurare anche il Modello vision.");
  }

  const prompt = buildPhotoPrompt({ fileName: photoFileName, note: photoNote });
  onProgress?.(isLocalProvider(provider) ? "📷 Analizzo la foto con il modello vision locale…" : "📷 Invio la foto al modello AI…");

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
  const rec = parsed.data;

  if (!rec.fonte) {
    rec.fonte = safeFileName ? `Foto importata: ${safeFileName}` : "Foto importata";
  }

  return {
    recipe: rec,
    debugData: buildImportDebugData({
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
      importMode: "photo",
    }),
  };
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

async function testApiKey(provider, apiKey, localOptions = null) {
  return invokeNative("test_api_key", {
    payload: { provider, apiKey, localOptions },
  });
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  app:         { display:"flex", height:"100vh", overflow:"hidden", background:"#F5F0E8" },
  sidebar:     { width:225, flexShrink:0, background:"#1C1A14", color:"#F5F0E8", display:"flex", flexDirection:"column" },
  logo:        { fontFamily:"'Playfair Display',serif", fontSize:21, fontWeight:700, padding:"20px 18px 16px", borderBottom:"1px solid rgba(245,240,232,.1)" },
  navItem:     { display:"flex", alignItems:"center", gap:9, padding:"10px 18px", cursor:"pointer", fontSize:14, color:"rgba(245,240,232,.55)", borderLeft:"3px solid transparent", transition:"all .15s" },
  navActive:   { color:"#E8A838", borderLeftColor:"#E8A838", background:"rgba(232,168,56,.08)" },
  navSection:  { padding:"14px 18px 5px", fontSize:10, letterSpacing:"1.5px", textTransform:"uppercase", color:"rgba(245,240,232,.3)" },
  catItem:     { display:"flex", alignItems:"center", gap:8, padding:"7px 18px", cursor:"pointer", fontSize:13, transition:"color .15s" },
  sideBtn:     { display:"block", width:"calc(100% - 32px)", margin:"0 16px 6px", padding:"9px 0", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:500, background:"#C84B2F", color:"#fff" },
  sideBtnGhost:{ background:"rgba(245,240,232,.08)", color:"rgba(245,240,232,.7)" },
  providerPill:{ display:"flex", alignItems:"center", gap:6, background:"rgba(245,240,232,.08)", borderRadius:8, padding:"7px 14px", margin:"0 16px 6px", fontSize:12, color:"rgba(245,240,232,.6)", cursor:"pointer", border:"1px solid rgba(245,240,232,.1)", transition:"all .15s" },
  main:        { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  topbar:      { flexShrink:0, background:"#F5F0E8", borderBottom:"1px solid #E0D8C8", padding:"12px 24px", display:"flex", alignItems:"center", gap:10 },
  topTitle:    { fontFamily:"'Playfair Display',serif", fontSize:22, flex:1 },
  searchBox:   { display:"flex", alignItems:"center", gap:8, background:"#FDFAF4", border:"1px solid #E0D8C8", borderRadius:8, padding:"7px 12px", flex:1, maxWidth:300 },
  content:     { flex:1, overflowY:"auto", padding:"24px 28px" },
  grid:        { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))", gap:16 },
  card:        { background:"#FDFAF4", border:"1px solid #E0D8C8", borderRadius:12, overflow:"hidden", cursor:"pointer", transition:"transform .2s,box-shadow .2s", boxShadow:"0 2px 12px rgba(28,26,20,.07)", display:"flex", flexDirection:"column", position:"relative" },
  cardThumb:   { height:130, background:"linear-gradient(135deg,#EDE8DC,#D8D0BE)", display:"flex", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden" },
  catBadge:    { position:"absolute", top:8, left:8, background:"#1C1A14", color:"#E8A838", fontSize:10, padding:"2px 7px", borderRadius:4, fontWeight:500, zIndex:1 },
  cardBody:    { padding:"12px 14px 14px", flex:1, display:"flex", flexDirection:"column", gap:6 },
  cardTitle:   { fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:600, lineHeight:1.2 },
  cardMeta:    { display:"flex", gap:12, fontSize:12, color:"#888" },
  diffBadge:   { fontSize:11, padding:"2px 8px", borderRadius:4, fontWeight:500 },
  dFacile:     { background:"#E8F5E9", color:"#2E7D32" },
  dMedia:      { background:"#FFF3E0", color:"#E65100" },
  dDifficile:  { background:"#FFEBEE", color:"#C62828" },
  iconBtn:     { background:"none", border:"none", cursor:"pointer", fontSize:16, padding:"4px 6px", borderRadius:6 },
  selCircle:   { position:"absolute", top:8, right:8, width:24, height:24, borderRadius:"50%", border:"2px solid rgba(255,255,255,.9)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2, transition:"all .15s" },
  empty:       { textAlign:"center", padding:"70px 20px", color:"#888" },
  detail:      { padding:"28px 32px", maxWidth:820, overflowY:"auto", height:"100%" },
  detailTitle: { fontFamily:"'Playfair Display',serif", fontSize:32, fontWeight:700, lineHeight:1.15, marginBottom:14 },
  badges:      { display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 },
  badge:       { background:"#EDE8DC", border:"1px solid #D8D0BE", borderRadius:20, padding:"4px 12px", fontSize:13, color:"#555" },
  tag:         { background:"#EDE8DC", border:"1px solid #D8D0BE", borderRadius:4, padding:"2px 8px", fontSize:12, color:"#777" },
  detailGrid:  { display:"grid", gridTemplateColumns:"1fr 2fr", gap:24, marginBottom:16 },
  secTitle:    { fontFamily:"'Playfair Display',serif", fontSize:18, marginBottom:12 },
  ingItem:     { padding:"7px 0", borderBottom:"1px solid #EDE8DC", fontSize:14, display:"flex", alignItems:"center", gap:8 },
  ingDot:      { width:5, height:5, borderRadius:"50%", background:"#C84B2F", flexShrink:0, display:"inline-block" },
  stepItem:    { display:"flex", gap:12, marginBottom:14 },
  stepNum:     { width:26, height:26, borderRadius:"50%", background:"#C84B2F", color:"#fff", fontSize:12, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 },
  noteBox:     { background:"#FFF8EC", border:"1px solid #F0D89A", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#7A5C00", marginTop:16 },
  sourceLink:  { fontSize:13, color:"#C84B2F", textDecoration:"none" },
  backBtn:     { background:"none", border:"none", cursor:"pointer", color:"#888", fontSize:14, fontWeight:500, padding:"6px 10px 6px 0" },
  listCard:    { background:"#FDFAF4", border:"1px solid #E0D8C8", borderRadius:12, marginBottom:14, overflow:"hidden" },
  listHeader:  { padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" },
  repartoT:    { fontSize:10, textTransform:"uppercase", letterSpacing:"1px", color:"#999", margin:"12px 0 4px" },
  listItem:    { display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:"1px solid #EDE8DC", fontSize:14 },
  listCheck:   { width:20, height:20, borderRadius:5, border:"1.5px solid #D0C8B8", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all .1s" },
  overlay:     { position:"fixed", inset:0, background:"rgba(28,26,20,.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, backdropFilter:"blur(4px)" },
  modal:       { background:"#FDFAF4", borderRadius:16, padding:28, width:560, maxWidth:"95vw", maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(28,26,20,.25)" },
  modalTitle:  { fontFamily:"'Playfair Display',serif", fontSize:22, marginBottom:16 },
  label:       { display:"block", fontSize:11, fontWeight:600, color:"#999", marginBottom:5, textTransform:"uppercase", letterSpacing:".5px" },
  input:       { width:"100%", padding:"9px 12px", border:"1px solid #E0D8C8", borderRadius:8, fontSize:14, background:"#F5F0E8", color:"#1C1A14", outline:"none" },
  errMsg:      { color:"#C84B2F", fontSize:13, marginTop:8 },
  btnPrimary:  { display:"inline-flex", alignItems:"center", gap:6, padding:"9px 18px", borderRadius:8, background:"#C84B2F", color:"#fff", border:"none", cursor:"pointer", fontSize:14, fontWeight:500 },
  btnSecondary:{ display:"inline-flex", alignItems:"center", gap:6, padding:"9px 14px", borderRadius:8, background:"#EDE8DC", color:"#1C1A14", border:"1px solid #D8D0BE", cursor:"pointer", fontSize:14 },
  selBar:      { display:"flex", alignItems:"center", gap:12, background:"#1C1A14", color:"#F5F0E8", padding:"10px 16px", borderRadius:8, marginBottom:16, fontSize:13 },
  loadOverlay: { position:"fixed", inset:0, background:"rgba(28,26,20,.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 },
  loadBox:     { background:"#FDFAF4", borderRadius:14, padding:"32px 40px", textAlign:"center", boxShadow:"0 20px 60px rgba(0,0,0,.2)" },
  spinner:     { width:36, height:36, border:"3px solid #E0D8C8", borderTopColor:"#C84B2F", borderRadius:"50%", animation:"spin .7s linear infinite", margin:"0 auto 16px" },
  // Provider switch
  switchRow:   { display:"flex", background:"#EDE8DC", borderRadius:10, padding:3, marginBottom:20 },
  switchOpt:   { flex:1, padding:"9px 0", textAlign:"center", borderRadius:8, fontSize:14, fontWeight:500, cursor:"pointer", transition:"all .2s", border:"none" },
  switchActive:{ background:"#FDFAF4", boxShadow:"0 1px 4px rgba(28,26,20,.12)", color:"#1C1A14" },
  switchInact: { background:"transparent", color:"#888" },
  // Setup
  setupWrap:   { display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#F5F0E8" },
  setupBox:    { background:"#FDFAF4", borderRadius:20, padding:48, width:520, boxShadow:"0 20px 60px rgba(28,26,20,.12)", textAlign:"center" },
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
  const [recipes, setRecipes] = useState(() => ls.get("rv_recipes", []));
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
  const [socialPreview, setSocialPreview] = useState(null);
  const [fetchingSocialPreview, setFetchingSocialPreview] = useState(false);
  const [socialPreviewPending, setSocialPreviewPending] = useState(false);
  const [importConfigOpen, setImportConfigOpen] = useState(false);
  const [importProvider, setImportProvider] = useState(() => getAiConfig(loadInitialAiPrefs()).provider);
  const [importApiKey, setImportApiKey] = useState(() => getAiConfig(loadInitialAiPrefs()).apiKey);
  const [importModel, setImportModel] = useState(() => getAiConfig(loadInitialAiPrefs()).model);
  const [importLocalModelPath, setImportLocalModelPath] = useState(() => getAiConfig(loadInitialAiPrefs()).localModelPath);
  const [importLocalRuntimePath, setImportLocalRuntimePath] = useState(() => getAiConfig(loadInitialAiPrefs()).localRuntimePath);
  const [importVisionModelPath, setImportVisionModelPath] = useState(() => getAiConfig(loadInitialAiPrefs()).visionModelPath);
  const [testingImportKey, setTestingImportKey] = useState(false);
  const [importKeyStatus, setImportKeyStatus] = useState(null);
  const [localDownloadId, setLocalDownloadId] = useState(null);
  const [localDownloadStatus, setLocalDownloadStatus] = useState(null);
  const [visionDownloadPhase, setVisionDownloadPhase] = useState(null);
  const [visionDownloadId, setVisionDownloadId] = useState(null);
  const [visionDownloadStatus, setVisionDownloadStatus] = useState(null);
  const [whisperDownloadId, setWhisperDownloadId] = useState(null);
  const [whisperDownloadStatus, setWhisperDownloadStatus] = useState(null);
  const [runtimeStatus, setRuntimeStatus] = useState(null);
  const [checkingRuntime, setCheckingRuntime] = useState(false);
  const [copiedInstallCmd, setCopiedInstallCmd] = useState(false);
  const [androidBundledModelStatus, setAndroidBundledModelStatus] = useState(null);
  const [checkingAndroidBundledModel, setCheckingAndroidBundledModel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingContext, setLoadingContext] = useState(null);
  const [loadMsg, setLoadMsg] = useState("");
  const [err, setErr]         = useState("");
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [selMode, setSelMode] = useState(false);
  const [sel, setSel]         = useState([]);
  const [listName, setListName] = useState("");
  const [openList, setOpenList] = useState(null);
  const [favOnly, setFavOnly] = useState(false);
  const [manual, setManual]   = useState({ titolo:"", categoria:"Altro", difficolta:"Facile", tempoPrep:"", tempoCottura:"", porzioni:4, ingredienti:"", procedimento:"", note:"", foto:"" });
  const [editRec, setEditRec] = useState(null);
  const [devModeOpen, setDevModeOpen] = useState(false);
  const activeImportRequestRef = useRef(0);
  const cancelledImportRequestRef = useRef(null);
  const loadMsgTimeoutRef = useRef(null);

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
  const persist    = useCallback(r => { setRecipes(r); ls.set("rv_recipes", r); }, []);
  const persistL   = useCallback(l => { setLists(l);   ls.set("rv_lists", l);   }, []);
  const activeAiConfig = getAiConfig(aiPrefs);
  const activeProvider = AI_PROVIDERS[activeAiConfig.provider];
  const activeAiReady = requiresApiKey(activeAiConfig.provider)
    ? Boolean(activeAiConfig.apiKey.trim())
    : Boolean(activeAiConfig.localModelPath.trim());
  const isAndroidShell = typeof window.AndroidBridge?.invoke === "function";
  const isCompactUi = isAndroidShell || viewportWidth <= 920;
  const pageTitle = view==="home" ? (cat==="Tutte" ? "Tutte le ricette" : cat) : "Liste della spesa";
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
              lastProvider: "local",
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
            const mmproj = LOCAL_MODEL_DOWNLOADS.vision.mmproj;
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
  }, [isAndroidShell, modal, importProvider]);

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
    setSocialPreview(null);
    setFetchingSocialPreview(false);
    setSocialPreviewPending(false);
    setErr("");
  };

  const openImportModal = (mode = "url") => {
    const importConfig = getAiConfig(aiPrefs);
    setImportMode(mode);
    setImportProvider(importConfig.provider);
    setImportApiKey(importConfig.apiKey);
    setImportModel(importConfig.model);
    setImportLocalModelPath(importConfig.localModelPath);
    setImportLocalRuntimePath(importConfig.localRuntimePath);
    setImportVisionModelPath(importConfig.visionModelPath);
    setLocalDownloadId(null);
    setLocalDownloadStatus(null);
    setVisionDownloadId(null);
    setVisionDownloadStatus(null);
    setVisionDownloadPhase(null);
    setWhisperDownloadId(null);
    setWhisperDownloadStatus(null);
    setRuntimeStatus(null);
    setCopiedInstallCmd(false);
    setAndroidBundledModelStatus(null);
    setImportKeyStatus(null);
    resetImportDraft();
    const cfg = importConfig;
    const isLocal = cfg.provider === "local";
    const hasCredential = isLocal ? Boolean(cfg.localModelPath?.trim()) : Boolean(cfg.apiKey?.trim());
    setImportConfigOpen(!hasCredential);
    setModal("import");
  };

  const openPhotoModal = () => openImportModal("photo");

  const openAddRecipeModal = () => {
    setErr("");
    setModal(isCompactUi ? "quickAdd" : "import");
  };

  const switchImportProvider = nextProvider => {
    const nextConfig = getAiConfig(aiPrefs, nextProvider);
    setImportProvider(nextProvider);
    setImportApiKey(nextConfig.apiKey);
    setImportModel(nextConfig.model);
    setImportLocalModelPath(nextConfig.localModelPath);
    setImportLocalRuntimePath(nextConfig.localRuntimePath);
    setImportVisionModelPath(nextConfig.visionModelPath);
    setLocalDownloadId(null);
    setLocalDownloadStatus(null);
    setRuntimeStatus(null);
    setCopiedInstallCmd(false);
    setAndroidBundledModelStatus(null);
    setImportKeyStatus(null);
    setErr("");
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
      const status = await getLocalAndroidModelStatus();
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

  const autoDownloadLocalModel = async () => {
    const downloadPreset = getLocalModelDownload(importModel, isAndroidShell);
    if (!downloadPreset) {
      setErr("Download automatico disponibile solo per il modello consigliato Gemma 3n.");
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

  const autoDownloadVisionModel = async () => {
    const preset = LOCAL_MODEL_DOWNLOADS.vision;
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
    const localOptions = { modelPath: importLocalModelPath.trim(), runtimePath: importLocalRuntimePath.trim() };

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
      const ok = await testApiKey(importProvider, importApiKey.trim(), localOptions);
      if (!ok) {
        setImportKeyStatus("err");
        setErr(isLocalProvider(importProvider) ? "Modello o runtime non validi" : "Chiave non valida o errore di connessione");
        return;
      }

      saveAiPrefs({
        ...aiPrefs,
        lastProvider: importProvider,
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
             (r.ingredienti||[]).some(i => i.toLowerCase().includes(qq));
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
      setErr("Configura prima un provider AI da “Importa URL”.");
      return;
    }

    const localOptions = isLocalProvider(activeAiConfig.provider)
      ? { modelPath: activeAiConfig.localModelPath, runtimePath: activeAiConfig.localRuntimePath }
      : null;

    setAiSearching(true);
    setErr("");

    try {
      const prompt = buildAiRecipeSearchPrompt(trimmedQuery, recipes);
      const txt = await callAI({
        provider: activeAiConfig.provider,
        apiKey: activeAiConfig.apiKey,
        model: activeAiConfig.model,
        prompt,
        useWebSearch: false,
        localOptions,
      });

      const result = await parseStructuredResponse({
        txt,
        provider: activeAiConfig.provider,
        apiKey: activeAiConfig.apiKey,
        model: activeAiConfig.model,
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
      setErr(`Errore ricerca AI: ${error.message}`);
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
      setErr("Inserisci la chiave API del provider scelto");
      return;
    }
    if (isLocalProvider(importConfig.provider) && !importConfig.localModelPath?.trim()) {
      setErr("Inserisci il percorso del modello locale");
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
    setLoadMsg("📷 Osservo la foto del piatto…");

    try {
      saveAiPrefs({
        ...aiPrefs,
        lastProvider: normalizedConfig.provider,
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
        onProgress: msg => {
          if (activeImportRequestRef.current === requestId && cancelledImportRequestRef.current !== requestId) {
            setLoadMsg(msg);
          }
        },
      });
      if (cancelledImportRequestRef.current === requestId) return;

      const photoPreview = photoDataUrl.length <= 350_000 ? photoDataUrl : "";
      const newRec = {
        ...imported.recipe,
        id: Date.now(),
        createdAt: new Date().toISOString(),
        fav: false,
        foto: imported.recipe.foto || photoPreview,
        devData: imported.debugData,
      };
      persist([newRec, ...recipes]);
      setModal(null);
      resetImportDraft();
      setActiveRec(newRec);
      setView("detail");
    } catch (error) {
      if (cancelledImportRequestRef.current === requestId) return;
      setErr("Errore: " + error.message);
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
      setErr("Inserisci la chiave API del provider scelto");
      return;
    }
    if (isLocalProvider(importConfig.provider) && !importConfig.localModelPath?.trim()) {
      setErr("Inserisci il percorso del modello locale");
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
        lastProvider: normalizedConfig.provider,
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
      const newRec = {
        ...imported.recipe,
        id: Date.now(),
        createdAt: new Date().toISOString(),
        fav: false,
        devData: imported.debugData,
      };
      persist([newRec, ...recipes]);
      setModal(null);
      resetImportDraft();
      setActiveRec(newRec); setView("detail");
    } catch(e) {
      if (cancelledImportRequestRef.current === requestId) return;
      setErr("Errore: " + e.message);
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

  const doManual = () => {
    if (!manual.titolo.trim()) { setErr("Inserisci il titolo"); return; }
    const newRec = { ...manual, id: Date.now(), createdAt: new Date().toISOString(), fav: false,
      ingredienti: manual.ingredienti.split("\n").filter(Boolean),
      procedimento: manual.procedimento.split("\n").filter(Boolean),
      tags: [], fonte: "" };
    persist([newRec, ...recipes]);
    setModal(null);
    setManual({ titolo:"", categoria:"Altro", difficolta:"Facile", tempoPrep:"", tempoCottura:"", porzioni:4, ingredienti:"", procedimento:"", note:"", foto:"" });
    setActiveRec(newRec); setView("detail");
  };

  const openEditModal = rec => {
    setEditRec({
      ...rec,
      ingredienti: Array.isArray(rec.ingredienti) ? rec.ingredienti.join("\n") : (rec.ingredienti || ""),
      procedimento: Array.isArray(rec.procedimento) ? rec.procedimento.join("\n") : (rec.procedimento || ""),
      tags: Array.isArray(rec.tags) ? rec.tags.join(", ") : (rec.tags || ""),
    });
    setErr("");
    setModal("edit");
  };

  const doEditSave = () => {
    if (!editRec?.titolo?.trim()) { setErr("Inserisci il titolo"); return; }
    const updated = recipes.map(r => r.id === editRec.id ? {
      ...r,
      titolo: editRec.titolo,
      categoria: editRec.categoria,
      difficolta: editRec.difficolta,
      tempoPrep: editRec.tempoPrep,
      tempoCottura: editRec.tempoCottura,
      porzioni: editRec.porzioni,
      ingredienti: editRec.ingredienti.split("\n").filter(Boolean),
      procedimento: editRec.procedimento.split("\n").filter(Boolean),
      note: editRec.note,
      foto: editRec.foto,
      tags: editRec.tags ? editRec.tags.split(",").map(t => t.trim()).filter(Boolean) : r.tags,
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
    if (requiresApiKey(activeAiConfig.provider) && !activeAiConfig.apiKey.trim()) {
      setErr("Configura prima un provider AI da “Importa URL”.");
      return;
    }
    if (isLocalProvider(activeAiConfig.provider) && !activeAiConfig.localModelPath.trim()) {
      setErr("Configura prima il modello locale da “Importa URL”.");
      return;
    }
    setErr(""); setLoading(true); setLoadMsg("🛒 Genero la lista della spesa…");
    try {
      const chosen = recipes.filter(r => sel.includes(r.id));
      const data   = await buildShoppingList({ ...activeAiConfig, recipes: chosen });
      const newList = { id: Date.now(), nome: listName || "Lista " + new Date().toLocaleDateString("it"),
        items: data.items.map(i => ({ ...i, id: Math.random(), done: false })),
        ricette: chosen.map(r => r.titolo), createdAt: new Date().toISOString() };
      persistL([newList, ...lists]);
      setModal(null); setSelMode(false); setSel([]); setListName("");
      setView("lists"); setOpenList(newList.id);
    } catch(e) { setErr("Errore: " + e.message); }
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

  const Detail = ({ r }) => (
    <div style={{ ...S.detail, ...(isCompactUi ? { padding:"18px 18px calc(110px + env(safe-area-inset-bottom))", maxWidth:"100%" } : {}) }} className="selectable">
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:isCompactUi ? 16 : 20, flexWrap:"wrap", ...(isCompactUi ? { position:"sticky", top:0, zIndex:5, background:"rgba(245,240,232,.94)", backdropFilter:"blur(12px)", paddingBottom:10 } : {}) }}>
        <button style={{ ...S.backBtn, ...(isCompactUi ? { fontSize:15, fontWeight:600, padding:"10px 14px", borderRadius:999, background:"#FDFAF4", border:"1px solid #E0D8C8" } : {}) }} onClick={()=>{setView("home");setActiveRec(null);setDevModeOpen(false);}}>← Indietro</button>
        <button style={{ ...S.iconBtn, color:r.fav?"#E8A838":"#bbb", fontSize:20, ...(isCompactUi ? { padding:"10px 12px", background:"#FDFAF4", border:"1px solid #E0D8C8" } : {}) }} onClick={()=>toggleFav(r.id)}>★</button>
        <button style={{ ...S.iconBtn, color:"#5B7A3A", fontSize:18, ...(isCompactUi ? { padding:"10px 12px", background:"#FDFAF4", border:"1px solid #E0D8C8" } : {}) }} onClick={()=>openEditModal(r)}>✏️</button>
        <button style={{ ...S.iconBtn, color:"#C84B2F", fontSize:18, ...(isCompactUi ? { padding:"10px 12px", background:"#FDFAF4", border:"1px solid #E0D8C8" } : {}) }} onClick={()=>doDelete(r.id)}>🗑</button>
        {r.devData && (
          <button
            style={{ ...S.btnSecondary, ...(isCompactUi ? { padding:"10px 14px", borderRadius:999 } : { padding:"7px 12px" }) }}
            onClick={() => setDevModeOpen(true)}
          >
            🧪 DEV MODE
          </button>
        )}
        {r.fonte && <a href={r.fonte} style={S.sourceLink} target="_blank" rel="noreferrer">🔗 Fonte originale</a>}
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
        {r.porzioni     && <span style={S.badge}>👤 {r.porzioni} porzioni</span>}
      </div>
      {r.tags?.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:20 }}>
          {r.tags.map(t=><span key={t} style={S.tag}>#{t}</span>)}
        </div>
      )}
      <div style={{ ...S.detailGrid, ...(isCompactUi ? { gridTemplateColumns:"1fr", gap:20 } : {}) }}>
        <div>
          <h2 style={S.secTitle}>🧂 Ingredienti</h2>
          <ul style={{ listStyle:"none" }}>
            {(r.ingredienti||[]).map((ing,i)=>(
              <li key={i} style={S.ingItem}><span style={S.ingDot}/>{ing}</li>
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
      {r.note && <div style={S.noteBox}><strong>📝 Note: </strong>{r.note}</div>}
    </div>
  );

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
    const isLocal = importProvider === "local";
    if (isLocal) {
      if (importMode === "photo") {
        return !isAndroidShell && Boolean(importLocalModelPath?.trim() && importVisionModelPath?.trim());
      }
      return Boolean(importLocalModelPath?.trim());
    }
    return Boolean(importApiKey?.trim());
  })();

  const ImportModal = () => {
    const isPhotoMode = importMode === "photo";
    const importProviderInfo = AI_PROVIDERS[importProvider];
    const importUsesApiKey = requiresApiKey(importProvider);
    const localDownloadPreset = importProvider === "local"
      ? getLocalModelDownload(importModel, isAndroidShell)
      : null;
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
      <div style={{ background:"#F5F0E8", borderRadius:isCompactUi ? 16 : 10, marginBottom:16, overflow:"hidden" }}>
        <button
          onClick={() => setImportConfigOpen(o => !o)}
          style={{ display:"flex", alignItems:"center", gap:10, width:"100%", background:"none", border:"none", cursor:"pointer", padding:isCompactUi ? 16 : 14, textAlign:"left" }}
        >
          <span style={{ width:10, height:10, borderRadius:"50%", background:importConfigReady ? "#2E7D32" : "#C84B2F", flexShrink:0 }} />
          <span style={{ flex:1, fontSize:14, fontWeight:600, color:"#3C3526" }}>
            Configurazione AI — {AI_PROVIDERS[importProvider]?.icon} {AI_PROVIDERS[importProvider]?.name}
          </span>
          <span style={{ fontSize:11, color:importConfigReady ? "#2E7D32" : "#C84B2F", fontWeight:500, marginRight:6 }}>{importConfigReady ? "Configurato" : "Non configurato"}</span>
          <span style={{ fontSize:12, color:"#aaa", transition:"transform .2s", transform:importConfigOpen ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
        </button>
        <div style={{ display:importConfigOpen ? "block" : "none", padding:isCompactUi ? "0 16px 16px" : "0 14px 14px" }}>
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
                  placeholder={isAndroidShell ? "@bundled oppure /data/local/tmp/llm/model.task" : "/Users/tuo-utente/models/gemma-3n-e2b.gguf"}
                  value={importLocalModelPath}
                  onChange={e => { setImportLocalModelPath(e.target.value); setImportKeyStatus(null); setErr(""); }}
                />
                <p style={{ fontSize:12, color:"#888", marginTop:5, lineHeight:1.5 }}>
                  {isAndroidShell
                    ? "Usa `@bundled` per il modello incluso nell'app, oppure un file MediaPipe/LiteRT `.task` copiato sul device."
                    : "Usa un modello GGUF locale. Consigliato Gemma 3n E2B quantizzato 4-bit."}
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
                  <div style={{ marginTop:12, background:"#FDFAF4", border:"1px solid #E0D8C8", borderRadius:12, padding:"12px 14px" }}>
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
                  <div style={{ marginTop:12, background:"#FDFAF4", border:"1px solid #E0D8C8", borderRadius:12, padding:"12px 14px" }}>
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
                  <div style={{ marginTop:10, background:"#FDFAF4", border:"1px solid #E0D8C8", borderRadius:12, padding:"12px 14px" }}>
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
              {!isAndroidShell && (
                <div style={{ gridColumn:"1 / -1" }}>
                  <label style={S.label}>Modello vision (opzionale, per foto e video)</label>
                  <input
                    style={{ ...S.input, fontFamily:"monospace", letterSpacing:".2px" }}
                    placeholder="Vuoto = disattivato. Es: /Users/tuo-utente/models/Qwen2.5-VL-3B-Q4.gguf"
                    value={importVisionModelPath}
                    onChange={e => { setImportVisionModelPath(e.target.value); setErr(""); }}
                  />
                  <p style={{ fontSize:12, color:"#888", marginTop:5, lineHeight:1.5 }}>
                    Modello GGUF con supporto vision (es. Qwen2.5-VL 3B). Se configurato, RecipeVault può analizzare foto di piatti e video da YouTube/TikTok/Instagram/Facebook.
                  </p>
                  <div style={{ marginTop:10, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    <button
                      style={{ ...S.btnSecondary, ...(isCompactUi ? { width:"100%", justifyContent:"center", padding:"13px 16px", borderRadius:14 } : {}) }}
                      onClick={autoDownloadVisionModel}
                      disabled={Boolean(visionDownloadId) || visionDownloadStatus?.state === "starting"}
                    >
                      {visionDownloadId || visionDownloadStatus?.state === "starting"
                        ? `Scarico ${visionDownloadPhase === "mmproj" ? "mmproj" : "modello"}…`
                        : `⬇️ Scarica ${LOCAL_MODEL_DOWNLOADS.vision.model.label}`}
                    </button>
                    <span style={{ fontSize:12, color:"#888" }}>
                      {LOCAL_MODEL_DOWNLOADS.vision.totalLabel} · {LOCAL_MODEL_DOWNLOADS.vision.note}
                    </span>
                  </div>
                  {visionDownloadStatus && (
                    <div style={{ marginTop:12, background:"#FDFAF4", border:"1px solid #E0D8C8", borderRadius:12, padding:"12px 14px" }}>
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
              )}
              {!isAndroidShell && (
                <div style={{ gridColumn:"1 / -1" }}>
                  <label style={S.label}>Trascrizione audio (fallback video)</label>
                  <p style={{ fontSize:12, color:"#888", marginTop:2, marginBottom:8, lineHeight:1.5 }}>
                    Se un video non ha sottotitoli, RecipeVault scarica l'audio e lo trascrive con Whisper. Scarica il modello per attivare il fallback.
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
                    <div style={{ marginTop:12, background:"#FDFAF4", border:"1px solid #E0D8C8", borderRadius:12, padding:"12px 14px" }}>
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
                          ? `Whisper pronto. Trascrizione audio attiva automaticamente.`
                          : whisperDownloadStatus.state === "error"
                            ? (whisperDownloadStatus.error || "Errore sconosciuto")
                            : typeof whisperDownloadStatus.totalBytes === "number" && whisperDownloadStatus.totalBytes > 0
                              ? `${((whisperDownloadStatus.downloadedBytes / whisperDownloadStatus.totalBytes) * 100).toFixed(1)}% completato`
                              : "Calcolo dimensione in corso…"}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <div>
            <label style={S.label}>Modello</label>
            <select
              style={S.input}
              value={importModel}
              onChange={e => { setImportModel(e.target.value); setImportKeyStatus(null); setErr(""); }}
            >
              {importProviderInfo.models.map(modelName => <option key={modelName} value={modelName}>{modelName}</option>)}
            </select>
          </div>
          <div style={{ display:"flex", alignItems:"end" }}>
            <button style={{ ...S.btnSecondary, width:"100%", justifyContent:"center", ...(isCompactUi ? { padding:"13px 16px", borderRadius:14 } : {}) }} onClick={testImportKey} disabled={testingImportKey}>
              {testingImportKey ? "Verifico…" : importUsesApiKey ? "Verifica chiave" : "Verifica modello"}
            </button>
          </div>
        </div>
        {importProvider === "openai" && (
          <p style={{ fontSize:12, color:"#888", marginTop:8 }}>
            {isPhotoMode
              ? <>💡 OpenAI riceve direttamente la foto del piatto e prova a ricostruire la ricetta più plausibile.</>
              : <>💡 Per gli URL OpenAI usa automaticamente <strong>gpt-4o-search-preview</strong> con ricerca web integrata.</>}
          </p>
        )}
        {importProvider === "claude" && (
          <p style={{ fontSize:12, color:"#888", marginTop:8 }}>
            {isPhotoMode
              ? <>💡 Claude analizza direttamente la foto e ricostruisce una ricetta a partire dal piatto riconosciuto.</>
              : <>💡 Claude usa il modello scelto con <strong>web_search</strong> integrato.</>}
          </p>
        )}
        {importProvider === "local" && (
          <p style={{ fontSize:12, color:"#888", marginTop:8, lineHeight:1.5 }}>
            {isPhotoMode
              ? "💡 In locale desktop la foto viene analizzata dal Modello vision, senza API esterne."
              : "💡 In locale l’app estrae il testo della pagina e lo passa direttamente al modello, senza API esterne."}
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
        </div>
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
            <label style={S.label}>Foto del piatto</label>
            <label style={{
              display:"block",
              border:"1.5px dashed #D8D0BE",
              background:"#F9F5EE",
              borderRadius:isCompactUi ? 18 : 14,
              padding:isCompactUi ? 18 : 16,
              cursor:"pointer",
            }}>
              <input type="file" accept="image/*" style={{ display:"none" }} onChange={handlePhotoSelection} />
              {photoDataUrl ? (
                <div>
                  <div style={{ borderRadius:14, overflow:"hidden", marginBottom:10, maxHeight:isCompactUi ? 260 : 220 }}>
                    <img src={photoDataUrl} alt={photoFileName || "Foto piatto"} style={{ width:"100%", maxHeight:isCompactUi ? 260 : 220, objectFit:"cover" }} />
                  </div>
                  <div style={{ fontSize:13, color:"#5C5245", fontWeight:600 }}>{photoFileName || "Foto selezionata"}</div>
                  <div style={{ fontSize:12, color:"#8A7C69", marginTop:4 }}>Tocca per sostituire la foto</div>
                </div>
              ) : (
                <div style={{ textAlign:"center", color:"#7A7062" }}>
                  <div style={{ fontSize:36, marginBottom:8 }}>📷</div>
                  <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>Seleziona una foto del piatto</div>
                  <div style={{ fontSize:12, lineHeight:1.5 }}>Può essere una foto dal telefono, desktop o una schermata del piatto.</div>
                </div>
              )}
            </label>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={S.label}>Contesto aggiuntivo (opzionale)</label>
            <textarea
              style={{ ...S.input, minHeight:88, resize:"vertical" }}
              placeholder="Es. è una pasta ai funghi cremosa, porzione per 2 persone, cucina calabrese…"
              value={photoNote}
              onChange={e => { setPhotoNote(e.target.value); setErr(""); }}
            />
            <div style={{ fontSize:12, color:"#888", marginTop:5, lineHeight:1.5 }}>
              Aiuta l’AI se conosci già qualche dettaglio del piatto, ma puoi anche lasciare vuoto.
            </div>
          </div>
          {importProvider === "local" && (
            <div style={{ marginBottom:12, background:"#FFF8EC", border:"1px solid #F0D89A", borderRadius:12, padding:"12px 14px", fontSize:12, color:"#7A5C00", lineHeight:1.55 }}>
              {isAndroidShell
                ? "Il provider locale su Android non supporta ancora l’analisi foto. Per questa modalità usa Claude/OpenAI oppure il desktop con Modello vision configurato."
                : "Per il provider locale serve configurare anche il Modello vision nella sezione sopra."}
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
          disabled={loading || (isPhotoMode ? !photoDataUrl : (!url.trim() || socialCaptionLock))}
        >
          {loading
            ? loadMsg
            : !isPhotoMode && socialCaptionLock
              ? "Recupero didascalia…"
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

  // ── Layout ──
  return (
    <div style={{ ...S.app, ...(isCompactUi ? { display:"block", minHeight:"100dvh", height:"auto", overflow:"visible", background:"linear-gradient(180deg,#F5F0E8 0%,#EFE6DA 100%)" } : {}) }}>
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
            <div style={{ ...S.providerPill, cursor:"default" }}>
              <span>{activeProvider.icon}</span>
              <span style={{ flex:1 }}>
                {activeAiReady ? `Ultimo AI: ${activeProvider.name}` : "Scegli l'AI dentro Importa URL"}
              </span>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <button style={{ ...S.sideBtn, flex:1, margin:0, fontSize:11, background:"rgba(245,240,232,.06)", color:"rgba(245,240,232,.4)" }} onClick={exportJSON}>⬆ Export</button>
              <button style={{ ...S.sideBtn, flex:1, margin:0, fontSize:11, background:"rgba(245,240,232,.06)", color:"rgba(245,240,232,.4)" }} onClick={importJSON}>⬇ Import</button>
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <div style={{ ...S.main, ...(isCompactUi ? { minHeight:"100dvh", overflow:"visible", paddingBottom:"calc(84px + env(safe-area-inset-bottom))" } : {}) }}>
        {view !== "detail" && (
          <div style={{ ...S.topbar, ...(isCompactUi ? { position:"sticky", top:0, zIndex:10, padding:"18px 16px 14px", display:"block", background:"rgba(245,240,232,.96)", backdropFilter:"blur(14px)", borderBottom:"1px solid rgba(224,216,200,.9)" } : {}) }}>
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
                    <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:2 }}>
                      <div style={{ ...S.providerPill, minWidth:"max-content", margin:0, padding:"10px 12px", background:"#FDFAF4", color:"#5C5245" }}>
                        <span>{recipes.length}</span>
                        <span>ricette salvate</span>
                      </div>
                      {activeAiReady && (
                        <div style={{ ...S.providerPill, minWidth:"max-content", margin:0, padding:"10px 12px", background:"#FDFAF4", color:"#5C5245" }}>
                          <span>{activeProvider.icon}</span>
                          <span>{activeProvider.name}</span>
                        </div>
                      )}
                      {!selMode
                        ? <button style={{ ...S.btnSecondary, minWidth:"max-content", padding:"10px 14px", borderRadius:999 }} onClick={()=>{setSelMode(true);setView("home");}}>☑ Seleziona</button>
                        : <>
                          <button style={{ ...S.btnPrimary, minWidth:"max-content", padding:"10px 14px", borderRadius:999 }} onClick={()=>{if(!sel.length)return;setErr("");setModal("list");}} disabled={!sel.length}>🛒 {sel.length}</button>
                          <button style={{ ...S.btnSecondary, minWidth:"max-content", padding:"10px 14px", borderRadius:999 }} onClick={()=>{setSelMode(false);setSel([]);}}>Chiudi</button>
                        </>}
                      <button style={{ ...S.btnSecondary, minWidth:"max-content", padding:"10px 14px", borderRadius:999 }} onClick={exportJSON}>⬆ Export</button>
                      <button style={{ ...S.btnSecondary, minWidth:"max-content", padding:"10px 14px", borderRadius:999 }} onClick={importJSON}>⬇ Import</button>
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
                background:"#FDFAF4",
                border:"1px solid #E0D8C8",
                borderRadius:isCompactUi ? 20 : 16,
                padding:isCompactUi ? 16 : 18,
                boxShadow:"0 8px 24px rgba(28,26,20,.05)",
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
                      onClick={() => {
                        clearAiRecipeSearch();
                        setIngredientFilter("");
                        setCat("Tutte");
                      }}
                    >
                      Mostra tutte
                    </button>
                  </div>
                )}

                {!activeAiReady && (
                  <div style={{ marginTop:12, fontSize:12, color:"#8A7C69", lineHeight:1.55 }}>
                    Per usare questa ricerca configura prima il provider AI dentro <strong>Importa da URL</strong>.
                  </div>
                )}
              </div>

              <div style={{
                background:"#FDFAF4",
                border:"1px solid #E0D8C8",
                borderRadius:isCompactUi ? 20 : 16,
                padding:isCompactUi ? 16 : 18,
                boxShadow:"0 8px 24px rgba(28,26,20,.05)",
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
                      {globalIngredientCatalog.length} ingredienti riconosciuti
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
          background:"rgba(28,26,20,.96)",
          boxShadow:"0 18px 40px rgba(28,26,20,.26)",
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
          <div style={{ background:"#FDFAF4", borderRadius:isCompactUi ? 24 : 16, padding:isCompactUi ? "28px 22px" : "24px 28px", maxWidth:380, width:"90%", boxShadow:"0 16px 48px rgba(0,0,0,.25)", textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🗑</div>
            <p style={{ fontSize:15, color:"#3C3526", lineHeight:1.5, marginBottom:20 }}>{confirmDialog.message}</p>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button style={{ ...S.btnSecondary, flex:1, justifyContent:"center", ...(isCompactUi ? { padding:"14px 16px", borderRadius:14 } : {}) }} onClick={()=>setConfirmDialog(null)}>Annulla</button>
              <button style={{ ...S.btnPrimary, flex:1, justifyContent:"center", background:"#C84B2F", ...(isCompactUi ? { padding:"14px 16px", borderRadius:14 } : {}) }} onClick={confirmDialog.onConfirm}>Elimina</button>
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
        <div style={{ ...S.overlay, ...(isCompactUi ? { alignItems:"end", backdropFilter:"blur(10px)" } : {}) }} onClick={e=>{if(e.target===e.currentTarget&&!loading){ if (modal==="import") resetImportDraft(); setModal(null); }}}>
          <div style={{ ...S.modal, ...(isCompactUi ? { width:"100vw", maxWidth:"100vw", maxHeight:"92vh", minHeight:"72vh", borderRadius:"24px 24px 0 0", padding:"22px 18px calc(26px + env(safe-area-inset-bottom))" } : {}) }}>
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
                    {activeAiReady ? activeProvider.name : "Configura AI"}
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
                    {importProvider === "local" ? "Vision o API" : "Riconosci il piatto"}
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

              <div style={{ background:"#F5F0E8", borderRadius:16, padding:14, marginBottom:18 }}>
                <div style={{ fontSize:12, color:"#8A7C69", textTransform:"uppercase", letterSpacing:"1px", marginBottom:8 }}>Strumenti</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <button style={{ ...S.btnSecondary, borderRadius:999, padding:"10px 14px" }} onClick={exportJSON}>⬆ Export</button>
                  <button style={{ ...S.btnSecondary, borderRadius:999, padding:"10px 14px" }} onClick={importJSON}>⬇ Import</button>
                </div>
              </div>

              <div style={{ display:"flex", justifyContent:"flex-end" }}>
                <button style={{ ...S.btnSecondary, width:"100%", justifyContent:"center", padding:"13px 16px", borderRadius:16 }} onClick={()=>{setModal(null);setErr("");}}>
                  Chiudi
                </button>
              </div>
            </>}

            {modal==="import" && <ImportModal/>}

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
              <div style={{ marginBottom:12 }}><label style={S.label}>Ingredienti (uno per riga)</label>
                <textarea style={{ ...S.input, minHeight:75, resize:"vertical" }} value={manual.ingredienti}
                  onChange={e=>setManual(m=>({...m,ingredienti:e.target.value}))} placeholder={"200g pasta\n2 uova\n100g guanciale"}/></div>
              <div style={{ marginBottom:12 }}><label style={S.label}>Procedimento (un passaggio per riga)</label>
                <textarea style={{ ...S.input, minHeight:75, resize:"vertical" }} value={manual.procedimento}
                  onChange={e=>setManual(m=>({...m,procedimento:e.target.value}))} placeholder={"Porta a ebollizione l'acqua...\nCuoci la pasta al dente..."}/></div>
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
              <div style={{ marginBottom:12 }}><label style={S.label}>Ingredienti (uno per riga)</label>
                <textarea style={{ ...S.input, minHeight:75, resize:"vertical" }} value={editRec.ingredienti}
                  onChange={e=>setEditRec(m=>({...m,ingredienti:e.target.value}))} placeholder={"200g pasta\n2 uova\n100g guanciale"}/></div>
              <div style={{ marginBottom:12 }}><label style={S.label}>Procedimento (un passaggio per riga)</label>
                <textarea style={{ ...S.input, minHeight:75, resize:"vertical" }} value={editRec.procedimento}
                  onChange={e=>setEditRec(m=>({...m,procedimento:e.target.value}))} placeholder={"Porta a ebollizione l'acqua...\nCuoci la pasta al dente..."}/></div>
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
                  : "Per generare la lista serve prima configurare un provider da “Importa URL”."}
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
