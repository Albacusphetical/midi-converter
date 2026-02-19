<script>
  import { createEventDispatcher, onMount } from "svelte";
  import SheetOptions from "./SheetOptions.svelte";

  const dispatch = createEventDispatcher();

  export let combineSelection = [];
  export let appSettings = {};

  let historyCombineDialog;
  let busy = false;
  let tempSettings = {};

  // Initialize tempSettings from appSettings if not yet set
  $: if (appSettings && Object.keys(tempSettings).length === 0) {
    tempSettings = { ...appSettings };
  }

  export function setBusy(val) {
    busy = val;
  }

  export function resetSettings() {
    tempSettings = { ...appSettings };
  }

  function move(index, direction) {
    if (busy) return;
    const newItems = [...combineSelection];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;

    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;
    combineSelection = newItems;
  }

  function remove(index) {
    if (busy) return;
    const newItems = [...combineSelection];
    newItems.splice(index, 1);
    combineSelection = newItems;
  }

  export function showModal() {
    historyCombineDialog.showModal();
  }

  export function close() {
    if (!busy) historyCombineDialog.close();
  }
</script>

{#if combineSelection.length > 0}
  <div
    class="flex flex-col items-center gap-2 p-4 border border-gray-600 rounded-lg bg-gray-800"
  >
    <h3 class="text-xl text-white">
      Selected Sheets ({combineSelection.length})
    </h3>
    <div
      class="flex flex-col gap-1 w-full relative max-h-[200px] min-w-[200px] max-w-[400px] overflow-y-auto"
    >
      {#each combineSelection as sheet, i (i)}
        <div
          class="flex items-center justify-between text-white p-2 bg-gray-700 rounded gap-2"
        >
          <div class="flex items-center gap-2 overflow-hidden">
            <span class="text-gray-400 text-xs tabular-nums">{i + 1}.</span>
            <span class="truncate max-w-[400px]" title={sheet.name}>
              {sheet.name}
            </span>
          </div>
          <div class="flex gap-1">
            <button
              class="px-2 py-0.5 bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-50"
              disabled={i === 0 || busy}
              on:click={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              class="px-2 py-0.5 bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-50"
              disabled={i === combineSelection.length - 1 || busy}
              on:click={() => move(i, 1)}
            >
              ↓
            </button>
            <button
              class="px-2 py-0.5 bg-red-600 rounded hover:bg-red-500 disabled:opacity-50"
              disabled={busy}
              on:click={() => remove(i)}
            >
              ✕
            </button>
          </div>
        </div>
      {/each}
    </div>
    <button
      class="mt-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-50"
      disabled={combineSelection.length < 2 || busy}
      on:click={() => showModal()}
    >
      Combine {combineSelection.length} Sheets...
    </button>
  </div>
{/if}

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<dialog
  bind:this={historyCombineDialog}
  on:cancel|preventDefault={(e) => {
    if (busy) e.preventDefault();
    else historyCombineDialog.close();
  }}
  on:close|preventDefault={() => {}}
  class="rounded-lg bg-gray-800 text-white p-6 border border-gray-600 outline-none max-h-[90vh] overflow-y-auto"
>
  <div class="flex flex-col gap-4 min-w-[350px]">
    <h2 class="text-xl font-bold text-center mb-2">Combine Sheets</h2>

    <details
      class="bg-gray-700 rounded-lg overflow-hidden border border-gray-600"
    >
      <summary
        class="p-3 cursor-pointer hover:bg-gray-600 font-semibold select-none"
      >
        Generation Settings
      </summary>
      <div class="p-3 bg-gray-800 text-sm">
        <SheetOptions
          bind:settings={tempSettings}
          show={true}
          hasMIDI={false}
          hideTranspositionSettings={true}
        />
      </div>
    </details>

    <div class="flex flex-col gap-2">
      <h3 class="font-semibold text-gray-300">Image</h3>
      <div class="flex gap-2">
        <button
          disabled={busy}
          class="flex-1 p-2 bg-blue-600 rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          on:click={() =>
            dispatch("command", {
              type: "image",
              mode: "copy",
              tempSettings,
            })}
        >
          Copy Image
        </button>
        <button
          disabled={busy}
          class="flex-1 p-2 bg-blue-600 rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          on:click={() =>
            dispatch("command", {
              type: "image",
              mode: "download",
              tempSettings,
            })}
        >
          Download Image
        </button>
      </div>
    </div>

    <hr class="border-gray-600" />

    <div class="flex flex-col gap-2">
      <h3 class="font-semibold text-gray-300">Text Data</h3>
      <button
        disabled={busy}
        class="w-full p-2 bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
        on:click={() =>
          dispatch("command", { type: "transposes", tempSettings })}
      >
        Copy Transposes
      </button>
      <button
        disabled={busy}
        class="w-full p-2 bg-gray-600 rounded hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
        on:click={() => dispatch("command", { type: "text", tempSettings })}
      >
        Copy Text
      </button>
    </div>

    <button
      disabled={busy}
      class="mt-4 p-2 border border-gray-500 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
      on:click={() => close()}
    >
      {busy ? "Processing..." : "Cancel"}
    </button>
  </div>
</dialog>
