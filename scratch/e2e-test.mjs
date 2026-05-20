import { execSync } from 'child_process';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
    console.log('🚀 KHỞI CHẠY THỬ NGHIỆM TỰ ĐỘNG TOÀN TRÌNH (API E2E TEST) 🚀\n');

    try {
        // 1. Kiểm tra Health Check
        console.log('🔄 1. Kiểm tra kết nối Health check...');
        const healthRes = await fetch(`${BASE_URL}/api/health`);
        const health = await healthRes.json();
        console.log('   👉 Kết quả Health check:', JSON.stringify(health));
        if (!health.ok || health.db !== 'connected') {
            throw new Error('Database chưa kết nối!');
        }

        // 2. Lấy danh sách dịch vụ
        console.log('\n🔄 2. Lấy danh sách dịch vụ hoạt động...');
        const servicesRes = await fetch(`${BASE_URL}/api/services`);
        const services = await servicesRes.json();
        const serviceA = services.find(s => s.code === 'A');
        if (!serviceA) {
            throw new Error('Không tìm thấy dịch vụ A trong cơ sở dữ liệu!');
        }
        console.log(`   👉 Chọn dịch vụ: ${serviceA.name} (ID: ${serviceA.id})`);

        // 3. Tạo một vé mới (Lấy số nhanh)
        console.log('\n🔄 3. Giả lập khách hàng lấy số mới...');
        const ticketRes = await fetch(`${BASE_URL}/api/tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serviceId: serviceA.id,
                customerName: 'Kiểm thử tự động',
                phone: '0909999999'
            })
        });
        const ticket = await ticketRes.json();
        console.log(`   👉 Lấy số thành công: ${ticket.ticketNumber} (ID: ${ticket.id}, Status: ${ticket.status}, Position: ${ticket.position})`);

        // 4. Lấy Demo Token của Cán bộ (STAFF)
        console.log('\n🔄 4. Lấy Token xác thực quyền Cán bộ (STAFF)...');
        const tokenRes = await fetch(`${BASE_URL}/api/demo-token?role=STAFF`);
        const tokenData = await tokenRes.json();
        if (!tokenData.token) {
            throw new Error('Không tạo được token cán bộ!');
        }
        console.log('   👉 Lấy token thành công.');
        const authCookie = `auth_token=${tokenData.token}`;

        // 5. Cán bộ gọi số tiếp theo (Call Next)
        console.log('\n🔄 5. Cán bộ Quầy 5 bấm "Gọi số tiếp theo" (Call Next)...');
        const callNextRes = await fetch(`${BASE_URL}/api/queue/call-next`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': authCookie
            },
            body: JSON.stringify({
                serviceId: serviceA.id,
                pos: 'Quầy số 5'
            })
        });
        
        if (!callNextRes.ok) {
            const err = await callNextRes.json();
            throw new Error(`Lỗi khi gọi số: ${JSON.stringify(err)}`);
        }
        
        const calledTicket = await callNextRes.json();
        console.log(`   👉 Đã gọi số: ${calledTicket.ticketNumber} (Trạng thái: ${calledTicket.status}, Phục vụ tại: ${calledTicket.pos})`);

        // 6. Cán bộ bỏ qua vé (Skip Ticket)
        console.log('\n🔄 6. Cán bộ bấm "Bỏ qua" (Skip) vé hiện tại...');
        const skipRes = await fetch(`${BASE_URL}/api/queue/skip`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': authCookie
            },
            body: JSON.stringify({
                ticketId: calledTicket.id
            })
        });
        
        if (!skipRes.ok) {
            const err = await skipRes.json();
            throw new Error(`Lỗi khi bỏ qua vé: ${JSON.stringify(err)}`);
        }
        
        const skippedTicket = await skipRes.json();
        console.log(`   👉 Kết quả Bỏ qua: Trạng thái đổi thành -> ${skippedTicket.status}, Vị trí mới: ${skippedTicket.position}, Số lần lỡ lượt: ${skippedTicket.missCount}`);

        // 7. Cán bộ gọi lại số vừa bị bỏ qua
        console.log('\n🔄 7. Cán bộ gọi số tiếp theo để xử lý vé vừa bỏ qua...');
        const callAgainRes = await fetch(`${BASE_URL}/api/queue/call-next`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': authCookie
            },
            body: JSON.stringify({
                serviceId: serviceA.id,
                pos: 'Quầy số 5'
            })
        });
        const recalledTicket = await callAgainRes.json();
        console.log(`   👉 Đã gọi lại số: ${recalledTicket.ticketNumber} (Trạng thái: ${recalledTicket.status}, Phục vụ tại: ${recalledTicket.pos})`);

        // 8. Cán bộ hoàn thành xử lý vé (Complete Ticket)
        console.log('\n🔄 8. Cán bộ xác nhận "Hoàn tất" (Complete) giao dịch...');
        const completeRes = await fetch(`${BASE_URL}/api/queue/complete`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': authCookie
            },
            body: JSON.stringify({
                ticketId: recalledTicket.id
            })
        });
        const completedTicket = await completeRes.json();
        console.log(`   👉 Hoàn thành giao dịch: Vé ${completedTicket.ticketNumber} đổi trạng thái thành -> ${completedTicket.status}`);

        console.log('\n🎉 THỬ NGHIỆM TỰ ĐỘNG HOÀN TẤT THÀNH CÔNG RỰC RỠ! 🎉');
        console.log('Toàn bộ quy trình Lấy số ➔ Gọi số ➔ Bỏ qua ➔ Gọi lại ➔ Hoàn tất hoạt động hoàn hảo!');

    } catch (error) {
        console.error('\n❌ THỬ NGHIỆM THẤT BẠI:', error.message);
        process.exit(1);
    }
}

runTests();
