'use client';

// TODO: The serviceId for this QR should be configurable, perhaps from the URL or a default setting.
const DEFAULT_SERVICE_ID = "clz4o8xke000013j9f21jbfat"; 
const KIOSK_ID = "kiosk-test-mode-qr";

export default function QrPanel() {
  const qrCodeUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/ticket/new?serviceId=${DEFAULT_SERVICE_ID}&kioskId=${KIOSK_ID}`;

  return (
    <div className="flex flex-col items-center justify-center bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-sm w-full max-w-sm aspect-square">
        <h2 className="text-2xl font-bold text-slate-800">Lấy số qua di động</h2>
        <p className="text-slate-600 mt-2 mb-6">Quét mã QR bằng điện thoại của bạn để lấy số thứ tự ngay lập tức.</p>
        <div className="bg-white p-4 rounded-lg shadow-md">
            <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qrCodeUrl)}`} 
                alt="QR Code for mobile ticket"
                width="256"
                height="256" 
            />
        </div>
    </div>
  );
}
