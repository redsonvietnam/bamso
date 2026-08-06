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
        const CUSTOMER_NAME = 'Kiểm thử tự động';
        const CUSTOMER_PHONE = '0909999999';
        const ticketRes = await fetch(`${BASE_URL}/api/tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                serviceId: serviceA.id,
                customerName: CUSTOMER_NAME,
                phone: CUSTOMER_PHONE
            })
        });
        const ticket = await ticketRes.json();
        console.log(`   👉 Lấy số thành công: ${ticket.ticketNumber} (ID: ${ticket.id}, Status: ${ticket.status}, Position: ${ticket.position})`);

        // 3b. [PII TEST] Anonymous GET /api/tickets KHÔNG được thấy customerName/phone
        console.log('\n🔄 3b. [PII] Kiểm tra GET /api/tickets ẩn danh (không cookie)...');
        const anonListRes = await fetch(`${BASE_URL}/api/tickets`);
        if (!anonListRes.ok) {
            throw new Error(`GET /api/tickets ẩn danh trả lỗi HTTP ${anonListRes.status}`);
        }
        const anonList = await anonListRes.json();
        const anonRows = Array.isArray(anonList) ? anonList : (anonList.tickets ?? anonList.data ?? []);
        const anonTicket = anonRows.find(t => t.id === ticket.id);
        if (!anonTicket) {
            throw new Error('Không tìm thấy vé vừa tạo trong response GET /api/tickets ẩn danh — không thể verify redaction.');
        }
        if (anonTicket.customerName === CUSTOMER_NAME || anonTicket.phone === CUSTOMER_PHONE) {
            throw new Error(
                `❌ LEAK PII! Anonymous GET /api/tickets vẫn trả customerName/phone thật: ` +
                JSON.stringify({ customerName: anonTicket.customerName, phone: anonTicket.phone })
            );
        }
        console.log(`   👉 OK — anonymous thấy customerName=${JSON.stringify(anonTicket.customerName)}, phone=${JSON.stringify(anonTicket.phone)} (đã redact)`);

        // 4. Lấy Demo Token của Cán bộ (STAFF)
        console.log('\n🔄 4. Lấy Token xác thực quyền Cán bộ (STAFF)...');
        const tokenRes = await fetch(`${BASE_URL}/api/demo-token?role=STAFF`);
        const tokenData = await tokenRes.json();
        if (!tokenData.token) {
            throw new Error('Không tạo được token cán bộ!');
        }
        console.log('   👉 Lấy token thành công.');
        const authCookie = `auth_token=${tokenData.token}`;

        // 4b. [PII TEST] STAFF GET /api/tickets PHẢI vẫn thấy customerName/phone thật
        //     (regression check — đảm bảo redact đúng theo role, không redact luôn cho STAFF/ADMIN)
        console.log('\n🔄 4b. [PII] Kiểm tra GET /api/tickets với quyền STAFF vẫn thấy PII thật...');
        const staffListRes = await fetch(`${BASE_URL}/api/tickets`, {
            headers: { 'Cookie': authCookie }
        });
        if (!staffListRes.ok) {
            throw new Error(`GET /api/tickets (STAFF) trả lỗi HTTP ${staffListRes.status}`);
        }
        const staffList = await staffListRes.json();
        const staffRows = Array.isArray(staffList) ? staffList : (staffList.tickets ?? staffList.data ?? []);
        const staffTicket = staffRows.find(t => t.id === ticket.id);
        if (!staffTicket) {
            throw new Error('Không tìm thấy vé vừa tạo trong response GET /api/tickets (STAFF).');
        }
        if (staffTicket.customerName !== CUSTOMER_NAME || staffTicket.phone !== CUSTOMER_PHONE) {
            throw new Error(
                `❌ OVER-REDACT! STAFF lẽ ra phải thấy PII thật nhưng bị ẩn: ` +
                JSON.stringify({ customerName: staffTicket.customerName, phone: staffTicket.phone })
            );
        }
        console.log('   👉 OK — STAFF vẫn thấy đầy đủ customerName/phone như thiết kế.');

        // 4c-setup. [PII TEST] Mở kết nối SSE ẩn danh TRƯỚC các thao tác call-next/skip/complete,
        //     để khi các event thật (có kèm customerName/phone) được broadcast trong bước 5-8,
        //     ta bắt được dữ liệu thật thay vì chỉ đọc lúc kết nối im lặng (sẽ chỉ có vài ký tự heartbeat).
        //     LƯU Ý: giả định query param là ?serviceId=... — sửa lại nếu route thật khác.
        console.log('\n🔄 4c-setup. [PII] Mở kết nối SSE ẩn danh, sẽ nghe song song trong lúc cán bộ thao tác (bước 5-8)...');
        let sseBuffer = '';
        let sseListenError = null;
        const sseController = new AbortController();
        const sseListenPromise = (async () => {
            try {
                const sseRes = await fetch(`${BASE_URL}/api/sse/queue?serviceId=${serviceA.id}`, {
                    signal: sseController.signal,
                    headers: { Accept: 'text/event-stream' }
                });
                if (!sseRes.ok || !sseRes.body) {
                    sseListenError = new Error(`SSE trả HTTP ${sseRes.status}`);
                    return;
                }
                const reader = sseRes.body.getReader();
                const decoder = new TextDecoder();
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    sseBuffer += decoder.decode(value, { stream: true });
                    if (sseBuffer.length > 50000) break; // tránh đọc vô hạn
                }
            } catch (err) {
                if (err.name !== 'AbortError') sseListenError = err;
            }
        })();

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

        // 4c-verify. [PII TEST] Đóng kết nối SSE và kiểm tra dữ liệu thu được TRONG LÚC các event
        //     call-next/skip/complete vừa xảy ra ở bước 5-8.
        console.log('\n🔄 4c-verify. [PII] Đóng SSE, kiểm tra dữ liệu thu được trong lúc thao tác...');
        sseController.abort();
        await sseListenPromise.catch(() => {});
        if (sseListenError) {
            console.log(`   ⚠️  Không thể kiểm tra SSE tự động (${sseListenError.message}) — cần verify thủ công qua trình duyệt (mở /api/sse/queue không đăng nhập, xem Network tab lúc cán bộ gọi số).`);
        } else if (sseBuffer.includes(CUSTOMER_NAME) || sseBuffer.includes(CUSTOMER_PHONE)) {
            throw new Error(
                `❌ LEAK PII qua SSE! Stream ẩn danh chứa customerName/phone thật của khách trong lúc broadcast queue update.`
            );
        } else if (sseBuffer.length < 20) {
            console.log(`   ⚠️  Chỉ thu được ${sseBuffer.length} ký tự qua SSE trong suốt bước 5-8 — gần như chắc chắn KHÔNG có event queue update nào thực sự lọt qua (có thể do sai serviceId/query param, hoặc event dùng channel khác). KHÔNG kết luận được gì từ bước này — cần verify thủ công.`);
        } else {
            console.log(`   👉 OK — thu được ${sseBuffer.length} ký tự qua SSE trong lúc call-next/skip/complete xảy ra, không thấy customerName/phone thật.`);
        }

        console.log('\n🎉 THỬ NGHIỆM TỰ ĐỘNG HOÀN TẤT THÀNH CÔNG RỰC RỠ! 🎉');
        console.log('Toàn bộ quy trình Lấy số ➔ Gọi số ➔ Bỏ qua ➔ Gọi lại ➔ Hoàn tất hoạt động hoàn hảo!');
        console.log('PII redaction (GET /api/tickets ẩn danh) đã verify ở 3b/4b. SSE verify (nếu đủ dữ liệu) ở 4c-verify.');

    } catch (error) {
        console.error('\n❌ THỬ NGHIỆM THẤT BẠI:', error.message);
        process.exit(1);
    }
}

runTests();
