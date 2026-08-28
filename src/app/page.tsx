"use client";

import { Suspense } from 'react';
import { GetTicketFlow } from '@/components/customer/GetTicketFlow';

export default function HomePage() {
    return (
        <Suspense>
            <GetTicketFlow />
        </Suspense>
    );
}
