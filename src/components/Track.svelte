<script>
    export let name, length, idx
    export let selected = false
</script>

<div id="track" class="flex flex-row align-middle">
    <input id="trackbox{idx}" type="checkbox" style="transform: scale(1.5)" bind:checked={selected}>
    <label for="trackbox{idx}" class="mx-2">Track {idx} ({name}) - {length} events</label>
</div>