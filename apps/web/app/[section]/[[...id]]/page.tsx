import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Dashboard } from '../../../components/dashboard';
import { isPrivateDashboardPath } from '../../../lib/private-paths';
export default async function Page({
  params,
}: {
  params: Promise<{ section: string; id?: string[] }>;
}) {
  const { section, id } = await params;
  if (isPrivateDashboardPath([section, ...(id ?? [])])) notFound();
  if (!(await cookies()).get('flare_session')) redirect('/login');
  return <Dashboard section={section} id={id?.join('/')} />;
}
