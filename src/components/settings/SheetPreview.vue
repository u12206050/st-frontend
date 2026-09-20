<template>
    <!--
        Setting the custom properties inline lets the preview show a palette
        that is not (or not yet) the one applied to the rest of the app, and
        `sheet-themed` means what you see is produced by the very same rules
        that paint a real sheet.
    -->
    <div
        class="sheet-themed rounded-md border border-black/20 dark:border-white/20 overflow-hidden"
        :style="{ '--sheet-ink': ink, '--sheet-paper': paper }"
    >
        <!--
            Mirrors how the sheets API paints: staff lines and stems are
            stroked paths carrying fill='none', noteheads and text are filled.
            Line spacing, stroke widths and the 20px chord font match a real
            sheet, so thin-line legibility previews honestly.
        -->
        <svg
            viewBox="0 0 220 92"
            xmlns="http://www.w3.org/2000/svg"
            class="w-full"
            role="img"
            :aria-label="label"
        >
            <text
                x="42"
                y="20"
                font-family="Arial"
                font-size="14px"
                fill="#000000"
                stroke="none"
            >G</text>

            <path
                v-for="y in staffLines"
                :key="y"
                :d="`M10 ${y}L210 ${y}`"
                stroke="#000000"
                stroke-width="1"
                fill="none"
            />

            <g v-for="note in notes" :key="note.x">
                <path
                    :d="`M${note.x + 6.2} ${note.y}L${note.x + 6.2} ${note.y - 33}`"
                    stroke="#000000"
                    stroke-width="1.5"
                    fill="none"
                />
                <ellipse
                    :cx="note.x"
                    :cy="note.y"
                    rx="6.2"
                    ry="4.3"
                    :transform="`rotate(-20 ${note.x} ${note.y})`"
                    fill="#000000"
                    stroke="none"
                />
            </g>

            <rect x="209" y="24.5" width="1" height="41" fill="#000000" stroke="#000000" stroke-width="0.3" />
            <rect x="204" y="24.5" width="1" height="41" fill="#000000" stroke="#000000" stroke-width="0.3" />
        </svg>
    </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
    name: "sheet-preview",
    props: {
        ink: {
            type: String,
            required: true,
        },
        paper: {
            type: String,
            required: true,
        },
        label: {
            type: String,
            default: "",
        },
    },
    data: () => ({
        staffLines: [25, 35, 45, 55, 65],
        notes: [
            { x: 50, y: 60 },
            { x: 90, y: 50 },
            { x: 130, y: 40 },
            { x: 170, y: 45 },
        ],
    }),
});
</script>
