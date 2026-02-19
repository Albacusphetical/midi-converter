<script>
  import { createEventDispatcher } from "svelte";
  import HistoryEntry from "./HistoryEntry.svelte";

  const dispatch = createEventDispatcher();

  export let pieces = [];
  export let selectable = false;
  export let selectedSheets = [];

  function handleSelect(piece, selected) {
    if (selected) {
      selectedSheets = [...selectedSheets, piece];
    }
    dispatch("selectChange", { selectedSheets });
  }
</script>

<div
  class="w-3/4 flex flex-wrap justify-center gap-2 overflow-clip text-ellipsis"
>
  {#each pieces as piece (piece.name)}
    <HistoryEntry
      {piece}
      sheetSelectable={selectable}
      sheetSelected={selectedSheets.some((p) => p.name === piece.name)}
      on:select={(e) => handleSelect(piece, e.detail.selected)}
      on:load={(x) => {
        if (!selectable) dispatch("load", x.detail);
      }}
      on:refresh
      on:export
    />
  {/each}
</div>
