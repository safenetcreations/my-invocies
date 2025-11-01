import { PrismaClient } from '@prisma/client';

// Test database setup
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/invoice_test',
    },
  },
});

beforeAll(async () => {
  // Connect to test database
  await prisma.$connect();
});

afterEach(async () => {
  // Clean up test data
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

export { prisma };