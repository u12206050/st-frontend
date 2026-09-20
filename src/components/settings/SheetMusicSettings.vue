<template>
    <BaseCard>
        <label class="block uppercase text-xs tracking-wide mb-3">
            {{ $t("settings_sheetMusic") }}
        </label>

        <button
            type="button"
            class="flex items-start w-full gap-3 px-3 py-2 rounded-md border border-black/20 dark:border-white/20 text-left"
            role="switch"
            :aria-checked="alwaysBlackOnWhite"
            @click="toggleAlwaysBlackOnWhite"
        >
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium">{{ $t("settings_sheetAlwaysBlackOnWhite") }}</p>
                <p class="text-xs opacity-60 mt-0.5">{{ $t("settings_sheetAlwaysBlackOnWhiteHint") }}</p>
            </div>
            <span
                class="shrink-0 mt-1 w-10 h-6 rounded-full transition-colors relative"
                :class="alwaysBlackOnWhite ? 'bg-primary' : 'bg-black/20 dark:bg-white/20'"
            >
                <span
                    class="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                    :class="alwaysBlackOnWhite ? 'left-5' : 'left-1'"
                />
            </span>
        </button>

        <div v-if="!alwaysBlackOnWhite" class="mt-4">
            <p v-if="!isDark" class="text-xs opacity-60 mb-3">
                {{ $t("settings_sheetLightThemeNote") }}
            </p>

            <div class="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block uppercase text-xs tracking-wide mb-1" for="sheet-ink">
                        {{ $t("settings_sheetInk") }}
                    </label>
                    <div class="flex gap-2 items-center">
                        <input
                            id="sheet-ink"
                            type="color"
                            class="w-10 h-10 shrink-0 rounded-md border border-black/20 dark:border-white/20 bg-transparent p-1"
                            :value="ink"
                            @input="onInk"
                        />
                        <input
                            type="text"
                            class="w-full rounded-md border border-black/20 dark:border-white/20 dark:bg-secondary font-mono text-sm uppercase"
                            spellcheck="false"
                            :value="ink"
                            @change="onInkText"
                        />
                    </div>
                </div>
                <div>
                    <label class="block uppercase text-xs tracking-wide mb-1" for="sheet-paper">
                        {{ $t("settings_sheetPaper") }}
                    </label>
                    <div class="flex gap-2 items-center">
                        <input
                            id="sheet-paper"
                            type="color"
                            class="w-10 h-10 shrink-0 rounded-md border border-black/20 dark:border-white/20 bg-transparent p-1"
                            :value="paper"
                            @input="onPaper"
                        />
                        <input
                            type="text"
                            class="w-full rounded-md border border-black/20 dark:border-white/20 dark:bg-secondary font-mono text-sm uppercase"
                            spellcheck="false"
                            :value="paper"
                            @change="onPaperText"
                        />
                    </div>
                </div>
            </div>

            <label class="block uppercase text-xs tracking-wide mb-1">
                {{ $t("settings_sheetPreview") }}
            </label>
            <SheetPreview :ink="ink" :paper="paper" :label="$t('settings_sheetPreview')" />

            <p v-if="lowContrast" class="text-xs mt-2 text-amber-600 dark:text-amber-400">
                {{ $t("settings_sheetLowContrast") }}
            </p>

            <div class="flex justify-end mt-3">
                <BaseButton theme="secondary" :disabled="!isCustomised" @click="reset">
                    {{ $t("settings_sheetResetColors") }}
                </BaseButton>
            </div>
        </div>
    </BaseCard>
</template>

<script lang="ts">
import { BaseButton, BaseCard } from "@/components";
import SheetPreview from "./SheetPreview.vue";
import sheetTheme, { DEFAULT_DARK } from "@/classes/sheetTheme";
import { defineComponent } from "vue";

const HEX = /^#[0-9a-f]{6}$/i;

/** WCAG relative luminance, used only to warn about unreadable pairs. */
function luminance(hex: string): number {
    const channel = (start: number) => {
        const v = parseInt(hex.slice(start, start + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrastRatio(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

export default defineComponent({
    name: "sheet-music-settings",
    components: {
        BaseCard,
        BaseButton,
        SheetPreview,
    },
    data: () => ({
        alwaysBlackOnWhite: sheetTheme.alwaysBlackOnWhite,
        ink: sheetTheme.ink,
        paper: sheetTheme.paper,
        isDark: document.documentElement.classList.contains("dark"),
    }),
    computed: {
        isCustomised(): boolean {
            return this.ink !== DEFAULT_DARK.ink || this.paper !== DEFAULT_DARK.paper;
        },
        /**
         * Staff lines are hairlines, so a pair that merely passes for body
         * text can still be hard to read. 4.5:1 is the floor we warn below.
         */
        lowContrast(): boolean {
            return contrastRatio(this.ink, this.paper) < 4.5;
        },
    },
    mounted() {
        // The app theme can have been changed in another tab or on this page.
        this.isDark = document.documentElement.classList.contains("dark");
        this.alwaysBlackOnWhite = sheetTheme.alwaysBlackOnWhite;
        this.ink = sheetTheme.ink;
        this.paper = sheetTheme.paper;
    },
    methods: {
        toggleAlwaysBlackOnWhite() {
            this.alwaysBlackOnWhite = !this.alwaysBlackOnWhite;
            void sheetTheme.setAlwaysBlackOnWhite(this.alwaysBlackOnWhite);
        },
        onInk(event: Event) {
            this.commit({ ink: (event.target as HTMLInputElement).value });
        },
        onPaper(event: Event) {
            this.commit({ paper: (event.target as HTMLInputElement).value });
        },
        onInkText(event: Event) {
            const input = event.target as HTMLInputElement;
            if (HEX.test(input.value)) {
                this.commit({ ink: input.value });
            } else {
                input.value = this.ink;
            }
        },
        onPaperText(event: Event) {
            const input = event.target as HTMLInputElement;
            if (HEX.test(input.value)) {
                this.commit({ paper: input.value });
            } else {
                input.value = this.paper;
            }
        },
        commit(palette: { ink?: string; paper?: string }) {
            if (palette.ink !== undefined) this.ink = palette.ink;
            if (palette.paper !== undefined) this.paper = palette.paper;
            void sheetTheme.setColours(palette);
        },
        reset() {
            this.ink = DEFAULT_DARK.ink;
            this.paper = DEFAULT_DARK.paper;
            void sheetTheme.resetColours();
        },
    },
});
</script>
