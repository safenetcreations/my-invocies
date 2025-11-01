import * as admin from 'firebase-admin';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

// Lazy getter for Firestore instance to ensure Firebase Admin is initialized first
let _db: FirebaseFirestore.Firestore | null = null;
export const getDb = () => {
  if (!_db) {
    _db = getFirestore();
  }
  return _db;
};
export const db = new Proxy({} as FirebaseFirestore.Firestore, {
  get(target, prop) {
    return (getDb() as any)[prop];
  }
});

// Collection references
export const collections = {
  users: 'users',
  businesses: 'businesses',
  products: 'products',
  contacts: 'contacts',
  invoices: 'invoices',
  trackingEvents: 'trackingEvents',
  integrationCredentials: 'integrationCredentials',
};

// Firestore CRUD helpers
export class FirestoreService {

  // Generic create
  static async create<T>(collection: string, data: T, id?: string): Promise<{ id: string; data: T }> {
    const docRef = id ? db.collection(collection).doc(id) : db.collection(collection).doc();

    const dataWithTimestamps = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(dataWithTimestamps);

    return {
      id: docRef.id,
      data: dataWithTimestamps as T,
    };
  }

  // Generic read
  static async get<T>(collection: string, id: string): Promise<T | null> {
    const doc = await db.collection(collection).doc(id).get();

    if (!doc.exists) {
      return null;
    }

    return {
      id: doc.id,
      ...doc.data(),
    } as T;
  }

  // Generic update
  static async update<T>(collection: string, id: string, data: Partial<T>): Promise<void> {
    const dataWithTimestamp = {
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
    };

    await db.collection(collection).doc(id).update(dataWithTimestamp);
  }

  // Generic delete
  static async delete(collection: string, id: string): Promise<void> {
    await db.collection(collection).doc(id).delete();
  }

  // Generic list with filters
  static async list<T>(
    collection: string,
    filters?: { field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }[],
    orderBy?: { field: string; direction: 'asc' | 'desc' },
    limit?: number
  ): Promise<T[]> {
    let query: FirebaseFirestore.Query = db.collection(collection);

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
    })) as T[];
  }

  // Batch operations
  static batch() {
    return db.batch();
  }

  // Transaction
  static async runTransaction<T>(updateFunction: (transaction: FirebaseFirestore.Transaction) => Promise<T>): Promise<T> {
    return db.runTransaction(updateFunction);
  }
}

// Invoice-specific helpers
export class InvoiceService {

  static async getNextInvoiceNumber(businessId: string, prefix: string): Promise<string> {
    return db.runTransaction(async (transaction) => {
      const businessRef = db.collection(collections.businesses).doc(businessId);
      const businessDoc = await transaction.get(businessRef);

      if (!businessDoc.exists) {
        throw new Error('Business not found');
      }

      const currentSequence = businessDoc.data()?.invoiceSequence || 0;
      const nextSequence = currentSequence + 1;

      transaction.update(businessRef, {
        invoiceSequence: nextSequence,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return `${prefix}-${nextSequence.toString().padStart(5, '0')}`;
    });
  }

  static async createInvoice(invoiceData: any): Promise<{ id: string }> {
    const invoiceNumber = await this.getNextInvoiceNumber(
      invoiceData.businessId,
      invoiceData.invoicePrefix || 'INV'
    );

    const invoiceRef = db.collection(collections.invoices).doc();
    const batch = db.batch();

    // Create invoice
    batch.set(invoiceRef, {
      ...invoiceData,
      invoiceNumber,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Create line items as subcollection
    if (invoiceData.lineItems && invoiceData.lineItems.length > 0) {
      invoiceData.lineItems.forEach((item: any, index: number) => {
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

  static async getInvoiceWithDetails(invoiceId: string): Promise<any> {
    const invoiceDoc = await db.collection(collections.invoices).doc(invoiceId).get();

    if (!invoiceDoc.exists) {
      return null;
    }

    const invoice = {
      id: invoiceDoc.id,
      ...invoiceDoc.data(),
    };

    // Get line items
    const lineItemsSnapshot = await invoiceDoc.ref.collection('lineItems').orderBy('sortOrder').get();
    const lineItems = lineItemsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get payments
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

// Tracking service
export class TrackingService {

  static async recordEvent(invoiceId: string, kind: string, metadata: any = {}): Promise<void> {
    await db.collection(collections.trackingEvents).add({
      invoiceId,
      kind,
      metadata,
      timestamp: FieldValue.serverTimestamp(),
    });

    // Update invoice status based on tracking event
    if (kind === 'EMAIL_OPEN' || kind === 'INVOICE_VIEWED') {
      const invoiceRef = db.collection(collections.invoices).doc(invoiceId);
      const invoiceDoc = await invoiceRef.get();

      if (invoiceDoc.exists && invoiceDoc.data()?.status === 'SENT') {
        await invoiceRef.update({
          status: 'VIEWED',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  }

  static async getInvoiceTrackingEvents(invoiceId: string): Promise<any[]> {
    const snapshot = await db.collection(collections.trackingEvents)
      .where('invoiceId', '==', invoiceId)
      .orderBy('timestamp', 'desc')
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  }
}

// Business service
export class BusinessService {

  static async addUserToBusiness(businessId: string, userId: string, role: string = 'USER'): Promise<void> {
    await db.collection(collections.businesses)
      .doc(businessId)
      .collection('members')
      .doc(userId)
      .set({
        role,
        addedAt: FieldValue.serverTimestamp(),
      });
  }

  static async removeUserFromBusiness(businessId: string, userId: string): Promise<void> {
    await db.collection(collections.businesses)
      .doc(businessId)
      .collection('members')
      .doc(userId)
      .delete();
  }

  static async getUserBusinesses(userId: string): Promise<any[]> {
    const businesses: any[] = [];

    // Get all businesses where user is a member
    const businessesSnapshot = await db.collection(collections.businesses).get();

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

export { FieldValue, Timestamp };
