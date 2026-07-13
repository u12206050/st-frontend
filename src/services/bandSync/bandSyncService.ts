import {
    getFirestore,
    doc,
    collection,
    onSnapshot,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
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
    computeSessionExpireAt,
    fromFirestore,
    isExpired,
    roleFromStorage,
    roleToStorage,
} from "./bandSyncSession";

const STORAGE_KEYS = {
    code: "bandSyncCode",
    role: "bandSyncRole",
    songbookId: "bandSyncSongbookId",
} as const;

class BandSyncService {
    private firestore = getFirestore(firebaseApp);

    private sessionsRef = collection(this.firestore, "bandSessions");

    watchSession(
        code: string,
        onChange: (session: BandSyncSession | null) => void,
    ): Unsubscribe {
        return onSnapshot(doc(this.sessionsRef, this.normalizeCode(code)), (snapshot) => {
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
        const expireAt = computeSessionExpireAt(now);
        const code = await this.generateUniqueCode();

        const session: BandSyncSession = {
            sessionId: code,
            code,
            leaderId: user.uid,
            songbookId,
            songNumber,
            transposition,
            createdAt: now,
            updatedAt: now,
            expireAt,
        };

        await setDoc(doc(this.sessionsRef, code), {
            leaderId: session.leaderId,
            songbookId: session.songbookId,
            songNumber: session.songNumber,
            transposition: session.transposition,
            createdAt: Timestamp.fromDate(session.createdAt),
            updatedAt: Timestamp.fromDate(session.updatedAt),
            expireAt: Timestamp.fromDate(session.expireAt),
        });

        return session;
    }

    async joinSession(code: string): Promise<BandSyncSession> {
        const normalizedCode = this.normalizeCode(code);
        if (!normalizedCode) {
            throw new BandSyncException("Invalid session code.");
        }

        const sessionDoc = await getDoc(doc(this.sessionsRef, normalizedCode));
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
        code,
        songbookId,
        songNumber,
        transposition,
    }: {
        code: string;
        songbookId: string;
        songNumber: number;
        transposition: number;
    }): Promise<void> {
        const user = a.currentUser;
        if (!user) {
            throw new BandSyncException("Leader must be logged in.");
        }

        await updateDoc(doc(this.sessionsRef, this.normalizeCode(code)), {
            songbookId,
            songNumber,
            transposition,
            updatedAt: Timestamp.now(),
        });
    }

    async renewSession({ code }: { code: string }): Promise<Date> {
        const user = a.currentUser;
        if (!user) {
            throw new BandSyncException("Leader must be logged in.");
        }

        const expireAt = computeSessionExpireAt(new Date());

        await updateDoc(doc(this.sessionsRef, this.normalizeCode(code)), {
            expireAt: Timestamp.fromDate(expireAt),
        });

        return expireAt;
    }

    async endSession({ code }: { code: string }): Promise<void> {
        await deleteDoc(doc(this.sessionsRef, this.normalizeCode(code)));
    }

    savePersistedSession(session: BandSyncPersistedSession): void {
        localStorage.setItem(STORAGE_KEYS.code, session.code);
        localStorage.setItem(STORAGE_KEYS.role, roleToStorage(session.role));
        localStorage.setItem(STORAGE_KEYS.songbookId, session.songbookId);
    }

    readPersistedSession(): BandSyncPersistedSession | null {
        const code = localStorage.getItem(STORAGE_KEYS.code);
        const roleValue = localStorage.getItem(STORAGE_KEYS.role);
        const songbookId = localStorage.getItem(STORAGE_KEYS.songbookId);

        if (!code || !roleValue || !songbookId) {
            return null;
        }

        const role = roleFromStorage(roleValue);
        if (role === "none") {
            return null;
        }

        return { code, role, songbookId };
    }

    clearPersistedSession(): void {
        localStorage.removeItem(STORAGE_KEYS.code);
        localStorage.removeItem(STORAGE_KEYS.role);
        localStorage.removeItem(STORAGE_KEYS.songbookId);
        localStorage.removeItem("bandSyncSessionId");
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
            const existing = await getDoc(doc(this.sessionsRef, code));
            if (!existing.exists()) {
                return code;
            }
        }
        throw new BandSyncException("Could not generate a session code.");
    }
}

export const bandSyncService = new BandSyncService();
