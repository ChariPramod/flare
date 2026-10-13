import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Dashboard } from '../../../components/dashboard';
export default async function Page({
  params,
}: {
  params: Promise<{ section: string; id?: string[] }>;
}) {
  if (!(await cookies()).get('flare_session')) redirect('/login');
  const { section, id } = await params;
  return <Dashboard section={section} id={id?.join('/')} />;
}
