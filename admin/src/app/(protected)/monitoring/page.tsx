'use client';

import ESMonitoring from '@/components/ESMonitoring';
import { Banner } from '@/components/ui';
import Page from '@/components/ui/Page';
import { useAuth } from '@/components/providers';
import { hasPermission } from '@/lib/rbac';

export default function MonitoringPage() {
    const { user, isLoading } = useAuth();
    const canViewMonitoring = hasPermission(user, 'canViewMonitoring');

    if (isLoading) {
        return (
            <Page title='Monitoring'>
                <div>Loading...</div>
            </Page>
        );
    }

    if (!canViewMonitoring) {
        return (
            <Page title='Monitoring'>
                <Banner variant='warning'>You do not have permission to access monitoring.</Banner>
            </Page>
        );
    }

    return (
        <>
            <ESMonitoring />
        </>
    );
}
