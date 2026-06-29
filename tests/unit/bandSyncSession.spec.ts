import { expect } from "chai";
import { Timestamp } from "firebase/firestore";
import {
    CODE_CHARS,
    CODE_LENGTH,
    fromFirestore,
    hasLeaderStateChangedComparedTo,
    isExpired,
    matchesSongState,
    roleFromStorage,
} from "@/services/bandSync/bandSyncSession";

function makeSession(overrides: Record<string, unknown> = {}) {
    const now = new Date("2026-01-01T12:00:00Z");
    const expireAt = new Date("2026-01-11T12:00:00Z");
    return fromFirestore("session-1", {
        code: "ABC123",
        leaderId: "leader-1",
        songbookId: "book-1",
        songNumber: 42,
        transposition: 2,
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
        expireAt: Timestamp.fromDate(expireAt),
        ...overrides,
    });
}

describe("bandSyncSession", () => {
    it("fromFirestore parses session fields", () => {
        const session = makeSession();
        expect(session.sessionId).to.equal("session-1");
        expect(session.code).to.equal("ABC123");
        expect(session.songNumber).to.equal(42);
        expect(session.transposition).to.equal(2);
    });

    it("fromFirestore falls back updatedAt to createdAt", () => {
        const createdAt = new Date("2026-01-01T12:00:00Z");
        const session = fromFirestore("session-1", {
            code: "ABC123",
            leaderId: "leader-1",
            songbookId: "book-1",
            songNumber: 1,
            transposition: 0,
            createdAt: Timestamp.fromDate(createdAt),
            expireAt: Timestamp.fromDate(new Date("2026-01-11T12:00:00Z")),
        });
        expect(session.updatedAt.getTime()).to.equal(createdAt.getTime());
    });

    it("matchesSongState returns true when state matches", () => {
        const session = makeSession();
        expect(matchesSongState(session, "book-1", 42, 2)).to.equal(true);
    });

    it("matchesSongState returns false when song number differs", () => {
        const session = makeSession();
        expect(matchesSongState(session, "book-1", 99, 2)).to.equal(false);
    });

    it("isExpired returns true after expireAt", () => {
        const session = makeSession();
        expect(isExpired(session, new Date("2026-01-12T00:00:00Z"))).to.equal(true);
        expect(isExpired(session, new Date("2026-01-05T00:00:00Z"))).to.equal(false);
    });

    it("hasLeaderStateChangedComparedTo detects transposition change", () => {
        const session = makeSession();
        const changed = makeSession({
            transposition: 5,
            updatedAt: Timestamp.fromDate(new Date("2026-01-02T12:00:00Z")),
        });
        expect(hasLeaderStateChangedComparedTo(session, session)).to.equal(false);
        expect(hasLeaderStateChangedComparedTo(changed, session)).to.equal(true);
    });

    it("roleFromStorage maps persisted roles", () => {
        expect(roleFromStorage("leader")).to.equal("leader");
        expect(roleFromStorage("member")).to.equal("member");
        expect(roleFromStorage(null)).to.equal("none");
    });

    it("code charset has expected length", () => {
        expect(CODE_LENGTH).to.equal(6);
        expect(CODE_CHARS).to.not.include("I");
        expect(CODE_CHARS).to.not.include("O");
    });
});
