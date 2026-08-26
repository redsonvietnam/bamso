"use client";

import { Suspense } from 'react';
import { GetTicketFlow } from '@/components/customer/GetTicketFlow';

export default function GetTicketPage() {
    return (
        <Suspense>
            <GetTicketFlow />
        </Suspense>
    );
}
