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

        // 3. Lấy Demo Token của Cán bộ (STAFF) — cần trước để mở SSE STAFF listener
        //    TRƯỚC KHI tạo vé, để bắt được broadcast đầu tiên của vé này.
        console.log('\n🔄 3. Lấy Token xác thực quyền Cán bộ (STAFF)...');
        const tokenRes = await fetch(`${BASE_URL}/api/demo-token?role=STAFF`);
        const tokenData = await tokenRes.json();
        if (!tokenData.token) {
            throw new Error('Không tạo được token cán bộ!');
        }
        console.log('   👉 Lấy token thành công.');
        const authCookie = `auth_token=${tokenData.token}`;

        // Hàm phụ trợ: mở một kết nối SSE, tự abort sau `durationMs`, trả về buffer đã đọc.
        // (Cùng cách tiếp cận abort-after-timeout mà bản gốc đã dùng — chỉ đơn giản là giờ
        // ta mở nó SỚM HƠN, trước khi hành động kích hoạt broadcast xảy ra.)
        function openSseListener(url, headers, durationMs) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), durationMs);
            const resultPromise = (async () => {
                let buffer = '';
                try {
                    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/event-stream', ...headers } });
                    if (!res.body) return buffer;
                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        if (buffer.length > 50000) break;
                    }
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.log(`   ⚠️  Lỗi đọc SSE (${url}): ${err.message}`);
                    }
                } finally {
                    clearTimeout(timeoutId);
                }
                return buffer;
            })();
            return { controller, resultPromise };
        }

        // 3b. [PII TEST] Mở SONG SONG 2 kết nối SSE (ẩn danh + STAFF) TRƯỚC KHI tạo vé mới,
        //     rồi tạo vé để kích hoạt broadcastQueueUpdate — đảm bảo cả hai stream thực sự
        //     nhận được event chứa vé này (không kiểm tra một buffer rỗng một cách vô nghĩa).
        console.log('\n🔄 3b. [PII] Mở kết nối SSE ẩn danh + STAFF trước khi tạo vé...');
        const SSE_WINDOW_MS = 4000;
        const anonSse = openSseListener(`${BASE_URL}/api/sse/queue?serviceId=${serviceA.id}`, {}, SSE_WINDOW_MS);
        const staffSse = openSseListener(`${BASE_URL}/api/sse/queue?serviceId=${serviceA.id}`, { Cookie: authCookie }, SSE_WINDOW_MS);
        // Đợi một nhịp ngắn để cả hai kết nối kịp subscribe trước khi bắn broadcast.
        await new Promise(r => setTimeout(r, 500));

        // 4. Tạo một vé mới (Lấy số nhanh) — hành động này trigger broadcastQueueUpdate
        console.log('\n🔄 4. Giả lập khách hàng lấy số mới (trong lúc SSE đang lắng nghe)...');
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

        // Mỗi kết nối tự abort sau SSE_WINDOW_MS (đặt lúc mở ở trên); chỉ cần đợi chúng xong.
        const [anonSseBuffer, staffSseBuffer] = await Promise.all([anonSse.resultPromise, staffSse.resultPromise]);

        // 4a. [PII TEST] SSE ẩn danh: PHẢI thấy vé (để chắc chắn đã bắt được broadcast thật,
        //     không phải buffer rỗng "không kết luận được"), nhưng KHÔNG được thấy PII thật.
        console.log('\n🔄 4a. [PII] Kiểm tra SSE ẩn danh nhận được broadcast của vé vừa tạo, không lộ PII...');
        if (!anonSseBuffer.includes(ticket.id)) {
            throw new Error(
                `Kết nối SSE ẩn danh không nhận được broadcast nào chứa vé ID=${ticket.id} trong ${SSE_WINDOW_MS}ms — ` +
                `không thể kết luận việc redact có hoạt động hay không (test không có ý nghĩa nếu không bắt được sự kiện thật).`
            );
        }
        if (anonSseBuffer.includes(CUSTOMER_NAME) || anonSseBuffer.includes(CUSTOMER_PHONE)) {
            throw new Error(
                `❌ LEAK PII qua SSE! Stream ẩn danh chứa customerName/phone thật của khách trong broadcast của vé ${ticket.id}.`
            );
        }
        console.log(`   👉 OK — SSE ẩn danh nhận được broadcast của vé (đã bắt được event thật) và không lộ PII (${anonSseBuffer.length} ký tự).`);

        // 4b. [PII TEST] SSE với quyền STAFF: PHẢI thấy vé VÀ PHẢI thấy PII thật (regression
        //     check chống over-redaction — không chỉ REST mà cả SSE cũng phải phân biệt theo role).
        console.log('\n🔄 4b. [PII] Kiểm tra SSE STAFF vẫn thấy PII thật trong cùng broadcast...');
        if (!staffSseBuffer.includes(ticket.id)) {
            throw new Error(
                `Kết nối SSE STAFF không nhận được broadcast nào chứa vé ID=${ticket.id} trong ${SSE_WINDOW_MS}ms — ` +
                `không thể kết luận việc redact có hoạt động đúng theo role hay không.`
            );
        }
        if (!staffSseBuffer.includes(CUSTOMER_NAME) || !staffSseBuffer.includes(CUSTOMER_PHONE)) {
            throw new Error(
                `❌ OVER-REDACT qua SSE! STAFF lẽ ra phải thấy PII thật qua SSE nhưng bị ẩn trong broadcast của vé ${ticket.id}.`
            );
        }
        console.log(`   👉 OK — SSE STAFF nhận được broadcast của vé và vẫn thấy đầy đủ customerName/phone thật (${staffSseBuffer.length} ký tự).`);

        // 4c. [PII TEST] Anonymous GET /api/tickets KHÔNG được thấy customerName/phone
        console.log('\n🔄 4c. [PII] Kiểm tra GET /api/tickets ẩn danh (không cookie)...');
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

        // 4d. [PII TEST] STAFF GET /api/tickets PHẢI vẫn thấy customerName/phone thật
        //     (regression check — đảm bảo redact đúng theo role, không redact luôn cho STAFF/ADMIN)
        console.log('\n🔄 4d. [PII] Kiểm tra GET /api/tickets với quyền STAFF vẫn thấy PII thật...');
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
        console.log('PII redaction (SSE ẩn danh/STAFF + GET /api/tickets ẩn danh/STAFF) đã được verify trong bước 3b/4a-4d.');

    } catch (error) {
        console.error('\n❌ THỬ NGHIỆM THẤT BẠI:', error.message);
        // Node's fetch wraps the real network error (ECONNREFUSED, ENOTFOUND, v.v.)
        // trong error.cause — error.message một mình chỉ nói "fetch failed", vô nghĩa.
        if (error.cause) {
            console.error('   ↳ Nguyên nhân gốc (error.cause):', error.cause);
        }
        if (error.stack) {
            console.error('   ↳ Stack:', error.stack);
        }
        process.exit(1);
    }
}

runTests();
