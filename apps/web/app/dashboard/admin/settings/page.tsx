import { redirect } from 'next/navigation';

export default function AdminSettingsRedirectPage() {
    redirect('/dashboard/admin/tokens');
}
