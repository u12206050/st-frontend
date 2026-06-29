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
    sessionId: string;
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
    sessionId: string,
    data: Record<string, unknown>,
): BandSyncSession {
    const createdAt = readTimestamp(data.createdAt) ?? new Date();
    const updatedAt = readTimestamp(data.updatedAt) ?? createdAt;

    return {
        sessionId,
        code: data.code as string,
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
