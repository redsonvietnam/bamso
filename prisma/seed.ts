import { PrismaClient } from '@prisma/client';
import { UserRole } from '../src/lib/constants';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding...');

    // --- Users ---
    // We use the real hashPassword utility to seed credentials
    const adminPasswordHash = hashPassword('admin@2026');
    const canbo1PasswordHash = hashPassword('canbo1@123');
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

    // Remove old staff1 if still exists, then create/update canbo1
    await prisma.user.deleteMany({ where: { username: 'staff1' } });

    const canbo1 = await prisma.user.upsert({
        where: { username: 'canbo1' },
        update: {
            passwordHash: canbo1PasswordHash,
        },
        create: {
            username: 'canbo1',
            passwordHash: canbo1PasswordHash,
            name: 'Cán bộ 1',
            role: UserRole.STAFF,
        },
    });
    console.log(`Created canbo1 user with id: ${canbo1.id}`);

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

    const counters = await prisma.settings.upsert({
        where: { key: 'counters' },
        update: { value: 'Quầy 1, Quầy 2, Quầy 3, Quầy 4' },
        create: {
            key: 'counters',
            value: 'Quầy 1, Quầy 2, Quầy 3, Quầy 4',
        },
    });
    console.log(`Created setting: ${counters.key} = ${counters.value}`);

    // --- TTS Settings ---
    const ttsSettings = [
        { key: 'tts_enabled', value: 'true' },
        { key: 'tts_speed', value: '0.9' },
        { key: 'tts_volume', value: '1' },
        { key: 'tts_provider', value: 'google' },
        { key: 'tts_edge_voice', value: 'vi-VN-HoaiMyNeural' },
        { key: 'tts_announcement_template', value: 'Mời số {ticketNumber} đến {pos} để phục vụ' },
        { key: 'tts_prepare_template', value: 'Số {ticketNumber} chuẩn bị' },
        { key: 'thank_you_text', value: 'Cảm ơn bạn đã sử dụng dịch vụ' },
        { key: 'thank_you_voice_template', value: 'Cảm ơn bạn. Số {ticketNumber} đã được phục vụ xong.' },
    ];

    for (const s of ttsSettings) {
        const setting = await prisma.settings.upsert({
            where: { key: s.key },
            update: { value: s.value },
            create: s,
        });
        console.log(`Created setting: ${setting.key} = ${setting.value}`);
    }

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
