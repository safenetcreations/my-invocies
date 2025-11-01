"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Timestamp = exports.FieldValue = exports.BusinessService = exports.TrackingService = exports.InvoiceService = exports.FirestoreService = exports.collections = exports.db = exports.getDb = void 0;
const firestore_1 = require("firebase-admin/firestore");
Object.defineProperty(exports, "Timestamp", { enumerable: true, get: function () { return firestore_1.Timestamp; } });
Object.defineProperty(exports, "FieldValue", { enumerable: true, get: function () { return firestore_1.FieldValue; } });
let _db = null;
const getDb = () => {
    if (!_db) {
        _db = (0, firestore_1.getFirestore)();
    }
    return _db;
};
exports.getDb = getDb;
exports.db = new Proxy({}, {
    get(target, prop) {
        return (0, exports.getDb)()[prop];
    }
});
exports.collections = {
    users: 'users',
    businesses: 'businesses',
    products: 'products',
    contacts: 'contacts',
    invoices: 'invoices',
    trackingEvents: 'trackingEvents',
    integrationCredentials: 'integrationCredentials',
};
class FirestoreService {
    static async create(collection, data, id) {
        const docRef = id ? exports.db.collection(collection).doc(id) : exports.db.collection(collection).doc();
        const dataWithTimestamps = {
            ...data,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        await docRef.set(dataWithTimestamps);
        return {
            id: docRef.id,
            data: dataWithTimestamps,
        };
    }
    static async get(collection, id) {
        const doc = await exports.db.collection(collection).doc(id).get();
        if (!doc.exists) {
            return null;
        }
        return {
            id: doc.id,
            ...doc.data(),
        };
    }
    static async update(collection, id, data) {
        const dataWithTimestamp = {
            ...data,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        };
        await exports.db.collection(collection).doc(id).update(dataWithTimestamp);
    }
    static async delete(collection, id) {
        await exports.db.collection(collection).doc(id).delete();
    }
    static async list(collection, filters, orderBy, limit) {
        let query = exports.db.collection(collection);
        if (filters) {
            filters.forEach(filter => {
                query = query.where(filter.field, filter.operator, filter.value);
            });
        }
        if (orderBy) {
            query = query.orderBy(orderBy.field, orderBy.direction);
        }
        if (limit) {
            query = query.limit(limit);
        }
        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
    }
    static batch() {
        return exports.db.batch();
    }
    static async runTransaction(updateFunction) {
        return exports.db.runTransaction(updateFunction);
    }
}
exports.FirestoreService = FirestoreService;
class InvoiceService {
    static async getNextInvoiceNumber(businessId, prefix) {
        return exports.db.runTransaction(async (transaction) => {
            const businessRef = exports.db.collection(exports.collections.businesses).doc(businessId);
            const businessDoc = await transaction.get(businessRef);
            if (!businessDoc.exists) {
                throw new Error('Business not found');
            }
            const currentSequence = businessDoc.data()?.invoiceSequence || 0;
            const nextSequence = currentSequence + 1;
            transaction.update(businessRef, {
                invoiceSequence: nextSequence,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            return `${prefix}-${nextSequence.toString().padStart(5, '0')}`;
        });
    }
    static async createInvoice(invoiceData) {
        const invoiceNumber = await this.getNextInvoiceNumber(invoiceData.businessId, invoiceData.invoicePrefix || 'INV');
        const invoiceRef = exports.db.collection(exports.collections.invoices).doc();
        const batch = exports.db.batch();
        batch.set(invoiceRef, {
            ...invoiceData,
            invoiceNumber,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        if (invoiceData.lineItems && invoiceData.lineItems.length > 0) {
            invoiceData.lineItems.forEach((item, index) => {
                const lineItemRef = invoiceRef.collection('lineItems').doc();
                batch.set(lineItemRef, {
                    ...item,
                    sortOrder: index,
                });
            });
        }
        await batch.commit();
        return { id: invoiceRef.id };
    }
    static async getInvoiceWithDetails(invoiceId) {
        const invoiceDoc = await exports.db.collection(exports.collections.invoices).doc(invoiceId).get();
        if (!invoiceDoc.exists) {
            return null;
        }
        const invoice = {
            id: invoiceDoc.id,
            ...invoiceDoc.data(),
        };
        const lineItemsSnapshot = await invoiceDoc.ref.collection('lineItems').orderBy('sortOrder').get();
        const lineItems = lineItemsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
        const paymentsSnapshot = await invoiceDoc.ref.collection('payments').orderBy('dateReceived', 'desc').get();
        const payments = paymentsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
        return {
            ...invoice,
            lineItems,
            payments,
        };
    }
}
exports.InvoiceService = InvoiceService;
class TrackingService {
    static async recordEvent(invoiceId, kind, metadata = {}) {
        await exports.db.collection(exports.collections.trackingEvents).add({
            invoiceId,
            kind,
            metadata,
            timestamp: firestore_1.FieldValue.serverTimestamp(),
        });
        if (kind === 'EMAIL_OPEN' || kind === 'INVOICE_VIEWED') {
            const invoiceRef = exports.db.collection(exports.collections.invoices).doc(invoiceId);
            const invoiceDoc = await invoiceRef.get();
            if (invoiceDoc.exists && invoiceDoc.data()?.status === 'SENT') {
                await invoiceRef.update({
                    status: 'VIEWED',
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                });
            }
        }
    }
    static async getInvoiceTrackingEvents(invoiceId) {
        const snapshot = await exports.db.collection(exports.collections.trackingEvents)
            .where('invoiceId', '==', invoiceId)
            .orderBy('timestamp', 'desc')
            .get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
    }
}
exports.TrackingService = TrackingService;
class BusinessService {
    static async addUserToBusiness(businessId, userId, role = 'USER') {
        await exports.db.collection(exports.collections.businesses)
            .doc(businessId)
            .collection('members')
            .doc(userId)
            .set({
            role,
            addedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    static async removeUserFromBusiness(businessId, userId) {
        await exports.db.collection(exports.collections.businesses)
            .doc(businessId)
            .collection('members')
            .doc(userId)
            .delete();
    }
    static async getUserBusinesses(userId) {
        const businesses = [];
        const businessesSnapshot = await exports.db.collection(exports.collections.businesses).get();
        for (const businessDoc of businessesSnapshot.docs) {
            const memberDoc = await businessDoc.ref.collection('members').doc(userId).get();
            if (memberDoc.exists) {
                businesses.push({
                    id: businessDoc.id,
                    ...businessDoc.data(),
                    userRole: memberDoc.data()?.role,
                });
            }
        }
        return businesses;
    }
}
exports.BusinessService = BusinessService;
