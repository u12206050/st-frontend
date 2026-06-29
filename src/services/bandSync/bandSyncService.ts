import {
    getFirestore,
    doc,
    collection,
    onSnapshot,
    getDoc,
    writeBatch,
    updateDoc,
    Timestamp,
    Unsubscribe,
} from "firebase/firestore";
import { firebaseApp, a } from "@/services/auth";
import {
    BandSyncException,
    BandSyncPersistedSession,
    BandSyncSession,
    CODE_CHARS,
    CODE_LENGTH,
    fromFirestore,
    isExpired,
    roleFromStorage,
    roleToStorage,
    SESSION_TTL_DAYS,
} from "./bandSyncSession";

const STORAGE_KEYS = {
    sessionId: "bandSyncSessionId",
    code: "bandSyncCode",
    role: "bandSyncRole",
    songbookId: "bandSyncSongbookId",
} as const;

class BandSyncService {
    private firestore = getFirestore(firebaseApp);

    private sessionsRef = collection(this.firestore, "bandSessions");
    private codesRef = collection(this.firestore, "bandSessionCodes");

    watchSession(
        sessionId: string,
        onChange: (session: BandSyncSession | null) => void,
    ): Unsubscribe {
        return onSnapshot(doc(this.sessionsRef, sessionId), (snapshot) => {
            if (!snapshot.exists() || !snapshot.data()) {
                onChange(null);
                return;
            }

            try {
                const session = fromFirestore(snapshot.id, snapshot.data());
                if (isExpired(session)) {
                    onChange(null);
                    return;
                }
                onChange(session);
            } catch {
                onChange(null);
            }
        });
    }

    async createSession({
        songbookId,
        songNumber,
        transposition,
    }: {
        songbookId: string;
        songNumber: number;
        transposition: number;
    }): Promise<BandSyncSession> {
        const user = a.currentUser;
        if (!user) {
            throw new BandSyncException("Leader must be logged in.");
        }

        const now = new Date();
        const expireAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
        const sessionId = crypto.randomUUID();
        const code = await this.generateUniqueCode();

        const session: BandSyncSession = {
            sessionId,
            code,
            leaderId: user.uid,
            songbookId,
            songNumber,
            transposition,
            createdAt: now,
            updatedAt: now,
            expireAt,
        };

        const batch = writeBatch(this.firestore);
        batch.set(doc(this.sessionsRef, sessionId), {
            code: session.code,
            leaderId: session.leaderId,
            songbookId: session.songbookId,
            songNumber: session.songNumber,
            transposition: session.transposition,
            createdAt: Timestamp.fromDate(session.createdAt),
            updatedAt: Timestamp.fromDate(session.updatedAt),
            expireAt: Timestamp.fromDate(session.expireAt),
        });
        batch.set(doc(this.codesRef, code), {
            sessionId,
            expireAt: Timestamp.fromDate(expireAt),
        });
        await batch.commit();

        return session;
    }

    async joinSession(code: string): Promise<BandSyncSession> {
        const normalizedCode = code.trim().toUpperCase();
        if (!normalizedCode) {
            throw new BandSyncException("Invalid session code.");
        }

        const codeDoc = await getDoc(doc(this.codesRef, normalizedCode));
        if (!codeDoc.exists() || !codeDoc.data()) {
            throw new BandSyncException("Session not found.");
        }

        const codeData = codeDoc.data();
        const expireAtField = codeData.expireAt;
        if (!(expireAtField instanceof Timestamp)) {
            throw new BandSyncException("Session not found.");
        }
        if (new Date() > expireAtField.toDate()) {
            throw new BandSyncException("Session has expired.");
        }

        const sessionIdField = codeData.sessionId;
        if (typeof sessionIdField !== "string" || !sessionIdField) {
            throw new BandSyncException("Session not found.");
        }

        const sessionDoc = await getDoc(doc(this.sessionsRef, sessionIdField));
        if (!sessionDoc.exists() || !sessionDoc.data()) {
            throw new BandSyncException("Session not found.");
        }

        const session = fromFirestore(sessionDoc.id, sessionDoc.data());
        if (isExpired(session)) {
            throw new BandSyncException("Session has expired.");
        }

        return session;
    }

    async updateSession({
        sessionId,
        songbookId,
        songNumber,
        transposition,
    }: {
        sessionId: string;
        songbookId: string;
        songNumber: number;
        transposition: number;
    }): Promise<void> {
        const user = a.currentUser;
        if (!user) {
            throw new BandSyncException("Leader must be logged in.");
        }

        await updateDoc(doc(this.sessionsRef, sessionId), {
            songbookId,
            songNumber,
            transposition,
            updatedAt: Timestamp.now(),
        });
    }

    async endSession({
        sessionId,
        code,
    }: {
        sessionId: string;
        code: string;
    }): Promise<void> {
        const batch = writeBatch(this.firestore);
        batch.delete(doc(this.sessionsRef, sessionId));
        batch.delete(doc(this.codesRef, code.toUpperCase()));
        await batch.commit();
    }

    savePersistedSession(session: BandSyncPersistedSession): void {
        localStorage.setItem(STORAGE_KEYS.sessionId, session.sessionId);
        localStorage.setItem(STORAGE_KEYS.code, session.code);
        localStorage.setItem(STORAGE_KEYS.role, roleToStorage(session.role));
        localStorage.setItem(STORAGE_KEYS.songbookId, session.songbookId);
    }

    readPersistedSession(): BandSyncPersistedSession | null {
        const sessionId = localStorage.getItem(STORAGE_KEYS.sessionId);
        const code = localStorage.getItem(STORAGE_KEYS.code);
        const roleValue = localStorage.getItem(STORAGE_KEYS.role);
        const songbookId = localStorage.getItem(STORAGE_KEYS.songbookId);

        if (!sessionId || !code || !roleValue || !songbookId) {
            return null;
        }

        const role = roleFromStorage(roleValue);
        if (role === "none") {
            return null;
        }

        return { sessionId, code, role, songbookId };
    }

    clearPersistedSession(): void {
        localStorage.removeItem(STORAGE_KEYS.sessionId);
        localStorage.removeItem(STORAGE_KEYS.code);
        localStorage.removeItem(STORAGE_KEYS.role);
        localStorage.removeItem(STORAGE_KEYS.songbookId);
    }

    normalizeCode(code: string): string {
        return code.trim().toUpperCase();
    }

    generateCode(): string {
        const random = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
        let result = "";
        for (let i = 0; i < CODE_LENGTH; i++) {
            result += CODE_CHARS[random[i] % CODE_CHARS.length];
        }
        return result;
    }

    private async generateUniqueCode(): Promise<string> {
        for (let attempt = 0; attempt < 20; attempt++) {
            const code = this.generateCode();
            const existing = await getDoc(doc(this.codesRef, code));
            if (!existing.exists()) {
                return code;
            }
        }
        throw new BandSyncException("Could not generate a session code.");
    }
}

export const bandSyncService = new BandSyncService();
