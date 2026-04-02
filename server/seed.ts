import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "../shared/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

async function seed() {
  console.log("Seeding database...");

  // Create admin user
  await db.insert(schema.users).values({
    id: "admin",
    name: "System Admin",
    email: "admin@factory.com",
    password: "admin123",
    role: "manager",
    department: "Management",
    photoUrl: "https://github.com/shadcn.png",
  }).onConflictDoNothing();

  // Create worker users
  await db.insert(schema.users).values([
    {
      id: "46",
      name: "Theunis Scheepers",
      email: null,
      password: null,
      role: "worker",
      department: "Technical",
      photoUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    },
    {
      id: "102",
      name: "Sarah Connor",
      email: null,
      password: null,
      role: "worker",
      department: "Production",
      photoUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    },
    {
      id: "105",
      name: "Mike Ross",
      email: null,
      password: null,
      role: "worker",
      department: "Logistics",
      photoUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    },
  ]).onConflictDoNothing();

  // Create leave balances for workers
  const workers = ["46", "102", "105"];
  for (const userId of workers) {
    await db.insert(schema.leaveBalances).values([
      {
        userId,
        leaveType: "Annual Leave",
        total: 21,
        taken: 0,
        pending: 0,
      },
      {
        userId,
        leaveType: "Sick Leave",
        total: 30,
        taken: 0,
        pending: 0,
      },
      {
        userId,
        leaveType: "Family Responsibility",
        total: 3,
        taken: 0,
        pending: 0,
      },
    ]).onConflictDoNothing();
  }

  // Create departments
  await db.insert(schema.departments).values([
    { name: "Administration" },
    { name: "Finance" },
    { name: "Front Office" },
    { name: "General Manager" },
    { name: "Human Resources" },
    { name: "Managing Director" },
    { name: "Manufacturing" },
    { name: "Mechanical" },
    { name: "Quality Control" },
    { name: "Repairs" },
    { name: "Research & Development" },
  ]).onConflictDoNothing();

  // Create employee types
  await db.insert(schema.employeeTypes).values([
    {
      name: "Consultant",
      description: "Professional consultant engaged for specific projects",
      leaveLabel: "Unavailable",
      hasLeaveEntitlement: "no",
      isDefault: "no",
      isPermanent: "no",
    },
    {
      name: "External Contractor",
      description: "Independent contractor or agency worker",
      leaveLabel: "Unavailable",
      hasLeaveEntitlement: "no",
      isDefault: "no",
      isPermanent: "no",
    },
    {
      name: "Permanent Employee",
      description: "Full-time permanent staff member",
      leaveLabel: "Leave",
      hasLeaveEntitlement: "no",
      isDefault: "no",
      isPermanent: "yes",
    },
    {
      name: "Temporary Worker",
      description: "Short-term or seasonal worker",
      leaveLabel: "Leave",
      hasLeaveEntitlement: "no",
      isDefault: "no",
      isPermanent: "no",
    },
  ]).onConflictDoNothing();

  // Create org positions — parents first, then children
  // Manager positions (parent = null or "Managing Director")
  const [managingDirector] = await db.insert(schema.orgPositions).values({
    title: "Managing Director",
    department: "Managing Director",
    parentPositionId: null,
    sortOrder: 0,
    tier: 1,
  }).onConflictDoNothing().returning();

  if (managingDirector) {
    // Tier-1 managers reporting to Managing Director
    const [generalManager] = await db.insert(schema.orgPositions).values({
      title: "General Manager",
      department: "General Manager",
      parentPositionId: managingDirector.id,
      sortOrder: 0,
      tier: 1,
    }).returning();

    const [financeManager] = await db.insert(schema.orgPositions).values({
      title: "Finance Manager",
      department: "Finance",
      parentPositionId: managingDirector.id,
      sortOrder: 1,
      tier: 1,
    }).returning();

    const [frontOfficeManager] = await db.insert(schema.orgPositions).values({
      title: "Front Office Manager",
      department: "Front Office",
      parentPositionId: managingDirector.id,
      sortOrder: 2,
      tier: 1,
    }).returning();

    await db.insert(schema.orgPositions).values({
      title: "HR Manager",
      department: "Human Resources",
      parentPositionId: managingDirector.id,
      sortOrder: 3,
      tier: 1,
    });

    const [rdManager] = await db.insert(schema.orgPositions).values({
      title: "R&D Manager",
      department: "Research & Development",
      parentPositionId: managingDirector.id,
      sortOrder: 4,
      tier: 1,
    }).returning();

    // Mechanical Manager reports to General Manager
    const [mechanicalManager] = await db.insert(schema.orgPositions).values({
      title: "Mechanical Manager",
      department: "Mechanical",
      parentPositionId: generalManager.id,
      sortOrder: 0,
      tier: 1,
    }).returning();

    // Staff positions — each reports to their respective manager
    await db.insert(schema.orgPositions).values([
      {
        title: "Finance Staff",
        department: "Finance",
        parentPositionId: financeManager.id,
        sortOrder: 0,
        tier: 1,
      },
      {
        title: "Front Office Staff",
        department: "Front Office",
        parentPositionId: frontOfficeManager.id,
        sortOrder: 1,
        tier: 1,
      },
      {
        title: "Manufacturing Worker",
        department: "Manufacturing",
        parentPositionId: generalManager.id,
        sortOrder: 2,
        tier: 1,
      },
      {
        title: "Mechanical Technician",
        department: "Mechanical",
        parentPositionId: mechanicalManager.id,
        sortOrder: 3,
        tier: 1,
      },
      {
        title: "QC Staff",
        department: "Quality Control",
        parentPositionId: generalManager.id,
        sortOrder: 4,
        tier: 1,
      },
      {
        title: "R&D Technician",
        department: "Research & Development",
        parentPositionId: rdManager.id,
        sortOrder: 5,
        tier: 1,
      },
      {
        title: "Repairs Technician",
        department: "Repairs",
        parentPositionId: generalManager.id,
        sortOrder: 6,
        tier: 1,
      },
    ]);
  }

  // Create default settings
  await db.insert(schema.settings).values({
    key: "admin_email",
    value: "manager@factory.com",
  }).onConflictDoNothing();

  console.log("Database seeded successfully!");
  await pool.end();
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
