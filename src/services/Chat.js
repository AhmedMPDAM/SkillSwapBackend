const { db } = require("../Firebase/firebase");
const {
    doc,
    setDoc,
    getDoc,
    serverTimestamp,
} = require("firebase/firestore");

class ChatService {
    /**
     * Called when a proposal is accepted (accept_deal OR admin acceptance).
     * Creates the Firestore chat document if it doesn't already exist.
     *
 * @param {string} proposalId   - MongoDB ObjectId string
 * @param {string} requestId    - MongoDB ObjectId string
 * @param {string} requestOwnerId
 * @param {string} requestOwnerName
 * @param {string} proposerId
 * @param {string} proposerName
 * @param {Date}   offerExpiresAt  - request.desiredDeadline
 * @param {string} requestTitle
 */
    async createChatRoom({
        proposalId,
        requestId,
        requestOwnerId,
        requestOwnerName,
        proposerId,
        proposerName,
        offerExpiresAt,
        requestTitle,
    }) {
        const chatRef = doc(db, "chats", proposalId);
        const existing = await getDoc(chatRef);

        if (existing.exists()) {
            // Already created – return existing data
            return { chatId: proposalId, ...existing.data() };
        }

        const chatData = {
            proposalId,
            requestId,
            requestTitle,
            participants: [requestOwnerId, proposerId],
            requestOwnerInfo: { id: requestOwnerId, name: requestOwnerName },
            proposerInfo: { id: proposerId, name: proposerName },
            offerExpiresAt,          // Firestore will store as Timestamp
            isActive: true,
            createdAt: serverTimestamp(),
            lastMessageAt: null,
            lastMessageText: null,
        };

        await setDoc(chatRef, chatData);
        return { chatId: proposalId, ...chatData };
    }

    /**
     * Fetch chat room metadata from Firestore.
     * Returns null if not found.
     */
    async getChatRoom(proposalId) {
        const chatRef = doc(db, "chats", proposalId);
        const snap = await getDoc(chatRef);
        if (!snap.exists()) return null;
        return { chatId: proposalId, ...snap.data() };
    }

    /**
     * Verify that userId is a participant of the chat.
     */
    async assertParticipant(proposalId, userId) {
        const chat = await this.getChatRoom(proposalId);
        if (!chat) throw new Error("Chat not found");
        if (!chat.participants.includes(userId)) {
            throw new Error("Unauthorized: You are not a participant of this chat");
        }
        return chat;
    }

    /**
     * Disable the chat (mark as inactive when offer expires or is completed).
     */
    async disableChat(proposalId) {
        const { updateDoc } = require("firebase/firestore");
        const chatRef = doc(db, "chats", proposalId);
        await updateDoc(chatRef, { isActive: false });
    }

    /**
     * Auto-disable chats whose offerExpiresAt is in the past.
     * Call this from a scheduled job or on every relevant API call.
     */
    async disableExpiredChats() {
        const { collection, query, where, getDocs, writeBatch, Timestamp } =
            require("firebase/firestore");

        const now = Timestamp.now();
        const chatsRef = collection(db, "chats");
        const q = query(
            chatsRef,
            where("isActive", "==", true),
            where("offerExpiresAt", "<=", now)
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) return 0;

        const batch = writeBatch(db);
        snapshot.forEach((docSnap) => {
            batch.update(docSnap.ref, { isActive: false });
        });
        await batch.commit();
        return snapshot.size;
    }
}

module.exports = new ChatService();
