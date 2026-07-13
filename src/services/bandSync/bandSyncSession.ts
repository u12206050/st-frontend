import { Timestamp } from "firebase/firestore";

export const SESSION_TTL_DAYS = 10;
export const CODE_LENGTH = 6;
export const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type BandSyncRole = "none" | "leader" | "member";
export type BandSyncSyncStatus = "inSync" | "outOfSync";

export type BandSyncSession = {
    sessionId: string;
    code: string;
    leaderId: string;
    songbookId: string;
    songNumber: number;
    transposition: number;
    createdAt: Date;
    updatedAt: Date;
    expireAt: Date;
};

export type BandSyncPersistedSession = {
    code: string;
    role: BandSyncRole;
    songbookId: string;
};

export class BandSyncException extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BandSyncException";
    }
}

function readTimestamp(value: unknown): Date | null {
    if (value instanceof Timestamp) {
        return value.toDate();
    }
    return null;
}

export function fromFirestore(
    code: string,
    data: Record<string, unknown>,
): BandSyncSession {
    const createdAt = readTimestamp(data.createdAt) ?? new Date();
    const updatedAt = readTimestamp(data.updatedAt) ?? createdAt;

    return {
        sessionId: code,
        code,
        leaderId: data.leaderId as string,
        songbookId: data.songbookId as string,
        songNumber: (data.songNumber as number).valueOf(),
        transposition: (data.transposition as number).valueOf(),
        createdAt,
        updatedAt,
        expireAt: readTimestamp(data.expireAt) ?? createdAt,
    };
}

export function isExpired(session: BandSyncSession, now = new Date()): boolean {
    return now > session.expireAt;
}

export function computeSessionExpireAt(from = new Date()): Date {
    return new Date(from.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export type SessionExpiryDisplay = {
    relative: string;
    absolute: string;
    isUrgent: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_SECOND = 1000;

function formatRelativeTimeUntil(
    expireAt: Date,
    locale: string,
    now: Date,
): string {
    const rtfl = new Intl.RelativeTimeFormat(locale, {
        localeMatcher: "best fit",
        numeric: "auto",
        style: "long",
    });

    const elapsed = expireAt.getTime() - now.getTime();
    const units: { unit: Intl.RelativeTimeFormatUnit; amount: number }[] = [
        { unit: "day", amount: MS_PER_DAY },
        { unit: "hour", amount: MS_PER_HOUR },
        { unit: "minute", amount: MS_PER_MINUTE },
        { unit: "second", amount: MS_PER_SECOND },
    ];

    for (const { unit, amount } of units) {
        if (Math.abs(elapsed) >= amount || unit === "second") {
            return rtfl.format(Math.round(elapsed / amount), unit);
        }
    }

    return rtfl.format(0, "second");
}

export function formatSessionExpiry(
    expireAt: Date,
    locale: string,
    now = new Date(),
): SessionExpiryDisplay {
    const absolute = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(expireAt);

    const remainingMs = expireAt.getTime() - now.getTime();
    const isUrgent = remainingMs > 0 && remainingMs < MS_PER_DAY;
    const relative = formatRelativeTimeUntil(expireAt, locale, now);

    return { relative, absolute, isUrgent };
}

export function matchesSongState(
    session: BandSyncSession,
    songbookId: string,
    songNumber: number,
    transposition: number,
): boolean {
    return (
        session.songbookId === songbookId &&
        session.songNumber === songNumber &&
        session.transposition === transposition
    );
}

export function hasLeaderStateChangedComparedTo(
    session: BandSyncSession,
    other: BandSyncSession | null,
): boolean {
    if (!other) return true;
    return (
        session.songbookId !== other.songbookId ||
        session.songNumber !== other.songNumber ||
        session.transposition !== other.transposition ||
        session.updatedAt.getTime() !== other.updatedAt.getTime()
    );
}

export function roleFromStorage(value: string | null): BandSyncRole {
    switch (value) {
        case "leader":
            return "leader";
        case "member":
            return "member";
        default:
            return "none";
    }
}

export function roleToStorage(role: BandSyncRole): string {
    return role;
}
