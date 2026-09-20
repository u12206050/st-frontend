import { cache } from "@/services/cache";

/**
 * Ink/paper colours for rendered sheet music.
 *
 * The sheets API returns SVG painted in `#000000` on a white background, with
 * no theme parameter, so the colours are applied in the client: see the
 * `#osmd-svg` rules in `components/OSMD.vue`, which recolour every paint that
 * is not `none` from the two custom properties written here.
 *
 * Because this only restyles what is already on screen, switching theme never
 * refetches a sheet.
 */
export type SheetPalette = {
    ink: string;
    paper: string;
};

/** What the sheets have always looked like, and the default. */
export const BLACK_ON_WHITE: SheetPalette = {
    ink: "#000000",
    paper: "#ffffff",
};

/** Used when the sheet follows a dark app theme. */
export const DEFAULT_DARK: SheetPalette = {
    ink: "#f1f1f4",
    paper: "#182f34",
};

const KEYS = {
    alwaysBlackOnWhite: "sheetAlwaysBlackOnWhite",
    ink: "sheetInk",
    paper: "sheetPaper",
} as const;

const HEX = /^#[0-9a-f]{6}$/i;

function readHex(value: unknown, fallback: string): string {
    return typeof value === "string" && HEX.test(value) ? value : fallback;
}

export class SheetTheme {
    /** Keep the sheets black on white whatever the app theme does. */
    private _alwaysBlackOnWhite = true;
    private _ink = DEFAULT_DARK.ink;
    private _paper = DEFAULT_DARK.paper;
    private _loaded = false;

    public get alwaysBlackOnWhite(): boolean {
        return this._alwaysBlackOnWhite;
    }

    /** The user's chosen dark-theme ink, not necessarily what is on screen. */
    public get ink(): string {
        return this._ink;
    }

    public get paper(): string {
        return this._paper;
    }

    public get isCustomised(): boolean {
        return this._ink !== DEFAULT_DARK.ink || this._paper !== DEFAULT_DARK.paper;
    }

    private get isDark(): boolean {
        return document.documentElement.classList.contains("dark");
    }

    /**
     * The palette the sheets should currently use.
     *
     * A light app theme stays black on white: the chosen colours are a dark
     * theme companion, and would be unreadable on a light page.
     */
    public get palette(): SheetPalette {
        if (this._alwaysBlackOnWhite || !this.isDark) {
            return BLACK_ON_WHITE;
        }

        return { ink: this._ink, paper: this._paper };
    }

    /** Writes the palette to the document so the `#osmd-svg` rules pick it up. */
    public apply(): void {
        const { ink, paper } = this.palette;
        const style = document.body.style;
        style.setProperty("--sheet-ink", ink);
        style.setProperty("--sheet-paper", paper);
    }

    public async load(): Promise<void> {
        if (this._loaded) {
            this.apply();
            return;
        }

        try {
            const [always, ink, paper] = await Promise.all([
                cache.get("config", KEYS.alwaysBlackOnWhite),
                cache.get("config", KEYS.ink),
                cache.get("config", KEYS.paper),
            ]);

            // Absent means "never chosen": keep the long-standing behaviour.
            this._alwaysBlackOnWhite = always === undefined ? true : always === true;
            this._ink = readHex(ink, DEFAULT_DARK.ink);
            this._paper = readHex(paper, DEFAULT_DARK.paper);
        } catch {
            // Storage unavailable — fall back to black on white.
        }

        this._loaded = true;
        this.apply();
    }

    public async setAlwaysBlackOnWhite(value: boolean): Promise<void> {
        this._alwaysBlackOnWhite = value;
        this.apply();
        await cache.set("config", KEYS.alwaysBlackOnWhite, value);
    }

    public async setColours(palette: Partial<SheetPalette>): Promise<void> {
        if (palette.ink !== undefined) {
            this._ink = readHex(palette.ink, this._ink);
        }
        if (palette.paper !== undefined) {
            this._paper = readHex(palette.paper, this._paper);
        }

        this.apply();
        await Promise.all([
            cache.set("config", KEYS.ink, this._ink),
            cache.set("config", KEYS.paper, this._paper),
        ]);
    }

    public async resetColours(): Promise<void> {
        await this.setColours(DEFAULT_DARK);
    }
}

const sheetTheme = new SheetTheme();

export default sheetTheme;
