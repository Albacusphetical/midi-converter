import { getGlobalContext } from "./GlobalContext";
import { domToBlob } from "modern-screenshot";
import { decompress } from "./History";
import { is_chord } from "../utils/VP";

/**
 * Re-indexes transpose comments globally across one or more combined sheets and calculates relative differences.
 */
export function reindexTransposes(data, globalIndex, lastTransposeValue) {
  let currentIndex = globalIndex;
  let currentLastValue = lastTransposeValue;

  // Clone data to avoid mutating original source if cached (though decompress usually returns fresh)
  let workingData = [...data];

  // Check if we need to inject an initial transpose comment
  const hasTranspose = workingData.some(item => item.kind === "transpose");

  if (!hasTranspose) {
    let firstChordIndex = workingData.findIndex(item => is_chord(item));
    if (firstChordIndex !== -1) {
      const chord = workingData[firstChordIndex];
      if (chord.notes && chord.notes.length > 0) {
        const firstNote = chord.notes[0];
        const transposition = firstNote.value - (firstNote.original ?? firstNote.value);

        // App.svelte logic: text = `Transpose by: ${-transposition} #1`
        // We create the base text, reindexing loop will add the #index
        const newComment = {
          type: "comment",
          kind: "transpose",
          text: `Transpose by: ${-transposition}`,
          notop: true
        };

        // Insert before the chord, or after title if close
        // Simple heuristic: Insert at firstChordIndex is safe, or checking for Title
        // Let's refine: Insert after last 'title' before firstChord?
        // Actually, App.svelte just splices it in. 
        // We will insert it immediately before the first chord to be safe.
        workingData.splice(firstChordIndex, 0, newComment);
      }
    }
  }

  const processedData = [];

  // console.log("Reindexing transposes...", { globalIndex, lastTransposeValue, dataLength: workingData.length });

  for (const item of workingData) {
    if (item.kind === "transpose") {
      // console.log("Found transpose item:", item.text);
      const match = item.text.match(/Transpose by:?\s*([+-]?\d+)/);
      if (match) {
        const val = parseInt(match[1]);

        // Redundancy check: If the transpose value hasn't changed from the last known state,
        // and we HAVE a last known state (i.e. not the very first sheet), skip it.
        if (currentLastValue !== undefined && val === currentLastValue) {
          continue;
        }

        let label = `Transpose by: ${val > 0 ? "+" : ""}${val}`;

        // Add relative diff if we have a previous context
        if (currentLastValue !== undefined) {
          const diff = val - currentLastValue;
          label += ` (${diff > 0 ? "+" : ""}${diff})`;
        }

        currentLastValue = val;

        processedData.push({
          ...item,
          text: `${label} #${currentIndex++}`,
        });
      } else {
        // Fallback: Just re-index, ensuring space
        // Try to strip existing index if present to avoid doubling
        let cleanText = item.text.replace(/ #\d+$/, "").trim();
        processedData.push({
          ...item,
          text: `${cleanText} #${currentIndex++}`,
        });
      }
    } else {
      processedData.push(item);
    }
  }

  return {
    data: processedData,
    nextIndex: currentIndex,
    nextLastValue: currentLastValue,
  };
}

/**
 * Finds the playtime of the first available note in the sheet data.
 */
function getFirstNotePlayTime(data) {
  const firstChord = data.find(is_chord);
  return firstChord?.notes?.[0]?.playTime;
}

/**
 * Removes leading and trailing breaks from the sheet data to eliminate extra vertical space.
 * Also strips breaks that are redundant because they sit next to a transpose comment at the start/end.
 */
function stripLeadingAndTrailingBreaks(data) {
  let result = [...data];

  // Strip leading breaks
  while (result.length > 0 && result[0].type === "break") {
    result.shift();
  }

  // Strip trailing breaks
  while (result.length > 0 && result[result.length - 1].type === "break") {
    result.pop();
  }

  return result;
}

/**
 * Merges consecutive breaks in the data to avoid double spacing.
 */
function mergeConsecutiveBreaks(data) {
  const stripped = stripLeadingAndTrailingBreaks(data);
  const result = [];
  for (let i = 0; i < stripped.length; i++) {
    const item = stripped[i];
    if (item.type === "break" && result[result.length - 1]?.type === "break") {
      continue; // Skip consecutive breaks
    }
    result.push(item);
  }
  return result;
}



/**
 * Iterates through sheets, loads them into the DOM via callback, and captures snapshots.
 */
export async function generateCombinedImage({ selectedSheets, loadSheet }) {
  let captures = [];
  let globalTransposeIndex = 1;
  let lastTransposeValue = undefined;

  for (let i = 0; i < selectedSheets.length; i++) {
    const sheet = selectedSheets[i];
    let data = decompress(sheet.data);

    // Look ahead to the next sheet for timing continuity
    let nextStart = undefined;
    if (i < selectedSheets.length - 1) {
      const nextData = decompress(selectedSheets[i + 1].data);
      nextStart = getFirstNotePlayTime(nextData);
    }

    const { data: reindexedData, nextIndex, nextLastValue } = reindexTransposes(
      data,
      globalTransposeIndex,
      lastTransposeValue,
    );
    globalTransposeIndex = nextIndex;
    lastTransposeValue = nextLastValue;

    // Strip leading/trailing breaks and merge consecutive ones
    const strippedData = mergeConsecutiveBreaks(reindexedData);

    // Trigger UI load in parent
    const target = await loadSheet(sheet.name, strippedData);

    // Apply temporary generation settings (ordering, quantization) via softRegen
    const ctx = getGlobalContext();
    ctx.setForcedNextSheetStartTime(nextStart);
    ctx.softRegen();

    // Wait for Svelte to finish updating the DOM with the generation settings
    await ctx.tick();

    // Precise capture logic
    target.style.height = "max-content";
    target.style.width = "max-content";
    target.style.whiteSpace = "nowrap";
    void target.offsetHeight;

    const rect = target.getBoundingClientRect();
    const w = rect.width;
    const padding = i === selectedSheets.length - 1 ? 15 : 0; // add some padding bottom of the final image
    const h = rect.height + padding;

    let options = {
      scale: 2,
      width: w,
      height: h,
      style: { backgroundColor: "#2D2A32" },
    };

    const blob = await domToBlob(target, options);
    const bitmap = await createImageBitmap(blob);
    captures.push(bitmap);
  }

  // Final stitching
  if (captures.length === 0) return null;

  let totalWidth = 0;
  let totalHeight = 0;
  for (let img of captures) {
    totalWidth = Math.max(totalWidth, img.width);
    totalHeight += img.height;
  }

  let canvas = document.createElement("canvas");
  canvas.width = totalWidth;
  canvas.height = totalHeight;
  let ctx = canvas.getContext("2d");

  ctx.fillStyle = "#2D2A32";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let currentY = 0;
  for (let img of captures) {
    ctx.drawImage(img, 0, currentY);
    currentY += img.height;
  }

  return new Promise((resolve) => canvas.toBlob(resolve));
}

/**
 * Generates combined text content from multiple sheets.
 */
export async function generateCombinedText({ selectedSheets, loadSheet }) {
  let combinedText = "";
  let globalTransposeIndex = 1;
  let lastTransposeValue = undefined;

  for (let i = 0; i < selectedSheets.length; i++) {
    const sheet = selectedSheets[i];
    let data = decompress(sheet.data);

    // Look ahead to the next sheet for timing continuity
    let nextStart = undefined;
    if (i < selectedSheets.length - 1) {
      const nextData = decompress(selectedSheets[i + 1].data);
      nextStart = getFirstNotePlayTime(nextData);
    }

    const { data: reindexedData, nextIndex, nextLastValue } = reindexTransposes(
      data,
      globalTransposeIndex,
      lastTransposeValue,
    );
    globalTransposeIndex = nextIndex;
    lastTransposeValue = nextLastValue;

    // Strip leading/trailing breaks and merge consecutive ones
    const strippedData = mergeConsecutiveBreaks(reindexedData);

    const target = await loadSheet(sheet.name, strippedData, 400);

    // Apply temporary generation settings (ordering, quantization) via softRegen
    const ctx = getGlobalContext();
    ctx.setForcedNextSheetStartTime(nextStart);
    ctx.softRegen();

    await ctx.tick();

    let text = target.innerText;

    // Clean up redundant indices
    text = text.replace(/(Transpose by: [^#]*)(#\d+)/g, "$1");
    combinedText += `${text}\n`;
  }

  return combinedText.trim();
}

/**
 * Combines transpose values into a space-separated string.
 */
export function generateCombinedTransposes(selectedSheets) {
  let allTransposes = [];
  let globalTransposeIndex = 1;
  let lastTransposeValue = undefined;

  for (let i = 0; i < selectedSheets.length; i++) {
    const sheet = selectedSheets[i];
    let data = decompress(sheet.data);

    // Reuse reindexTransposes to handle:
    // 1. Injecting missing transpose comments (e.g. for split sheets)
    // 2. Filtering out consecutive duplicate values
    const { data: reindexedData, nextIndex, nextLastValue } = reindexTransposes(
      data,
      globalTransposeIndex,
      lastTransposeValue,
    );

    globalTransposeIndex = nextIndex;
    lastTransposeValue = nextLastValue;

    const transposes = reindexedData.filter((item) => item.kind === "transpose");

    let transposesText = transposes
      .map((e) => {
        const match = e.text.match(/Transpose by:\s(\+?(-?\d+))/);
        return match ? match[2] : null;
      })
      .filter((x) => x)
      .join(" ");

    if (transposesText) allTransposes.push(transposesText);
  }

  return allTransposes.join(" ");
}

/**
 * Helper for the HistoryCombine utility to load a sheet and wait for layout.
 */
export async function loadSheetForHistoryCombine(
  name,
  data,
  waitTime = 1200,
) {
  const ctx = getGlobalContext();
  ctx.setChordsAndOtherwise(data);
  ctx.setFilename(name);
  await new Promise((r) => setTimeout(r, waitTime));
  return ctx.getContainer().querySelector("div");
}

export async function handleHistoryCombineCommand(e) {
  const ctx = getGlobalContext();
  const { type, mode, tempSettings } = e.detail;

  let originalData = ctx.getChordsAndOtherwise();
  let originalFilename = ctx.getFilename();
  let originalSheetReady = ctx.getSheetReady();
  let originalSettings = { ...ctx.getSettings() };

  try {
    ctx.HistoryCombineDialogComp.setBusy(true);

    if (tempSettings) {
      ctx.updateSettings(tempSettings);
    }

    if (type === "image") {
      ctx.addToast("Generating combined image...", "info");
      ctx.importer.hide();
      ctx.setIsHistoryMultiSelect(false);
      ctx.setSheetReady(true);
      ctx.updateSettings({ capturingImage: true, oorMarks: false });

      const blob = await generateCombinedImage({
        selectedSheets: ctx.getSelectedSheets(),
        settings: ctx.getSettings(),
        loadSheet: (name, data) =>
          loadSheetForHistoryCombine(name, data),
      });

      if (blob) {
        if (mode === "copy") ctx.copyCapturedImage(blob);
        else {
          const name = prompt("Enter a filename:", ctx.getFilename());
          if (name === null) return; // User cancelled
          ctx.downloadCapturedImage(blob, name);
        }
      }
    } else if (type === "text") {
      ctx.addToast("Generating combined text...", "info");
      ctx.importer.hide();
      ctx.setIsHistoryMultiSelect(false);
      ctx.setSheetReady(true);

      const currSettings = ctx.getSettings()
      ctx.updateSettings({ oorMarks: true, tempoMarks: true });

      const text = await generateCombinedText({
        selectedSheets: ctx.getSelectedSheets(),
        loadSheet: (name, data, waitTime) =>
          loadSheetForHistoryCombine(name, data, waitTime),
      });

      navigator.clipboard.writeText(text);
      ctx.updateSettings({ oorMarks: currSettings.oorMarks, tempoMarks: currSettings.tempoMarks })

      ctx.addToast("Combined text copied to clipboard!", "success");
    } else if (type === "transposes") {
      ctx.addToast("Copying transposes...", "info");
      const text = generateCombinedTransposes(ctx.getSelectedSheets());
      if (text) {
        navigator.clipboard.writeText(text);
        ctx.addToast("Transposes copied to clipboard!", "success");
      } else {
        ctx.addToast("No transposes found in selected sheets", "warning");
      }
    }
  } catch (err) {
    console.error("Combining failed", err);
    ctx.addToast("Combining failed: " + err.message, "warning");
  } finally {
    ctx.setChordsAndOtherwise(originalData);
    ctx.setFilename(originalFilename);
    ctx.setSheetReady(originalSheetReady);
    ctx.updateSettings(originalSettings);
    ctx.setForcedNextSheetStartTime(undefined);

    if (!originalSheetReady) ctx.importer.show();
    ctx.setIsHistoryMultiSelect(true);
    ctx.HistoryCombineDialogComp.setBusy(false);
  }
}
