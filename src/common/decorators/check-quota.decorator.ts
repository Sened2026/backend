import { SetMetadata } from '@nestjs/common';

export const CHECK_QUOTA_KEY = 'checkQuota';
export const CheckQuota = (quotaType: 'max_quotes_per_month' | 'max_invoices_per_month') =>
    SetMetadata(CHECK_QUOTA_KEY, quotaType);
