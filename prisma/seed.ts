import { PrismaClient } from '@prisma/client';
import { UserRole } from '../src/lib/constants';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding...');

    // --- Users ---
    // We use the real hashPassword utility to seed credentials
    const adminPasswordHash = hashPassword('admin@2026');
    const staff1PasswordHash = hashPassword('staff1@2026');
    const staff2PasswordHash = hashPassword('staff2@2026');
    const kiosk1PasswordHash = hashPassword('kiosk@2026');
    const display1PasswordHash = hashPassword('display@2026');

    const admin = await prisma.user.upsert({
        where: { username: 'admin' },
        update: {
            passwordHash: adminPasswordHash,
        },
        create: {
            username: 'admin',
            passwordHash: adminPasswordHash,
            name: 'Admin User',
            role: UserRole.ADMIN,
        },
    });
    console.log(`Created admin user with id: ${admin.id}`);

    const staff1 = await prisma.user.upsert({
        where: { username: 'staff1' },
        update: {
            passwordHash: staff1PasswordHash,
        },
        create: {
            username: 'staff1',
            passwordHash: staff1PasswordHash,
            name: 'Staff One',
            role: UserRole.STAFF,
        },
    });
    console.log(`Created staff1 user with id: ${staff1.id}`);

    const staff2 = await prisma.user.upsert({
        where: { username: 'staff2' },
        update: {
            passwordHash: staff2PasswordHash,
        },
        create: {
            username: 'staff2',
            passwordHash: staff2PasswordHash,
            name: 'Staff Two',
            role: UserRole.STAFF,
        },
    });
    console.log(`Created staff2 user with id: ${staff2.id}`);

    const kiosk1 = await prisma.user.upsert({
        where: { username: 'kiosk1' },
        update: {
            passwordHash: kiosk1PasswordHash,
        },
        create: {
            username: 'kiosk1',
            passwordHash: kiosk1PasswordHash,
            name: 'Kiosk User',
            role: UserRole.KIOSK,
        },
    });
    console.log(`Created kiosk1 user with id: ${kiosk1.id}`);

    const display1 = await prisma.user.upsert({
        where: { username: 'display1' },
        update: {
            passwordHash: display1PasswordHash,
        },
        create: {
            username: 'display1',
            passwordHash: display1PasswordHash,
            name: 'Display User',
            role: UserRole.DISPLAY,
        },
    });
    console.log(`Created display1 user with id: ${display1.id}`);

    // --- Services ---
    const serviceA = await prisma.service.upsert({
        where: { code: 'A' },
        update: {},
        create: {
            code: 'A',
            name: 'Dịch vụ A',
            description: 'Dịch vụ ưu tiên',
            color: '#FF5733',
            prefix: 'A',
            order: 1,
        },
    });
    console.log(`Created service A with id: ${serviceA.id}`);

    const serviceB = await prisma.service.upsert({
        where: { code: 'B' },
        update: {},
        create: {
            code: 'B',
            name: 'Dịch vụ B',
            description: 'Dịch vụ thông thường',
            color: '#337AFF',
            prefix: 'B',
            order: 2,
        },
    });
    console.log(`Created service B with id: ${serviceB.id}`);

    // --- Settings ---
    const skipRules = await prisma.settings.upsert({
        where: { key: 'skip_rules' },
        update: { value: '1,3,5,MISSED' },
        create: {
            key: 'skip_rules',
            value: '1,3,5,MISSED', // Default skip rules from blueprint
        },
    });
    console.log(`Created setting: ${skipRules.key} = ${skipRules.value}`);

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
