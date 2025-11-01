"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/invoice_test',
        },
    },
});
exports.prisma = prisma;
beforeAll(async () => {
    await prisma.$connect();
});
afterEach(async () => {
    const deleteOrderedTables = [
        'tracking_events',
        'payments',
        'line_items',
        'invoices',
        'products',
        'contacts',
        'integration_credentials',
        'business_users',
        'businesses',
        'users',
    ];
    for (const table of deleteOrderedTables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
    }
});
afterAll(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=setup.js.map